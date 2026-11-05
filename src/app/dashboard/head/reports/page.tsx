"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDivisionMembers } from "@/hooks/useUsers";
import { useAssignmentsForPeriod } from "@/hooks/useAssignmentsForPeriod";
import { PeriodPicker, type Period } from "@/components/kpi/PeriodPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PerformanceBadge } from "@/components/ui/badge";
import { getPerformanceCategory, formatPercentage, monthName, todayISODate, calcWeightedScore } from "@/lib/utils";
import { getManagedDepartments } from "@/types";
import type { KpiAssignment } from "@/types";
import { useAllKpiSettings } from "@/hooks/useKpiSettings";

export default function HeadReportsPage() {
  const { user } = useAuth();
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
  const departments = user ? getManagedDepartments(user) : [];
  const departmentLabel = departments.length > 1 ? departments.join(", ") : departments[0] ?? "Umum";
  const { members } = useDivisionMembers(departments);
  const { getWeights } = useAllKpiSettings();
  const { assignments, kpisMap, isLoading } = useAssignmentsForPeriod(period, departments);
  const isRange = period.type === "range";

  const reports: any[] = [];

  const assignmentMap = useMemo(
    () => Object.fromEntries(assignments.map((a) => [a.id, a])),
    [assignments]
  );

  const totalAssignments = assignments.length;
  const totalActual = useMemo(() => {
    return assignments.reduce((sum, a) => {
      const actual = isRange
        ? a.actualTotal
        : a.actualTotal;
      return sum + actual;
    }, 0);
  }, [assignments, isRange]);
  const totalTarget = useMemo(
    () => assignments.reduce((sum, a) => sum + a.monthlyTarget, 0),
    [assignments]
  );
  const avgAchievement = useMemo(() => {
    if (assignments.length === 0) return 0;
    const pcts = assignments.map((a) => {
      const actual = isRange
        ? a.actualTotal
        : a.actualTotal;
      return a.monthlyTarget > 0 ? (actual / a.monthlyTarget) * 100 : 0;
    });
    return pcts.reduce((sum, value) => sum + value, 0) / pcts.length;
  }, [assignments, isRange]);
  const totalAchievementPercent = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

  const csvEscape = (value: string | number | null | undefined) => {
    const str = value == null ? "" : String(value);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const handleExportCsv = () => {
    const rows: string[][] = [];
    rows.push(["Ringkasan KPI"]);
    rows.push(["Periode", isRange ? `${period.start} s.d. ${period.end}` : monthLabel]);
    rows.push(["Departemen", departmentLabel]);
    rows.push(["Total KPI Aktif", String(totalAssignments)]);
    rows.push(["Total Target", String(totalTarget)]);
    rows.push(["Total Aktual", String(totalActual)]);
    rows.push(["Persentase Capaian Total", `${formatPercentage(totalAchievementPercent)}`]);
    rows.push(["Rata-rata Persentase KPI", `${formatPercentage(avgAchievement)}`]);
    rows.push([""]);
    rows.push([
      "Nama",
      "Departemen",
      "Judul KPI",
      "Target Bulanan",
      "Aktual",
      "Pencapaian (%)",
      "Kategori",
    ]);

    assignments.forEach((a) => {
      const actual = isRange
        ? a.actualTotal
        : a.actualTotal;
      const pct = a.monthlyTarget > 0 ? (actual / a.monthlyTarget) * 100 : 0;
      rows.push([
        userMap[a.userId] ?? a.userId,
        a.department,
        kpisMap[a.kpiId]?.title ?? a.kpiId,
        String(a.monthlyTarget),
        String(actual),
        pct.toFixed(1),
        getPerformanceCategory(pct),
      ]);
    });

    if (reports.length > 0) {
      rows.push([""]);
      rows.push(["Detail Harian"]);
      rows.push([
        "Tanggal",
        "Nama",
        "Departemen",
        "Judul KPI",
        "Nilai Aktual",
        "Catatan",
      ]);
      reports
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((report) => {
          const assignment = assignmentMap[report.assignmentId];
          rows.push([
            report.date,
            userMap[report.userId] ?? report.userId,
            assignment?.department ?? "-",
            kpisMap[assignment?.kpiId ?? report.kpiId ?? ""]?.title ?? report.kpiId ?? "-",
            String(report.actualValue),
            report.notes ?? "",
          ]);
        });
    }

    const csv = rows
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `KPI_Laporan_${departmentLabel.replace(/[, ]+/g, "_")}_${isRange ? `${period.start}_to_${period.end}` : monthLabel.replace(" ", "_")}.csv`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const byUser = useMemo(() => {
    const map: Record<string, KpiAssignment[]> = {};
    assignments.forEach((a) => {
      if (!departments.includes(a.department)) return;
      if (!map[a.userId]) map[a.userId] = [];
      map[a.userId].push(a);
    });
    return map;
  }, [assignments, departments]);

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => { map[m.id] = m.name; });
    return map;
  }, [members]);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Laporan Performa</h2>
          <p className="text-sm text-muted-foreground">
            Ringkasan {isRange ? "periode dipilih" : "bulan ini"} untuk Departemen {departmentLabel}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            Export KPI
          </Button>
          <PeriodPicker period={period} onChange={setPeriod} monthLabel={monthLabel} maxDate={today} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total KPI</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{totalAssignments}</p>
            <p className="text-xs text-muted-foreground">KPI aktif selama periode</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Capaian Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{formatPercentage(totalAchievementPercent)}</p>
            <p className="text-xs text-muted-foreground">Persentase dari total target</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Rata-rata KPI</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{formatPercentage(avgAchievement)}</p>
            <p className="text-xs text-muted-foreground">Rata-rata pencapaian per KPI</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(byUser).map(([userId, userAssignments]) => {
          const activeAssignments = userAssignments.filter(a => a.status === 'active' || a.status === 'completed');
          const avg = activeAssignments.length > 0 ? calcWeightedScore(activeAssignments, getWeights(userId)).total : 0;
          const category = getPerformanceCategory(avg);
          return (
            <Card key={userId}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-medium">
                    {userMap[userId] ?? userId}
                  </CardTitle>
                  <PerformanceBadge category={category} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">{formatPercentage(avg)}</p>
                <p className="text-xs text-muted-foreground">{userAssignments.length} KPI</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
