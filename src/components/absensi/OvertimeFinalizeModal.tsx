"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Check, FileText, Info, RefreshCw, HandCoins, CalendarRange } from "lucide-react";
import { useApiMutation } from "@/hooks/useApi";
import { toast } from "sonner";
import {
  formatDurationDetail,
  formatRp,
  isWeekend,
  calculateOvertimeRates,
  calculateOvertimePayDepnaker
} from "@/lib/overtimeHelpers";

interface OvertimeFinalizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  overtime: any | null;
  baseSalary: number;
  onSuccess: () => void;
}

export default function OvertimeFinalizeModal({
  isOpen,
  onClose,
  overtime,
  baseSalary,
  onSuccess,
}: OvertimeFinalizeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [finalHours, setFinalHours] = useState(0);
  const [finalMinutes, setFinalMinutes] = useState(0);
  const [dayType, setDayType] = useState<"weekday" | "weekend" | "holiday">("weekday");

  // Rate & Pay states (all editable)
  const [hourlyBaseRate, setHourlyBaseRate] = useState(0);
  const [totalPayOverride, setTotalPayOverride] = useState<number | null>(null);
  const [maxPayCap, setMaxPayCap] = useState<number | null>(null);
  const [finalNotes, setFinalNotes] = useState("");
  /**
   * Wajib diisi kalau `totalPayOverride` dipakai. Tanpa ini, override
   * jadi cara diam-diam mengubah gaji tanpa jejak.
   */
  const [overrideReason, setOverrideReason] = useState("");

  const patchOvertime = useApiMutation<Record<string, unknown>, unknown>(
    "/api/overtime",
    "PATCH",
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize form whenever modal opens or overtime changes
  useEffect(() => {
    if (!isOpen || !overtime) return;

    // 1. Initial duration
    const defaultMins =
      overtime.finalDurationMinutes ??
      overtime.actualDurationMinutes ??
      overtime.approvedDurationMinutes ??
      overtime.requestedDurationMinutes ??
      0;

    const initialHours = Math.floor(defaultMins / 60);
    const initialMins = defaultMins % 60;
    setFinalHours(initialHours);
    setFinalMinutes(initialMins);

    // 2. Day type (weekday vs weekend/holiday)
    const isWeekendDay = isWeekend(overtime.overtimeDate);
    const initialDayType =
      overtime.dayType || (isWeekendDay ? "holiday" : "weekday");
    setDayType(initialDayType as any);

    // 3. Calculate benchmark rate
    const calculated = calculateOvertimeRates(baseSalary);

    // Check if this overtime request was previously finalized
    const savedPayNum = Number(overtime.totalOvertimePay);
    const hasLegitimateSavedPay =
      overtime.status === "finalized" &&
      Number.isFinite(savedPayNum) &&
      savedPayNum > 0;

    if (hasLegitimateSavedPay) {
      const savedHourlyRate = Number(overtime.hourlyBaseRate);
      const baseRate =
        Number.isFinite(savedHourlyRate) && savedHourlyRate > 0
          ? savedHourlyRate
          : calculated.hourlyBaseRate;

      setHourlyBaseRate(baseRate);

      const expectedCalc = calculateOvertimePayDepnaker(defaultMins, baseRate, initialDayType as any);
      const wasManualOverride =
        overtime.calculationBreakdown?.isOverride === true ||
        (Number.isFinite(savedPayNum) && Math.abs(savedPayNum - expectedCalc) > 5);

      setTotalPayOverride(wasManualOverride ? savedPayNum : null);
      // Alasannya ikut dipulihkan, kalau pengajuan ini pernah di-override.
      setOverrideReason(overtime.calculationBreakdown?.overrideReason ?? "");
    } else {
      // Fresh finalize
      setHourlyBaseRate(calculated.hourlyBaseRate);
      setTotalPayOverride(null);
      setOverrideReason("");
    }

    const savedCap = overtime.calculationBreakdown?.maxPayCap ?? null;
    setMaxPayCap(typeof savedCap === "number" && savedCap > 0 ? savedCap : null);

    setFinalNotes(overtime.finalNotes || "");
  }, [isOpen, overtime, baseSalary]);

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!mounted || !isOpen || !overtime || typeof document === "undefined") return null;

  // Calculation values
  const totalDurationMinutes = Math.max(0, finalHours * 60 + finalMinutes);
  
  const uncappedCalculatedPay = calculateOvertimePayDepnaker(
    totalDurationMinutes,
    hourlyBaseRate,
    dayType
  );

  // Plafon / Budget Cap logic
  const isCapActive = maxPayCap !== null && maxPayCap > 0;
  const isOverCap = isCapActive && uncappedCalculatedPay > maxPayCap;
  const cappedCalculatedPay = isOverCap ? maxPayCap : uncappedCalculatedPay;

  const finalTotalPay = totalPayOverride !== null ? totalPayOverride : cappedCalculatedPay;

  const standardCalculated = calculateOvertimeRates(baseSalary);

  const resetToFormula = () => {
    setHourlyBaseRate(standardCalculated.hourlyBaseRate);
    setTotalPayOverride(null);
    setMaxPayCap(null);
    toast.success("Berhasil menghitung ulang tarif sesuai UU Cipta Kerja (1/173 x Gaji Pokok)!");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overtime) return;
    if (totalDurationMinutes <= 0) {
      toast.error("Durasi lembur harus lebih dari 0 menit.");
      return;
    }
    if (totalPayOverride !== null && !overrideReason.trim()) {
      toast.error("Override gaji wajib disertai alasan.");
      return;
    }

    setSaving(true);
    const tid = toast.loading("Menyimpan finalisasi & upah lembur...");

    try {
      /**
       * formerly seluruh perhitungan gaji dilakukan di sini dan yang
       * dikirim ke database hanyalah angkanya — jadi client bebas
       * mengirim `total_overtime_pay` sesuka hati, dan angka itu
       * langsung dipakai untuk menghitung slip gaji.
       *
       * sekarang server yang menghitung. Yang dikirim hanya
       * keputusannya: tarif per jam, plafon, dan override manual
       * (wajib disertai alasan). Form ini masih menampilkan pratinjau
       * supaya HR bisa memeriksa angkanya sebelum menekan Simpan — tapi
       * yang tersimpan adalah hitungan server.
       */
      const res = await patchOvertime.mutate({
        id: overtime.id,
        action: "finalize",
        dayType,
        hourlyBaseRate,
        maxPayCap: isCapActive ? maxPayCap : null,
        totalPayOverride,
        overrideReason: totalPayOverride !== null ? (overrideReason || "").trim() : null,
        finalNotes: finalNotes.trim() || null,
      });

      if (!res.ok) {
        toast.error(res.error ?? "Gagal finalisasi.", { id: tid });
        return;
      }

      toast.success(
        `Lembur disahkan: ${formatDurationDetail(totalDurationMinutes)} (${formatRp(finalTotalPay)})!`,
        { id: tid }
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error finalizing overtime:", err);
      toast.error("Gagal finalisasi: " + (err?.message ?? "terjadi kesalahan"), { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const currentFormula = standardCalculated.hourlyBaseRate !== hourlyBaseRate;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />
      <div className="relative w-full max-w-lg bg-[var(--ab-bg-surface)] rounded-[32px] border border-[var(--ab-border)] shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-[var(--ab-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20">
              <HandCoins size={18} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-[var(--ab-text-main)] leading-none mb-1">
                Finalisasi & Upah
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--ab-text-dim)]">
                Kalkulasi Lembur Resmi
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

        <div className="p-6 overflow-y-auto ab-scrollbar space-y-6">
          {/* Day Type Selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--ab-text-dim)] block">
              Jenis Hari Lembur (Pengaruh Multiplier)
            </label>
            <div className="grid grid-cols-2 gap-2 bg-[var(--ab-bg-main)] p-1 rounded-2xl border border-[var(--ab-border)]">
              <button
                type="button"
                onClick={() => {
                  setDayType("weekday");
                  setTotalPayOverride(null);
                }}
                className={`py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  dayType === "weekday"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
                }`}
              >
                Hari Kerja
              </button>
              <button
                type="button"
                onClick={() => {
                  setDayType("holiday");
                  setTotalPayOverride(null);
                }}
                className={`py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  dayType === "holiday" || dayType === "weekend"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
                }`}
              >
                Libur
              </button>
            </div>
          </div>

          {/* Reminder Box: Acuan Gaji Pokok */}
          <div className="p-4 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] text-xs space-y-3">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-[var(--ab-text-dim)] flex-wrap gap-2">
              <span className="flex items-center gap-1">
                <Info size={13} className="text-blue-500" /> Acuan Rumus Depnaker
              </span>
              <button
                type="button"
                onClick={resetToFormula}
                className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-black text-[9px] uppercase tracking-wider flex items-center gap-1 border border-amber-500/30 transition-colors"
                title="Hitung ulang otomatis tarif berdasarkan gaji pokok"
              >
                <RefreshCw size={11} /> Reset
              </button>
            </div>

            <div className="p-3 bg-[var(--ab-bg-surface)] rounded-xl border border-[var(--ab-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[9px] font-bold text-[var(--ab-text-dim)] block mb-0.5">
                  Gaji Pokok Karyawan
                </span>
                <span className="font-mono font-black text-[var(--ab-text-main)] text-sm">
                  {formatRp(baseSalary)}
                </span>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-[9px] font-bold text-[var(--ab-text-dim)] block mb-0.5">
                  Upah Sejam (1/173 x Gaji Pokok)
                </span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-xs">
                  {formatRp(standardCalculated.hourlyBaseRate)} / Jam
                </span>
              </div>
            </div>
          </div>

          {/* Form Body */}
          <form id="finalizeForm" onSubmit={handleSubmit} className="space-y-5">
            {/* 1. Durasi Final */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--ab-text-dim)] flex items-center justify-between">
                <span>Total Jam Lembur Final</span>
                <span className="text-amber-500 font-bold">
                  {formatDurationDetail(totalDurationMinutes)}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 bg-[var(--ab-bg-main)] p-2 rounded-xl border border-[var(--ab-border)] focus-within:border-amber-500/50 transition-colors">
                  <input
                    type="number" min="0" max="24"
                    value={finalHours}
                    onChange={(e) => {
                      setFinalHours(Math.max(0, parseInt(e.target.value) || 0));
                      setTotalPayOverride(null);
                    }}
                    className="ab-input text-center text-base font-black py-2 w-full bg-[var(--ab-bg-surface)] font-mono focus:ring-0"
                  />
                  <span className="text-xs font-bold text-[var(--ab-text-dim)] pr-2">Jam</span>
                </div>
                <div className="flex items-center gap-2 bg-[var(--ab-bg-main)] p-2 rounded-xl border border-[var(--ab-border)] focus-within:border-amber-500/50 transition-colors">
                  <input
                    type="number" min="0" max="59" step="1"
                    value={finalMinutes}
                    onChange={(e) => {
                      setFinalMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)));
                      setTotalPayOverride(null);
                    }}
                    className="ab-input text-center text-base font-black py-2 w-full bg-[var(--ab-bg-surface)] font-mono focus:ring-0"
                  />
                  <span className="text-xs font-bold text-[var(--ab-text-dim)] pr-2">Menit</span>
                </div>
              </div>
            </div>

            {/* 2. Breakdown Form (Editable) */}
            <div className="space-y-4 p-4 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)]">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--ab-text-dim)] block">
                Pengaturan Variabel Upah Lembur
              </span>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--ab-text-main)] flex items-center justify-between">
                  <span>Upah Sejam Aktual</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-[var(--ab-text-dim)]">Rp</span>
                  <input
                    type="number"
                    value={hourlyBaseRate || ""}
                    onChange={(e) => {
                      setHourlyBaseRate(parseInt(e.target.value) || 0);
                      setTotalPayOverride(null);
                    }}
                    className="ab-input w-full pl-9 font-mono font-black"
                    placeholder="0"
                  />
                </div>
                {currentFormula && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1.5 bg-amber-50 dark:bg-amber-900/10 p-2 rounded-lg border border-amber-200/50 dark:border-amber-900/30 flex items-start gap-1.5">
                    <Info size={12} className="shrink-0 mt-0.5" />
                    <span>Perhatian: Nominal upah sejam yang dimasukkan HR berbeda dengan standar (1/173). Nominal sesuai upah sejam sistem = {formatRp(standardCalculated.hourlyBaseRate)}.</span>
                  </p>
                )}
              </div>

              {/* Cap Limit */}
              <div className="space-y-1.5 pt-3 border-t border-[var(--ab-border)]">
                <label className="text-xs font-bold text-[var(--ab-text-main)]">Plafon / Maksimal Upah (Opsional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-[var(--ab-text-dim)]">Rp</span>
                  <input
                    type="number"
                    value={maxPayCap || ""}
                    onChange={(e) => {
                      setMaxPayCap(e.target.value ? parseInt(e.target.value) : null);
                      setTotalPayOverride(null);
                    }}
                    className="ab-input w-full pl-9 font-mono"
                    placeholder="Biarkan kosong jika tidak ada limit"
                  />
                </div>
                <p className="text-[10px] text-[var(--ab-text-dim)]">Jika hasil perhitungan lebih dari plafon, upah akan otomatis dipotong sesuai plafon.</p>
              </div>
            </div>

            {/* 3. Final Total */}
            <div className="p-5 bg-gradient-to-br from-green-500/10 via-[var(--ab-bg-main)] to-amber-500/10 rounded-2xl border border-green-500/20 space-y-3">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-[var(--ab-text-dim)]">
                <span>Total Upah Final</span>
                {isOverCap && <span className="text-rose-500 px-2 py-0.5 bg-rose-500/10 rounded-md">Terkena Plafon</span>}
              </div>
              
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-[var(--ab-text-dim)]">Rp</span>
                <input
                  type="number"
                  value={finalTotalPay || ""}
                  onChange={(e) => {
                    setTotalPayOverride(e.target.value ? parseInt(e.target.value) : 0);
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-[var(--ab-bg-surface)] border-2 border-green-500/30 rounded-xl text-xl font-black font-mono text-[var(--ab-text-main)] focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-500/10 transition-all"
                />
              </div>

              {totalPayOverride !== null && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] font-bold text-amber-500 flex items-center justify-end gap-1">
                    <Info size={12} /> Angka di-override manual.
                  </p>
                  {/*
                    Server menolak override tanpa alasan, jadi alasannya
                    harus diminta di sini juga — kalau tidak, user baru
                    tahu setelah menekan Simpan.
                  */}
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Alasan override (wajib diisi)"
                    className="w-full px-3 py-2 bg-[var(--ab-bg-surface)] border border-amber-500/30 rounded-lg text-xs text-[var(--ab-text-main)] placeholder:text-[var(--ab-text-dim)] focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-[var(--ab-text-dim)]">
                    Alasan ini tersimpan di riwayat dan ikut ke slip gaji.
                  </p>
                </div>
              )}

              {isOverCap && totalPayOverride === null && (
                <div className="flex justify-between items-center text-[10px] font-bold text-rose-500 pt-2 border-t border-rose-500/10">
                  <span>Aslinya: {formatRp(uncappedCalculatedPay)}</span>
                  <span>Dipotong Plafon: {formatRp(maxPayCap)}</span>
                </div>
              )}
            </div>

            {/* 4. Notes */}
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-[var(--ab-text-dim)] flex items-center gap-1.5">
                <FileText size={12} /> Catatan HR untuk Slip Gaji (Opsional)
              </label>
              <textarea
                value={finalNotes}
                onChange={(e) => setFinalNotes(e.target.value)}
                className="ab-input w-full min-h-[80px] text-sm"
                placeholder="Misal: Penyesuaian lembur ekstra direksi..."
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[var(--ab-border)] bg-[var(--ab-bg-surface)] flex gap-3 rounded-b-[32px] shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-5 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-[var(--ab-text-dim)] hover:bg-[var(--ab-bg-main)] transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            form="finalizeForm"
            disabled={saving}
            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/20 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Check size={16} /> Sahkan & Simpan Upah
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
