"use client";

import { useCallback, useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { getKpiRole } from "@/types";
import type { Feedback } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bug, Sparkles, MessageSquare, Clock } from "lucide-react";

const typeIcon = {
  bug: <Bug className="h-4 w-4 text-rose-500" />,
  feature: <Sparkles className="h-4 w-4 text-amber-500" />,
  other: <MessageSquare className="h-4 w-4 text-blue-500" />,
};

const statusLabel: Record<Feedback["status"], string> = {
  open: "Baru",
  in_progress: "Diproses",
  resolved: "Selesai",
  rejected: "Ditolak",
};

export default function FeedbacksPage() {
  const { user } = useAuth();
  const [filterType, setFilterType] = useState<"all" | Feedback["type"]>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | Feedback["status"]>("all");
  const [rowError, setRowError] = useState<string | null>(null);

  const role = user ? getKpiRole(user) : null;
  const allowed = role === null || role === "developer";

  /**
   * formerly: `supabase.from("feedbacks").select("*")` dari browser plus
   * channel `postgres_changes` untuk live update. Kanal itu butuh lisensi
   * Supabase untuk volume tinggi dan boros di VPS 2 vCPU — digantikan
   * polling 30 detik dari `useApiQuery`.
   *
   * `rowToFeedback` juga dihapus: DAL sudah membentuk `createdAt`/`updatedAt`
   * sebagai ISO string. Bentuk lama `{ seconds, nanoseconds, toDate() }`
   * tidak bisa melewati JSON — fungsi `toDate` hilang saat serialisasi,
   * jadi `f.createdAt?.toDate()` akan meledak sebagai "not a function".
   */
  const build = useCallback(
    () => (allowed ? "/api/feedbacks" : null),
    [allowed],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    feedbacks: Feedback[];
  }>(build, [allowed]);

  const patchStatus = useApiMutation<
    { id: string; status: string },
    unknown
  >("/api/feedbacks", "PATCH");

  const feedbacks = useMemo(() => data?.feedbacks ?? [], [data]);

  async function updateStatus(id: string, newStatus: Feedback["status"]) {
    setRowError(null);
    const res = await patchStatus.mutate({ id, status: newStatus });

    if (res.ok) {
      void refetch();
    } else {
      // formerly kegagalan hanya masuk console — Select sudah pindah ke
      // nilai baru padahal tidak tersimpan, jadi user melihat status yang
      // lalu hilang sendiri saat refetch berikutnya.
      setRowError(res.error ?? "Gagal mengubah status laporan.");
    }
  }

  const filtered = feedbacks.filter((f) => {
    if (filterType !== "all" && f.type !== filterType) return false;
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    return true;
  });

  // Pengecekan role DI BAWAH semua hook. formerly `return` bersyarat ada
  // sebelum useState, padahal `role` baru terisi setelah AuthContext selesai
  // memuat — jumlah hook berubah antar render dan React melempar
  // "Rendered fewer hooks than expected" (halaman putih).
  if (!allowed) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Akses tidak diizinkan.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Laporan Bug & Fitur</h2>
          <p className="text-sm text-muted-foreground">Kumpulan aspirasi, komentar, dan bug report dari tim.</p>
        </div>
      </div>

      <div className="flex gap-2 bg-muted p-1 rounded-lg w-fit">
        <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
          <SelectTrigger className="w-36 h-8 text-xs bg-background">
            <SelectValue placeholder="Semua Tipe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tipe</SelectItem>
            <SelectItem value="bug">Bug / Error</SelectItem>
            <SelectItem value="feature">Fitur Baru</SelectItem>
            <SelectItem value="other">Lainnya</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
          <SelectTrigger className="w-36 h-8 text-xs bg-background">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="open">Baru</SelectItem>
            <SelectItem value="in_progress">Diproses</SelectItem>
            <SelectItem value="resolved">Selesai</SelectItem>
            <SelectItem value="rejected">Ditolak</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rowError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive flex items-center justify-between gap-2">
          <span>{rowError}</span>
          <button
            onClick={() => setRowError(null)}
            className="text-destructive/60 hover:text-destructive text-xs font-medium"
          >
            ✕
          </button>
        </div>
      )}

      {error && !rowError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center border rounded-xl border-dashed">
            <p className="text-muted-foreground text-sm">Tidak ada laporan yang sesuai filter.</p>
          </div>
        ) : (
          filtered.map((f) => (
            <div key={f.id} className="rounded-xl border bg-card flex flex-col overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
                {typeIcon[f.type]}
                <span className="text-xs font-semibold capitalize flex-1">
                  {f.type === "other" ? "Lainnya" : f.type}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(f.createdAt).toLocaleDateString("id-ID")}
                </span>
              </div>

              <div className="p-4 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{f.userName}</p>
                    <p className="text-[10px] text-muted-foreground">{f.department} · {f.role}</p>
                  </div>
                  <Select
                    value={f.status}
                    onValueChange={(v: any) => updateStatus(f.id, v)}
                  >
                    <SelectTrigger className="h-6 text-[10px] w-28 px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Baru</SelectItem>
                      <SelectItem value="in_progress">Diproses</SelectItem>
                      <SelectItem value="resolved">Selesai</SelectItem>
                      <SelectItem value="rejected">Ditolak</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{f.message}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
