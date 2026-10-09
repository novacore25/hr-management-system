"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDivisionMembers } from "@/hooks/useUsers";
import { useAllKpiSettings } from "@/hooks/useKpiSettings";
import { useAssignmentsForPeriod } from "@/hooks/useAssignmentsForPeriod";
import { ExpandableStaffGrid } from "@/components/kpi/ExpandableStaffGrid";
import { PeriodPicker, type Period } from "@/components/kpi/PeriodPicker";
import { PerformanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  cn,
  calcWeightedScore,
  formatPercentage,
  getPerformanceCategory,
  monthName,
  todayISODate,
} from "@/lib/utils";
import { getKpiRole, getManagedDepartments } from "@/types";
import type { KpiAssignment } from "@/types";

export default function HeadTeamPage() {
  const { user } = useAuth();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = todayISODate();
  const monthLabel = `${monthName(month)} ${year}`;
  const departments = user ? getManagedDepartments(user) : [];
  const departmentLabel = departments.length > 1 ? departments.join(", ") : departments[0] ?? "Umum";

  const [period, setPeriod] = useState<Period>({ type: "month" });

  const { members, isLoading: usersLoading } = useDivisionMembers(departments);
  const { getWeights, isLoading: settingsLoading } = useAllKpiSettings();
  const { assignments, kpisMap, isLoading } =
    useAssignmentsForPeriod(period, departments);

  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set(departments));
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  // Show only "tim" role and the "head" themselves
  const timUsers = useMemo(
    () => members.filter((m) => getKpiRole(m) === "tim" || m.id === user?.id),
    [members, user?.id]
  );

  const assignmentsMap = useMemo(() => {
    const map: Record<string, KpiAssignment[]> = {};
    assignments.forEach((a) => {
      if (!map[a.userId]) map[a.userId] = [];
      map[a.userId].push(a);
    });
    return map;
  }, [assignments]);

  const byDept = useMemo(() => {
    const map: Record<string, typeof timUsers> = {};
    timUsers.forEach((u) => {
      const dept = u.department ?? "Tanpa Divisi";
      if (!map[dept]) map[dept] = [];
      map[dept].push(u);
    });
    return map;
  }, [timUsers]);

  const deptNames = useMemo(() => Object.keys(byDept), [byDept]);

  if (isLoading || usersLoading || settingsLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-2">
            <div className="h-5 w-48 bg-slate-200 rounded" />
            <div className="h-3 w-32 bg-slate-200 rounded" />
          </div>
          <div className="h-10 w-32 bg-slate-200 rounded-md" />
        </div>
        <div className="space-y-3">
          {[1].map((i) => (
            <div key={i} className="h-16 w-full bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  function toggleUser(userId: string) {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleDept(dept: string) {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) {
        next.delete(dept);
        const deptUserIds = new Set((byDept[dept] ?? []).map((u) => u.id));
        setExpandedUsers((prev2) => {
          const next2 = new Set(prev2);
          deptUserIds.forEach((id) => next2.delete(id));
          return next2;
        });
      } else {
        next.add(dept);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Overview Tim Saya</h2>
          <p className="text-sm text-muted-foreground">
            {timUsers.length} anggota Â· Departemen {departmentLabel}
          </p>
        </div>
        <PeriodPicker
          period={period}
          onChange={setPeriod}
          monthLabel={monthLabel}
          maxDate={today}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpandedDepts(new Set(deptNames))}
        >
          Expand Staff
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setExpandedDepts(new Set(deptNames));
            setExpandedUsers(new Set(timUsers.map((u) => u.id)));
          }}
        >
          Expand KPI
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setExpandedDepts(new Set());
            setExpandedUsers(new Set());
          }}
        >
          Collapse All
        </Button>
      </div>

      <div className="space-y-3">
        {deptNames.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border">
            <p className="text-sm text-muted-foreground">Belum ada data anggota tim</p>
          </div>
        ) : (
          deptNames.map((dept) => {
            const deptUsers = byDept[dept] ?? [];
            const isOpen = expandedDepts.has(dept);

            const scores = deptUsers
              .filter((u) => (assignmentsMap[u.id]?.length ?? 0) > 0)
              .map((u) => {
                // If it's a range, we'd theoretically need to calculate actuals correctly,
                // but calcWeightedScore handles assignment.achievementPercentage.
                // Wait, calcWeightedScore uses assignment.achievementPercentage. 
                // Let's pass the mapped assignments if it's a range, just like in HeadDashboard.
                const userAssignments = period.type === "range"
                  ? (assignmentsMap[u.id] || []).map((a) => {
                      const reports: any[] = [];
                      const actual = reports.reduce((s, r) => s + r.actualValue, 0);
                      const pct = a.monthlyTarget > 0 ? (actual / a.monthlyTarget) * 100 : 0;
                      return { ...a, achievementPercentage: pct, performanceCategory: getPerformanceCategory(pct) as KpiAssignment["performanceCategory"] };
                    })
                  : (assignmentsMap[u.id] || []);
                return calcWeightedScore(userAssignments, getWeights(u.id)).total;
              });

            const deptAvg =
              scores.length > 0
                ? scores.reduce((s, v) => s + v, 0) / scores.length
                : 0;
            const deptCategory = getPerformanceCategory(deptAvg);

            return (
              <div key={dept} className="rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => toggleDept(dept)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/50 transition-colors text-left"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{dept}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {deptUsers.length} anggota
                    </span>
                  </div>
                  {scores.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">
                         {formatPercentage(deptAvg)}
                      </span>
                      <PerformanceBadge category={deptCategory} />
                    </div>
                  )}
                </button>

                {isOpen && (
                  <div className="p-3 border-t border-border bg-muted/20">
                    <ExpandableStaffGrid
                      users={deptUsers}
                      assignmentsMap={assignmentsMap}
                      kpisMap={kpisMap}
                      getWeights={getWeights}
                      expandedUsers={expandedUsers}
                      onToggleUser={toggleUser}
                      period={period}
                      
                    />
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
