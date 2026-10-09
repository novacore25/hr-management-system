"use client";

import { useState, useMemo } from "react";
import { useAllUsers } from "@/hooks/useUsers";
import { useAllKpiSettings } from "@/hooks/useKpiSettings";
import { useAssignmentsForPeriod } from "@/hooks/useAssignmentsForPeriod";
import { useDepartmentsWithId } from "@/hooks/useDivisions";
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
import { getKpiRole } from "@/types";
import type { KpiAssignment } from "@/types";

export default function ExecutiveOverviewPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = todayISODate();
  const monthLabel = `${monthName(month)} ${year}`;

  const [period, setPeriod] = useState<Period>({ type: "month" });

  const { users, isLoading: usersLoading } = useAllUsers();
  const { getWeights, isLoading: settingsLoading } = useAllKpiSettings();
  const { departments: departmentsList, isLoading: deptLoading } =
    useDepartmentsWithId();
  const { assignments, kpisMap, isLoading } =
    useAssignmentsForPeriod(period);

  const deptIdToName = useMemo(() => {
    const map: Record<string, string> = {};
    departmentsList.forEach((d) => {
      map[d.id] = d.name;
    });
    return map;
  }, [departmentsList]);

  const departments = useMemo(() => {
    return departmentsList.map((d) => d.name);
  }, [departmentsList]);

  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const timUsers = useMemo(
    () =>
      users.filter((u) => {
        // Kecualikan pendaftar baru yang masih pending atau user non-aktif
        if (
          u.absensiStatus === "pending" ||
          u.absensiStatus === "deleted" ||
          u.absensiStatus === "rejected"
        ) {
          return false;
        }
        const r = getKpiRole(u);
        return r === "tim" || r === "head" || r === "hr";
      }),
    [users]
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
      if (getKpiRole(u) === "head") {
        // Head appears first in each of their managed departments
        const rawDepts =
          u.managedDepartments && u.managedDepartments.length > 0
            ? u.managedDepartments
            : u.department
            ? [u.department]
            : [];
        // Terjemahkan UUID jika ada ke Nama Departemen
        const depts = rawDepts.map(
          (idOrName) => deptIdToName[idOrName] ?? idOrName
        );
        depts.forEach((dept) => {
          if (!map[dept]) map[dept] = [];
          if (!map[dept].find((x) => x.id === u.id)) {
            map[dept] = [u, ...map[dept]];
          }
        });
      } else {
        const dept = u.department ?? "Tanpa Divisi";
        if (!map[dept]) map[dept] = [];
        map[dept].push(u);
      }
    });
    return map;
  }, [timUsers, deptIdToName]);

  // Use the exact department list and order from Supabase, plus any unassigned ones
  const deptNames = useMemo(() => {
    const orderedDepts = [...departments];
    // Append any dept names from assignments not in the departments table
    Object.keys(byDept).forEach((d) => {
      if (!orderedDepts.includes(d)) {
        orderedDepts.push(d);
      }
    });
    return orderedDepts;
  }, [byDept, departments]);

  if (isLoading || usersLoading || settingsLoading || deptLoading) {
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
          {[1, 2, 3].map((i) => (
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
          <h2 className="text-base font-semibold">Overview Seluruh Karyawan</h2>
          <p className="text-sm text-muted-foreground">
            {timUsers.length} karyawan • {deptNames.length} departemen
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
            <p className="text-sm text-muted-foreground">Belum ada data karyawan</p>
          </div>
        ) : (
          deptNames.map((dept) => {
            const deptUsers = byDept[dept] ?? [];
            const isOpen = expandedDepts.has(dept);

            const scores = deptUsers
              .filter((u) => (assignmentsMap[u.id]?.length ?? 0) > 0)
              .map((u) =>
                calcWeightedScore(assignmentsMap[u.id], getWeights(u.id)).total
              );
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
