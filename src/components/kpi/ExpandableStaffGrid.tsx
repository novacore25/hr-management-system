"use client";

import { useState } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import {
  cn,
  calcWeightedScore,
  formatPercentage,
  formatNumber,
  formatCurrency,
  formatDateDisplay,
  getPerformanceCategory,
  getBrandColor,
  getLiveWorkingDaysRemaining,
} from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { PerformanceBadge } from "@/components/ui/badge";
import { DailyReportsViewer } from "@/components/kpi/DailyReportsViewer";
import type { User, KpiAssignment, KPI, DailyReport } from "@/types";
import type { Period } from "@/components/kpi/PeriodPicker";

const typeLabel: Record<string, string> = { result: "Result", activity: "Activity", quality: "Quality", lead_tim: "Lead Tim", hr: "HR" };
const typeColor: Record<string, string> = {
  result: "text-blue-600 bg-blue-50",
  activity: "text-amber-600 bg-amber-50",
  quality: "text-purple-600 bg-purple-50",
  lead_tim: "text-sky-600 bg-sky-50",
  hr: "text-emerald-600 bg-emerald-50",
};

// Removed local getBrandColorClass in favor of getBrandColor utility

function formatValue(value: number, unit: string) {
  if (unit === "currency") return formatCurrency(value);
  if (unit === "percentage") return formatPercentage(value);
  return formatNumber(value);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

interface ExpandableStaffGridProps {
  users: User[];
  assignmentsMap: Record<string, KpiAssignment[]>;
  kpisMap: Record<string, KPI>;
  getWeights: (userId: string) => { result: number; activity: number; quality: number; leadTim: number; hr: number; };
  expandedUsers: Set<string>;
  onToggleUser: (userId: string) => void;
  period?: Period;
  reportsByAssignment?: Record<string, DailyReport[]>;
}

export function ExpandableStaffGrid({
  users,
  assignmentsMap,
  kpisMap,
  getWeights,
  expandedUsers,
  onToggleUser,
  period = { type: "month" },
  reportsByAssignment = {},
}: ExpandableStaffGridProps) {
  const [sortBy, setSortBy] = useState<"name" | "performance">("name");
  if (users.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Belum ada anggota</p>
      </div>
    );
  }

  const isRange = period.type === "range";

  const sortedUsers = [...users].sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    } else {
      const aAssigns = assignmentsMap[a.id] ?? [];
      const bAssigns = assignmentsMap[b.id] ?? [];
      const aScore = aAssigns.length > 0 ? calcWeightedScore(aAssigns, getWeights(a.id), reportsByAssignment).total : 999;
      const bScore = bAssigns.length > 0 ? calcWeightedScore(bAssigns, getWeights(b.id), reportsByAssignment).total : 999;
      return aScore - bScore;
    }
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <select
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background shadow-sm hover:bg-muted/50 transition-colors focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
        >
          <option value="name">Urutkan: Nama (A-Z)</option>
          <option value="performance">Urutkan: Kinerja Terendah</option>
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sortedUsers.map((u) => {
        const userAssignments = assignmentsMap[u.id] ?? [];
        const score =
          userAssignments.length > 0
            ? calcWeightedScore(userAssignments, getWeights(u.id), reportsByAssignment)
            : null;
        const isExpanded = expandedUsers.has(u.id);

        return (
          <div key={u.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => onToggleUser(u.id)}
              className={cn(
                "w-full flex items-start gap-3 p-4 text-left transition-all duration-300",
                isExpanded ? "bg-gradient-to-r from-teal-50/50 to-white" : "hover:bg-slate-50"
              )}
            >
              <div className="h-10 w-10 rounded-full bg-teal-100/80 flex items-center justify-center shrink-0 shadow-inner">
                <span className="text-sm font-extrabold text-teal-700">{getInitials(u.name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.name}</p>
                {score ? (
                  <>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs font-semibold tabular-nums">
                        {formatPercentage(score.total)}
                      </span>
                      <PerformanceBadge
                        category={score.category}
                        className="text-[10px] py-0 px-1.5 h-4"
                      />
                    </div>
                    <Progress
                      value={Math.min(score.total, 100)}
                      category={score.category}
                      className="h-1 mt-1.5"
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">Belum ada KPI</p>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200",
                  isExpanded && "rotate-180"
                )}
              />
            </button>

            {isExpanded && (
              <div className="border-t border-border divide-y divide-border">
                {userAssignments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Tidak ada KPI aktif
                  </p>
                ) : (
                  <>
                    {score && (
                      <div className="px-4 py-3 bg-muted/30">
                        <p className="text-xs font-semibold mb-2">Rincian Perhitungan:</p>
                        <div className="space-y-3 text-xs text-muted-foreground">
                          
                          <div>
                            <p className="font-semibold text-teal-700 border-b border-border/50 pb-1 mb-1">Kinerja (70%)</p>
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span>Result ({score.resultCount} KPI)</span>
                                <span>{formatPercentage(score.resultAvg)} × {score.resultWeight}% = <span className="font-medium text-foreground">{formatPercentage(score.resultAvg * (score.resultWeight / 100))}</span></span>
                              </div>
                              <div className="flex justify-between">
                                <span>Activity ({score.activityCount} KPI)</span>
                                <span>{formatPercentage(score.activityAvg)} × {score.activityWeight}% = <span className="font-medium text-foreground">{formatPercentage(score.activityAvg * (score.activityWeight / 100))}</span></span>
                              </div>
                              <div className="flex justify-between">
                                <span>Quality ({score.qualityCount} KPI)</span>
                                <span>{formatPercentage(score.qualityAvg)} × {score.qualityWeight}% = <span className="font-medium text-foreground">{formatPercentage(score.qualityAvg * (score.qualityWeight / 100))}</span></span>
                              </div>
                              <div className="flex justify-between font-semibold mt-1 pt-1 border-t border-border/30 text-teal-800">
                                <span>Subtotal Kinerja</span>
                                <span>{formatPercentage(score.performanceTotal)}</span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <p className="font-semibold text-teal-700 border-b border-border/50 pb-1 mb-1">Perilaku (30%)</p>
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span>Lead Tim ({score.leadTimCount} KPI)</span>
                                <span>{formatPercentage(score.leadTimAvg)} × {score.leadTimWeight}% = <span className="font-medium text-foreground">{formatPercentage(score.leadTimAvg * (score.leadTimWeight / 100))}</span></span>
                              </div>
                              <div className="flex justify-between">
                                <span>HR ({score.hrCount} KPI)</span>
                                <span>{formatPercentage(score.hrAvg)} × {score.hrWeight}% = <span className="font-medium text-foreground">{formatPercentage(score.hrAvg * (score.hrWeight / 100))}</span></span>
                              </div>
                              <div className="flex justify-between font-semibold mt-1 pt-1 border-t border-border/30 text-teal-800">
                                <span>Subtotal Perilaku</span>
                                <span>{formatPercentage(score.personalityTotal)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-between border-t border-border pt-2 mt-2 font-black text-foreground text-sm">
                            <span>Total Skor Akhir</span>
                            <span>{formatPercentage(score.total)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  {[...userAssignments]
                    .sort((a, b) => {
                      const typeOrder: Record<string, number> = { result: 1, activity: 2, quality: 3 };
                      const typeA = kpisMap[a.kpiId]?.type || a.kpiType;
                      const typeB = kpisMap[b.kpiId]?.type || b.kpiType;
                      const orderA = typeA ? typeOrder[typeA] ?? 99 : 99;
                      const orderB = typeB ? typeOrder[typeB] ?? 99 : 99;
                      return orderA - orderB;
                    })
                    .map((a) => {
                    const kpi = kpisMap[a.kpiId];
                    if (!kpi) return null; // Hide orphaned assignments

                    const unit = kpi.unit ?? "number";
                    const reports = reportsByAssignment[a.id] ?? [];
                    const sortedReports = [...reports].sort((x, y) => (x.date < y.date ? 1 : -1));

                    // All KPI types: pakai nilai dari DB (actual_total dijaga oleh trigger PostgreSQL).
                    // Daily reports hanya untuk rincian list di bawah, bukan kalkulasi utama.
                    const isQuality = kpi.type === "quality";
                    const displayActual = a.actualTotal;
                    const displayPct = a.achievementPercentage;
                    const displayCategory = getPerformanceCategory(displayPct);
                      
                    const workingDaysRemaining = getLiveWorkingDaysRemaining(a.year, a.month);
                    const remainingTarget = Math.max(0, a.monthlyTarget - displayActual);
                    const dynamicDailyTarget = workingDaysRemaining > 0 ? remainingTarget / workingDaysRemaining : 0;
                    const finalDailyTarget = dynamicDailyTarget || a.currentDailyTarget || 0;

                    const isCompleted = displayPct >= 100;

                    return (
                      <div key={a.id} className={cn("px-3 py-2.5 space-y-1.5 rounded-md transition-all duration-300", isCompleted ? "bg-green-50/40 border border-green-200/60" : "")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {kpi.type && (
                                <span
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                                    typeColor[kpi.type]
                                  )}
                                >
                                  {typeLabel[kpi.type]}
                                </span>
                              )}
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded border font-semibold shrink-0",
                                  getBrandColor(kpi.brand)
                                )}
                              >
                                {kpi.brand || "Umum"}
                              </span>
                              <p className="text-xs font-medium truncate">
                                {kpi.title}
                              </p>
                            </div>
                          </div>
                          <PerformanceBadge
                            category={displayCategory}
                            className="text-[10px] py-0 px-1.5 h-4 shrink-0"
                          />
                        </div>
                        <Progress
                          value={Math.min(displayPct, 100)}
                          category={displayCategory}
                          markerValue={!isRange && a.monthlyTarget > 0 ? (a.expectedTotal / a.monthlyTarget) * 100 : undefined}
                          className={cn("h-1.5", isCompleted && "shadow-[0_0_8px_rgba(34,197,94,0.4)]")}
                        />
                        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground mt-1">
                          <div className="flex justify-between items-center">
                            <span>
                              {isRange ? "Periode Ini" : "Bulan Ini"}: <strong className="text-foreground font-semibold">{formatValue(displayActual, unit)}</strong> / {formatValue(a.monthlyTarget, unit)}
                            </span>
                            <span className="font-bold tabular-nums text-foreground">
                              {formatPercentage(displayPct)}
                            </span>
                          </div>
                          {!isRange && finalDailyTarget > 0 && (
                            <div className="flex justify-between items-center">
                              <span>Target Harian:</span>
                              <strong className="text-foreground font-semibold">
                                {formatValue(unit === "number" ? Math.ceil(finalDailyTarget) : finalDailyTarget, unit)}
                              </strong>
                            </div>
                          )}
                        </div>

                        {/* Rincian: quality = catatan evaluasi, result/activity = daily reports */}
                        <div className="pt-2">
                          {isQuality ? (
                            <>
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
                                <MessageSquare className="h-3 w-3" />
                                Catatan Evaluasi
                              </div>
                              {a.qualityNotes ? (
                                <div className="bg-purple-50/60 rounded-md py-1.5 px-2.5 border border-purple-100/50">
                                  <p className="text-[11px] text-purple-900/90 whitespace-pre-wrap break-words leading-relaxed italic">
                                    "{a.qualityNotes}"
                                  </p>
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted-foreground italic mt-1">
                                  Belum ada catatan evaluasi
                                </p>
                              )}
                            </>
                          ) : (
                            <DailyReportsViewer
                              assignmentId={a.id}
                              period={period}
                              currentYear={a.year}
                              currentMonth={a.month}
                              unit={unit}
                            />
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        );
        })}
      </div>
    </div>
  );
}
