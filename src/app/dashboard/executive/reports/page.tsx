"use client";

import { useState, useMemo } from "react";
import { useDepartments } from "@/hooks/useDivisions";
import { useAssignmentsForPeriod } from "@/hooks/useAssignmentsForPeriod";
import { PeriodPicker, type Period } from "@/components/kpi/PeriodPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PerformanceBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getPerformanceCategory, formatPercentage, monthName, todayISODate, calcWeightedScore } from "@/lib/utils";
import { useAllKpiSettings } from "@/hooks/useKpiSettings";
import { Download } from "lucide-react";

export default function ExecutiveReportsPage() {
  const now = new Date();

  const today = todayISODate();

  const [period, setPeriod] = useState<Period>({
    type: "month",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const selectedYear =
    period.type === "month" && period.year ? period.year : now.getFullYear();
  const selectedMonth =
    period.type === "month" && period.month ? period.month : now.getMonth() + 1;
  const monthLabel = `${monthName(selectedMonth)} ${selectedYear}`;
  const { departments } = useDepartments();
  const { getWeights } = useAllKpiSettings();
  const { assignments, kpisMap, isLoading } = useAssignmentsForPeriod(period);
  const isRange = period.type === "range";
  const periodLabel = isRange ? `${period.start}_to_${period.end}` : monthLabel.replace(" ", "_");

  const byDepartment = useMemo(() => {
    const map: Record<string, typeof assignments> = {};
    assignments.forEach((a) => {
      if (!map[a.department]) map[a.department] = [];
      map[a.department].push(a);
    });
    return map;
  }, [assignments]);

  const csvEscape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  function handleExportCsv() {
    const rows: string[][] = [];
    rows.push(["Laporan KPI Executive"]);
    rows.push(["Periode", isRange ? `${period.start} s.d. ${period.end}` : monthLabel]);
    rows.push([""]);
    rows.push(["Departemen", "Judul KPI", "Target", "Aktual", "Capaian (%)", "Kategori"]);

    departments.forEach((dept) => {
      (byDepartment[dept] ?? []).forEach((a) => {
        const actual = isRange
          ? a.actualTotal
          : a.actualTotal;
        const pct = a.monthlyTarget > 0 ? (actual / a.monthlyTarget) * 100 : 0;
        rows.push([
          dept,
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
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `KPI_Laporan_Executive_${periodLabel}.csv`;
    anchor.click();
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Laporan Bulanan</h2>
          <p className="text-sm text-muted-foreground">
            Ringkasan per departemen {isRange ? "periode dipilih" : "bulan ini"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <PeriodPicker period={period} onChange={setPeriod} monthLabel={monthLabel} maxDate={today} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {departments.map((dept) => {
          const deptAssignments = byDepartment[dept] ?? [];
          const byUser: Record<string, typeof deptAssignments> = {};
          deptAssignments.forEach(a => {
            if (!byUser[a.userId]) byUser[a.userId] = [];
            byUser[a.userId].push(a);
          });

          const userScores = Object.entries(byUser).map(([userId, userAssignments]) => {
            const active = userAssignments.filter(a => a.status === 'active' || a.status === 'completed');
            return active.length > 0 ? calcWeightedScore(active, getWeights(userId)).total : 0;
          });

          const avg =
            userScores.length > 0
              ? userScores.reduce((s, v) => s + v, 0) / userScores.length
              : 0;
          const cat = getPerformanceCategory(avg);
          const counts = { excellent: 0, good: 0, warning: 0, critical: 0 };
          userScores.forEach((pct) => { counts[getPerformanceCategory(pct)]++; });

          return (
            <Card key={dept}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-semibold">{dept}</CardTitle>
                  <PerformanceBadge category={cat} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{formatPercentage(avg)}</p>
                  <p className="text-xs text-muted-foreground">{deptAssignments.length} KPI</p>
                </div>
                <Progress value={Math.min(avg, 100)} category={cat} />
                <div className="grid grid-cols-4 gap-1 text-center text-xs">
                  <div>
                    <p className="font-semibold text-emerald-600">{counts.excellent}</p>
                    <p className="text-muted-foreground">Exc</p>
                  </div>
                  <div>
                    <p className="font-semibold text-blue-600">{counts.good}</p>
                    <p className="text-muted-foreground">Good</p>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-600">{counts.warning}</p>
                    <p className="text-muted-foreground">Warn</p>
                  </div>
                  <div>
                    <p className="font-semibold text-red-600">{counts.critical}</p>
                    <p className="text-muted-foreground">Crit</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
