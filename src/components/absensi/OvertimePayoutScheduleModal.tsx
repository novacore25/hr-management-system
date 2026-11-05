"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, CalendarDays, Check, RotateCcw, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { monthName, formatDateDisplay } from "@/lib/utils";
import { formatDurationDetail } from "@/lib/overtimeHelpers";
import type { OvertimeRequest } from "@/types/absensi";

interface OvertimePayoutScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  overtime: OvertimeRequest | null;
  onSuccess: () => void;
}

export default function OvertimePayoutScheduleModal({
  isOpen,
  onClose,
  overtime,
  onSuccess,
}: OvertimePayoutScheduleModalProps) {
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  const now = useMemo(() => new Date(), []);
  const currentMonthValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentMonthValue);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !overtime) return;
    if (overtime.payoutYear && overtime.payoutMonth) {
      setSelectedPeriod(`${overtime.payoutYear}-${String(overtime.payoutMonth).padStart(2, "0")}`);
    } else {
      // Default ke bulan berjalan atau bulan berikutnya jika lembur di akhir bulan
      setSelectedPeriod(currentMonthValue);
    }
  }, [isOpen, overtime, currentMonthValue]);

  // Lock scroll
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Daftar opsi bulan slip gaji pencairan (dari bulan ini hingga 12 bulan ke depan, plus 2 bulan lalu)
  const periodOptions = useMemo(() => {
    const list: { value: string; label: string; isCurrent: boolean }[] = [];
    // Start from -2 months to +12 months
    const base = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    for (let i = 0; i < 15; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const isCurrent = val === currentMonthValue;
      list.push({
        value: val,
        label: `${monthName(d.getMonth() + 1)} ${d.getFullYear()}${isCurrent ? " (Bulan Berjalan)" : ""}`,
        isCurrent,
      });
    }
    // Jika selectedPeriod di luar rentang, masukkan ke opsi
    if (!list.some((it) => it.value === selectedPeriod)) {
      const [y, m] = selectedPeriod.split("-").map(Number);
      list.unshift({
        value: selectedPeriod,
        label: `${monthName(m)} ${y}`,
        isCurrent: false,
      });
    }
    return list;
  }, [now, currentMonthValue, selectedPeriod]);

  if (!mounted || !isOpen || !overtime) return null;

  const isAlreadyPaid = overtime.payoutStatus === "paid";
  const isScheduled = overtime.payoutStatus === "scheduled" && overtime.payoutMonth != null;

  async function handleSaveSchedule() {
    if (!overtime) return;
    const [yearStr, monthStr] = selectedPeriod.split("-");
    const payoutYear = parseInt(yearStr, 10);
    const payoutMonth = parseInt(monthStr, 10);

    setSaving(true);
    try {
      const res = await fetch("/api/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "schedule-payout",
          id: overtime.id,
          payoutYear,
          payoutMonth,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Gagal menyimpan jadwal pencairan.");
        return;
      }

      toast.success(
        `Lembur berhasil dijadwalkan cair pada Slip Gaji ${monthName(payoutMonth)} ${payoutYear}.`
      );
      onSuccess();
      onClose();
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetSchedule() {
    if (!overtime) return;
    setSaving(true);
    try {
      const res = await fetch("/api/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "schedule-payout",
          id: overtime.id,
          payoutYear: null,
          payoutMonth: null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Gagal membatalkan jadwal.");
        return;
      }

      toast.success("Jadwal pencairan dibatalkan. Lembur ditahan dari payroll.");
      onSuccess();
      onClose();
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={() => !saving && onClose()}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-[var(--ab-bg-surface)] border border-[var(--ab-border)] rounded-[28px] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--ab-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
              <CalendarDays size={20} />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-[var(--ab-text-main)]">
                Jadwal Pencairan Lembur
              </h2>
              <p className="text-[11px] font-bold text-[var(--ab-text-dim)]">
                Kebijakan Pencairan Lembur (&gt; 30 Hari)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-xs">
          {/* Info Singkat Lembur */}
          <div className="p-4 rounded-2xl bg-[var(--ab-bg-main)] border border-[var(--ab-border)] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-[var(--ab-text-dim)]">Karyawan</span>
              <span className="font-black text-[var(--ab-text-main)]">{overtime.userName ?? "-"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-[var(--ab-text-dim)]">Tanggal Kerja Lembur</span>
              <span className="font-bold text-[var(--ab-text-main)]">
                {formatDateDisplay(overtime.overtimeDate)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-[var(--ab-text-dim)]">Durasi Sah</span>
              <span className="font-black font-mono text-[var(--ab-text-main)]">
                {formatDurationDetail(overtime.finalDurationMinutes ?? 0)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-[var(--ab-border)]">
              <span className="text-[11px] font-bold text-[var(--ab-text-dim)]">Status Upah</span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                FINAL SAH
              </span>
            </div>
          </div>

          {/* Form Pilihan Periode Slip Gaji */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-[var(--ab-text-dim)] block">
              Pilih Periode Slip Gaji untuk Pencairan:
            </label>
            <div className="relative">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                disabled={saving || isAlreadyPaid}
                className="w-full px-4 py-3 bg-[var(--ab-bg-main)] border border-[var(--ab-border)] rounded-xl text-sm font-bold text-[var(--ab-text-main)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 cursor-pointer disabled:opacity-50"
              >
                {periodOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-start gap-1.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-600 dark:text-blue-400">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                Lembur ini <strong>hanya akan masuk ke modul Payroll</strong> pada periode bulan yang Anda pilih di atas. Selama belum dijadwalkan, lembur tidak akan dicairkan di slip gaji mana pun.
              </span>
            </div>
          </div>

          {isAlreadyPaid && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              <AlertCircle size={15} />
              <span>Slip gaji untuk periode ini sudah resmi diterbitkan (Published).</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[var(--ab-border)] bg-[var(--ab-bg-surface)] flex items-center justify-between gap-3">
          {isScheduled && !isAlreadyPaid ? (
            <button
              type="button"
              onClick={handleResetSchedule}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              title="Batalkan jadwal dan tahan dari payroll"
            >
              <RotateCcw size={13} />
              <span>Tahan / Batal Jadwal</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl font-bold text-xs text-[var(--ab-text-dim)] hover:bg-[var(--ab-bg-main)] transition"
            >
              Batal
            </button>
            {!isAlreadyPaid && (
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-blue-500/20 transition hover:-translate-y-0.5 disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Check size={14} />
                    <span>Konfirmasi Jadwal Cair</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
