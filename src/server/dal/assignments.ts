import "server-only";
import { db } from "@/db";
import { and, eq, inArray, sql, desc, gte, lte } from "drizzle-orm";
import {
  kpiAssignments,
  kpis,
  users,
  departments,
  dailyReports,
  monthlyScores,
  kpiHistories,
  kpiSettings,
} from "@/db/schema";
import { getPerformanceCategory } from "@/lib/performance";
import type {
  KpiAssignmentWithDetails,
  AssignmentStatus,
  PerformanceCategory,
  QualityMonthScore,
} from "@/types";

// ─────────────────────────────────────────────────────────────
// Shape assignment yang dikirim ke UI.
// Field yang tidak ada di DB diisi default supaya 60 halaman
// lama tidak perlu diubah.
// ─────────────────────────────────────────────────────────────

type AssignmentRow = typeof kpiAssignments.$inferSelect & {
  kpiTitle: string | null;
  kpiDescription: string | null;
  kpiUnit: string | null;
  kpiPeriod: string | null;
  kpiDepartmentId: string | null;
  kpiHideActual: boolean | null;
  userName: string | null;
  userPhoto: string | null;
  userKpiRole: string | null;
  departmentName: string | null;
};

function toAssignment(
  row: AssignmentRow,
  scores: Record<string, QualityMonthScore>,
): KpiAssignmentWithDetails {
  const kpi = {
    id: row.kpiId,
    title: row.kpiTitle ?? "(KPI dihapus)",
    description: row.kpiDescription ?? "",
    type: row.kpiType,
    unit: row.kpiUnit as never,
    period: row.kpiPeriod as never,
    status: "active" as never,
    department: row.departmentName ?? "",
    createdBy: "",
    monthlyTarget: 0,
    year: row.year,
    month: row.month,
    deletedAt: null,
    hideActual: row.kpiHideActual ?? false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  const user = {
    id: row.userId,
    name: row.userName ?? "",
    email: "",
    kpiRole: (row.userKpiRole ?? "tim") as never,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    department: row.departmentName,
    position: null,
    photoUrl: row.userPhoto,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    absensiRole: "staff" as const,
    absensiStatus: "active" as const,
    leaveQuota: 0,
    sickQuota: 0,
    isHidden: false,
  };

  return {
    id: row.id,
    kpiId: row.kpiId,
    kpiType: row.kpiType,
    userId: row.userId,
    department: row.departmentName ?? "",
    status: row.status,
    monthlyTarget: Number(row.monthlyTarget),
    currentDailyTarget: Number(row.currentDailyTarget),
    actualTotal: Number(row.actualTotal),
    expectedTotal: Number(row.expectedTotal),
    achievementPercentage: Number(row.achievementPercentage),
    performanceCategory: getPerformanceCategory(
      Number(row.achievementPercentage),
    ) as PerformanceCategory,
    workingDaysTotal: row.workingDaysTotal,
    workingDaysElapsed: row.workingDaysElapsed,
    workingDaysRemaining: row.workingDaysRemaining,
    activeDays: row.activeDays,
    qualityNotes: row.qualityNotes ?? "",
    year: row.year,
    month: row.month,
    heldAt: row.heldAt ? row.heldAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    kpi,
    user,
    monthlyScores: scores,
  } as unknown as KpiAssignmentWithDetails;
}

const assignmentSelect = {
  id: kpiAssignments.id,
  kpiId: kpiAssignments.kpiId,
  kpiType: kpiAssignments.kpiType,
  userId: kpiAssignments.userId,
  departmentId: kpiAssignments.departmentId,
  monthlyTarget: kpiAssignments.monthlyTarget,
  currentDailyTarget: kpiAssignments.currentDailyTarget,
  actualTotal: kpiAssignments.actualTotal,
  expectedTotal: kpiAssignments.expectedTotal,
  achievementPercentage: kpiAssignments.achievementPercentage,
  performanceCategory: kpiAssignments.performanceCategory,
  workingDaysTotal: kpiAssignments.workingDaysTotal,
  workingDaysElapsed: kpiAssignments.workingDaysElapsed,
  workingDaysRemaining: kpiAssignments.workingDaysRemaining,
  activeDays: kpiAssignments.activeDays,
  qualityNotes: kpiAssignments.qualityNotes,
  year: kpiAssignments.year,
  month: kpiAssignments.month,
  status: kpiAssignments.status,
  heldAt: kpiAssignments.heldAt,
  cancelledAt: kpiAssignments.cancelledAt,
  completedAt: kpiAssignments.completedAt,
  createdAt: kpiAssignments.createdAt,
  updatedAt: kpiAssignments.updatedAt,
  kpiTitle: kpis.title,
  kpiDescription: kpis.description,
  kpiUnit: kpis.unit,
  kpiPeriod: kpis.period,
  kpiDepartmentId: kpis.departmentId,
  kpiHideActual: kpis.hideActual,
  userName: users.name,
  userPhoto: users.photoUrl,
  userKpiRole: users.kpiRole,
  departmentName: departments.name,
};

/** Skor quality per bulan untuk sekumpulan assignment. */
async function loadScores(
  assignmentIds: string[],
): Promise<Record<string, Record<string, QualityMonthScore>>> {
  if (assignmentIds.length === 0) return {};

  const rows = await db
    .select()
    .from(monthlyScores)
    .where(inArray(monthlyScores.assignmentId, assignmentIds));

  const out: Record<string, Record<string, QualityMonthScore>> = {};
  for (const r of rows) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    (out[r.assignmentId] ??= {})[key] = {
      actualTotal: Number(r.actualTotal),
      achievementPercentage: Number(r.achievementPercentage),
      performanceCategory: getPerformanceCategory(
        Number(r.achievementPercentage),
      ),
      qualityNotes: r.notes ?? "",
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  return out;
}

async function hydrate(
  rows: AssignmentRow[],
): Promise<KpiAssignmentWithDetails[]> {
  const scores = await loadScores(rows.map((r) => r.id));
  return rows.map((r) => toAssignment(r, scores[r.id] ?? {}));
}

// ─────────────────────────────────────────────────────────────
// QUERY
// ─────────────────────────────────────────────────────────────

/** Assignment milik satu user pada satu periode. */
export async function listUserAssignments(
  userId: string,
  year: number,
  month: number,
  statuses: AssignmentStatus[],
): Promise<KpiAssignmentWithDetails[]> {
  const rows = await db
    .select(assignmentSelect)
    .from(kpiAssignments)
    .innerJoin(kpis, eq(kpiAssignments.kpiId, kpis.id))
    .innerJoin(users, eq(kpiAssignments.userId, users.id))
    .leftJoin(departments, eq(kpiAssignments.departmentId, departments.id))
    .where(
      and(
        eq(kpiAssignments.userId, userId),
        eq(kpiAssignments.year, year),
        eq(kpiAssignments.month, month),
        inArray(kpiAssignments.status, statuses),
      ),
    )
    .orderBy(desc(kpiAssignments.createdAt));

  return hydrate(rows as AssignmentRow[]);
}

/** Semua assignment pada satu periode (untuk HR/Executive). */
export async function listAllAssignments(
  year: number,
  month: number,
  statuses?: AssignmentStatus[],
): Promise<KpiAssignmentWithDetails[]> {
  const conds = [
    eq(kpiAssignments.year, year),
    eq(kpiAssignments.month, month),
  ];
  if (statuses?.length) conds.push(inArray(kpiAssignments.status, statuses));

  const rows = await db
    .select(assignmentSelect)
    .from(kpiAssignments)
    .innerJoin(kpis, eq(kpiAssignments.kpiId, kpis.id))
    .innerJoin(users, eq(kpiAssignments.userId, users.id))
    .leftJoin(departments, eq(kpiAssignments.departmentId, departments.id))
    .where(and(...conds))
    .orderBy(desc(kpiAssignments.createdAt));

  return hydrate(rows as AssignmentRow[]);
}

/** Assignment milik satu divisi. */
export async function listDepartmentAssignments(
  deptId: string,
  year: number,
  month: number,
  statuses?: AssignmentStatus[],
): Promise<KpiAssignmentWithDetails[]> {
  const conds = [
    eq(kpiAssignments.departmentId, deptId),
    eq(kpiAssignments.year, year),
    eq(kpiAssignments.month, month),
  ];
  if (statuses?.length) conds.push(inArray(kpiAssignments.status, statuses));

  const rows = await db
    .select(assignmentSelect)
    .from(kpiAssignments)
    .innerJoin(kpis, eq(kpiAssignments.kpiId, kpis.id))
    .innerJoin(users, eq(kpiAssignments.userId, users.id))
    .leftJoin(departments, eq(kpiAssignments.departmentId, departments.id))
    .where(and(...conds))
    .orderBy(desc(kpiAssignments.createdAt));

  return hydrate(rows as AssignmentRow[]);
}

/**
 * Assignment untuk user yang login, dalam rentang bulan.
 * Dipakai halaman /dashboard/tim?mode=range
 */
export async function listUserAssignmentsInRange(
  userId: string,
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
): Promise<KpiAssignmentWithDetails[]> {
  const rows = await db
    .select(assignmentSelect)
    .from(kpiAssignments)
    .innerJoin(kpis, eq(kpiAssignments.kpiId, kpis.id))
    .innerJoin(users, eq(kpiAssignments.userId, users.id))
    .leftJoin(departments, eq(kpiAssignments.departmentId, departments.id))
    .where(
      and(
        eq(kpiAssignments.userId, userId),
        inArray(kpiAssignments.status, [
          "active",
          "completed",
          "hold",
          "cancelled",
        ]),
        sql`(${kpiAssignments.year} > ${fromYear}
             OR (${kpiAssignments.year} = ${fromYear} AND ${kpiAssignments.month} >= ${fromMonth}))`,
        sql`(${kpiAssignments.year} < ${toYear}
             OR (${kpiAssignments.year} = ${toYear} AND ${kpiAssignments.month} <= ${toMonth}))`,
      ),
    )
    .orderBy(desc(kpiAssignments.year), desc(kpiAssignments.month));

  return hydrate(rows as AssignmentRow[]);
}

export async function findAssignmentById(
  id: string,
): Promise<KpiAssignmentWithDetails | null> {
  const [row] = await db
    .select(assignmentSelect)
    .from(kpiAssignments)
    .innerJoin(kpis, eq(kpiAssignments.kpiId, kpis.id))
    .innerJoin(users, eq(kpiAssignments.userId, users.id))
    .leftJoin(departments, eq(kpiAssignments.departmentId, departments.id))
    .where(eq(kpiAssignments.id, id))
    .limit(1);

  return row ? toAssignment(row as AssignmentRow, {}) : null;
}

// ─────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────

export type NewAssignmentInput = {
  kpiId: string;
  userId: string;
  departmentId: string | null;
  monthlyTarget: number;
  year: number;
  month: number;
  workingDaysTotal: number;
  assignedBy: string;
};

/**
 * Buat banyak assignment sekaligus.
 * Assignment duplikat (user + kpi + periode) di-skip dengan
 * `onConflictDoNothing` — bukan error, supaya bulk import tidak
 * gagal di tengah jalan.
 */
export async function createAssignments(
  inputs: NewAssignmentInput[],
): Promise<{ created: number; skipped: number }> {
  if (inputs.length === 0) return { created: 0, skipped: 0 };

  const now = new Date();

  const rows = inputs.map((i) => ({
    kpiId: i.kpiId,
    // Placeholder, dikoreksi dari tabel kpis di bawah.
    kpiType: "result" as typeof kpiAssignments.kpiType.enumValues[number],
    userId: i.userId,
    departmentId: i.departmentId,
    monthlyTarget: String(i.monthlyTarget),
    actualTotal: "0",
    expectedTotal: "0",
    achievementPercentage: "0",
    currentDailyTarget: String(
      i.workingDaysTotal > 0 ? i.monthlyTarget / i.workingDaysTotal : 0,
    ),
    workingDaysTotal: i.workingDaysTotal,
    workingDaysElapsed: 0,
    workingDaysRemaining: i.workingDaysTotal,
    activeDays: 0,
    status: "active" as const,
    performanceCategory: "warning" as const,
    year: i.year,
    month: i.month,
    assignedBy: i.assignedBy,
    createdAt: now,
    updatedAt: now,
  }));

  // Ambil kpiType asli dari tabel kpis
  const kpiIds = [...new Set(inputs.map((i) => i.kpiId))];
  const kpiRows = await db
    .select({ id: kpis.id, type: kpis.type })
    .from(kpis)
    .where(inArray(kpis.id, kpiIds));
  const typeMap = new Map(kpiRows.map((r) => [r.id, r.type]));

  for (const r of rows) {
    r.kpiType = typeMap.get(r.kpiId) ?? "result";
  }

  const inserted = await db
    .insert(kpiAssignments)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: kpiAssignments.id });

  // Recalc target tiap KPI yang terpengaruh
  const affected = new Set(inputs.map((i) => i.kpiId));
  for (const id of affected) {
    await recalcKpiTargetSafe(id);
  }

  return { created: inserted.length, skipped: rows.length - inserted.length };
}

async function recalcKpiTargetSafe(kpiId: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${kpiAssignments.monthlyTarget}), 0)`,
    })
    .from(kpiAssignments)
    .where(
      and(eq(kpiAssignments.kpiId, kpiId), sql`${kpiAssignments.status} <> 'cancelled'`),
    );
  await db
    .update(kpis)
    .set({ monthlyTarget: String(Number(row?.total ?? 0)), updatedAt: new Date() })
    .where(eq(kpis.id, kpiId));
}

/** Ubah status assignment + tulis audit log. */
export async function setAssignmentStatus(
  id: string,
  status: AssignmentStatus,
  actorId: string,
): Promise<void> {
  const [before] = await db
    .select()
    .from(kpiAssignments)
    .where(eq(kpiAssignments.id, id))
    .limit(1);

  if (!before) throw new Error("Assignment tidak ditemukan.");

  const now = new Date();
  const patch: Record<string, unknown> = { status, updatedAt: now };
  if (status === "hold") patch.heldAt = now;
  if (status === "cancelled") patch.cancelledAt = now;
  if (status === "completed") patch.completedAt = now;

  await db.update(kpiAssignments).set(patch).where(eq(kpiAssignments.id, id));

  await db.insert(kpiHistories).values({
    assignmentId: id,
    userId: before.userId,
    action: `status_${status}`,
    oldValue: { status: before.status },
    newValue: { status },
    triggeredBy: actorId,
    createdAt: now,
  });
}

/** Ubah target per orang. Total KPI ikut di-recalc. */
export async function setAssignmentTarget(
  id: string,
  monthlyTarget: number,
  actorId: string,
): Promise<void> {
  const [before] = await db
    .select()
    .from(kpiAssignments)
    .where(eq(kpiAssignments.id, id))
    .limit(1);

  if (!before) throw new Error("Assignment tidak ditemukan.");

  await db
    .update(kpiAssignments)
    .set({ monthlyTarget: String(monthlyTarget), updatedAt: new Date() })
    .where(eq(kpiAssignments.id, id));

  await db.insert(kpiHistories).values({
    assignmentId: id,
    userId: before.userId,
    action: "target_changed",
    oldValue: { monthlyTarget: Number(before.monthlyTarget) },
    newValue: { monthlyTarget },
    triggeredBy: actorId,
    createdAt: new Date(),
  });

  await recalcKpiTargetSafe(before.kpiId);
}

export async function deleteAssignment(id: string): Promise<void> {
  const [before] = await db
    .select({ kpiId: kpiAssignments.kpiId })
    .from(kpiAssignments)
    .where(eq(kpiAssignments.id, id))
    .limit(1);

  await db.delete(kpiAssignments).where(eq(kpiAssignments.id, id));
  if (before) await recalcKpiTargetSafe(before.kpiId);
}

// ─────────────────────────────────────────────────────────────
// DAILY REPORTS
// ─────────────────────────────────────────────────────────────

type DailyReportRow = typeof dailyReports.$inferSelect;

function toReport(row: DailyReportRow) {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    kpiId: row.kpiId,
    userId: row.userId,
    // Kolom `date` dari Drizzle sudah berupa string "YYYY-MM-DD"
    date: String(row.date),
    actualValue: Number(row.value),
    notes: row.notes ?? "",
    department: "",
    isHolidayRollover: row.isHolidayRollover,
    originalDate: row.originalDate ? String(row.originalDate) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Semua laporan untuk satu assignment. */
export async function listReportsForAssignment(
  assignmentId: string,
  userId: string,
): Promise<ReturnType<typeof toReport>[]> {
  const rows = await db
    .select()
    .from(dailyReports)
    .where(
      and(
        eq(dailyReports.assignmentId, assignmentId),
        eq(dailyReports.userId, userId),
      ),
    )
    .orderBy(desc(dailyReports.date));

  return rows.map(toReport);
}

/** Laporan dalam rentang tanggal (opsional filter user/assignment). */
export async function listReportsInRange(
  from: string,
  to: string,
  userId?: string,
  assignmentIds?: string[],
): Promise<ReturnType<typeof toReport>[]> {
  const conds = [
    gte(dailyReports.date, from),
    lte(dailyReports.date, to),
  ];
  if (userId) conds.push(eq(dailyReports.userId, userId));
  if (assignmentIds?.length) {
    conds.push(inArray(dailyReports.assignmentId, assignmentIds));
  }

  const rows = await db
    .select()
    .from(dailyReports)
    .where(and(...conds))
    .orderBy(desc(dailyReports.date));

  return rows.map(toReport);
}

/**
 * Tambah / perbarui laporan harian untuk satu assignment + tanggal.
 * Memakai upsert karena ada unique constraint (assignment_id, date).
 * Setelah simpan, total assignment dihitung ulang (pengganti trigger DB).
 */
export async function upsertDailyReport(params: {
  assignmentId: string;
  kpiId: string;
  userId: string;
  date: string;
  value: number;
  notes?: string | null;
}): Promise<void> {
  const now = new Date();

  await db
    .insert(dailyReports)
    .values({
      assignmentId: params.assignmentId,
      kpiId: params.kpiId,
      userId: params.userId,
      date: params.date,
      value: String(params.value),
      notes: params.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dailyReports.assignmentId, dailyReports.date],
      set: {
        value: String(params.value),
        notes: params.notes ?? null,
        updatedAt: now,
      },
    });

  await recalcAssignmentTotals(params.assignmentId);
}

export async function deleteDailyReport(
  assignmentId: string,
  date: string,
): Promise<void> {
  await db
    .delete(dailyReports)
    .where(and(eq(dailyReports.assignmentId, assignmentId), eq(dailyReports.date, date)));
  await recalcAssignmentTotals(assignmentId);
}

/**
 * Hitung ulang actualTotal + achievementPercentage (pace rate).
 *
 * PACE RATE = actual / expected-by-now, BUKAN completion rate.
 * expected = monthlyTarget / workingDaysTotal * workingDaysElapsed
 *
 * Ini pengganti trigger PostgreSQL `recalculate_assignment_totals`.
 */
export async function recalcAssignmentTotals(assignmentId: string): Promise<void> {
  const [agg] = await db
    .select({ total: sql<number>`coalesce(sum(${dailyReports.value}), 0)` })
    .from(dailyReports)
    .where(eq(dailyReports.assignmentId, assignmentId));

  const total = Number(agg?.total ?? 0);

  const [a] = await db
    .select()
    .from(kpiAssignments)
    .where(eq(kpiAssignments.id, assignmentId))
    .limit(1);

  if (!a) return;

  const monthlyTarget = Number(a.monthlyTarget);
  const wdTotal = a.workingDaysTotal || 1;
  const wdElapsed = a.workingDaysElapsed || 0;

  const expectedTotal =
    wdElapsed > 0 ? (monthlyTarget / wdTotal) * wdElapsed : 0;
  const pacePct = expectedTotal > 0 ? (total / expectedTotal) * 100 : 0;

  await db
    .update(kpiAssignments)
    .set({
      actualTotal: String(total),
      expectedTotal: String(expectedTotal),
      achievementPercentage: pacePct.toFixed(2),
      performanceCategory: getPerformanceCategory(pacePct) as never,
      updatedAt: new Date(),
    })
    .where(eq(kpiAssignments.id, assignmentId));
}

// ─────────────────────────────────────────────────────────────
// KPI SETTINGS (bobot skor per user)
// ─────────────────────────────────────────────────────────────

/** Bobot default kalau user belum punya setelan (sama dengan DEFAULT_KPI_WEIGHTS). */
export const DEFAULT_WEIGHTS = {
  result: 50,
  activity: 30,
  quality: 20,
  leadTim: 50,
  hr: 50,
};

export type KpiSettingsShape = typeof DEFAULT_WEIGHTS;

export async function getUserWeights(userId: string): Promise<KpiSettingsShape> {
  const [row] = await db
    .select()
    .from(kpiSettings)
    .where(eq(kpiSettings.userId, userId))
    .limit(1);

  if (!row) return DEFAULT_WEIGHTS;

  return {
    result: row.resultWeight,
    activity: row.activityWeight,
    quality: row.qualityWeight,
    leadTim: row.leadTimWeight,
    hr: row.hrWeight,
  };
}

/** Semua bobot — untuk dashboard HR/Head/Executive. */
export async function getAllWeights(): Promise<
  Record<string, KpiSettingsShape>
> {
  const rows = await db.select().from(kpiSettings);
  const out: Record<string, KpiSettingsShape> = {};
  for (const r of rows) {
    out[r.userId] = {
      result: r.resultWeight,
      activity: r.activityWeight,
      quality: r.qualityWeight,
      leadTim: r.leadTimWeight,
      hr: r.hrWeight,
    };
  }
  return out;
}

/** Simpan bobot user. */
export async function setUserWeights(
  userId: string,
  weights: Partial<KpiSettingsShape>,
  actorId: string,
): Promise<KpiSettingsShape> {
  const patch = {
    ...(weights.result !== undefined ? { resultWeight: weights.result } : {}),
    ...(weights.activity !== undefined
      ? { activityWeight: weights.activity }
      : {}),
    ...(weights.quality !== undefined
      ? { qualityWeight: weights.quality }
      : {}),
    ...(weights.leadTim !== undefined
      ? { leadTimWeight: weights.leadTim }
      : {}),
    ...(weights.hr !== undefined ? { hrWeight: weights.hr } : {}),
  };

  await db
    .insert(kpiSettings)
    .values({
      userId,
      resultWeight: weights.result ?? DEFAULT_WEIGHTS.result,
      activityWeight: weights.activity ?? DEFAULT_WEIGHTS.activity,
      qualityWeight: weights.quality ?? DEFAULT_WEIGHTS.quality,
      leadTimWeight: weights.leadTim ?? DEFAULT_WEIGHTS.leadTim,
      hrWeight: weights.hr ?? DEFAULT_WEIGHTS.hr,
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: kpiSettings.userId,
      set: { ...patch, updatedBy: actorId, updatedAt: new Date() },
    });

  return getUserWeights(userId);
}