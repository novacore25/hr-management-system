import { withAuth, requireKpiRole, ValidationError } from "@/server/dal/guards";
import {
  listStaffSettings,
  listActiveStaff,
  upsertStaffSetting,
  listDeductionTypes,
  listAdditionTypes,
  listPayrolls,
  countPayrolls,
} from "@/server/dal/payroll";

export const dynamic = "force-dynamic";

/**
 * GET /api/payroll
 *
 *   view=settings     → daftar pengaturan gaji dasar
 *   view=types        → jenis potongan & tambahan
 *   year=&month=      → slip gaji satu periode
 *
 * Semua butuh role HR/Executive. Slip gaji berisi gaji pokok dan
 * tunjangan setiap orang — bukan data yang boleh dibaca staf biasa.
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("hr", "executive");

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "payrolls";

    if (view === "settings") {
      const [settings, staff] = await Promise.all([
        listStaffSettings(),
        listActiveStaff(),
      ]);
      return { settings, staff };
    }

    if (view === "types") {
      return {
        deductions: await listDeductionTypes(),
        additions: await listAdditionTypes(),
      };
    }

    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);

    if (
      !Number.isInteger(year) || year < 2000 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12
    ) {
      throw new ValidationError("Parameter 'year'/'month' tidak valid.");
    }

    const [payrolls, staff, count] = await Promise.all([
      listPayrolls(year, month),
      listActiveStaff(),
      countPayrolls(year, month),
    ]);

    return { payrolls, staff, count, year, month };
  });
}

/**
 * PATCH /api/payroll — simpan pengaturan gaji dasar satu user.
 *
 * formerly `payroll_staff_settings.upsert(payload, { onConflict: 'user_id' })`
 * **dari browser, tanpa cek role sama sekali**. Siapa pun yang punya sesi
 * — termasuk staf biasa — cukup membuka URL
 * `/absensi/admin/payroll/settings` lalu mengubah gaji dasar siapa pun.
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("hr", "executive");
    const b = await request.json();

    const setting = await upsertStaffSetting({
      userId: b.userId,
      contractPosition: b.contractPosition ?? null,
      company: b.company ?? null,
      defaultBaseSalary: b.defaultBaseSalary ?? null,
      defaultMobilityAllowance: b.defaultMobilityAllowance ?? null,
      notes: b.notes ?? null,
    });

    void actor;
    return { setting };
  });
}