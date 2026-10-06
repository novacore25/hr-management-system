"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApiQuery } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { useMyAssignments } from "@/hooks/useAssignments";
import { useKpiSettings } from "@/hooks/useKpiSettings";
import { KpiCard } from "@/components/kpi/KpiCard";
import { DailyInputForm } from "@/components/kpi/DailyInputForm";
import { WeightedScoreCard } from "@/components/kpi/WeightedScoreCard";
import { PeriodPicker, type Period } from "@/components/kpi/PeriodPicker";
import { StaffTour } from "@/components/kpi/StaffTour";
import { AttendanceWidget } from "@/components/absensi/AttendanceWidget";
import { Input } from "@/components/ui/input";
import { Search, HelpCircle, Umbrella, Stethoscope } from "lucide-react";
import { formatDateDisplay, calcWeightedScore, monthName, todayISODate, pesanKpiReadonly } from "@/lib/utils";
import type { KpiAssignmentWithDetails } from "@/types";

export default function TimDashboard() {
  const { user } = useAuth();
  const now = new Date();
  const monthLabel = `${monthName(now.getMonth() + 1)} ${now.getFullYear()}`;
  const today = (() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`; })();

  const { assignments, isLoading } = useMyAssignments(
    user?.id,
    now.getFullYear(),
    now.getMonth() + 1
  );
  const { weights } = useKpiSettings(user?.id);
  const [selected, setSelected] = useState<KpiAssignmentWithDetails | null>(null);
  const [period, setPeriod] = useState<Period>({ type: "month" });
  const [searchQuery, setSearchQuery] = useState("");
  const [showTour, setShowTour] = useState(false);

  const filteredAssignments = assignments.filter((a) =>
    a.kpi && a.kpi.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Statistik kehadiran pribadi, dari server.
  //
  // Diambil dari API yang sama dengan widget absensi supaya tidak ada
  // dua sumber angka untuk hal yang sama -- kalau widget memakai satu
  // perhitungan dan kartu ini menghitung ulang, keduanya bisa berbeda
  // dan tidak ada yang mengetahuinya.
  const { data: summaryData } = useApiQuery<{
    mine?: {
      daysRecorded: number;
      daysOnTime: number;
      onTimePercent: number | null;
      streak: number;
      lastRecordedOn: string | null;
    };
  }>(
    () => withQuery("/api/absensi/summary", { mine: "1" }),
    [],
    60_000,
  );

  const attendanceStats = summaryData?.mine ?? null;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-slate-200 rounded-[18px]" />
          <div className="space-y-2">
            <div className="h-3 w-16 bg-slate-200 rounded" />
            <div className="h-5 w-32 bg-slate-200 rounded" />
          </div>
        </div>
        <div className="h-32 w-full bg-slate-200 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const todayDisplay = formatDateDisplay((() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`; })());
  const weightedScore = assignments.length > 0 ? calcWeightedScore(assignments, weights) : null;
  const firstAssignment = filteredAssignments[0];

  return (
    <div className="space-y-6">
      {/* Tour */}
      {showTour && filteredAssignments.length > 0 && (
        <StaffTour
          onFinish={() => setShowTour(false)}
          onOpenForm={() => setSelected(filteredAssignments[0])}
          onCloseForm={() => setSelected(null)}
        />
      )}

      {/* BENTO BOX GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* HEADER SECTION (FULL WIDTH) - Placed inside grid for CSS Order control */}
        <div className="lg:col-span-12 order-2 lg:order-1 flex items-center justify-between flex-wrap gap-4 lg:mb-2">
          <div className="flex items-center gap-4" id="tour-greeting">
            <div className="w-14 h-14 bg-[var(--ab-bg-surface)] rounded-[20px] flex items-center justify-center shadow-sm border border-[var(--ab-border)] shrink-0 transition-transform hover:scale-105">
              <span className="text-2xl font-black text-[var(--ab-text-main)]">{user?.name?.charAt(0)}</span>
            </div>
            <div>
              <p className="text-xs font-black text-[var(--ab-text-dim)] uppercase tracking-widest leading-none mb-1">
                Good Morning,
              </p>
              <h1 className="text-2xl md:text-3xl font-black text-[var(--ab-text-main)] tracking-tight leading-none truncate max-w-[250px] md:max-w-md">
                {user?.name?.split(" ")[0]}! <span className="inline-block animate-wave">👋</span>
              </h1>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-2">
                Have a productive day at work.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Tutorial Button */}
            <button
              onClick={() => setShowTour(true)}
              className="flex items-center gap-2 rounded-2xl border border-[var(--ab-border)] bg-[var(--ab-bg-surface)] px-4 py-2.5 text-xs font-black text-[var(--ab-text-dim)] shadow-sm hover:text-[var(--ab-primary)] hover:border-[var(--ab-primary-glow)] hover:shadow-md transition-all duration-300"
              title="Mulai Tutorial"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Panduan</span>
            </button>
            <div className="text-right" id="tour-period-picker">
              <PeriodPicker period={period} onChange={setPeriod} monthLabel={monthLabel} maxDate={today} />
            </div>
          </div>
        </div>
        
        {/* LEFT COLUMN: Attendance & Time */}
        <div className="lg:col-span-5 xl:col-span-4 order-1 lg:order-2 space-y-6">
          {/* Unified Widget (Attendance + Clock) */}
          <AttendanceWidget />
        </div>

        {/* BOTTOM ROW (DESKTOP) / MIDDLE ROW (MOBILE): Summary Cards */}
        <div className="lg:col-span-12 order-2 lg:order-3 grid grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="ab-glass rounded-[30px] !p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_-10px_var(--ab-primary-glow)] border border-[var(--ab-border)]">
            <div className="absolute top-0 left-0 w-2 h-full" style={{ background: "var(--ab-primary)" }} />
            <Umbrella size={18} className="mb-4" style={{ color: "var(--ab-primary)" }} />
            <p className="text-xs font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1 leading-none">
              Leave Quota
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-[var(--ab-text-main)] font-mono tracking-tighter">
                {user?.leaveQuota ?? 0}
              </span>
              <span className="text-xs font-black text-[var(--ab-text-dim)] uppercase tracking-widest">Days</span>
            </div>
            <div className="mt-4 w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-[var(--ab-primary)] rounded-full" style={{ width: `${Math.min(100, ((user?.leaveQuota ?? 0) / 12) * 100)}%` }} />
            </div>
          </div>
          
          <div className="ab-glass rounded-[30px] !p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-md border border-[var(--ab-border)]">
            <div className="absolute top-0 left-0 w-2 h-full bg-rose-500" />
            <Stethoscope size={18} className="text-rose-400 mb-4" />
            <p className="text-xs font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1 leading-none">
              Sick Quota
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black text-[var(--ab-text-main)] font-mono tracking-tighter">
                {user?.sickQuota ?? 0}
              </span>
              <span className="text-xs font-black text-[var(--ab-text-dim)] uppercase tracking-widest">Days</span>
            </div>
            <div className="mt-4 w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, ((user?.sickQuota ?? 0) / 14) * 100)}%` }} />
            </div>
          </div>

          {/* Angka kehadiran yang SEBELUMNYA ditulis sebagai teks
              literal "100%" dan "Great Consistency!" tanpa query apa
              pun.

              Di produksi bulan ini, dari 31 staf aktif: hanya 10 orang
              yang benar-benar 100%, 6 orang persentasenya 0%, dan 9
              orang belum punya absensi sama sekali. Jadi kartu itu
              menampilkan angka yang salah untuk lebih dari separuh tim
              -- dan kelihatan benar karena rapih.

              Sekarang diambil dari widget absensi, yang menghitungnya
              di server. Kalau widget belum termuat, kartu disembunyikan
              -- lebih baik tidak tampil daripada menampilkan angka
              yang tidak diketahui asalnya. */}
          {attendanceStats && (() => {
            // Persentase diambil ke variabel supaya TypeScript bisa
            // mempersempit null di dalam JSX. Menulisnya inline di
            // beberapa tempat akan membuat tiap pemakaian perlu cek
            // ulang, dan satu yang lupa akan jadi "NaN%".
            const persen = attendanceStats.onTimePercent;
            return (
              <div className="ab-glass rounded-[30px] !p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-md border border-[var(--ab-border)] col-span-2 lg:col-span-1 hidden lg:block">
                <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500" />
                <p className="text-xs font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1 leading-none">
                  Attendance Streak
                </p>
                <div className="flex items-center gap-3 mt-4">
                  <span className="text-4xl font-black text-[var(--ab-text-main)] font-mono tracking-tighter">
                    {persen === null ? "--" : `${persen}%`}
                  </span>
                  {attendanceStats.daysRecorded > 0 && persen !== null && (
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                        persen === 100
                          ? "text-emerald-500 bg-emerald-500/10"
                          : persen >= 80
                            ? "text-amber-600 bg-amber-500/10"
                            : "text-rose-500 bg-rose-500/10"
                      }`}
                    >
                      {attendanceStats.streak > 0
                        ? `${attendanceStats.streak} hari beruntun`
                        : persen >= 80
                          ? "Consistent"
                          : "Perlu improve"}
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-[var(--ab-text-dim)] mt-2">
                  {attendanceStats.daysRecorded === 0
                    ? "Belum ada absensi bulan ini"
                    : `${attendanceStats.daysOnTime} dari ${attendanceStats.daysRecorded} hari tepat waktu`}
                </p>
              </div>
            );
          })()}
        </div>

        {/* RIGHT COLUMN: KPI Assignments & Stats */}
        <div className="lg:col-span-7 xl:col-span-8 order-3 lg:order-2 space-y-6">

      {/* Weighted score breakdown — always shows monthly aggregate */}
      {weightedScore && period.type === "month" && (
        <div id="tour-weighted-score">
          <WeightedScoreCard score={weightedScore} />
        </div>
      )}

      {/* Quick input prompt */}
      {assignments.length > 0 && (
        <div id="tour-quick-prompt" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-[25px] border border-[var(--ab-border)] bg-[var(--ab-bg-main)]/50 px-5 py-4 shadow-inner">
          <div className="flex flex-col">
            <span className="text-xs font-black text-[var(--ab-text-dim)] uppercase tracking-wider mb-0.5">Aksi Cepat</span>
            <span className="text-[13px] font-semibold text-[var(--ab-text-main)]">
              Mulai bekerja? Isi progress KPI <span className="font-bold text-[var(--ab-primary)]">{firstAssignment.kpi.title}</span>.
            </span>
          </div>
          <button
            onClick={() => setSelected(firstAssignment)}
            className="ab-nm-button px-5 py-2.5 rounded-xl text-xs font-black text-white hover:opacity-90 w-full sm:w-auto mt-2 sm:mt-0"
            style={{ background: "var(--ab-primary)" }}
          >
            Isi Sekarang
          </button>
        </div>
      )}

      {/* KPI grid & Search */}
      {assignments.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
          <p className="text-sm font-medium">Belum ada KPI bulan ini</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hubungi HR jika ada yang salah.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative" id="tour-search">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Cari KPI berdasarkan judul..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 w-full md:max-w-md"
            />
          </div>

          {filteredAssignments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada KPI yang cocok dengan pencarian.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAssignments.map((a, idx) => (
                <div
                  key={a.id}
                  id={idx === 0 ? "tour-kpi-card" : undefined}
                >
                  <KpiCard
                    assignment={a}
                    onClick={() => setSelected(a)}
                    period={period}
                    // formerly dua string hard-coded di sini, dan tiap halaman punya
                    // kalimatnya sendiri. Sekarang satu aturan di
                    // `pesanKpiReadonly`, dan isinya ikut membawa
                    // deskripsi KPI -- jadi staf tahu apa yang dinilai.
                    readonlyMessage={
                      pesanKpiReadonly(
                        a.kpi,
                        a.kpi?.type === "quality" ? "Head" : "HR",
                      ) ?? undefined
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

        </div>
      </div>

      {/* Daily input dialog */}
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


