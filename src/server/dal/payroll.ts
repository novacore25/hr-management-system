import "server-only";
import { eq, asc, and, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  payrollStaffSettings,
  payrolls,
  payrollDeductionTypes,
  payrollAdditionTypes,
  users,
  departments,
} from "@/db/schema";
import { ValidationError } from "./guards";
import { listOvertimeRequests } from "./overtime";

/**
 * Gaji adalah data paling sensitif di aplikasi ini.
 *
 * formerly `/absensi/admin/payroll/settings` menulis
 * `payroll_staff_settings.upsert(...)` **langsung dari browser**, tanpa
 * cek role sama sekali. Artinya siapa pun yang punya sesi — termasuk staf
 * biasa — cukup membuka URL itu, lalu mengubah gaji dasar siapa pun.
 *
 * Semua penulisan sekarang lewat sini, dan endpoint-nya mewajibkan
 * role HR/Executive.
 */

export type PayrollCompany = "TNT" | "Hype" | "Nova";

export type StaffSettingRow = {
  id: string;
  userId: string;
  contractPosition: string;
  company: string;
  defaultBaseSalary: string;
  defaultMobilityAllowance: string;
  notes: string;
  userName: string | null;
  userEmail: string | null;
  departmentId: string | null;
  departmentName: string | null;
};

const COMPANY_VALUES: PayrollCompany[] = ["TNT", "Hype", "Nova"];

export async function listStaffSettings(): Promise<StaffSettingRow[]> {
  const rows = await db
    .select({
      id: payrollStaffSettings.id,
      userId: payrollStaffSettings.userId,
      contractPosition: payrollStaffSettings.contractPosition,
      company: payrollStaffSettings.company,
      defaultBaseSalary: payrollStaffSettings.defaultBaseSalary,
      defaultMobilityAllowance: payrollStaffSettings.defaultMobilityAllowance,
      notes: payrollStaffSettings.notes,
      userName: users.name,
      userEmail: users.email,
      departmentId: users.departmentId,
      departmentName: departments.name,
    })
    .from(payrollStaffSettings)
    .innerJoin(users, eq(payrollStaffSettings.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .orderBy(asc(users.name));

  return rows.map((r) => ({
    ...r,
    defaultBaseSalary: String(Number(r.defaultBaseSalary)),
    defaultMobilityAllowance: String(Number(r.defaultMobilityAllowance)),
    notes: r.notes ?? "",
  }));
}

/** Semua user aktif — supaya baris pengaturan bisa dibuat dari nol. */
export async function listActiveStaff() {
  return await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      departmentId: users.departmentId,
      departmentName: departments.name,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.absensiStatus, "active"))
    .orderBy(asc(users.name));
}

export type StaffSettingInput = {
  userId: string;
  contractPosition?: string | null;
  company?: string | null;
  defaultBaseSalary?: number | null;
  defaultMobilityAllowance?: number | null;
  notes?: string | null;
};

export async function upsertStaffSetting(
  input: StaffSettingInput,
): Promise<StaffSettingRow> {
  if (!input.userId) {
    throw new ValidationError("Parameter 'userId' wajib diisi.");
  }

  // Target harus user yang benar-benar ada. Tanpa cek ini, `insert`
  // ditolak foreign key dan jadi 500 "Terjadi kesalahan di server".
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!target) {
    throw new ValidationError("User tidak ditemukan.");
  }

  const salary = Number(input.defaultBaseSalary ?? 0);
  if (!Number.isFinite(salary) || salary < 0) {
    throw new ValidationError(
      "Gaji dasar harus angka dan tidak boleh negatif.",
    );
  }

  const mobility = Number(input.defaultMobilityAllowance ?? 0);
  if (!Number.isFinite(mobility) || mobility < 0) {
    throw new ValidationError(
      "Tunjangan transport harus angka dan tidak boleh negatif.",
    );
  }

  const company = (input.company ?? "Nova") as PayrollCompany;
  if (!COMPANY_VALUES.includes(company)) {
    throw new ValidationError(
      `Perusahaan tidak dikenal: ${input.company}. Pilihan: ${COMPANY_VALUES.join(", ")}.`,
    );
  }

  await db
    .insert(payrollStaffSettings)
    .values({
      userId: input.userId,
      contractPosition: input.contractPosition?.trim() ?? "",
      company,
      defaultBaseSalary: String(salary),
      defaultMobilityAllowance: String(mobility),
      notes: input.notes ?? "",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: payrollStaffSettings.userId,
      set: {
        contractPosition: input.contractPosition?.trim() ?? "",
        company,
        defaultBaseSalary: String(salary),
        defaultMobilityAllowance: String(mobility),
        notes: input.notes ?? "",
        updatedAt: new Date(),
      },
    });

  const all = await listStaffSettings();
  const found = all.find((r) => r.userId === input.userId);
  if (!found) {
    throw new ValidationError("Pengaturan tidak bisa dibaca setelah disimpan.");
  }
  return found;
}

export async function listDeductionTypes() {
  return await db
    .select({
      id: payrollDeductionTypes.id,
      name: payrollDeductionTypes.name,
      isDefault: payrollDeductionTypes.isDefault,
    })
    .from(payrollDeductionTypes)
    .orderBy(asc(payrollDeductionTypes.name));
}

export async function listAdditionTypes() {
  return await db
    .select({
      id: payrollAdditionTypes.id,
      name: payrollAdditionTypes.name,
      isDefault: payrollAdditionTypes.isDefault,
    })
    .from(payrollAdditionTypes)
    .orderBy(asc(payrollAdditionTypes.name));
}

export async function listPayrolls(year: number, month: number) {
  const rows = await db
    .select({
      id: payrolls.id,
      userId: payrolls.userId,
      year: payrolls.year,
      month: payrolls.month,
      baseSalary: payrolls.baseSalary,
      mobilityAllowance: payrolls.mobilityAllowance,
      performanceBonus: payrolls.performanceBonus,
      overtimePay: payrolls.overtimePay,
      deductions: payrolls.deductions,
      deductionsDetail: payrolls.deductionsDetail,
      deductionNotes: payrolls.deductionNotes,
      additionsDetail: payrolls.additionsDetail,
      systemOvertimeMinutes: payrolls.systemOvertimeMinutes,
      payrollOvertimeMinutes: payrolls.payrollOvertimeMinutes,
      systemOvertimeDays: payrolls.systemOvertimeDays,
      overtimeRate: payrolls.overtimeRate,
      overtimeDetail: payrolls.overtimeDetail,
      snapshotName: payrolls.snapshotName,
      snapshotPosition: payrolls.snapshotPosition,
      snapshotCompany: payrolls.snapshotCompany,
      status: payrolls.status,
      notes: payrolls.notes,
      createdAt: payrolls.createdAt,
      updatedAt: payrolls.updatedAt,
      userName: users.name,
      departmentName: departments.name,
    })
    .from(payrolls)
    .innerJoin(users, eq(payrolls.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(and(eq(payrolls.year, year), eq(payrolls.month, month)))
    .orderBy(asc(users.name));

  return rows.map((r) => ({
    ...r,
    baseSalary: String(Number(r.baseSalary)),
    mobilityAllowance: String(Number(r.mobilityAllowance)),
    performanceBonus: String(Number(r.performanceBonus)),
    overtimePay: String(Number(r.overtimePay)),
    deductions: String(Number(r.deductions)),
    deductionNotes: r.deductionNotes ?? "",
    overtimeRate:
      r.overtimeRate === null ? null : String(Number(r.overtimeRate)),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function countPayrolls(year: number, month: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payrolls)
    .where(and(eq(payrolls.year, year), eq(payrolls.month, month)));
  return Number(row?.n ?? 0);
}

/**
 * Slip gaji milik SATU orang — untuk halaman staf.
 *
 * formerly halaman `/absensi/(staff)/payroll` melakukan
 * `payrolls.select("*").eq("user_id", user.id).eq("status", "published")`
 * dengan `user.id` dari `AuthContext`. Nilai itu datang dari state
 * browser — diganti di DevTools, slip gaji rekan terbuka. Gaji adalah
 * data pribadi; ini bukan hal yang boleh bergantung pada CSR.
 *
 * Params: `me.id` dari sesi. Filter `status = 'published'` tetap
 * diterapkan supaya draf HR tidak pernah terlihat staf.
 */
export async function listPublishedPayrollsFor(me: string) {
  const rows = await db
    .select({
      id: payrolls.id,
      userId: payrolls.userId,
      year: payrolls.year,
      month: payrolls.month,
      baseSalary: payrolls.baseSalary,
      mobilityAllowance: payrolls.mobilityAllowance,
      performanceBonus: payrolls.performanceBonus,
      overtimePay: payrolls.overtimePay,
      deductions: payrolls.deductions,
      deductionsDetail: payrolls.deductionsDetail,
      additionsDetail: payrolls.additionsDetail,
      overtimeNotes: payrolls.overtimeNotes,
      overtimeDetail: payrolls.overtimeDetail,
      overtimeRate: payrolls.overtimeRate,
      notes: payrolls.notes,
      status: payrolls.status,
      snapshotName: payrolls.snapshotName,
      snapshotPosition: payrolls.snapshotPosition,
      snapshotCompany: payrolls.snapshotCompany,
      createdAt: payrolls.createdAt,
    })
    .from(payrolls)
    .where(and(eq(payrolls.userId, me), eq(payrolls.status, "published")))
    .orderBy(desc(payrolls.year), desc(payrolls.month));

  return rows.map((r) => ({
    ...r,
    baseSalary: String(Number(r.baseSalary)),
    mobilityAllowance: String(Number(r.mobilityAllowance)),
    performanceBonus: String(Number(r.performanceBonus)),
    overtimePay: String(Number(r.overtimePay)),
    deductions: String(Number(r.deductions)),
    overtimeRate:
      r.overtimeRate === null ? null : String(Number(r.overtimeRate)),
    deductionsDetail: r.deductionsDetail ?? [],
    additionsDetail: r.additionsDetail ?? [],
    overtimeDetail: r.overtimeDetail ?? [],
    overtimeNotes: r.overtimeNotes ?? "",
    notes: r.notes ?? "",
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Pengaturan gaji dasar milik satu orang, plus namanya.
 *
 * Nama ikut dikembalikan karena halaman slip gaji mencantumkan
 * `employeeName` di slip cetak. Dulu itu diambil dari `AuthContext`,
 * jadi yang tampil di slip bisa berbeda dari nama yang tercatat di
 * `users` -- dan kalau `AuthContext` hasn't loaded, slip tercetak
 * dengan "Karyawan" sebagai nama.
 */
export async function getStaffSetting(userId: string) {
  const [row] = await db
    .select({
      userName: users.name,
      userEmail: users.email,
      departmentName: departments.name,
      contractPosition: payrollStaffSettings.contractPosition,
      company: payrollStaffSettings.company,
      defaultBaseSalary: payrollStaffSettings.defaultBaseSalary,
      defaultMobilityAllowance: payrollStaffSettings.defaultMobilityAllowance,
      notes: payrollStaffSettings.notes,
    })
    .from(users)
    .leftJoin(
      payrollStaffSettings,
      eq(payrollStaffSettings.userId, users.id),
    )
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  return {
    userId,
    userName: row.userName,
    userEmail: row.userEmail,
    departmentName: row.departmentName,
    contractPosition: row.contractPosition ?? "",
    company: row.company ?? "Nova",
    defaultBaseSalary: String(Number(row.defaultBaseSalary ?? 0)),
    defaultMobilityAllowance: String(Number(row.defaultMobilityAllowance ?? 0)),
    notes: row.notes ?? "",
  };
}

/**
 * Simpan slip gaji satu orang.
 *
 * formerly `supabase.from("payrolls").insert/update(payload).eq("id", id)`
 * dari browser — tanpa cek role, tanpa validasi angka. Semua komponen
 * gaji (gaji pokok, tunjangan, lembur, potongan) dikirim apa adanya
 * dari klien.
 *
 * Dua hal yang dijaga di sini:
 *
 *   1. **Angka harus masuk akal.** Gaji pokok negatif, atau overtime
 *      negatif, akan membuat slip gaji yang mustahil dijelaskan.
 *   2. **Slip yang sudah `published` tidak boleh diedit diam-diam.**
 *      Staf sudah melihat slip itu. Perubahan harus lewat publish ulang
 *      supaya ada jejaknya.
 *
 * `isPublished=false` berarti "publish ulang": slug-nya sama, tapi
 * status kembali ke `draft` supaya HR bisa menyusulinya.
 */
export type PayrollInput = {
  userId: string;
  year: number;
  month: number;
  baseSalary?: number | null;
  mobilityAllowance?: number | null;
  performanceBonus?: number | null;
  overtimePay?: number | null;
  overtimeNotes?: string | null;
  overtimeDetail?: unknown;
  overtimeRate?: number | null;
  systemOvertimeMinutes?: number | null;
  payrollOvertimeMinutes?: number | null;
  systemOvertimeDays?: number | null;
  additionsDetail?: unknown;
  deductions?: number | null;
  deductionsDetail?: unknown;
  deductionNotes?: string | null;
  notes?: string | null;
  snapshotName?: string | null;
  snapshotPosition?: string | null;
  snapshotCompany?: string | null;
  isPublished?: boolean;
};

const MONEY_FIELDS = [
  "baseSalary",
  "mobilityAllowance",
  "performanceBonus",
  "overtimePay",
  "deductions",
] as const;

const MINUTE_FIELDS = [
  "overtimeRate",
  "systemOvertimeMinutes",
  "payrollOvertimeMinutes",
  "systemOvertimeDays",
] as const;

function money(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new ValidationError("Komponen gaji harus berupa angka.");
  }
  if (n < 0) {
    throw new ValidationError("Komponen gaji tidak boleh negatif.");
  }
  return String(n);
}

function minutes(v: unknown, label: string): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${label} harus angka dan tidak boleh negatif.`);
  }
  return Math.round(n);
}

export async function savePayroll(
  input: PayrollInput,
): Promise<{ id: string; status: string; created: boolean }> {
  if (!input.userId) {
    throw new ValidationError("Parameter 'userId' wajib diisi.");
  }
  if (
    !Number.isInteger(input.year) || input.year < 2000 || input.year > 2100 ||
    !Number.isInteger(input.month) || input.month < 1 || input.month > 12
  ) {
    throw new ValidationError("Periode gaji tidak valid.");
  }

  const values: Record<string, unknown> = {
    userId: input.userId,
    year: input.year,
    month: input.month,
    updatedAt: new Date(),
  };

  for (const key of MONEY_FIELDS) {
    const v = money(input[key]);
    if (v !== undefined) values[key] = v;
  }

  for (const key of MINUTE_FIELDS) {
    const v = minutes(input[key], key);
    if (v !== undefined) values[key] = v;
  }

  for (const key of [
    "overtimeNotes",
    "deductionNotes",
    "notes",
    "overtimeDetail",
    "additionsDetail",
    "deductionsDetail",
    "snapshotName",
    "snapshotPosition",
    "snapshotCompany",
  ] as const) {
    if (input[key] !== undefined) values[key] = input[key];
  }

  const existing = await db
    .select({ id: payrolls.id, status: payrolls.status })
    .from(payrolls)
    .where(
      and(
        eq(payrolls.userId, input.userId),
        eq(payrolls.month, input.month),
        eq(payrolls.year, input.year),
      ),
    )
    .limit(1);

  if (existing.length > 0 && existing[0].status === "published" && !input.isPublished) {
    throw new ValidationError(
      "Slip gaji ini sudah dipublikasikan dan sudah dilihat staf. " +
        "Perubahannya perlu dipublikasikan ulang.",
    );
  }

  values.status = input.isPublished ? "published" : "draft";

  if (existing.length > 0) {
    await db
      .update(payrolls)
      .set(values)
      .where(eq(payrolls.id, existing[0].id));
    return { id: existing[0].id, status: values.status as string, created: false };
  }

  const [row] = await db
    .insert(payrolls)
    .values(values as typeof payrolls.$inferInsert)
    .returning({ id: payrolls.id });

  return { id: row.id, status: values.status as string, created: true };
}

/** Publish semua slip draf pada satu periode. */
export async function publishPayrolls(
  year: number,
  month: number,
): Promise<{ published: number }> {
  const updated = await db
    .update(payrolls)
    .set({ status: "published", updatedAt: new Date() })
    .where(
      and(
        eq(payrolls.year, year),
        eq(payrolls.month, month),
        eq(payrolls.status, "draft"),
      ),
    )
    .returning({ id: payrolls.id });

  return { published: updated.length };
}

/**
 * Hapus slip gaji draf.
 *
 * Slip yang sudah `published` ditolak: staf sudah melihatnya, dan
 * menghapusnya membuat slip yang sama muncul lagi berbeda Jumlah.
 */
export async function deletePayroll(id: string): Promise<{ deleted: boolean }> {
  const [row] = await db
    .select({ id: payrolls.id, status: payrolls.status })
    .from(payrolls)
    .where(eq(payrolls.id, id))
    .limit(1);

  if (!row) {
    throw new ValidationError("Slip gaji tidak ditemukan.");
  }

  if (row.status === "published") {
    throw new ValidationError(
      "Slip gaji yang sudah dipublikasikan tidak bisa dihapus.",
    );
  }

  await db.delete(payrolls).where(eq(payrolls.id, id));
  return { deleted: true };
}

const TYPE_NAME_RE = /^.{1,60}$/;

export async function createAdditionType(name: string) {
  const trimmed = name.trim();
  if (!TYPE_NAME_RE.test(trimmed)) {
    throw new ValidationError(
      "Nama jenis tambahan harus 1-60 karakter.",
    );
  }

  const [row] = await db
    .insert(payrollAdditionTypes)
    .values({ name: trimmed })
    .returning({
      id: payrollAdditionTypes.id,
      name: payrollAdditionTypes.name,
      isDefault: payrollAdditionTypes.isDefault,
    });

  return row;
}

export async function createDeductionType(name: string) {
  const trimmed = name.trim();
  if (!TYPE_NAME_RE.test(trimmed)) {
    throw new ValidationError(
      "Nama jenis potongan harus 1-60 karakter.",
    );
  }

  const [row] = await db
    .insert(payrollDeductionTypes)
    .values({ name: trimmed })
    .returning({
      id: payrollDeductionTypes.id,
      name: payrollDeductionTypes.name,
      isDefault: payrollDeductionTypes.isDefault,
    });

  return row;
}

/** Pengajuan lembur yang sudah `finalized` dalam satu periode. */
export async function listFinalizedOvertime(from: string, to: string) {
  return await listOvertimeRequests(from, to, ["finalized"]);
}