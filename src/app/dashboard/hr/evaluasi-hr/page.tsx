"use client";

import { useCallback, useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { getKpiRole } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PerformanceBadge } from "@/components/ui/badge";
import { formatPercentage, getBrandColor, cleanKpiTitle, monthName, cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PerformanceCategory } from "@/types";

/** Baris dari GET /api/kpi/quality — lihat src/server/dal/quality.ts. */
interface EvaluasiRow {
  assignmentId: string;
  userName: string;
  departmentName: string;
  kpiType: "lead_tim" | "hr" | "quality";
  kpiTitle: string;
  kpiBrand?: string | null;
  monthlyTarget: number;
  actualTotal: number;
  achievementPercentage: number;
  performanceCategory: PerformanceCategory;
  notes: string;
  hasScore: boolean;
}

const typeColor: Record<string, string> = {
  quality: "text-purple-700 bg-purple-50 border-purple-200",
  lead_tim: "text-sky-700 bg-sky-50 border-sky-200",
  hr: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

export default function EvaluasiHrPage() {
  const { user } = useAuth();
  const now = new Date();

  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const selectedYear = parseInt(filterMonth.split("-")[0], 10);
  const selectedMonthNum = parseInt(filterMonth.split("-")[1], 10);

  const role = user ? getKpiRole(user) : null;
  const allowed =
    role === null || role === "hr" || role === "executive" || role === "developer";

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [inputNotes, setInputNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const build = useCallback(
    () =>
      allowed
        ? withQuery("/api/kpi/quality", {
            scope: "all",
            kpiTypes: "lead_tim,hr",
            year: String(selectedYear),
            month: String(selectedMonthNum),
          })
        : null,
    [allowed, selectedYear, selectedMonthNum],
  );

  const { data, isLoading, refetch } = useApiQuery<{ rows: EvaluasiRow[] }>(
    build,
    [allowed, selectedYear, selectedMonthNum],
  );

  const saveScore = useApiMutation<Record<string, unknown>, unknown>(
    "/api/kpi/quality",
    "PUT",
  );

  const rows = useMemo<EvaluasiRow[]>(() => data?.rows ?? [], [data]);

  const notesFromServer = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rows) if (r.notes) map[r.assignmentId] = r.notes;
    return map;
  }, [rows]);

  async function handleSave(row: EvaluasiRow) {
    const rawVal = inputValues[row.assignmentId];
    const value =
      rawVal !== undefined && rawVal.trim() !== ""
        ? parseFloat(rawVal)
        : row.hasScore
        ? row.actualTotal
        : NaN;

    if (!Number.isFinite(value) || value < 0) {
      toast.error("Nilai harus angka dan tidak boleh negatif.");
      return;
    }

    const noteToSave =
      inputNotes[row.assignmentId] !== undefined
        ? inputNotes[row.assignmentId]
        : (notesFromServer[row.assignmentId] ?? null);

    setSaving(row.assignmentId);
    const res = await saveScore.mutate({
      assignmentId: row.assignmentId,
      year: selectedYear,
      month: selectedMonthNum,
      actualTotal: value,
      notes: noteToSave,
    });
    setSaving(null);

    if (res.ok) {
      toast.success("Evaluasi HR disimpan.");
      setInputValues((prev) => ({ ...prev, [row.assignmentId]: "" }));
      void refetch();
    } else {
      toast.error(res.error ?? "Gagal menyimpan evaluasi.");
    }
  }

  // Pengecekan role DI BAWAH semua hook — `role` baru terisi setelah
  // AuthContext selesai memuat, jadi `return` di atas useState bikin
  // jumlah hook berubah antar render (halaman putih).
  if (!allowed) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          Akses tidak diizinkan. Hanya HR yang bisa mengakses halaman ini.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">
            Evaluasi HR (Personality &amp; Work Behavior)
          </h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} KPI Lead Tim / HR aktif • {monthName(selectedMonthNum)} {selectedYear}
          </p>
        </div>
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring self-start"
        />
      </div>

      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            Tidak ada KPI Personality (Lead Tim / HR) aktif bulan ini
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.assignmentId}
              className="rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-bold border shrink-0",
                        typeColor[row.kpiType] ??
                          "text-emerald-700 bg-emerald-50 border-emerald-200",
                      )}
                    >
                      {row.kpiType === "lead_tim" ? "Lead Tim" : "HR"}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border font-semibold shrink-0",
                        getBrandColor(row.kpiBrand),
                      )}
                    >
                      {row.kpiBrand || "Umum"}
                    </span>
                    <p className="text-sm font-medium">{cleanKpiTitle(row.kpiTitle)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.userName} · {row.departmentName}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Aktual: {formatPercentage(row.actualTotal)} /{" "}
                      {formatPercentage(row.monthlyTarget)}
                      {!row.hasScore && (
                        <span className="ml-2 text-[10px] uppercase tracking-widest">
                          belum diinput
                        </span>
                      )}
                    </span>
                  </div>
                  {(inputNotes[row.assignmentId] ??
                    notesFromServer[row.assignmentId]) ? (
                    <div className="mt-2 text-xs bg-muted/60 p-2 rounded border border-border/80">
                      <span className="font-semibold text-muted-foreground">Catatan: </span>
                      <span className="italic text-foreground">
                        {inputNotes[row.assignmentId] ??
                          notesFromServer[row.assignmentId]}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 shrink-0 sm:w-64">
                  <div className="flex items-center gap-2 justify-end">
                    <PerformanceBadge category={row.performanceCategory} />
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      className="w-24 h-8 text-sm"
                      placeholder={
                        row.hasScore
                          ? `${row.actualTotal}%`
                          : "Nilai %"
                      }
                      value={inputValues[row.assignmentId] ?? ""}
                      onChange={(e) =>
                        setInputValues((prev) => ({
                          ...prev,
                          [row.assignmentId]: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <Input
                    type="text"
                    className="h-8 text-sm w-full"
                    placeholder="Catatan / Note"
                    value={
                      inputNotes[row.assignmentId] ??
                      notesFromServer[row.assignmentId] ??
                      ""
                    }
                    onChange={(e) =>
                      setInputNotes((prev) => ({
                        ...prev,
                        [row.assignmentId]: e.target.value,
                      }))
                    }
                  />
                  <Button
                    size="sm"
                    className="h-8 w-full"
                    disabled={
                      saving === row.assignmentId ||
                      (!row.hasScore &&
                        (!inputValues[row.assignmentId] ||
                          inputValues[row.assignmentId].trim() === ""))
                    }
                    onClick={() => handleSave(row)}
                  >
                    {saving === row.assignmentId ? "Menyimpan..." : "Simpan & Update"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
