"use client";

import { useCallback, useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { formatDateDisplay, formatNumber, monthName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import type { DailyReport, KPI } from "@/types";

function getMonthRange(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { year, month, start, end };
}

export default function TimHistoryPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const {
    year: selectedYear,
    month: selectedMonthNumber,
    start: from,
    end: to,
  } = getMonthRange(selectedMonth);
  const selectedMonthLabel = `${monthName(selectedMonthNumber)} ${selectedYear}`;

  // Edit state
  const [editing, setEditing] = useState<DailyReport | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  /**
   * formerly: dua query Supabase dari browser, `daily_reports` disaring
   * `user_id` dari AuthContext (bisa dimanipulasi), plus mapping manual
   * seluruh baris KPI ke objek `KPI`.
   *
   * sekarang: `/api/daily-reports?from&to` — server selalu memakai session
   * untuk menentukan user, dan `user_id` dari client diabaikan kalau bukan
   * miliknya sendiri.
   */
  const buildReports = useCallback(
    () => withQuery("/api/daily-reports", { from, to }),
    [from, to],
  );

  const { data, isLoading, refetch } = useApiQuery<{
    reports: DailyReport[];
  }>(buildReports, [from, to]);

  const { data: kpiData } = useApiQuery<{ kpis: KPI[] }>(
    useCallback(
      () => withQuery("/api/kpis", { year: selectedYear, month: selectedMonthNumber }),
      [selectedYear, selectedMonthNumber],
    ),
    [selectedYear, selectedMonthNumber],
  );

  const patchReport = useApiMutation<
    { id: string; value: number; notes: string | null },
    unknown
  >("/api/daily-reports", "PATCH");

  const reports = useMemo(() => data?.reports ?? [], [data]);

  const kpiMap = useMemo(() => {
    const map: Record<string, KPI> = {};
    for (const k of kpiData?.kpis ?? []) map[k.id] = k;
    return map;
  }, [kpiData]);

  function openEdit(r: DailyReport) {
    setEditing(r);
    setEditValue(String(r.actualValue));
    setEditNotes(r.notes ?? "");
    setSaveError("");
  }

  /**
   * formerly: `daily_reports.update({ value, notes }).eq("id", id)` dari
   * browser. Tidak ada cek kepemilikan — cukup menebak id, laporan orang
   * lain bisa diubah. Dan `kpi_assignments.actual_total` tidak di-recalc,
   * jadi skor di dashboard tetap memakai total lama.
   */
  async function handleSave() {
    if (!editing) return;
    const newValue = parseFloat(editValue);

    if (isNaN(newValue) || newValue < 0) {
      setSaveError("Nilai harus angka positif.");
      return;
    }

    setSaving(true);
    setSaveError("");

    const res = await patchReport.mutate({
      id: editing.id,
      value: newValue,
      notes: editNotes || null,
    });
    setSaving(false);

    if (res.ok) {
      setEditing(null);
      void refetch();
    } else {
      setSaveError(res.error ?? "Gagal menyimpan. Coba lagi.");
    }
  }

  // Aggregate per KPI for monthly summary
  const kpiSummary = Object.values(
    reports.reduce<Record<string, { kpiId: string; title: string; total: number; unit: string; count: number }>>((acc, r) => {
      const kpi = kpiMap[r.kpiId];
      if (!acc[r.kpiId]) {
        acc[r.kpiId] = { kpiId: r.kpiId, title: kpi?.title ?? r.kpiId, total: 0, unit: kpi?.unit ?? "number", count: 0 };
      }
      acc[r.kpiId].total += r.actualValue;
      acc[r.kpiId].count += 1;
      return acc;
    }, {})
  );

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Riwayat Input</h2>
            <p className="text-sm text-muted-foreground">
              {reports.length} input untuk {selectedMonthLabel}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Label htmlFor="selected-month" className="text-xs font-medium">
              Pilih Bulan
            </Label>
            <Input
              id="selected-month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-9 w-[180px]"
            />
          </div>
        </div>

        {/* Monthly KPI Achievement Overview */}
        {kpiSummary.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Ringkasan Total Capaian — {selectedMonthLabel}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {kpiSummary.map((s) => {
                const kpi = kpiMap[s.kpiId];
                const formatted =
                  s.unit === "currency"
                    ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(s.total)
                    : s.unit === "percentage"
                    ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(s.total)}%`
                    : new Intl.NumberFormat("id-ID").format(s.total);
                const target = kpi?.monthlyTarget ?? 0;
                const pct = target > 0 ? Math.min((s.total / target) * 100, 100) : 0;
                return (
                  <div key={s.kpiId} className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                    <p className="text-xs font-medium truncate">{s.title}</p>
                    <div className="flex items-end justify-between gap-2">
                      <p className="text-lg font-bold tabular-nums">{formatted}</p>
                      {target > 0 && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          / {s.unit === "currency"
                            ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(target)
                            : s.unit === "percentage"
                            ? `${target}%`
                            : new Intl.NumberFormat("id-ID").format(target)}
                        </p>
                      )}
                    </div>
                    {target > 0 && (
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-primary" : "bg-amber-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">{s.count} input{target > 0 ? ` · ${pct.toFixed(0)}% dari target` : ""}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {reports.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <p className="text-sm font-medium">Belum ada input bulan ini</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => {
              const kpi = kpiMap[r.kpiId];
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {kpi?.title ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateDisplay(r.date)}
                      </p>
                      {r.notes && (
                        <p className="mt-0.5 text-xs text-muted-foreground italic">
                          {r.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatNumber(r.actualValue)}
                        {kpi?.unit === "percentage" ? "%" : ""}
                      </p>
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Riwayat</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {editing ? kpiMap[editing.kpiId]?.title ?? "—" : ""}
              {editing ? ` · ${formatDateDisplay(editing.date)}` : ""}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-value">Nilai Aktual</Label>
              <Input
                id="edit-value"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Catatan (opsional)</Label>
              <textarea
                id="edit-notes"
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Catatan harian..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
