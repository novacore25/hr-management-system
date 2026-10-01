"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApiQuery } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { TrendingUp, Target, BarChart3, ArrowRight, Award, Zap } from "lucide-react";

interface KpiSummary {
  totalKpis: number;
  avgAchievement: number;
  performanceLabel: string;
  performanceColor: string;
  monthLabel: string;
}

function getCurrentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function getPerfLabel(avg: number): { label: string; color: string } {
  if (avg >= 90) return { label: "Excellent", color: "#22c55e" };
  if (avg >= 75) return { label: "Good", color: "var(--ab-primary)" };
  if (avg >= 60) return { label: "Fair", color: "#f97316" };
  return { label: "Needs Improvement", color: "#f43f5e" };
}

export default function StaffKpiPage() {
  const router = useRouter();
  const { year, month } = getCurrentYearMonth();

  // formerly: query kpi_assignments untuk user ini + 1 realtime channel.
  // sekarang: server yang memilih assignment milik user yang login
  // (tidak ada userId dari browser), jadi tidak bisa dibaca orang lain.
  const buildPath = useCallback(
    () => withQuery("/api/absensi/team", { view: "my-kpi", year, month }),
    [year, month],
  );

  const { data, isLoading } = useApiQuery<{
    kpis: Array<{ achievementPercentage: number }>;
  }>(buildPath, [year, month], 60_000);

  const summary = useMemo<KpiSummary>(() => {
    const monthLabel = new Date().toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });

    const rows = data?.kpis ?? [];
    if (rows.length === 0) {
      return {
        totalKpis: 0,
        avgAchievement: 0,
        performanceLabel: "Belum Ada Data",
        performanceColor: "var(--ab-text-dim)",
        monthLabel,
      };
    }

    const avgAch =
      rows.reduce((sum, r) => sum + (r.achievementPercentage ?? 0), 0) /
      rows.length;
    const { label, color } = getPerfLabel(avgAch);

    return {
      totalKpis: rows.length,
      avgAchievement: Math.round(avgAch),
      performanceLabel: label,
      performanceColor: color,
      monthLabel,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-6 pb-24 animate-pulse">
        <div className="h-8 w-48 bg-[var(--ab-bg-surface)] rounded-xl"></div>
        <div className="h-40 bg-[var(--ab-bg-surface)] rounded-[40px]"></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-28 bg-[var(--ab-bg-surface)] rounded-3xl"></div>
          <div className="h-28 bg-[var(--ab-bg-surface)] rounded-3xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 ab-animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight leading-none">
            Performa KPI
          </h2>
          <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest mt-1">
            {summary?.monthLabel ?? ""}
          </p>
        </div>
        <div
          className="text-white p-3 rounded-2xl"
          style={{ background: "var(--ab-primary)", boxShadow: "0 8px 20px -4px var(--ab-primary-glow)" }}
        >
          <BarChart3 size={20} />
        </div>
      </div>

      {/* Achievement Banner */}
      <div
        className="rounded-[40px] p-1 shadow-2xl overflow-hidden"
        style={{
          background: summary && summary.totalKpis > 0
            ? `linear-gradient(135deg, ${summary.performanceColor}dd, ${summary.performanceColor}88)`
            : "var(--ab-bg-surface)",
        }}
      >
        <div className="bg-black/10 rounded-[36px] p-8 text-center">
          {summary && summary.totalKpis > 0 ? (
            <>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Award size={16} className="text-white opacity-70" />
                <p className="text-[10px] font-black text-white opacity-70 uppercase tracking-widest">
                  Rata-Rata Capaian
                </p>
              </div>
              <p className="text-7xl font-black text-white font-mono tracking-tighter leading-none">
                {summary.avgAchievement}
                <span className="text-3xl">%</span>
              </p>
              <div className="mt-4 inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full border border-white/30">
                <Zap size={12} className="text-white" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">
                  {summary.performanceLabel}
                </span>
              </div>
            </>
          ) : (
            <div className="py-4">
              <p className="text-[var(--ab-text-dim)] font-black text-sm uppercase tracking-widest">
                Belum Ada KPI Bulan Ini
              </p>
              <p className="text-[var(--ab-text-dim)] text-xs mt-2 opacity-60">
                Hubungi atasan untuk penetapan KPI
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="ab-card-tactile !p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full" style={{ background: "var(--ab-primary)" }} />
          <Target size={14} className="mb-3" style={{ color: "var(--ab-primary)" }} />
          <p className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1 leading-none">
            Total KPI
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-[var(--ab-text-main)] font-mono tracking-tighter">
              {summary?.totalKpis ?? 0}
            </span>
            <span className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest">Item</span>
          </div>
        </div>
        <div className="ab-card-tactile !p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full" style={{ background: summary?.performanceColor ?? "var(--ab-text-dim)" }} />
          <TrendingUp size={14} className="mb-3" style={{ color: summary?.performanceColor ?? "var(--ab-text-dim)" }} />
          <p className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1 leading-none">
            Performa
          </p>
          <p
            className="text-sm font-black uppercase tracking-tight"
            style={{ color: summary?.performanceColor ?? "var(--ab-text-dim)" }}
          >
            {summary?.performanceLabel ?? "-"}
          </p>
        </div>
      </div>

      {/* CTA to full KPI dashboard */}
      <button
        onClick={() => router.push("/dashboard/tim")}
        className="w-full flex items-center justify-between p-6 rounded-[30px] text-white transition-all active:scale-95 shadow-2xl group"
        style={{
          background: "var(--ab-primary)",
          boxShadow: "0 20px 40px -12px var(--ab-primary-glow)",
        }}
      >
        <div className="text-left">
          <p className="text-[10px] font-black opacity-70 uppercase tracking-widest mb-1">
            Dashboard Lengkap
          </p>
          <p className="text-lg font-black uppercase tracking-tight">
            Lihat Detail KPI
          </p>
          <p className="text-[10px] opacity-60 mt-1">
            Isi form harian, lihat progress tim, dan lebih banyak lagi
          </p>
        </div>
        <ArrowRight
          size={28}
          className="opacity-80 group-hover:translate-x-1 transition-transform shrink-0"
        />
      </button>

      <p className="text-center text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest opacity-40">
        Data diperbarui tiap 60 detik
      </p>
    </div>
  );
}
