"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useKpis } from "@/hooks/useKpis";
import { useManagedMembers } from "@/hooks/useUsers";
import { useManagedAssignments } from "@/hooks/useAssignments";
import { useManagedKpiSettings } from "@/hooks/useKpiSettings";
import { useApiMutation } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PerformanceBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  formatPercentage,
  formatNumber,
  getPerformanceCategory,
  getBrandColor,
  monthName,
  calcWeightedScore,
} from "@/lib/utils";
import { Plus, PauseCircle, XCircle, CheckCircle, Search, Pencil, Check } from "lucide-react";
import type { KpiAssignment } from "@/types";

const typeLabel: Record<string, string> = { result: "Result", activity: "Activity", quality: "Quality", lead_tim: "Lead Tim", hr: "HR" };
const typeColor: Record<string, string> = {
  result: "text-blue-600 bg-blue-50",
  activity: "text-amber-600 bg-amber-50",
  quality: "text-purple-600 bg-purple-50",
  lead_tim: "text-sky-600 bg-sky-50",
  hr: "text-emerald-600 bg-emerald-50",
};

export default function HeadPenugasanPage() {
  const router = useRouter();
  /**
   * formerly: `useAllKpiSettings` (scope=all), yang menolak Head dengan 403.
   * Skor tim punyanya lalu diam-diam memakai DEFAULT_WEIGHTS — bukan bobot
   * yang benar-benar disetel HR. Tidak ada error, hanya angka yang beda.
   */
  const { getWeights } = useManagedKpiSettings();
  const now = new Date();

  const [selectedMonth, setSelectedMonth] = useState(
    () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [year, month] = selectedMonth.split("-").map(Number);

  const { kpis } = useKpis(year, month);

  /**
   * formerly: `useDivisionMembers(managedDepartments)` dan
   * `useDivisionAssignments(managedDepartments, ...)` dengan daftar divisi
   * dari AuthContext — jadi Head bisa mengubahnya dan melihat divisi lain.
   * Sekarang server yang membaca `users.managed_departments`.
   */
  const { members: users } = useManagedMembers();
  const { assignments, isLoading, refresh } = useManagedAssignments(year, month, [
    "active",
    "hold",
    "cancelled",
  ]);

  const patchAssignment = useApiMutation<Record<string, unknown>, unknown>(
    "/api/assignments",
    "PATCH",
  );

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [listSearch, setListSearch] = useState("");

  /**
   * Nama divisi untuk judul halaman.
   *
   * formerly ini daftar divisi dari AuthContext; sekarang diturunkan dari
   * user yang sudah difilter server — supaya yang tampil dan yang bisa
   * diakses tidak mungkin berbeda.
   */
  const managedDepartmentNames = useMemo(
    () => [...new Set(users.map((u) => u.department ?? "").filter(Boolean))].sort(),
    [users],
  );

  /**
   * formerly: penyaringan per user dilakukan di client dari daftar member
   * divisi. Sekarang `listManagedAssignments` sudah menyaring di SQL, jadi
   * ini hanya memastikan baris takorter yang tidak punya user tidak muncul
   * sebagai kelompok kosong.
   */
  const deptUserIds = useMemo(() => new Set(users.map((u) => u.id)), [users]);
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const kpiMap = Object.fromEntries(kpis.map((k) => [k.id, k]));

  const groupedByUser = useMemo(() => {
    const map: Record<string, KpiAssignment[]> = {};
    assignments
      .filter((a) => deptUserIds.has(a.userId))
      .forEach((a) => {
        if (!map[a.userId]) map[a.userId] = [];
        map[a.userId].push(a);
      });
    return map;
  }, [assignments, deptUserIds]);

  const userGroups = useMemo(() => {
    const userIds = Object.keys(groupedByUser);
    let filtered = userIds;
    if (listSearch.trim()) {
      const q = listSearch.trim().toLowerCase();
      filtered = userIds.filter((uid) => {
        const u = userMap[uid];
        const kpiTitles = groupedByUser[uid].map((a) => kpiMap[a.kpiId]?.title ?? "").join(" ");
        return (
          (u?.name ?? uid).toLowerCase().includes(q) ||
          (u?.department ?? "").toLowerCase().includes(q) ||
          kpiTitles.toLowerCase().includes(q)
        );
      });
    }
    return filtered.sort((a, b) => (userMap[a]?.name ?? a).localeCompare(userMap[b]?.name ?? b));
  }, [groupedByUser, userMap, kpiMap, listSearch]);

  /**
   * formerly: `supabase.from("kpi_assignments").update(...).eq("id", a.id)`
   * dari browser. Satu Head bisa membatalkan penugasan divisi mana pun
   * hanya dengan mengubah `id`; tidak ada cek divisi sama sekali.
   *
   * sekarang: PATCH /api/assignments, dan server menolak assignment di
   * luar divisi yang dikelola. `held_at` / `cancelled_at` juga diisi
   * server.
   */
  async function handleStatusChange(
    a: KpiAssignment,
    newStatus: "active" | "hold" | "cancelled",
  ) {
    setActionLoading(a.id);
    setActionError(null);
    const res = await patchAssignment.mutate({
      id: a.id,
      action: "set-status",
      status: newStatus,
    });
    setActionLoading(null);

    if (res.ok) {
      setActionError(null);
      void refresh();
    } else {
      setActionError(res.error ?? "Gagal memperbarui status. Coba lagi.");
    }
  }

  async function handleEditTarget(a: KpiAssignment, newTarget: number) {
    setActionLoading(a.id);
    setActionError(null);
    const res = await patchAssignment.mutate({
      id: a.id,
      action: "set-target",
      monthlyTarget: newTarget,
    });
    setActionLoading(null);

    if (res.ok) {
      setEditingId(null);
      setActionError(null);
      void refresh();
    } else {
      setActionError(res.error ?? "Gagal memperbarui target. Coba lagi.");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-5 w-40 bg-slate-200 rounded" />
          <div className="h-9 w-32 bg-slate-200 rounded-md" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 w-full bg-slate-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Penugasan KPI Tim</h2>
          <p className="text-sm text-muted-foreground">
            {Object.keys(groupedByUser).length} karyawan · {managedDepartmentNames.join(", ") || "tanpa divisi"} · {monthName(month)} {year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 w-[155px]"
          />
          <Button size="sm" onClick={() => router.push("/dashboard/head/penugasan/new")}>
            <Plus className="h-4 w-4" />
            Tugaskan KPI
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-destructive/60 hover:text-destructive text-xs font-medium">✕</button>
        </div>
      )}

      {Object.keys(groupedByUser).length > 0 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cari nama, divisi, atau KPI..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      )}

      {userGroups.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            {assignments.filter((a) => deptUserIds.has(a.userId)).length === 0
              ? `Belum ada penugasan ${monthName(month)} ${year} untuk tim ini`
              : "Tidak ada hasil yang cocok"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {userGroups.map((userId) => {
            const userAssignments = groupedByUser[userId];
            const u = userMap[userId];
            const initials = (u?.name ?? userId).slice(0, 2).toUpperCase();
            const activeAssignments = userAssignments.filter(a => a.status === 'active' || a.status === 'completed');
            const avgPct = activeAssignments.length > 0
              ? calcWeightedScore(activeAssignments, getWeights(userId)).total
              : 0;

            // `hr` ikut karena KPI tipe HR juga punya penugasan, dan Head
            // perlu melihatnya. formerly tipe ini tidak ada di daftar awal
            // maupun di yang diiterasi di bawah -- jadi assignment `hr`
            // yang sudah ada di database tidak pernah tampil di halaman
            // ini sama sekali.
            const byType: Record<string, KpiAssignment[]> = { result: [], activity: [], quality: [], lead_tim: [], hr: [] };
            userAssignments.forEach((a) => {
              const t = a.kpiType ?? "result";
              if (!byType[t]) byType[t] = [];
              byType[t].push(a);
            });

            return (
              <div key={userId} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b border-border">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u?.name ?? userId}</p>
                    <p className="text-xs text-muted-foreground">{u?.department ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold tabular-nums">{formatPercentage(avgPct)}</span>
                    <PerformanceBadge category={getPerformanceCategory(avgPct) as KpiAssignment["performanceCategory"]} />
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {(["result", "activity", "quality", "lead_tim", "hr"] as const).map((type) => {
                    const typeAssignments = byType[type];
                    if (!typeAssignments || typeAssignments.length === 0) return null;
                    return typeAssignments.map((a) => {
                      const k = kpiMap[a.kpiId];
                      if (!k) return null;
                      return (
                        <div key={a.id} className="px-4 py-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${typeColor[type]}`}>
                                {typeLabel[type]}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 font-medium ${getBrandColor(k.brand)}`}>
                                {k.brand || "Umum"}
                              </span>
                              <p className="text-sm truncate">{k.title}</p>
                              {a.status !== "active" && (
                                <Badge variant="outline" className="text-xs shrink-0 px-2 py-0.5">
                                  {a.status === "hold" ? <><PauseCircle className="mr-1 h-3 w-3 inline" />Hold</> : <><XCircle className="mr-1 h-3 w-3 inline" />Batal</>}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs font-medium tabular-nums shrink-0">
                              {formatPercentage(a.achievementPercentage)}
                            </span>
                          </div>
                          {a.status !== "cancelled" && (
                            <Progress value={Math.min(a.achievementPercentage, 100)} category={a.performanceCategory} className="h-1.5" />
                          )}
                          <div className="flex items-center justify-between">
                            <div>
                              {a.status !== "cancelled" && (
                                editingId === a.id ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">{formatNumber(a.actualTotal)} /</span>
                                    <input
                                      type="number" min="0.01" step="any" value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)} autoFocus
                                      className="w-24 rounded border border-primary px-1.5 py-0.5 text-xs text-right tabular-nums focus:outline-none"
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") { const v = parseFloat(editValue); if (v > 0) handleEditTarget(a, v); }
                                        if (e.key === "Escape") setEditingId(null);
                                      }}
                                    />
                                    <button onClick={() => { const v = parseFloat(editValue); if (v > 0) handleEditTarget(a, v); }} disabled={!editValue || parseFloat(editValue) <= 0 || actionLoading === a.id} className="text-green-600 hover:text-green-700 disabled:opacity-50">
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                                      <XCircle className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {formatNumber(a.actualTotal)} / {formatNumber(a.monthlyTarget)}
                                  </span>
                                )
                              )}
                            </div>
                            <div className="flex gap-1">
                              {a.status !== "cancelled" && (
                                <button onClick={() => { setEditingId(a.id); setEditValue(String(a.monthlyTarget)); }} disabled={actionLoading === a.id} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50">
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                              {a.status === "active" && (
                                <button onClick={() => handleStatusChange(a, "hold")} disabled={actionLoading === a.id} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-amber-600 hover:bg-amber-50 disabled:opacity-50">
                                  <PauseCircle className="h-3 w-3" /> Hold
                                </button>
                              )}
                              {(a.status === "hold" || a.status === "cancelled") && (
                                <button onClick={() => handleStatusChange(a, "active")} disabled={actionLoading === a.id} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-green-600 hover:bg-green-50 disabled:opacity-50">
                                  <CheckCircle className="h-3 w-3" /> Aktifkan
                                </button>
                              )}
                              {a.status !== "cancelled" && (
                                <button onClick={() => handleStatusChange(a, "cancelled")} disabled={actionLoading === a.id} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50">
                                  <XCircle className="h-3 w-3" /> Batal
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
