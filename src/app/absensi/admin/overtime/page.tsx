"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { OvertimeRequest } from "@/types/absensi";
import type { PayrollStaffSetting } from "@/types";
import OvertimeFinalizeModal from "@/components/absensi/OvertimeFinalizeModal";
import OvertimeDetailModal from "@/components/absensi/OvertimeDetailModal";
import ImageLightboxModal from "@/components/absensi/ImageLightboxModal";
import ConfirmDialog from "@/components/absensi/ConfirmDialog";
import {
  formatDurationDetail,
  formatScheduleRange,
  formatRp,
  isWeekend,
  calcDurationMinutes,
} from "@/lib/overtimeHelpers";
import {
  Clock,
  CalendarDays,
  Users,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Filter,
  CheckCircle2,
  AlertCircle,
  Eye,
  Trash2,
  Edit3,
  Sparkles,
  Calculator,
  Building2,
  X,
  FileText,
  Image as ImageIcon,
  DollarSign,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format, subMonths, addMonths } from "date-fns";
import { id as localeId } from "date-fns/locale";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export default function AdminOvertimePage() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [staffSettings, setStaffSettings] = useState<PayrollStaffSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "reported" | "finalized">("all");

  // Accordion open states (keyed by user_id)
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  // Modals
  const [finalizingReq, setFinalizingReq] = useState<OvertimeRequest | null>(null);
  const [selectedDetailReq, setSelectedDetailReq] = useState<OvertimeRequest | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [deletingReq, setDeletingReq] = useState<OvertimeRequest | null>(null);

  // Approve Schedule Modal (for initial pending review)
  const [approvingScheduleReq, setApprovingScheduleReq] = useState<OvertimeRequest | null>(null);
  const [approveStartTime, setApproveStartTime] = useState("");
  const [approveEndTime, setApproveEndTime] = useState("");
  const [approveNotes, setApproveNotes] = useState("");

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const periodLabel = format(currentDate, "MMMM yyyy", { locale: localeId });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      /**
       * formerly dua query dari browser. Selain menjadi bocor —
       * `payroll_staff_settings` berisi gaji dasar setiap orang dan
       * selama ini bisa dibaca siapa pun yang punya sesi, bukan cuma HR.
       *
       * sekarang satu endpoint yang sudah dijaga role-nya.
       */
      const res = await fetch(
        `/api/overtime?from=${startDate}&to=${endDate}`,
        { credentials: "include", cache: "no-store" },
      );
      const json = (await res.json()) as {
        ok: boolean;
        data?: {
          requests?: any[];
          settings?: {
            userId: string;
            defaultBaseSalary: string;
            defaultMobilityAllowance: string;
          }[];
        };
        error?: string;
      };

      if (!res.ok) {
        toast.error(json.error ?? "Gagal memuat data lembur.");
        return;
      }

      // Server sudah mengirim camelCase, jadi `rowToOvertimeRequest`
      // tidak perlu lagi.
      setOvertimes((json.data?.requests ?? []) as OvertimeRequest[]);
      setStaffSettings(
        (json.data?.settings ?? []).map((s: any) => ({
          ...s,
          user_id: s.user_id || s.userId,
          userId: s.userId || s.user_id,
          default_base_salary: Number(s.default_base_salary ?? s.defaultBaseSalary ?? 0),
          defaultBaseSalary: Number(s.defaultBaseSalary ?? s.default_base_salary ?? 0),
          default_mobility_allowance: Number(s.default_mobility_allowance ?? s.defaultMobilityAllowance ?? 0),
          defaultMobilityAllowance: Number(s.defaultMobilityAllowance ?? s.default_mobility_allowance ?? 0),
        })) as unknown as PayrollStaffSetting[],
      );
    } catch (err) {
      console.error("fetchData exception:", err);
      toast.error("Gagal memuat data lembur.");
    } finally {
      setIsLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Polling 30 detik menggantikan subscription `postgres_changes`.
  useEffect(() => {
    const timer = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Group overtimes by user_id
  const staffOvertimeMap = useMemo(() => {
    const map: Record<
      string,
      {
        user: {
          id: string;
          name: string;
          department?: string;
          position?: string;
          baseSalary: number;
        };
        items: OvertimeRequest[];
        totalFinalDays: number;
        totalFinalMinutes: number;
        totalFinalPay: number;
        pendingActionCount: number;
      }
    > = {};

    overtimes.forEach((o) => {
      const uId = o.userId;
      if (!map[uId]) {
        const setting = staffSettings.find(
          (s) => s.user_id === uId || (s as any).userId === uId,
        );
        const baseSal = Number(
          setting?.default_base_salary ??
            (setting as any)?.defaultBaseSalary ??
            o.calculationBreakdown?.baseSalary ??
            0,
        );
        map[uId] = {
          user: {
            id: uId,
            name: o.userName || "Karyawan",
            department: o.userDepartment || "Umum",
            position: o.userPosition || "-",
            baseSalary: baseSal,
          },
          items: [],
          totalFinalDays: 0,
          totalFinalMinutes: 0,
          totalFinalPay: 0,
          pendingActionCount: 0,
        };
      }

      map[uId].items.push(o);

      if (o.status === "finalized") {
        map[uId].totalFinalDays += 1;
        map[uId].totalFinalMinutes += Number(o.finalDurationMinutes) || 0;
        map[uId].totalFinalPay += Number(o.totalOvertimePay) || 0;
      }

      if (o.status === "pending" || o.status === "reported") {
        map[uId].pendingActionCount += 1;
      }
    });

    return map;
  }, [overtimes, staffSettings]);

  // Filtered staff list
  const filteredStaffList = useMemo(() => {
    const list = Object.values(staffOvertimeMap);

    return list.filter((staffGroup) => {
      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = staffGroup.user.name.toLowerCase().includes(q);
        const matchDept = (staffGroup.user.department || "").toLowerCase().includes(q);
        const matchPos = (staffGroup.user.position || "").toLowerCase().includes(q);
        const matchTask = staffGroup.items.some((it) =>
          it.tasks.some((t) => t.task.toLowerCase().includes(q))
        );
        if (!matchName && !matchDept && !matchPos && !matchTask) return false;
      }

      // Status filter
      if (statusFilter === "pending") {
        const hasPending = staffGroup.items.some((it) => it.status === "pending");
        if (!hasPending) return false;
      } else if (statusFilter === "reported") {
        const hasReported = staffGroup.items.some((it) => it.status === "reported");
        if (!hasReported) return false;
      } else if (statusFilter === "finalized") {
        const hasFinal = staffGroup.items.some((it) => it.status === "finalized");
        if (!hasFinal) return false;
      }

      return true;
    });
  }, [staffOvertimeMap, searchQuery, statusFilter]);

  // Overall monthly stats
  const overallStats = useMemo(() => {
    let totalUsers = 0;
    let totalSessions = overtimes.length;
    let totalFinalMins = 0;
    let totalFinalNominal = 0;
    let totalPendingReview = 0;
    let totalNeedFinalize = 0;

    const uniqueUsers = new Set<string>();

    overtimes.forEach((o) => {
      uniqueUsers.add(o.userId);
      if (o.status === "finalized") {
        totalFinalMins += Number(o.finalDurationMinutes) || 0;
        totalFinalNominal += Number(o.totalOvertimePay) || 0;
      }
      if (o.status === "pending") totalPendingReview++;
      if (o.status === "reported") totalNeedFinalize++;
    });

    totalUsers = uniqueUsers.size;

    return {
      totalUsers,
      totalSessions,
      totalFinalMins,
      totalFinalNominal,
      totalPendingReview,
      totalNeedFinalize,
    };
  }, [overtimes]);

  const toggleAccordion = (userId: string) => {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    filteredStaffList.forEach((s) => {
      allExpanded[s.user.id] = true;
    });
    setExpandedUsers(allExpanded);
  };

  const collapseAll = () => {
    setExpandedUsers({});
  };

  // Delete Overtime Request
  const handleDeleteOvertime = async () => {
    if (!deletingReq) return;
    const tid = toast.loading("Menghapus sesi lembur...");

    // formerly `.delete().eq("id", id)` dari browser — tanpa cek apa pun.
    // Pengajuan yang sudah `finalized` angkanya sudah dipakai untuk slip
    // gaji, jadi server menolaknya.
    const res = await fetch(
      `/api/overtime?id=${encodeURIComponent(deletingReq.id)}`,
      { method: "DELETE", credentials: "include" },
    );
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!res.ok) {
      toast.error(json?.error ?? "Gagal menghapus sesi lembur.", { id: tid });
      return;
    }

    toast.success("Sesi lembur berhasil dihapus.", { id: tid });
    setDeletingReq(null);
    void fetchData();
  };

  // Quick Approve Schedule
  const handleOpenApproveModal = (req: OvertimeRequest) => {
    setApprovingScheduleReq(req);
    setApproveStartTime(req.requestedStartTime);
    setApproveEndTime(req.requestedEndTime);
    setApproveNotes("");
  };

  const handleApproveSchedule = async () => {
    if (!approvingScheduleReq) return;
    const dur = calcDurationMinutes(approveStartTime, approveEndTime);
    if (dur <= 0) {
      toast.error("Jam selesai harus lebih besar dari jam mulai.");
      return;
    }

    const tid = toast.loading("Menyetujui jadwal lembur...");

    // formerly `update({ status: "approved", approved_by: user.id }).eq("id")`
    // tanpa cek status lama — approve bisa dijalankan ulang pada
    // pengajuan yang sudah `finalized`, menimpa gaji yang sudah dibayar.
    const res = await fetch("/api/overtime", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: approvingScheduleReq.id,
        action: "approve",
        approvedStartTime: approveStartTime,
        approvedEndTime: approveEndTime,
        approvalNotes: approveNotes.trim() || null,
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!res.ok) {
      toast.error(json?.error ?? "Gagal menyetujui jadwal.", { id: tid });
      return;
    }

    toast.success("Jadwal lembur berhasil disetujui!", { id: tid });
    setApprovingScheduleReq(null);
    void fetchData();
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header & Month Navigator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight flex items-center gap-2.5">
            <Clock className="text-amber-500" size={26} />
            Manajemen Lembur
          </h1>
          <p className="text-xs text-[var(--ab-text-dim)] font-medium mt-1">
            Rekap sesi lembur, verifikasi laporan kerja, kalkulasi upah cerdas, dan integrasi payroll otomatis.
          </p>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-2 bg-[var(--ab-bg-surface)] p-1.5 rounded-2xl border border-[var(--ab-border)] shadow-sm">
          <button
            onClick={() => setCurrentDate((d) => subMonths(d, 1))}
            className="p-2 rounded-xl text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] hover:bg-[var(--ab-bg-main)] transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs font-black uppercase tracking-wider text-[var(--ab-text-main)] px-3 min-w-[130px] text-center">
            {periodLabel}
          </span>
          <button
            onClick={() => setCurrentDate((d) => addMonths(d, 1))}
            className="p-2 rounded-xl text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] hover:bg-[var(--ab-bg-main)] transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="text-[10px] font-black uppercase px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            Bulan Ini
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-[var(--ab-bg-surface)] rounded-2xl border border-[var(--ab-border)] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[var(--ab-text-dim)]">
            <span className="text-[10px] font-black uppercase tracking-wider">Staf Lembur</span>
            <Users size={16} className="text-blue-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-[var(--ab-text-main)]">
            {overallStats.totalUsers}{" "}
            <span className="text-xs font-bold text-[var(--ab-text-dim)]">Orang</span>
          </p>
          <p className="text-[9.5px] font-bold text-[var(--ab-text-dim)]">
            {overallStats.totalSessions} Total Sesi Pengajuan
          </p>
        </div>

        <div className="p-4 bg-[var(--ab-bg-surface)] rounded-2xl border border-[var(--ab-border)] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[var(--ab-text-dim)]">
            <span className="text-[10px] font-black uppercase tracking-wider">Total Durasi Sah</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
            {formatDurationDetail(overallStats.totalFinalMins)}
          </p>
          <p className="text-[9.5px] font-bold text-[var(--ab-text-dim)]">
            Telah divalidasi dan disahkan
          </p>
        </div>

        <div className="p-4 bg-[var(--ab-bg-surface)] rounded-2xl border border-[var(--ab-border)] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[var(--ab-text-dim)]">
            <span className="text-[10px] font-black uppercase tracking-wider">Total Nominal Lembur</span>
            <DollarSign size={16} className="text-emerald-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {formatRp(overallStats.totalFinalNominal)}
          </p>
          <p className="text-[9.5px] font-bold text-[var(--ab-text-dim)]">
            Otomatis terhubung ke Payroll
          </p>
        </div>

        <div className="p-4 bg-[var(--ab-bg-surface)] rounded-2xl border border-[var(--ab-border)] shadow-sm space-y-1">
          <div className="flex items-center justify-between text-[var(--ab-text-dim)]">
            <span className="text-[10px] font-black uppercase tracking-wider">Perlu Tindakan HR</span>
            <AlertCircle size={16} className="text-purple-500" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 border border-amber-500/30">
              {overallStats.totalPendingReview} Review
            </span>
            <span className="text-sm font-black px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-600 border border-purple-500/30">
              {overallStats.totalNeedFinalize} Finalize
            </span>
          </div>
          <p className="text-[9.5px] font-bold text-[var(--ab-text-dim)]">
            Menunggu persetujuan / finalisasi
          </p>
        </div>
      </div>

      {/* Toolbar: Search, Status Filter, Expand Controls */}
      <div className="p-3 sm:p-4 bg-[var(--ab-bg-surface)] rounded-2xl border border-[var(--ab-border)] shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ab-text-dim)]" />
          <input
            type="text"
            placeholder="Cari nama karyawan, divisi, atau tugas lembur..."
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

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: "all", label: "Semua" },
              { id: "pending", label: "Review Jadwal" },
              { id: "reported", label: "Perlu Finalize" },
              { id: "finalized", label: "Sudah Sah" },
            ] as const
          ).map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                statusFilter === st.id
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] border border-[var(--ab-border)]"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Expand / Collapse All */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={expandAll}
            className="px-2.5 py-2 rounded-xl text-[10px] font-bold text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] hover:bg-[var(--ab-bg-main)] border border-transparent hover:border-[var(--ab-border)] transition-colors"
          >
            Buka Semua
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-2 rounded-xl text-[10px] font-bold text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] hover:bg-[var(--ab-bg-main)] border border-transparent hover:border-[var(--ab-border)] transition-colors"
          >
            Tutup Semua
          </button>
        </div>
      </div>

      {/* Main Accordion per Staff */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, idx) => (
            <div
              key={idx}
              className="animate-pulse bg-[var(--ab-bg-surface)] p-6 rounded-3xl border border-[var(--ab-border)] h-32"
            />
          ))}
        </div>
      ) : filteredStaffList.length === 0 ? (
        <div className="p-16 text-center bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)] space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center mx-auto">
            <Clock size={28} />
          </div>
          <h4 className="text-sm font-black uppercase text-[var(--ab-text-main)] tracking-wider">
            Tidak Ada Data Lembur di Bulan {periodLabel}
          </h4>
          <p className="text-xs text-[var(--ab-text-dim)] font-medium max-w-md mx-auto">
            {searchQuery || statusFilter !== "all"
              ? "Tidak ada data yang cocok dengan kriteria pencarian atau filter yang Anda pilih."
              : "Belum ada karyawan yang mengajukan lembur pada periode bulan ini."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredStaffList.map((staffGroup) => {
            const isExpanded = !!expandedUsers[staffGroup.user.id];

            return (
              <div
                key={staffGroup.user.id}
                className="bg-[var(--ab-bg-surface)] rounded-[28px] border border-[var(--ab-border)] shadow-sm overflow-hidden transition-all"
              >
                {/* Accordion Header */}
                <div
                  onClick={() => toggleAccordion(staffGroup.user.id)}
                  className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none transition-colors ${
                    isExpanded
                      ? "bg-amber-500/[0.04] border-b border-[var(--ab-border)]"
                      : "hover:bg-[var(--ab-bg-main)]/50"
                  }`}
                >
                  {/* Left: User Profile */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-black text-sm flex items-center justify-center shrink-0 uppercase shadow-md shadow-amber-500/20">
                      {staffGroup.user.name.substring(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-black text-sm sm:text-base text-[var(--ab-text-main)] tracking-tight truncate">
                          {staffGroup.user.name}
                        </h3>
                        {staffGroup.pendingActionCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-purple-500/15 text-purple-600 border border-purple-500/30 animate-pulse">
                            {staffGroup.pendingActionCount} Perlu Aksi
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-[var(--ab-text-dim)] flex items-center gap-2 truncate">
                        <Building2 size={12} className="text-amber-500" />
                        {staffGroup.user.department} • {staffGroup.user.position}
                      </p>
                    </div>
                  </div>

                  {/* Right: Summary Metrics & Chevron */}
                  <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-6 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--ab-border)]">
                    {/* Hari Lembur */}
                    <div className="text-left md:text-right">
                      <span className="text-[8.5px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] block">
                        Hari Sah
                      </span>
                      <span className="text-xs sm:text-sm font-black text-[var(--ab-text-main)]">
                        {staffGroup.totalFinalDays} / {staffGroup.items.length} Hari
                      </span>
                    </div>

                    {/* Total Jam */}
                    <div className="text-left md:text-right">
                      <span className="text-[8.5px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] block">
                        Total Durasi
                      </span>
                      <span className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400">
                        {formatDurationDetail(staffGroup.totalFinalMinutes)}
                      </span>
                    </div>

                    {/* Total Nominal */}
                    <div className="text-left md:text-right">
                      <span className="text-[8.5px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] block">
                        Total Upah
                      </span>
                      <span className="text-xs sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                        {formatRp(staffGroup.totalFinalPay)}
                      </span>
                    </div>

                    {/* Chevron Button */}
                    <div className="w-8 h-8 rounded-xl bg-[var(--ab-bg-main)] border border-[var(--ab-border)] flex items-center justify-center text-[var(--ab-text-dim)] transition-transform duration-200">
                      <ChevronDown
                        size={18}
                        className={`transition-transform duration-300 ${isExpanded ? "rotate-180 text-amber-500" : ""}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Accordion Body: Cards per Session */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-[var(--ab-bg-main)]/50 space-y-3.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between text-xs font-black text-[var(--ab-text-dim)] uppercase tracking-wider pb-1">
                      <span>Daftar Sesi Lembur ({staffGroup.items.length} Sesi)</span>
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        Klik pada kartu untuk lihat detail & hitungan
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {staffGroup.items.map((session) => {
                        const isWeekendDay = isWeekend(session.overtimeDate);
                        const isFinal = session.status === "finalized";
                        const isReported = session.status === "reported";
                        const isPending = session.status === "pending";

                        return (
                          <div
                            key={session.id}
                            className={`p-4 rounded-2xl bg-[var(--ab-bg-surface)] border transition-all relative flex flex-col justify-between gap-4 shadow-sm ${
                              isFinal
                                ? "border-emerald-500/30 hover:border-emerald-500/50"
                                : isReported
                                ? "border-purple-500/40 hover:border-purple-500/70 ring-1 ring-purple-500/20"
                                : isPending
                                ? "border-amber-500/40 hover:border-amber-500/70"
                                : "border-[var(--ab-border)]"
                            }`}
                          >
                            <div className="space-y-3">
                              {/* Session Header: Date & Status */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                    {/* Weekday / Weekend Badge */}
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider ${
                                        isWeekendDay
                                          ? "bg-purple-500/15 text-purple-600 border border-purple-500/30"
                                          : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                                      }`}
                                    >
                                      {isWeekendDay ? "Weekend" : "Weekday"}
                                    </span>

                                    {/* Status Badge */}
                                    {isFinal ? (
                                      <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                                        🟢 Final Sah
                                      </span>
                                    ) : isReported ? (
                                      <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-600 border border-purple-500/30">
                                        🟣 Menunggu Finalize
                                      </span>
                                    ) : isPending ? (
                                      <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 border border-amber-500/30">
                                        🟡 Review Jadwal
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-md text-[8.5px] font-black uppercase tracking-wider bg-blue-500/15 text-blue-600 border border-blue-500/30">
                                        🔵 Disetujui
                                      </span>
                                    )}
                                  </div>

                                  <h4 className="font-black text-xs sm:text-sm text-[var(--ab-text-main)] flex items-center gap-1.5">
                                    <CalendarDays size={14} className="text-amber-500 shrink-0" />
                                    {new Date(session.overtimeDate).toLocaleDateString("id-ID", {
                                      weekday: "long",
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </h4>
                                </div>

                                {/* Right: Duration Badge */}
                                <div className="text-right shrink-0">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] block">
                                    Durasi Diakui
                                  </span>
                                  <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                                    {formatDurationDetail(
                                      session.finalDurationMinutes ??
                                        session.actualDurationMinutes ??
                                        session.approvedDurationMinutes ??
                                        session.requestedDurationMinutes
                                    )}
                                  </span>
                                </div>
                              </div>

                              {/* Time Details */}
                              <div className="grid grid-cols-2 gap-2 text-[11px] bg-[var(--ab-bg-main)] p-2.5 rounded-xl border border-[var(--ab-border)]">
                                <div>
                                  <span className="text-[8px] font-bold text-[var(--ab-text-dim)] uppercase block">
                                    Jadwal Diajukan:
                                  </span>
                                  <span className="font-bold text-[var(--ab-text-main)]">
                                    {session.requestedStartTime} - {session.requestedEndTime}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[8px] font-bold text-[var(--ab-text-dim)] uppercase block">
                                    Laporan Aktual:
                                  </span>
                                  <span className="font-bold text-[var(--ab-text-main)]">
                                    {session.actualStartTime && session.actualEndTime
                                      ? `${session.actualStartTime} - ${session.actualEndTime}`
                                      : "Belum lapor"}
                                  </span>
                                </div>
                              </div>

                              {/* Task items snippet */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] block">
                                  Tugas & Laporan ({session.tasks.length} Tugas):
                                </span>
                                <div className="space-y-1">
                                  {session.tasks.slice(0, 2).map((t, tIdx) => (
                                    <p key={tIdx} className="text-xs font-medium text-[var(--ab-text-main)] truncate">
                                      • {t.task}{" "}
                                      <span className="text-[10px] text-[var(--ab-text-dim)] font-bold">
                                        (Target: {t.target})
                                      </span>
                                    </p>
                                  ))}
                                  {session.tasks.length > 2 && (
                                    <span className="text-[9.5px] font-bold text-amber-600 hover:underline cursor-pointer block">
                                      +{session.tasks.length - 2} tugas lainnya...
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Photo thumbnail if any */}
                              {session.proofImages && session.proofImages.length > 0 && (
                                <div className="flex items-center gap-2 pt-1">
                                  <span className="text-[9px] font-bold text-[var(--ab-text-dim)] flex items-center gap-1">
                                    <ImageIcon size={12} className="text-purple-500" />
                                    {session.proofImages.length} Bukti Foto:
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {session.proofImages.map((img, idx) => (
                                      <div
                                        key={idx}
                                        onClick={() => setPreviewImageUrl(img)}
                                        className="relative w-9 h-7 rounded-lg overflow-hidden border border-[var(--ab-border)] bg-black/10 cursor-pointer hover:opacity-80 transition"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={img} alt="Bukti" className="w-full h-full object-cover" />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Pay Calculation Breakdown Box (if Finalized) */}
                              {isFinal && (
                                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1 text-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9.5px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                      <Calculator size={12} /> Rincian Upah Sah
                                    </span>
                                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                      {formatRp(session.totalOvertimePay)}
                                    </span>
                                  </div>
                                  {session.calculationBreakdown?.depnakerFormula ? (
                                    <div className="flex flex-col text-[10px] text-[var(--ab-text-dim)] pt-0.5 space-y-0.5">
                                      <div className="flex justify-between">
                                        <span>Gaji: {formatRp(session.calculationBreakdown?.baseSalary)}</span>
                                        <span>/jam: {formatRp(session.hourlyBaseRate)}</span>
                                      </div>
                                      <span className="text-[9px]">UU Cipta Kerja (Multiplier {session.dayType === 'weekday' ? 'Hari Kerja' : 'Hari Libur'})</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between text-[10px] text-[var(--ab-text-dim)] pt-0.5">
                                      <span>1 Jam: {formatRp(session.firstHourPay)}</span>
                                      <span>
                                        Sisa: {formatRp(session.subsequentHourPay)} (@ {formatRp(session.subsequentHourRate)}/j)
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Session Actions Footer */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--ab-border)]">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedDetailReq(session)}
                                  className="p-1.5 rounded-xl text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] hover:bg-[var(--ab-bg-main)] border border-transparent hover:border-[var(--ab-border)] transition-colors text-[10px] font-bold flex items-center gap-1"
                                >
                                  <Eye size={13} /> Rincian
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingReq(session)}
                                  className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors text-[10px] font-bold flex items-center gap-1"
                                >
                                  <Trash2 size={13} /> Hapus
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                {isPending && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenApproveModal(session)}
                                    className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white shadow-sm flex items-center gap-1"
                                  >
                                    Review Jadwal
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setFinalizingReq(session)}
                                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm transition-transform active:scale-95 ${
                                    isFinal
                                      ? "bg-[var(--ab-bg-main)] hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                      : "bg-emerald-500 hover:bg-emerald-600 text-white"
                                  }`}
                                >
                                  <Edit3 size={12} />
                                  {isFinal ? "Edit Finalize" : "Finalize & Upah"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Finalize & Calculate Pay */}
      {finalizingReq && (
        <OvertimeFinalizeModal
          isOpen={!!finalizingReq}
          onClose={() => setFinalizingReq(null)}
          overtime={finalizingReq}
          baseSalary={
            Number(
              staffSettings.find(
                (s) =>
                  s.user_id === finalizingReq.userId ||
                  (s as any).userId === finalizingReq.userId,
              )?.default_base_salary ??
                (
                  staffSettings.find(
                    (s) =>
                      s.user_id === finalizingReq.userId ||
                      (s as any).userId === finalizingReq.userId,
                  ) as any
                )?.defaultBaseSalary ??
                finalizingReq.calculationBreakdown?.baseSalary ??
                0,
            )
          }
          onSuccess={fetchData}
        />
      )}

      {/* MODAL 2: 4-Stage Detail Modal */}
      {selectedDetailReq && (
        <OvertimeDetailModal
          isOpen={!!selectedDetailReq}
          onClose={() => setSelectedDetailReq(null)}
          overtime={selectedDetailReq}
          onPreviewImage={(url) => setPreviewImageUrl(url)}
          showPay={true}
        />
      )}

      {/* MODAL 3: Image Lightbox */}
      {previewImageUrl && (
        <ImageLightboxModal
          onClose={() => setPreviewImageUrl(null)}
          imageUrl={previewImageUrl}
          title="Bukti Kerja Lembur"
        />
      )}

      {/* MODAL 4: Delete Confirmation */}
      {deletingReq && (
        <ConfirmDialog
          isOpen={!!deletingReq}
          title="Hapus Sesi Lembur?"
          message={`Yakin ingin menghapus data lembur tanggal ${deletingReq.overtimeDate} milik ${deletingReq.userName}? Tindakan ini tidak dapat dibatalkan.`}
          type="danger"
          onConfirm={handleDeleteOvertime}
          onCancel={() => setDeletingReq(null)}
        />
      )}

      {/* MODAL 5: Approve Initial Schedule */}
      {approvingScheduleReq && (
        <div
          className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setApprovingScheduleReq(null);
          }}
        >
          <div
            className="w-full max-w-md bg-[var(--ab-bg-surface)] rounded-3xl p-6 border border-[var(--ab-border)] shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-[var(--ab-border)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--ab-text-main)] uppercase tracking-tight">
                  Review & Setujui Jadwal
                </h3>
                <p className="text-xs text-[var(--ab-text-dim)] font-medium">
                  {approvingScheduleReq.userName} • {approvingScheduleReq.overtimeDate}
                </p>
              </div>
              <button
                onClick={() => setApprovingScheduleReq(null)}
                className="p-1.5 text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] block mb-1">
                    Jam Mulai Disetujui
                  </label>
                  <input
                    type="time"
                    value={approveStartTime}
                    onChange={(e) => setApproveStartTime(e.target.value)}
                    className="ab-input text-xs py-2 w-full text-center"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] block mb-1">
                    Jam Selesai Disetujui
                  </label>
                  <input
                    type="time"
                    value={approveEndTime}
                    onChange={(e) => setApproveEndTime(e.target.value)}
                    className="ab-input text-xs py-2 w-full text-center"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] block mb-1">
                  Catatan Review Jadwal (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Contoh: Disetujui maksimal sampai jam 21:00..."
                  className="ab-input text-xs py-2 w-full resize-none rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ab-border)]">
              <button
                onClick={() => setApprovingScheduleReq(null)}
                className="px-4 py-2 rounded-xl text-xs font-black uppercase text-[var(--ab-text-dim)]"
              >
                Batal
              </button>
              <button
                onClick={handleApproveSchedule}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
              >
                Setujui Jadwal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
