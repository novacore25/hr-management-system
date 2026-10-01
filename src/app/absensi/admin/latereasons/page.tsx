"use client";

import { useCallback } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { TriangleAlert, Check, X } from "lucide-react";
import { toast } from "sonner";

interface LateLog {
  id: string;
  userName: string;
  date: string;
  checkIn: string | null;
  lateFine: number;
  lateReason: string;
  lateReasonStatus: "pending" | "accepted" | "rejected" | null;
}

function fmt(t: string | null) {
  return t ? t.substring(0, 5) : "--:--";
}

export default function AdminLateReasonsPage() {
  const buildPath = useCallback(
    () => withQuery("/api/absensi/team", { view: "late-reasons" }),
    [],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    pending: LateLog[];
  }>(buildPath, [], 30_000);

  const reviewLate = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/attendance",
    "PATCH",
  );

  const logs = data?.pending ?? [];

  async function handleLateReason(
    logId: string,
    action: "accepted" | "rejected",
  ) {
    const tid = toast.loading("Memproses alasan...");
    const res = await reviewLate.mutate({
      id: logId,
      action: "review-late-reason",
      accept: action === "accepted",
    });

    if (res.ok) {
      toast.success(
        action === "accepted"
          ? "Alasan diterima, menit telat dibatalkan."
          : "Alasan ditolak.",
        { id: tid },
      );
      void refetch();
    } else {
      toast.error(res.error ?? "Gagal memproses.", { id: tid });
    }
  }

  function statusLabel(s: string | null) {
    if (s === "accepted")
      return {
        label: "Diterima",
        cls: "text-green-700 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400",
      };
    if (s === "rejected")
      return {
        label: "Ditolak",
        cls: "text-red-700 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400",
      };
    return {
      label: "Menunggu",
      cls: "text-orange-700 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400",
    };
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{
            background: "#fef3c720",
            border: "1px solid #fde68a",
            color: "#d97706",
          }}
        >
          <TriangleAlert size={20} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-[var(--ab-text-main)] tracking-tighter">
            Approval Telat
          </h1>
          <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest mt-0.5">
            Evaluasi Alasan Keterlambatan Staf
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div className="ab-card-tactile !p-0 overflow-hidden">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead>
              <tr className="bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] border-b border-[var(--ab-border)]">
                {["Tanggal", "Staf", "Check In", "Alasan Telat", "Status", "Aksi"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 font-black uppercase tracking-widest text-[9px]"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-[var(--ab-text-dim)] font-bold"
                  >
                    <div className="animate-pulse space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-8 bg-[var(--ab-bg-main)] rounded-xl"
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-16 text-center text-[var(--ab-text-dim)] font-bold text-sm"
                  >
                    Tidak ada alasan telat yang perlu di-review.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const { label, cls } = statusLabel(log.lateReasonStatus);
                  return (
                    <tr
                      key={log.id}
                      className="border-t border-[var(--ab-border)] hover:bg-[var(--ab-bg-main)]/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-black text-[var(--ab-text-dim)] font-mono">
                        {log.date}
                      </td>
                      <td className="px-4 py-3 font-black text-[var(--ab-text-main)]">
                        {log.userName}
                      </td>
                      <td className="px-4 py-3 font-black text-red-500 font-mono">
                        {fmt(log.checkIn)}
                      </td>
                      <td className="px-4 py-3 whitespace-normal min-w-[200px] max-w-xs">
                        <p className="text-[11px] font-bold italic text-[var(--ab-text-main)]">
                          &ldquo;{log.lateReason}&rdquo;
                        </p>
                        {log.lateFine > 0 && (
                          <p className="text-[10px] text-orange-500 font-black mt-1">
                            Telat: {log.lateFine} Menit
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border ${cls}`}
                        >
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {log.lateReasonStatus === "pending" ? (
                            <>
                              <button
                                onClick={() =>
                                  handleLateReason(log.id, "accepted")
                                }
                                className="w-8 h-8 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 flex items-center justify-center hover:bg-green-500 hover:text-white hover:border-green-500 transition-all active:scale-95"
                                title="Terima Alasan"
                                aria-label={`Terima alasan ${log.userName}`}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() =>
                                  handleLateReason(log.id, "rejected")
                                }
                                className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 flex items-center justify-center hover:bg-red-500 hover:text-white hover:border-red-500 transition-all active:scale-95"
                                title="Tolak Alasan"
                                aria-label={`Tolak alasan ${log.userName}`}
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <span className="text-[var(--ab-text-dim)] font-bold text-[10px] italic">
                              Selesai
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}