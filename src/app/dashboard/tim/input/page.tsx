"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyAssignments } from "@/hooks/useAssignments";
import { DailyInputForm } from "@/components/kpi/DailyInputForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PerformanceBadge } from "@/components/ui/badge";
import { formatNumber, formatCurrency, formatPercentage, getLiveWorkingDaysRemaining, pesanKpiReadonly } from "@/lib/utils";
import type { KpiAssignmentWithDetails } from "@/types";
import { Search } from "lucide-react";

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
                    <p className="text-sm font-medium truncate">{a.kpi?.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Target: {fmtValue(displayTarget, unit)}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-3">
                    <PerformanceBadge category={a.performanceCategory} />
                    {pesanKpiReadonly(a.kpi, a.kpi?.type === "quality" ? "Head" : "HR") ? (
                      // Badge ini menampilkan deskripsi KPI kalau ada, supaya
                      // staf tahu apa yang sebenarnya dinilai HR. Kalau
                      // deskripsinya kosong, jatuh ke kalimat pendek -- bukan
                      // badge kosong yang terlihat normal.
                      <span
                        title={pesanKpiReadonly(a.kpi, a.kpi?.type === "quality" ? "Head" : "HR") ?? undefined}
                        className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-2 py-1.5 rounded-md max-w-[22rem] truncate"
                      >
                        {pesanKpiReadonly(a.kpi, a.kpi?.type === "quality" ? "Head" : "HR")}
                      </span>
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
