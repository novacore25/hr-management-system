"use client";

import { useCallback } from "react";
import { useApiQuery } from "./useApi";
import { withQuery } from "@/lib/api-client";
import type { KPI } from "@/types";

/**
 * Data KPI dari server (src/server/dal/kpi.ts).
 * formerly: query langsung ke Supabase dari browser.
 */
export function useKpis(year: number, month: number) {
  const build = useCallback(
    () => withQuery("/api/kpis", { year, month }),
    [year, month],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{ kpis: KPI[] }>(
    build,
    [year, month],
  );

  return {
    kpis: data?.kpis ?? [],
    isLoading,
    error,
    refresh: refetch,
  };
}

/** KPI milik satu divisi (menggunakan departmentId). */
export function useDepartmentKpis(
  departmentId: string | undefined,
  year: number,
  month: number,
) {
  const build = useCallback(
    () =>
      departmentId
        ? withQuery("/api/kpis", { department: departmentId, year, month })
        : null,
    [departmentId, year, month],
  );

  const { data, isLoading, error } = useApiQuery<{ kpis: KPI[] }>(build, [
    departmentId,
    year,
    month,
  ]);

  return { kpis: data?.kpis ?? [], isLoading, error };
}

/** KPI termasuk yang sudah di-trash. Butuh role HR/Executive. */
export function useTrashedKpis(year: number, month: number) {
  const build = useCallback(
    () => withQuery("/api/kpis", { year, month, includeTrash: "1" }),
    [year, month],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{ kpis: KPI[] }>(
    build,
    [year, month],
  );

  return { kpis: data?.kpis ?? [], isLoading, error, refresh: refetch };
}