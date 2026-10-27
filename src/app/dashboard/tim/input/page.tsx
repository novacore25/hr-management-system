"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyAssignments } from "@/hooks/useAssignments";
import { DailyInputForm } from "@/components/kpi/DailyInputForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PerformanceBadge } from "@/components/ui/badge";
import { formatNumber, formatCurrency, formatPercentage, getLiveWorkingDaysRemaining, pesanKpiReadonly, getBrandColor, cleanKpiTitle, cn } from "@/lib/utils";
import type { KpiAssignmentWithDetails } from "@/types";
import { Search, Lock } from "lucide-react";
import { toast } from "sonner";

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

function fmtValue(value: number, unit: string): string {
  if (unit === "currency") return formatCurrency(value);
  if (unit === "percentage") return formatPercentage(value);
  return formatNumber(value);
}

export default function TimInputPage() {
  const { user } = useAuth();
  const now = new Date();
  const { assignments, isLoading } = useMyAssignments(
    user?.id,
    now.getFullYear(),
    now.getMonth() + 1
  );
  const [selected, setSelected] = useState<KpiAssignmentWithDetails | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAssignments = assignments.filter((a) =>
    a.kpi?.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        <h2 className="text-base font-semibold">Input Harian</h2>
        <p className="text-sm text-muted-foreground">
          Pilih KPI untuk memasukkan realisasi hari ini.
        </p>
      </div>

      {assignments.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
          <p className="text-sm font-medium">Tidak ada KPI aktif</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Cari KPI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          
          <div className="space-y-2">
            {filteredAssignments.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Tidak ada KPI yang cocok dengan pencarian.
              </div>
            ) : (
              filteredAssignments.map((a) => {
                const workingDaysRemaining = getLiveWorkingDaysRemaining(a.year, a.month);
                const remainingTarget = Math.max(0, a.monthlyTarget - a.actualTotal);
                const dynamicDailyTarget = workingDaysRemaining > 0 ? remainingTarget / workingDaysRemaining : 0;
                const finalDailyTarget = dynamicDailyTarget || a.currentDailyTarget || 0;
                const unit = a.kpi?.unit ?? "number";
                const displayTarget = unit === "number" ? Math.ceil(finalDailyTarget) : finalDailyTarget;

                return (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className={cn("inline-block px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider", getBrandColor(a.kpi?.brand))}>
                        {a.kpi?.brand || "Umum"}
                      </span>
                      <span className={cn("inline-block px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider", typeColor[a.kpi?.type || "result"] || "text-slate-600 bg-slate-50 border-slate-200")}>
                        {typeLabel[a.kpi?.type || "result"] || a.kpi?.type}
                      </span>
                      {a.kpi?.period === "daily" && (
                        <span className="inline-block px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border-emerald-200">
                          Harian
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold truncate text-[var(--ab-text-main)]">
                      {cleanKpiTitle(a.kpi?.title)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Target: {fmtValue(displayTarget, unit)}
                    </p>
                    {a.qualityNotes && (
                      <div className="mt-2 text-xs bg-muted/60 border border-border/80 rounded-md px-2.5 py-1.5 italic text-foreground">
                        <span className="font-semibold not-italic text-muted-foreground mr-1">
                          Catatan {a.kpi?.type === "hr" ? "HR" : "Head"}:
                        </span>
                        "{a.qualityNotes}"
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-3">
                    <PerformanceBadge category={a.performanceCategory} />
                    {pesanKpiReadonly(a.kpi, a.kpi?.type === "hr" ? "HR" : "Head", a) ? (
                      (a.kpi?.status === "closed" || a.status === "hold") ? (
                        <button
                          type="button"
                          onClick={() => {
                            toast.error("KPI ini sudah di tutup anda terlambat silahkan hubungi HR jika ini kesalahan");
                            setSelected(a);
                          }}
                          className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-md hover:bg-red-100 transition-colors cursor-pointer"
                          title="KPI ini sudah di tutup anda terlambat silahkan hubungi HR jika ini kesalahan"
                        >
                          <Lock className="h-3 w-3 text-red-600" />
                          <span>Ditutup</span>
                        </button>
                      ) : (
                        <span
                          title={pesanKpiReadonly(a.kpi, a.kpi?.type === "hr" ? "HR" : "Head", a) ?? undefined}
                          className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-2 py-1.5 rounded-md max-w-[22rem] truncate"
                        >
                          {pesanKpiReadonly(a.kpi, a.kpi?.type === "hr" ? "HR" : "Head", a)}
                        </span>
                      )
                    ) : (
                      <Button size="sm" onClick={() => setSelected(a)}>
                        Input
                      </Button>
                    )}
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {selected && user && (
        <DailyInputForm
          assignment={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          userId={user.id}
        />
      )}
    </div>
  );
}
