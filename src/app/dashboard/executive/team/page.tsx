"use client";

import { useState, useMemo } from "react";
import { useAllUsers } from "@/hooks/useUsers";
import { useAssignmentsForPeriod } from "@/hooks/useAssignmentsForPeriod";
import { PeriodPicker, type Period } from "@/components/kpi/PeriodPicker";
import { Badge } from "@/components/ui/badge";
import { PerformanceBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cn,
  getPerformanceCategory,
  calcWeightedScore,
  formatPercentage,
  formatNumber,
  formatCurrency,
  getBrandColor,
  cleanKpiTitle,
  monthName,
  todayISODate,
} from "@/lib/utils";
import { useAllKpiSettings } from "@/hooks/useKpiSettings";
import { getKpiRole } from "@/types";
import type { User } from "@/types";

const typeLabel: Record<string, string> = {
  result: "Result",
  activity: "Activity",
  quality: "Quality",
  lead_tim: "Lead Tim",
  hr: "HR",
};

const typeColor: Record<string, string> = {
  result: "text-blue-700 bg-blue-50 border-blue-200",
  activity: "text-amber-700 bg-amber-50 border-amber-200",
  quality: "text-purple-700 bg-purple-50 border-purple-200",
  lead_tim: "text-sky-700 bg-sky-50 border-sky-200",
  hr: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

const kpiRoleLabel: Record<string, string> = {
  executive: "Executive",
  hr: "HR",
  head: "Head",
  tim: "Tim",
};

function formatValue(value: number, unit: string) {
  if (unit === "currency") return formatCurrency(value);
  if (unit === "percentage") return formatPercentage(value);
  return formatNumber(value);
}

export default function ExecutiveTeamPage() {
  const now = new Date();
  const monthLabel = `${monthName(now.getMonth() + 1)} ${now.getFullYear()}`;
  const today = todayISODate();

  const [period, setPeriod] = useState<Period>({ type: "month" });
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const { users, isLoading: ul } = useAllUsers();
  const { assignments, kpisMap, isLoading } = useAssignmentsForPeriod(period);
  const { getWeights, isLoading: sl } = useAllKpiSettings();
  const isRange = period.type === "range";

  const byUser = useMemo(() => {
    const map: Record<string, typeof assignments> = {};
    assignments.forEach((a) => {
      if (!map[a.userId]) map[a.userId] = [];
      map[a.userId].push(a);
    });
    return map;
  }, [assignments]);

  if (isLoading || ul || sl) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const selectedUserAssignments = selectedUser ? (byUser[selectedUser.id] ?? []) : [];

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h2 className="text-base font-semibold">Seluruh Tim</h2>
          <PeriodPicker period={period} onChange={setPeriod} monthLabel={monthLabel} maxDate={today} />
        </div>

        <div className="space-y-2">
          {users.map((u) => {
            const role = getKpiRole(u);
            const userAssignments = byUser[u.id] ?? [];
            const activeAssignments = userAssignments.filter(a => a.status === 'active' || a.status === 'completed');
            const score = activeAssignments.length > 0 ? calcWeightedScore(activeAssignments, getWeights(u.id)) : null;
            const avg = score ? score.total : null;
            const cat = avg !== null ? getPerformanceCategory(avg) : null;

            return (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.department ?? "Tanpa Divisi"} • {userAssignments.length} KPI aktif
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <Badge variant="outline" className="text-xs">
                    {kpiRoleLabel[role] ?? role}
                  </Badge>
                  {cat !== null && avg !== null && (
                    <>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatPercentage(avg)}
                      </span>
                      <PerformanceBadge category={cat} />
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={!!selectedUser} onOpenChange={(o) => !o && setSelectedUser(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedUser?.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {selectedUser?.department ?? "Tanpa Divisi"} •{" "}
              {selectedUser ? (kpiRoleLabel[getKpiRole(selectedUser)] ?? "") : ""}
            </p>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {selectedUserAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Tidak ada KPI bulan ini
              </p>
            ) : (
              selectedUserAssignments.map((a) => {
                const kpi = kpisMap[a.kpiId];
                const reports: any[] = [];
                const actualInPeriod = reports.reduce((s, r) => s + r.actualValue, 0);
                const displayActual = isRange ? actualInPeriod : a.actualTotal;
                const displayPct = isRange
                  ? a.monthlyTarget > 0 ? (actualInPeriod / a.monthlyTarget) * 100 : 0
                  : a.achievementPercentage;
                const cat = getPerformanceCategory(displayPct);

                return (
                  <div key={a.id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          {kpi?.type && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium border", typeColor[kpi.type])}>
                              {typeLabel[kpi.type] || kpi.type}
                            </span>
                          )}
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold", getBrandColor(kpi?.brand))}>
                            {kpi?.brand || "Umum"}
                          </span>
                          {kpi?.period === "daily" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border font-semibold text-emerald-700 bg-emerald-50 border-emerald-200">
                              Harian
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold truncate">
                          {cleanKpiTitle(kpi?.title) || a.kpiId}
                        </p>
                      </div>
                      <PerformanceBadge category={cat} />
                    </div>
                    <Progress value={Math.min(displayPct, 100)} category={cat} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {isRange ? "Aktual periode: " : "Aktual: "}
                        {kpi ? formatValue(displayActual, kpi.unit) : displayActual}
                      </span>
                      <span>
                        Target: {kpi ? formatValue(a.monthlyTarget, kpi.unit) : a.monthlyTarget}
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatPercentage(displayPct)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
