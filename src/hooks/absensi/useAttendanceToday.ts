"use client";

/**
 * SHIM — hook lama, sekarang memakai Route Handler server.
 *
 * Halaman-halaman lama masih mengimpor dari file ini. Struktur
 * return value dipertahankan supaya tidak perlu rewrite semua
 * sekaligus.
 *
 * TODO(Fase 4b): ganti import halaman langsung ke
 * @/hooks/absensi/useAttendance lalu hapus file ini.
 */

import { useCallback } from "react";
import { useApiQuery } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import type { AbsensiSettings, Holiday } from "@/types/absensi";

/** @deprecated Pakai useAbsensiSettings dari @/hooks/absensi/useAttendance. */
export function useAbsensiSettings() {
  const build = useCallback(() => "/api/absensi/settings", []);
  const { data, isLoading, error, refetch } = useApiQuery<{
    settings: AbsensiSettings;
  }>(build, []);

  return {
    settings: data?.settings ?? null,
    isLoading,
    error,
    refresh: refetch,
  };
}

/** @deprecated Pakai useHolidays dari @/hooks/absensi/useAttendance. */
export function useHolidays() {
  const build = useCallback(
    () => "/api/absensi/settings?include=holidays",
    [],
  );
  const { data, isLoading, error, refetch } = useApiQuery<{
    holidays: Holiday[];
  }>(build, [], 300_000);

  const holidays = data?.holidays ?? [];

  return {
    holidays,
    /** Turunan: daftar tanggal YYYY-MM-DD, dipakai form cuti. */
    holidayDates: holidays.map((h) => h.date),
    isLoading,
    error,
    refresh: refetch,
  };
}

/**
 * @deprecated Pakai useAttendanceToday dari
 * @/hooks/absensi/useAttendance.
 *
 * Parameter `userId` diabaikan — server selalu memakai session
 * sehingga user tidak bisa mengintip absensi orang lain lewat
 * parameter ini.
 */
export function useAttendanceToday(userId?: string | null) {
  void userId;

  // Tanggal dihitung dari jam lokal browser, bukan toISOString().
  //
  // toISOString() selalu UTC. Untuk staf di WIB, setelah pukul 07:00
  // UTC (14:00 WIB) tanggalnya sudah "besok" -- jadi widget akan
  // menampilkan absensi kosong sepanjang sore, dan check-in sore hari
  // akan ditolak "Check-in hanya bisa untuk hari ini".
  //
  // Browser tahu zona waktu staf; server tidak perlu ikut tahu.
  const now = new Date();
  const today =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}`;

  const build = useCallback(
    () => withQuery("/api/absensi/attendance", { mine: "1", date: today }),
    [today],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    attendance: import("@/types/absensi").Attendance | null;
  }>(build, [today], 15_000);

  return {
    attendance: data?.attendance ?? null,
    isLoading,
    error,
    refresh: refetch,
  };
}