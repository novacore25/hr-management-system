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

/** Laporan dalam rentang tanggal. */
export function useDailyReportsInRange(
  startDate: string,
  endDate: string,
  options?: { userId?: string },
) {
  const userId = options?.userId;

  const build = useCallback(
    () =>
      startDate && endDate
        ? withQuery("/api/daily-reports", { from: startDate, to: endDate, userId })
        : null,
    [startDate, endDate, userId],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    reports: DailyReport[];
  }>(build, [startDate, endDate, userId]);

  return { reports: data?.reports ?? [], isLoading, error, refresh: refetch };
}