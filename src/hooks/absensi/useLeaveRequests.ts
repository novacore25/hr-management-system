"use client";

/**
 * Leave request via Route Handler server.
 *
 * formerly: query + realtime Supabase langsung dari browser,
 * dan pemrosesan approve lewat RPC SECURITY DEFINER yang TIDAK punya
 * cek admin. Sekarang semua lewat server yang mewajibkan
 * requireAbsensiAdmin().
 *
 * TODO(Fase 4b): gabungkan ke @/hooks/absensi/useAttendance lalu hapus.
 */

import { useCallback } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import type {
  LeaveRequest,
  LeaveRequestStatus,
} from "@/types/absensi";

/** Pengajuan milik user yang login + sisa kuota. */
export function useMyLeaveRequests(userId: string | null) {
  void userId;

  const build = useCallback(
    () => withQuery("/api/absensi/leave", { mine: "1" }),
    [],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    requests: LeaveRequest[];
    quota: { leave: number; sick: number };
    used: { leave: number; sick: number };
    remaining: { leave: number; sick: number };
  }>(build, []);

  return {
    requests: data?.requests ?? [],
    quota: data?.quota ?? { leave: 0, sick: 0 },
    used: data?.used ?? { leave: 0, sick: 0 },
    remaining: data?.remaining ?? { leave: 0, sick: 0 },
    isLoading,
    error,
    refresh: refetch,
  };
}

/** Semua pengajuan (admin absensi). */
export function useAllLeaveRequests(status?: LeaveRequestStatus) {
  const build = useCallback(
    () => withQuery("/api/absensi/leave", { status }),
    [status],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    requests: LeaveRequest[];
  }>(build, [status]);

  return { requests: data?.requests ?? [], isLoading, error, refresh: refetch };
}

/** Aksi leave: ajukan / batalkan / minta pembatalan. */
export function useLeaveActions() {
  const post = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/leave",
    "POST",
  );
  const patch = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/leave",
    "PATCH",
  );

  return {
    submit: (payload: {
      type: string;
      dates: string[];
      reason: string;
    }) => post.mutate(payload),
    cancel: (id: string) => patch.mutate({ id, action: "cancel" }),
    requestCancellation: (id: string, reason: string) =>
      patch.mutate({ id, action: "request-cancellation", reason }),
    approve: (id: string) => patch.mutate({ id, action: "approve" }),
    reject: (id: string) => patch.mutate({ id, action: "reject" }),
    approveCancellation: (id: string) =>
      patch.mutate({ id, action: "approve-cancellation" }),
    rejectCancellation: (id: string) =>
      patch.mutate({ id, action: "reject-cancellation" }),
    isPending: post.isPending || patch.isPending,
    error: post.error ?? patch.error,
  };
}