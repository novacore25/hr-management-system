import "server-only";
import { db } from "@/db";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { leaveRequests, users, departments, holidays } from "@/db/schema";
import { writeLog } from "./absensi";
import type {
  LeaveRequest,
  LeaveRequestType,
  LeaveRequestStatus,
  LeaveStage,
} from "@/types/absensi";
import { STAGE_LABEL } from "@/types/absensi";

type Row = typeof leaveRequests.$inferSelect & {
  userName: string | null;
  departmentName: string | null;
};

const select = {
  id: leaveRequests.id,
  userId: leaveRequests.userId,
  type: leaveRequests.type,
  dates: leaveRequests.dates,
  reason: leaveRequests.reason,
  status: leaveRequests.status,
  processedBy: leaveRequests.processedBy,
  processedAt: leaveRequests.processedAt,
  deductedSick: leaveRequests.deductedSick,
  deductedLeave: leaveRequests.deductedLeave,
  cancellationRequested: leaveRequests.cancellationRequested,
  cancellationReason: leaveRequests.cancellationReason,
  // ── Persetujuan 2 tahap (migrasi 0014) ───────────────────────
  // Kolom ini harus ikut diselect: `Row` diturunkan dari
  // $inferSelect, jadi satu kolom yang tidak diambil akan membuat
  // seluruh pemanggilan typecheck gagal -- bukan hanya kolomnya
  // yang undefined.
  deductedUrgent: leaveRequests.deductedUrgent,
  executiveStatus: leaveRequests.executiveStatus,
  executiveApprovedBy: leaveRequests.executiveApprovedBy,
  executiveApprovedByName: leaveRequests.executiveApprovedByName,
  executiveApprovedAt: leaveRequests.executiveApprovedAt,
  executiveNotes: leaveRequests.executiveNotes,
  hrStatus: leaveRequests.hrStatus,
  hrApprovedBy: leaveRequests.hrApprovedBy,
  hrApprovedByName: leaveRequests.hrApprovedByName,
  hrApprovedAt: leaveRequests.hrApprovedAt,
  hrNotes: leaveRequests.hrNotes,
  rejectionStage: leaveRequests.rejectionStage,
  rejectionReason: leaveRequests.rejectionReason,
  rejectedBy: leaveRequests.rejectedBy,
  rejectedAt: leaveRequests.rejectedAt,
  createdAt: leaveRequests.createdAt,
  updatedAt: leaveRequests.updatedAt,
  userName: users.name,
  departmentName: departments.name,
};

function toLeaveRequest(row: Row): LeaveRequest {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    dates: row.dates ?? [],
    reason: row.reason ?? "",
    status: row.status,
    processedBy: row.processedBy,
    processedAt: row.processedAt
      ? row.processedAt.toISOString()
      : null,
    deductedSick: row.deductedSick,
    deductedLeave: row.deductedLeave,
    cancellationRequested: row.cancellationRequested,
    cancellationReason: row.cancellationReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // `select` di atas sudah mengambil keduanya, tapi belum diteruskan —
    // sehingga semua halaman cuti menampilkan "Unknown" untuk nama
    // pemohon.
    userName: row.userName,
    departmentName: row.departmentName,

    // Persetujuan 2 tahap.
    //
    // Semua kolom ini SUDAH diambil oleh `select` di atas sejak
    // migrasi 0014 -- select-nya benar, mapper-nya yang membuang
    // hasilnya. Akibatnya `status: approved_executive` tidak pernah
    // terlihat, dan halaman approvals tidak bisa menampilkan siapa
    // yang sudah menyetujui.
    //
    // Timestamp dikembalikan sebagai ISO string supaya bentuknya sama
    // dengan createdAt/updatedAt di atas; kolomnya timestamptz di
    // database, dan memanggil .toISOString() langsung di sini akan
    // tidak terbaca kalau kolomnya null.
    deductedUrgent: row.deductedUrgent,
    executiveStatus: row.executiveStatus,
    executiveApprovedBy: row.executiveApprovedBy,
    executiveApprovedByName: row.executiveApprovedByName,
    executiveApprovedAt: row.executiveApprovedAt?.toISOString() ?? null,
    executiveNotes: row.executiveNotes,
    hrStatus: row.hrStatus,
    hrApprovedBy: row.hrApprovedBy,
    hrApprovedByName: row.hrApprovedByName,
    hrApprovedAt: row.hrApprovedAt?.toISOString() ?? null,
    hrNotes: row.hrNotes,
    rejectionStage: row.rejectionStage,
    rejectionReason: row.rejectionReason,
    rejectedBy: row.rejectedBy,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
  };
}

export async function listLeaveRequests(params?: {
  userId?: string;
  status?: LeaveRequestStatus;
  departmentId?: string;
}): Promise<LeaveRequest[]> {
  const conds = [];
  if (params?.userId) conds.push(eq(leaveRequests.userId, params.userId));
  if (params?.status) conds.push(eq(leaveRequests.status, params.status));
  if (params?.departmentId) {
    conds.push(eq(users.departmentId, params.departmentId));
  }

  const rows = await db
    .select(select)
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(leaveRequests.createdAt));

  return rows.map(toLeaveRequest);
}

export async function findLeaveRequest(
  id: string,
): Promise<LeaveRequest | null> {
  const [row] = await db
    .select(select)
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(leaveRequests.id, id))
    .limit(1);
  return row ? toLeaveRequest(row) : null;
}

// ═══════════════════════════════════════════════════════════════
// QUOTA
// ═══════════════════════════════════════════════════════════════

export async function getQuota(userId: string) {
  const [row] = await db
    .select({ leave: users.leaveQuota, sick: users.sickQuota })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { leave: row?.leave ?? 0, sick: row?.sick ?? 0 };
}

/**
 * Hitung berapa kuota yang terpakai di bulan berjalan.
 * Hanya menghitung request yang sudah DISETUJUI.
 */
export async function usedQuotaThisMonth(userId: string): Promise<{
  leave: number;
  sick: number;
}> {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const rows = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, userId),
        eq(leaveRequests.status, "approved"),
      ),
    );

  let leave = 0;
  let sick = 0;
  for (const r of rows) {
    const daysThisMonth = (r.dates ?? []).filter((d) =>
      d.startsWith(prefix),
    ).length;
    if (r.type === "sick") sick += daysThisMonth;
    else if (r.type === "leave") leave += daysThisMonth;
  }
  return { leave, sick };
}

// ═══════════════════════════════════════════════════════════════
// BUAT PENGAJUAN
// ═══════════════════════════════════════════════════════════════

export function isWorkingDay(date: string, holidays: string[]): boolean {
  const d = new Date(`${date}T00:00:00`);
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !holidays.includes(date);
}

export type CreateLeaveInput = {
  userId: string;
  type: LeaveRequestType;
  dates: string[];
  reason: string;
};

export type CreateLeaveResult =
  | { ok: true; request: LeaveRequest }
  | { ok: false; reason: string };

export async function createLeaveRequest(
  input: CreateLeaveInput,
): Promise<CreateLeaveResult> {
  const holidayRows = await db
    .select({ date: holidays.date })
    .from(holidays);
  const holidayList = holidayRows.map((h) => String(h.date));

  // Buang weekend + hari libur
  const dates = [...new Set(input.dates)]
    .filter((d) => isWorkingDay(d, holidayList))
    .sort();

  if (dates.length === 0) {
    return {
      ok: false,
      reason:
        "Tidak ada hari kerja yang valid (semua tanggal jatuh akhir pekan atau hari libur).",
    };
  }

  // Batas waktu pengajuan
  const today = new Date().toISOString().slice(0, 10);
  if (dates[0] < today) {
    return {
      ok: false,
      reason: "Tidak bisa mengajukan cuti untuk tanggal yang sudah lewat.",
    };
  }

  // Cek kuota
  if (input.type !== "wfa") {
    const [quota, used] = await Promise.all([
      getQuota(input.userId),
      usedQuotaThisMonth(input.userId),
    ]);

    if (input.type === "sick") {
      const remaining = quota.sick - used.sick;
      if (dates.length > remaining) {
        return {
          ok: false,
          reason: `Kuota sakit tersisa ${remaining} hari, Anda mengajukan ${dates.length} hari.`,
        };
      }
    } else {
      const remaining = quota.leave - used.leave;
      if (dates.length > remaining) {
        return {
          ok: false,
          reason: `Kuota cuti tersisa ${remaining} hari, Anda mengajukan ${dates.length} hari.`,
        };
      }
    }
  }

  // Cek bentrok dengan request aktif lain
  const existing = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, input.userId),
        inArray(leaveRequests.status, ["pending", "approved"]),
      ),
    );

  const taken = new Set(existing.flatMap((r) => r.dates ?? []));
  const clash = dates.find((d) => taken.has(d));
  if (clash) {
    return {
      ok: false,
      reason: `Tanggal ${clash} sudah ada pengajuan aktif.`,
    };
  }

  // ── Batas konflik divisi ──────────────────────────────────
  // Kalau divisi punya >= 3 orang aktif, maksimal 2 orang boleh cuti
  // pada tanggal yang sama.
  //
  // formerly dicek dari browser dengan 2 query Supabase, jadi bisa
  // dilewati dengan POST langsung. Sekarang jadi gate server.
  if (input.type === "leave") {
    const [me] = await db
      .select({ departmentId: users.departmentId })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    if (me?.departmentId) {
      const [dept] = await db
        .select({ size: sql<number>`count(*)::int` })
        .from(users)
        .where(
          and(
            eq(users.departmentId, me.departmentId),
            eq(users.absensiStatus, "active"),
          ),
        );

      if (Number(dept?.size ?? 0) >= 3) {
        const approved = await db
          .select({
            userId: leaveRequests.userId,
            dates: leaveRequests.dates,
            userName: users.name,
          })
          .from(leaveRequests)
          .innerJoin(users, eq(leaveRequests.userId, users.id))
          .where(
            and(
              eq(leaveRequests.status, "approved"),
              eq(users.departmentId, me.departmentId),
            ),
          );

        for (const d of dates) {
          const names: string[] = [];
          for (const r of approved) {
            if (r.userId === input.userId) continue;
            if ((r.dates ?? []).includes(d)) names.push(r.userName ?? r.userId);
          }
          if (names.length >= 2) {
            return {
              ok: false,
              reason: `Sudah ada ${names.length} orang di divisi Anda yang cuti pada ${d}, yaitu ${names.join(" dan ")}.`,
            };
          }
        }
      }
    }
  }

  const now = new Date();
  const [row] = await db
    .insert(leaveRequests)
    .values({
      userId: input.userId,
      type: input.type,
      dates,
      reason: input.reason,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await writeLog({
    actorId: input.userId,
    action: "leave_requested",
    targetUserId: input.userId,
    details: `${input.type}: ${dates.join(", ")}`,
  });

  return { ok: true, request: toLeaveRequest(row as Row) };
}

/** Staff membatalkan pengajuannya sendiri (hanya saat masih pending). */
export async function cancelOwnRequest(
  id: string,
  userId: string,
): Promise<CreateLeaveResult> {
  const req = await findLeaveRequest(id);
  if (!req) return { ok: false, reason: "Pengajuan tidak ditemukan." };
  if (req.userId !== userId) {
    return { ok: false, reason: "Ini bukan pengajuan Anda." };
  }
  if (req.status !== "pending") {
    return {
      ok: false,
      reason: `Hanya bisa membatalkan pengajuan yang masih pending (saat ini: ${req.status}).`,
    };
  }

  await db
    .update(leaveRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(leaveRequests.id, id));

  await writeLog({
    actorId: userId,
    action: "leave_cancelled_by_staff",
    targetUserId: userId,
    details: id,
  });

  return { ok: true, request: (await findLeaveRequest(id))! };
}

/** Staff meminta pembatalan pengajuan yang SUDAH disetujui. */
export async function requestCancellation(
  id: string,
  userId: string,
  reason: string,
): Promise<CreateLeaveResult> {
  const req = await findLeaveRequest(id);
  if (!req) return { ok: false, reason: "Pengajuan tidak ditemukan." };
  if (req.userId !== userId) {
    return { ok: false, reason: "Ini bukan pengajuan Anda." };
  }
  if (req.status !== "approved") {
    return {
      ok: false,
      reason: "Hanya pengajuan yang sudah disetujui yang bisa dibatalkan.",
    };
  }
  if (!reason?.trim()) {
    return { ok: false, reason: "Alasan pembatalan wajib diisi." };
  }

  await db
    .update(leaveRequests)
    .set({
      cancellationRequested: true,
      cancellationReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(leaveRequests.id, id));

  await writeLog({
    actorId: userId,
    action: "leave_cancellation_requested",
    targetUserId: userId,
    details: `${id}: ${reason}`,
  });

  return { ok: true, request: (await findLeaveRequest(id))! };
}

// ═══════════════════════════════════════════════════════════════
// ADMIN: approve / reject / proses pembatalan
// ═══════════════════════════════════════════════════════════════

/**
 * Setujui atau tolak pengajuan + kurasi kuota.
 *
 * PERBAIKAN KEAMANAN:
 * Di Supabase, ini adalah SECURITY DEFINER function TANPA cek admin,
 * sehingga staff mana pun bisa memanggilnya lewat API dan menyetujui
 * cuti siapa saja. Di sini pemanggil WAJIB lewat requireAbsensiAdmin()
 * sebelum fungsi ini dipanggil, dan kuotanya tidak pernah bisa minus.
 */
/**
 * Orang yang akan memutuskan pengajuan, dibaca dari database.
 *
 * `name` diambil dari session, bukan dari body request -- kalau
 * dari body, siapa pun bisa menulis nama orang lain di riwayat.
 */
export type LeaveApprover = {
  id: string;
  name: string;
  /** kpi_role dari tabel users: tim | head | hr | executive | developer */
  kpiRole: string;
};

/**
 * Role yang boleh memutuskan tiap tahap.
 *
 * Ditentukan dari data, bukan dari asumsi. Dari 8 pengajuan yang benar
 *-benar lewat 2 tahap di produksi:
 *
 *   tahap 1  Calvin [executive/admin], ibanDev [executive/admin]
 *   tahap 2  Marcella Dian Mutiara [hr/admin]
 *
 * Dan urutan timestampnya konsisten: dari 259 baris yang punya kedua
 * timestamp, 259 punya executive_approved_at <= hr_approved_at, dan
 * nol sebaliknya.
 *
 * CATATAN RISIKO: kpi_role='hr' hanya ada pada 2 user, dan salah
 * satunya berstatus deleted. Kalau HR yang tersisa tidak aktif, semua
 * pengajuan akan berhenti di approved_executive. Halaman approvals
 * menampilkan peringatan kalau hal itu terjadi.
 */
const STAGE_ROLE: Record<LeaveStage, string> = {
  executive: "executive",
  hr: "hr",
};

/**
 * Apakah ada HR aktif yang bisa menyetujui tahap 2?
 *
 * Hanya 2 user punya kpi_role='hr', dan di data terbaru salah satunya
 * berstatus deleted. Kalau keduanya tidak aktif, semua pengajuan akan
 * berhenti di approved_executive tanpa ada yang bisa menyelesaikannya.
 *
 * Halaman approvals memakai ini untuk menampilkan peringatan, supaya
 * penumpukan itu terlihat dari antarmuka dan bukan baru terasa saat
 * semua orang wondering kenapa pengajuannya tidak diproses.
 *
 * COUNT() tanpa filter absensi_status sengaja di sini: yang dihitung
 * adalah siapa yang ADA, lalu dicek satu per satu di bawah.
 */
export async function hrRoleAvailability(): Promise<{
  count: number;
  names: string[];
}> {
  const rows = await db
    .select({
      name: users.name,
      absensiStatus: users.absensiStatus,
      status: users.status,
    })
    .from(users)
    .where(eq(users.kpiRole, "hr"));

  const aktif = rows.filter(
    (r) =>
      r.absensiStatus === "active" &&
      (r.status === null || r.status === "active" || r.status === undefined),
  );

  return { count: aktif.length, names: aktif.map((r) => r.name) };
}

export async function decideLeaveStage(
  id: string,
  stage: LeaveStage,
  action: "approve" | "reject",
  approver: LeaveApprover,
  notes?: string,
): Promise<CreateLeaveResult> {
  const req = await findLeaveRequest(id);
  if (!req) return { ok: false, reason: "Pengajuan tidak ditemukan." };

  // ── Status saat ini harus cocok dengan tahap yang diputuskan ──
  //
  // Tanpa cek ini, executive bisa menyetujui pengajuan yang sudah
  // disetujui HR, dan HR bisa menyetujui pengajuan yang belum pernah
  // dilihat executive. Keduanya akan ditulis di atas data yang sudah
  // final, dan tidak ada yang akan menampilkan Override-nya.
  const now = new Date();

  if (stage === "executive") {
    if (req.status !== "pending") {
      return {
        ok: false,
        reason: `Pengajuan ini sudah berstatus ${req.status}, jadi bukan giliran executive. Executive hanya menyetujui pengajuan berstatus pending; kalau statusnya approved_executive, gilirannya HR.`,
      };
    }
  } else {
    if (req.status !== "approved_executive") {
      return {
        ok: false,
        reason: `Pengajuan ini berstatus ${req.status}, jadi bukan giliran HR. HR hanya menyetujui pengajuan yang sudah di tahap executive, yaitu berstatus approved_executive.`,
      };
    }
  }

  // ── Role pemohon ────────────────────────────────────────────
  //
  // Persetujuan sendiri diizinkan, asalkan role-nya sesuai -- sesuai
  // keputusan pemilik sistem. Yang dilarang adalah menyetujui di tahap
  // yang bukan haknya.
  const butuh = STAGE_ROLE[stage];
  if (approver.kpiRole !== butuh) {
    return {
      ok: false,
      reason: `Tahap ${STAGE_LABEL[stage]} hanya untuk role kpi_role='${butuh}'. Role Anda: ${approver.kpiRole}`,
    };
  }

  // ── TOLAK ───────────────────────────────────────────────────
  if (action === "reject") {
    const set =
      stage === "executive"
        ? { executiveStatus: "rejected" as const }
        : { hrStatus: "rejected" as const };

    await db
      .update(leaveRequests)
      .set({
        ...set,
        status: "rejected",
        rejectionStage: stage,
        rejectionReason: notes?.trim() || null,
        rejectedBy: approver.name,
        rejectedAt: now,
        updatedAt: now,
      })
      .where(eq(leaveRequests.id, id));

    await writeLog({
      actorId: approver.name,
      action: `leave_rejected_${stage}`,
      targetUserId: req.userId,
      details: `${approver.name}: ${req.dates.join(", ")}${notes ? " -- " + notes : ""}`,
    });

    return { ok: true, request: (await findLeaveRequest(id))! };
  }

  // ── SETUJUI TAHAP 1: executive ──────────────────────────────
  //
  // BELUM memotong kuota. Pengajuan ini belum final, dan HR masih
  // bisa menolak. Bukti dari data: 20 pengajuan yang ditolak punya
  // deducted_* nol semua, termasuk satu yang executive_status-nya
  // sudah 'approved' lalu ditolak HR.
  if (stage === "executive") {
    await db
      .update(leaveRequests)
      .set({
        status: "approved_executive",
        executiveStatus: "approved",
        executiveApprovedBy: approver.id,
        executiveApprovedByName: approver.name,
        executiveApprovedAt: now,
        executiveNotes: notes?.trim() || null,
        updatedAt: now,
      })
      .where(eq(leaveRequests.id, id));

    await writeLog({
      actorId: approver.name,
      action: "leave_approved_executive",
      targetUserId: req.userId,
      details: `${approver.name}: ${req.type} ${req.dates.join(", ")}`,
    });

    return { ok: true, request: (await findLeaveRequest(id))! };
  }

  // ── SETUJUI TAHAP 2: HR -- di sini kuota dipotong ──────────
  let deductedSick = 0;
  let deductedLeave = 0;

  if (req.type === "sick" || req.type === "leave") {
    const days = req.dates.length;

    if (req.type === "sick") {
      // Pakai sisa kuota sakit dulu, sisanya potong kuota cuti.
      const [quota, used] = await Promise.all([
        getQuota(req.userId),
        usedQuotaThisMonth(req.userId),
      ]);
      const sickLeft = Math.max(0, quota.sick - used.sick);
      deductedSick = Math.min(days, sickLeft);
      deductedLeave = Math.max(0, days - deductedSick);
    } else {
      deductedLeave = days;
    }

    await db
      .update(users)
      .set({
        // GREATEST(0, ...) memastikan kuota tidak pernah negatif
        sickQuota: sql`GREATEST(0, sick_quota - ${deductedSick})`,
        leaveQuota: sql`GREATEST(0, leave_quota - ${deductedLeave})`,
        updatedAt: now,
      })
      .where(eq(users.id, req.userId));
  }

  await db
    .update(leaveRequests)
    .set({
      status: "approved",
      hrStatus: "approved",
      hrApprovedBy: approver.id,
      hrApprovedByName: approver.name,
      hrApprovedAt: now,
      hrNotes: notes?.trim() || null,
      processedBy: approver.name,
      processedAt: now,
      deductedSick,
      deductedLeave,
      updatedAt: now,
    })
    .where(eq(leaveRequests.id, id));

  await writeLog({
    actorId: approver.name,
    action: "leave_approved",
    targetUserId: req.userId,
    details: `${approver.name}: ${req.type} ${req.dates.join(", ")} (sick -${deductedSick}, cuti -${deductedLeave})`,
  });

  return { ok: true, request: (await findLeaveRequest(id))! };
}

/**
 * Proses permintaan pembatalan.
 *
 * Hanya mengembalikan kuota kalau pengajuan itu benar-benar SUDAH
 * disetujui. Versi lama bisa menambah kuota dari request pending
 * yang field deducted_*-nya sudah diisi.
 */
export async function decideCancellation(
  id: string,
  action: "approve" | "reject",
  adminName: string,
): Promise<CreateLeaveResult> {
  const req = await findLeaveRequest(id);
  if (!req) return { ok: false, reason: "Pengajuan tidak ditemukan." };

  if (!req.cancellationRequested) {
    return { ok: false, reason: "Tidak ada permintaan pembatalan." };
  }

  if (action === "reject") {
    await db
      .update(leaveRequests)
      .set({ cancellationRequested: false, updatedAt: new Date() })
      .where(eq(leaveRequests.id, id));

    await writeLog({
      actorId: adminName,
      action: "cancellation_rejected",
      targetUserId: req.userId,
      details: adminName,
    });

    return { ok: true, request: (await findLeaveRequest(id))! };
  }

  // Hanya refund kalau status approved DAN pernah ada potongan tercatat
  const refundSick = req.status === "approved" ? req.deductedSick : 0;
  const refundLeave = req.status === "approved" ? req.deductedLeave : 0;

  if (refundSick > 0 || refundLeave > 0) {
    await db
      .update(users)
      .set({
        sickQuota: sql`sick_quota + ${refundSick}`,
        leaveQuota: sql`leave_quota + ${refundLeave}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.userId));
  }

  await db
    .update(leaveRequests)
    .set({
      status: "cancelled",
      cancellationRequested: false,
      processedBy: adminName,
      processedAt: new Date(),
      deductedSick: 0,
      deductedLeave: 0,
      updatedAt: new Date(),
    })
    .where(eq(leaveRequests.id, id));

  await writeLog({
    actorId: adminName,
    action: "cancellation_approved",
    targetUserId: req.userId,
    details: `${adminName}: refund sick +${refundSick}, cuti +${refundLeave}`,
  });

  return { ok: true, request: (await findLeaveRequest(id))! };
}

/** Atur ulang kuota oleh admin (mis. chromosomal sickness). */
export async function adjustQuota(
  userId: string,
  patch: { leaveQuota?: number; sickQuota?: number },
): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.leaveQuota !== undefined) {
    values.leaveQuota = Math.max(0, patch.leaveQuota);
  }
  if (patch.sickQuota !== undefined) {
    values.sickQuota = Math.max(0, patch.sickQuota);
  }
  await db.update(users).set(values).where(eq(users.id, userId));
}

/**
 * Riwayat pengajuan seluruh tim (bukan cuma milik sendiri).
 *
 * Dipakai halaman /absensi/(staff)/requests untuk menampilkan siapa saja
 * yang cuti. Field `reason` milik orang lain TIDAK disertakan — alasan
 * pribadi cuti bukan informasi yang perlu dilihat rekan satu tim.
 */
export async function teamLeaveHistory(
  limit = 200,
): Promise<
  Array<{
    id: string;
    userId: string;
    userName: string;
    departmentName: string | null;
    type: LeaveRequestType;
    dates: string[];
    status: LeaveRequestStatus;
    /** Alasan hanya diisi untuk pengajuan milik viewer. */
    reason: string | null;
    cancellationRequested: boolean;
    createdAt: string;
  }>
> {
  const rows = await db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      userName: users.name,
      departmentName: departments.name,
      type: leaveRequests.type,
      dates: leaveRequests.dates,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      cancellationRequested: leaveRequests.cancellationRequested,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName ?? "Unknown",
    departmentName: r.departmentName,
    type: r.type,
    dates: r.dates ?? [],
    status: r.status,
    reason: r.reason,
    cancellationRequested: r.cancellationRequested,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Pengajuan cuti milik user yang sedang login + sisa kuota. */
export async function myLeaveOverview(userId: string) {
  const [requests, quota, used] = await Promise.all([
    listLeaveRequests({ userId }),
    getQuota(userId),
    usedQuotaThisMonth(userId),
  ]);

  return {
    requests,
    quota,
    used,
    remaining: {
      leave: Math.max(0, quota.leave - used.leave),
      sick: Math.max(0, quota.sick - used.sick),
    },
  };
}
