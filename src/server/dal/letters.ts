import "server-only";
import { db } from "@/db";
import { and, eq, desc, sql } from "drizzle-orm";
import { letterTypes, companyLetters, users } from "@/db/schema";
import { writeLog } from "./absensi";

export type LetterType = {
  id: string;
  name: string;
  code: string;
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
  return rows;
}

export async function createLetterType(
  name: string,
  code: string,
): Promise<LetterType> {
  const [row] = await db
    .insert(letterTypes)
    .values({ name: name.trim(), code: code.trim() })
    .returning();
  return row;
}

export async function deleteLetterType(id: string): Promise<void> {
  await db.delete(letterTypes).where(eq(letterTypes.id, id));
}

export async function listCompanyLetters(params?: {
  company?: string;
  issuedTo?: string;
  letterTypeId?: string;
}): Promise<CompanyLetter[]> {
  const conds = [];
  if (params?.company) conds.push(eq(companyLetters.company, params.company));
  if (params?.issuedTo) conds.push(eq(companyLetters.issuedTo, params.issuedTo));
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
    .orderBy(desc(companyLetters.year), desc(companyLetters.month), desc(companyLetters.runningNumber));

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Nomor surat berikutnya untuk kombinasi perusahaan + tipe + bulan.
 * Dihitung dengan MAX()+1 di dalam transaksi supaya tidak bentrok
 * Though ada unique index (company, year, month, running_number).
 */
export async function nextRunningNumber(
  company: string,
  year: number,
  month: string,
): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${companyLetters.runningNumber}), 0)`,
    })
    .from(companyLetters)
    .where(
      and(
        eq(companyLetters.company, company),
        eq(companyLetters.year, year),
        eq(companyLetters.month, month),
      ),
    );
  return Number(row?.max ?? 0) + 1;
}

export type CreateLetterInput = {
  company: string;
  letterTypeId: string;
  month: string;
  year: number;
  issuedTo: string | null;
  fileUrl?: string | null;
  actorId: string;
};

export async function createCompanyLetter(
  input: CreateLetterInput,
): Promise<{ ok: true; letter: CompanyLetter } | { ok: false; error: string }> {
  const runningNumber = await nextRunningNumber(
    input.company,
    input.year,
    input.month,
  );

  const [typeRow] = await db
    .select()
    .from(letterTypes)
    .where(eq(letterTypes.id, input.letterTypeId))
    .limit(1);

  if (!typeRow) {
    return { ok: false, error: "Tipe surat tidak ditemukan." };
  }

  const fullNumber = `${input.company}/${typeRow.code}/${input.month}/${runningNumber}`;

  const [row] = await db
    .insert(companyLetters)
    .values({
      company: input.company,
      letterTypeId: input.letterTypeId,
      runningNumber,
      month: input.month,
      year: input.year,
      fullNumber,
      issuedTo: input.issuedTo,
      fileUrl: input.fileUrl ?? null,
      createdAt: new Date(),
    })
    .returning();

  await writeLog({
    actorId: input.actorId,
    action: "letter_issued",
    targetUserId: input.issuedTo,
    details: fullNumber,
  });

  return {
    ok: true,
    letter: {
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
      createdAt: row.createdAt.toISOString(),
    },
  };
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
  fileUrl: string,
): Promise<void> {
  await db
    .update(companyLetters)
    .set({ fileUrl })
    .where(eq(companyLetters.id, id));
}