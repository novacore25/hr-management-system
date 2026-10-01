"use client";

import { useCallback } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import type { Attendance, AbsensiSettings, Holiday } from "@/types/absensi";
import type { Office } from "@/server/dal/absensi";

// ═══════════════════════════════════════════════════════════════
// Attendance
// ═══════════════════════════════════════════════════════════════

/** Absensi user yang login untuk satu tanggal. */
export function useAttendanceToday(date?: string) {
  const d = date ?? new Date().toISOString().slice(0, 10);

  const build = useCallback(
    () => withQuery("/api/absensi/attendance", { mine: "1", date: d }),
    [d],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    attendance: Attendance | null;
    date: string;
  }>(build, [d], 15_000);

  return {
    attendance: data?.attendance ?? null,
    isLoading,
    error,
    refresh: refetch,
  };
}

/** Absensi seluruh perusahaan pada satu tanggal (admin). */
export function useAttendanceByDate(date: string) {
  const build = useCallback(
    () => withQuery("/api/absensi/attendance", { date }),
    [date],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    attendance: Attendance[];
    date: string;
  }>(build, [date]);

  return { records: data?.attendance ?? [], isLoading, error, refresh: refetch };
}

/** Rekap harian (admin). */
export function useDailyRecap(date: string) {
  const build = useCallback(
    () => withQuery("/api/absensi/attendance", { date, recap: "1" }),
    [date],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    recap: {
      date: string;
      present: number;
      late: number;
      veryLate: number;
      wfa: number;
      onLeave: number;
      sick: number;
      totalStaff: number;
      rows: Attendance[];
    };
  }>(build, [date]);

  return { recap: data?.recap ?? null, isLoading, error, refresh: refetch };
}

/** Absensi user yang login dalam rentang tanggal. */
export function useAttendanceRange(
  from: string,
  to: string,
  userId?: string,
) {
  void userId;
  const build = useCallback(
    () => (from && to ? withQuery("/api/absensi/attendance", { from, to }) : null),
    [from, to],
  );

  const { data, isLoading, error } = useApiQuery<{
    attendance: Attendance[];
  }>(build, [from, to]);

  return { records: data?.attendance ?? [], isLoading, error };
}

/** Aksi check-in / check-out. */
export function useAttendanceActions() {
  const checkIn = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/attendance",
    "POST",
  );
  const checkOut = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/attendance",
    "POST",
  );

  return {
    checkIn: (payload: Record<string, unknown>) =>
      checkIn.mutate({ ...payload, action: "check-in" }),
    checkOut: (payload: Record<string, unknown>) =>
      checkOut.mutate({ ...payload, action: "check-out" }),
    isPending: checkIn.isPending || checkOut.isPending,
    error: checkIn.error ?? checkOut.error,
  };
}

// ═══════════════════════════════════════════════════════════════
// Settings, holiday, kantor
// ═══════════════════════════════════════════════════════════════

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

export function useHolidays() {
  const build = useCallback(
    () => "/api/absensi/settings?include=holidays",
    [],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    holidays: Holiday[];
  }>(build, [], 300_000);

  return { holidays: data?.holidays ?? [], isLoading, error, refresh: refetch };
}

export function useOffices() {
  const build = useCallback(
    () => "/api/absensi/settings?include=offices",
    [],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    offices: Office[];
  }>(build, []);

  return { offices: data?.offices ?? [], isLoading, error, refresh: refetch };
}

/** Mutasi pengaturan absensi (admin). */
export function useAbsensiSettingsActions() {
  const patch = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/settings",
    "PATCH",
  );
  const post = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/settings",
    "POST",
  );
  const del = useApiMutation<never, unknown>("/api/absensi/settings", "DELETE");
  const put = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/settings",
    "PUT",
  );

  return {
    updateSettings: (p: Record<string, unknown>) => patch.mutate(p),
    createHoliday: (date: string, description: string) =>
      post.mutate({ kind: "holiday", date, description }),
    createOffice: (o: Record<string, unknown>) =>
      post.mutate({ kind: "office", ...o }),
    deleteItem: (kind: "holiday" | "office", id: string) =>
      del.mutate(undefined, { kind, id }),
    linkOffice: (officeId: string, departmentId: string) =>
      put.mutate({ officeId, departmentId, link: true }),
    unlinkOffice: (officeId: string, departmentId: string) =>
      put.mutate({ officeId, departmentId, link: false }),
    isPending: patch.isPending || post.isPending || del.isPending || put.isPending,
    error: patch.error ?? post.error ?? del.error ?? put.error,
  };
}

// ═══════════════════════════════════════════════════════════════
// Log audit
// ═══════════════════════════════════════════════════════════════

export function useAbsensiLogs() {
  const build = useCallback(() => "/api/absensi/logs", []);

  const { data, isLoading, error, refetch } = useApiQuery<{
    logs: import("@/types/absensi").AbsensiLog[];
  }>(build, []);

  return { logs: data?.logs ?? [], isLoading, error, refresh: refetch };
}