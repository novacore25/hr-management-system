"use client";

import { useCallback } from "react";
import { useApiQuery } from "./useApi";
import { withQuery } from "@/lib/api-client";
import type { DailyReport } from "@/types";

/**
 * Laporan harian dari server (src/server/dal/assignments.ts).
 *
 * formerly: query + realtime Supabase dari browser.
 * Sekarang: Route Handler dengan polling 30 detik.
 */

/** Semua laporan untuk satu assignment milik user yang login. */
export function useDailyReportsForAssignment(
  assignmentId: string | undefined,
  userId?: string,
) {
  const build = useCallback(
    () =>
      assignmentId
        ? withQuery("/api/daily-reports", { assignmentId, userId })
        : null,
    [assignmentId, userId],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    reports: DailyReport[];
  }>(build, [assignmentId, userId]);

  return { reports: data?.reports ?? [], isLoading, error, refresh: refetch };
}

/**
 * Laporan dalam rentang tanggal.
 *
 * `scope: "all"` = tanpa filter user. Hanya berlaku untuk role
 * hr/executive/developer — server menolak yang lain dengan 403, jadi
 * parameter ini bukan celah.
 *
 * WITHOUT `scope`, laporan dibatasi ke user yang sedang login. Itu
 * default yang benar untuk halaman pribadi, tapi **salah** untuk feed
 * aktivitas admin: `/dashboard/hr/activity` formerly memanggil hook ini
 * tanpa scope, jadi HR hanya melihat laporannya sendiri di halaman yang
 * justru dirancang untuk melihat everyone's.
 */
export function useDailyReportsInRange(
  startDate: string,
  endDate: string,
  options?: { userId?: string; scope?: "all" },
) {
  const userId = options?.userId;
  const scope = options?.scope;

  const build = useCallback(
    () =>
      startDate && endDate
        ? withQuery("/api/daily-reports", {
            from: startDate,
            to: endDate,
            userId,
            scope,
          })
        : null,
    [startDate, endDate, userId, scope],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    reports: DailyReport[];
  }>(build, [startDate, endDate, userId, scope]);

  return { reports: data?.reports ?? [], isLoading, error, refresh: refetch };
}