"use client";

import { useCallback, useMemo, useState } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { getKpiRole } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PerformanceBadge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import {
  cn,
  formatPercentage,
  getPerformanceCategory,
  monthName,
} from "@/lib/utils";
import { toast } from "sonner";
import type { PerformanceCategory } from "@/types";

/** Baris dari GET /api/kpi/quality — lihat src/server/dal/quality.ts. */
interface QualityRow {
  assignmentId: string;
  userId: string;
  userName: string;
  departmentName: string;
  kpiTitle: string;
  monthlyTarget: number;
  actualTotal: number;
  achievementPercentage: number;
  performanceCategory: PerformanceCategory;
  notes: string;
  hasScore: boolean;
}

type Grouped = Record<string, Record<string, { userName: string; items: QualityRow[] }>>;

export default function HeadQualityPage() {
  const { user } = useAuth();
  const now = new Date();

  const role = user ? getKpiRole(user) : null;
  const allowed = role === null || role !== "tim";

  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const selectedYear = parseInt(filterMonth.split("-")[0], 10);
  const selectedMonthNum = parseInt(filterMonth.split("-")[1], 10);

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [noteValues, setNoteValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  /**
   * formerly: halaman mengambil `user.managedDepartments` dari AuthContext,
   * menyaring daftar user di browser, lalu mengirim `user_id` mana yang
   * boleh ditanyakan. Divisi itu datang dari browser, jadi Head bisa
   * mengubahnya dan membaca divisi orang lain.
   *
   * sekarang: `scope=managed` — server yang membaca `managed_departments`
   * dari baris `users` milik aktornya dan menyaring di SQL.
   */
  const build = useCallback(
    () =>
      allowed
        ? withQuery("/api/kpi/quality", {
            scope: "managed",
            year: String(selectedYear),
            month: String(selectedMonthNum),
          })
        : null,
    [allowed, selectedYear, selectedMonthNum],
  );

  const { data, isLoading, refetch } = useApiQuery<{ rows: QualityRow[] }>(
    build,
    [allowed, selectedYear, selectedMonthNum],
  );

  const saveScore = useApiMutation<Record<string, unknown>, unknown>(
    "/api/kpi/quality",
    "PUT",
  );

  const rows = useMemo<QualityRow[]>(() => data?.rows ?? [], [data]);

  const notesFromServer = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rows) if (r.notes) map[r.assignmentId] = r.notes;
    return map;
  }, [rows]);

  const grouped = useMemo<Grouped>(() => {
    const map: Grouped = {};
    for (const row of rows) {
      const dept = row.departmentName || "—";
      if (!map[dept]) map[dept] = {};
      if (!map[dept][row.userId]) {
        map[dept][row.userId] = { userName: row.userName, items: [] };
      }
      map[dept][row.userId].items.push(row);
    }
    return map;
  }, [rows]);

  const deptNames = useMemo(() => Object.keys(grouped).sort((a, b) => a.localeCompare(b)), [grouped]);

  /**
   * formerly: upsert ke monthly_scores lalu update kpi_assignments — dua
   * request dari browser, dengan `achievement_percentage` dihitung di
   * client dan `monthly_scores.monthly_target` tidak pernah ditulis.
   *
   * sekarang: satu request; percentage, target, dan kelayakan divisi
   * semuanya diputuskan server.
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
      year: selectedYear,
      month: selectedMonthNum,
      actualTotal: value,
      notes: noteValues[assignmentId] ?? null,
    });
    setSaving(null);

    if (res.ok) {
      toast.success("Nilai KPI kualitas disimpan.");
      setInputValues((prev) => ({ ...prev, [assignmentId]: "" }));
      void refetch();
    } else {
      toast.error(res.error ?? "Gagal menyimpan nilai.");
    }
  }

  function toggleDept(dept: string) {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) {
        next.delete(dept);
        const uids = Object.keys(grouped[dept] ?? {});
        setExpandedUsers((p) => {
          const n = new Set(p);
          uids.forEach((id) => n.delete(dept + id));
          return n;
        });
      } else {
        next.add(dept);
      }
      return next;
    });
  }

  function toggleUser(dept: string, uid: string) {
    const key = dept + uid;
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Pengecekan role dipindah ke BAWAH semua hook. formerly `return`
  // bersyarat ada sebelum useState, padahal `role` baru terisi setelah
  // AuthContext selesai memuat — jumlah hook berubah antar render dan
  // React melempar "Rendered fewer hooks than expected" (halaman putih).
  if (!allowed) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">Akses tidak diizinkan.</p>
      </div>
    );
  }

  const totalItems = rows.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Input KPI Kualitas Tim</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Memuat..."
              : `${totalItems} KPI Kualitas & Lead Tim • ${monthName(selectedMonthNum)} ${selectedYear} • ${deptNames.join(", ") || "—"}`}
          </p>
        </div>
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring self-start"
        />
      </div>

      {!isLoading && deptNames.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpandedDepts(new Set(deptNames))}
          >
            Expand Tim
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExpandedDepts(new Set(deptNames));
              const allKeys = deptNames.flatMap((d) =>
                Object.keys(grouped[d] ?? {}).map((uid) => d + uid),
              );
              setExpandedUsers(new Set(allKeys));
            }}
          >
            Expand Staff
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExpandedDepts(new Set());
              setExpandedUsers(new Set());
            }}
          >
            Collapse All
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : deptNames.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            Tidak ada KPI kualitas aktif bulan ini
          </p>
          {role === "head" && (
            <p className="text-xs text-muted-foreground/70">
              Divisi yang Anda kelola belum punya penugasan KPI bertipe quality
              atau lead tim.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {deptNames.map((dept) => {
            const usersInDept = grouped[dept] ?? {};
            const isDeptOpen = expandedDepts.has(dept);
            const totalKpi = Object.values(usersInDept).reduce(
              (s, u) => s + u.items.length,
              0,
            );

            return (
              <div key={dept} className="rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => toggleDept(dept)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-accent/50 transition-colors text-left"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
                      isDeptOpen && "rotate-180",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{dept}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {Object.keys(usersInDept).length} staff · {totalKpi} KPI
                      kualitas
                    </span>
                  </div>
                </button>

                {isDeptOpen && (
                  <div className="border-t border-border bg-muted/20 divide-y divide-border">
                    {Object.entries(usersInDept).map(([uid, { userName, items }]) => {
                      const isUserOpen = expandedUsers.has(dept + uid);
                      const avgPct =
                        items.length > 0
                          ? items.reduce(
                              (s, i) => s + i.achievementPercentage,
                              0,
                            ) / items.length
                          : 0;

                      return (
                        <div key={uid}>
                          <button
                            onClick={() => toggleUser(dept, uid)}
                            className="w-full flex items-center gap-3 px-6 py-3 hover:bg-accent/40 transition-colors text-left"
                          >
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                                isUserOpen && "rotate-180",
                              )}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium">{userName}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {items.length} KPI kualitas
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-semibold tabular-nums">
                                {formatPercentage(avgPct)}
                              </span>
                              <PerformanceBadge
                                category={getPerformanceCategory(avgPct)}
                              />
                            </div>
                          </button>

                          {isUserOpen && (
                            <div className="px-6 pb-3 space-y-2 bg-background/50">
                              {items.map((item) => (
                                <div
                                  key={item.assignmentId}
                                  className="rounded-lg border border-border bg-card px-4 py-3 flex flex-col gap-3"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium">
                                        {item.kpiTitle}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Aktual: {formatPercentage(item.actualTotal)} /{" "}
                                        {formatPercentage(item.monthlyTarget)}
                                        {!item.hasScore && (
                                          <span className="ml-2 text-[10px] uppercase tracking-widest">
                                            belum diinput
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <PerformanceBadge
                                        category={item.performanceCategory}
                                      />
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        step="any"
                                        min="0"
                                        className="w-24 h-8 text-sm"
                                        placeholder="Nilai %"
                                        value={inputValues[item.assignmentId] ?? ""}
                                        onChange={(e) =>
                                          setInputValues((prev) => ({
                                            ...prev,
                                            [item.assignmentId]: e.target.value,
                                          }))
                                        }
                                      />
                                      <Button
                                        size="sm"
                                        className="h-8"
                                        disabled={
                                          saving === item.assignmentId ||
                                          !inputValues[item.assignmentId]
                                        }
                                        onClick={() => handleSave(item.assignmentId)}
                                      >
                                        {saving === item.assignmentId
                                          ? "..."
                                          : "Simpan"}
                                      </Button>
                                    </div>
                                  </div>
                                  <textarea
                                    rows={2}
                                    placeholder="Catatan evaluasi (opsional)..."
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                                    value={
                                      noteValues[item.assignmentId] ??
                                      notesFromServer[item.assignmentId] ??
                                      ""
                                    }
                                    onChange={(e) =>
                                      setNoteValues((prev) => ({
                                        ...prev,
                                        [item.assignmentId]: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
