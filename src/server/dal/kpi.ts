import "server-only";
import { db } from "@/db";
import { and, eq, inArray, isNull, desc, sql } from "drizzle-orm";
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
    brand: row.brand ?? undefined,
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
  // Ditambahkan migrasi 0011. Halaman executive/quality sudah merender
  // label brand sejak lama; tanpa kolom ini badge-nya tidak pernah muncul.
  brand: kpis.brand,
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

/**
 * KPI milik divisi yang dikelola Head.
 *
 * `managedDepartmentIds` SELALU dari `users.managed_departments` di server.
 * formerly halaman /dashboard/head/kpi-setup menyaring sendiri di browser
 * dengan `managedDepartments.includes(k.department)` — managedDepartments
 * berisi id divisi sedangkan `k.department` berisi NAMA, jadi perbandingan
 * itu tidak pernah cocok dan halaman selalu kosong.
 *
 * `null` berarti semua divisi (untuk HR/Executive/Developer).
 */
export async function listManagedKpis(
  managedDepartmentIds: string[] | null,
  year: number,
  month: number,
): Promise<KpiInternal[]> {
  if (managedDepartmentIds && managedDepartmentIds.length === 0) return [];

  const conds = [
    eq(kpis.year, year),
    eq(kpis.month, month),
    isNull(kpis.deletedAt),
  ];

  if (managedDepartmentIds) {
    conds.push(inArray(kpis.departmentId, managedDepartmentIds));
  }

  const rows = await db
    .select(baseSelect)
    .from(kpis)
    .leftJoin(departments, eq(kpis.departmentId, departments.id))
    .where(and(...conds))
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
  /** Brand / sub-divisi (TNT, Iswhite, Syb, ...). Nullable. */
  brand?: string | null;
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
      brand: input.brand ?? null,
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
  if (patch.brand !== undefined) values.brand = patch.brand;
  if (patch.monthlyTarget !== undefined) {
    values.monthlyTarget = String(patch.monthlyTarget);
  }

  await db.update(kpis).set(values).where(eq(kpis.id, id));
  return findKpiById(id);
}

/**
 * Siapa boleh mengubah KPI ini.
 *
 * Divisi dibaca dari baris `kpis` + `users.managed_departments` di server.
 * formerly halaman /dashboard/head/kpi-setup menulis `kpis` langsung dari
 * browser — cukup mengubah `id`, Head bisa mengubah status atau menghapus
 * KPI divisi orang lain tanpa cek apa pun.
 *
 * KPI tanpa divisi (department_id NULL) sengaja ditolak untuk Head: tidak
 * ada cara memastikan itu miliknya.
 */
export async function assertCanManageKpi(
  kpiId: string,
  actor: { id: string; kpiRole: string; managedDepartments: string[] },
): Promise<
  { ok: true; departmentId: string | null } | { ok: false; error: string }
> {
  const [row] = await db
    .select({ departmentId: kpis.departmentId, createdBy: kpis.createdBy })
    .from(kpis)
    .where(eq(kpis.id, kpiId))
    .limit(1);

  if (!row) {
    return { ok: false, error: "KPI tidak ditemukan." };
  }

  // Pembuat KPI boleh mengelola KPI-nya sendiri.
  if (row.createdBy === actor.id) {
    return { ok: true, departmentId: row.departmentId };
  }

  if (!row.departmentId) {
    return {
      ok: false,
      error:
        "KPI ini tidak punya divisi, jadi tidak bisa dikelola dari halaman tim.",
    };
  }

  if (!actor.managedDepartments.includes(row.departmentId)) {
    return {
      ok: false,
      error: "KPI ini di luar divisi yang Anda kelola.",
    };
  }

  return { ok: true, departmentId: row.departmentId };
}

/**
 * Soft delete. Mengisi deletedAt, tidak menghapus baris —
 * supaya assignment & laporan lama tetap punya rujukan.
 *
 * Assignment aktif ikut dibatalkan dalam operasi yang sama.
 *
 * formerly halaman /dashboard/head/kpi-setup melakukan dua update dari
 * browser tanpa memeriksa hasilnya: cancel assignment dulu, baru set
 * `deleted_at`. Kalau langkah pertama gagal, KPI terhapus tapi
 * penugasannya tetap aktif — dan karena KPI-nya tidak tampil lagi, orang
 * tidak pernah tahu penugasan yatim itu ada.
 */
export async function softDeleteKpi(
  id: string,
  actorId?: string,
): Promise<{ cancelledAssignments: number }> {
  const now = new Date();

  const { cancelAssignmentsForKpi } = await import("./assignments");
  const cancelledAssignments = await cancelAssignmentsForKpi(id, actorId ?? "");

  await db
    .update(kpis)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(kpis.id, id));

  return { cancelledAssignments };
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