import {
  withAuth,
  requireUser,
  requireKpiRole,
  ValidationError,
  isUuid,
} from "@/server/dal/guards";
import {
  listStaffSettings,
  listActiveStaff,
  upsertStaffSetting,
  listDeductionTypes,
  listAdditionTypes,
  listPayrolls,
  countPayrolls,
  listPublishedPayrollsFor,
  getStaffSetting,
  savePayroll,
  publishPayrolls,
  deletePayroll,
  createAdditionType,
  createDeductionType,
  listFinalizedOvertime,
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
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "payrolls";

    /**
     * `view=mine` — slip gaji milik user yang sedang login.
     *
     *_available untuk semua user yang login_, termasuk staf biasa, karena
     * memang slip mereka sendiri. Yang penting: siapa pun tidak bisa
     * membaca slip orang lain.
     *
     * formerly halaman `/absensi/(staff)/payroll` melakukan
     * `payrolls.select("*").eq("user_id", user.id)` dengan `user.id` dari
     * `AuthContext`. Nilai itu berasal dari state browser — diganti di
     * DevTools, slip gaji rekan terbuka.
     */
    if (view === "mine") {
      const me = await requireUser();
      const [mine, profile] = await Promise.all([
        listPublishedPayrollsFor(me.id),
        getStaffSetting(me.id),
      ]);
      return {
        payrolls: mine,
        setting: profile,
        // Nama dari database, bukan dari `AuthContext`. Dipakai untuk
        // slip cetak -- kalau AuthContext belum selesai memuat, slip
        // akan tercetak dengan "Karyawan" sebagai nama.
        userName: profile?.userName ?? "",
      };
    }

    await requireKpiRole("hr", "executive");

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

    // Pengajuan lembur yang sudah final pada periode ini. Dulu diambil
    // dari browser dengan filter tanggal sendiri — sekarang satu periode
    // yang sama, jadi angka lembur dan slip gaji tidak bisa berbeda
    // karena satu salah hitung bulan.
    const lastDay = new Date(year, month, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    const from = `${year}-${pad(month)}-01`;
    const to = `${year}-${pad(month)}-${pad(lastDay)}`;
    const overtime = await listFinalizedOvertime(from, to);

    return { payrolls, staff, count, overtime, year, month };
  });
}

/**
 * PATCH /api/payroll
 *
 *   action=save     → simpan slip gaji satu orang (upsert)
 *   action=publish  → publikasikan semua draf pada satu periode
 *   action=addition-type / deduction-type → buat jenis baru
 *   (tanpa action)   → pengaturan gaji dasar
 *
 * formerly `payrolls.insert/update(...)` dari browser. Semua komponen
 * gaji dikirim apa adanya dan tidak ada cek role — siapa pun yang punya
 * sesi bisa menulis slip gaji siapa pun.
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("hr", "executive");
    const b = await request.json();

    switch (b.action) {
      case "save":
        return {
          payroll: await savePayroll({
            userId: b.userId,
            year: Number(b.year),
            month: Number(b.month),
            baseSalary: b.baseSalary,
            mobilityAllowance: b.mobilityAllowance,
            performanceBonus: b.performanceBonus,
            overtimePay: b.overtimePay,
            overtimeNotes: b.overtimeNotes,
            overtimeDetail: b.overtimeDetail,
            overtimeRate: b.overtimeRate,
            systemOvertimeMinutes: b.systemOvertimeMinutes,
            payrollOvertimeMinutes: b.payrollOvertimeMinutes,
            systemOvertimeDays: b.systemOvertimeDays,
            additionsDetail: b.additionsDetail,
            deductions: b.deductions,
            deductionsDetail: b.deductionsDetail,
            deductionNotes: b.deductionNotes,
            notes: b.notes,
            snapshotName: b.snapshotName,
            snapshotPosition: b.snapshotPosition,
            snapshotCompany: b.snapshotCompany,
            isPublished: Boolean(b.isPublished),
          }),
        };

      case "publish": {
        const year = Number(b.year);
        const month = Number(b.month);
        if (
          !Number.isInteger(year) || year < 2000 || year > 2100 ||
          !Number.isInteger(month) || month < 1 || month > 12
        ) {
          throw new ValidationError("Periode tidak valid.");
        }
        return publishPayrolls(year, month);
      }

      case "addition-type":
        return { additionType: await createAdditionType(b.name ?? "") };

      case "deduction-type":
        return { deductionType: await createDeductionType(b.name ?? "") };

      default: {
        // Tanpa `action` (atau `action` kosong) → pengaturan gaji dasar.
        // Ini jalur yang dipakai halaman /absensi/admin/payroll/settings.
        //
        // formerly `payroll_staff_settings.upsert(payload, { onConflict:
        // 'user_id' })` **dari browser, tanpa cek role sama sekali**.
        // Siapa pun yang punya sesi — termasuk staf biasa — cukup
        // membuka `/absensi/admin/payroll/settings` lalu mengubah gaji
        // dasar siapa pun. Angka negatif juga diterima.
        if (b.action !== undefined && b.action !== "") {
          return Response.json(
            {
              ok: false,
              error: `Aksi '${b.action}' tidak dikenal. Pilihan: save, publish, addition-type, deduction-type.`,
            },
            { status: 400 },
          );
        }

        return {
          setting: await upsertStaffSetting({
            userId: b.userId,
            contractPosition: b.contractPosition ?? null,
            company: b.company ?? null,
            defaultBaseSalary: b.defaultBaseSalary ?? null,
            defaultMobilityAllowance: b.defaultMobilityAllowance ?? null,
            notes: b.notes ?? null,
          }),
        };
      }
    }
  });
}

/** DELETE /api/payroll — hapus slip gaji yang masih draf. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("hr", "executive");
    const id = new URL(request.url).searchParams.get("id");

    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }
    if (!isUuid(id)) {
      throw new ValidationError("Parameter 'id' bukan id yang valid.");
    }

    return await deletePayroll(id);
  });
}