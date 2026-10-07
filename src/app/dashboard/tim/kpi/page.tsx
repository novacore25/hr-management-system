"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyAssignments } from "@/hooks/useAssignments";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DailyInputForm } from "@/components/kpi/DailyInputForm";
import { useKpiSettings } from "@/hooks/useKpiSettings";
import { PeriodPicker, type Period } from "@/components/kpi/PeriodPicker";
import { monthName, todayISODate, pesanKpiReadonly } from "@/lib/utils";
import type { KpiAssignmentWithDetails } from "@/types";

export default function TimKpiPage() {
  const { user } = useAuth();
  const now = new Date();
  const today = todayISODate();
  const currentMonthLabel = `${monthName(now.getMonth() + 1)} ${now.getFullYear()}`;

  const [filterMonth, setFilterMonth] = useState(() => {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const selectedYear = parseInt(filterMonth.split("-")[0]);
  const selectedMonthNum = parseInt(filterMonth.split("-")[1]);
  const monthLabel = `${monthName(selectedMonthNum)} ${selectedYear}`;

  const { assignments, isLoading: loadingAssignments } = useMyAssignments(
    user?.id,
    selectedYear,
    selectedMonthNum
  );
  
  // Use the KPI settings hook to fetch user's specific weights
  const { settings, isLoading: loadingSettings } = useKpiSettings(user?.id);
  
  const [selected, setSelected] = useState<KpiAssignmentWithDetails | null>(null);
  const [period, setPeriod] = useState<Period>({ type: "month" });
  const [tab, setTab] = useState<"active" | "completed_daily" | "all">("active");

  const hasDailyKpis = assignments.some((a) => a.kpi?.period === "daily");

  const activeAssignments = assignments.filter((a) => {
    if (a.kpi?.period === "daily") {
      // Harian aktif: belum selesai (actual < monthlyTarget)
      return a.actualTotal < a.monthlyTarget;
    }
    return true; // Bulanan tetap aktif sepanjang bulan
  });

  const completedDailyAssignments = assignments.filter((a) => {
    return a.kpi?.period === "daily" && a.actualTotal >= a.monthlyTarget;
  });

  const displayedAssignments =
    !hasDailyKpis || tab === "all"
      ? assignments
      : tab === "active"
      ? activeAssignments
      : completedDailyAssignments;

  function handleFilterMonthChange(value: string) {
    setFilterMonth(value);
    setPeriod({ type: "month" });
  }

  if (loadingAssignments || loadingSettings) {
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
          <h2 className="text-base font-semibold">KPI — {monthLabel}</h2>
          <p className="text-sm text-muted-foreground">{assignments.length} KPI</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => handleFilterMonthChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <PeriodPicker period={period} onChange={setPeriod} monthLabel={currentMonthLabel} maxDate={today} />
        </div>
      </div>

      {settings && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Rincian Komposisi Penilaian (Total 100%)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm font-bold text-[var(--ab-primary)]">
                <span>Performance (70%)</span>
              </div>
              <div className="h-2 flex rounded-full overflow-hidden bg-slate-200">
                <div style={{ width: `${settings.resultWeight}%` }} className="bg-blue-500" title={`Result: ${settings.resultWeight}%`} />
                <div style={{ width: `${settings.activityWeight}%` }} className="bg-purple-500" title={`Activity: ${settings.activityWeight}%`} />
                <div style={{ width: `${settings.qualityWeight}%` }} className="bg-orange-500" title={`Quality: ${settings.qualityWeight}%`} />
              </div>
              <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 pt-1">
                <span className="text-blue-500">Result: {settings.resultWeight}%</span>
                <span className="text-purple-500">Activity: {settings.activityWeight}%</span>
                <span className="text-orange-500">Quality: {settings.qualityWeight}%</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm font-bold text-teal-600">
                <span>Personality & Behavior (30%)</span>
              </div>
              <div className="h-2 flex rounded-full overflow-hidden bg-slate-200">
                <div style={{ width: `${settings.leadTimWeight}%` }} className="bg-sky-500" title={`Lead Tim: ${settings.leadTimWeight}%`} />
                <div style={{ width: `${settings.hrWeight}%` }} className="bg-emerald-500" title={`HR: ${settings.hrWeight}%`} />
              </div>
              <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 pt-1">
                <span className="text-sky-500">Lead Tim: {settings.leadTimWeight}%</span>
                <span className="text-emerald-500">HR: {settings.hrWeight}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {assignments.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
          <p className="text-sm font-medium">Belum ada KPI untuk bulan ini</p>
        </div>
      ) : (
        <div className="space-y-4">
          {hasDailyKpis && (
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-fit border border-border">
              <button
                type="button"
                onClick={() => setTab("active")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === "active"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tugas Aktif ({activeAssignments.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("completed_daily")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === "completed_daily"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Riwayat Harian Selesai ({completedDailyAssignments.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Semua ({assignments.length})
              </button>
            </div>
          )}

          {displayedAssignments.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Tidak ada tugas di kategori ini
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayedAssignments.map((a) => (
                <KpiCard
                  key={a.id}
                  assignment={a}
                  onClick={() => setSelected(a)}
                  period={period}
                  readonlyMessage={
                    pesanKpiReadonly(
                      a.kpi,
                      a.kpi?.type === "quality" ? "Head" : "HR",
                    ) ?? undefined
                  }
                />
              ))}
            </div>
          )}
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
