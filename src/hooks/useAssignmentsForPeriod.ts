"use client";

import { useCallback } from "react";
import { useApiQuery } from "./useApi";
import { withQuery } from "@/lib/api-client";
import type { KpiAssignmentWithDetails, KPI } from "@/types";
import type { Period } from "@/components/kpi/PeriodPicker";

/**
 * Assignment untuk periode terpilih (bulan).
 *
 * Sekarang: satu request ke /api/assignments/period, semua
 * perhitungan dilakukan di server — seragam untuk semua halaman.
 */
export function useAssignmentsForPeriod(
  period: Period,
  department?: string | string[],
) {
  const deptKey = Array.isArray(department)
    ? department.join(",")
    : (department ?? "");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const targetYear =
    period.type === "month" && period.year ? period.year : currentYear;
  const targetMonth =
    period.type === "month" && period.month ? period.month : currentMonth;

  const build = useCallback(() => {
    const base =
      period.type === "range" && period.start && period.end
        ? withQuery("/api/assignments/period", {
            type: "range",
            from: period.start,
            to: period.end,
            departments: deptKey || undefined,
          })
        : withQuery("/api/assignments/period", {
            type: "month",
            year: targetYear,
            month: targetMonth,
            departments: deptKey || undefined,
          });
    return base;
  }, [
    period.type,
    period.type === "range" ? period.start : "",
    period.type === "range" ? period.end : "",
    targetYear,
    targetMonth,
    deptKey,
  ]);

  const { data, isLoading, error, refetch } = useApiQuery<{
    assignments: KpiAssignmentWithDetails[];
    kpisMap: Record<string, KPI>;
  }>(build, [
    period.type,
    period.type === "range" ? period.start : "",
    period.type === "range" ? period.end : "",
    targetYear,
    targetMonth,
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
