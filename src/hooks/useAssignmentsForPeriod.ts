"use client";

import { useCallback } from "react";
import { useApiQuery } from "./useApi";
import { withQuery } from "@/lib/api-client";
import type { KpiAssignmentWithDetails, KPI } from "@/types";
import type { Period } from "@/components/kpi/PeriodPicker";

/**
 * Assignment untuk periode terpilih (bulan atau rentang).
 *
 * formerly: query multi-round + realtime Supabase dari browser,
 * plus rekap rentang yang hanya jalan di sebagian halaman
 * (4 halaman punya array kosong sehingga selalu 0%).
 *
 * Sekarang: satu request ke /api/assignments/period, semua
 * perhitungan rentang dilakukan di server — seragam untuk semua halaman.
 */
export function useAssignmentsForPeriod(
  period: Period,
  department?: string | string[],
) {
  const deptKey = Array.isArray(department)
    ? department.join(",")
    : (department ?? "");

  const build = useCallback(() => {
    const base =
      period.type === "range"
        ? withQuery("/api/assignments/period", {
            type: "range",
            from: period.start.slice(0, 7), // "2026-01-15" -> "2026-01"
            to: period.end.slice(0, 7),
            departments: deptKey || undefined,
          })
        : withQuery("/api/assignments/period", {
            type: "month",
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
            departments: deptKey || undefined,
          });
    return base;
  }, [period.type, period.type === "range" ? period.start : "", period.type === "range" ? period.end : "", deptKey]);

  const { data, isLoading, error, refetch } = useApiQuery<{
    assignments: KpiAssignmentWithDetails[];
    kpisMap: Record<string, KPI>;
  }>(build, [
    period.type,
    period.type === "range" ? period.start : "",
    period.type === "range" ? period.end : "",
    deptKey,
  ]);

  return {
    assignments: data?.assignments ?? [],
    kpisMap: data?.kpisMap ?? {},
    isLoading,
    error,
    refresh: refetch,
  };
}