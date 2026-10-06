"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { OvertimeRequest, OvertimeTask, OvertimeTaskReport } from "@/types/absensi";
import ConfirmDialog from "@/components/absensi/ConfirmDialog";
import ImageLightboxModal from "@/components/absensi/ImageLightboxModal";
import OvertimeDetailModal from "@/components/absensi/OvertimeDetailModal";
import { compressImage, formatBytes } from "@/lib/imageCompression";
import {
  formatDurationDetail,
  formatScheduleRange,
  getOvertimeStepState,
  isWeekend
} from "@/lib/overtimeHelpers";
import {
  Clock, Plus, Trash2, CheckCircle2, AlertCircle, CalendarDays,
  FileText, Send, Loader2, Sparkles, Check, X, ShieldAlert, History,
  Camera, Image as ImageIcon, Eye, Users, Info
} from "lucide-react";
import { toast } from "sonner";

const getStepState = (stepNumber: 1 | 2 | 3 | 4, status: string) => getOvertimeStepState(stepNumber, status);

export function OvertimeStaffSection() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Form State
  const [overtimeDate, setOvertimeDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [startTime, setStartTime] = useState("18:30");
  const [endTime, setEndTime] = useState("20:30");
  const [staffNotes, setStaffNotes] = useState("");
  const [tasks, setTasks] = useState<OvertimeTask[]>([
    { id: "1", task: "", target: "", note: "" }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Report Modal State
  const [reportingReq, setReportingReq] = useState<OvertimeRequest | null>(null);
  const [actualEndTime, setActualEndTime] = useState("");
  const [taskReports, setTaskReports] = useState<OvertimeTaskReport[]>([]);
  const [reportNotes, setReportNotes] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Proof Images state for Report Modal
  const [existingProofImages, setExistingProofImages] = useState<string[]>([]);
  const [newProofFiles, setNewProofFiles] = useState<{
    file: File;
    previewUrl: string;
    originalSize: number;
    compressedSize: number;
  }[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
 * Bentuk dasar untuk "rekan tim lembur hari ini".
 *
 * Endpoint `?scope=today` sengaja hanya mengembalikan nama, jam, dan
 * status — bukan `tasks`, `staff_notes`, atau `task_reports` milik orang
 * lain. Field lain diisi nilai kosong supaya tipenya tetap sama dengan
 * `OvertimeRequest` dan komponen ini tidak perlu tahu bedanya.
 */
const EMPTY_OVERTIME = {
  requestDate: "",
  requestedDurationMinutes: 0,
  tasks: [] as OvertimeTaskReport[],
  staffNotes: null as string | null,
  approvedDurationMinutes: null as number | null,
  approvedBy: null as string | null,
  approvalDate: null as string | null,
  approvalNotes: null as string | null,
  rejectionReason: null as string | null,
  actualDurationMinutes: null as number | null,
  reportSubmittedAt: null as string | null,
  taskReports: [] as OvertimeTaskReport[],
  staffReportNotes: null as string | null,
  finalDurationMinutes: null as number | null,
  finalizedBy: null as string | null,
  finalizedDate: null as string | null,
  finalNotes: null as string | null,
  proofImages: [] as string[],
  createdAt: "",
  updatedAt: "",
  userPosition: undefined as string | undefined,
} satisfies Partial<OvertimeRequest>;

// Lightbox Preview Modal State
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Full detail modal state
  const [selectedDetailOvertime, setSelectedDetailOvertime] = useState<OvertimeRequest | null>(null);

  // Today's team overtime colleagues
  const [todayColleagues, setTodayColleagues] = useState<OvertimeRequest[]>([]);
  const [isLoadingColleagues, setIsLoadingColleagues] = useState(false);

  // Lock background scroll when report modal is open
  useEffect(() => {
    if (!reportingReq) return;
    const originalBodyOverflow = document.body.style.overflow;
    const mainEl = document.querySelector("main");
    const originalMainOverflow = mainEl ? mainEl.style.overflow : "";

    document.body.style.overflow = "hidden";
    if (mainEl) mainEl.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      if (mainEl) mainEl.style.overflow = originalMainOverflow;
    };
  }, [reportingReq]);

  // Auto calculate requested duration in minutes
  const calcDurationMinutes = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return 0;
    const [sh, sm] = startStr.split(":").map(Number);
    const [eh, em] = endStr.split(":").map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    return Math.max(0, endMins - startMins);
  };

  const formatMinutes = (mins: number | null | undefined) => formatDurationDetail(mins);

  const durationMinutes = calcDurationMinutes(startTime, endTime);

  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);

  // Fetch overtime requests for current user
  //
  // formerly `overtime_requests.select("*, users!user_id(...)").eq("user_id",
  // user.id)` dari browser. `.eq("user_id", user.id)` memakai id dari
  // AuthContext — kalau nilainya diubah di DevTools, user bisa melihat
  // pengajuan lembur orang lain.
  //
  // sekarang `?scope=mine`, dan server memakai `me.id` dari sesi.
  const fetchOvertimes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/overtime?scope=mine", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { requests?: OvertimeRequest[] };
        error?: string;
      };

      if (!res.ok) {
        setOvertimeRequests([]);
        console.error("Gagal memuat pengajuan lembur:", json.error);
        return;
      }

      // Server sudah mengirim camelCase, jadi tidak ada pemetaan lagi.
      setOvertimeRequests(
        ((json.data?.requests ?? []) as OvertimeRequest[]).map((r) => ({
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
        })),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const todayDateStr = new Date().toISOString().substring(0, 10);

  // Rekan tim yang lembur hari ini.
  //
  // formerly `.select("*, ...")` dari browser — jadi semua kolom ikut
  // terbaca, termasuk `tasks`, `staff_notes`, dan `task_reports` milik
  // orang lain. Halaman ini cuma menampilkan nama, jam, dan status.
  // Sekarang `?scope=today` mengembalikan hanya field itu.
  const fetchTodayColleagues = async () => {
    setIsLoadingColleagues(true);
    try {
      const res = await fetch(
        `/api/overtime?scope=today&date=${todayDateStr}`,
        { credentials: "include", cache: "no-store" },
      );
      const json = (await res.json()) as {
        ok: boolean;
        data?: { requests?: any[] };
      };

      if (!res.ok) {
        setTodayColleagues([]);
        return;
      }

      setTodayColleagues(
        (json.data?.requests ?? []).map((r) => ({
          ...EMPTY_OVERTIME,
          id: r.id,
          userId: r.userId,
          overtimeDate: r.overtimeDate,
          requestedStartTime: (r.requestedStartTime || "").substring(0, 5),
          requestedEndTime: (r.requestedEndTime || "").substring(0, 5),
          status: r.status,
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
          userName: r.userName,
          userDepartment: r.departmentName,
        })),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingColleagues(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancelingId) return;
    setIsCanceling(true);
    const tid = toast.loading("Membatalkan pengajuan lembur...");

    /**
     * formerly `.delete().eq("id").eq("user_id").eq("status", "pending")`
     * dari browser. Ketiga filternya benar, tapi hasil `delete()` tidak
     * pernah diperiksa — kalau tidak ada yang terhapus (misalnya status
     * sudah berubah), UI tetap menampilkan "berhasil dibatalkan".
     *
     * sekarang DELETE `/api/overtime?id=...&cancel=1`; server mengembalikan
     * 400 dengan alasannya kalau tahapnya tidak cocok.
     */
    const res = await fetch(
      `/api/overtime?id=${encodeURIComponent(cancelingId)}&cancel=1`,
      { method: "DELETE", credentials: "include" },
    );
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    setIsCanceling(false);

    if (!res.ok) {
      toast.error(json?.error ?? "Gagal membatalkan pengajuan.", { id: tid });
      return;
    }

    toast.success("Pengajuan lembur berhasil dibatalkan", { id: tid });
    setCancelingId(null);
    void fetchOvertimes();
    void fetchTodayColleagues();
  };

  // Polling 30 detik menggantikan subscription `postgres_changes` Supabase
  // (lihat AGENTS.md).
  useEffect(() => {
    void fetchOvertimes();
    void fetchTodayColleagues();

    const timer = setInterval(() => {
      void fetchOvertimes();
      void fetchTodayColleagues();
    }, 30_000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Task repeater actions
  const addTask = () => {
    setTasks(prev => [...prev, { id: Date.now().toString(), task: "", target: "", note: "" }]);
  };

  const removeTask = (id: string) => {
    if (tasks.length <= 1) return;
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const updateTask = (id: string, field: keyof OvertimeTask, val: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: val } : t));
  };

  // Submit Overtime Request
  const handleSubmitForm = async () => {
    if (!user) return;
    if (!overtimeDate) { toast.error("Pilih tanggal lembur."); return; }
    if (durationMinutes <= 0) { toast.error("Jam selesai harus lebih besar dari jam mulai."); return; }
    const validTasks = tasks.filter(t => t.task.trim() !== "");
    if (validTasks.length === 0) { toast.error("Isi minimal 1 rencana tugas lembur."); return; }

    // formerly ada batas 4 jam (hari kerja) dan 12 jam (hari libur).
    // Dihapus karena batas itu sudah dilanggar dua dari empat pengajuan
    // yang ada di produksi -- keduanya tetap disetujui HR dan tetap
    // dibayar. Batas yang hanya berlaku di form, tapi tidak di server,
    // cuma menahan staf yang jujur dan membiarkan yang lain lewat.
    //
    // Yang tetap dijaga: durasi harus lebih dari 0 (dicek di atas), dan
    // laporan aktual tidak boleh melebihi yang disetujui HR.

    setShowConfirm(false);
    setIsSubmitting(true);
    const tid = toast.loading("Mengirim pengajuan lembur...");

    /**
     * formerly `overtime_requests.insert({ user_id: user.id, ... })` dari
     * browser.
     *
     * `user_id` berasal dari AuthContext — kalau diubah di DevTools,
     * pengajuan akan tercatat atas nama orang lain. Validasi durasi
     * maksimum dan tanggal juga hanya ada di form, jadi bisa dilewati
     * dengan satu request biasa.
     *
     * sekarang semua itu dicek server; form hanya memberi tahu lebih awal.
     */
    const res = await fetch("/api/overtime", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        overtimeDate,
        startTime,
        endTime,
        tasks: validTasks,
        staffNotes: staffNotes.trim() || null,
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    setIsSubmitting(false);

    if (!res.ok) {
      toast.error(json?.error ?? "Gagal mengirim pengajuan.", { id: tid });
      return;
    }

    toast.success("Pengajuan lembur berhasil dikirim ke HR!", { id: tid });
    setStaffNotes("");
    setTasks([{ id: "1", task: "", target: "", note: "" }]);
    setActiveTab("history");
    void fetchOvertimes();
    void fetchTodayColleagues();
  };

  // Open Report Modal
  const handleOpenReportModal = (req: OvertimeRequest) => {
    setReportingReq(req);
    const now = new Date();
    const currentHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setActualEndTime(req.actualEndTime || req.approvedEndTime || currentHM);
    
    if (req.taskReports && req.taskReports.length > 0) {
      setTaskReports(req.taskReports);
    } else {
      setTaskReports(
        req.tasks.map(t => ({
          id: t.id,
          task: t.task,
          target: t.target,
          actualResult: "",
          progress: 100,
          status: "completed",
          note: ""
        }))
      );
    }
    setReportNotes(req.staffReportNotes || "");
    setExistingProofImages(req.proofImages || []);
    setNewProofFiles([]);
  };

  // Proof Images Handlers
  const handleSelectProofImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 2 - (existingProofImages.length + newProofFiles.length);
    if (remainingSlots <= 0) {
      toast.error("Maksimal 2 foto bukti lembur.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    setIsCompressing(true);
    const toastId = toast.loading("Mengompresi foto...");

    try {
      const processed: {
        file: File;
        previewUrl: string;
        originalSize: number;
        compressedSize: number;
      }[] = [];

      for (const file of filesToProcess) {
        const originalSize = file.size;
        const compressedFile = await compressImage(file, {
          maxSizeMB: 0.15, // max ~150KB
          maxWidthOrHeight: 800,
        });
        const compressedSize = compressedFile.size;
        const previewUrl = URL.createObjectURL(compressedFile);

        processed.push({
          file: compressedFile,
          previewUrl,
          originalSize,
          compressedSize,
        });
      }

      setNewProofFiles(prev => [...prev, ...processed]);
      toast.success(
        `Foto berhasil dikompresi (${formatBytes(processed[0]?.compressedSize || 0)})`,
        { id: toastId }
      );
    } catch (err: any) {
      toast.error("Gagal mengompresi foto: " + (err.message || "Unknown error"), { id: toastId });
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeExistingImage = (idxToRemove: number) => {
    setExistingProofImages(prev => prev.filter((_, idx) => idx !== idxToRemove));
  };

  const removeNewFile = (idxToRemove: number) => {
    setNewProofFiles(prev => {
      const item = prev[idxToRemove];
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, idx) => idx !== idxToRemove);
    });
  };

  // Submit Overtime Report
  const handleSubmitReport = async () => {
    if (!reportingReq) return;
    if (!actualEndTime) { toast.error("Isi jam selesai aktual."); return; }

    const actualStart = reportingReq.approvedStartTime || reportingReq.requestedStartTime;

    setIsSubmittingReport(true);
    const tid = toast.loading("Mengirim laporan lembur...");

    /**
     * formerly: upload ke Supabase Storage, lalu
     * `update({ status: "reported", ... }).eq("id", reportingReq.id)`.
     *
     * Dua masalah:
     *   1. Tidak ada cek pemilik maupun tahap. Cukup menebak id, staf
     *      bisa menulis laporan atas nama orang lain — dan laporan
     *      inilah yang jadi dasar perhitungan gaji.
     *   2. Durasi aktual tidak pernah dibandingkan dengan yang disetujui.
     *      Kalau HR menyetujui 4 jam dan staf melaporkan 10, angkanya
     *      diterima begitu saja.
     *
     * Upload foto belum ada: Supabase Storage sudah dilepas dan
     * penggantinya (Cloudflare R2) masih Phase 4d. Foto yang sudah
     * tersimpan tidak hilang; untuk sementara tidak bisa ditambah.
     */
    const res = await fetch("/api/overtime", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: reportingReq.id,
        action: "report",
        actualStartTime: actualStart,
        actualEndTime,
        taskReports,
        staffReportNotes: reportNotes.trim() || null,
        proofImages: existingProofImages,
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    setIsSubmittingReport(false);

    if (!res.ok) {
      toast.error(json?.error ?? "Gagal submit laporan.", { id: tid });
      return;
    }

    toast.success("Laporan lembur berhasil disubmit ke HR!", { id: tid });
    setReportingReq(null);
    setNewProofFiles([]);
    void fetchOvertimes();
    void fetchTodayColleagues();
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "pending":
        return <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/20">Menunggu Review HR</span>;
      case "approved":
        return <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-500 border border-blue-500/20">Disetujui HR (Jadwal)</span>;
      case "reported":
        return <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-500 border border-purple-500/20">Laporan Terkirim (Verifikasi HR)</span>;
      case "finalized":
        return <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Final (Selesai)</span>;
      case "rejected":
        return <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-500/10 text-red-500 border border-red-500/20">Ditolak HR</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-gray-500/10 text-gray-500">{s}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Widget Info Rekan Tim Lembur Hari Ini */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500/10 via-[var(--ab-bg-surface)] to-amber-500/5 rounded-3xl border border-amber-500/20 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Users size={16} />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-[var(--ab-text-main)] uppercase tracking-tight flex items-center gap-2">
                Staf Lembur Hari Ini ({new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })})
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500 text-white">
                  {todayColleagues.length} Orang
                </span>
              </h4>
              <p className="text-[9.5px] font-bold text-[var(--ab-text-dim)] uppercase tracking-wider">
                Rekan kerja yang terjadwal atau sedang melaksanakan lembur hari ini
              </p>
            </div>
          </div>
        </div>

        {todayColleagues.length === 0 ? (
          <div className="p-3 bg-[var(--ab-bg-surface)]/60 rounded-2xl border border-[var(--ab-border)]/50 text-center">
            <p className="text-xs font-bold text-[var(--ab-text-dim)]">
              Belum ada rekan staf yang mengajukan / terjadwal lembur hari ini.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
            {todayColleagues.map((colleague) => (
              <div
                key={colleague.id}
                onClick={() => setSelectedDetailOvertime(colleague)}
                className="p-3 rounded-2xl bg-[var(--ab-bg-surface)] border border-[var(--ab-border)] hover:border-amber-500/40 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group"
                title="Klik untuk lihat detail lembur"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-xs shrink-0 uppercase">
                    {colleague.userName ? colleague.userName.substring(0, 2) : "ST"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-[var(--ab-text-main)] truncate group-hover:text-amber-500 transition-colors">
                      {colleague.userName} {colleague.userId === user?.id && <span className="text-amber-500 font-bold">(Anda)</span>}
                    </p>
                    <p className="text-[9.5px] font-bold text-[var(--ab-text-dim)] truncate">
                      {formatScheduleRange(
                        colleague.approvedStartTime || colleague.requestedStartTime,
                        colleague.actualEndTime || colleague.approvedEndTime || colleague.requestedEndTime,
                        colleague.finalDurationMinutes || colleague.actualDurationMinutes || colleague.approvedDurationMinutes || colleague.requestedDurationMinutes
                      )}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {colleague.status === "finalized" ? (
                    <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      Final
                    </span>
                  ) : colleague.status === "reported" ? (
                    <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 border border-purple-500/20">
                      Lapor
                    </span>
                  ) : colleague.status === "approved" ? (
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

      {/* Sub Tabs */}
      <div className="flex bg-[var(--ab-bg-main)] p-1.5 rounded-2xl border border-[var(--ab-border)] w-full sm:w-fit mx-auto shadow-inner">
        <button
          onClick={() => setActiveTab("form")}
          className={`flex-1 sm:flex-initial px-3 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all text-center ${
            activeTab === "form"
              ? "bg-[var(--ab-bg-surface)] text-[var(--ab-primary)] shadow-md border border-[var(--ab-border)]"
              : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
          }`}
        >
          Form Pengajuan
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 sm:flex-initial px-3 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${
            activeTab === "history"
              ? "bg-[var(--ab-bg-surface)] text-[var(--ab-primary)] shadow-md border border-[var(--ab-border)]"
              : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
          }`}
        >
          <History size={13} /> Riwayat ({overtimeRequests.length})
        </button>
      </div>

      {activeTab === "form" ? (
        <div className="ab-card-tactile space-y-6">
          <div className="flex items-center gap-3 border-b border-[var(--ab-border)] pb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-black">
              <Clock size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-[var(--ab-text-main)] uppercase tracking-tight">
                Pengajuan Lembur Staf
              </h3>
              <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                Isi rencana tugas & durasi lembur untuk di-review HR
              </p>
            </div>
          </div>

          {/* User Identitas Card (Readonly) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] text-xs">
            <div>
              <span className="block text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Nama Karyawan</span>
              <span className="font-black text-[var(--ab-text-main)]">{user?.name}</span>
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Divisi</span>
              <span className="font-bold text-[var(--ab-text-main)]">{user?.departmentName || "-"}</span>
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Posisi</span>
              <span className="font-bold text-[var(--ab-text-main)]">{user?.position || "-"}</span>
            </div>
          </div>

          {/* Tanggal & Waktu Lembur */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest">
                Tanggal Lembur
              </label>
              <input
                type="date"
                value={overtimeDate}
                onChange={(e) => setOvertimeDate(e.target.value)}
                className="ab-input text-xs font-black py-3 px-4 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest">
                Mulai Lembur
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="ab-input text-xs font-black py-3 px-4 rounded-xl text-center"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest">
                Selesai Lembur
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="ab-input text-xs font-black py-3 px-4 rounded-xl text-center"
              />
            </div>
          </div>

          {/* Durasi Summary Box */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-amber-500" />
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                  Estimasi Durasi Pengajuan
                </span>
                <span className="text-[10px] font-bold text-[var(--ab-text-dim)]">
                  Jadwal: {startTime} s/d {endTime}
                </span>
              </div>
            </div>
            <span className="text-sm sm:text-base font-black text-amber-600 dark:text-amber-400 self-end sm:self-center">
              {formatDurationDetail(durationMinutes)}
            </span>
          </div>

          {/* Tasks Repeater */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest">
                Rencana Tugas & Target Output (Workload)
              </label>
              <button
                type="button"
                onClick={addTask}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ab-primary)]/10 text-[var(--ab-primary)] rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-[var(--ab-primary)]/20 transition-all"
              >
                <Plus size={12} /> Tambah Task
              </button>
            </div>

            <div className="space-y-2.5">
              {tasks.map((t, index) => (
                <div key={t.id} className="p-3 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] flex flex-col md:flex-row gap-2.5 items-start md:items-center">
                  <span className="text-[10px] font-black w-5 h-5 rounded-full bg-[var(--ab-bg-surface)] text-[var(--ab-text-dim)] flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <div className="flex-1 w-full space-y-1">
                    <input
                      type="text"
                      value={t.task}
                      onChange={(e) => updateTask(t.id, "task", e.target.value)}
                      placeholder="Nama Pekerjaan / Task (cth: Edit 3 Video TikTok)"
                      className="ab-input text-xs w-full py-2 px-3"
                    />
                  </div>
                  <div className="w-full md:w-48 space-y-1">
                    <input
                      type="text"
                      value={t.target}
                      onChange={(e) => updateTask(t.id, "target", e.target.value)}
                      placeholder="Target Output (cth: 3 Video Siap)"
                      className="ab-input text-xs w-full py-2 px-3"
                    />
                  </div>
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(t.id)}
                      className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Catatan Tambahan */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest">
              Catatan / Urgensi Lembur (Opsional)
            </label>
            <textarea
              rows={2}
              value={staffNotes}
              onChange={(e) => setStaffNotes(e.target.value)}
              placeholder="Berikan keterangan tambahan jika ada deadline mendesak..."
              className="ab-input text-xs w-full py-3 px-4 rounded-xl resize-none"
            />
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={isSubmitting}
            className="w-full py-4 rounded-2xl font-black uppercase text-xs tracking-widest bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transition-transform active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <Send size={14} /> Kirim Pengajuan Lembur
          </button>
        </div>
      ) : (
        /* History Section */
        <div className="space-y-4">
          {isLoading ? (
            <div className="p-12 text-center text-xs font-bold text-[var(--ab-text-dim)] animate-pulse">
              Memuat data lembur...
            </div>
          ) : overtimeRequests.length === 0 ? (
            <div className="p-12 bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)] text-center space-y-2">
              <Clock size={36} className="mx-auto text-[var(--ab-text-dim)] opacity-40 mb-2" />
              <p className="text-xs font-black uppercase tracking-wider text-[var(--ab-text-dim)]">
                Belum ada riwayat lembur
              </p>
            </div>
          ) : (
            overtimeRequests.map((req) => (
              <div
                key={req.id}
                className="bg-[var(--ab-bg-surface)] p-5 rounded-3xl border border-[var(--ab-border)] shadow-sm space-y-5 relative overflow-hidden"
              >
                {/* Header: Date & Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--ab-border)]/60 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-black shrink-0">
                      <CalendarDays size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-[var(--ab-text-main)]">
                        {new Date(req.overtimeDate).toLocaleDateString("id-ID", {
                          weekday: "long", day: "numeric", month: "long", year: "numeric"
                        })}
                      </h4>
                      <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-wider">
                        Diajukan pada {new Date(req.requestDate).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                  </div>
                  <div>{statusBadge(req.status)}</div>
                </div>

                {/* Visual Progress Stepper (Tracker 4 Tahap) */}
                <div className="p-4 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-500" /> Progres Pengajuan Lembur
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--ab-text-dim)]">
                      Tahap {req.status === "pending" ? "1 dari 4" : req.status === "approved" ? "2 dari 4" : req.status === "reported" ? "3 dari 4" : req.status === "finalized" ? "Selesai (4/4)" : "Ditolak"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 relative">
                    {[
                      {
                        step: 1,
                        title: "1. Pengajuan",
                        desc: formatScheduleRange(req.requestedStartTime, req.requestedEndTime, req.requestedDurationMinutes),
                      },
                      {
                        step: 2,
                        title: "2. Review HR",
                        desc: req.status === "pending"
                          ? "Menunggu HR"
                          : req.status === "rejected"
                          ? "Ditolak"
                          : req.approvedStartTime
                          ? formatScheduleRange(req.approvedStartTime, req.approvedEndTime, req.approvedDurationMinutes)
                          : "Disetujui",
                      },
                      {
                        step: 3,
                        title: "3. Laporan Kerja",
                        desc: req.actualEndTime
                          ? `Selesai ${req.actualEndTime} (${formatDurationDetail(req.actualDurationMinutes)})`
                          : req.status === "approved"
                          ? "Waktunya Lapor"
                          : "Belum mulai",
                      },
                      {
                        step: 4,
                        title: "4. Final Sah",
                        desc: req.finalDurationMinutes !== null && req.finalDurationMinutes !== undefined
                          ? formatDurationDetail(req.finalDurationMinutes)
                          : "Slip Gaji",
                      },
                    ].map((st) => {
                      const { state } = getStepState(st.step as any, req.status);
                      return (
                        <div
                          key={st.step}
                          className={`flex flex-col items-center text-center p-2.5 rounded-xl transition-all border ${
                            state === "completed"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              : state === "current"
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20"
                              : state === "rejected"
                              ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                              : "bg-[var(--ab-bg-surface)] border-[var(--ab-border)]/40 text-[var(--ab-text-dim)] opacity-60"
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black mb-1.5 ${
                              state === "completed"
                                ? "bg-emerald-500 text-white shadow-sm"
                                : state === "current"
                                ? "bg-amber-500 text-white animate-pulse shadow-sm shadow-amber-500/50"
                                : state === "rejected"
                                ? "bg-rose-500 text-white"
                                : "bg-[var(--ab-border)] text-[var(--ab-text-dim)]"
                            }`}
                          >
                            {state === "completed" ? (
                              <Check size={12} strokeWidth={3} />
                            ) : state === "rejected" ? (
                              <X size={12} strokeWidth={3} />
                            ) : (
                              st.step
                            )}
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-tight line-clamp-1">
                            {st.title}
                          </span>
                          <span className="text-[8.5px] font-bold line-clamp-1 opacity-85 mt-0.5">
                            {st.desc}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Status Guidance Banner */}
                  {req.status === "pending" && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-start gap-2">
                        <Clock size={16} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] font-bold leading-relaxed">
                          Pengajuan lembur Anda telah terkirim dan saat ini <span className="font-black text-amber-600 dark:text-amber-400">sedang di-review oleh HR</span>.
                        </p>
                      </div>
                      <button
                        onClick={() => setCancelingId(req.id)}
                        disabled={isCanceling}
                        className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg shrink-0 transition-colors w-fit self-end sm:self-center"
                      >
                        Batalkan
                      </button>
                    </div>
                  )}

                  {req.status === "approved" && (
                    <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] font-bold leading-relaxed">
                          HR telah menyetujui jadwal lembur ({formatScheduleRange(req.approvedStartTime, req.approvedEndTime, req.approvedDurationMinutes)}). Setelah selesai bekerja, segera laporkan hasil pekerjaan aktual Anda.
                        </p>
                      </div>
                      <button
                        onClick={() => handleOpenReportModal(req)}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2"
                      >
                        <FileText size={15} /> Isi Laporan Selesai Lembur
                      </button>
                    </div>
                  )}

                  {req.status === "reported" && (
                    <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-700 dark:text-purple-300 space-y-2.5">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-purple-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] font-bold leading-relaxed">
                          Laporan hasil kerja lembur Anda telah terkirim (Jam Selesai Riil: {req.actualEndTime}). Menunggu validasi akhir HR untuk penetapan durasi final pada Slip Gaji.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenReportModal(req)}
                        className="w-full py-2 bg-purple-600/15 hover:bg-purple-600/25 text-purple-600 dark:text-purple-400 font-black text-[11px] uppercase tracking-wider rounded-xl transition-all border border-purple-500/30 flex items-center justify-center gap-2"
                      >
                        <FileText size={13} /> Edit Laporan & Bukti Foto
                      </button>
                    </div>
                  )}

                  {req.status === "finalized" && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                      <Sparkles size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] font-bold leading-relaxed">
                        Lembur telah disahkan oleh HR dengan durasi final <span className="font-black text-emerald-600 dark:text-emerald-400">{formatDurationDetail(req.finalDurationMinutes)}</span> dan otomatis masuk ke perhitungan Slip Gaji.
                      </p>
                    </div>
                  )}

                  {req.status === "rejected" && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                      <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                      <div className="text-[11px] font-bold leading-relaxed">
                        Pengajuan lembur ditolak oleh HR.
                        {req.rejectionReason && (
                          <span className="block mt-0.5 font-black text-rose-600 dark:text-rose-400">
                            Alasan: {req.rejectionReason}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4 Durasi Columns Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] text-center">
                  <div className="p-2.5 rounded-xl bg-[var(--ab-bg-surface)] border border-[var(--ab-border)]/40">
                    <span className="block text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">1. Request Staf</span>
                    <span className="text-xs font-black text-[var(--ab-text-main)] block">{req.requestedStartTime} - {req.requestedEndTime}</span>
                    <span className="block text-[9.5px] font-bold text-amber-500 mt-0.5">({formatDurationDetail(req.requestedDurationMinutes)})</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--ab-bg-surface)] border border-[var(--ab-border)]/40">
                    <span className="block text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">2. Approved HR</span>
                    {req.approvedStartTime ? (
                      <>
                        <span className="text-xs font-black text-blue-500 block">{req.approvedStartTime} - {req.approvedEndTime}</span>
                        <span className="block text-[9.5px] font-bold text-blue-500 mt-0.5">({formatDurationDetail(req.approvedDurationMinutes)})</span>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-[var(--ab-text-dim)] block mt-1.5">-</span>
                    )}
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--ab-bg-surface)] border border-[var(--ab-border)]/40">
                    <span className="block text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">3. Actual Selesai</span>
                    {req.actualEndTime ? (
                      <>
                        <span className="text-xs font-black text-purple-500 block">{req.actualStartTime} - {req.actualEndTime}</span>
                        <span className="block text-[9.5px] font-bold text-purple-500 mt-0.5">({formatDurationDetail(req.actualDurationMinutes)})</span>
                      </>
                    ) : (
                      <span className="text-xs font-bold text-[var(--ab-text-dim)] block mt-1.5">Belum lapor</span>
                    )}
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--ab-bg-surface)] border border-[var(--ab-border)]/40">
                    <span className="block text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">4. Final Sah</span>
                    {req.finalDurationMinutes !== null && req.finalDurationMinutes !== undefined ? (
                      <span className="text-xs font-black text-emerald-500 block mt-1.5">{formatDurationDetail(req.finalDurationMinutes)}</span>
                    ) : (
                      <span className="text-xs font-bold text-[var(--ab-text-dim)] block mt-1.5">-</span>
                    )}
                  </div>
                </div>

                {/* Workload / Tasks List */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Daftar Pekerjaan & Target:</span>
                  <div className="space-y-1">
                    {req.tasks.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-3 bg-[var(--ab-bg-main)]/50 rounded-xl border border-[var(--ab-border)]/40">
                        <span className="font-bold text-[var(--ab-text-main)]">• {t.task}</span>
                        <span className="text-[10px] font-black text-[var(--ab-text-dim)] bg-[var(--ab-bg-surface)] px-2 py-0.5 rounded-lg border border-[var(--ab-border)]">{t.target}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actual Task Reports if already reported */}
                {req.taskReports && req.taskReports.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-purple-500">Hasil Pekerjaan Riil:</span>
                    <div className="space-y-1">
                      {req.taskReports.map((tr, idx) => (
                        <div key={idx} className="p-2.5 bg-purple-500/5 rounded-xl border border-purple-500/20 text-xs space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-black text-[var(--ab-text-main)]">{tr.task}</span>
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400">
                              {tr.status === "completed" ? "✅ Selesai 100%" : tr.status === "partial" ? "⏳ Sebagian" : "❌ Belum Selesai"}
                            </span>
                          </div>
                          {tr.actualResult && (
                            <p className="text-[11px] font-bold text-[var(--ab-text-dim)]">
                              Hasil: <span className="text-[var(--ab-text-main)]">{tr.actualResult}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proof Images if exists */}
                {req.proofImages && req.proofImages.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] flex items-center gap-1.5">
                      <ImageIcon size={13} className="text-purple-500" /> Foto Bukti Kerja ({req.proofImages.length} Foto):
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

                {/* Notes from HR */}
                {req.approvalNotes && (
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-600 dark:text-blue-400 space-y-0.5">
                    <span className="font-black uppercase text-[8px] tracking-widest">Catatan Persetujuan HR:</span>
                    <p className="font-bold">{req.approvalNotes}</p>
                  </div>
                )}
                {req.finalNotes && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 space-y-0.5">
                    <span className="font-black uppercase text-[8px] tracking-widest">Catatan Final HR:</span>
                    <p className="font-bold">{req.finalNotes}</p>
                  </div>
                )}

                {/* Button Lihat Detail Lengkap */}
                <div className="pt-2 border-t border-[var(--ab-border)]/50">
                  <button
                    type="button"
                    onClick={() => setSelectedDetailOvertime(req)}
                    className="w-full py-2.5 bg-[var(--ab-bg-main)] hover:bg-[var(--ab-border)]/50 text-[var(--ab-text-main)] font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl transition-all border border-[var(--ab-border)] flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Eye size={14} className="text-amber-500" /> Lihat Detail Lengkap (Semua Tahap)
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        title="Konfirmasi Pengajuan Lembur"
        message={`Yakin ingin mengajukan lembur pada tanggal ${overtimeDate} dengan durasi ${formatMinutes(durationMinutes)}?`}
        confirmLabel="Ya, Kirim Pengajuan"
        type="info"
        onConfirm={handleSubmitForm}
        onCancel={() => setShowConfirm(false)}
      />

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(cancelingId)}
        title="Batalkan Pengajuan Lembur"
        message="Apakah Anda yakin ingin membatalkan pengajuan lembur ini? Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, Batalkan"
        cancelLabel="Kembali"
        type="danger"
        onConfirm={handleCancelRequest}
        onCancel={() => setCancelingId(null)}
      />

      {/* Report Modal */}
      {reportingReq && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReportingReq(null);
          }}
        >
          <div className="w-full max-w-lg my-auto bg-[var(--ab-bg-surface)] rounded-[32px] p-5 sm:p-7 border border-[var(--ab-border)] shadow-2xl ab-animate-scaleIn max-h-[90vh] overflow-y-auto space-y-5 relative">
            <div className="flex justify-between items-center border-b border-[var(--ab-border)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--ab-text-main)] uppercase tracking-tight">
                  Laporan Hasil Kerja Lembur
                </h3>
                <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                  Tanggal: {reportingReq.overtimeDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportingReq(null)}
                className="p-2 rounded-full text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] hover:bg-[var(--ab-bg-main)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Jam Selesai Riil */}
            <div className="space-y-2.5 p-3.5 sm:p-4 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] box-border max-w-full overflow-hidden">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest block">
                  Jam Selesai Aktual
                </label>
                <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                  Bisa lebih cepat / lebih lama
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-[var(--ab-text-dim)] block">Waktu Selesai (Riil):</span>
                  <input
                    type="time"
                    value={actualEndTime}
                    onChange={(e) => setActualEndTime(e.target.value)}
                    className="ab-input text-sm font-black py-2.5 px-3 rounded-xl text-center w-full box-border max-w-full"
                  />
                </div>
                <div className="p-2.5 bg-[var(--ab-bg-surface)] rounded-xl border border-[var(--ab-border)] text-xs space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-[var(--ab-text-dim)] font-bold">
                    <span>Mulai:</span>
                    <span className="font-black text-[var(--ab-text-main)]">
                      {reportingReq.approvedStartTime || reportingReq.requestedStartTime}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-[var(--ab-text-dim)] font-bold">
                    <span>Durasi Riil:</span>
                    <span className="font-black text-purple-600 dark:text-purple-400">
                      {formatDurationDetail(
                        calcDurationMinutes(
                          reportingReq.approvedStartTime || reportingReq.requestedStartTime,
                          actualEndTime
                        )
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress per Task */}
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest block">
                Hasil Pencapaian Tugas
              </label>
              {taskReports.map((tr, idx) => (
                <div key={tr.id} className="p-3.5 bg-[var(--ab-bg-main)] rounded-2xl border border-[var(--ab-border)] space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs gap-1">
                    <span className="font-black text-[var(--ab-text-main)]">• {tr.task}</span>
                    <span className="text-[10px] font-bold text-[var(--ab-text-dim)]">Target: {tr.target}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Hasil riil (cth: 3 Video Selesai)"
                      value={tr.actualResult}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTaskReports(prev => prev.map(p => p.id === tr.id ? { ...p, actualResult: val } : p));
                      }}
                      className="ab-input text-xs py-2 px-3 rounded-xl"
                    />
                    <select
                      value={tr.status}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setTaskReports(prev => prev.map(p => p.id === tr.id ? { ...p, status: val } : p));
                      }}
                      className="ab-input text-xs py-2 px-3 rounded-xl font-bold"
                    >
                      <option value="completed">✅ Selesai Penuh (100%)</option>
                      <option value="partial">⏳ Sebagian</option>
                      <option value="not_completed">❌ Belum Selesai</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Catatan Laporan */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest">
                Catatan / Kendala Selama Lembur
              </label>
              <textarea
                rows={2}
                value={reportNotes}
                onChange={(e) => setReportNotes(e.target.value)}
                placeholder="Penjelasan hasil kerja atau alasan jika waktu molor..."
                className="ab-input text-xs w-full py-2.5 px-3 rounded-xl resize-none"
              />
            </div>

            {/* Upload Bukti Gambar (Maks 2 Foto) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest flex items-center gap-1.5">
                  <Camera size={13} className="text-purple-500" /> Foto Bukti Pekerjaan (Maks. 2 Foto)
                </label>
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Otomatis Dikompresi
                </span>
              </div>

              {/* Grid Thumbnail Preview */}
              <div className="grid grid-cols-2 gap-3">
                {/* Existing Images */}
                {existingProofImages.map((url, idx) => (
                  <div
                    key={`existing-${idx}`}
                    className="relative group rounded-2xl overflow-hidden border border-[var(--ab-border)] bg-black/20 aspect-video flex items-center justify-center shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Bukti ${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(url)}
                        className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-lg backdrop-blur-sm transition-all"
                        title="Perbesar"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeExistingImage(idx)}
                        className="p-1.5 bg-rose-500/80 hover:bg-rose-500 text-white rounded-lg backdrop-blur-sm transition-all"
                        title="Hapus"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 text-[8px] font-black uppercase rounded bg-black/60 text-white backdrop-blur-sm">
                      Foto {idx + 1}
                    </span>
                  </div>
                ))}

                {/* Newly Added Compressed Images */}
                {newProofFiles.map((item, idx) => (
                  <div
                    key={`new-${idx}`}
                    className="relative group rounded-2xl overflow-hidden border border-[var(--ab-border)] bg-black/20 aspect-video flex items-center justify-center shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl} alt={`Foto Baru ${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(item.previewUrl)}
                        className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-lg backdrop-blur-sm transition-all"
                        title="Perbesar"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeNewFile(idx)}
                        className="p-1.5 bg-rose-500/80 hover:bg-rose-500 text-white rounded-lg backdrop-blur-sm transition-all"
                        title="Hapus"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 text-[8px] font-black uppercase rounded bg-emerald-600/80 text-white backdrop-blur-sm">
                      {formatBytes(item.compressedSize)}
                    </span>
                  </div>
                ))}

                {/* Upload Trigger Button (jika belum mencapai 2 gambar) */}
                {existingProofImages.length + newProofFiles.length < 2 && (
                  <button
                    type="button"
                    disabled={isCompressing}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[var(--ab-border)] hover:border-purple-500/50 rounded-2xl aspect-video flex flex-col items-center justify-center gap-1.5 p-3 text-[var(--ab-text-dim)] hover:text-purple-500 hover:bg-purple-500/5 transition-all group cursor-pointer"
                  >
                    {isCompressing ? (
                      <>
                        <Loader2 size={20} className="animate-spin text-purple-500" />
                        <span className="text-[10px] font-bold">Mengompresi...</span>
                      </>
                    ) : (
                      <>
                        <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Camera size={16} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-center">
                          + Unggah Foto
                        </span>
                        <span className="text-[8px] text-[var(--ab-text-dim)] font-bold">
                          Selfie / Bukti Kerja
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleSelectProofImages}
                accept="image/*"
                multiple
                className="hidden"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setReportingReq(null)}
                className="w-full sm:flex-1 py-3.5 bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-[var(--ab-border)] transition-all border border-[var(--ab-border)]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitReport}
                disabled={isSubmittingReport || isCompressing}
                className="w-full sm:flex-1 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg hover:opacity-95 active:scale-95 transition-all"
              >
                {isSubmittingReport ? "Mengirim..." : "Kirim Laporan"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
