"use client";

import { useState, useMemo } from "react";
import { useAllUsers } from "@/hooks/useUsers";
import { useAssignmentsForPeriod } from "@/hooks/useAssignmentsForPeriod";
import { PeriodPicker, type Period } from "@/components/kpi/PeriodPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PerformanceBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  getPerformanceCategory,
  formatPercentage,
  monthName,
  todayISODate,
  calcWeightedScore,
} from "@/lib/utils";
import { useAllKpiSettings } from "@/hooks/useKpiSettings";
import { getKpiRole } from "@/types";
import type { KpiAssignment } from "@/types";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HrReportsPage() {
  const now = new Date();
  const today = todayISODate();
  const monthLabel = `${monthName(now.getMonth() + 1)} ${now.getFullYear()}`;

  const [period, setPeriod] = useState<Period>({ type: "month" });
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const { users } = useAllUsers();
  const { getWeights } = useAllKpiSettings();
  const { assignments, kpisMap, isLoading } =
    useAssignmentsForPeriod(period);

  const isRange = period.type === "range";
  const periodLabel = isRange
    ? `${period.start} s.d. ${period.end}`
    : monthLabel;

  const timUsers = useMemo(
    () => users.filter((u) => getKpiRole(u) === "tim" || getKpiRole(u) === "head"),
    [users]
  );

  const userMap = useMemo(() => {
    const map: Record<string, (typeof users)[0]> = {};
    users.forEach((u) => { map[u.id] = u; });
    return map;
  }, [users]);

  const assignmentsByUser = useMemo(() => {
    const map: Record<string, KpiAssignment[]> = {};
    assignments.forEach((a) => {
      if (!map[a.userId]) map[a.userId] = [];
      map[a.userId].push(a);
    });
    return map;
  }, [assignments]);

  function getActual(a: KpiAssignment) {
    if (isRange) {
      return a.actualTotal;
    }
    return a.actualTotal;
  }

  function getUserAvg(userId: string, userAssignments: KpiAssignment[]) {
    if (userAssignments.length === 0) return 0;
    const active = userAssignments.filter(a => a.status === 'active' || a.status === 'completed');
    if (active.length === 0) return 0;
    return calcWeightedScore(active, getWeights(userId)).total;
  }

  function toggleUser(userId: string) {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  // Sort users: those with assignments first, then alphabetically
  const sortedUsers = useMemo(() => {
    return [...timUsers].sort((a, b) => {
      const aHas = (assignmentsByUser[a.id]?.length ?? 0) > 0;
      const bHas = (assignmentsByUser[b.id]?.length ?? 0) > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      // Sort by avg achievement descending
      const aAvg = getUserAvg(a.id, assignmentsByUser[a.id] ?? []);
      const bAvg = getUserAvg(b.id, assignmentsByUser[b.id] ?? []);
      return bAvg - aAvg;
    });
  }, [timUsers, assignmentsByUser, isRange]);

  // Company-wide summary stats
  const { companyAvg, totalKpis, assignedCount } = useMemo(() => {
    const userScores = Object.keys(assignmentsByUser).map(userId => getUserAvg(userId, assignmentsByUser[userId]));
    const avg = userScores.length > 0 ? userScores.reduce((s, v) => s + v, 0) / userScores.length : 0;
    const assigned = new Set(assignments.map((a) => a.userId)).size;
    return { companyAvg: avg, totalKpis: assignments.length, assignedCount: assigned };
  }, [assignments, assignmentsByUser, getWeights, isRange]);

  const csvEscape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  function handleExportCsv() {
    const rows: string[][] = [];
    rows.push(["Laporan Performa KPI - HR"]);
    rows.push(["Periode", periodLabel]);
    rows.push(["Total KPI", String(totalKpis)]);
    rows.push(["Rata-rata Perusahaan", `${formatPercentage(companyAvg)}`]);
    rows.push([""]);
    rows.push(["Nama", "Departemen", "Judul KPI", "Target", "Aktual", "Capaian (%)", "Kategori"]);

    sortedUsers.forEach((u) => {
      const userAssignments = assignmentsByUser[u.id] ?? [];
      if (userAssignments.length === 0) return;
      userAssignments.forEach((a) => {
        const actual = getActual(a);
        const pct = a.monthlyTarget > 0 ? (actual / a.monthlyTarget) * 100 : 0;
        rows.push([
          u.name,
          u.department ?? "-",
          kpisMap[a.kpiId]?.title ?? a.kpiId,
          String(a.monthlyTarget),
          String(actual),
          pct.toFixed(1),
          getPerformanceCategory(pct),
        ]);
      });
    });

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["ï»¿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `KPI_Laporan_HR_${periodLabel.replace(/[/\s]+/g, "_")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Laporan Performa</h2>
          <p className="text-sm text-muted-foreground">
            {assignedCount} karyawan Â· {totalKpis} KPI Â· {periodLabel}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <PeriodPicker period={period} onChange={setPeriod} monthLabel={monthLabel} maxDate={today} />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Rata-rata Perusahaan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{formatPercentage(companyAvg)}</p>
            <PerformanceBadge category={getPerformanceCategory(companyAvg)} className="mt-1" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Karyawan dengan KPI</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{assignedCount}</p>
            <p className="text-xs text-muted-foreground">dari {timUsers.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total KPI Aktif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalKpis}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-user list */}
      <div className="space-y-2">
        {sortedUsers.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border">
            <p className="text-sm text-muted-foreground">Belum ada data karyawan</p>
          </div>
        ) : (
          sortedUsers.map((u) => {
            const userAssignments = assignmentsByUser[u.id] ?? [];
            const avg = getUserAvg(u.id, userAssignments);
            const cat = getPerformanceCategory(avg);
            const isExpanded = expandedUsers.has(u.id);
            const hasAssignments = userAssignments.length > 0;

            return (
              <div key={u.id} className="rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => hasAssignments && toggleUser(u.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 bg-card text-left transition-colors",
                    hasAssignments ? "hover:bg-accent/50 cursor-pointer" : "cursor-default"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.department ?? "Tanpa Divisi"}</p>
                  </div>
                  {hasAssignments ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-bold tabular-nums">{formatPercentage(avg)}</p>
                        <p className="text-[10px] text-muted-foreground">{userAssignments.length} KPI</p>
                      </div>
                      <PerformanceBadge category={cat} />
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic shrink-0">Belum ada KPI</span>
                  )}
                </button>

                {isExpanded && hasAssignments && (
                  <div className="border-t border-border bg-muted/20 p-3 space-y-2">
                    {userAssignments.map((a) => {
                      const actual = getActual(a);
                      const pct = a.monthlyTarget > 0 ? (actual / a.monthlyTarget) * 100 : 0;
                      const aCat = getPerformanceCategory(pct);
                      return (
                        <div key={a.id} className="rounded-lg border border-border bg-background px-3 py-2.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium truncate">
                              {kpisMap[a.kpiId]?.title ?? "-"}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs font-semibold tabular-nums">
                                {formatPercentage(pct)}
                              </span>
                              <PerformanceBadge category={aCat} />
                            </div>
                          </div>
                          <Progress value={Math.min(pct, 100)} category={aCat} className="h-1" />
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {actual.toLocaleString("id-ID")} / {a.monthlyTarget.toLocaleString("id-ID")}
                            {kpisMap[a.kpiId]?.unit === "percentage" ? "%" : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
