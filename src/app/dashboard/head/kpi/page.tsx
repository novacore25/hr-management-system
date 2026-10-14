"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useDivisionAssignments } from "@/hooks/useAssignments";
import { useDivisionMembers } from "@/hooks/useUsers";
import { useKpis } from "@/hooks/useKpis";
import { PerformanceBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatPercentage, getBrandColor, cleanKpiTitle, cn } from "@/lib/utils";
import { getManagedDepartments } from "@/types";

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

export default function HeadKpiPage() {
  const { user } = useAuth();
  const now = new Date();
  const departments = user ? getManagedDepartments(user) : [];
  const { assignments, isLoading } = useDivisionAssignments(
    departments,
    now.getFullYear(),
    now.getMonth() + 1
  );
  const { members: users } = useDivisionMembers(departments);
  const { kpis } = useKpis(now.getFullYear(), now.getMonth() + 1);

  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const kpiMap = Object.fromEntries(kpis.map((k) => [k.id, k.title]));

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">KPI Divisi</h2>
        <p className="text-sm text-muted-foreground">
          {assignments.length} KPI aktif bulan ini
        </p>
      </div>

      {assignments.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-sm text-muted-foreground">Tidak ada KPI aktif</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => (
            <div key={a.id} className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {userMap[a.userId] ?? a.userId}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap my-0.5">
                    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border", getBrandColor(a.kpi?.brand))}>
                      {a.kpi?.brand || "Umum"}
                    </span>
                    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border", typeColor[a.kpi?.type || "result"] || "text-slate-600 bg-slate-50 border-slate-200")}>
                      {typeLabel[a.kpi?.type || "result"] || a.kpi?.type}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {cleanKpiTitle(a.kpi?.title || kpiMap[a.kpiId]) || "—"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatPercentage(a.achievementPercentage)}
                  </span>
                  <PerformanceBadge category={a.performanceCategory} />
                </div>
              </div>
              <Progress value={Math.min(a.achievementPercentage, 100)} category={a.performanceCategory} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
