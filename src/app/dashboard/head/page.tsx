"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDivisionMembers } from "@/hooks/useUsers";
import { useAllKpiSettings } from "@/hooks/useKpiSettings";
import { useAssignmentsForPeriod } from "@/hooks/useAssignmentsForPeriod";
import { ExpandableStaffGrid } from "@/components/kpi/ExpandableStaffGrid";
import { PeriodPicker, type Period } from "@/components/kpi/PeriodPicker";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DailyInputForm } from "@/components/kpi/DailyInputForm";
import { useMyAssignments } from "@/hooks/useAssignments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calcWeightedScore,
  formatPercentage,
  getPerformanceCategory,
  monthName,
  todayISODate,
  formatDateDisplay,
} from "@/lib/utils";
import { getKpiRole, getManagedDepartments } from "@/types";
import type { KpiAssignment, KpiAssignmentWithDetails } from "@/types";

export default function HeadDashboard() {
  const { user } = useAuth();
  const now = new Date();
  const monthLabel = `${monthName(now.getMonth() + 1)} ${now.getFullYear()}`;
  const today = (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`; })();
  const todayDisplay = formatDateDisplay((() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`; })());
  const departments = user ? getManagedDepartments(user) : [];
  const departmentLabel = departments.length > 1 ? departments.join(", ") : departments[0] ?? "Umum";

  const [period, setPeriod] = useState<Period>({ type: "month" });
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [selectedKpi, setSelectedKpi] = useState<KpiAssignmentWithDetails | null>(null);

  const { members, isLoading: membersLoading } = useDivisionMembers(departments);
  const { assignments, kpisMap, isLoading } = useAssignmentsForPeriod(period, departments);
  const { assignments: myAssignments, isLoading: myLoading } = useMyAssignments(
    user?.id,
    now.getFullYear(),
    now.getMonth() + 1
  );
  const myActiveAssignments = myAssignments.filter(
    (a) => a.status !== "cancelled" && !a.kpi?.deletedAt,
  );
  const { getWeights, isLoading: settingsLoading } = useAllKpiSettings();
  const isRange = period.type === "range";

  const timMembers = useMemo(() => members.filter((m) => getKpiRole(m) === "tim" || getKpiRole(m) === "head"), [members]);

  const assignmentsMap = useMemo(() => {
    const map: Record<string, KpiAssignment[]> = {};
    assignments.forEach((a) => {
      if (!map[a.userId]) map[a.userId] = [];
      map[a.userId].push(a);
    });
    return map;
  }, [assignments]);

  if (membersLoading || isLoading || settingsLoading || myLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const userScores: Record<string, ReturnType<typeof calcWeightedScore>> = {};
  timMembers
    .filter((m) => (assignmentsMap[m.id]?.length ?? 0) > 0)
    .forEach((m) => {
      const memberAssignments = isRange
        ? assignmentsMap[m.id].map((a) => {
            const reports: any[] = [];
            const actual = reports.reduce((s, r) => s + r.actualValue, 0);
            const pct = a.monthlyTarget > 0 ? (actual / a.monthlyTarget) * 100 : 0;
            return { ...a, achievementPercentage: pct, performanceCategory: getPerformanceCategory(pct) as KpiAssignment["performanceCategory"] };
          })
        : assignmentsMap[m.id];
      userScores[m.id] = calcWeightedScore(memberAssignments, getWeights(m.id));
    });

  const counts = { excellent: 0, good: 0, warning: 0, critical: 0 };
  timMembers.forEach((m) => {
    const cat = userScores[m.id]?.category ?? getPerformanceCategory(0);
    counts[cat]++;
  });

  const allWeighted = Object.values(userScores).map((s) => s.total);
  const divAvg =
    allWeighted.length > 0
      ? allWeighted.reduce((s, v) => s + v, 0) / allWeighted.length
      : 0;

  function toggleUser(userId: string) {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-[18px] flex items-center justify-center shadow-sm border border-slate-100 shrink-0">
            <span className="text-xl font-black text-slate-800">{user?.name?.charAt(0)}</span>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Head of {departmentLabel}</p>
            <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none truncate max-w-[200px]">
              {user?.name?.split(" ")[0]}
            </h1>
          </div>
        </div>
        <div className="text-right">
          <PeriodPicker period={period} onChange={setPeriod} monthLabel={monthLabel} maxDate={today} />
          <p className="text-[10px] font-bold text-slate-400 mt-2">{todayDisplay}</p>
        </div>
      </div>

      {myActiveAssignments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">KPI Saya (Bulan Ini)</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myActiveAssignments.map((a) => (
              <KpiCard
                key={a.id}
                assignment={a}
                onClick={() => setSelectedKpi(a)}
                period={period}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Rata-rata Divisi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatPercentage(divAvg)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-emerald-600">Excellent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{counts.excellent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-amber-600">Warning</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{counts.warning}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-red-600">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{counts.critical}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Performa Tim</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedUsers(new Set(timMembers.map((m) => m.id)))}
            >
              Expand All KPI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedUsers(new Set())}
            >
              Collapse All
            </Button>
          </div>
        </div>

        {timMembers.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border">
            <p className="text-sm text-muted-foreground">Belum ada anggota tim</p>
          </div>
        ) : (
          <ExpandableStaffGrid
            users={timMembers}
            assignmentsMap={assignmentsMap}
            kpisMap={kpisMap}
            getWeights={getWeights}
            expandedUsers={expandedUsers}
            onToggleUser={toggleUser}
            period={period}
            
          />
        )}
      </div>

      {selectedKpi && user && (
        <DailyInputForm
          assignment={selectedKpi}
          open={!!selectedKpi}
          onClose={() => setSelectedKpi(null)}
          userId={user.id}
        />
      )}
    </div>
  );
}
