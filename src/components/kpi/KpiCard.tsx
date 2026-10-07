"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PerformanceBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  formatNumber,
  formatCurrency,
  formatPercentage,
  formatDateDisplay,
  getPerformanceCategory,
  getLiveWorkingDaysRemaining,
  getBrandColor,
  extractKpiDate,
  cleanKpiTitle,
  cn,
} from "@/lib/utils";
import { useDailyReportsForAssignment } from "@/hooks/useDailyReports";
import { MessageSquare, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { KpiAssignmentWithDetails } from "@/types";
import type { Period } from "@/components/kpi/PeriodPicker";

interface KpiCardProps {
  assignment: KpiAssignmentWithDetails;
  onClick?: () => void;
  showNotes?: boolean;
  period?: Period;
  readonlyMessage?: string;
}

function formatValue(value: number, unit: string): string {
  if (unit === "currency") return formatCurrency(value);
  if (unit === "percentage") return formatPercentage(value);
  return formatNumber(value);
}

// Removed local getBrandColorClass logic to use global utility

const typeLabel: Record<string, string> = { result: "Result", activity: "Activity", quality: "Quality", lead_tim: "Lead Tim", hr: "HR" };
const typeColor: Record<string, string> = {
  result: "text-blue-700 bg-blue-50 border-blue-200",
  activity: "text-amber-700 bg-amber-50 border-amber-200",
  quality: "text-purple-700 bg-purple-50 border-purple-200",
  lead_tim: "text-sky-700 bg-sky-50 border-sky-200",
  hr: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

export function KpiCard({ assignment, onClick, showNotes = true, period, readonlyMessage }: KpiCardProps) {
  const { user } = useAuth();
  const { kpi, performanceCategory, actualTotal, monthlyTarget } = assignment;
  const [expandNotes, setExpandNotes] = useState(false);
  const [expandDesc, setExpandDesc] = useState(false);
  const isRange = period?.type === "range";

  const kpiDate = extractKpiDate(kpi?.title);
  const displayTitle = cleanKpiTitle(kpi?.title);

  // Hitung live — tidak pakai nilai statis dari Firestore
  const liveWorkingDaysRemaining = getLiveWorkingDaysRemaining(assignment.year, assignment.month);
  const liveCurrentDailyTarget =
    liveWorkingDaysRemaining > 0
      ? Math.max(monthlyTarget - actualTotal, 0) / liveWorkingDaysRemaining
      : 0;

  // In range mode, always fetch reports to recompute actuals. Otherwise lazy-load on expand.
  const { reports } = useDailyReportsForAssignment(
    showNotes && (expandNotes || isRange) ? assignment.id : undefined,
    showNotes && (expandNotes || isRange) ? assignment.userId : undefined
  );

  if (!kpi) return null;

  const unit = kpi.unit;
  const shouldHideActual = kpi.hideActual && (user?.kpiRole === "tim" || user?.kpiRole === "head");

  // Range mode: filter reports to selected period and recompute
  const displayReports =
    isRange && period?.type === "range"
      ? reports.filter((r) => r.date >= period.start && r.date <= period.end)
      : reports;

  const actualInPeriod = displayReports.reduce((s, r) => s + r.actualValue, 0);
  const displayActual = isRange ? actualInPeriod : actualTotal;
  const displayPct = isRange
    ? monthlyTarget > 0 ? (actualInPeriod / monthlyTarget) * 100 : 0
    : monthlyTarget > 0 ? (actualTotal / monthlyTarget) * 100 : 0;
  const displayCategory = isRange ? getPerformanceCategory(displayPct) : performanceCategory;

  const sortedReports = expandNotes
    ? [...displayReports].sort((x, y) => (x.date < y.date ? 1 : -1))
    : [];

  const expectedPct = monthlyTarget > 0 ? (assignment.expectedTotal / monthlyTarget) * 100 : 0;

  const isCompleted = displayPct >= 100;

  return (
    <Card
      className={cn(
        "rounded-[30px] ab-glass transition-all duration-300 relative overflow-hidden",
        (onClick && !readonlyMessage) ? "cursor-pointer hover:-translate-y-2 hover:shadow-[0_20px_40px_-12px_var(--ab-primary-glow)]" : "",
        isCompleted ? "border-green-300/30 bg-green-50/10 dark:bg-green-900/10 shadow-[0_4px_16px_rgba(34,197,94,0.15)]" : "border border-[var(--ab-border)]"
      )}
      onClick={readonlyMessage ? undefined : onClick}
    >
      {/* Decorative top border */}
      <div className={cn("absolute top-0 left-0 right-0 h-1.5", isCompleted ? "bg-gradient-to-r from-green-400 to-emerald-500" : "bg-gradient-to-r from-[var(--ab-primary-light)] to-[var(--ab-primary)] opacity-70")} />
      <CardHeader className="pb-3 px-5 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {kpi.brand && (
                <span className={cn("inline-block px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider", getBrandColor(kpi.brand))}>
                  {kpi.brand}
                </span>
              )}
              <span className={cn("inline-block px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider", typeColor[kpi.type] || "text-slate-600 bg-slate-50 border-slate-200")}>
                {typeLabel[kpi.type] || kpi.type}
              </span>
              {kpi.period === "daily" && (
                <span className="inline-block px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border-emerald-200">
                  Harian{kpiDate ? ` · ${formatDateDisplay(kpiDate)}` : ""}
                </span>
              )}
              {kpi.period === "weekly" && (
                <span className="inline-block px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 border-blue-200">
                  Mingguan
                </span>
              )}
            </div>
            <CardTitle className="text-lg font-black leading-tight text-[var(--ab-text-main)] tracking-tight">
              {displayTitle}
            </CardTitle>
            
            {kpi.description && (
              <div className="mt-2 text-[11px] text-[var(--ab-text-dim)]">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpandDesc((v) => !v); }}
                  className="flex items-center gap-1 font-medium hover:text-slate-700 transition-colors"
                >
                  {expandDesc ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {expandDesc ? "Tutup Deskripsi" : "Lihat Deskripsi KPI"}
                </button>
                {expandDesc && (
                  <p className="mt-1.5 leading-relaxed whitespace-pre-wrap">{kpi.description}</p>
                )}
              </div>
            )}
          </div>
          <PerformanceBadge category={displayCategory} />
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 space-y-0">
        <div className="flex items-center justify-between pt-2">
          {/* Stats on Left */}
          <div className="flex-1">
            <div className="mb-1">
              <span className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-wider">Pencapaian</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-black text-[var(--ab-text-main)] tracking-tight font-mono">
                {formatPercentage(displayPct)}
              </span>
            </div>
            {/* Quick Checkbox Visual for Completion */}
            <div className="flex items-center gap-2 mt-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${isCompleted ? "bg-[var(--ab-primary)] border-[var(--ab-primary)] text-white shadow-[0_0_10px_var(--ab-primary-glow)]" : "border-[var(--ab-border)] text-transparent"}`}>
                <CheckCircle2 size={14} className={isCompleted ? "text-white" : "hidden"} />
              </div>
              <span className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                {isCompleted ? "Tercapai" : "Proses"}
              </span>
            </div>
          </div>

          {/* Circular Progress on Right */}
          <div className="relative w-20 h-20 shrink-0 ml-4">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="var(--ab-border)"
                strokeWidth="10"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke={isCompleted ? "#22c55e" : "var(--ab-primary)"}
                strokeWidth="10"
                strokeDasharray={`${Math.min(displayPct, 100) * 2.512} 251.2`}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
                style={{ filter: isCompleted ? "drop-shadow(0 0 4px rgba(34,197,94,0.6))" : "drop-shadow(0 0 4px var(--ab-primary-glow))" }}
              />
            </svg>
          </div>
        </div>

        {/* Stats Grid */}
        {!shouldHideActual && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[var(--ab-bg-main)] p-3 border border-[var(--ab-border)] shadow-inner">
                <span className="block text-[9px] uppercase font-black text-[var(--ab-text-dim)] mb-1 tracking-widest">
                  {isRange ? "Aktual Periode" : "Total Aktual"}
                </span>
                <span className="block text-sm font-black text-[var(--ab-text-main)] truncate" title={formatValue(displayActual, unit)}>
                  {formatValue(displayActual, unit)}
                </span>
              </div>
              <div className="rounded-2xl bg-[var(--ab-bg-main)] p-3 border border-[var(--ab-border)] shadow-inner">
                <span className="block text-[9px] uppercase font-black text-[var(--ab-text-dim)] mb-1 tracking-widest">
                  {kpi.period === "daily" ? "Target Harian" : kpi.period === "weekly" ? "Target Mingguan" : "Target Bulanan"}
                </span>
                <span className="block text-sm font-black text-[var(--ab-text-main)] truncate" title={formatValue(monthlyTarget, unit)}>
                  {formatValue(monthlyTarget, unit)}
                </span>
              </div>
            </div>

            {kpi.period !== "daily" && (
              <div className="mt-4 flex items-center justify-between text-[10px] px-1 font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                <span>Tgt Harian: <strong className="text-[var(--ab-text-main)] font-black">{formatValue(liveCurrentDailyTarget, unit)}</strong></span>
                <span>Sisa: <strong className="text-[var(--ab-text-main)] font-black">{liveWorkingDaysRemaining} hr</strong></span>
              </div>
            )}
          </>
        )}

        {/* Quality Notes — shown for quality KPIs */}
        {kpi?.type === "quality" && assignment.qualityNotes && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Catatan Kualitas
            </p>
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-purple-300 rounded-full" />
              <div className="ml-2.5 bg-purple-50/60 rounded-r-lg rounded-bl-sm py-2 px-3 border border-purple-100/50">
                <p className="text-xs text-purple-900/90 whitespace-pre-wrap break-words leading-relaxed italic">
                  "{assignment.qualityNotes}"
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Day-by-Day Reports Section (Timeline Design) */}
        {showNotes && kpi?.type !== "quality" && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpandNotes((v) => !v); }}
              className="flex items-center justify-between w-full text-[11px] uppercase tracking-wider font-bold text-slate-400 hover:text-slate-700 transition-colors"
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Rincian Harian
                {isRange && expandNotes && sortedReports.length > 0 && (
                  <span className="text-foreground">({sortedReports.length})</span>
                )}
              </span>
              {expandNotes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {expandNotes && (
              <div className="mt-3.5 space-y-3.5 max-h-56 overflow-y-auto pr-2 border-l-2 border-slate-100 ml-1.5 pl-4 py-1">
                {sortedReports.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Belum ada laporan di periode ini.
                  </p>
                ) : (
                  sortedReports.map((r) => {
                    const isPositive = r.actualValue > 0;
                    return (
                      <div key={r.id} className="relative">
                        <div className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-white" />
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-medium bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded shadow-sm">
                            {formatDateDisplay(r.date)}
                          </span>
                          <span className={cn("text-xs font-bold", isPositive ? "text-teal-600" : "text-slate-400")}>
                            {isPositive ? "+" : ""}{formatValue(r.actualValue, unit)}
                          </span>
                        </div>
                        {r.notes && r.notes.trim().length > 0 && (
                          <div className="mt-1.5 relative">
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-300 rounded-full" />
                            <div className="ml-1.5 bg-amber-50/60 rounded-r-lg rounded-bl-sm py-2 px-3 shadow-sm border border-amber-100/50">
                              <p className="text-xs text-amber-900/90 whitespace-pre-wrap break-words leading-relaxed italic">
                                "{r.notes}"
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
        {readonlyMessage && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="p-2 rounded-lg bg-slate-100 text-[10px] text-center font-bold uppercase tracking-widest text-slate-500 border border-slate-200 border-dashed">
              {readonlyMessage}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
