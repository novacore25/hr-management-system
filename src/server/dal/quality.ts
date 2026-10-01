import "server-only";
import { db } from "@/db";
import { and, eq, desc, inArray } from "drizzle-orm";
import {
  kpiAssignments,
  kpis,
  monthlyScores,
  users,
  departments,
} from "@/db/schema";
import { writeLog } from "./absensi";
import { getPerformanceCategory } from "@/lib/utils";
import type { PerformanceCategory } from "@/types";

/**
 * Satu baris input KPI kualitas untuk form HR / Head / Executive.
 *
Semua field sudah di-resolve di server (nama user, judul KPI, divisi)
 * supaya halaman tidak perlu menarik tabel users + kpis + assignments
 * hanya untuk menyusun label.
 */
export type QualityRow = {
  assignmentId: string;
  userId: string;
  userName: string;
  departmentName: string;
  kpiId: string;
  kpiTitle: string;
  kpiUnit: string;
  monthlyTarget: number;
  /** Nilai yang tersimpan bulan ini; 0 kalau belum diinput. */
  actualTotal: number;
  /** Sama dengan actualTotal / monthlyTarget * 100 (completion rate). */
  achievementPercentage: number;
  performanceCategory: PerformanceCategory;
  notes: string;
  /** True kalau sudah pernah diinput Who's on this month. */
  hasScore: boolean;
};

function num(value: unknown): number {
  return Number(value ?? 0);
}

/**
 * Daftar KPI kualitas aktif untuk satu bulan.
 *
 * formerly: halaman melakukan query `kpi_assignments` dengan nested select
 * ke `kpis`, `departments`, dan `monthly_scores`, lalu mencocokkan nama
 * user lewat `Map` yang dibuat dari daftar user yang diunduh terpisah.
 * Sekarang semuanya satu query dan join di SQL.
 */
export async function listQualityRows(params: {
  year: number;
  month: number;
  /** Batasi ke satu divisi (dipakai halaman Head). null = semua. */
  departmentId?: string | null;
  /** Batasi ke satu user (dipakai Evaluasi HR untuk diri sendiri). */
  userId?: string | null;
}): Promise<QualityRow[]> {
  const conds = [
    eq(kpiAssignments.year, params.year),
    eq(kpiAssignments.month, params.month),
    eq(kpiAssignments.kpiType, "quality"),
    eq(kpiAssignments.status, "active"),
  ];

  if (params.departmentId) {
    conds.push(eq(kpiAssignments.departmentId, params.departmentId));
  }
  if (params.userId) {
    conds.push(eq(kpiAssignments.userId, params.userId));
  }

  const rows = await db
    .select({
      assignmentId: kpiAssignments.id,
      userId: kpiAssignments.userId,
      userName: users.name,
      departmentName: departments.name,
      kpiId: kpiAssignments.kpiId,
      kpiTitle: kpis.title,
      kpiUnit: kpis.unit,
      monthlyTarget: kpiAssignments.monthlyTarget,
      actualTotal: kpiAssignments.actualTotal,
      achievementPercentage: kpiAssignments.achievementPercentage,
      scoreActual: monthlyScores.actualTotal,
      scoreTarget: monthlyScores.monthlyTarget,
      scorePct: monthlyScores.achievementPercentage,
      scoreNotes: monthlyScores.notes,
    })
    .from(kpiAssignments)
    .innerJoin(kpis, eq(kpiAssignments.kpiId, kpis.id))
    .innerJoin(users, eq(kpiAssignments.userId, users.id))
    .leftJoin(departments, eq(kpiAssignments.departmentId, departments.id))
    .leftJoin(
      monthlyScores,
      and(
        eq(monthlyScores.assignmentId, kpiAssignments.id),
        eq(monthlyScores.year, params.year),
        eq(monthlyScores.month, params.month),
      ),
    )
    .where(and(...conds))
    .orderBy(desc(kpiAssignments.updatedAt));

  return rows.map((r) => {
    // Kalau sudah ada baris monthly_scores, angka bulan ini yang dipakai.
    // Kolom di kpi_assignments adalah denormalisasi dan bisa basi kalau
    // pengesahan terakhir dilakukan lewat jalur lain.
    const hasScore = r.scoreActual !== null;
    const actualTotal = hasScore ? num(r.scoreActual) : num(r.actualTotal);
    const monthlyTarget = hasScore ? num(r.scoreTarget) : num(r.monthlyTarget);
    const pct =
      monthlyTarget > 0 ? (actualTotal / monthlyTarget) * 100 : num(r.scorePct);

    return {
      assignmentId: r.assignmentId,
      userId: r.userId,
      userName: r.userName ?? "Unknown",
      departmentName: r.departmentName ?? "Umum",
      kpiId: r.kpiId,
      kpiTitle: r.kpiTitle,
      kpiUnit: r.kpiUnit ?? "percentage",
      monthlyTarget,
      actualTotal,
      achievementPercentage: pct,
      performanceCategory: getPerformanceCategory(pct),
      notes: (hasScore ? r.scoreNotes : null) ?? "",
      hasScore,
    };
  });
}

/**
 * Simpan nilai KPI kualitas untuk satu assignment.
 *
 * formerly: halaman melakukan 2 operasi dari browser —
 *   1. upsert ke monthly_scores (hanya 4 kolom)
 *   2. update kpi_assignments (actual_total + achievement_percentage)
 *
 * Dua masalahnya:
 *   - `achievement_percentage` dikirim dari client. Form mengetik "80" dan
 *     menulis apa pun yang diketik, termasuk di luar 0-100.
 *   - `monthly_scores.monthly_target` TIDAK pernah ditulis, jadi tetap 0.
 *     Padahal kolom itu ada dipakai untuk reports.'artinya data quality
 *     di tabel itu selalu tidak konsisten dengan assignment.
 *
 * Sekarang: percentage, target, dan kategorinya dihitung server.
 */
export async function setQualityScore(
  params: {
    assignmentId: string;
    year: number;
    month: number;
    actualTotal: number;
    notes?: string | null;
  },
  actorId: string,
): Promise<
  | { ok: true; row: QualityRow }
  | { ok: false; error: string }
> {
  const [assignment] = await db
    .select({
      id: kpiAssignments.id,
      kpiType: kpiAssignments.kpiType,
      userId: kpiAssignments.userId,
      monthlyTarget: kpiAssignments.monthlyTarget,
      year: kpiAssignments.year,
      month: kpiAssignments.month,
    })
    .from(kpiAssignments)
    .where(eq(kpiAssignments.id, params.assignmentId))
    .limit(1);

  if (!assignment) {
    return { ok: false, error: "Assignment tidak ditemukan." };
  }

  if (assignment.kpiType !== "quality") {
    return {
      ok: false,
      error: "Nilai hanya bisa diinput untuk KPI bertipe quality.",
    };
  }

  // Menolak assignment dari bulan lain: mencegah salah input yang
  // menulis skor ke baris quality untuk periode yang tidak sedang dinilai.
  if (assignment.year !== params.year || assignment.month !== params.month) {
    return {
      ok: false,
      error: `Assignment ini milik periode ${assignment.year}-${assignment.month}, bukan ${params.year}-${params.month}.`,
    };
  }

  if (!Number.isFinite(params.actualTotal) || params.actualTotal < 0) {
    return { ok: false, error: "Nilai harus angka dan tidak boleh negatif." };
  }

  const monthlyTarget = num(assignment.monthlyTarget);
  const pct =
    monthlyTarget > 0 ? (params.actualTotal / monthlyTarget) * 100 : 0;

  const now = new Date();

  await db
    .insert(monthlyScores)
    .values({
      assignmentId: params.assignmentId,
      year: params.year,
      month: params.month,
      actualTotal: String(params.actualTotal),
      monthlyTarget: String(monthlyTarget),
      achievementPercentage: String(pct),
      notes: params.notes ?? null,
      inputtedBy: actorId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [monthlyScores.assignmentId, monthlyScores.year, monthlyScores.month],
      set: {
        actualTotal: String(params.actualTotal),
        monthlyTarget: String(monthlyTarget),
        achievementPercentage: String(pct),
        notes: params.notes ?? null,
        inputtedBy: actorId,
        updatedAt: now,
      },
    });

  // Keeping assignment in sync with the denormalised columns in
  // halaman lain yang membaca tabel itu tidak melihat angka basi.
  await db
    .update(kpiAssignments)
    .set({
      actualTotal: String(params.actualTotal),
      achievementPercentage: String(pct),
      updatedAt: now,
    })
    .where(eq(kpiAssignments.id, params.assignmentId));

  await writeLog({
    actorId,
    action: "quality_score_saved",
    targetUserId: assignment.userId,
    details: `${params.year}-${params.month} = ${params.actualTotal} (${pct.toFixed(2)}%)`,
  });

  const rows = await listQualityRows({
    year: params.year,
    month: params.month,
  });
  const row = rows.find((r) => r.assignmentId === params.assignmentId);

  return row ? { ok: true, row } : { ok: false, error: "Gagal memuat ulang data." };
}

/**
 * Assignment milik user tertentu pada satu bulan.
 *
 * Dipakai halaman Evaluasi HR yang menilai dirinya sendiri.
 */
export async function qualityRowsForUser(
  userId: string,
  year: number,
  month: number,
): Promise<QualityRow[]> {
  return listQualityRows({ year, month, userId });
}

/** Divisi yang punya assignment milik user (dipakai untuk scoping Head). */
export async function departmentsForUser(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ departmentId: kpiAssignments.departmentId })
    .from(kpiAssignments)
    .where(eq(kpiAssignments.userId, userId));

  const ids = [...new Set(rows.map((r) => r.departmentId).filter(Boolean))];
  if (ids.length === 0) return [];

  const depts = await db
    .select({ id: departments.id })
    .from(departments)
    .where(inArray(departments.id, ids as string[]));

  return depts.map((d) => d.id);
}