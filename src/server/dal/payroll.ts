import "server-only";
import { eq, asc, and, sql } from "drizzle-orm";
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
      additionsDetail: payrolls.additionsDetail,
      systemOvertimeMinutes: payrolls.systemOvertimeMinutes,
      payrollOvertimeMinutes: payrolls.payrollOvertimeMinutes,
      overtimeRate: payrolls.overtimeRate,
      overtimeDetail: payrolls.overtimeDetail,
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