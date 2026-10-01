import "server-only";
import { db } from "@/db";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { kpis, departments, kpiAssignments } from "@/db/schema";
import type { KPI, KpiStatus, KpiType, KpiUnit, KpiPeriod } from "@/types";

type KpiRow = typeof kpis.$inferSelect & { departmentName: string | null };

/**
 * KPI + departmentId internal.
 * Tipe `KPI` yang dipakai UI tidak punya departmentId, tapi DAL
 * butuh id-nya untuk filter divisi.
 */
type KpiInternal = KPI & { departmentId: string | null };

function toKpi(row: KpiRow): KpiInternal {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    type: row.type as KpiType,
    unit: row.unit as KpiUnit,
    period: row.period as KpiPeriod,
    status: row.status as KpiStatus,
    department: row.departmentName ?? "",
    departmentId: row.departmentId,
    createdBy: row.createdBy ?? "",
    monthlyTarget: Number(row.monthlyTarget),
    year: row.year,
    month: row.month,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    hideActual: row.hideActual,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const baseSelect = {
  id: kpis.id,
  title: kpis.title,
  description: kpis.description,
  type: kpis.type,
  unit: kpis.unit,
  period: kpis.period,
  monthlyTarget: kpis.monthlyTarget,
  year: kpis.year,
  month: kpis.month,
  status: kpis.status,
  createdBy: kpis.createdBy,
  departmentId: kpis.departmentId,
  deletedAt: kpis.deletedAt,
  hideActual: kpis.hideActual,
  createdAt: kpis.createdAt,
  updatedAt: kpis.updatedAt,
  departmentName: departments.name,
};

/** KPI pada satu periode (default: yang belum di-trash). */
export async function listKpis(year: number, month: number): Promise<KpiInternal[]> {
  const rows = await db
    .select(baseSelect)
    .from(kpis)
    .leftJoin(departments, eq(kpis.departmentId, departments.id))
    .where(and(eq(kpis.year, year), eq(kpis.month, month), isNull(kpis.deletedAt)))
    .orderBy(desc(kpis.createdAt));

  return rows.map(toKpi);
}

/** KPI termasuk yang di-trash (untuk tab Trash di HR). */
export async function listKpisIncludingTrash(
  year: number,
  month: number,
): Promise<KpiInternal[]> {
  const rows = await db
    .select(baseSelect)
    .from(kpis)
    .leftJoin(departments, eq(kpis.departmentId, departments.id))
    .where(and(eq(kpis.year, year), eq(kpis.month, month)))
    .orderBy(desc(kpis.createdAt));

  return rows.map(toKpi);
}

/** KPI satu divisi. */
export async function listDepartmentKpis(
  deptId: string,
  year: number,
  month: number,
): Promise<KpiInternal[]> {
  const rows = await db
    .select(baseSelect)
    .from(kpis)
    .leftJoin(departments, eq(kpis.departmentId, departments.id))
    .where(
      and(
        eq(kpis.departmentId, deptId),
        eq(kpis.year, year),
        eq(kpis.month, month),
        isNull(kpis.deletedAt),
      ),
    )
    .orderBy(desc(kpis.createdAt));

  return rows.map(toKpi);
}

export async function findKpiById(id: string): Promise<KpiInternal | null> {
  const [row] = await db
    .select(baseSelect)
    .from(kpis)
    .leftJoin(departments, eq(kpis.departmentId, departments.id))
    .where(eq(kpis.id, id))
    .limit(1);
  return row ? toKpi(row as KpiRow) : null;
}

export type NewKpiInput = {
  title: string;
  description?: string | null;
  type: KpiType;
  unit: KpiUnit;
  period: KpiPeriod;
  monthlyTarget: number;
  year: number;
  month: number;
  status: KpiStatus;
  createdBy: string;
  departmentId: string | null;
  hideActual?: boolean;
};

export async function createKpi(input: NewKpiInput): Promise<KpiInternal> {
  const [row] = await db
    .insert(kpis)
    .values({
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      unit: input.unit,
      period: input.period,
      monthlyTarget: String(input.monthlyTarget),
      year: input.year,
      month: input.month,
      status: input.status,
      createdBy: input.createdBy,
      departmentId: input.departmentId,
      hideActual: input.hideActual ?? false,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: kpis.id });

  return (await findKpiById(row.id))!;
}

export async function updateKpi(
  id: string,
  patch: Partial<Omit<NewKpiInput, "createdBy" | "year" | "month">>,
): Promise<KpiInternal | null> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.unit !== undefined) values.unit = patch.unit;
  if (patch.period !== undefined) values.period = patch.period;
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.hideActual !== undefined) values.hideActual = patch.hideActual;
  if (patch.departmentId !== undefined) values.departmentId = patch.departmentId;
  if (patch.monthlyTarget !== undefined) {
    values.monthlyTarget = String(patch.monthlyTarget);
  }

  await db.update(kpis).set(values).where(eq(kpis.id, id));
  return findKpiById(id);
}

/**
 * Soft delete. Mengisi deletedAt, tidak menghapus baris —
 * supaya assignment & laporan lama tetap punya rujukan.
 */
export async function softDeleteKpi(id: string): Promise<void> {
  await db
    .update(kpis)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(kpis.id, id));
}

export async function restoreKpi(id: string): Promise<void> {
  await db
    .update(kpis)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(kpis.id, id));
}

/** Hapus permanen. Hanya untuk KPI yang sudah di-trash. */
export async function hardDeleteKpi(id: string): Promise<void> {
  await db.delete(kpis).where(eq(kpis.id, id));
}

/**
 * Hitung ulang kpis.monthlyTarget = SUM assignment.monthlyTarget
 * (assignment yang tidak cancelled).
 *
 * INVARIAN: target di level KPI = total; di level assignment = per orang.
 */
export async function recalcKpiTarget(kpiId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${kpiAssignments.monthlyTarget}), 0)` })
    .from(kpiAssignments)
    .where(
      and(eq(kpiAssignments.kpiId, kpiId), sql`${kpiAssignments.status} <> 'cancelled'`),
    );

  const total = Number(row?.total ?? 0);
  await db
    .update(kpis)
    .set({ monthlyTarget: String(total), updatedAt: new Date() })
    .where(eq(kpis.id, kpiId));

  return total;
}

/** Duplikasi KPI ke bulan berikutnya (fitur "salin dari bulan lalu"). */
export async function copyKpiToMonth(
  sourceId: string,
  targetYear: number,
  targetMonth: number,
): Promise<KpiInternal | null> {
  const src = await findKpiById(sourceId);
  if (!src) return null;

  return createKpi({
    title: src.title,
    description: src.description,
    type: src.type,
    unit: src.unit,
    period: src.period,
    monthlyTarget: src.monthlyTarget,
    year: targetYear,
    month: targetMonth,
    status: "draft",
    departmentId: src.departmentId,
    hideActual: src.hideActual,
    createdBy: src.createdBy,
  });
}

/** List id KPI per divisi — untuk validasi hak akses Head. */
export async function kpiIdsForDepartment(deptId: string): Promise<string[]> {
  const rows = await db
    .select({ id: kpis.id })
    .from(kpis)
    .where(eq(kpis.departmentId, deptId));
  return rows.map((r) => r.id);
}