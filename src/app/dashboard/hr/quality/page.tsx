"use client";

import { useCallback, useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { getKpiRole } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPercentage } from "@/lib/utils";
import { PerformanceBadge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { PerformanceCategory } from "@/types";

/**
 * Baris dari GET /api/kpi/quality.
 *
 * formerly halaman ini menyusun sendiri objek `KpiAssignment` dan `KPI`
 * dari hasil nested-select Supabase, lalu mencocokkan nama user lewat
 * `Map` yang dibangun dari daftar user terpisah. Sekarang server yang
 * merakitnya, jadi tidak ada ada dua sumber untuk angka yang sama.
 */
interface QualityRow {
  assignmentId: string;
  userName: string;
  departmentName: string;
  kpiTitle: string;
  monthlyTarget: number;
  actualTotal: number;
  achievementPercentage: number;
  performanceCategory: PerformanceCategory;
  hasScore: boolean;
}

export default function HrQualityPage() {
  const { user } = useAuth();
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const role = user ? getKpiRole(user) : null;
  const allowed =
    role === null ||
    role === "hr" ||
    role === "executive" ||
    role === "developer";

  const build = useCallback(
    () =>
      allowed
        ? withQuery("/api/kpi/quality", {
            year: String(year),
            month: String(month),
          })
        : null,
    [allowed, year, month],
  );

  const { data, isLoading, refetch } = useApiQuery<{ rows: QualityRow[] }>(
    build,
    [allowed, year, month],
  );

  const saveScore = useApiMutation<Record<string, unknown>, unknown>(
    "/api/kpi/quality",
    "PUT",
  );

  const rows = useMemo(() => data?.rows ?? [], [data]);

  /**
   * formerly: 2 operasi dari browser — upsert ke monthly_scores lalu
   * update kpi_assignments, dengan `achievement_percentage` dihitung di
   * client. Form mengetik "80" lalu menulis apa pun yang diketik, termasuk
   * di luar 0-100. `monthly_scores.monthly_target` juga tidak pernah
   * ditulis, jadi kolom itu selalu 0 padahal kolomnya ada dan dipakai
   * untuk laporan.
   *
   * sekarang: satu request, percentage dan target dihitung server.
   */
  async function handleSave(assignmentId: string) {
    const value = parseFloat(inputValues[assignmentId]);

    if (!Number.isFinite(value) || value < 0) {
      toast.error("Nilai harus angka dan tidak boleh negatif.");
      return;
    }

    setSaving(assignmentId);

    const res = await saveScore.mutate({ assignmentId, year, month, actualTotal: value });

    setSaving(null);

    if (res.ok) {
      toast.success("Nilai KPI kualitas disimpan.");
      setInputValues((prev) => ({ ...prev, [assignmentId]: "" }));
      void refetch();
    } else {
      toast.error(res.error ?? "Gagal menyimpan nilai.");
    }
  }

  // Pengecekan role dipindah ke BAWAH semua hook.
  //
  // formerly `return` bersyarat ada sebelum pemanggilan useState, padahal
  // `role` baru terisi setelah AuthContext selesai memuat profil. Render
  // pertama: role = null, jadi lolos ke bawah dan hook dipanggil.
  // Render kedua: role = "tim", jadi return lebih awal — jumlah hook
  // berubah dan React melempar "Rendered fewer hooks than expected",
  // yang membuat seluruh halaman putih.
  //
  // Pengecekan yang sebenarnya sekarang juga ada di server
  // (requireKpiRole), jadi baris ini cuma untuk UX.
  if (!allowed) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Akses tidak diizinkan.</p>
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
        <h2 className="text-base font-semibold">Input KPI Kualitas</h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} KPI kualitas aktif bulan ini
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            Tidak ada KPI kualitas aktif bulan ini
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
                  <p className="text-xs text-muted-foreground">
                    Aktual: {formatPercentage(row.actualTotal)} /{" "}
                    {formatPercentage(row.monthlyTarget)}
                    {!row.hasScore && (
                      <span className="ml-2 text-[10px] uppercase tracking-widest">
                        belum diinput
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={
                      saving === row.assignmentId ||
                      !inputValues[row.assignmentId]
                    }
                    onClick={() => handleSave(row.assignmentId)}
                  >
                    {saving === row.assignmentId ? "..." : "Simpan"}
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