"use client";

import { useMemo, useState, useEffect } from "react";
import { useAllUsers } from "@/hooks/useUsers";
import { useDailyReportsInRange } from "@/hooks/useDailyReports";
import { useDepartments } from "@/hooks/useDivisions";
import { useKpis } from "@/hooks/useKpis";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  formatNumber,
  formatCurrency,
  formatPercentage,
  formatDateDisplay,
  todayISODate,
} from "@/lib/utils";
import { Calendar, MessageSquare, Search, Filter } from "lucide-react";
import type { DailyReport, KPI } from "@/types";

type PresetKey = "today" | "yesterday" | "last3" | "last7" | "thisMonth" | "custom";

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstDayOfMonth(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function presetRange(key: PresetKey): { start: string; end: string } {
  const today = todayISODate();
  switch (key) {
    case "today":     return { start: today, end: today };
    case "yesterday": { const y = shiftDate(today, -1); return { start: y, end: y }; }
    case "last3":     return { start: shiftDate(today, -2), end: today };
    case "last7":     return { start: shiftDate(today, -6), end: today };
    case "thisMonth": return { start: firstDayOfMonth(today), end: today };
    default:          return { start: today, end: today };
  }
}

function formatValue(value: number, unit: string): string {
  if (unit === "currency") return formatCurrency(value);
  if (unit === "percentage") return formatPercentage(value);
  return formatNumber(value);
}

export function DailyActivityFeed() {
  const today = todayISODate();
  const [preset, setPreset] = useState<PresetKey>("today");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [onlyWithNotes, setOnlyWithNotes] = useState(false);

  const { users } = useAllUsers();
  const { departments } = useDepartments();

  /**
   * `scope: "all"` — halaman ini memang feed aktivitas seluruh tim
   * (`/dashboard/hr/activity`, `/dashboard/executive/activity`).
   *
   * formerly hook ini dipanggil tanpa scope, jadi server membatasi
   * laporan ke user yang sedang login. Akibatnya HR hanya melihat
   * laporannya sendiri, di halaman yang justru ada untuk melihat
   * semua orang. Server menolak `scope=all` untuk role di bawah
   * Executive, jadi parameter ini bukan celah.
   */
  const { reports, isLoading } = useDailyReportsInRange(startDate, endDate, {
    scope: "all",
  });

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  /**
   * formerly `supabase.from("kpis").select("*, departments(name)")` per
   * bulan dalam rentang. Dengan stub hasilnya selalu kosong, jadi
   * setiap baris menampilkan **UUID KPI** di tempat judulnya.
   *
   * Sekarang dari `/api/kpis`. Hook ini hanya bisa satu bulan, jadi
   * rentang yang melintasi bulan pecah dipecah per bulan.
   */
  const months = useMemo(() => {
    const out: Array<{ year: number; month: number }> = [];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    let d = new Date(start.getFullYear(), start.getMonth(), 1);
    while (d <= end && out.length < 24) {
      out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    return out;
  }, [startDate, endDate]);

  const [kpiMap, setKpiMap] = useState<Record<string, KPI>>({});

  useEffect(() => {
    if (months.length === 0) return;
    let cancelled = false;

    async function loadKpis() {
      const results = await Promise.all(
        months.map(({ year, month }) =>
          fetch(
            `/api/kpis?year=${year}&month=${month}&includeTrash=1`,
            { credentials: "include", cache: "no-store" },
          )
            .then((r) => (r.ok ? r.json() : { ok: false, data: null }))
            .catch(() => ({ ok: false, data: null })),
        ),
      );

      if (cancelled) return;

      const map: Record<string, KPI> = {};
      for (const res of results) {
        for (const k of (res?.data?.kpis ?? []) as KPI[]) {
          map[k.id] = k;
        }
      }
      setKpiMap(map);
    }

    void loadKpis();
    return () => {
      cancelled = true;
    };
  }, [months]);

  function applyPreset(key: PresetKey) {
    setPreset(key);
    if (key !== "custom") {
      const { start, end } = presetRange(key);
      setStartDate(start);
      setEndDate(end);
    }
  }

  const filteredReports = useMemo(() => {
    let list = reports;

    // formerly `departmentFilter` tidak pernah dipakai di mana pun —
    // dropdownnya ada, state-nya berubah, tapi hasil filternya tetap sama.
    // User memilih divisi, tidak ada yang berubah, dan tidak ada yang
    // memberitahu.
    if (departmentFilter) {
      list = list.filter((r) => {
        const user = userMap[r.userId];
        // Divisi bisa datang dari user (`department`) atau dari KPI-nya.
        // Yang membedakannya penting: seorang staf tanpa divisi tapi KPI-nya
        // berdivisi tetap harus muncul di filter divisi itu.
        return (
          (user?.department ?? "") === departmentFilter ||
          (kpiMap[r.kpiId]?.department ?? "") === departmentFilter
        );
      });
    }

    if (onlyWithNotes) list = list.filter((r) => r.notes && r.notes.trim().length > 0);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const user = userMap[r.userId];
        const kpi = kpiMap[r.kpiId];
        return (
          (user?.name ?? "").toLowerCase().includes(q) ||
          (kpi?.title ?? "").toLowerCase().includes(q) ||
          (r.notes ?? "").toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [reports, departmentFilter, onlyWithNotes, search, userMap, kpiMap]);

  const groupedByDate = useMemo(() => {
    const map: Record<string, DailyReport[]> = {};
    filteredReports.forEach((r) => {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return Object.entries(map).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filteredReports]);

  const totalReports = filteredReports.length;
  const totalWithNotes = filteredReports.filter((r) => r.notes && r.notes.trim().length > 0).length;

  const presets: { key: PresetKey; label: string }[] = [
    { key: "today", label: "Hari Ini" },
    { key: "yesterday", label: "Kemarin" },
    { key: "last3", label: "3 Hari" },
    { key: "last7", label: "7 Hari" },
    { key: "thisMonth", label: "Bulan Ini" },
    { key: "custom", label: "Kustom" },
  ];

  return (
    <div className="space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(({ key, label }) => (
          <Button
            key={key}
            size="sm"
            variant={preset === key ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => applyPreset(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Custom date range */}
      {preset === "custom" && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Dari</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-sm w-[140px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sampai</Label>
            <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-sm w-[140px]" />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Cari nama, KPI, catatan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Semua Divisi</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <button
          onClick={() => setOnlyWithNotes((v) => !v)}
          className={`flex items-center gap-1.5 rounded-md border px-2 h-8 text-xs transition-colors ${onlyWithNotes ? "bg-primary text-primary-foreground border-primary" : "border-input text-muted-foreground hover:bg-accent"}`}
        >
          <MessageSquare className="h-3 w-3" />
          Ada Catatan
        </button>
      </div>

      {/* Stats */}
      <div className="text-xs text-muted-foreground">
        {totalReports} laporan · {totalWithNotes} dengan catatan
      </div>

      {/* Report list */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : groupedByDate.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-sm text-muted-foreground">Tidak ada laporan</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDate.map(([date, dateReports]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">
                  {formatDateDisplay(date)} · {dateReports.length} laporan
                </span>
              </div>
              <div className="space-y-1.5">
                {dateReports.map((r) => {
                  const u = userMap[r.userId];
                  const kpi = kpiMap[r.kpiId];
                  return (
                    <div key={r.id} className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{u?.name ?? r.userId}</span>
                          <span className="text-xs text-muted-foreground">{u?.department ?? "—"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{kpi?.title ?? r.kpiId}</p>
                        {r.notes && (
                          <p className="text-xs text-foreground/70 mt-1 flex items-start gap-1">
                            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                            {r.notes}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatValue(r.actualValue, kpi?.unit ?? "number")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
