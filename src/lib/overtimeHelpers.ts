/**
 * Helper utilities for Overtime (Lembur) formatting and calculations
 */

/**
 * Formats minutes into exact detailed hours and minutes (e.g., "2 Jam 00 Menit", "1 Jam 30 Menit", "0 Jam 45 Menit")
 */
export function formatDurationDetail(mins: number | null | undefined): string {
  if (mins === null || mins === undefined || isNaN(mins)) return "-";
  const h = Math.floor(Math.max(0, mins) / 60);
  const m = Math.max(0, mins) % 60;
  return `${h} Jam ${String(m).padStart(2, "0")} Menit`;
}

/**
 * Formats a schedule time range with its duration (e.g., "18:30 - 20:30 (2 Jam 00 Menit)")
 */
export function formatScheduleRange(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
  durationMinutes?: number | null
): string {
  if (!startStr || !endStr) return "-";
  const start = startStr.substring(0, 5);
  const end = endStr.substring(0, 5);
  
  const dur = durationMinutes !== undefined && durationMinutes !== null
    ? durationMinutes
    : calcDurationMinutes(start, end);

  return `${start} - ${end} (${formatDurationDetail(dur)})`;
}

/**
 * Durasi dalam menit antara dua jam "HH:mm".
 *
 * MELALUI TENGAH MALAM: kalau jam selesai lebih kecil dari jam mulai,
 * jam selesai dianggap keesokan hari. Contoh dari data produksi:
 * pengajuan 2026-09-23 tercatat 19:35 -> 00:30 dengan durasi 295
 * menit (4 jam 55 menit) -- jadi sistem lama sudah memperhitukannya
 * dengan benar.
 *
 * formerly fungsi ini memakai `Math.max(0, endMins - startMins)`, yang
 * selalu 0 untuk kasus midnight. Akibatnya:
 *   - pengajuan 19:35 -> 00:30 ditolak "Jam selesai harus setelah
 *     jam mulai", padahal persis seperti itu ada di data produksi
 *   - approve dan laporan aktual punya masalah yang sama
 *
 * Contoh nyata: pengajuan 2026-09-23 (19:35 - 00:30) ada di data,
 * sudah disetujui, sudah dibayar 219650. Kalau form diisi ulang lewat
 * kode sekarang, lembur 5 jam itu menjadi 0 dan pengajuannya ditolak
 * -- jadi sistem tidak lagi bisa mereproduksi datanya sendiri.
 *
 * Yang "+1HR" (sampai pukul 01:00) dianggap+HARI BERIKUTNYA. Kalau
 * tidak, lembur 23:00 - 01:00 akan jadi 120 menit -- jauh terlalu
 * pendek untuk shift malam.
 *
 * Return 0 kalau salah satu jam tidak valid atau keduanya sama --
 * durasi nol berarti pengajuan tidak masuk akal, dan pemanggil sudah
 * menolak kasus itu.
 */
export function calcDurationMinutes(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  if (sh < 0 || sh > 23 || sm < 0 || sm > 59) return 0;
  if (eh < 0 || eh > 23 || em < 0 || em > 59) return 0;

  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;

  // Jam yang SAMA persis berarti durasi 0, bukan 24 jam.
  //
  // formerly pakai `<=`, jadi 08:00 -> 08:00 jadi 1440 menit (24 jam).
  // Itu akan diterima sebagai lemburseharian penuh -- dan langsung
  // jadi bahan hitungan gaji. Bug ini ditemukan oleh test, bukan oleh
  // review: kalimat "kalau keduanya sama, durasi 0" ada di komentar
  // tapi implementasinya memakai `<=` yang justru menjadikannya 24 jam.
  if (endMins === startMins) return 0;
  if (endMins < startMins) endMins += 24 * 60;

  return endMins - startMins;
}

/** True kalau rentang jam ini melewati tengah malam. */
export function crossesMidnight(startStr: string, endStr: string): boolean {
  if (!startStr || !endStr) return false;
  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
  return eh * 60 + em <= sh * 60 + sm;
}

/**
 * Returns stepper state for overtime tracking
 */
export function getOvertimeStepState(stepNumber: 1 | 2 | 3 | 4, status: string) {
  // Step 1: Pengajuan (Selalu selesai jika sudah diajukan)
  if (stepNumber === 1) return { state: "completed", label: "Diajukan" };

  // Step 2: Review Jadwal HR
  if (stepNumber === 2) {
    if (status === "pending") return { state: "current", label: "Review HR" };
    if (status === "rejected") return { state: "rejected", label: "Ditolak" };
    return { state: "completed", label: "Disetujui" };
  }

  // Step 3: Laporan Kerja (Staff)
  if (stepNumber === 3) {
    if (status === "pending" || status === "rejected") return { state: "upcoming", label: "Laporan Kerja" };
    if (status === "approved") return { state: "current", label: "Waktunya Lapor" };
    return { state: "completed", label: "Laporan Terkirim" };
  }

  // Step 4: Keputusan Final (Payroll)
  if (stepNumber === 4) {
    if (status === "finalized") return { state: "completed", label: "Final Sah" };
    if (status === "reported") return { state: "current", label: "Validasi HR" };
    return { state: "upcoming", label: "Final Payroll" };
  }

  return { state: "upcoming", label: "" };
}

/**
 * Checks if a YYYY-MM-DD date falls on a Weekend (Saturday or Sunday)
 */
export function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false;
  // Parse date safely
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Counts total working days (Monday - Friday) in a given month and year
 */
export function countWorkingDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
  }
  return Math.max(1, workingDays);
}

/**
 * Formats a number as Indonesian Rupiah currency string
 */
export function formatRp(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "Rp 0";
  const num = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(num) || isNaN(num)) return "Rp 0";
  return `Rp ${Math.round(num).toLocaleString("id-ID")}`;
}

/**
 * Calculates hourly base rate and default multipliers:
 * Formula: Base Salary / Working Days in Month / Hours Per Day (default 9)
 */
export function calculateOvertimeRates(baseSalary: number) {
  const safeSalary = Math.max(0, baseSalary || 0);
  const hourlyBaseRate = Math.round((1 / 173) * safeSalary);

  return {
    hourlyBaseRate
  };
}

export function calculateOvertimePayDepnaker(
  durationMinutes: number,
  hourlyBaseRate: number,
  dayType: "weekday" | "weekend" | "holiday"
) {
  const hoursDecimal = Math.max(0, durationMinutes / 60);
  let multiplier = 0;

  if (dayType === "weekday") {
    if (hoursDecimal <= 1) {
      multiplier = hoursDecimal * 1.5;
    } else {
      multiplier = 1.5 + (hoursDecimal - 1) * 2.0;
    }
  } else {
    // weekend or holiday
    if (hoursDecimal <= 8) {
      multiplier = hoursDecimal * 2.0;
    } else if (hoursDecimal <= 9) {
      multiplier = 8 * 2.0 + (hoursDecimal - 8) * 3.0;
    } else {
      multiplier = 8 * 2.0 + 1 * 3.0 + (hoursDecimal - 9) * 4.0;
    }
  }

  return Math.round(hourlyBaseRate * multiplier);
}
