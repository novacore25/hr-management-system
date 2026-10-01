import type { AbsensiSettings } from "@/types/absensi";

/**
 * Setting absensi default.
 *
 * Dipakai sebagai nilai awal hook supaya komponen tidak perlu
 * melakukan null-check saat data masih loading.
 *
 * CATATAN: nilai di database-lah yang authoritative. Default ini
 * hanya fallback tampilan, DAN TIDAK dipakai untuk perhitungan
 * check-in (server selalu baca dari database).
 */
export const DEFAULT_ABSENSI_SETTINGS: AbsensiSettings = {
  workStart: "08:00",
  workEnd: "18:00",
  maxLate: "08:15",
  maxTimeSick: "12:00",
  maxTimeLeave: "23:59",
  maxTimeWfa: "12:00",
  officeLat: -6.241586,
  officeLng: 106.628055,
  officeRadius: 100,
  lastSyncDate: null,
};

/** Hari kerja (Senin-Jumat, belum memperhitungkan hari libur). */
export function isWeekendISO(dateISO: string): boolean {
  const day = new Date(`${dateISO}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

/** Daftar tanggal di antara dua tanggal (YYYY-MM-DD), inklusif. */
export function datesBetween(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${fromISO}T00:00:00`);
  const end = new Date(`${toISO}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`,
    );
  }
  return out;
}

/** Tanggal hari ini dalam zona waktu lokal browser. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Waktu sekarang "HH:MM" (bukan UTC). */
export function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}