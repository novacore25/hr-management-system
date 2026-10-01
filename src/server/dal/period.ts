import "server-only";
import { db } from "@/db";
import { and, eq, inArray, desc, sql, gte, lte } from "drizzle-orm";
import {
  kpiAssignments,
  kpis,
  users,
  departments,
  dailyReports,
  monthlyScores,
} from "@/db/schema";
import { getPerformanceCategory } from "@/lib/performance";
import type {
  KpiAssignmentWithDetails,
  KPI,
  QualityMonthScore,
  AssignmentStatus,
} from "@/types";

/**
 * Query assignment berdasarkan periode (bulan tunggal atau rentang).
 *
 * Semua perhitungan rentang (rekap actual, pace rate, quality score)
 * dilakukan DI SERVER — bukan lagi di browser seperti versi lama.
 * Ini menghilangkan bug "selalu 0%" di mode range.
 */

type Row = typeof kpiAssignments.$inferSelect & {
  kpiTitle: string | null;
  kpiDescription: string | null;
  kpiUnit: string | null;
  kpiPeriod: string | null;
  kpiHideActual: boolean | null;
  userName: string | null;
  userPhoto: string | null;
  userKpiRole: string | null;
  departmentName: string | null;
};

const select = {
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
  kpiHideActual: kpis.hideActual,
  userName: users.name,
  userPhoto: users.photoUrl,
  userKpiRole: users.kpiRole,
  departmentName: departments.name,
};

function toAssignment(row: Row, scores: Record<string, QualityMonthScore>) {
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
    ),
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

async function loadScores(
  ids: string[],
): Promise<Record<string, Record<string, QualityMonthScore>>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select()
    .from(monthlyScores)
    .where(inArray(monthlyScores.assignmentId, ids));

  const out: Record<string, Record<string, QualityMonthScore>> = {};
  for (const r of rows) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    (out[r.assignmentId] ??= {})[key] = {
      actualTotal: Number(r.actualTotal),
      achievementPercentage: Number(r.achievementPercentage),
      performanceCategory: getPerformanceCategory(Number(r.achievementPercentage)),
      qualityNotes: r.notes ?? "",
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  return out;
}

/** Rekap nilai harian per assignment dalam rentang tanggal. */
async function rekapFromReports(
  assignmentIds: string[],
  from: string,
  to: string,
): Promise<Record<string, number>> {
  if (assignmentIds.length === 0) return {};

  const rows = await db
    .select({
      assignmentId: dailyReports.assignmentId,
      total: dailyReports.value,
    })
    .from(dailyReports)
    .where(
      and(
        inArray(dailyReports.assignmentId, assignmentIds),
        gte(dailyReports.date, from),
        lte(dailyReports.date, to),
      ),
    );

  const sums: Record<string, number> = {};
  for (const r of rows) {
    sums[r.assignmentId] = (sums[r.assignmentId] ?? 0) + Number(r.total ?? 0);
  }
  return sums;
}

export type PeriodQuery =
  | { type: "month"; year: number; month: number }
  | { type: "range"; from: string; to: string };

export type PeriodResult = {
  assignments: KpiAssignmentWithDetails[];
  kpisMap: Record<string, KPI>;
};

export async function getAssignmentsForPeriod(params: {
  period: PeriodQuery;
  departmentIds?: string[];
  statuses?: AssignmentStatus[];
}): Promise<PeriodResult> {
  const { period, departmentIds, statuses } = params;

  const conds = [];
  if (departmentIds?.length) {
    conds.push(inArray(kpiAssignments.departmentId, departmentIds));
  }
  conds.push(
    period.type === "month"
      ? inArray(kpiAssignments.status, statuses ?? ["active"])
      : inArray(kpiAssignments.status, statuses ?? [
          "active",
          "completed",
          "hold",
        ]),
  );

  let rows: Row[];

  if (period.type === "month") {
    conds.push(
      eq(kpiAssignments.year, period.year),
      eq(kpiAssignments.month, period.month),
    );
    rows = (await db
      .select(select)
      .from(kpiAssignments)
      .innerJoin(kpis, eq(kpiAssignments.kpiId, kpis.id))
      .innerJoin(users, eq(kpiAssignments.userId, users.id))
      .leftJoin(departments, eq(kpiAssignments.departmentId, departments.id))
      .where(and(...conds))
      .orderBy(desc(kpiAssignments.createdAt))) as Row[];
  } else {
    const fromParts = period.from.split("-").map(Number);
    const toParts = period.to.split("-").map(Number);
    conds.push(
      // Dari >= awal bulan 'from' sampai <= akhir bulan 'to'
      sqlRange(fromParts[0], fromParts[1], toParts[0], toParts[1]),
    );
    rows = (await db
      .select(select)
      .from(kpiAssignments)
      .innerJoin(kpis, eq(kpiAssignments.kpiId, kpis.id))
      .innerJoin(users, eq(kpiAssignments.userId, users.id))
      .leftJoin(departments, eq(kpiAssignments.departmentId, departments.id))
      .where(and(...conds))
      .orderBy(desc(kpiAssignments.year), desc(kpiAssignments.month))) as Row[];
  }

  const scores = await loadScores(rows.map((r) => r.id));
  let assignments = rows.map((r) => toAssignment(r, scores[r.id] ?? {}));

  // ── Rekap mode rentang ──────────────────────────────────────
  //versi lama melakukan ini di browser, tapi hanya untuk sebagian
  // halaman (4 halaman punya array reports kosong) sehingga
  // dashboard selalu menampilkan 0%. Sekarang seragam di server.
  if (period.type === "range") {
    const sums = await rekapFromReports(
      assignments.map((a) => a.id),
      period.from,
      period.to,
    );

    const [fy, fm] = period.from.split("-").map(Number);
    const [ty, tm] = period.to.split("-").map(Number);
    const endScoreKey = `${ty}-${String(tm).padStart(2, "0")}`;

    assignments = assignments.map((a) => {
      const ms = (a.monthlyScores as Record<string, QualityMonthScore>)?.[
        endScoreKey
      ];

      // KPI quality: pakai skor bulan akhir
      if (a.kpiType === "quality" && ms) {
        return {
          ...a,
          actualTotal: ms.actualTotal,
          achievementPercentage: ms.achievementPercentage,
          performanceCategory: ms.performanceCategory,
          qualityNotes: ms.qualityNotes ?? "",
        };
      }

      // KPI lain: jumlahkan laporan harian dalam rentang
      const actual = sums[a.id] ?? 0;
      const pct =
        a.monthlyTarget > 0 ? (actual / a.monthlyTarget) * 100 : 0;

      return {
        ...a,
        actualTotal: actual,
        // Mode rentang memakai COMPLETION RATE (bukan pace),
        // karena user melihat total periode terpilih.
        achievementPercentage: pct,
        performanceCategory: getPerformanceCategory(pct),
      } as KpiAssignmentWithDetails;
    });
  } else if (period.type === "month") {
    const key = `${period.year}-${String(period.month).padStart(2, "0")}`;
    assignments = assignments.map((a) => {
      if (a.kpiType !== "quality") return a;
      const ms = (a.monthlyScores as Record<string, QualityMonthScore>)?.[key];
      if (!ms) return a;
      return {
        ...a,
        actualTotal: ms.actualTotal,
        achievementPercentage: ms.achievementPercentage,
        performanceCategory: ms.performanceCategory,
        qualityNotes: ms.qualityNotes ?? "",
      } as KpiAssignmentWithDetails;
    });
  }

  // Peta KPI untuk tampilan
  const kpisMap: Record<string, KPI> = {};
  for (const a of assignments) {
    if (a.kpi) kpisMap[a.kpiId] = a.kpi;
  }

  return { assignments, kpisMap };
}

function sqlRange(fy: number, fm: number, ty: number, tm: number) {
  return sql`(${kpiAssignments.year} > ${fy}
       OR (${kpiAssignments.year} = ${fy} AND ${kpiAssignments.month} >= ${fm}))
    AND (${kpiAssignments.year} < ${ty}
       OR (${kpiAssignments.year} = ${ty} AND ${kpiAssignments.month} <= ${tm}))`;
}
