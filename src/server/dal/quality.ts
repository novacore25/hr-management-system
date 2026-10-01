import "server-only";
import { db } from "@/db";
import { and, eq, or, desc, inArray } from "drizzle-orm";
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
  /** Tipe KPI: quality, lead_tim, atau hr. */
  kpiType: "result" | "activity" | "quality" | "lead_tim" | "hr";
  kpiTitle: string;
  kpiUnit: string;
  /**
   * Brand / sub-divisi (TNT, Iswhite, Syb, ...). Nullable — hanya diisi
   * sejak migrasi 0011. Halaman /dashboard/executive/quality sudah
   * merender label ini sejak lama, tapi kolomnya tidak pernah ada di
   * schema sehingga badge-nya tidak pernah muncul.
   */
  kpiBrand: string | null;
  monthlyTarget: number;
  /** Nilai yang tersimpan bulan ini; 0 kalau belum diinput. */
  actualTotal: number;
  /** Sama dengan actualTotal / monthlyTarget * 100 (completion rate). */
  achievementPercentage: number;
  performanceCategory: PerformanceCategory;
  notes: string;
  /** True kalau bulan ini sudah pernah ada nilai yang tersimpan. */
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
  /** Batasi ke satu divisi. null = semua. */
  departmentId?: string | null;
  /**
   * Batasi ke beberapa divisi sekaligus — ini yang dipakai `scope=managed`
   * untuk Head, yang biasanya mengelola lebih dari satu divisi.
   * Array kosong berarti hasil kosong, bukan "semua".
   */
  departmentIds?: string[] | null;
  /** Batasi ke satu user (dipakai Evaluasi HR untuk diri sendiri). */
  userId?: string | null;
  /**
   * User yang tetapAlways terlihat meski di luar `departmentIds`.
   *
   * Dipakai Head: assignment milik Head sendiri sering tidak punya
   * `department_id` (karena dia undivided), jadi filter `IN (...)`
   * akan menyembunyikan KPI-nya sendiri. Akibatnya Head melihat
   * seluruh tim tapi tidak melihat dirinya — persis kebalikan dari
   * yang diinginkan.
   */
  alsoIncludeUserIds?: string[] | null;
  /**
   * Tipe KPI yang diikutkan. Default `quality` + `lead_tim` — itu yang
   * ditampilkan /dashboard/head/quality dan /dashboard/executive/quality.
   *
   * Halaman Evaluasi HR perlu `lead_tim` + `hr`, jadi menyetelnya
   * eksplisit. Dulu halaman ini menyaring `kpis.type` lewat `.in()` di
   * browser; sekarang filter-nya ikut pindah ke SQL.
   */
  kpiTypes?: Array<"quality" | "lead_tim" | "hr" | "result" | "activity">;
}): Promise<QualityRow[]> {
  const kpiTypes = params.kpiTypes ?? ["quality", "lead_tim"];

  const conds = [
    eq(kpiAssignments.year, params.year),
    eq(kpiAssignments.month, params.month),
    inArray(kpiAssignments.kpiType, kpiTypes),
    eq(kpiAssignments.status, "active"),
  ];

  if (kpiTypes.length === 0) return [];

  if (params.departmentId) {
    conds.push(eq(kpiAssignments.departmentId, params.departmentId));
  }
  if (params.departmentIds) {
    const alsoMine = params.alsoIncludeUserIds ?? [];

    if (params.departmentIds.length === 0 && alsoMine.length === 0) return [];

    if (alsoMine.length === 0) {
      conds.push(inArray(kpiAssignments.departmentId, params.departmentIds));
    } else {
      // Divisi yang dikelola OR assignment milik Head sendiri.
      conds.push(
        or(
          inArray(kpiAssignments.departmentId, params.departmentIds),
          inArray(kpiAssignments.userId, alsoMine),
        )!,
      );
    }
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
      kpiType: kpiAssignments.kpiType,
      kpiTitle: kpis.title,
      kpiUnit: kpis.unit,
      kpiBrand: kpis.brand,
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
      kpiType: r.kpiType,
      kpiTitle: r.kpiTitle,
      kpiUnit: r.kpiUnit ?? "percentage",
      kpiBrand: r.kpiBrand ?? null,
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
 * Siapa boleh mengisi nilai untuk sebuah assignment.
 *
 * PENTING: `managedDepartments` dibaca dari baris `users` milik aktor di
 * server, bukan dari request. Halaman /dashboard/head/quality sebelumnya
 * mengambil daftar divisi dari `AuthContext` di browser lalu memakainya
 * untuk menentukan `user_id` mana yang boleh ditanyakan. Kalau begitu
 * Head cukup mengubah nilai itu di browser untuk membaca — dan menilai —
 * divisi yang bukan miliknya.
 *
 * Head juga boleh menilai dirinya sendiri, apa pun divisinya.
 */
async function assertCanScore(
  assignmentId: string,
  actor: { id: string; kpiRole: string; managedDepartments: string[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [assignment] = await db
    .select({
      userId: kpiAssignments.userId,
      departmentId: kpiAssignments.departmentId,
    })
    .from(kpiAssignments)
    .where(eq(kpiAssignments.id, assignmentId))
    .limit(1);

  if (!assignment) {
    return { ok: false, error: "Assignment tidak ditemukan." };
  }

  // HR / Executive / Developer boleh untuk semua divisi.
  if (["hr", "executive", "developer"].includes(actor.kpiRole)) {
    return { ok: true };
  }

  if (actor.kpiRole === "head") {
    if (assignment.userId === actor.id) return { ok: true };

    // Assignment tanpa divisi tidak bisa dicocokkan dengan daftar yang
    // dikelola, jadi tolak — lebih ketat lebih baik daripada meloloskan.
    const targetDept = assignment.departmentId;
    if (!targetDept || !actor.managedDepartments.includes(targetDept)) {
      return {
        ok: false,
        error: "Assignment ini di luar divisi yang Anda kelola.",
      };
    }
    return { ok: true };
  }

  return {
    ok: false,
    error: "Role Anda tidak punya izin untuk mengisi nilai KPI kualitas.",
  };
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
 *     Padahal kolom itu dipakai untuk reports. Artinya data quality di
 *     tabel itu selalu tidak konsisten dengan assignment.
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
  actor: {
    id: string;
    kpiRole: string;
    managedDepartments: string[];
  },
): Promise<
  | { ok: true; row: QualityRow }
  | { ok: false; error: string }
> {
  const allowed = await assertCanScore(params.assignmentId, actor);
  if (!allowed.ok) return { ok: false, error: allowed.error };

  const actorId = actor.id;
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

  // Tiga tipe ini yang dinilai lewat form nilai KPI: Quality (halaman HR /
  // Head / Executive), Lead Tim, dan HR (halaman Evaluasi HR). Hanya
  // menerima "quality" membuat tombol Simpan di baris Lead Tim / HR gagal
  // dengan pesan yang menyesatkan.
  if (
    assignment.kpiType !== "quality" &&
    assignment.kpiType !== "lead_tim" &&
    assignment.kpiType !== "hr"
  ) {
    return {
      ok: false,
      error:
        "Nilai hanya bisa diinput untuk KPI bertipe quality, lead tim, atau hr.",
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