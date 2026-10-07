"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { todayISODate, formatNumber, formatCurrency, formatPercentage, getLiveWorkingDaysRemaining, extractKpiDate, cleanKpiTitle, formatDateDisplay } from "@/lib/utils";
import type { KpiAssignmentWithDetails } from "@/types";
import { CalendarDays } from "lucide-react";

function formatValue(value: number, unit: string): string {
  if (unit === "currency") return formatCurrency(value);
  if (unit === "percentage") return formatPercentage(value);
  return formatNumber(value);
}

interface DailyInputFormProps {
  assignment: KpiAssignmentWithDetails;
  open: boolean;
  onClose: () => void;
  /**
   * @deprecated tidak lagi dipakai. Dulu form ini memakai `userId` dari
   * prop halaman untuk menulis `daily_reports.user_id` — artinya parent
   * yang menentukan laporan ini milik siapa, bukan sesi yang sedang
   * login. Sekarang server memakai `me.id`.
   *
   * Tetap diterima supaya pemanggil lama tidak rusak, tapi form ini
   * mengabaikannya.
   */
  userId?: string;
}

export function DailyInputForm({
  assignment,
  open,
  onClose,
}: DailyInputFormProps) {
  const { kpi } = assignment;
  const today = todayISODate();
  const minDate = today.slice(0, 7) + "-01";

  const kpiSpecificDate = extractKpiDate(kpi?.title);
  const initialDate = kpiSpecificDate && kpiSpecificDate <= today ? kpiSpecificDate : today;

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [existingReportId, setExistingReportId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const workingDaysRemaining = getLiveWorkingDaysRemaining(assignment.year, assignment.month);
  const remainingTarget = Math.max(0, assignment.monthlyTarget - assignment.actualTotal);
  const dynamicDailyTarget = workingDaysRemaining > 0 ? remainingTarget / workingDaysRemaining : 0;
  const isDailyKpi = kpi?.period === "daily";
  const finalDailyTarget = isDailyKpi
    ? assignment.monthlyTarget
    : dynamicDailyTarget || assignment.currentDailyTarget || 0;

  const isBelowTarget = value !== "" && !isNaN(parseFloat(value)) && parseFloat(value) < finalDailyTarget;

  const postReport = useApiMutation<Record<string, unknown>, unknown>(
    "/api/daily-reports",
    "POST",
  );
  const patchReport = useApiMutation<Record<string, unknown>, unknown>(
    "/api/daily-reports",
    "PATCH",
  );

  /**
   * formerly `daily_reports.delete().eq("id", existingReportId)` dari
   * browser. `.eq("id", ...)` tanpa cek kepemilikan: cukup menebak id,
   * laporan orang lain bisa dihapus. Endpoint ini menerima
   * `assignmentId` + `date` supaya server bisa memastikan ownership-nya.
   */
  const deleteReport = async () => {
    const res = await fetch(
      withQuery("/api/daily-reports", {
        assignmentId: assignment.id,
        date: selectedDate,
      }),
      { method: "DELETE", credentials: "include" },
    );
    const envelope = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!res.ok) {
      return { ok: false as const, error: envelope?.error ?? "Gagal menghapus laporan." };
    }
    return { ok: true as const, data: null };
  };

  /**
   * formerly `daily_reports.select(...)` dari browser.
   *
   * `userId` diambil dari prop halaman — bukan dari sesi. Sekarang
   * endpoint memakai `me.id` di server, jadi laporan yang tampil dan
   * laporan yang tersimpan tidak mungkin milik orang berbeda.
   */
  useEffect(() => {
    if (!open || !assignment.id) return;

    let cancelled = false;

    async function checkExisting() {
      setIsChecking(true);
      try {
        const res = await fetch(
          withQuery("/api/daily-reports", { assignmentId: assignment.id }),
          { credentials: "include", cache: "no-store" },
        );
        const json = (await res.json()) as {
          ok: boolean;
          data?: {
            reports?: {
              id: string;
              date: string;
              value: number | string;
              notes?: string | null;
            }[];
          };
          error?: string;
        };

        if (cancelled) return;

        const reports = json.data?.reports ?? [];
        const found = reports.find((r) => r.date === selectedDate);

        if (found) {
          setExistingReportId(found.id);
          setValue(String(found.value));
          setNotes(found.notes ?? "");
        } else {
          setExistingReportId(null);
          setValue("");
          setNotes("");
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Gagal memuat laporan harian", e);
          setError("Gagal memuat laporan. Coba lagi.");
        }
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    void checkExisting();
    return () => {
      cancelled = true;
    };
  }, [open, assignment.id, selectedDate]);

  useEffect(() => {
    if (open) {
      setSelectedDate(today);
      setError("");
    }
  }, [open, today]);

  /**
   * formerly `insert` / `update` dari browser.
   *
   * Selain itu, check-then-insert adalah race: ada unique index
   * `(assignment_id, date)`, jadi dua tab yang terbuka bersamaan bisa
   * sama-sama lolos pemeriksaan lalu salah satunya gagal diam-diam.
   * `POST /api/daily-reports` sekarang memakai upsert di server.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      setError("Masukkan angka yang valid.");
      return;
    }

    setSubmitting(true);

    const res = existingReportId
      ? await patchReport.mutate({
          id: existingReportId,
          value: numValue,
          notes: notes.trim(),
        })
      : await postReport.mutate({
          assignmentId: assignment.id,
          kpiId: assignment.kpiId,
          date: selectedDate,
          value: numValue,
          notes: notes.trim(),
        });

    setSubmitting(false);

    if (!res.ok) {
      // formerly semua error jadi "Gagal menyimpan. Coba lagi." — user
      // tidak pernah tahu kalau tanggalnya di masa depan atau valuenya
      // negatif, dan akan menekan Simpan lagi.
      setError(res.error ?? "Gagal menyimpan. Coba lagi.");
      toast.error(res.error ?? "Gagal menyimpan.");
      return;
    }

    toast.success("Laporan harian berhasil disimpan!");
    setValue("");
    setNotes("");
    onClose();
  }

  async function handleDelete() {
    if (!existingReportId) return;
    setSubmitting(true);
    const res = await deleteReport();
    setSubmitting(false);
    setConfirmDelete(false);

    if (!res.ok) {
      setError(res.error ?? "Gagal menghapus laporan. Coba lagi.");
      return;
    }

    toast.success("Laporan berhasil dihapus.");
    setValue("");
    setNotes("");
    onClose();
  }

  if (!kpi) return null;

  const isBackdate = selectedDate !== today;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            {cleanKpiTitle(kpi.title)}
          </DialogTitle>
          {kpiSpecificDate && (
            <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded w-fit mt-1">
              📅 Tugas Khusus: {formatDateDisplay(kpiSpecificDate)}
            </p>
          )}
        </DialogHeader>

        {kpi.type === "quality" ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
              <span className="text-xl font-bold text-purple-600">Q</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Penilaian Khusus</p>
              <p className="text-xs text-muted-foreground mt-1">
                KPI dengan tipe <strong>Quality</strong> hanya dapat diisi dan dinilai langsung oleh HR, Executive, atau Head. Anda tidak perlu mengisi target harian untuk KPI ini.
              </p>
            </div>
            <div className="pt-2">
              <Button onClick={onClose} variant="outline" className="w-full">Tutup</Button>
            </div>
          </div>
        ) : isChecking ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="input-date" className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                Tanggal Input
              </Label>
              <Input
                id="input-date"
                type="date"
                value={selectedDate}
                min={minDate}
                max={today}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setError("");
                }}
                className="cursor-pointer"
              />
              {isBackdate && (
                <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                  ⚠️ Mengisi data mundur untuk tanggal {selectedDate}
                </p>
              )}
            </div>

            {existingReportId && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                <p className="font-semibold">Laporan sudah ada untuk tanggal ini.</p>
                <p className="text-xs mt-0.5 text-amber-700/80">Anda sedang mengedit laporan tanggal {selectedDate}.</p>
              </div>
            )}

            <div id="tour-form-target" className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Target harian: </span>
              <span className="font-semibold">
                {formatValue(kpi.unit === "number" ? Math.ceil(finalDailyTarget) : finalDailyTarget, kpi.unit)}
              </span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="actual-value">
                Realisasi{isBackdate ? ` (${selectedDate})` : " hari ini"}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({kpi.unit === "currency" ? "Rp" : kpi.unit === "percentage" ? "%" : "angka"})
                </span>
              </Label>
              <Input
                id="actual-value"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">
                Catatan <span className="text-xs text-muted-foreground">(opsional)</span>
              </Label>
              <Textarea
                id="notes"
                placeholder="Tambahkan catatan singkat jika ada..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter id="tour-form-footer">
              <div className="flex w-full items-center justify-between gap-2">
                {existingReportId ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-destructive font-medium">Yakin hapus?</span>
                    <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={submitting}>Ya</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={submitting}>Tidak</Button>
                  </div>
                ) : (
                  <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={submitting}>
                    Hapus
                  </Button>
                )
              ) : (
                <div />
              )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Menyimpan..." : existingReportId ? "Update" : "Simpan"}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
