"use client";

import { useCallback } from "react";
import { useApiQuery } from "./useApi";
import { withQuery } from "@/lib/api-client";
import type { KpiAssignmentWithDetails, AssignmentStatus } from "@/types";

/**
 * Assignment KPI dari server (src/server/dal/assignments.ts).
 *
 *formerly: query langsung ke Supabase dari browser.
 *Sekarang: Route Handler dengan guard role server-side.
 */

/**
 * Assignment milik user yang sedang login.
 *
 * `userId` sengaja TIDAK lagi dikirim dari client — server selalu
 * memakai session Auth.js. Parameter ini dipertahankan hanya
 * supaya signature tidak berubah di halaman pemanggil.
 */
export function useMyAssignments(
  _userId: string | undefined,
  year: number,
  month: number,
) {
  const build = useCallback(() => {
    // Bulan lampau: tampilkan yang active + completed
    const now = new Date();
    const isPastMonth =
      year < now.getFullYear() ||
      (year === now.getFullYear() && month < now.getMonth() + 1);
    const status = isPastMonth ? "active,completed" : "active";

    return withQuery("/api/assignments", { scope: "me", year, month, status });
  }, [year, month]);

  const { data, isLoading, error, refetch } =
    useApiQuery<{ assignments: KpiAssignmentWithDetails[] }>(build, [
      year,
      month,
    ]);

  return {
    assignments: data?.assignments ?? [],
    isLoading,
    error,
    refresh: refetch,
  };
}

/** Semua assignment satu periode. Butuh role HR/Executive. */
export function useAllAssignments(
  year: number,
  month: number,
  statuses?: AssignmentStatus[],
) {
  const statusKey = statuses?.join(",") ?? "active";

  const build = useCallback(
    () =>
      withQuery("/api/assignments", {
        scope: "all",
        year,
        month,
        status: statusKey,
      }),
    [year, month, statusKey],
  );

  const { data, isLoading, error, refetch } =
    useApiQuery<{ assignments: KpiAssignmentWithDetails[] }>(build, [
      year,
      month,
      statusKey,
    ]);

  return {
    assignments: data?.assignments ?? [],
    isLoading,
    error,
    refresh: refetch,
  };
}

/**
 * Assignment milik divisi yang dikelola Head, plus miliknya sendiri.
 *
 * Tidak menerima daftar divisi dari pemanggil — server yang membacanya dari
 * `users.managed_departments`. Halaman lama mengirim daftar itu dari
 * AuthContext, jadi bisa dimanipulasi di browser.
 */
export function useManagedAssignments(
  year: number,
  month: number,
  statuses?: AssignmentStatus[],
) {
  const statusKey = statuses?.join(",") ?? "active";

  const build = useCallback(
    () =>
      withQuery("/api/assignments", {
        scope: "managed",
        year,
        month,
        status: statusKey,
      }),
    [year, month, statusKey],
  );

  const { data, isLoading, error, refetch } =
    useApiQuery<{ assignments: KpiAssignmentWithDetails[] }>(build, [
      year,
      month,
      statusKey,
    ]);

  return {
    assignments: data?.assignments ?? [],
    isLoading,
    error,
    refresh: refetch,
  };
}

/**
 * Assignment milik satu atau beberapa divisi.
 *
 * `department` boleh berupa id (string) atau array of id — Head bisa
 * mengelola lebih dari satu divisi.
 */
export function useDivisionAssignments(
  department: string | string[] | undefined,
  year: number,
  month: number,
  statuses?: AssignmentStatus[],
) {
  const deptIds = Array.isArray(department)
    ? department
    : department
      ? [department]
      : [];
  const deptKey = deptIds.join(",");
  const statusKey = statuses?.join(",") ?? "active";

  const build = useCallback(
    () =>
      deptIds.length > 0
        ? withQuery("/api/assignments", {
            scope: "department",
            departmentId: deptKey,
            year,
            month,
            status: statusKey,
          })
        : null,
    [deptKey, year, month, statusKey],
  );

  const { data, isLoading, error, refetch } =
    useApiQuery<{ assignments: KpiAssignmentWithDetails[] }>(build, [
      deptKey,
      year,
      month,
      statusKey,
    ]);

  return {
    assignments: data?.assignments ?? [],
    isLoading,
    error,
    refresh: refetch,
  };
}

/** Assignment milik user yang login, untuk rentang bulan (PeriodPicker). */
export function useMyAssignmentsInRange(
  from: string,
  to: string,
) {
  const build = useCallback(
    () => withQuery("/api/assignments", { from, to }),
    [from, to],
  );

  const { data, isLoading, error } =
    useApiQuery<{ assignments: KpiAssignmentWithDetails[] }>(build, [from, to]);

  return {
    assignments: data?.assignments ?? [],
    isLoading,
    error,
  };
}