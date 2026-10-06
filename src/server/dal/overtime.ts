import "server-only";
import { and, eq, gte, lte, desc, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  overtimeRequests,
  payrollStaffSettings,
  users,
  departments,
  holidays,
} from "@/db/schema";
import { ValidationError, ForbiddenError } from "./guards";
import {
  calcDurationMinutes,
  calculateOvertimeRates,
  calculateOvertimePayDepnaker,
  isWeekend,
} from "@/lib/overtimeHelpers";

/**
 * Pengajuan lembur punya empat tahap, dan DULUHANYA keempatnya ditulis
 * dari browser dengan `supabase.from("overtime_requests").update(...)`
 * — tanpa cek siapa yang boleh, dan tanpa cek stage-nya.
 *
 *   1. pending   → staf mengajukan
 *   2. approved  → HR menyetujui jadwal (atau rejected)
 *   3. reported  → staf melaporkan waktu aktual
 *   4. finalized → HR memfinalisasi & menghitung gaji
 *
 * transitioned di DAL supaya tidak bisa dilompati dari request biasa:
 * HobbySkatingUA meng-approve request yang sudah `finalized`, atau
 * menimpa `total_overtime_pay` yang sudah dibayar.
 */

/**
 * Batas durasi pengajuan: TIDAK ADA.
 *
 * formerly ada `MAX_MINUTES_WEEKDAY = 240` dan
 * `MAX_MINUTES_HOLIDAY = 720`, dengan pesan "Durasi maksimal lembur
 * untuk hari kerja adalah 4 jam".
 *
 * Dua alasan dihapus, keduanya dari data produksi:
 *
 * 1. **Plafon itu sudah melanggar datanya sendiri.** Dua dari empat
 *    pengajuan yang ada -- 295 dan 308 menit -- sudah melewati 4 jam,
 *    tetap disetujui, dan tetap dibayar. Jadi batas 4 jam bukan aturan
 *    yang berlaku; hanya sisa form yang belum diubah.
 * 2. **Plafon hanya ditegakkan saat pengajuan dibuat**, bukan saat
 *    HR menyetujui. Jadi HR bebas menyetujui lebih dari plafon --
 *    persis yang terjadi di data. Batas yang hanya berlaku di satu
 *    jalur bukan batas, hanya hambatan yang bisa dilewati.
 *
 * Durasi tetap divalidasi: jam selesai harus setelah jam mulai (dengan
 * jam berikutnya bila lewat tengah malam), dan laporan aktual tetap
 * tidak boleh melebihi yang disetujui -- itu yang melindungi
 * perhitungan gaji.
 */

export type OvertimeStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "reported"
  | "finalized"
  | "cancelled";

const TRANSITIONS: Record<string, string[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["reported", "rejected", "cancelled"],
  reported: ["finalized"],
  rejected: [],
  finalized: [],
  cancelled: [],
};

/** Urutan tahap untuk UI. */
export const STAGE_OF: Record<string, 1 | 2 | 3 | 4> = {
  pending: 1,
  approved: 2,
  rejected: 2,
  reported: 3,
  finalized: 4,
  cancelled: 1,
};

export function assertTransition(from: string, to: string): void {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ValidationError(
      `Pengajuan yang sudah berstatus "${from}" tidak bisa diubah jadi "${to}".` +
        (allowed.length > 0
          ? ` Yang bisa: ${allowed.join(", ")}.`
          : " Pengajuan ini sudah final."),
    );
  }
}

type Row = typeof overtimeRequests.$inferSelect & {
  userName: string | null;
  userPosition: string | null;
  departmentName: string | null;
};

const select = {
  id: overtimeRequests.id,
  userId: overtimeRequests.userId,
  requestDate: overtimeRequests.requestDate,
  overtimeDate: overtimeRequests.overtimeDate,
  requestedStartTime: overtimeRequests.requestedStartTime,
  requestedEndTime: overtimeRequests.requestedEndTime,
  requestedDurationMinutes: overtimeRequests.requestedDurationMinutes,
  tasks: overtimeRequests.tasks,
  staffNotes: overtimeRequests.staffNotes,
  status: overtimeRequests.status,
  approvedStartTime: overtimeRequests.approvedStartTime,
  approvedEndTime: overtimeRequests.approvedEndTime,
  approvedDurationMinutes: overtimeRequests.approvedDurationMinutes,
  approvedBy: overtimeRequests.approvedBy,
  approvalDate: overtimeRequests.approvalDate,
  approvalNotes: overtimeRequests.approvalNotes,
  rejectionReason: overtimeRequests.rejectionReason,
  actualStartTime: overtimeRequests.actualStartTime,
  actualEndTime: overtimeRequests.actualEndTime,
  actualDurationMinutes: overtimeRequests.actualDurationMinutes,
  reportSubmittedAt: overtimeRequests.reportSubmittedAt,
  taskReports: overtimeRequests.taskReports,
  staffReportNotes: overtimeRequests.staffReportNotes,
  proofImages: overtimeRequests.proofImages,
  finalDurationMinutes: overtimeRequests.finalDurationMinutes,
  finalizedBy: overtimeRequests.finalizedBy,
  finalizedDate: overtimeRequests.finalizedDate,
  finalNotes: overtimeRequests.finalNotes,
  isHoliday: overtimeRequests.isHoliday,
  dayType: overtimeRequests.dayType,
  hourlyBaseRate: overtimeRequests.hourlyBaseRate,
  totalOvertimePay: overtimeRequests.totalOvertimePay,
  calculationBreakdown: overtimeRequests.calculationBreakdown,
  // Warisan dari aplikasi lama (migrasi 0014). TIDAK dipakai untuk
  // menghitung -- tarif dihitung server dari `hourlyBaseRate` dan
  // `payroll_staff_settings`, supaya tidak bisa dipalsukan dari browser.
  // Hanya disimpan supaya riwayat lama ikut termigrasi.
  firstHourRate: overtimeRequests.firstHourRate,
  firstHourPay: overtimeRequests.firstHourPay,
  subsequentHourRate: overtimeRequests.subsequentHourRate,
  subsequentHourPay: overtimeRequests.subsequentHourPay,
  createdAt: overtimeRequests.createdAt,
  updatedAt: overtimeRequests.updatedAt,
  userName: users.name,
  userPosition: sql<string | null>`nullif(${users.position}, '')`,
  departmentName: departments.name,
};

export type OvertimeWithUser = Omit<Row, "createdAt" | "updatedAt" | "approvalDate" | "reportSubmittedAt"> & {
  createdAt: string;
  updatedAt: string;
  approvalDate: string | null;
  reportSubmittedAt: string | null;
};

function toOvertime(row: Row): OvertimeWithUser {
  return {
    ...row,
    requestedStartTime: row.requestedStartTime,
    proofImages: row.proofImages ?? [],
    // Kolomnya `numeric` — drizzle mengembalikannya sebagai string.
    hourlyBaseRate: String(Number(row.hourlyBaseRate)),
    totalOvertimePay: String(Number(row.totalOvertimePay)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    approvalDate: row.approvalDate ? row.approvalDate.toISOString() : null,
    reportSubmittedAt: row.reportSubmittedAt
      ? row.reportSubmittedAt.toISOString()
      : null,
  };
}

/** Semua pengajuan dalam rentang tanggal — untuk halaman admin. */
export async function listOvertimeRequests(
  from: string,
  to: string,
  statuses?: string[],
): Promise<OvertimeWithUser[]> {
  const rows = await db
    .select(select)
    .from(overtimeRequests)
    .leftJoin(users, eq(overtimeRequests.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(
      and(
        gte(overtimeRequests.overtimeDate, from),
        lte(overtimeRequests.overtimeDate, to),
        ...(statuses && statuses.length > 0
          ? [inArray(overtimeRequests.status, statuses)]
          : []),
      ),
    )
    .orderBy(desc(overtimeRequests.overtimeDate), desc(overtimeRequests.createdAt));

  return rows.map(toOvertime);
}

/** Pengajuan milik satu user — untuk halaman staf. */
export async function listOvertimeForUser(
  userId: string,
): Promise<OvertimeWithUser[]> {
  const rows = await db
    .select(select)
    .from(overtimeRequests)
    .leftJoin(users, eq(overtimeRequests.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(overtimeRequests.userId, userId))
    .orderBy(desc(overtimeRequests.createdAt));

  return rows.map(toOvertime);
}

export async function findOvertimeById(
  id: string,
): Promise<OvertimeWithUser | null> {
  const [row] = await db
    .select(select)
    .from(overtimeRequests)
    .leftJoin(users, eq(overtimeRequests.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(overtimeRequests.id, id))
    .limit(1);

  return row ? toOvertime(row) : null;
}

/** Hari libur yang terdaftar — menentukan plafon durasi. */
async function isHolidayDate(date: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(holidays)
    .where(sql`${holidays.date} = ${date}`);
  return Number(row?.n ?? 0) > 0;
}

/**
 * Buat pengajuan lembur.
 *
 * formerly `overtime_requests.insert({...})` dari browser, dengan
 * validasi hanya di form: durasi maksimum dan tanggal tidak boleh
 * di masa lalu. Keduanya bisa dilewati dengan satu request biasa.
 *
 * Sekarang tanggal divalidasi di server. Batas durasi SENGAJA tidak
 * ada -- lihat catatan panjang di blok yang menggantikan
 * `MAX_MINUTES_WEEKDAY`. Ringkasnya: batas 4 jam sudah dilanggar dua
 * dari empat pengajuan yang ada di produksi dan tetap dibayar, jadi
 * menegakkan batas itu hanya akan menolak pengajuan yang sah.
 */
export async function createOvertimeRequest(
  input: {
    overtimeDate: string;
    startTime: string;
    endTime: string;
    tasks?: Array<{ name: string; detail?: string }>;
    staffNotes?: string | null;
  },
  actorId: string,
): Promise<OvertimeWithUser> {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (!DATE_RE.test(input.overtimeDate)) {
    throw new ValidationError("Tanggal lembur harus format YYYY-MM-DD.");
  }
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) {
    throw new ValidationError("Jam harus format HH:MM (24 jam).");
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (input.overtimeDate < todayStr) {
    throw new ValidationError(
      `Tanggal lembur ${input.overtimeDate} sudah lewat. Pengajuan hanya bisa untuk hari ini atau hari berikutnya.`,
    );
  }

  const duration = calcDurationMinutes(input.startTime, input.endTime);
  if (duration <= 0) {
    throw new ValidationError("Jam selesai harus setelah jam mulai.");
  }

  // Validasi tugas DI SINI, karena cek di form bisa dilewati dengan
  // satu request biasa.
  //
  // formerly ini hanya ada di OvertimeStaffSection.tsx. Jadi POST
  // dengan tasks kosong berhasil, dan tersimpan pengajuan tanpa
  // rencana kerja sama sekali -- lalu menunggu persetujuan HR padahal
  // tidak ada yang perlu disetujui. AGENTS.md 2.4: validasi harus di
  // server.
  const tugasValid = (input.tasks ?? []).filter(
    (t) => typeof t?.name === "string" && t.name.trim() !== "",
  );
  if (tugasValid.length === 0) {
    throw new ValidationError(
      "Isi minimal 1 rencana tugas lembur.",
    );
  }

  const holiday = (await isHolidayDate(input.overtimeDate)) || isWeekend(input.overtimeDate);

  // formerly di sini ada cek `duration > max` dengan batas 4 jam (hari
  // kerja) dan 12 jam (hari libur). Dihapus: dua dari empat pengajuan
  // yang sudah ada di produksi melewati 4 jam dan tetap dibayar, jadi
  // batas itu tidak pernah berlaku -- hanya ditegakkan di jalur ini
  // saja. Lihat catatan di MAX_MINUTES_WEEKDAY yang sudah dihapus.
  //
  // Yang TETAP dijaga: durasi harus lebih dari 0, dan laporan aktual
  // tidak boleh melebihi yang disetujui.

  const [row] = await db
    .insert(overtimeRequests)
    .values({
      userId: actorId,
      requestDate: todayStr,
      overtimeDate: input.overtimeDate,
      requestedStartTime: input.startTime,
      requestedEndTime: input.endTime,
      requestedDurationMinutes: duration,
      tasks: tugasValid,
      staffNotes: input.staffNotes ?? null,
      status: "pending",
      isHoliday: holiday,
      dayType: holiday ? "holiday" : "weekday",
    })
    .returning({ id: overtimeRequests.id });

  return (await findOvertimeById(row.id))!;
}

/**
 * HR menyetujui jadwal, atau mengubahnya.
 *
 * formerly `update({ status: "approved", approved_* }).eq("id", id)`
 * dari browser. Tidak ada cek status lama, jadi approve bisa dijalankan
 * ulang pada pengajuan yang sudah `finalized` — dan menimpa hasil
 * finalisasi yang sudah dibayar.
 */
export async function approveOvertime(
  id: string,
  input: {
    approvedStartTime: string;
    approvedEndTime: string;
    approvalNotes?: string | null;
  },
  actorId: string,
): Promise<OvertimeWithUser> {
  const current = await findOvertimeById(id);
  if (!current) {
    throw new ValidationError("Pengajuan tidak ditemukan.");
  }

  assertTransition(current.status, "approved");

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    !TIME_RE.test(input.approvedStartTime) ||
    !TIME_RE.test(input.approvedEndTime)
  ) {
    throw new ValidationError("Jam harus format HH:MM (24 jam).");
  }

  const duration = calcDurationMinutes(
    input.approvedStartTime,
    input.approvedEndTime,
  );
  if (duration <= 0) {
    throw new ValidationError("Jam selesai harus setelah jam mulai.");
  }

  await db
    .update(overtimeRequests)
    .set({
      status: "approved",
      approvedStartTime: input.approvedStartTime,
      approvedEndTime: input.approvedEndTime,
      approvedDurationMinutes: duration,
      approvedBy: actorId,
      approvalDate: new Date(),
      approvalNotes: input.approvalNotes ?? null,
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(overtimeRequests.id, id));

  return (await findOvertimeById(id))!;
}

/** HR menolak pengajuan. */
export async function rejectOvertime(
  id: string,
  reason: string,
  actorId: string,
): Promise<OvertimeWithUser> {
  const current = await findOvertimeById(id);
  if (!current) {
    throw new ValidationError("Pengajuan tidak ditemukan.");
  }

  assertTransition(current.status, "rejected");

  if (!reason?.trim()) {
    throw new ValidationError("Alasan penolakan wajib diisi.");
  }

  await db
    .update(overtimeRequests)
    .set({
      status: "rejected",
      approvedBy: actorId,
      approvalDate: new Date(),
      rejectionReason: reason.trim(),
      updatedAt: new Date(),
    })
    .where(eq(overtimeRequests.id, id));

  return (await findOvertimeById(id))!;
}

/**
 * Staf melaporkan waktu aktual.
 *
 * formerly `update({ status: "reported", actual_* }).eq("id", id)` dari
 * browser. Tidak ada cek pemilik maupun status — staf bisa melaporkan
 * atas nama orang lain dengan menebak id.
 */
export async function submitOvertimeReport(
  id: string,
  input: {
    actualStartTime: string;
    actualEndTime: string;
    taskReports?: Array<{ name: string; detail?: string }>;
    staffReportNotes?: string | null;
    proofImages?: string[];
  },
  actorId: string,
): Promise<OvertimeWithUser> {
  const current = await findOvertimeById(id);
  if (!current) {
    throw new ValidationError("Pengajuan tidak ditemukan.");
  }

  if (current.userId !== actorId) {
    throw new ForbiddenError("Anda hanya bisa melaporkan lembur Anda sendiri.");
  }

  assertTransition(current.status, "reported");

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    !TIME_RE.test(input.actualStartTime) ||
    !TIME_RE.test(input.actualEndTime)
  ) {
    throw new ValidationError("Jam harus format HH:MM (24 jam).");
  }

  const duration = calcDurationMinutes(
    input.actualStartTime,
    input.actualEndTime,
  );
  if (duration <= 0) {
    throw new ValidationError("Jam selesai harus setelah jam mulai.");
  }

  // Durasi aktual tidak boleh melebihi yang disetujui. Tanpa cek ini,
  // staf bisa melaporkan 10 jam padahal HR menyetujui 4 — dan angkanya
  // jadi dasar perhitungan gaji.
  const approved = current.approvedDurationMinutes ?? 0;
  if (approved > 0 && duration > approved) {
    throw new ValidationError(
      `Durasi aktual ${duration / 60} jam melebihi yang disetujui (${
        approved / 60
      } jam). Ajukan perubahan jadwal dulu kalau memang perlu lebih lama.`,
    );
  }

  await db
    .update(overtimeRequests)
    .set({
      status: "reported",
      actualStartTime: input.actualStartTime,
      actualEndTime: input.actualEndTime,
      actualDurationMinutes: duration,
      reportSubmittedAt: new Date(),
      taskReports: input.taskReports ?? [],
      staffReportNotes: input.staffReportNotes ?? null,
      proofImages: input.proofImages ?? [],
      updatedAt: new Date(),
    })
    .where(eq(overtimeRequests.id, id));

  return (await findOvertimeById(id))!;
}

/** Gaji dasar dari `payroll_staff_settings` milik user tersebut. */
export async function getBaseSalary(
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({
      salary: payrollStaffSettings.defaultBaseSalary,
    })
    .from(payrollStaffSettings)
    .where(eq(payrollStaffSettings.userId, userId))
    .limit(1);

  return Number(row?.salary ?? 0);
}

/**
 * Kunci durasi akhir, tanpa menghitung gaji.
 *
 * Ini TAHAP PERSIAPAN, bukan finalisasi. formerly halaman
 * /absensi/admin/approvals melakukan dua langkah terpisah:
 *
 *   1. `update({ status: "finalized", final_duration_minutes })` —
 *      HR mengunci durasi.
 *   2. Membuka `OvertimeFinalizeModal` untuk menghitung gaji — tapi
 *      status sudah `finalized`, jadi tidak ada lagi yang bisa diubah.
 *
 * Kalau langkah 2 ikut dilakukan di sini, modal tidak akan pernah bisa
 * dipakai. Jadi tahap ini sengaja **tidak** mengubah status; tahap
 * kedua (`finalizeOvertime`) yang menutup prosesnya.
 */
export async function setFinalDuration(
  id: string,
  input: { finalDurationMinutes: number; finalNotes?: string | null },
  actorId: string,
): Promise<OvertimeWithUser> {
  const current = await findOvertimeById(id);
  if (!current) {
    throw new ValidationError("Pengajuan tidak ditemukan.");
  }

  assertTransition(current.status, "finalized");

  const minutes = Number(input.finalDurationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new ValidationError("Durasi akhir harus lebih dari 0 menit.");
  }

  const approved = current.approvedDurationMinutes ?? 0;
  if (approved > 0 && minutes > approved) {
    throw new ValidationError(
      `Durasi akhir ${minutes / 60} jam melebihi yang disetujui (${
        approved / 60
      } jam).`,
    );
  }

  await db
    .update(overtimeRequests)
    .set({
      finalDurationMinutes: Math.round(minutes),
      finalNotes: input.finalNotes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(overtimeRequests.id, id));

  void actorId;
  return (await findOvertimeById(id))!;
}

/**
 * Finalisasi + hitung gaji lembur.
 *
 * formerly seluruh perhitungannya dilakukan di browser dan yang dikirim
 * ke database hanyalah angkanya. Artinya client bebas mengirim
 * `total_overtime_pay` sesuka hati, dan angka itu langsung dipakai
 * untuk menghitung slip gaji.
 *
 * Sekarang server yang menghitung. Override manual tetap ada (untuk
 * kasus yang memang butuh), tapi harus disertai alasan dan tercatat di
 * `calculation_breakdown`.
 */
export async function finalizeOvertime(
  id: string,
  input: {
    dayType?: "weekday" | "weekend" | "holiday";
    hourlyBaseRate?: number;
    maxPayCap?: number | null;
    totalPayOverride?: number | null;
    overrideReason?: string | null;
    finalNotes?: string | null;
    finalizedDate?: string;
  },
  actorId: string,
): Promise<OvertimeWithUser> {
  const current = await findOvertimeById(id);
  if (!current) {
    throw new ValidationError("Pengajuan tidak ditemukan.");
  }

  assertTransition(current.status, "finalized");

  const dayType =
    input.dayType ??
    (current.isHoliday
      ? "holiday"
      : current.dayType === "weekend"
        ? "weekend"
        : "weekday");

  const duration =
    current.finalDurationMinutes ??
    current.actualDurationMinutes ??
    current.approvedDurationMinutes ??
    0;

  if (duration <= 0) {
    throw new ValidationError(
      "Tidak ada durasi lembur yang tercatat untuk pengajuan ini.",
    );
  }

  const baseSalary = await getBaseSalary(current.userId);
  const standard = calculateOvertimeRates(baseSalary);

  // Tarif per jam boleh disesuaikan HR, tapi tidak boleh 0 kalau gaji
  // dasarnya 0 — itu akan menghasilkan gaji lembur 0 tanpa penjelasan.
  let hourlyBaseRate =
    input.hourlyBaseRate !== undefined && input.hourlyBaseRate > 0
      ? input.hourlyBaseRate
      : standard.hourlyBaseRate;

  if (hourlyBaseRate <= 0 && baseSalary <= 0) {
    throw new ValidationError(
      "Gaji dasar belum diisi di Pengaturan Gaji, sehingga tarif jam lembur tidak bisa dihitung.",
    );
  }

  const uncapped = calculateOvertimePayDepnaker(
    duration,
    hourlyBaseRate,
    dayType as "weekday" | "weekend" | "holiday",
  );

  const cap =
    input.maxPayCap !== undefined && input.maxPayCap !== null && input.maxPayCap > 0
      ? input.maxPayCap
      : (current.calculationBreakdown?.maxPayCap ?? null);

  const isOverCap = cap !== null && uncapped > cap;
  const capped = isOverCap ? cap : uncapped;

  let finalPay = capped;
  let isOverride = false;

  if (
    input.totalPayOverride !== undefined &&
    input.totalPayOverride !== null
  ) {
    const ov = Number(input.totalPayOverride);
    if (!Number.isFinite(ov) || ov < 0) {
      throw new ValidationError("Override gaji harus angka dan tidak boleh negatif.");
    }
    if (!input.overrideReason?.trim()) {
      throw new ValidationError(
        "Override gaji wajib disertai alasan, supaya bisa diaudit.",
      );
    }
    finalPay = ov;
    isOverride = ov !== capped;
  }

  await db
    .update(overtimeRequests)
    .set({
      status: "finalized",
      finalDurationMinutes: duration,
      finalizedBy: actorId,
      finalizedDate: input.finalizedDate ?? new Date().toISOString().slice(0, 10),
      finalNotes: input.finalNotes ?? null,
      isHoliday: dayType !== "weekday",
      dayType,
      hourlyBaseRate: String(hourlyBaseRate),
      totalOvertimePay: String(finalPay),
      calculationBreakdown: {
        baseSalary,
        hourlyBaseRate,
        multiplier: duration > 0 ? finalPay / duration / hourlyBaseRate : 0,
        maxPayCap: cap ?? null,
        uncappedTotalPay: uncapped,
        isCapped: isOverCap,
        budgetSaved: isOverCap ? uncapped - capped : 0,
        totalOvertimePay: finalPay,
        isOverride,
        overrideReason: input.overrideReason ?? null,
      },
      updatedAt: new Date(),
    })
    .where(eq(overtimeRequests.id, id));

  return (await findOvertimeById(id))!;
}

/**
 * Batalkan pengajuan sendiri.
 *
 * formerly `overtime_requests.delete().eq("id").eq("user_id").eq("status",
 * "pending")` dari browser — filter statusnya benar, tapi hasil
 * `delete()` tidak pernah diperiksa. Kalau gagal, UI tetap bilang
 * "pembatalan berhasil".
 */
export async function cancelOwnOvertime(
  id: string,
  actorId: string,
): Promise<{ cancelled: boolean }> {
  const current = await findOvertimeById(id);
  if (!current) {
    throw new ValidationError("Pengajuan tidak ditemukan.");
  }

  if (current.userId !== actorId) {
    throw new ForbiddenError("Anda hanya bisa membatalkan pengajuan Anda sendiri.");
  }

  assertTransition(current.status, "cancelled");

  await db
    .update(overtimeRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(overtimeRequests.id, id));

  return { cancelled: true };
}

/** Hapus permanen — hanya oleh HR/Executive, hanya yang belum final. */
export async function deleteOvertime(
  id: string,
): Promise<{ deleted: boolean }> {
  const current = await findOvertimeById(id);
  if (!current) {
    throw new ValidationError("Pengajuan tidak ditemukan.");
  }

  if (current.status === "finalized") {
    throw new ValidationError(
      "Pengajuan yang sudah difinalisasi tidak bisa dihapus — angkanya sudah dipakai untuk slip gaji.",
    );
  }

  await db.delete(overtimeRequests).where(eq(overtimeRequests.id, id));
  return { deleted: true };
}

export async function listPayrollStaffSettings() {
  const rows = await db
    .select({
      id: payrollStaffSettings.id,
      userId: payrollStaffSettings.userId,
      contractPosition: payrollStaffSettings.contractPosition,
      company: payrollStaffSettings.company,
      defaultBaseSalary: payrollStaffSettings.defaultBaseSalary,
      defaultMobilityAllowance: payrollStaffSettings.defaultMobilityAllowance,
      notes: payrollStaffSettings.notes ?? "",
      userName: users.name,
      departmentName: departments.name,
    })
    .from(payrollStaffSettings)
    .leftJoin(users, eq(payrollStaffSettings.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .orderBy(users.name);

  // `numeric` dikembalikan sebagai string supaya presisinya tidak hilang
  // di perjalanan.
  return rows.map((r) => ({
    ...r,
    defaultBaseSalary: String(Number(r.defaultBaseSalary)),
    defaultMobilityAllowance: String(Number(r.defaultMobilityAllowance)),
  }));
}

/** Simpan gaji dasar satu user — dipakai form finalisasi. */
export async function setBaseSalary(
  userId: string,
  salary: number,
  actorId: string,
): Promise<void> {
  if (!Number.isFinite(salary) || salary < 0) {
    throw new ValidationError("Gaji dasar harus angka dan tidak boleh negatif.");
  }

  await db
    .insert(payrollStaffSettings)
    .values({ userId, defaultBaseSalary: String(salary) })
    .onConflictDoUpdate({
      target: payrollStaffSettings.userId,
      set: { defaultBaseSalary: String(salary), updatedAt: new Date() },
    });

  void actorId;
}