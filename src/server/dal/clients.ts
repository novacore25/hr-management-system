import "server-only";
import { db } from "@/db";
import { and, eq, desc, ilike, or, sql } from "drizzle-orm";
import {
  clients,
  clientContacts,
  clientContracts,
  companyLetters,
  letterTypes,
  type Client,
  type ClientContact,
  type ClientContract,
} from "@/db/schema";
import { writeLog } from "./absensi";
import { createCompanyLetter, nextRunningNumber, romanizeMonth, companyCode } from "./letters";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ClientWithDetails = Client & {
  contacts: ClientContact[];
  contractsCount: number;
  latestContract?: {
    id: string;
    contractNumber: string;
    signDate: string;
    totalAmount: string;
    createdAt: string;
  } | null;
};

export type UpsertClientInput = {
  id?: string;
  name: string;
  brandName?: string | null;
  entityType?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
  notes?: string | null;
  // Contact snapshot / penandatangan yang aktif dipakai
  contact?: {
    id?: string;
    signeeName: string;
    signeePosition: string;
    signeeBasis?: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    isPrimary?: boolean;
  };
};

export type SaveContractInput = {
  clientId?: string;
  contractType?: string;
  clientData: {
    name: string;
    brandName?: string | null;
    entityType?: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    signeeName: string;
    signeePosition: string;
    signeeBasis?: string;
  };
  contractNumber: string;
  company: string; // TNT, HYPE, GOAT, NOVA
  signDate: string; // YYYY-MM-DD
  startDate?: string | null;
  endDate?: string | null;
  contractValue: number;
  taxType: string;
  taxAmount: number;
  totalAmount: number;
  programName?: string;
  platform?: string;
  creators?: Array<{ name: string; sessions: number }> | null;
  totalSessions?: number;
  sessionDuration?: number;
  bankDetails?: {
    bank: string;
    accountName: string;
    accountNumber: string;
    kcp?: string;
  } | null;
  signeeName: string;
  signeePosition: string;
  clientAddress?: string | null;
  tntSigneeName?: string;
  tntSigneePosition?: string;
  courtJurisdiction?: string;
  documentPayload: Record<string, unknown>;
  status?: string;
  notes?: string | null;
  registerLetterNumber?: boolean; // Apakah dicatat ke company_letters
};

// ═══════════════════════════════════════════════════════════════
// CLIENT QUERIES & AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════

/**
 * Cari klien berdasarkan nama PT atau nama brand.
 * Mengembalikan profil master, seluruh riwayat kontak PIC, dan info kontrak terakhir.
 */
export async function searchClients(query?: string): Promise<ClientWithDetails[]> {
  const conds = [];
  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    conds.push(or(ilike(clients.name, q), ilike(clients.brandName, q)));
  }

  const clientRows = await db
    .select()
    .from(clients)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(clients.updatedAt))
    .limit(30);

  if (!clientRows.length) return [];

  const clientIds = clientRows.map((c) => c.id);

  // Ambil kontak untuk seluruh klien terpilih
  const contactRows = await db
    .select()
    .from(clientContacts)
    .where(sql`${clientContacts.clientId} IN ${clientIds}`)
    .orderBy(desc(clientContacts.isPrimary), desc(clientContacts.updatedAt));

  // Ambil kontrak terakhir untuk masing-masing klien
  const contractRows = await db
    .select({
      id: clientContracts.id,
      clientId: clientContracts.clientId,
      contractNumber: clientContracts.contractNumber,
      signDate: clientContracts.signDate,
      totalAmount: clientContracts.totalAmount,
      createdAt: clientContracts.createdAt,
    })
    .from(clientContracts)
    .where(sql`${clientContracts.clientId} IN ${clientIds}`)
    .orderBy(desc(clientContracts.createdAt));

  return clientRows.map((c) => {
    const myContacts = contactRows.filter((ct) => ct.clientId === c.id);
    const myContracts = contractRows.filter((ct) => ct.clientId === c.id);
    const latest = myContracts[0] ?? null;

    return {
      ...c,
      contacts: myContacts,
      contractsCount: myContracts.length,
      latestContract: latest
        ? {
            id: latest.id,
            contractNumber: latest.contractNumber,
            signDate: String(latest.signDate),
            totalAmount: String(latest.totalAmount),
            createdAt: latest.createdAt.toISOString(),
          }
        : null,
    };
  });
}

/**
 * Detail lengkap 1 klien beserta riwayat seluruh kontak dan arsip kontraknya.
 */
export async function getClientById(id: string): Promise<ClientWithDetails | null> {
  const [c] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!c) return null;

  const contacts = await db
    .select()
    .from(clientContacts)
    .where(eq(clientContacts.clientId, id))
    .orderBy(desc(clientContacts.isPrimary), desc(clientContacts.updatedAt));

  const contractRows = await db
    .select({
      id: clientContracts.id,
      clientId: clientContracts.clientId,
      contractNumber: clientContracts.contractNumber,
      signDate: clientContracts.signDate,
      totalAmount: clientContracts.totalAmount,
      createdAt: clientContracts.createdAt,
    })
    .from(clientContracts)
    .where(eq(clientContracts.clientId, id))
    .orderBy(desc(clientContracts.createdAt));

  const latest = contractRows[0] ?? null;

  return {
    ...c,
    contacts,
    contractsCount: contractRows.length,
    latestContract: latest
      ? {
          id: latest.id,
          contractNumber: latest.contractNumber,
          signDate: String(latest.signDate),
          totalAmount: String(latest.totalAmount),
          createdAt: latest.createdAt.toISOString(),
        }
      : null,
  };
}

// ═══════════════════════════════════════════════════════════════
// UPSERT CLIENT & CONTACTS (AUTO WRITE-BACK)
// ═══════════════════════════════════════════════════════════════

/**
 * Simpan atau perbarui master data klien dan kontak penandatangan.
 * Idempoten: jika klien sudah ada, update kolom yang berubah.
 */
export async function upsertClient(
  input: UpsertClientInput,
  actorId?: string,
): Promise<{ client: Client; contact?: ClientContact }> {
  const now = new Date();
  let clientRow: Client | undefined;

  if (input.id) {
    const [existing] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, input.id))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(clients)
        .set({
          name: input.name.trim(),
          brandName: input.brandName?.trim() || null,
          entityType: input.entityType?.trim() || "PT",
          address: input.address?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          bankName: input.bankName?.trim() || null,
          bankAccountNo: input.bankAccountNo?.trim() || null,
          bankAccountName: input.bankAccountName?.trim() || null,
          notes: input.notes?.trim() || null,
          updatedAt: now,
        })
        .where(eq(clients.id, input.id))
        .returning();
      clientRow = updated;
    }
  }

  // Jika tidak ada ID atau ID tidak ditemukan, cari berdasarkan Nama Legal Klien
  if (!clientRow) {
    const [foundByName] = await db
      .select()
      .from(clients)
      .where(ilike(clients.name, input.name.trim()))
      .limit(1);

    if (foundByName) {
      const [updated] = await db
        .update(clients)
        .set({
          brandName: input.brandName?.trim() || foundByName.brandName,
          entityType: input.entityType?.trim() || foundByName.entityType,
          address: input.address?.trim() || foundByName.address,
          phone: input.phone?.trim() || foundByName.phone,
          email: input.email?.trim() || foundByName.email,
          bankName: input.bankName?.trim() || foundByName.bankName,
          bankAccountNo: input.bankAccountNo?.trim() || foundByName.bankAccountNo,
          bankAccountName: input.bankAccountName?.trim() || foundByName.bankAccountName,
          updatedAt: now,
        })
        .where(eq(clients.id, foundByName.id))
        .returning();
      clientRow = updated;
    } else {
      // Buat baru
      const [inserted] = await db
        .insert(clients)
        .values({
          name: input.name.trim(),
          brandName: input.brandName?.trim() || null,
          entityType: input.entityType?.trim() || "PT",
          address: input.address?.trim() || null,
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          bankName: input.bankName?.trim() || null,
          bankAccountNo: input.bankAccountNo?.trim() || null,
          bankAccountName: input.bankAccountName?.trim() || null,
          notes: input.notes?.trim() || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      clientRow = inserted;
    }
  }

  // Tangani simpan kontak PIC jika disertakan
  let contactRow: ClientContact | undefined;
  if (input.contact && input.contact.signeeName?.trim()) {
    const contactData = input.contact;
    const signeeName = contactData.signeeName.trim();

    // Cari apakah kontak dengan nama yang sama sudah ada untuk klien ini
    const [existingContact] = await db
      .select()
      .from(clientContacts)
      .where(
        and(
          eq(clientContacts.clientId, clientRow.id),
          ilike(clientContacts.signeeName, signeeName),
        ),
      )
      .limit(1);

    if (existingContact) {
      const [updCt] = await db
        .update(clientContacts)
        .set({
          signeePosition: contactData.signeePosition.trim() || existingContact.signeePosition,
          signeeBasis: contactData.signeeBasis?.trim() || existingContact.signeeBasis,
          address: contactData.address?.trim() || existingContact.address,
          phone: contactData.phone?.trim() || existingContact.phone,
          email: contactData.email?.trim() || existingContact.email,
          isPrimary: contactData.isPrimary ?? existingContact.isPrimary,
          updatedAt: now,
        })
        .where(eq(clientContacts.id, existingContact.id))
        .returning();
      contactRow = updCt;
    } else {
      const [insCt] = await db
        .insert(clientContacts)
        .values({
          clientId: clientRow.id,
          signeeName,
          signeePosition: contactData.signeePosition.trim(),
          signeeBasis: contactData.signeeBasis?.trim() || "Direksi",
          address: contactData.address?.trim() || null,
          phone: contactData.phone?.trim() || null,
          email: contactData.email?.trim() || null,
          isPrimary: contactData.isPrimary ?? false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      contactRow = insCt;
    }
  }

  if (actorId) {
    await writeLog({
      actorId,
      action: "upsert_client",
      targetUserId: actorId,
      details: `Klien: ${clientRow.name} (${clientRow.brandName ?? "-"})`,
    });
  }

  return { client: clientRow, contact: contactRow };
}

// ═══════════════════════════════════════════════════════════════
// SAVE CLIENT CONTRACT (ARSIP PERMANEN PKS MCN)
// ═══════════════════════════════════════════════════════════════

/**
 * Simpan arsip dokumen PKS Klien MCN secara permanen.
 * 1. Upsert master data klien & kontak penandatangan.
 * 2. Catat nomor surat ke company_letters jika diminta.
 * 3. Simpan snapshot utuh (documentPayload) ke client_contracts.
 */
export async function saveClientContract(
  input: SaveContractInput,
  actorId?: string,
): Promise<{ contract: ClientContract; client: Client }> {
  const now = new Date();

  // 1. Pastikan master klien dan penandatangan tersimpan
  const { client, contact } = await upsertClient({
    id: input.clientId,
    name: input.clientData.name,
    brandName: input.clientData.brandName,
    entityType: input.clientData.entityType,
    address: input.clientData.address,
    phone: input.clientData.phone,
    email: input.clientData.email,
    contact: {
      signeeName: input.clientData.signeeName,
      signeePosition: input.clientData.signeePosition,
      signeeBasis: input.clientData.signeeBasis,
      address: input.clientData.address,
    },
  });

  // 2. Hubungkan nomor surat resmi ke company_letters jika diminta
  let letterId: string | null = null;
  const contractType = input.contractType || "PKS_KLIEN_MCN";
  const letterCode = contractType === "PKS_KLIEN_TNT" ? "PKS-TNT" : "PKS-MCN";

  if (input.registerLetterNumber) {
    try {
      const [typeRow] = await db
        .select()
        .from(letterTypes)
        .where(eq(letterTypes.code, letterCode))
        .limit(1);

      if (typeRow) {
        const signDateObj = new Date(input.signDate);
        const year = signDateObj.getFullYear() || now.getFullYear();
        const monthNum = (signDateObj.getMonth() || now.getMonth()) + 1;
        const monthRoman = romanizeMonth(monthNum);

        // Cari apakah nomor surat ini sudah tercatat
        const [existingLetter] = await db
          .select({ id: companyLetters.id })
          .from(companyLetters)
          .where(eq(companyLetters.fullNumber, input.contractNumber.trim()))
          .limit(1);

        if (existingLetter) {
          letterId = existingLetter.id;
        } else {
          // Buat entri baru di company_letters
          const runningNumber = await nextRunningNumber(
            input.company,
            typeRow.id,
            year,
          );

          const [newLetter] = await db
            .insert(companyLetters)
            .values({
              company: input.company,
              letterTypeId: typeRow.id,
              runningNumber,
              month: monthRoman,
              year,
              fullNumber: input.contractNumber.trim(),
              createdAt: now,
            })
            .returning();
          letterId = newLetter.id;
        }
      }
    } catch (e) {
      console.warn("Gagal meregistrasi letter_number ke company_letters:", e);
    }
  }

  // 3. Simpan record kontrak baru
  const safeContractVal = Number(input.contractValue) || 0;
  const safeTaxAmount = Number(input.taxAmount) || 0;
  const safeTotalAmount = Number(input.totalAmount) || 0;

  const [contract] = await db
    .insert(clientContracts)
    .values({
      clientId: client.id,
      letterId,
      contractType,
      contractNumber: input.contractNumber.trim(),
      company: input.company,
      signDate: input.signDate,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      contractValue: String(safeContractVal),
      taxType: input.taxType || "pph_0_5",
      taxAmount: String(safeTaxAmount),
      totalAmount: String(safeTotalAmount),
      programName: input.programName || (contractType === "PKS_KLIEN_TNT" ? "Affiliate Booster" : "Live Exclusive Creator MCN"),
      platform: input.platform || "TikTok",
      creators: input.creators as never,
      totalSessions: input.totalSessions ?? 20,
      sessionDuration: input.sessionDuration ?? 120,
      bankDetails: input.bankDetails as never,
      signeeName: input.signeeName,
      signeePosition: input.signeePosition,
      clientAddress: input.clientAddress || null,
      tntSigneeName: input.tntSigneeName || "RUBEN ARIANTO",
      tntSigneePosition: input.tntSigneePosition || "DIREKTUR UTAMA",
      courtJurisdiction: input.courtJurisdiction || "Pengadilan Negeri Tangerang",
      documentPayload: input.documentPayload as never,
      status: input.status || "active",
      notes: input.notes || null,
      createdBy: actorId || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (actorId) {
    const label = contractType === "PKS_KLIEN_TNT" ? "PKS TNT" : "PKS MCN";
    await writeLog({
      actorId,
      action: "create_client_contract",
      targetUserId: actorId,
      details: `${label}: ${contract.contractNumber} · ${client.name} (Rp ${safeTotalAmount.toLocaleString("id-ID")})`,
    });
  }

  return { contract, client };
}

/**
 * Daftar arsip kontrak PKS Klien.
 */
export async function listClientContracts(params?: {
  clientId?: string;
  company?: string;
  status?: string;
  limit?: number;
}): Promise<Array<ClientContract & { clientName: string; brandName: string | null }>> {
  const conds = [];
  if (params?.clientId) conds.push(eq(clientContracts.clientId, params.clientId));
  if (params?.company && params.company !== "ALL") conds.push(eq(clientContracts.company, params.company));
  if (params?.status && params.status !== "ALL") conds.push(eq(clientContracts.status, params.status));

  const rows = await db
    .select({
      contract: clientContracts,
      clientName: clients.name,
      brandName: clients.brandName,
    })
    .from(clientContracts)
    .innerJoin(clients, eq(clientContracts.clientId, clients.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(clientContracts.createdAt))
    .limit(params?.limit ?? 100);

  return rows.map((r) => ({
    ...r.contract,
    clientName: r.clientName,
    brandName: r.brandName,
  }));
}

/**
 * Ambil 1 arsip kontrak berdasarkan ID dengan payload snapshot utuhnya.
 */
export async function getClientContractById(id: string) {
  const [row] = await db
    .select({
      contract: clientContracts,
      clientName: clients.name,
      brandName: clients.brandName,
    })
    .from(clientContracts)
    .innerJoin(clients, eq(clientContracts.clientId, clients.id))
    .where(eq(clientContracts.id, id))
    .limit(1);

  if (!row) return null;

  return {
    ...row.contract,
    clientName: row.clientName,
    brandName: row.brandName,
  };
}

/**
 * Perbarui data arsip kontrak PKS Klien yang sudah ada.
 */
export async function updateClientContract(
  id: string,
  input: SaveContractInput,
  actorId?: string,
): Promise<{ contract: ClientContract; client: Client }> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(clientContracts)
    .where(eq(clientContracts.id, id))
    .limit(1);

  if (!existing) {
    throw new Error("Kontrak tidak ditemukan.");
  }

  // 1. Update profil klien & penandatangan
  const { client } = await upsertClient({
    id: input.clientId || existing.clientId,
    name: input.clientData.name,
    brandName: input.clientData.brandName,
    entityType: input.clientData.entityType,
    address: input.clientData.address,
    phone: input.clientData.phone,
    email: input.clientData.email,
    contact: {
      signeeName: input.clientData.signeeName,
      signeePosition: input.clientData.signeePosition,
      signeeBasis: input.clientData.signeeBasis,
      address: input.clientData.address,
    },
  });

  const safeContractVal = Number(input.contractValue) || 0;
  const safeTaxAmount = Number(input.taxAmount) || 0;
  const safeTotalAmount = Number(input.totalAmount) || 0;

  // 2. Update record kontrak
  const [updatedContract] = await db
    .update(clientContracts)
    .set({
      contractType: input.contractType || existing.contractType,
      contractNumber: input.contractNumber.trim(),
      company: input.company,
      signDate: input.signDate,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      contractValue: String(safeContractVal),
      taxType: input.taxType || "pph_0_5",
      taxAmount: String(safeTaxAmount),
      totalAmount: String(safeTotalAmount),
      programName: input.programName || existing.programName,
      platform: input.platform || existing.platform,
      creators: input.creators as never,
      totalSessions: input.totalSessions ?? existing.totalSessions,
      sessionDuration: input.sessionDuration ?? existing.sessionDuration,
      bankDetails: input.bankDetails as never,
      signeeName: input.signeeName,
      signeePosition: input.signeePosition,
      clientAddress: input.clientAddress || null,
      tntSigneeName: input.tntSigneeName || existing.tntSigneeName,
      tntSigneePosition: input.tntSigneePosition || existing.tntSigneePosition,
      courtJurisdiction: input.courtJurisdiction || existing.courtJurisdiction,
      documentPayload: input.documentPayload as never,
      status: input.status || existing.status,
      notes: input.notes || null,
      updatedAt: now,
    })
    .where(eq(clientContracts.id, id))
    .returning();

  if (actorId) {
    await writeLog({
      actorId,
      action: "update_client_contract",
      targetUserId: actorId,
      details: `Kontrak diperbarui: ${updatedContract.contractNumber} · ${client.name}`,
    });
  }

  return { contract: updatedContract, client };
}

/**
 * Hapus arsip kontrak PKS Klien beserta nomor surat resminya jika ada.
 */
export async function deleteClientContract(
  id: string,
  actorId?: string,
): Promise<void> {
  const [contract] = await db
    .select()
    .from(clientContracts)
    .where(eq(clientContracts.id, id))
    .limit(1);

  if (!contract) return;

  if (contract.letterId) {
    await db.delete(companyLetters).where(eq(companyLetters.id, contract.letterId));
  } else if (contract.contractNumber) {
    await db
      .delete(companyLetters)
      .where(eq(companyLetters.fullNumber, contract.contractNumber));
  }

  await db.delete(clientContracts).where(eq(clientContracts.id, id));

  if (actorId) {
    await writeLog({
      actorId,
      action: "delete_client_contract",
      targetUserId: actorId,
      details: `Kontrak PKS dihapus: ${contract.contractNumber}`,
    });
  }
}

/**
 * Hapus master klien. Seluruh kontak dan kontrak akan ikut terhapus secara cascade.
 */
export async function deleteClient(
  id: string,
  actorId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) return { ok: false, error: "Klien tidak ditemukan." };

  await db.delete(clients).where(eq(clients.id, id));

  if (actorId) {
    await writeLog({
      actorId,
      action: "delete_client",
      targetUserId: actorId,
      details: `Klien dihapus: ${client.name}`,
    });
  }

  return { ok: true };
}

/**
 * Hapus salah satu kontak PIC klien.
 */
export async function deleteClientContact(
  id: string,
  actorId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const [ct] = await db
    .select()
    .from(clientContacts)
    .where(eq(clientContacts.id, id))
    .limit(1);

  if (!ct) return { ok: false, error: "Kontak PIC tidak ditemukan." };

  await db.delete(clientContacts).where(eq(clientContacts.id, id));

  if (actorId) {
    await writeLog({
      actorId,
      action: "delete_client_contact",
      targetUserId: actorId,
      details: `Kontak PIC dihapus: ${ct.signeeName}`,
    });
  }

  return { ok: true };
}

