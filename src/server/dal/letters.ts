import "server-only";
import { db } from "@/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { letterTypes, companyLetters, users } from "@/db/schema";
import { writeLog } from "./absensi";

/** Kode perusahaan yang dipakai pada nomor surat resmi. */
const COMPANY_CODE: Record<string, string> = {
  TNT: "HR-TNT",
  HYPE: "HR-HMI",
  GOAT: "HR-TSM",
  NOVA: "HR-NC",
};

const ROMAN = [
  "I", "II", "III", "IV", "V", "VI",
  "VII", "VIII", "IX", "X", "XI", "XII",
];

/** Bulan (1-12) -> angka Romawi. */
export function romanizeMonth(month: number): string {
  return ROMAN[month - 1] ?? String(month);
}

export function companyCode(company: string): string {
  return COMPANY_CODE[company] ?? company;
}

export type LetterType = {
  id: string;
  name: string;
  code: string;
  templateUrl: string | null;
  createdAt: string;
};

export type CompanyLetter = {
  id: string;
  company: string;
  letterTypeId: string;
  letterTypeName: string;
  letterTypeCode: string;
  runningNumber: number;
  month: string;
  year: number;
  fullNumber: string;
  issuedTo: string | null;
  issuedToName: string | null;
  fileUrl: string | null;
  createdAt: string;
};

export async function listLetterTypes(): Promise<LetterType[]> {
  const rows = await db.select().from(letterTypes).orderBy(letterTypes.name);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    templateUrl: r.templateUrl,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createLetterType(
  name: string,
  code: string,
): Promise<LetterType> {
  const [row] = await db
    .insert(letterTypes)
    .values({ name: name.trim(), code: code.trim().toUpperCase() })
    .returning();

  return {
    id: row.id,
    name: row.name,
    code: row.code,
    templateUrl: row.templateUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteLetterType(id: string): Promise<void> {
  await db.delete(letterTypes).where(eq(letterTypes.id, id));
}

export async function setLetterTypeTemplate(
  id: string,
  templateUrl: string | null,
): Promise<void> {
  await db.update(letterTypes).set({ templateUrl }).where(eq(letterTypes.id, id));
}

export async function listCompanyLetters(params?: {
  company?: string;
  issuedTo?: string;
  letterTypeId?: string;
}): Promise<CompanyLetter[]> {
  const conds = [];
  if (params?.company) conds.push(eq(companyLetters.company, params.company));
  if (params?.issuedTo) {
    conds.push(eq(companyLetters.issuedTo, params.issuedTo));
  }
  if (params?.letterTypeId) {
    conds.push(eq(companyLetters.letterTypeId, params.letterTypeId));
  }

  const rows = await db
    .select({
      id: companyLetters.id,
      company: companyLetters.company,
      letterTypeId: companyLetters.letterTypeId,
      letterTypeName: letterTypes.name,
      letterTypeCode: letterTypes.code,
      runningNumber: companyLetters.runningNumber,
      month: companyLetters.month,
      year: companyLetters.year,
      fullNumber: companyLetters.fullNumber,
      issuedTo: companyLetters.issuedTo,
      issuedToName: users.name,
      fileUrl: companyLetters.fileUrl,
      createdAt: companyLetters.createdAt,
    })
    .from(companyLetters)
    .innerJoin(letterTypes, eq(companyLetters.letterTypeId, letterTypes.id))
    .leftJoin(users, eq(companyLetters.issuedTo, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(
      desc(companyLetters.year),
      desc(companyLetters.runningNumber),
      desc(companyLetters.createdAt),
    );

  return rows.map(toCompanyLetter);
}

function toCompanyLetter(row: {
  id: string;
  company: string;
  letterTypeId: string;
  letterTypeName: string;
  letterTypeCode: string;
  runningNumber: number;
  month: string;
  year: number;
  fullNumber: string;
  issuedTo: string | null;
  issuedToName: string | null;
  fileUrl: string | null;
  createdAt: Date;
}): CompanyLetter {
  return {
    id: row.id,
    company: row.company,
    letterTypeId: row.letterTypeId,
    letterTypeName: row.letterTypeName,
    letterTypeCode: row.letterTypeCode,
    runningNumber: row.runningNumber,
    month: row.month,
    year: row.year,
    fullNumber: row.fullNumber,
    issuedTo: row.issuedTo,
    issuedToName: row.issuedToName,
    fileUrl: row.fileUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Nomor berikutnya untuk kombinasi perusahaan + tipe surat + tahun.
 *
 * Penting: urutannya PER TAHUN, bukan per bulan. Dua surat tipe berbeda
 * di bulan yang sama sama-sama boleh mulai dari 001.
 */
export async function nextRunningNumber(
  company: string,
  letterTypeId: string,
  year: number,
): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${companyLetters.runningNumber}), 0)`,
    })
    .from(companyLetters)
    .where(
      and(
        eq(companyLetters.company, company),
        eq(companyLetters.letterTypeId, letterTypeId),
        eq(companyLetters.year, year),
      ),
    );
  return Number(row?.max ?? 0) + 1;
}

/**
 * Nomor surat berikutnya + preview string.
 *
 * Dipakai form "Buat Surat" supaya admin bisa melihat nomor yang akan
 * dipakai sebelum menekan tombol. Angka ini bisa basi kalau ada admin
 * lain yang menyimpan surat di detik yang sama — nomor yang benar
 * tetap dihitung ulang di createCompanyLetter().
 */
export async function previewLetterNumber(input: {
  company: string;
  letterTypeId: string;
  year: number;
  month: number;
}): Promise<{ runningNumber: number; fullNumber: string } | null> {
  const [typeRow] = await db
    .select({ code: letterTypes.code })
    .from(letterTypes)
    .where(eq(letterTypes.id, input.letterTypeId))
    .limit(1);

  if (!typeRow) return null;

  const runningNumber = await nextRunningNumber(
    input.company,
    input.letterTypeId,
    input.year,
  );

  return {
    runningNumber,
    fullNumber: formatFullNumber({
      runningNumber,
      typeCode: typeRow.code,
      company: input.company,
      monthRoman: romanizeMonth(input.month),
      year: input.year,
    }),
  };
}

function formatFullNumber(input: {
  runningNumber: number;
  typeCode: string;
  company: string;
  monthRoman: string;
  year: number;
}): string {
  const padded = String(input.runningNumber).padStart(3, "0");
  return `${padded}/${input.typeCode}/${companyCode(input.company)}/${input.monthRoman}/${input.year}`;
}

export type CreateLetterInput = {
  company: string;
  letterTypeId: string;
  month: number; // 1-12, disimpan sebagai Romawi
  year: number;
  issuedTo: string | null;
  fileUrl?: string | null;
  actorId: string;
};

export async function createCompanyLetter(
  input: CreateLetterInput,
): Promise<{ ok: true; letter: CompanyLetter } | { ok: false; error: string }> {
  const [typeRow] = await db
    .select()
    .from(letterTypes)
    .where(eq(letterTypes.id, input.letterTypeId))
    .limit(1);

  if (!typeRow) {
    return { ok: false, error: "Tipe surat tidak ditemukan." };
  }

  const monthRoman = romanizeMonth(input.month);
  const fullNumber = formatFullNumber({
    runningNumber: await nextRunningNumber(
      input.company,
      input.letterTypeId,
      input.year,
    ),
    typeCode: typeRow.code,
    company: input.company,
    monthRoman,
    year: input.year,
  });

  // Insert gagal kalau dua admin menyimpan surat tipe yang sama pada
  // detik yang sama (unique index). Kita coba ulang sekali dengan
  // angka berikutnya alih-alih menampilkan error mentah ke user.
  for (let attempt = 0; attempt < 3; attempt++) {
    const runningNumber = await nextRunningNumber(
      input.company,
      input.letterTypeId,
      input.year,
    );

    const number = formatFullNumber({
      runningNumber,
      typeCode: typeRow.code,
      company: input.company,
      monthRoman,
      year: input.year,
    });

    try {
      const [row] = await db
        .insert(companyLetters)
        .values({
          company: input.company,
          letterTypeId: input.letterTypeId,
          runningNumber,
          month: monthRoman,
          year: input.year,
          fullNumber: number,
          issuedTo: input.issuedTo,
          fileUrl: input.fileUrl ?? null,
          createdAt: new Date(),
        })
        .returning();

      await writeLog({
        actorId: input.actorId,
        action: "letter_issued",
        targetUserId: input.issuedTo,
        details: number,
      });

      return {
        ok: true,
        letter: toCompanyLetter({
          id: row.id,
          company: row.company,
          letterTypeId: row.letterTypeId,
          letterTypeName: typeRow.name,
          letterTypeCode: typeRow.code,
          runningNumber: row.runningNumber,
          month: row.month,
          year: row.year,
          fullNumber: row.fullNumber,
          issuedTo: row.issuedTo,
          issuedToName: null,
          fileUrl: row.fileUrl,
          createdAt: row.createdAt,
        }),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isUniqueViolation =
        message.includes("company_letters_number_unique") ||
        message.includes("duplicate key");

      if (!isUniqueViolation || attempt === 2) {
        return { ok: false, error: message };
      }
      // Konflik: coba lagi dengan angka berikutnya.
    }
  }

  return { ok: false, error: "Gagal membuat nomor surat. Coba lagi." };
}

export async function deleteCompanyLetter(
  id: string,
  actorId: string,
): Promise<void> {
  const [row] = await db
    .select({ fullNumber: companyLetters.fullNumber })
    .from(companyLetters)
    .where(eq(companyLetters.id, id))
    .limit(1);

  await db.delete(companyLetters).where(eq(companyLetters.id, id));
  await writeLog({
    actorId,
    action: "letter_deleted",
    details: row?.fullNumber ?? id,
  });
}

export async function updateLetterFile(
  id: string,
  fileUrl: string | null,
): Promise<void> {
  await db
    .update(companyLetters)
    .set({ fileUrl })
    .where(eq(companyLetters.id, id));
}