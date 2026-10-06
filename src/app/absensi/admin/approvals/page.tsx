"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import ConfirmDialog from "@/components/absensi/ConfirmDialog";
import PromptDialog from "@/components/absensi/PromptDialog";
import type { OvertimeRequest, OvertimeTaskReport } from "@/types/absensi";
import ImageLightboxModal from "@/components/absensi/ImageLightboxModal";
import OvertimeDetailModal from "@/components/absensi/OvertimeDetailModal";
import {
  formatDurationDetail,
  formatScheduleRange,
  calcDurationMinutes,
} from "@/lib/overtimeHelpers";
import {
  Check, X, CalendarDays, FileEdit, Smile, Shield, ArrowRight,
  Clock, CheckCircle2, ClipboardCheck, Image as ImageIcon, Eye,
  Search, Filter, Users, ChevronRight, Sparkles, AlertCircle
} from "lucide-react";
import { toast } from "sonner";

interface PendingRequest {
  id: string;
  userId: string;
  userName: string;
  type: string;
  dates: string[];
  reason: string;
  createdAt: string;
  cancellationRequested?: boolean;
  cancellationReason?: string | null;
  deductedSick?: number;
  deductedLeave?: number;
  status?: string;
  departmentName?: string;
  // Persetujuan 2 tahap. *_ByName dipakai, bukan *_By, karena 287
  // dari 346 baris punya nama tanpa UUID -- UUID-nya tidak selalu ada.
  executiveStatus?: string | null;
  executiveApprovedByName?: string | null;
  executiveApprovedAt?: string | null;
  hrStatus?: string | null;
  hrApprovedByName?: string | null;
  hrApprovedAt?: string | null;
  rejectionStage?: string | null;
  rejectionReason?: string | null;
}

type ConfirmCfg = {
  title: string;
  msg: string;
  type: "info" | "warning" | "danger";
  onConfirm: () => Promise<void>;
} | null;

export default function AdminApprovalsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tabs: "leave" vs "overtime"
  const [activeMainTab, setActiveMainTab] = useState<"leave" | "overtime">("leave");

  // Cuti States
  const [pendingReqs, setPendingReqs] = useState<PendingRequest[]>([]);
  const [cancelReqs, setCancelReqs] = useState<PendingRequest[]>([]);
  const [historyReqs, setHistoryReqs] = useState<PendingRequest[]>([]);
  const [pendingStaffCount, setPendingStaffCount] = useState(0);

  // Tahap 2: sudah disetujui executive, menunggu HR.
  const [waitingHrReqs, setWaitingHrReqs] = useState<PendingRequest[]>([]);

  // False kalau tidak ada kpi_role='hr' yang aktif. Kalau false,
  // pengajuan akan menumpuk di approved_executive tanpa ada yang
  // bisa menyelesaikannya -- jadi harus terlihat, bukan diam-diam.
  const [hrAvailable, setHrAvailable] = useState(true);

  const [leaveTab, setLeaveTab] = useState<
    "pending" | "waitingHr" | "cancellations" | "history"
  >("pending");

  const [isLoading, setIsLoading] = useState(true);
  const [confirmCfg, setConfirmCfg] = useState<ConfirmCfg>(null);

  // Overtime States
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [overtimeTab, setOvertimeTab] = useState<"pending" | "reported" | "finalized">("pending");
  const [adjustingReq, setAdjustingReq] = useState<OvertimeRequest | null>(null);
  const [adjustStartTime, setAdjustStartTime] = useState("");
  const [adjustEndTime, setAdjustEndTime] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");

  // Reject Overtime Dialog
  const [rejectingReq, setRejectingReq] = useState<OvertimeRequest | null>(null);

  // Finalize Overtime Dialog
  const [finalizingReq, setFinalizingReq] = useState<OvertimeRequest | null>(null);
  const [finalHours, setFinalHours] = useState(0);
  const [finalMinutes, setFinalMinutes] = useState(0);
  const [finalNotes, setFinalNotes] = useState("");

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [quickDateFilter, setQuickDateFilter] = useState<"all" | "today" | "custom">("all");

  // Detail Modal State
  const [selectedDetailOvertime, setSelectedDetailOvertime] = useState<OvertimeRequest | null>(null);

  // Lightbox Preview Modal State
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Lock background scroll when adjustingReq or finalizingReq is open
  useEffect(() => {
    const isAnyModalOpen = !!adjustingReq || !!finalizingReq;
    if (!isAnyModalOpen) return;
    const prevBody = document.body.style.overflow;
    const mainEl = document.querySelector("main");
    const prevMain = mainEl ? mainEl.style.overflow : "";

    document.body.style.overflow = "hidden";
    if (mainEl) mainEl.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBody;
      if (mainEl) mainEl.style.overflow = prevMain;
    };
  }, [adjustingReq, finalizingReq]);

const fetchOvertime = useCallback(async () => {
    try {
      // formerly `overtime_requests.select("*, users!...")` tanpa batas
      // tanggal dari browser — jadi seluruh riwayat lembur ikut terbaca.
      // Sekarang lewat endpoint yang sudah dijaga role-nya.
      const res = await fetch("/api/overtime", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { requests?: any[] };
      };

      if (!res.ok) return;

      setOvertimes(
        (json.data?.requests ?? []).map((r) => ({
          ...r,
          requestedStartTime: (r.requestedStartTime || "").substring(0, 5),
          requestedEndTime: (r.requestedEndTime || "").substring(0, 5),
          approvedStartTime: r.approvedStartTime
            ? r.approvedStartTime.substring(0, 5)
            : null,
          approvedEndTime: r.approvedEndTime
            ? r.approvedEndTime.substring(0, 5)
            : null,
          actualStartTime: r.actualStartTime
            ? r.actualStartTime.substring(0, 5)
            : null,
          actualEndTime: r.actualEndTime ? r.actualEndTime.substring(0, 5) : null,
          tasks: r.tasks ?? [],
          taskReports: r.taskReports ?? [],
          proofImages: r.proofImages ?? [],
          userName: r.userName,
          userDepartment: r.departmentName,
        })),
      );
    } catch (err) {
      console.error("fetchOvertime exception:", err);
    }
  }, []);

  /**
   * formerly **empat** query dari browser dengan filter berbeda:
   * `status = pending`, `status = approved AND cancellation_requested`,
   * `status IN (approved, rejected)`, lalu `count` user pending — plus
   * subscription realtime di tiga tabel.
   *
   * sekarang satu request `?view=approvals`, dengan penyaringan di
   * server.
   */
  const fetchLeave = useCallback(async () => {
    try {
      const res = await fetch("/api/absensi/leave?view=approvals", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: {
          pending?: any[];
          waitingHr?: any[];
          cancellations?: any[];
          history?: any[];
          pendingStaffCount?: number;
          hrAvailable?: boolean;
          hrCount?: number;
        };
      };

      if (!res.ok) {
        setIsLoading(false);
        return;
      }
      const d = json.data ?? {};

      setPendingReqs(
        (d.pending ?? []).map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: r.userName ?? "Unknown",
          departmentName: r.departmentName ?? "Umum",
          type: r.type,
          dates: r.dates ?? [],
          reason: r.reason ?? "",
          createdAt: r.createdAt,
        })),
      );

      setHrAvailable(d.hrAvailable !== false);

      const keBentuk = (r: any): PendingRequest => ({
        id: r.id,
        userId: r.userId,
        userName: r.userName ?? "Unknown",
        departmentName: r.departmentName ?? "Umum",
        type: r.type,
        dates: r.dates ?? [],
        reason: r.reason ?? "",
        createdAt: r.createdAt,
        status: r.status,
        executiveStatus: r.executiveStatus ?? null,
        executiveApprovedByName: r.executiveApprovedByName ?? null,
        executiveApprovedAt: r.executiveApprovedAt ?? null,
        hrStatus: r.hrStatus ?? null,
        hrApprovedByName: r.hrApprovedByName ?? null,
        hrApprovedAt: r.hrApprovedAt ?? null,
        rejectionStage: r.rejectionStage ?? null,
        rejectionReason: r.rejectionReason ?? null,
      });

      setWaitingHrReqs((d.waitingHr ?? []).map(keBentuk));

      setCancelReqs(
        (d.cancellations ?? []).map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: r.userName ?? "Unknown",
          departmentName: r.departmentName ?? "Umum",
          type: r.type,
          dates: r.dates ?? [],
          reason: r.reason ?? "",
          createdAt: r.createdAt,
          cancellationReason: r.cancellationReason ?? null,
          deductedSick: r.deductedSick ?? 0,
          deductedLeave: r.deductedLeave ?? 0,
        })),
      );

      setHistoryReqs(
        (d.history ?? []).map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: r.userName ?? "Unknown",
          departmentName: r.departmentName ?? "Umum",
          type: r.type,
          dates: r.dates ?? [],
          reason: r.reason ?? "",
          createdAt: r.createdAt,
          status: r.status,
          deductedSick: r.deductedSick ?? 0,
          deductedLeave: r.deductedLeave ?? 0,
        })),
      );

      setPendingStaffCount(d.pendingStaffCount ?? 0);
    } catch (err) {
      console.error("fetchLeave exception:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeave();
    void fetchOvertime();

    // Polling 30 detik menggantikan subscription `postgres_changes` di
    // tiga tabel (lihat AGENTS.md).
    const timer = setInterval(() => {
      void fetchLeave();
      void fetchOvertime();
    }, 30_000);
    return () => clearInterval(timer);
  }, [fetchLeave, fetchOvertime]);

  const formatMinutes = formatDurationDetail;

  const todayDateStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const activeFilterDate = quickDateFilter === "today" ? todayDateStr : quickDateFilter === "custom" ? filterDate : "";

  const filteredOvertimes = overtimes.filter((o) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (o.userName || "").toLowerCase().includes(q);
      const matchDept = (o.userDepartment || "").toLowerCase().includes(q);
      const matchPos = (o.userPosition || "").toLowerCase().includes(q);
      const matchTask = (o.tasks || []).some(t => t.task.toLowerCase().includes(q));
      if (!matchName && !matchDept && !matchPos && !matchTask) return false;
    }

    if (activeFilterDate) {
      if (o.overtimeDate !== activeFilterDate) return false;
    }

    return true;
  });

  const targetSummaryDate = activeFilterDate || todayDateStr;
  const targetDateOvertimes = overtimes.filter(
    (o) => o.overtimeDate === targetSummaryDate && o.status !== "rejected" && o.status !== "cancelled"
  );

  // Overtime Actions
  const handleOpenApproveModal = (req: OvertimeRequest) => {
    setAdjustingReq(req);
    setAdjustStartTime(req.requestedStartTime);
    setAdjustEndTime(req.requestedEndTime);
    setAdjustNotes("");
  };

  const handleApproveOvertime = async () => {
    if (!adjustingReq) return;
    const durMins = calcDurationMinutes(adjustStartTime, adjustEndTime);
    if (durMins <= 0) { toast.error("Jam selesai harus lebih besar dari jam mulai."); return; }

    const tid = toast.loading("Menyetujui jadwal lembur...");

    // formerly `update({ status: "approved", approved_by: user.id }).eq("id")`
    // tanpa cek status lama — approve bisa dijalankan ulang pada
    // pengajuan yang sudah final, menimpa gaji yang sudah dibayar.
    const res = await fetch("/api/overtime", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: adjustingReq.id,
        action: "approve",
        approvedStartTime: adjustStartTime,
        approvedEndTime: adjustEndTime,
        approvalNotes: adjustNotes.trim() || null,
      }),
    });

    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(json?.error ?? "Gagal menyetujui.", { id: tid });
      return;
    }

    toast.success("Lembur berhasil disetujui!", { id: tid });
    setAdjustingReq(null);
    void fetchOvertime();
  };

  const handleRejectOvertime = async (reason: string) => {
    if (!rejectingReq) return;
    if (!reason.trim()) { toast.error("Alasan penolakan wajib diisi."); return; }

    const tid = toast.loading("Menolak pengajuan lembur...");

    const res = await fetch("/api/overtime", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: rejectingReq.id, action: "reject", reason }),
    });

    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(json?.error ?? "Gagal menolak pengajuan.", { id: tid });
      return;
    }

    toast.success("Pengajuan lembur telah ditolak.", { id: tid });
    setRejectingReq(null);
    void fetchOvertime();
  };

  const handleOpenFinalizeModal = (req: OvertimeRequest) => {
    setFinalizingReq(req);
    const defaultMins = req.actualDurationMinutes || req.approvedDurationMinutes || req.requestedDurationMinutes || 0;
    setFinalHours(Math.floor(defaultMins / 60));
    setFinalMinutes(defaultMins % 60);
    setFinalNotes("");
  };

  const handleFinalizeOvertime = async () => {
    if (!finalizingReq) return;
    const totalMins = finalHours * 60 + finalMinutes;

    const tid = toast.loading("Mengunci durasi lembur...");

    /**
     * formerly `update({ status: "finalized", final_duration_minutes })`.
     *
     * Status langsung jadi `finalized` di sini — padahal langkah
     * berikutnya (menghitung gaji lewat `OvertimeFinalizeModal`) jadi
     * mustahil karena pengajuan yang sudah final tidak boleh diubah
     * lagi. Sekarang tahap ini hanya mengunci durasi; statusnya berubah
     * di `OvertimeFinalizeModal`.
     */
    const res = await fetch("/api/overtime", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: finalizingReq.id,
        action: "finalize-duration",
        finalDurationMinutes: totalMins,
        finalNotes: finalNotes.trim() || null,
      }),
    });

    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(json?.error ?? "Gagal menyimpan durasi akhir.", { id: tid });
      return;
    }

    toast.success(`Durasi lembur dikunci menjadi ${formatMinutes(totalMins)}.`, { id: tid });
    setFinalizingReq(null);
    void fetchOvertime();
  };

  const processRequest = (req: PendingRequest, action: "approve" | "reject") => {
    setConfirmCfg({
      title: action === "approve" ? "Konfirmasi Persetujuan" : "Konfirmasi Penolakan",
      msg: `Yakin ingin ${action === "approve" ? "menyetujui" : "menolak"} pengajuan ${req.type} dari ${req.userName}?`,
      type: action === "approve" ? "warning" : "danger",
      onConfirm: async () => {
        const tid = toast.loading("Memproses pengajuan...");

        // formerly RPC `process_leave_request(...)`. Area itu SECURITY
        // DEFINER yang tidak melakukan cek role, dan `p_admin_name`
        // diambil dari state browser — jadi siapa pun yang bisa membuka
        // halaman ini bisa mencantumkan nama orang lain sebagai pemroses.
        // Sekarang identitas pemroses diambil dari sesi di server.
        const res = await fetch("/api/absensi/leave", {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: req.id, action }),
        });

        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          toast.error(json?.error ?? "Gagal memproses pengajuan.", { id: tid });
        } else {
          toast.success("Berhasil memproses pengajuan.", { id: tid });
          void fetchLeave();
        }
        setConfirmCfg(null);
      },
    });
  };

  const processCancellation = (req: PendingRequest, action: "approve" | "reject") => {
    setConfirmCfg({
      title: "Konfirmasi Pembatalan",
      msg:
        action === "approve"
          ? `Yakin menyetujui pembatalan cuti ${req.userName}? Kuota cuti akan dikembalikan.`
          : `Tolak pembatalan cuti ${req.userName}?`,
      type: action === "approve" ? "warning" : "danger",
      onConfirm: async () => {
        const tid = toast.loading("Memproses...");

        // formerly RPC `process_leave_cancellation(...)` — masalah yang
        // sama: tanpa cek role, dan nama pemroses dari browser.
        const res = await fetch("/api/absensi/leave", {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: req.id,
            action: action === "approve" ? "approve-cancellation" : "reject-cancellation",
          }),
        });

        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          toast.error(json?.error ?? "Gagal memproses pembatalan.", { id: tid });
        } else {
          toast.success("Selesai.", { id: tid });
          void fetchLeave();
        }
        setConfirmCfg(null);
      },
    });
  };

  const typeStyle = (t: string) =>
    t === "leave"
      ? "bg-emerald-50 text-[#00897B] border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800"
      : t === "sick"
        ? "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800"
        : "bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:border-purple-800";

  const typeLabel = (t: string) =>
    t === "leave" ? "Cuti" : t === "sick" ? "Sakit" : "WFA";

  const groupedPending = pendingReqs.reduce((acc, req) => {
    const dept = req.departmentName || "Umum";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(req);
    return acc;
  }, {} as Record<string, PendingRequest[]>);

  const groupedCancel = cancelReqs.reduce((acc, req) => {
    const dept = req.departmentName || "Umum";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(req);
    return acc;
  }, {} as Record<string, PendingRequest[]>);

  // Untuk apa pun yang menunggu keputusan, tahap berikutnya.
  //
  // Halaman ini sebelumnya tidak punya pengecekan role sama sekali --
  // tombol approve muncul untuk siapa saja yang bisa membuka halaman.
  // Itu tidak masalah saat approve langsung ke final, tapi jadi berarti
  // setelah tahap 1 dipisah: executive akan melihat pengajuan HR dan
  // HR akan melihat pengajuan executive, lalu ditolak server dengan
  // 400. Tombolnya harus disembunyikan, bukan hanya ditolak.
  const kpiRole = user?.kpiRole ?? null;
  const tahapSaya = kpiRole === "executive" ? "executive" : kpiRole === "hr" ? "hr" : null;

  const bisaPutuskan = (tahap: "executive" | "hr") => tahapSaya === tahap;

  const groupedWaitingHr = waitingHrReqs.reduce((acc, req) => {
    const dept = req.departmentName || "Umum";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(req);
    return acc;
  }, {} as Record<string, PendingRequest[]>);

  const groupedHistory = historyReqs.reduce((acc, req) => {
    const dept = req.departmentName || "Umum";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(req);
    return acc;
  }, {} as Record<string, PendingRequest[]>);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight">
            Manajemen Cuti
          </h1>
          {pendingReqs.length > 0 && (
            <div className="bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 px-4 py-1.5 rounded-full text-[10px] font-black border border-orange-100 dark:border-orange-800 flex items-center gap-2 animate-pulse">
              <span className="w-1.5 h-1.5 bg-orange-600 rounded-full" />
              {pendingReqs.length} PENDING
            </div>
          )}
        </div>
      </div>



      {/* Pending Staff Banner */}
      {!isLoading && pendingStaffCount > 0 && (
        <button
          onClick={() => router.push("/absensi/admin/staff")}
          className="w-full flex flex-col md:flex-row items-center justify-between gap-4 bg-gradient-to-r from-amber-500 to-orange-600 p-5 rounded-[32px] text-white shadow-lg hover:scale-[1.01] transition-transform active:scale-[0.99] group overflow-hidden relative text-left"
        >
          <Shield className="absolute -right-6 -bottom-6 text-white opacity-10 group-hover:rotate-12 transition-transform duration-700" size={96} />
          <div className="flex items-center gap-4 relative z-10">
            <div className="bg-white/20 backdrop-blur-md w-12 h-12 rounded-2xl flex items-center justify-center border border-white/20">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-tight leading-none mb-1">Ada Pendaftar Baru!</h3>
              <p className="text-[10px] text-amber-50 font-bold opacity-90">
                Terdapat {pendingStaffCount} akun karyawan baru yang menunggu persetujuan Anda.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/20 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-white group-hover:text-amber-600 transition-all">
            Lihat Pendaftar <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      )}

      {/* TAB 1: PERSUTUJUAN CUTI & IZIN */}
      {activeMainTab === "leave" && (
        <div className="space-y-8">
          {/* Pending Requests */}
          <div className="space-y-8 pb-4">
            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-[var(--ab-bg-surface)] p-6 rounded-[32px] border border-[var(--ab-border)] h-48" />
                ))}
              </div>
            ) : pendingReqs.length === 0 ? (
              <div className="p-20 text-center ab-animate-scaleIn bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)]">
                <div className="w-16 h-16 bg-[var(--ab-bg-main)] rounded-[20px] flex items-center justify-center mx-auto mb-4 text-[var(--ab-text-dim)]">
                  <Smile size={32} />
                </div>
                <h4 className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest italic">
                  Semua pengajuan cuti sudah diproses. Aman!
                </h4>
              </div>
            ) : (
              Object.entries(groupedPending).map(([deptName, reqs]) => (
                <div key={deptName} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="bg-[var(--ab-primary)] w-2 h-6 rounded-full"></div>
                    <h2 className="text-lg font-black text-[var(--ab-text-main)] uppercase tracking-tight">{deptName}</h2>
                    <span className="bg-[var(--ab-bg-main)] px-2 py-1 rounded-full text-[10px] font-black text-[var(--ab-text-dim)] border border-[var(--ab-border)]">
                      {reqs.length} Pengajuan
                    </span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {reqs.map((req) => (
                      <div
                        key={req.id}
                        className="bg-[var(--ab-bg-surface)] p-5 rounded-[32px] border border-[var(--ab-border)] shadow-sm flex flex-col justify-between gap-5 relative overflow-hidden"
                      >
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${typeStyle(req.type)}`}>
                                  {typeLabel(req.type)}
                                </span>
                                <span className="text-[8px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest flex items-center gap-1">
                                  <Clock size={10} />
                                  {new Date(req.createdAt).toLocaleString("id-ID", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  }).replace(/\./g, ":")}
                                </span>
                              </div>
                              <h4 className="font-black text-[var(--ab-text-main)] text-base tracking-tight">{req.userName}</h4>
                            </div>
                            <div className="text-right">
                              <p className="text-[8px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest leading-none">Durasi</p>
                              <p className="text-sm font-black mt-0.5" style={{ color: "var(--ab-primary)" }}>
                                {req.dates.length} Hari
                              </p>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-start gap-2 text-[10px] font-bold text-[var(--ab-text-dim)] bg-[var(--ab-bg-main)] p-3 rounded-2xl border border-[var(--ab-border)]">
                              <CalendarDays size={12} className="mt-0.5 shrink-0" style={{ color: "var(--ab-primary)" }} />
                              <span className="leading-relaxed">{req.dates.join(", ")}</span>
                            </div>
                            <div className="flex items-start gap-2 text-[10px] font-medium text-[var(--ab-text-dim)] italic px-2">
                              <FileEdit size={12} className="mt-1 text-[var(--ab-text-dim)] shrink-0 opacity-40" />
                              <span className="line-clamp-2">&ldquo;{req.reason}&rdquo;</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {/* Tombol hanya untuk executive, karena daftar ini
                              adalah tahap 1. HR yang membuka halaman ini
                              melihat pengajuan yang bukan gilirannya --
                              menampilkan tombol yang pasti ditolak 400
                              hanya membuat halaman terasa rusak, dan
                              pesan penolakannya tidak punya nilai
                              diagnostik. */}
                          {bisaPutuskan("executive") ? (
                            <>
                          <button
                            onClick={() => processRequest(req, "approve")}
                            className="flex-1 bg-green-500 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition shadow-lg flex items-center justify-center gap-2"
                          >
                            <Check size={14} /> Setujui
                          </button>
                          <button
                            onClick={() => processRequest(req, "reject")}
                            className="flex-1 bg-[var(--ab-bg-main)] text-red-500 border border-[var(--ab-border)] py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition flex items-center justify-center gap-2"
                          >
                            <X size={14} /> Tolak
                          </button>
                            </>
                          ) : (
                            <div className="flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] opacity-70 border border-dashed border-[var(--ab-border)] py-3 rounded-2xl">
                              <Clock size={12} /> Menunggu Executive
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Tahap 2: sudah disetujui executive, menunggu HR */}
          {waitingHrReqs.length > 0 && (
            <div className="space-y-4 mt-8">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500 w-2 h-6 rounded-full"></div>
                <h2 className="text-xl font-black text-[var(--ab-text-main)] uppercase tracking-tight">
                  Menunggu Persetujuan HR
                </h2>
                <span className="bg-[var(--ab-bg-main)] px-2 py-1 rounded-full text-[10px] font-black text-[var(--ab-text-dim)] border border-[var(--ab-border)]">
                  {waitingHrReqs.length} Pengajuan
                </span>
              </div>

              {/* Peringatan kalau tidak ada HR yang bisa menyetujui.
                  Diambil dari hrRoleAvailability() di server, bukan
                  ditulis manual di sini. Tanpa peringatan ini,
                  pengajuan menumpuk di approved_executive dan tidak ada
                  yang tahu kenapa -- gejalanya "HRnya lambat", padahal
                  tidak ada HR yang bisa dipakai. */}
              {!hrAvailable && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 p-4 rounded-2xl">
                  <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-wide">
                      Tidak ada HR aktif yang bisa menyetujui tahap akhir
                    </p>
                    <p className="text-[11px] text-red-600 dark:text-red-300 mt-1 leading-relaxed">
                      Tahap persetujuan ini butuh user dengan kpi_role=&apos;hr&apos;. Pengajuan di
                      bawah ini akan tertahan sampai ada HR yang bisa menyetujui --
                      executive tidak bisa menyelesaikannya, karena tahapnya bukan haknya.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-8">
                {Object.entries(groupedWaitingHr).map(([deptName, reqs]) => (
                  <div key={deptName} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-[var(--ab-primary)] w-2 h-6 rounded-full"></div>
                      <h3 className="text-lg font-black text-[var(--ab-text-main)] uppercase tracking-tight">{deptName}</h3>
                      <span className="bg-[var(--ab-bg-main)] px-2 py-1 rounded-full text-[10px] font-black text-[var(--ab-text-dim)] border border-[var(--ab-border)]">
                        {reqs.length} Pengajuan
                      </span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {reqs.map((req) => (
                        <div key={req.id} className="bg-[var(--ab-bg-surface)] p-5 rounded-[32px] border border-[var(--ab-border)] space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black text-[var(--ab-text-main)] text-sm">
                                {req.userName}
                              </p>
                              <p className="text-[10px] text-[var(--ab-text-dim)] uppercase font-bold tracking-widest mt-0.5">
                                {typeLabel(req.type)} &middot; {req.dates.length} hari
                              </p>
                            </div>
                            <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0">
                              Tahap 2
                            </span>
                          </div>

                          {/* Siapa yang sudah menyetujui di tahap 1.
                              Nama, bukan UUID: 287 dari 346 baris punya
                              nama tanpa UUID karena backfill lama
                              menyalin processed_by yang berisi NAMA.
                              Kalau kolom UUID yang ditampilkan, riwayat
                              approvals kosong untuk 83 persen baris. */}
                          <div className="flex items-start gap-2 text-[10px] bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl px-3 py-2">
                            <CheckCircle2 size={12} className="text-emerald-600 shrink-0 mt-0.5" />
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              Disetujui executive: {req.executiveApprovedByName ?? "tidak tercatat"}
                              {req.executiveApprovedAt && (
                                <>
                                  {/* Karakter &middot; literal, bukan
                                      entitas HTML: entitas hanya diparse
                                      di teks JSX, dan ini ada di dalam
                                      ekspresi. */}
                                  {" · "}
                                  {new Date(req.executiveApprovedAt).toLocaleDateString("id-ID", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </>
                              )}
                            </span>
                          </div>

                          <div className="text-[11px] text-[var(--ab-text-dim)]">
                            {req.dates.join(", ")}
                          </div>

                          <div className="flex items-start gap-2 text-[10px] font-medium text-[var(--ab-text-dim)] italic px-2">
                            <FileEdit size={12} className="mt-1 text-[var(--ab-text-dim)] shrink-0 opacity-40" />
                            <span className="line-clamp-2">&ldquo;{req.reason}&rdquo;</span>
                          </div>

                          <div className="flex gap-2">
                            {/* Hanya HR. Executive sudah menyetujui di
                                tahap 1 -- menampilkannya tombol di sini
                                berarti tombol yang pasti ditolak. */}
                            {bisaPutuskan("hr") ? (
                              <>
                                <button
                                  onClick={() => processRequest(req, "approve")}
                                  className="flex-1 bg-green-500 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition shadow-lg flex items-center justify-center gap-2"
                                >
                                  <Check size={14} /> Setujui
                                </button>
                                <button
                                  onClick={() => processRequest(req, "reject")}
                                  className="flex-1 bg-[var(--ab-bg-main)] text-red-500 border border-[var(--ab-border)] py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition flex items-center justify-center gap-2"
                                >
                                  <X size={14} /> Tolak
                                </button>
                              </>
                            ) : (
                              <div className="flex-1 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] opacity-70 border border-dashed border-[var(--ab-border)] py-3 rounded-2xl">
                                <Clock size={12} /> Menunggu HR
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancellation Requests */}
          {cancelReqs.length > 0 && (
            <div className="space-y-4 mt-8">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-[var(--ab-text-main)] uppercase tracking-tight">Permohonan Batal Cuti</h2>
              </div>
              <div className="space-y-8">
                {Object.entries(groupedCancel).map(([deptName, reqs]) => (
                  <div key={deptName} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-red-500 w-2 h-6 rounded-full"></div>
                      <h3 className="text-lg font-black text-[var(--ab-text-main)] uppercase tracking-tight">{deptName}</h3>
                      <span className="bg-[var(--ab-bg-main)] px-2 py-1 rounded-full text-[10px] font-black text-[var(--ab-text-dim)] border border-[var(--ab-border)]">
                        {reqs.length} Pengajuan
                      </span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {reqs.map((req) => (
                        <div
                          key={req.id}
                          className="bg-red-50 dark:bg-red-950/20 p-5 rounded-[32px] border border-red-200 dark:border-red-900/30 flex flex-col justify-between gap-4 relative overflow-hidden"
                        >
                          <div className="space-y-4 relative z-10">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                                    Batal Cuti
                                  </span>
                                  <span className="text-[8px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1">
                                    <Clock size={10} />
                                    {new Date(req.createdAt).toLocaleString("id-ID", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    }).replace(/\./g, ":")}
                                  </span>
                                </div>
                                <h4 className="font-black text-red-900 dark:text-red-100 text-base tracking-tight">{req.userName}</h4>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-start gap-2 text-[10px] font-bold text-red-800 dark:text-red-200 bg-red-100/50 dark:bg-red-900/20 p-3 rounded-2xl border border-red-200 dark:border-red-800/30">
                                <CalendarDays size={12} className="mt-0.5 shrink-0 text-red-500" />
                                <span className="leading-relaxed">{req.dates.join(", ")}</span>
                              </div>
                              <div className="flex flex-col gap-1 text-[10px] font-medium text-red-700 dark:text-red-300 italic px-2 border-l-2 border-red-300 dark:border-red-800 ml-1 pl-3">
                                <span className="font-black uppercase text-[8px] tracking-widest opacity-60 not-italic">Alasan Batal</span>
                                <span className="line-clamp-2">&ldquo;{req.cancellationReason}&rdquo;</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 relative z-10">
                            <button
                              onClick={() => processCancellation(req, "approve")}
                              className="flex-1 bg-red-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-700 transition flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                            >
                              <Check size={14} /> Setujui Batal
                            </button>
                            <button
                              onClick={() => processCancellation(req, "reject")}
                              className="flex-1 bg-white dark:bg-red-950 text-red-500 border border-red-200 dark:border-red-900 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-900/50 transition flex items-center justify-center gap-2"
                            >
                              <X size={14} /> Tolak Batal
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* History Requests */}
          {historyReqs.length > 0 && (
            <div className="space-y-4 mt-8">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-[var(--ab-text-main)] uppercase tracking-tight">Riwayat Pengajuan Cuti (Disetujui/Ditolak)</h2>
              </div>
              <div className="space-y-8">
                {Object.entries(groupedHistory).map(([deptName, reqs]) => (
                  <div key={deptName} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-[var(--ab-text-dim)] w-2 h-6 rounded-full"></div>
                      <h3 className="text-lg font-black text-[var(--ab-text-main)] uppercase tracking-tight">{deptName}</h3>
                      <span className="bg-[var(--ab-bg-main)] px-2 py-1 rounded-full text-[10px] font-black text-[var(--ab-text-dim)] border border-[var(--ab-border)]">
                        {reqs.length} Riwayat
                      </span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {reqs.map((req) => (
                        <div
                          key={req.id}
                          className="bg-[var(--ab-bg-surface)] p-5 rounded-[32px] border border-[var(--ab-border)] shadow-sm flex flex-col justify-between gap-4 relative overflow-hidden opacity-80 hover:opacity-100 transition-opacity"
                        >
                          <div className="space-y-4 relative z-10">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${typeStyle(req.type)}`}>
                                    {typeLabel(req.type)}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${req.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {req.status === 'approved' ? 'Disetujui' : 'Ditolak'}
                                  </span>
                                  <span className="text-[8px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest flex items-center gap-1">
                                    <Clock size={10} />
                                    {new Date(req.createdAt).toLocaleString("id-ID", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    }).replace(/\./g, ":")}
                                  </span>
                                </div>
                                <h4 className="font-black text-[var(--ab-text-main)] text-base tracking-tight">{req.userName}</h4>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-start gap-2 text-[10px] font-bold text-[var(--ab-text-dim)] bg-[var(--ab-bg-main)] p-3 rounded-2xl border border-[var(--ab-border)]">
                                <CalendarDays size={12} className="mt-0.5 shrink-0" style={{ color: "var(--ab-primary)" }} />
                                <span className="leading-relaxed">{req.dates.join(", ")}</span>
                              </div>
                              <div className="flex flex-col gap-1 text-[10px] font-medium text-[var(--ab-text-dim)] italic px-2 border-l-2 border-[var(--ab-border)] ml-1 pl-3">
                                <span className="font-black uppercase text-[8px] tracking-widest opacity-60 not-italic">Alasan</span>
                                <span className="line-clamp-2">&ldquo;{req.reason}&rdquo;</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: OVERTIME MANAGEMENT */}
      {false && (
        <div className="space-y-6">
          {/* Widget Info Tim Lembur Hari Ini / Tanggal Terpilih */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-purple-500/10 rounded-3xl border border-amber-500/20 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <Users size={18} />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-[var(--ab-text-main)] uppercase tracking-tight flex items-center gap-2">
                    Info Staf Lembur ({targetSummaryDate === todayDateStr ? "Hari Ini" : new Date(targetSummaryDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })})
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white">
                      {targetDateOvertimes.length} Staf
                    </span>
                  </h3>
                  <p className="text-[10px] font-bold text-[var(--ab-text-dim)]">
                    Daftar karyawan yang memiliki jadwal atau pelaksanaan lembur pada tanggal ini
                  </p>
                </div>
              </div>
              {quickDateFilter !== "today" && (
                <button
                  onClick={() => {
                    setQuickDateFilter("today");
                    setFilterDate(todayDateStr);
                  }}
                  className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/30 transition-colors w-fit self-end sm:self-center"
                >
                  Lihat Hari Ini
                </button>
              )}
            </div>

            {targetDateOvertimes.length === 0 ? (
              <div className="p-3.5 rounded-2xl bg-[var(--ab-bg-surface)] border border-[var(--ab-border)] text-center text-xs font-bold text-[var(--ab-text-dim)]">
                Tidak ada staf yang dijadwalkan lembur pada tanggal ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {targetDateOvertimes.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedDetailOvertime(item)}
                    className="p-3 rounded-2xl bg-[var(--ab-bg-surface)] border border-[var(--ab-border)] hover:border-amber-500/40 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-xs shrink-0 uppercase">
                        {item.userName ? item.userName.substring(0, 2) : "ST"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-[var(--ab-text-main)] truncate group-hover:text-amber-500 transition-colors">
                          {item.userName}
                        </p>
                        <p className="text-[9.5px] font-bold text-[var(--ab-text-dim)] truncate">
                          {formatScheduleRange(
                            item.approvedStartTime || item.requestedStartTime,
                            item.actualEndTime || item.approvedEndTime || item.requestedEndTime,
                            item.finalDurationMinutes || item.actualDurationMinutes || item.approvedDurationMinutes || item.requestedDurationMinutes
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {item.status === "finalized" ? (
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          Final
                        </span>
                      ) : item.status === "reported" ? (
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 border border-purple-500/20">
                          Lapor
                        </span>
                      ) : item.status === "approved" ? (
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20">
                          Disetujui
                        </span>
                      ) : (
                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20">
                          Review
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search & Filter Toolbar */}
          <div className="p-3 sm:p-4 bg-[var(--ab-bg-surface)] rounded-2xl border border-[var(--ab-border)] shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Box */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ab-text-dim)]" />
              <input
                type="text"
                placeholder="Cari nama staf, divisi, atau tugas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ab-input pl-10 pr-8 text-xs py-2.5 rounded-xl w-full"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Date Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setQuickDateFilter("all");
                  setFilterDate("");
                }}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  quickDateFilter === "all"
                    ? "bg-[var(--ab-primary)] text-white shadow-sm"
                    : "bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] border border-[var(--ab-border)]"
                }`}
              >
                Semua Tanggal
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuickDateFilter("today");
                  setFilterDate(todayDateStr);
                }}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  quickDateFilter === "today"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] border border-[var(--ab-border)]"
                }`}
              >
                Hari Ini
              </button>

              <div className="relative">
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => {
                    setFilterDate(e.target.value);
                    setQuickDateFilter(e.target.value ? "custom" : "all");
                  }}
                  className={`ab-input text-xs py-1.5 px-3 rounded-xl cursor-pointer w-36 ${
                    quickDateFilter === "custom" ? "border-amber-500 text-amber-500 font-bold" : ""
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Overtime Sub Tabs */}
          <div className="flex bg-[var(--ab-bg-main)] p-1.5 rounded-2xl border border-[var(--ab-border)] w-fit mx-auto shadow-inner flex-wrap justify-center gap-1">
            <button
              onClick={() => setOvertimeTab("pending")}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                overtimeTab === "pending"
                  ? "bg-amber-500 text-white shadow-md"
                  : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
              }`}
            >
              1. Review Pengajuan ({filteredOvertimes.filter(o => o.status === "pending").length})
            </button>
            <button
              onClick={() => setOvertimeTab("reported")}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                overtimeTab === "reported"
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
              }`}
            >
              2. Verifikasi Laporan ({filteredOvertimes.filter(o => o.status === "reported").length})
            </button>
            <button
              onClick={() => setOvertimeTab("finalized")}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                overtimeTab === "finalized"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
              }`}
            >
              3. Selesai / Finalized ({filteredOvertimes.filter(o => o.status === "finalized").length})
            </button>
          </div>

          {/* Sub Tab 1: Pending Review */}
          {overtimeTab === "pending" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredOvertimes.filter(o => o.status === "pending").length === 0 ? (
                <div className="col-span-full p-16 bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)] text-center">
                  <Smile size={36} className="mx-auto text-[var(--ab-text-dim)] opacity-40 mb-2" />
                  <p className="text-xs font-black uppercase tracking-wider text-[var(--ab-text-dim)]">
                    Tidak ada pengajuan lembur yang pending sesuai filter
                  </p>
                </div>
              ) : (
                filteredOvertimes.filter(o => o.status === "pending").map((req) => (
                  <div key={req.id} className="bg-[var(--ab-bg-surface)] p-5 rounded-3xl border border-[var(--ab-border)] shadow-sm space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[9px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                            {req.userDepartment || "Divisi Umum"}
                          </span>
                          <h4 className="text-base font-black text-[var(--ab-text-main)]">{req.userName}</h4>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          {new Date(req.overtimeDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>

                      <div className="p-3 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] flex items-center justify-between">
                        <div>
                          <span className="block text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Jadwal Diminta Staf</span>
                          <span className="text-xs font-black text-[var(--ab-text-main)]">
                            {formatScheduleRange(req.requestedStartTime, req.requestedEndTime, req.requestedDurationMinutes)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Workload / Rencana Tugas:</span>
                        <div className="space-y-1">
                          {req.tasks.map((t, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs py-1 px-2.5 bg-[var(--ab-bg-main)]/60 rounded-lg">
                              <span className="font-bold text-[var(--ab-text-main)]">• {t.task}</span>
                              <span className="text-[9px] font-black text-[var(--ab-text-dim)]">{t.target}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {req.staffNotes && (
                        <div className="p-2.5 bg-slate-500/5 rounded-xl text-xs italic text-[var(--ab-text-dim)]">
                          &ldquo;{req.staffNotes}&rdquo;
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[var(--ab-border)]/50">
                      <button
                        type="button"
                        onClick={() => setSelectedDetailOvertime(req)}
                        className="w-full py-2 bg-[var(--ab-bg-main)] hover:bg-[var(--ab-border)] text-[var(--ab-text-main)] font-black text-[10px] uppercase tracking-wider rounded-xl transition-all border border-[var(--ab-border)] flex items-center justify-center gap-1.5"
                      >
                        <Eye size={13} /> Lihat Detail Lengkap
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenApproveModal(req)}
                          className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md"
                        >
                          <Check size={14} /> Review & Approve
                        </button>
                        <button
                          onClick={() => setRejectingReq(req)}
                          className="px-4 py-2.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-red-500/20"
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Sub Tab 2: Reported (Waiting Verification) */}
          {overtimeTab === "reported" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredOvertimes.filter(o => o.status === "reported").length === 0 ? (
                <div className="col-span-full p-16 bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)] text-center">
                  <CheckCircle2 size={36} className="mx-auto text-[var(--ab-text-dim)] opacity-40 mb-2" />
                  <p className="text-xs font-black uppercase tracking-wider text-[var(--ab-text-dim)]">
                    Tidak ada laporan lembur yang menunggu verifikasi HR sesuai filter
                  </p>
                </div>
              ) : (
                filteredOvertimes.filter(o => o.status === "reported").map((req) => (
                  <div key={req.id} className="bg-[var(--ab-bg-surface)] p-5 rounded-3xl border border-[var(--ab-border)] shadow-sm space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[9px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                            {req.userDepartment || "Divisi Umum"}
                          </span>
                          <h4 className="text-base font-black text-[var(--ab-text-main)]">{req.userName}</h4>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-500 border border-purple-500/20">
                          {new Date(req.overtimeDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>

                      {/* Compare Box */}
                      <div className="grid grid-cols-2 gap-2.5 p-3 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] text-center text-xs">
                        <div className="p-2.5 rounded-xl bg-[var(--ab-bg-surface)]">
                          <span className="block text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Disetujui HR</span>
                          <span className="font-black text-blue-500 block mt-0.5">
                            {formatScheduleRange(req.approvedStartTime, req.approvedEndTime, req.approvedDurationMinutes)}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-[var(--ab-bg-surface)]">
                          <span className="block text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Actual Selesai</span>
                          <span className="font-black text-purple-500 block mt-0.5">
                            {formatScheduleRange(req.actualStartTime, req.actualEndTime, req.actualDurationMinutes)}
                          </span>
                        </div>
                      </div>

                      {/* Task Reports */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Laporan Hasil Kerja:</span>
                        <div className="space-y-1.5">
                          {(req.taskReports || []).map((tr, idx) => (
                            <div key={idx} className="p-2.5 bg-[var(--ab-bg-main)] rounded-xl border border-[var(--ab-border)] text-xs space-y-1">
                              <div className="flex justify-between items-center font-bold text-[var(--ab-text-main)]">
                                <span>• {tr.task}</span>
                                <span className={tr.status === "completed" ? "text-emerald-500" : "text-amber-500"}>
                                  {tr.status === "completed" ? "✅ Selesai 100%" : "⏳ Sebagian"}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-[10px] text-[var(--ab-text-dim)]">
                                <span>Target: {tr.target}</span>
                                <span className="font-black text-[var(--ab-text-main)]">Hasil: {tr.actualResult || "-"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {req.staffReportNotes && (
                        <div className="p-2.5 bg-purple-500/5 border border-purple-500/10 rounded-xl text-xs text-purple-600 dark:text-purple-400 space-y-0.5">
                          <span className="font-black uppercase text-[8px] tracking-widest">Catatan Staf:</span>
                          <p className="font-medium italic">&ldquo;{req.staffReportNotes}&rdquo;</p>
                        </div>
                      )}

                      {/* Bukti Foto Kerja */}
                      {req.proofImages && req.proofImages.length > 0 && (
                        <div className="space-y-1.5 p-3 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)]">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] flex items-center gap-1.5">
                            <ImageIcon size={13} className="text-purple-500" /> Foto Bukti Pekerjaan ({req.proofImages.length} Foto):
                          </span>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            {req.proofImages.map((imgUrl, imgIdx) => (
                              <div
                                key={imgIdx}
                                onClick={() => setPreviewImageUrl(imgUrl)}
                                className="relative w-24 h-16 rounded-xl overflow-hidden border border-[var(--ab-border)] bg-black/10 cursor-pointer hover:opacity-90 hover:scale-105 transition-all group shadow-sm"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imgUrl}
                                  alt={`Bukti ${imgIdx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                  <Eye size={16} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[var(--ab-border)]/50">
                      <button
                        type="button"
                        onClick={() => setSelectedDetailOvertime(req)}
                        className="w-full py-2 bg-[var(--ab-bg-main)] hover:bg-[var(--ab-border)] text-[var(--ab-text-main)] font-black text-[10px] uppercase tracking-wider rounded-xl transition-all border border-[var(--ab-border)] flex items-center justify-center gap-1.5"
                      >
                        <Eye size={13} /> Lihat Detail Lengkap
                      </button>
                      <button
                        onClick={() => handleOpenFinalizeModal(req)}
                        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2"
                      >
                        <ClipboardCheck size={16} /> Verifikasi & Tentukan Durasi Final
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Sub Tab 3: Finalized */}
          {overtimeTab === "finalized" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredOvertimes.filter(o => o.status === "finalized").length === 0 ? (
                <div className="col-span-full p-16 bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)] text-center">
                  <p className="text-xs font-black uppercase tracking-wider text-[var(--ab-text-dim)]">
                    Belum ada riwayat lembur yang difinalisasi sesuai filter
                  </p>
                </div>
              ) : (
                filteredOvertimes.filter(o => o.status === "finalized").map((req) => (
                  <div key={req.id} className="bg-[var(--ab-bg-surface)] p-5 rounded-3xl border border-[var(--ab-border)] shadow-sm space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[9px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                            {req.userDepartment || "Divisi Umum"}
                          </span>
                          <h4 className="text-base font-black text-[var(--ab-text-main)]">{req.userName}</h4>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Final: {formatDurationDetail(req.finalDurationMinutes || 0)}
                        </span>
                      </div>

                      <div className="p-3 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-[var(--ab-border)] pb-1.5">
                          <span className="text-[9px] font-bold text-[var(--ab-text-dim)]">Tanggal Lembur:</span>
                          <p className="font-black text-[var(--ab-text-main)]">
                            {new Date(req.overtimeDate).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center pt-1">
                          <div className="p-2 bg-[var(--ab-bg-surface)] rounded-xl border border-[var(--ab-border)]">
                            <span className="block text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Jadwal HR</span>
                            <span className="font-bold text-blue-500 text-[11px] block mt-0.5">
                              {formatScheduleRange(req.approvedStartTime, req.approvedEndTime, req.approvedDurationMinutes)}
                            </span>
                          </div>
                          <div className="p-2 bg-[var(--ab-bg-surface)] rounded-xl border border-[var(--ab-border)]">
                            <span className="block text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Aktual Staf</span>
                            <span className="font-bold text-purple-500 text-[11px] block mt-0.5">
                              {formatScheduleRange(req.actualStartTime, req.actualEndTime, req.actualDurationMinutes)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bukti Foto Finalized */}
                      {req.proofImages && req.proofImages.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] flex items-center gap-1">
                            <ImageIcon size={11} className="text-purple-500" /> Foto Bukti ({req.proofImages.length}):
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {req.proofImages.map((imgUrl, imgIdx) => (
                              <div
                                key={imgIdx}
                                onClick={() => setPreviewImageUrl(imgUrl)}
                                className="relative w-16 h-11 rounded-xl overflow-hidden border border-[var(--ab-border)] bg-black/10 cursor-pointer hover:scale-105 transition-transform group shadow-sm"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={imgUrl} alt="Bukti" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                  <Eye size={14} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {req.finalNotes && (
                        <div className="p-2.5 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-xs italic text-[var(--ab-text-dim)]">
                          Catatan HR: &ldquo;{req.finalNotes}&rdquo;
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-[var(--ab-border)]/50">
                      <button
                        type="button"
                        onClick={() => setSelectedDetailOvertime(req)}
                        className="w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all border border-emerald-500/30 flex items-center justify-center gap-1.5"
                      >
                        <Eye size={13} /> Lihat Detail Lengkap (Semua Tahap)
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: APPROVE & ADJUST JADWAL LEMBUR */}
      {adjustingReq && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAdjustingReq(null);
          }}
        >
          <div className="w-full max-w-sm sm:max-w-md my-auto bg-[var(--ab-bg-surface)] rounded-[32px] p-5 sm:p-7 border border-[var(--ab-border)] shadow-2xl ab-animate-scaleIn max-h-[90vh] overflow-y-auto space-y-5 relative">
            <div className="flex justify-between items-center border-b border-[var(--ab-border)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--ab-text-main)] uppercase tracking-tight">
                  Review & Setujui Lembur
                </h3>
                <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                  {adjustingReq.userName} ({adjustingReq.userDepartment})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingReq(null)}
                className="p-2 rounded-full text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] hover:bg-[var(--ab-bg-main)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] text-xs space-y-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Permintaan Awal Staf:</span>
              <p className="font-black text-amber-500">{adjustingReq.requestedStartTime} - {adjustingReq.requestedEndTime} ({formatMinutes(adjustingReq.requestedDurationMinutes)})</p>
            </div>

            {/* HR Adjust Time Inputs */}
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest block">
                Sesuaikan Waktu yang Disetujui HR
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-[var(--ab-text-dim)]">Mulai:</span>
                  <input
                    type="time"
                    value={adjustStartTime}
                    onChange={(e) => setAdjustStartTime(e.target.value)}
                    className="ab-input text-xs font-black py-2.5 px-3 rounded-xl text-center"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-[var(--ab-text-dim)]">Selesai:</span>
                  <input
                    type="time"
                    value={adjustEndTime}
                    onChange={(e) => setAdjustEndTime(e.target.value)}
                    className="ab-input text-xs font-black py-2.5 px-3 rounded-xl text-center"
                  />
                </div>
              </div>
              <p className="text-center text-xs font-black text-blue-500 pt-1">
                Durasi Disetujui: {formatMinutes(calcDurationMinutes(adjustStartTime, adjustEndTime))}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest">
                Catatan Persetujuan HR (Opsional)
              </label>
              <textarea
                rows={2}
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                placeholder="Catatan penyesuaian jam atau target tambahan..."
                className="ab-input text-xs w-full py-2.5 px-3 rounded-xl resize-none"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingReq(null)}
                className="w-full sm:flex-1 py-3.5 bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--ab-border)] transition-all border border-[var(--ab-border)]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApproveOvertime}
                className="w-full sm:flex-1 py-3.5 bg-green-500 hover:bg-green-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Check size={14} /> Approve Jadwal
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 2: FINALIZE OVERTIME */}
      {finalizingReq && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFinalizingReq(null);
          }}
        >
          <div className="w-full max-w-sm sm:max-w-md my-auto bg-[var(--ab-bg-surface)] rounded-[32px] p-5 sm:p-7 border border-[var(--ab-border)] shadow-2xl ab-animate-scaleIn max-h-[90vh] overflow-y-auto space-y-5 relative">
            <div className="flex justify-between items-center border-b border-[var(--ab-border)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--ab-text-main)] uppercase tracking-tight">
                  Penetapan Durasi Final Lembur
                </h3>
                <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                  {finalizingReq.userName} • {finalizingReq.overtimeDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFinalizingReq(null)}
                className="p-2 rounded-full text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] hover:bg-[var(--ab-bg-main)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-center p-3.5 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)]">
              <div>
                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Approved HR</span>
                <p className="font-black text-blue-500 block mt-0.5">
                  {formatScheduleRange(finalizingReq.approvedStartTime, finalizingReq.approvedEndTime, finalizingReq.approvedDurationMinutes)}
                </p>
              </div>
              <div>
                <span className="text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Actual Staf</span>
                <p className="font-black text-purple-500 block mt-0.5">
                  {formatScheduleRange(finalizingReq.actualStartTime, finalizingReq.actualEndTime, finalizingReq.actualDurationMinutes)}
                </p>
              </div>
            </div>

            {/* Proof Images in Finalize Modal */}
            {finalizingReq.proofImages && finalizingReq.proofImages.length > 0 && (
              <div className="space-y-1.5 p-3 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)]">
                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] flex items-center gap-1.5">
                  <ImageIcon size={13} className="text-purple-500" /> Foto Bukti Pekerjaan ({finalizingReq.proofImages.length}):
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {finalizingReq.proofImages.map((imgUrl, imgIdx) => (
                    <div
                      key={imgIdx}
                      onClick={() => setPreviewImageUrl(imgUrl)}
                      className="relative w-20 h-14 rounded-xl overflow-hidden border border-[var(--ab-border)] bg-black/10 cursor-pointer hover:opacity-90 hover:scale-105 transition-all group shadow-sm"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgUrl}
                        alt={`Bukti ${imgIdx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Eye size={14} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Input Final Durasi */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest block">
                Keputusan Durasi Final yang Diakui
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <span className="text-[9px] font-bold text-[var(--ab-text-dim)]">Jam:</span>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    value={finalHours}
                    onChange={(e) => setFinalHours(Math.max(0, Number(e.target.value)))}
                    className="ab-input text-sm font-black py-2.5 px-3 rounded-xl text-center"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-[9px] font-bold text-[var(--ab-text-dim)]">Menit:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={finalMinutes}
                    onChange={(e) => setFinalMinutes(Math.max(0, Math.min(59, Number(e.target.value))))}
                    className="ab-input text-sm font-black py-2.5 px-3 rounded-xl text-center"
                  />
                </div>
              </div>
              <p className="text-xs font-black text-emerald-500 text-center pt-1">
                Total Final: {formatMinutes(finalHours * 60 + finalMinutes)}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest">
                Catatan Keputusan HR
              </label>
              <textarea
                rows={2}
                value={finalNotes}
                onChange={(e) => setFinalNotes(e.target.value)}
                placeholder="Alasan durasi diakui penuh / dipotong sesuai evaluasi..."
                className="ab-input text-xs w-full py-2.5 px-3 rounded-xl resize-none"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setFinalizingReq(null)}
                className="w-full sm:flex-1 py-3.5 bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--ab-border)] transition-all border border-[var(--ab-border)]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleFinalizeOvertime}
                className="w-full sm:flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Check size={14} /> Simpan Durasi Final
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reject Dialog Prompt */}
      <PromptDialog
        isOpen={!!rejectingReq}
        title="Tolak Pengajuan Lembur"
        message={`Masukkan alasan mengapa pengajuan lembur dari ${rejectingReq?.userName} ditolak:`}
        placeholder="Cth: Workload tidak memenuhi syarat lembur, deadline bukan hari ini..."
        onConfirm={handleRejectOvertime}
        onCancel={() => setRejectingReq(null)}
      />

      <ConfirmDialog
        isOpen={!!confirmCfg}
        title={confirmCfg?.title ?? "Konfirmasi"}
        message={confirmCfg?.msg ?? ""}
        type={confirmCfg?.type ?? "warning"}
        onConfirm={confirmCfg?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmCfg(null)}
      />

      {/* Overtime Full Detail Modal */}
      <OvertimeDetailModal
        isOpen={!!selectedDetailOvertime}
        overtime={selectedDetailOvertime}
        onClose={() => setSelectedDetailOvertime(null)}
        onPreviewImage={(url) => setPreviewImageUrl(url)}
      />

      {/* Image Preview Lightbox */}
      <ImageLightboxModal
        imageUrl={previewImageUrl}
        onClose={() => setPreviewImageUrl(null)}
      />
    </div>
  );
}
