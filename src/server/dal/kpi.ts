import "server-only";
import { db } from "@/db";
import { and, eq, inArray, isNull, isNotNull, desc, sql } from "drizzle-orm";
import { kpis, departments, kpiAssignments, kpiHistories } from "@/db/schema";
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
): Promise<{ kpis: number; cancelledAssignments: number }> {
  const now = new Date();

  // `returning()` supaya hasilnya benar-benar bisa dilaporkan. Tanpa ini
  // fungsi ini hanya mengembalikan jumlah penugasan, dan UI menghitung
  // "berapa KPI yang terpengaruh" dari `?? 0` — sehingga aksi yang
  // sukses dilaporkan sebagai "0 dari 1 KPI dipindahkan".
  const marked = await db
    .update(kpis)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(kpis.id, id), isNull(kpis.deletedAt)))
    .returning({ id: kpis.id });

  const { cancelAssignmentsForKpi } = await import("./assignments");
  const cancelledAssignments = await cancelAssignmentsForKpi(id, actorId ?? "");

  return { kpis: marked.length, cancelledAssignments };
}

/**
 * Kembalikan KPI dari sampah.
 *
 * WAJIB menghidupkan kembali penugasannya. formerly halaman
 * /dashboard/hr/kpi melakukan dua hal: ubah assignment `cancelled` ->
 * `active`, lalu kosongkan `deleted_at`. Versi server awalnya hanya
 * melakukan yang kedua — jadi KPI-nya muncul kembali dengan **nol
 * penugasan**: tidak ada yang bisa mengisinya, dan tidak ada yang bisa
 * melihat bahwa ada yang salah.
 *
 * Hanya assignment yang benar-benar berstatus `cancelled` yang
 * dihidupkan kembali. Assignment `completed` tetap completed — kalau
 * dibalik jadi active, skor KPI yang sudah final ikut berubah.
 */
export async function restoreKpi(
  id: string,
  actorId?: string,
): Promise<{ kpis: number; restoredAssignments: number }> {
  // Sama seperti softDeleteKpi: hanya baris yang benar-benar berubah
  // yang dilaporkan.
  const cleared = await db
    .update(kpis)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(kpis.id, id), isNotNull(kpis.deletedAt)))
    .returning({ id: kpis.id });

  if (cleared.length === 0) return { kpis: 0, restoredAssignments: 0 };

  return {
    kpis: cleared.length,
    restoredAssignments: await restoreCancelledAssignments(id, actorId),
  };
}

/**
 * Hidupkan kembali penugasan yang dibatalkan karena KPI-nya di-trash.
 *
 * Dipisah dari `restoreKpi` supaya operasi massal bisa mengosongkan
 * `deleted_at` sekali untuk semua KPI, baru menghidupkan penugasannya —
 * tanpa melakukan `UPDATE` yang sama dua kali.
 */
async function restoreCancelledAssignments(
  kpiId: string,
  actorId?: string,
): Promise<number> {
  const now = new Date();

  const restored = await db
    .update(kpiAssignments)
    .set({ status: "active", cancelledAt: null, updatedAt: now })
    .where(
      and(eq(kpiAssignments.kpiId, kpiId), eq(kpiAssignments.status, "cancelled")),
    )
    .returning({ id: kpiAssignments.id, userId: kpiAssignments.userId });

  for (const a of restored) {
    await db.insert(kpiHistories).values({
      assignmentId: a.id,
      userId: a.userId,
      action: "status_restored",
      oldValue: { status: "cancelled" },
      newValue: { status: "active", reason: "kpi_restored" },
      triggeredBy: actorId ?? "",
      createdAt: now,
    });
  }

  return restored.length;
}

/**
 * Hapus permanen.
 *
 * Hanya KPI yang SUDAH di-trash boleh dihapus permanen. Tanpa cek ini,
 * satu klik di halaman yang salah akan menghapus KPI beserta seluruh
 * laporan dan riwayat penugasannya — `daily_reports` dan
 * `kpi_assignments` keduanya `ON DELETE CASCADE`.
 *
 * Mengembalikan false kalau KPI-nya tidak ada atau belum di-trash.
 */
export async function hardDeleteKpi(id: string): Promise<boolean> {
  const deleted = await db
    .delete(kpis)
    .where(and(eq(kpis.id, id), isNotNull(kpis.deletedAt)))
    .returning({ id: kpis.id });

  return deleted.length > 0;
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

/**
 * Berapa penugasan aktif dari sekumpulan KPI.
 *
 * formerly dialog konfirmasi hapus di /dashboard/hr/kpi menghitung satu
 * per satu dari browser dengan satu request per KPI. Kalau 20 KPI
 * terpilih, jadi 20 request berjalan beruntun sebelum dialog muncul.
 * Dan kalau salah satunya gagal, jumlahnya tetap dijumlahkan — user
 * melihat angka yang lebih kecil dari kenyataan tanpa ada yang memberitahu.
 */
export async function countActiveAssignmentsForKpis(
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;

  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(kpiAssignments)
    .where(
      and(
        inArray(kpiAssignments.kpiId, ids),
        inArray(kpiAssignments.status, ["active", "hold"]),
      ),
    );

  return Number(row?.n ?? 0);
}

/**
 * Soft delete beberapa KPI sekaligus.
 *
 * formerly browser menjalankan dua update per KPI satu per satu, dalam
 * `for` biasa. Kalau request ke-7 gagal, KPI 1-6 sudah dihapus dan
 * penugasannya sudah dibatalkan, sementara UI masih menampilkan
 * "berhasil dipindahkan ke sampah" untuk semuanya.
 *
 * Sekarang satu operasi, dan hasilnya dilaporkan apa adanya.
 */
export async function softDeleteKpis(
  ids: string[],
  actorId: string,
): Promise<{ kpis: number; cancelledAssignments: number }> {
  // Urutannya penting: tandai dulu, baru batalkan penugasannya.
  //
  // Kalau dibalik — batalkan dulu, baru tandai — maka penghitungan
  // "berapa yang benar-benar terpengaruh" ikut memfilter
  // `deleted_at IS NULL`, dan karena semuanya sudah ditandai di langkah
  // pertama, hasilnya **selalu 0**. Aksi tetap berhasil, tapi UI
  // melaporkan "0 dari 1 KPI dipindahkan" — kebohongan yang persis
  // yang seharusnya dihilangkan.
  const marked = await db
    .update(kpis)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(kpis.id, ids), isNull(kpis.deletedAt)))
    .returning({ id: kpis.id });

  if (marked.length === 0) return { kpis: 0, cancelledAssignments: 0 };

  let cancelledAssignments = 0;
  const { cancelAssignmentsForKpi } = await import("./assignments");
  for (const m of marked) {
    cancelledAssignments += await cancelAssignmentsForKpi(m.id, actorId);
  }

  return { kpis: marked.length, cancelledAssignments };
}

/** Kembalikan beberapa KPI dari sampah sekaligus. */
export async function restoreKpis(
  ids: string[],
  actorId: string,
): Promise<{ kpis: number; restoredAssignments: number }> {
  // Sama seperti softDeleteKpis: kosongkan `deleted_at` dulu supaya
  // hitungan tidak memfilter baris yang barusan dipulihkan.
  const cleared = await db
    .update(kpis)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(inArray(kpis.id, ids), isNotNull(kpis.deletedAt)))
    .returning({ id: kpis.id });

  if (cleared.length === 0) return { kpis: 0, restoredAssignments: 0 };

  let restoredAssignments = 0;
  for (const c of cleared) {
    const r = await restoreCancelledAssignments(c.id, actorId);
    restoredAssignments += r;
  }

  return { kpis: cleared.length, restoredAssignments };
}

/**
 * Hapus permanen beberapa KPI sekaligus.
 *
 * Hanya yang sudah di-trash. Id yang tidak di-trash dilaporkan terpisah
 * supaya UI bisa bilang "3 dihapus, 2 dilewati" alih-alih diam saja.
 */
export async function hardDeleteKpis(
  ids: string[],
): Promise<{ deleted: string[]; skipped: string[] }> {
  const trashed = await db
    .select({ id: kpis.id })
    .from(kpis)
    .where(and(inArray(kpis.id, ids), isNotNull(kpis.deletedAt)));

  const trashedIds = trashed.map((r) => r.id);
  if (trashedIds.length === 0) return { deleted: [], skipped: ids };

  await db.delete(kpis).where(inArray(kpis.id, trashedIds));

  const trashedSet = new Set(trashedIds);
  return {
    deleted: trashedIds,
    skipped: ids.filter((id) => !trashedSet.has(id)),
  };
}

/**
 * Salin semua KPI dari satu bulan ke bulan lain, sebagai Draft.
 *
 * formerly halaman /dashboard/hr/kpi menyalinnya dari browser dengan
 * `supabase.from("kpis").insert(...)`. Yang jadi acuan untuk
 * "sudah ada atau belum" adalah `k.title + "|" + k.department`, tapi
 * baris Supabase tidak punya kolom `department` — yang ada
 * `department_id`. Jadi kuncinya selalu berakhir `"|undefined"` untuk
 * kedua sisi, dan satu-satunya yang dibandingkan adalah judulnya.
 *
 * Duplikasi dengan judul sama tapi divisi berbeda lolos. Sekarang
 * kuncinya benar-benar (judul, divisi), dan yang terlewat dikembalikan
 * supaya UI bisa menyebutkannya — bukan diam-diam tidak disalin.
 */
export async function copyKpisFromMonth(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
  actorId: string,
): Promise<{ copied: number; skipped: number }> {
  const sources = await db
    .select(baseSelect)
    .from(kpis)
    .leftJoin(departments, eq(kpis.departmentId, departments.id))
    .where(
      and(
        eq(kpis.year, fromYear),
        eq(kpis.month, fromMonth),
        isNull(kpis.deletedAt),
      ),
    );

  if (sources.length === 0) return { copied: 0, skipped: 0 };

  const existing = await db
    .select({
      title: kpis.title,
      departmentId: kpis.departmentId,
    })
    .from(kpis)
    .where(
      and(
        eq(kpis.year, toYear),
        eq(kpis.month, toMonth),
        isNull(kpis.deletedAt),
      ),
    );

  const key = (t: string, d: string | null) => `${t.trim()} ${d ?? ""}`;
  const taken = new Set(existing.map((e) => key(e.title, e.departmentId)));

  const toInsert = sources.filter((s) => {
    const k = key(s.title, s.departmentId);
    if (taken.has(k)) return false;
    taken.add(k);
    return true;
  });

  if (toInsert.length === 0) return { copied: 0, skipped: sources.length };

  await db.insert(kpis).values(
    toInsert.map((s) => ({
      title: s.title,
      description: s.description,
      type: s.type as KpiType,
      unit: s.unit as KpiUnit,
      period: (s.period ?? "monthly") as KpiPeriod,
      monthlyTarget: s.monthlyTarget,
      year: toYear,
      month: toMonth,
      status: "draft" as const,
      departmentId: s.departmentId,
      brand: s.brand ?? "",
      hideActual: s.hideActual,
      createdBy: actorId,
    })),
  );

  return { copied: toInsert.length, skipped: sources.length - toInsert.length };
}