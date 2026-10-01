/**
 * Fungsi murni yang boleh dipakai di server maupun browser.
 *
 * Dipisah dari src/lib/utils.ts karena utils.ts mengimpor
 * @/lib/supabase/client (browser-only), sehingga tidak bisa
 * dipakai di DAL / Route Handler.
 *
 * JANGAN import dari src/lib/utils.ts di file server.
 */

import type { PerformanceCategory } from "@/types";

/**
 * Kategori performa dari persentase pencapaian.
 * >= 100 excellent | >= 80 good | >= 50 warning | < 50 critical
 */
export function getPerformanceCategory(
  achievementPct: number,
): PerformanceCategory {
  if (achievementPct >= 100) return "excellent";
  if (achievementPct >= 80) return "good";
  if (achievementPct >= 50) return "warning";
  return "critical";
}

/**
 * Tingkat pencapaian dari nilai aktual vs target.
 * Dipakai UI untuk "Pencapaian" (completion), yang BERBEDA dari
 * achievementPercentage (pace rate).
 */
export function completionRate(actual: number, target: number): number {
  if (target <= 0) return 0;
  return (actual / target) * 100;
}

/** Jumlah hari kerja (Senin-Jumat) dalam satu bulan. */
export function getWorkingDaysInMonth(year: number, month: number): number {
  let count = 0;
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/** Hari kerja yang sudah lewat sampai tanggal tertentu (1-indexed). */
export function getWorkingDaysElapsed(
  year: number,
  month: number,
  upToDay: number,
): number {
  let count = 0;
  for (let d = 1; d <= upToDay; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}