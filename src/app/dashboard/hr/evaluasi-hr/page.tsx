"use client";

import { useCallback, useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { getKpiRole } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PerformanceBadge } from "@/components/ui/badge";
import { formatPercentage } from "@/lib/utils";
import { toast } from "sonner";
import type { PerformanceCategory } from "@/types";

/** Baris dari GET /api/kpi/quality — lihat src/server/dal/quality.ts. */
interface EvaluasiRow {
  assignmentId: string;
  userName: string;
  departmentName: string;
  kpiType: "lead_tim" | "hr" | "quality";
  kpiTitle: string;
  monthlyTarget: number;
  actualTotal: number;
  achievementPercentage: number;
  performanceCategory: PerformanceCategory;
  notes: string;
  hasScore: boolean;
}

export default function EvaluasiHrPage() {
  const { user } = useAuth();
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const role = user ? getKpiRole(user) : null;
  const allowed =
    role === null || role === "hr" || role === "executive" || role === "developer";

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [inputNotes, setInputNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  /**
   * formerly: halaman menyaring `kpis.type` lewat `.in("kpis.type", [...])`
   * dari browser, lalu mencocokkan nama user lewat daftar user terpisah
   * (`if (users.length > 0) load()` — kalau daftar itu kosong, halaman
   * menampilkan "Tidak ada KPI" padahal assignment-nya ada).
   *
   * sekarang: `kpiTypes=lead_tim,hr` adalah filter SQL, dan nama user
   * sudah ikut di-select. Halaman tidak bergantung pada daftar user.
   */
  const build = useCallback(
    () =>
      allowed
        ? withQuery("/api/kpi/quality", {
            scope: "all",
            kpiTypes: "lead_tim,hr",
            year: String(year),
            month: String(month),
          })
        : null,
    [allowed, year, month],
  );

  const { data, isLoading, refetch } = useApiQuery<{ rows: EvaluasiRow[] }>(
    build,
    [allowed, year, month],
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

  /**
   * formerly: dua operasi dari browser dengan percentage dihitung di client.
   * Sekarang satu request; percentage dan target dihitung server.
   */
  async function handleSave(assignmentId: string) {
    const value = parseFloat(inputValues[assignmentId]);

    if (!Number.isFinite(value) || value < 0) {
      toast.error("Nilai harus angka dan tidak boleh negatif.");
      return;
    }

    setSaving(assignmentId);
    const res = await saveScore.mutate({
      assignmentId,
      year,
      month,
      actualTotal: value,
      notes: inputNotes[assignmentId] ?? null,
    });
    setSaving(null);

    if (res.ok) {
      toast.success("Evaluasi HR disimpan.");
      setInputValues((prev) => ({ ...prev, [assignmentId]: "" }));
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
      <div>
        <h2 className="text-base font-semibold">
          Evaluasi HR (Personality &amp; Work Behavior)
        </h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} KPI Lead Tim / HR aktif bulan ini
        </p>
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
                  <p className="text-sm font-medium">{row.kpiTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.userName} · {row.departmentName}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">
                      {row.kpiType === "lead_tim" ? "Lead Tim" : "HR"}
                    </span>
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
                    <div className="mt-2 text-xs bg-slate-50 dark:bg-slate-800/50 p-2 rounded border border-slate-100 dark:border-slate-800">
                      <span className="font-semibold text-slate-500">Note: </span>
                      <span className="italic">
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
                      placeholder="Nilai %"
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
                    value={inputNotes[row.assignmentId] ?? ""}
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
                      !inputValues[row.assignmentId]
                    }
                    onClick={() => handleSave(row.assignmentId)}
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
