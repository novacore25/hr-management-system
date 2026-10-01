"use client";

import { useState, useCallback } from "react";
import { useApiQuery } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { useLeaveActions } from "@/hooks/absensi/useLeaveRequests";
import { useAbsensiSettings } from "@/hooks/absensi/useAbsensiSettings";
import { useHolidays } from "@/hooks/absensi/useHolidays";
import type { LeaveRequestType } from "@/types/absensi";
import ConfirmDialog from "@/components/absensi/ConfirmDialog";
import PromptDialog from "@/components/absensi/PromptDialog";
import { OvertimeStaffSection } from "@/components/absensi/OvertimeStaffSection";

/**
 * Baris riwayat pengajuan yang dikembalikan /api/absensi/leave?view=team.
 *
 * `reason` hanya terisi untuk pengajuan milik user yang sedang login —
 * server emptying-nya untuk pengajuan orang lain.
 */
interface TeamLeaveRow {
  id: string;
  userId: string;
  userName: string;
  departmentName: string | null;
  type: LeaveRequestType;
  dates: string[];
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  cancellationRequested: boolean;
  createdAt: string;
}
import {
  CalendarPlus, CalendarDays, History, X, Info,
  FileEdit, Smile, Clock
} from "lucide-react";
import { toast } from "sonner";

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ConfirmCfg = {
  title: string;
  message: string;
  confirmLabel: string;
  type: "info" | "warning" | "danger";
};

export default function StaffRequestsPage() {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState<"leave" | "overtime">("leave");
  // formerly: SELECT seluruh tabel leave_requests dari browser + 1 realtime
  // channel. Dipindah ke server supaya alasan pribadi cuti orang lain
  // tidak ikut terkirim ke browser (server yang memfilternya).
  const buildHistory = useCallback(
    () => withQuery("/api/absensi/leave", { view: "team" }),
    [],
  );

  const { data: historyData, isLoading, refetch: refetchHistory } =
    useApiQuery<{ requests: TeamLeaveRow[] }>(buildHistory, [], 30_000);

  const globalRequests = historyData?.requests ?? [];

  const leaveActions = useLeaveActions();

  const { settings } = useAbsensiSettings();
  const { holidayDates } = useHolidays();

  const [reqType, setReqType] = useState<LeaveRequestType>("leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // dialogs
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState<ConfirmCfg | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelPrompt, setCancelPrompt] = useState<{ show: boolean; reqId: string | null }>({ show: false, reqId: null });

  // ─ Date range selection ──────────────────────────────────────────────────────
  const addDateRange = () => {
    if (!startDate) { toast.error("Pilih tanggal mulai."); return; }
    const end = endDate || startDate;
    if (startDate > end) { toast.error("Tanggal mulai tidak boleh lebih dari selesai."); return; }

    const cur = new Date(startDate);
    const endObj = new Date(end);
    const temp = [...selectedDates];
    let added = 0, holidayFound = 0;

    while (cur <= endObj) {
      const s = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      const dow = cur.getDay();
      const isHol = holidayDates.includes(s);
      if (dow !== 0 && dow !== 6 && !isHol) {
        if (!temp.includes(s)) { temp.push(s); added++; }
      } else if (isHol) { holidayFound++; }
      cur.setDate(cur.getDate() + 1);
    }

    if (added === 0) {
      toast.error(holidayFound > 0 ? "Gagal: Tanggal tersebut adalah Hari Libur." : "Tanggal sudah ada atau merupakan hari libur/akhir pekan.");
    } else {
      toast.success(`${added} tanggal berhasil ditambahkan.`);
    }
    temp.sort();
    setSelectedDates(temp);
    setStartDate("");
    setEndDate("");
  };

  const removeDate = (d: string) => setSelectedDates((prev) => prev.filter((x) => x !== d));

  // ─ Submit ─────────────────────────────────────────────────────────────────────
  const submitRequest = async () => {
    if (isSubmitting || !user) return;
    if (!selectedDates.length) { toast.error("Pilih minimal 1 tanggal."); return; }
    if (!reason.trim()) { toast.error("Alasan wajib diisi."); return; }

    const today = getToday();
    if (selectedDates.includes(today)) {
      const timeLimitStr =
        reqType === "sick"  ? settings.maxTimeSick  :
        reqType === "leave" ? settings.maxTimeLeave :
                              settings.maxTimeWfa;
      if (timeLimitStr) {
        const [h, m] = timeLimitStr.split(":").map(Number);
        const limit = new Date(); limit.setHours(h, m, 0, 0);
        if (new Date() > limit) {
          toast.error(`Batas pengajuan ${reqType.toUpperCase()} hari ini adalah jam ${timeLimitStr}.`);
          return;
        }
      }
    }

    const reqDays    = selectedDates.length;
    const curSick    = user.sickQuota    ?? 0;
    const curLeave   = user.leaveQuota   ?? 0;
    let cfg: ConfirmCfg = {
      title: "Konfirmasi Pengajuan",
      message: `Yakin ingin mengirim pengajuan ${reqType.toUpperCase()} ini? Pastikan tanggal dan alasan sudah sesuai.`,
      confirmLabel: "Ya, Lanjut",
      type: "info",
    };

    if (reqType === "sick") {
      if (curSick < reqDays) {
        if (curLeave < reqDays - curSick) {
          cfg = {
            title: "Peringatan Unpaid Leave!",
            message: `Kuota Cuti Sakit Anda habis dan Kuota Cuti Tahunan juga tidak mencukupi. Apakah Anda sudah menghubungi HR? Jika tetap dilanjutkan, kehadiran ini berpotensi diproses sebagai Unpaid Leave.`,
            confirmLabel: "Ya, Lanjut",
            type: "danger",
          };
        } else {
          cfg = {
            title: "Potong Cuti Tahunan",
            message: `Kuota Cuti Sakit Anda kurang (Sisa: ${Math.max(curSick, 0)} hari). Sisa hari akan memotong Kuota Cuti Tahunan Anda. Tetap ajukan?`,
            confirmLabel: "Ya, Lanjut",
            type: "warning",
          };
        }
      }
    } else if (reqType === "leave" && curLeave < reqDays) {
      cfg = {
        title: "Peringatan Unpaid Leave!",
        message: `Kuota Cuti Tahunan Anda habis atau kurang. Apakah Anda sudah menghubungi HR? Jika tetap dilanjutkan, kuota cuti Anda akan memotong ke angka minus.`,
        confirmLabel: "Ya, Lanjut",
        type: "danger",
      };
    }

    // formerly: validasi konflik divisi (max 2 orang cuti pada tanggal yang
    // sama bila divisi punya >= 3 orang aktif) dijalankan dari browser dengan
    // 2 query Supabase, jadi bisa dilewati dengan POST langsung.
    // Sekarang jadi gate server di createLeaveRequest().

    setConfirmCfg(cfg);
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    if (isSubmitting) return;
    setShowConfirm(false);
    setIsSubmitting(true);
    const tid = toast.loading("Mengirim pengajuan...");

    // Server yang memvalidasi: kuota, duplikat, bentrok tanggal,
    // dan batas konflik divisi.
    const res = await leaveActions.submit({
      type: reqType,
      dates: selectedDates,
      reason: reason.trim(),
    });

    if (res.ok) {
      toast.success("Pengajuan berhasil dikirim!", { id: tid });
      setSelectedDates([]);
      setReason("");
      void refetchHistory();
    } else {
      toast.error(res.error ?? "Gagal mengirim pengajuan.", { id: tid });
    }

    setIsSubmitting(false);
  };

  const cancelRequest = async (id: string) => {
    const tid = toast.loading("Membatalkan pengajuan...");
    const res = await leaveActions.cancel(id);
    if (res.ok) {
      toast.success("Pengajuan berhasil dibatalkan.", { id: tid });
      void refetchHistory();
    } else {
      toast.error(res.error ?? "Gagal membatalkan.", { id: tid });
    }
  };

  const submitCancellation = async (cancelReason: string) => {
    if (!cancelReason.trim()) { toast.error("Alasan pembatalan wajib diisi."); return; }
    if (!cancelPrompt.reqId) return;

    const tid = toast.loading("Mengajukan pembatalan...");
    const res = await leaveActions.requestCancellation(
      cancelPrompt.reqId,
      cancelReason.trim(),
    );
    if (res.ok) {
      toast.success("Pengajuan pembatalan berhasil dikirim.", { id: tid });
      setCancelPrompt({ show: false, reqId: null });
      void refetchHistory();
    } else {
      toast.error(res.error ?? "Gagal mengajukan pembatalan.", { id: tid });
    }
  };

  const handleCancelClick = (req: TeamLeaveRow) => {
    if (req.status === "pending") {
      setCancelTargetId(req.id);
      setShowCancelConfirm(true);
    } else if (req.status === "approved") {
      setCancelPrompt({ show: true, reqId: req.id });
    }
  };

  // ─ Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-24 ab-animate-fadeIn">
      {/* Header Card */}
      <div className="bg-[var(--ab-bg-surface)] p-6 rounded-[35px] border border-[var(--ab-border)] shadow-xl flex flex-col items-center text-center relative overflow-hidden">
        {/* Subtle glow background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-[var(--ab-primary)] opacity-10 blur-3xl rounded-full pointer-events-none" />
        
        <div
          className="w-14 h-14 text-white rounded-[22px] flex items-center justify-center shadow-lg mb-4 z-10"
          style={{ background: "var(--ab-primary)", boxShadow: "0 8px 25px -5px var(--ab-primary-glow)" }}
        >
          <FileEdit size={24} />
        </div>
        <div className="z-10">
          <h2 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight leading-none mb-2">
            Pengajuan Staf
          </h2>
          <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-[0.3em]">
            Cuti • Sakit • WFA
          </p>
        </div>
        {settings && (
          <div
            className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full border z-10"
            style={{ background: "color-mix(in srgb, var(--ab-primary), transparent 90%)", borderColor: "var(--ab-primary-glow)" }}
          >
            <Info size={14} style={{ color: "var(--ab-primary)" }} />
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--ab-primary)" }}>
              Sakit H-0: {settings.maxTimeSick}
            </span>
          </div>
        )}
      </div>

      {/* Main Mode Tabs (Cuti / Izin vs Lembur) */}
      <div className="flex bg-[var(--ab-bg-surface)] p-2 rounded-2xl border border-[var(--ab-border)] shadow-md">
        <button
          onClick={() => setMainTab("leave")}
          className={`flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
            mainTab === "leave"
              ? "bg-[var(--ab-primary)] text-white shadow-lg"
              : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
          }`}
        >
          <CalendarDays size={16} /> Cuti, Sakit & WFA
        </button>
        <button
          onClick={() => setMainTab("overtime")}
          className={`flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
            mainTab === "overtime"
              ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30"
              : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
          }`}
        >
          <Clock size={16} /> Pengajuan Lembur (Overtime)
        </button>
      </div>

      {mainTab === "overtime" ? (
        <OvertimeStaffSection />
      ) : (
        <>
          {/* Form Card */}
      <div className="ab-card-tactile space-y-6">
        {/* Type Selector */}
        <div>
          <label className="block text-[11px] font-black text-[var(--ab-text-dim)] uppercase mb-3 tracking-[0.2em] pl-1">
            Pilih Jenis Pengajuan
          </label>
          <div className="flex bg-[var(--ab-bg-main)] p-2 rounded-[24px] border border-[var(--ab-border)] shadow-inner">
            {(["leave", "sick", "wfa"] as LeaveRequestType[]).map((t) => (
              <button
                key={t}
                onClick={() => setReqType(t)}
                className="flex-1 py-4 rounded-[18px] text-xs font-black uppercase tracking-widest transition-all duration-300"
                style={reqType === t ? {
                  background: "var(--ab-bg-surface)",
                  color: t === "leave" ? "#10b981" : t === "sick" ? "#f43f5e" : "#3b82f6",
                  boxShadow: "0 8px 20px -6px rgba(0,0,0,0.15)",
                  border: "1px solid var(--ab-border)",
                } : { color: "var(--ab-text-dim)" }}
              >
                {t === "leave" ? "🏡 Cuti" : t === "sick" ? "🤒 Sakit" : "💻 WFA"}
              </button>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div>
          <label className="block text-[11px] font-black text-[var(--ab-text-dim)] uppercase mb-3 tracking-[0.2em] pl-1">
            Rentang Tanggal
          </label>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="space-y-2">
              <span className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest ml-1">Mulai</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="ab-input text-xs font-black py-4 px-5 rounded-[20px] text-center"
              />
            </div>
            <div className="space-y-2">
              <span className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest ml-1">Selesai (Opsional)</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="ab-input text-xs font-black py-4 px-5 rounded-[20px] text-center"
              />
            </div>
          </div>
          <button
            onClick={addDateRange}
            className="w-full py-4 rounded-[20px] text-[10px] font-black tracking-[0.25em] flex justify-center items-center gap-3 transition-transform active:scale-95 text-white bg-emerald-600 hover:bg-emerald-700 shadow-[0_8px_20px_-6px_rgba(5,150,105,0.5)]"
          >
            <CalendarPlus size={16} /> TAMBAHKAN KE DAFTAR
          </button>

          {/* Selected Dates */}
          <div className="mt-5 flex flex-wrap gap-2 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-[24px] border border-slate-200 dark:border-slate-800 min-h-[90px] items-center justify-center">
            {selectedDates.length === 0 ? (
              <p className="text-center w-full text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.3em] italic">
                Daftar Tanggal Masih Kosong
              </p>
            ) : (
              selectedDates.map((d) => (
                <div
                  key={d}
                  className="bg-white dark:bg-slate-800 text-xs font-black px-4 py-2.5 rounded-xl flex items-center gap-2 border border-slate-200 dark:border-slate-700 shadow-sm text-emerald-600 dark:text-emerald-400"
                >
                  <CalendarDays size={12} className="opacity-60" />
                  {d}
                  <button
                    onClick={() => removeDate(d)}
                    className="text-slate-400 hover:text-red-500 transition ml-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-md"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-[11px] font-black text-[var(--ab-text-dim)] uppercase mb-3 tracking-[0.2em] pl-1">
            Alasan / Keterangan
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="ab-input resize-none text-xs font-medium py-4 px-5 rounded-[24px]"
            placeholder="Berikan alasan yang jelas untuk mempercepat approval..."
          />
        </div>

        <button
          onClick={submitRequest}
          disabled={isSubmitting}
          className="w-full py-5 rounded-[24px] font-black uppercase text-sm tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(15,23,42,0.8)] disabled:opacity-50 active:scale-[0.98] transition-all text-white bg-slate-900 dark:bg-black border border-slate-800 dark:border-slate-800 mt-2"
        >
          {isSubmitting ? "MENGIRIM DATA..." : "KIRIM PENGAJUAN FORM"}
        </button>
      </div>

      {/* History Area with Dotted Pattern Background */}
      <div className="relative mt-8 pt-8 px-4 rounded-[40px]" style={{
        backgroundImage: "radial-gradient(var(--ab-border) 2px, transparent 2px)",
        backgroundSize: "20px 20px"
      }}>
        {/* History Header */}
        <div className="flex items-center gap-3 mb-6 bg-[var(--ab-bg-surface)] p-4 rounded-2xl border border-[var(--ab-border)] shadow-sm w-fit mx-auto">
          <History size={16} className="text-slate-500" />
          <h3 className="font-black text-[var(--ab-text-main)] uppercase text-[10px] tracking-[0.2em]">
            Riwayat & Status
          </h3>
        </div>

      {/* Requests List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-[var(--ab-bg-surface)] rounded-[30px] border border-[var(--ab-border)] animate-pulse" />
          ))}
        </div>
      ) : globalRequests.length === 0 ? (
        <div className="p-16 text-center ab-animate-scaleIn">
          <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-[24px] flex items-center justify-center mx-auto mb-6 text-slate-300 dark:text-slate-600 shadow-sm border border-slate-100 dark:border-slate-700">
            <Smile size={36} />
          </div>
          <h4 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.3em] italic">
            Belum Ada Histori Pengajuan
          </h4>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {globalRequests.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              isMine={req.userId === user?.id}
              onCancel={handleCancelClick}
            />
          ))}
        </div>
      )}
      </div>
      </>
      )}

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showConfirm}
        title={confirmCfg?.title ?? "Konfirmasi"}
        message={confirmCfg?.message ?? ""}
        confirmLabel={confirmCfg?.confirmLabel ?? "Ya, Lanjut"}
        type={confirmCfg?.type ?? "info"}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirm(false)}
      />
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Batalkan Pengajuan"
        message="Yakin ingin membatalkan pengajuan ini?"
        confirmLabel="Ya, Batalkan"
        cancelLabel="Tidak"
        type="danger"
        onConfirm={() => {
          setShowCancelConfirm(false);
          if (cancelTargetId) cancelRequest(cancelTargetId);
          setCancelTargetId(null);
        }}
        onCancel={() => { setShowCancelConfirm(false); setCancelTargetId(null); }}
      />
      <PromptDialog
        isOpen={cancelPrompt.show}
        title="Batalkan Cuti/Izin"
        message="Pengajuan Anda sudah di-approve. Silakan masukkan alasan mengapa Anda ingin membatalkan:"
        placeholder="Misal: Acara keluarga dibatalkan, sudah sembuh, dll..."
        onConfirm={submitCancellation}
        onCancel={() => setCancelPrompt({ show: false, reqId: null })}
      />
    </div>
  );
}

// ─ Request Card ───────────────────────────────────────────────────────────────
function RequestCard({
  req,
  isMine,
  onCancel,
}: {
  req: TeamLeaveRow;
  isMine: boolean;
  onCancel: (req: TeamLeaveRow) => void;
}) {
  const statusColor =
    req.status === "approved" ? "bg-green-500" :
    req.status === "pending"  ? "bg-orange-400" :
    req.status === "cancelled" ? "#94a3b8" : "bg-red-500";

  const typeStyle =
    req.type === "leave"  ? "bg-emerald-50 text-[#00897B] border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400" :
    req.type === "sick"   ? "bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400" :
                            "bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400";

  const statusBadgeStyle =
    req.status === "approved"  ? "bg-green-500 text-white" :
    req.status === "pending"   ? "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" :
    req.status === "cancelled" ? "bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)]" :
                                 "bg-red-500 text-white";

  const statusLabel =
    req.status === "pending"   ? "DIAJUKAN" :
    req.status === "cancelled" ? "DIBATALKAN" :
    req.status.toUpperCase();

  return (
    <div className="bg-[var(--ab-bg-surface)] p-6 rounded-[30px] border border-[var(--ab-border)] shadow-sm relative overflow-hidden">
      <div
        className="absolute top-0 right-0 w-2 h-full"
        style={{ background: statusColor }}
      />
      <div className="flex justify-between items-start mb-4">
        <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm border ${typeStyle}`}>
          {req.type === "leave" ? "🏡 Cuti" : req.type === "sick" ? "🤒 Sakit" : "💻 WFA"}
        </span>
        <div className="flex flex-col items-end gap-2">
          <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest ${statusBadgeStyle}`}>
            {statusLabel}
          </span>
          {isMine && (req.status === "pending" || (req.status === "approved" && !req.cancellationRequested)) && (
            <button
              onClick={() => onCancel(req)}
              className="text-[8px] font-black uppercase tracking-widest text-red-400 hover:text-white hover:bg-red-500 px-3 py-1.5 rounded-lg border border-red-200 transition-all active:scale-95"
            >
              {req.status === "pending" ? "Batalkan" : "Pengajuan Batal"}
            </button>
          )}
          {req.cancellationRequested && (
            <span className="text-[8px] font-black uppercase tracking-widest text-orange-500 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded border border-orange-200 dark:border-orange-800">
              Menunggu Batal
            </span>
          )}
        </div>
      </div>
      
      {/* Name and Department */}
      <div className="mb-4 flex flex-col border-b border-[var(--ab-border)] pb-3">
        <span className="text-[14px] font-black text-[var(--ab-text-main)]">{req.userName}</span>
        <div className="flex justify-between items-center mt-1">
          <span className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
            {req.departmentName ?? "Umum"}
          </span>
          {req.createdAt && (
            <span className="text-[9px] font-bold text-[var(--ab-text-dim)]/80 uppercase tracking-widest flex items-center gap-1">
              <Clock size={10} />
              {new Date(req.createdAt).toLocaleString("id-ID", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              }).replace(/\./g, ":")}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {req.dates?.map((d: string) => (
          <span
            key={d}
            className="text-[10px] font-black text-[var(--ab-text-main)] bg-[var(--ab-bg-main)] px-3 py-1 rounded-lg border border-[var(--ab-border)]"
          >
            {d}
          </span>
        ))}
      </div>
      {req.reason && (
        <div className="bg-[var(--ab-bg-main)] p-4 rounded-2xl border border-[var(--ab-border)]">
          <p className="text-xs text-[var(--ab-text-dim)] font-bold leading-relaxed italic">
            &ldquo;{req.reason}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
