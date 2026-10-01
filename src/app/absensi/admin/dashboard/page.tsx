"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { apiFetch, withQuery } from "@/lib/api-client";
import { useHolidays } from "@/hooks/absensi/useHolidays";
import { useAbsensiSettings } from "@/hooks/absensi/useAbsensiSettings";
import CountUp from "@/components/absensi/CountUp";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import {
  Users, Building2, Laptop, Umbrella, Clock, MapPin,
  CalendarDays, Search, FileSpreadsheet, Zap, FileText,
  Trash2, Pencil, Navigation, X, Check, ArrowRight, ChevronRight,
  ClipboardList, DollarSign,
} from "lucide-react";

import { parseLateMinutes } from "@/lib/utils";

// ─ Types ──────────────────────────────────────────────────────────────────────
interface AttLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  dept: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  type: string;
  lateFine: number;
  radiusPenalty: number;
  locationStatus: string | null;
  locationIn: { lat: number; lng: number } | null;
  lateReason: string;
  lateReasonStatus: string | null;
  notes: string | null;
}

interface ActiveUser {
  id: string;
  name: string;
  email: string;
  dept: string;
  isHidden: boolean;
}

interface ExcusedEntry { id: string; type: string; reason: string; createdAt: string; dates: string[]; }

interface DisplayRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  dept: string;
  log: AttLog | null;
  isExcused: boolean;
  excusedType?: string;
  excusedReason?: string;
  excusedCreatedAt?: string;
  excusedDates?: string[];
  isMissed: boolean;
}

interface LateLogDetail {
  date: string;
  minutes: number;
  reason: string;
  checkIn: string;
}

interface LateSummaryRow {
  id: string;
  name: string;
  dept: string;
  lateCount: number;
  totalLateMins: number;
  lateLogs: LateLogDetail[];
}

interface EditingLog {
  id: string;
  checkIn: string;
  checkOut: string;
  status: string;
  lateFine: number;
  notes: string;
}

// ─ Helpers ────────────────────────────────────────────────────────────────────
function fmt(t: string | null) { return t ? t.substring(0, 5) : "--:--"; }

function calcDist(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371e3;
  const f1 = (la1 * Math.PI) / 180, f2 = (la2 * Math.PI) / 180;
  const df = ((la2 - la1) * Math.PI) / 180, dl = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildDateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = new Date(start);
  const endD = new Date(end);
  while (cur <= endD) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ─ Main ───────────────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const router = useRouter();
  const { settings } = useAbsensiSettings();
  const { holidays, holidayDates } = useHolidays();

  const todayLocal = new Date();
  const today = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;
  const [filterDate, setFilterDate]   = useState(today);
  const [logs, setLogs]               = useState<AttLog[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [excused, setExcused]         = useState<ExcusedEntry[]>([]);
  const [pendingStaff, setPendingStaff] = useState(0);
  const [searchTerm, setSearchTerm]   = useState("");
  const [activeTab, setActiveTab]     = useState<"logs" | "fines">("logs");
  const [activeFilter, setActiveFilter] = useState<"all" | "present" | "wfo" | "wfa" | "leave" | "missed">("present");
  const [lateSummary, setLateSummary] = useState<LateSummaryRow[]>([]);
  const [expandedLateUser, setExpandedLateUser] = useState<string | null>(null);

  // Override forms
  const [showOverrideAtt,   setShowOverrideAtt]   = useState(false);
  const [showOverrideLeave, setShowOverrideLeave] = useState(false);
  const [overrideAtt,   setOverrideAtt]   = useState<{ userId: string; date: string; type: "WFO" | "WFA"; checkIn: string; checkOut: string }>({ userId: "", date: today, type: "WFO", checkIn: "08:00", checkOut: "17:00" });
  const [overrideLeave, setOverrideLeave] = useState({ userId: "", type: "leave" as "leave" | "sick" | "wfa", startDate: today, endDate: today, reason: "" });

  // Detail modal
  const [selectedRow, setSelectedRow]   = useState<DisplayRow | null>(null);
  const [editingLog,  setEditingLog]    = useState<EditingLog | null>(null);
  const [selectedDist, setSelectedDist] = useState<number | null>(null);
  const [officeLocations, setOfficeLocations] = useState<{ id: string; name: string; lat: number; lng: number; radius: number }[]>([]);

  // Export modal
  const [showExport, setShowExport]       = useState(false);
  const [exportStart, setExportStart]     = useState(today);
  const [exportEnd,   setExportEnd]       = useState(today);

  // ─ Fetch data ───────────────────────────────────────────────────────────────
  //
  // formerly: 4 query paralel dari browser (attendance + users + leave_requests
  // + count pending) DAN 1 query office_locations, ditambah 3 realtime
  // channel yang memicu fetch ulang tiap perubahan. Baris `users` juga
  // ikut terunduh penuh lalu difilter `isHidden` di sisi client.
  //
  // sekarang: satu request; join nama/divisi, filter `is_hidden`, dan
  // hitung jumlah pending semua terjadi di SQL.
  const buildDashboard = useCallback(
    () => withQuery("/api/absensi/dashboard", { date: filterDate }),
    [filterDate],
  );

  const {
    data: dashData,
    isLoading,
    refetch: refetchDashboard,
  } = useApiQuery<{
    date: string;
    logs: AttLog[];
    activeUsers: ActiveUser[];
    excused: ExcusedEntry[];
    pendingStaff: number;
    offices: { id: string; name: string; lat: number; lng: number; radius: number }[];
  }>(buildDashboard, [filterDate], 30_000);

  useEffect(() => {
    if (!dashData) return;
    setLogs(dashData.logs);
    setActiveUsers(dashData.activeUsers);
    setExcused(dashData.excused);
    setPendingStaff(dashData.pendingStaff);
    setOfficeLocations(dashData.offices);
  }, [dashData]);

  // ─ Mutations ─────────────────────────────────────────────────────────────────
  const patchAttendance = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/attendance",
    "PATCH",
  );
  const deleteAttendance = useApiMutation<unknown, unknown>(
    "/api/absensi/attendance",
    "DELETE",
  );
  const postDashboard = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/dashboard",
    "POST",
  );

  // ─ Fine summary (when tab = fines) ──────────────────────────────────────────
  //
  // formerly: query absensi satu bulan dari browser, dengan batas atas
  // dihitung manual lewat `new Date(y, m, 0)`. Sekarang server yang
  // menghitung batas bulan, jadi tidak pernah meleset di bulan dengan
  // jumlah hari berbeda (Februari, especially).
  const month = filterDate.substring(0, 7);

  const buildFines = useCallback(
    () => (activeTab === "fines" ? withQuery("/api/absensi/dashboard", { view: "fines", month }) : null),
    [activeTab, month],
  );

  const { data: finesData } = useApiQuery<{
    rows: Array<{
      userId: string;
      date: string;
      lateFine: number;
      lateReason: string;
      checkIn: string | null;
    }>;
  }>(buildFines, [activeTab, month], 30_000);

  useEffect(() => {
    if (activeTab !== "fines") return;

    const rows = finesData?.rows ?? [];
    if (rows.length === 0) {
      setLateSummary([]);
      return;
    }

    const sumMap = new Map<
      string,
      { lateCount: number; totalLateMins: number; lateLogs: LateLogDetail[] }
    >();

    for (const r of rows) {
      const cur = sumMap.get(r.userId) ?? {
        lateCount: 0,
        totalLateMins: 0,
        lateLogs: [],
      };
      const mins = parseLateMinutes(r.lateFine ?? 0);
      cur.lateLogs.push({
        date: r.date,
        minutes: mins,
        reason: r.lateReason || "-",
        checkIn: r.checkIn || "-",
      });
      sumMap.set(r.userId, {
        lateCount: cur.lateCount + 1,
        totalLateMins: cur.totalLateMins + mins,
        lateLogs: cur.lateLogs,
      });
    }

    setLateSummary(
      activeUsers
        .filter((u) => sumMap.has(u.id))
        .map((u) => {
          const s = sumMap.get(u.id)!;
          s.lateLogs.sort((a, b) => (a.date > b.date ? -1 : 1));
          return { id: u.id, name: u.name, dept: u.dept, ...s };
        })
        .sort((a, b) => b.totalLateMins - a.totalLateMins),
    );
  }, [activeTab, finesData, activeUsers]);



  // ─ Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const excusedIds = new Set(excused.map((e) => e.id));
    const presentIds = new Set(logs.map((l) => l.userId));
    return {
      total:   activeUsers.length,
      present: logs.length,
      wfo:     logs.filter((l) => l.type === "WFO").length,
      wfa:     logs.filter((l) => l.type === "WFA").length,
      leave:   excusedIds.size,
      missed:  activeUsers.filter((u) => !presentIds.has(u.id) && !excusedIds.has(u.id)).length,
    };
  }, [logs, activeUsers, excused]);

  // ─ Display rows ─────────────────────────────────────────────────────────────
  const displayRows = useMemo((): DisplayRow[] => {
    const excusedIds = new Set(excused.map((e) => e.id));
    const presentIds = new Set(logs.map((l) => l.userId));
    const logMap = new Map(logs.map((l) => [l.userId, l]));
    const excusedMap = new Map(excused.map((e) => [e.id, { type: e.type, reason: e.reason, createdAt: e.createdAt, dates: e.dates }]));

    let rows: DisplayRow[] = [];

    if (activeFilter === "all") {
      rows = activeUsers.map((u) => ({
        id: u.id, userId: u.id, name: u.name, email: u.email, dept: u.dept,
        log: logMap.get(u.id) ?? null,
        isExcused: excusedIds.has(u.id), excusedType: excusedMap.get(u.id)?.type, excusedReason: excusedMap.get(u.id)?.reason, excusedCreatedAt: excusedMap.get(u.id)?.createdAt, excusedDates: excusedMap.get(u.id)?.dates,
        isMissed: !presentIds.has(u.id) && !excusedIds.has(u.id),
      }));
    } else if (activeFilter === "present") {
      rows = logs.map((l) => {
        const u = activeUsers.find((a) => a.id === l.userId);
        return { id: l.id, userId: l.userId, name: l.userName, email: l.userEmail, dept: l.dept, log: l, isExcused: false, isMissed: false };
      });
    } else if (activeFilter === "wfo" || activeFilter === "wfa") {
      const t = activeFilter.toUpperCase();
      rows = logs.filter((l) => l.type === t).map((l) => ({
        id: l.id, userId: l.userId, name: l.userName, email: l.userEmail, dept: l.dept,
        log: l, isExcused: false, isMissed: false,
      }));
    } else if (activeFilter === "leave") {
      rows = activeUsers.filter((u) => excusedIds.has(u.id)).map((u) => ({
        id: u.id, userId: u.id, name: u.name, email: u.email, dept: u.dept,
        log: null, isExcused: true, excusedType: excusedMap.get(u.id)?.type, excusedReason: excusedMap.get(u.id)?.reason, excusedCreatedAt: excusedMap.get(u.id)?.createdAt, excusedDates: excusedMap.get(u.id)?.dates, isMissed: false,
      }));
    } else if (activeFilter === "missed") {
      rows = activeUsers.filter((u) => !presentIds.has(u.id) && !excusedIds.has(u.id)).map((u) => ({
        id: u.id, userId: u.id, name: u.name, email: u.email, dept: u.dept,
        log: null, isExcused: false, isMissed: true,
      }));
    }

    if (!searchTerm) return rows;
    const q = searchTerm.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }, [logs, activeUsers, excused, activeFilter, searchTerm]);

  // ─ Actions ──────────────────────────────────────────────────────────────────
  const handleLateReason = async (logId: string, action: "accepted" | "rejected") => {
    const tid = toast.loading("Memproses alasan...");
    // `late_fine = 0` + `status = on_time` saat diterima dikerjakan di
    // server (DAL), bukan di sini. Kalau tetap di browser, POST langsung
    // ke endpoint akan melewati pembatalan dendanya.
    const res = await patchAttendance.mutate({
      id: logId,
      action: "review-late-reason",
      accept: action === "accepted",
    });

    if (res.ok) {
      toast.success(
        action === "accepted"
          ? "Alasan diterima, menit telat dibatalkan."
          : "Alasan ditolak.",
        { id: tid },
      );
      void refetchDashboard();
      setSelectedRow(null);
    } else {
      toast.error(res.error ?? "Gagal memproses alasan.", { id: tid });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingLog) return;
    const tid = toast.loading("Menyimpan perubahan...");
    const res = await patchAttendance.mutate({
      id: editingLog.id,
      patch: {
        checkIn: editingLog.checkIn || null,
        checkOut: editingLog.checkOut || null,
        status: editingLog.status as
          | "on_time"
          | "late"
          | "very_late"
          | "auto_checkout",
        lateFine: Number(editingLog.lateFine),
        notes: editingLog.notes || null,
      },
    });

    if (res.ok) {
      toast.success("Log berhasil diupdate.", { id: tid });
      setEditingLog(null);
      setSelectedRow(null);
      void refetchDashboard();
    } else {
      toast.error(res.error ?? "Gagal menyimpan.", { id: tid });
    }
  };

  const handleDeleteLog = async (logId: string) => {
    const tid = toast.loading("Menghapus log...");
    const res = await deleteAttendance.mutate(undefined, { id: logId });

    if (res.ok) {
      toast.success("Log berhasil dihapus.", { id: tid });
      setSelectedRow(null);
      void refetchDashboard();
    } else {
      toast.error(res.error ?? "Gagal menghapus.", { id: tid });
    }
  };

  const handleOverrideAtt = async () => {
    if (!overrideAtt.userId || !overrideAtt.date) {
      toast.error("Lengkapi data!");
      return;
    }
    const tid = toast.loading("Menyimpan override absensi...");

    // Upsert + audit trail sekarang di server. `actor` diambil dari
    // session, bukan dari state AuthContext di browser — dulu nama
    // aktornya bisa dipalsukan oleh siapa saja yang mengedit payload.
    const res = await postDashboard.mutate({ kind: "override-att", ...overrideAtt });

    if (res.ok) {
      toast.success("Override absensi berhasil!", { id: tid });
      setShowOverrideAtt(false);
      void refetchDashboard();
    } else {
      toast.error(res.error ?? "Gagal menyimpan override.", { id: tid });
    }
  };

  const handleOverrideLeave = async () => {
    if (!overrideLeave.userId || !overrideLeave.startDate) {
      toast.error("Lengkapi data!");
      return;
    }
    if (!activeUsers.some((u) => u.id === overrideLeave.userId)) {
      toast.error("Staf tidak ditemukan!");
      return;
    }

    // Akhir pekan + hari libur dibuang di server juga, supaya angka
    // kuota yang dipotong dan tanggal yang disimpan konsisten.
    const dates = buildDateRange(
      overrideLeave.startDate,
      overrideLeave.endDate,
    ).filter((d) => {
      const dow = new Date(d).getDay();
      return overrideLeave.type === "wfa" || (dow !== 0 && dow !== 6 && !holidayDates.includes(d));
    });

    if (dates.length === 0) {
      toast.error("Tidak ada hari kerja yang valid pada rentang itu.");
      return;
    }

    const tid = toast.loading("Menyimpan override cuti/WFA...");

    const res = await postDashboard.mutate({
      kind: "override-leave",
      userId: overrideLeave.userId,
      type: overrideLeave.type,
      dates,
      reason: overrideLeave.reason,
    });

    if (res.ok) {
      toast.success("Override cuti/WFA berhasil!", { id: tid });
      setShowOverrideLeave(false);
      void refetchDashboard();
    } else {
      toast.error(res.error ?? "Gagal menyimpan override.", { id: tid });
    }
  };

  // ─ Export Excel ─────────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    const tid = toast.loading("Menyiapkan laporan Excel...");
    try {
      // formerly: 2 query dari browser. `leave_requests` di sana tidak
      // difilter tanggal sama sekali, jadi SELURUH pengajuan approved
      // yang pernah ada ikut terunduh ke browser setiap kali export.
      const exportData = await apiFetch<{
        attendance: Array<{
          userId: string;
          userName: string;
          dept: string;
          date: string;
          type: string;
          status: string;
          checkIn: string | null;
          checkOut: string | null;
          lateFine: number;
          radiusPenalty: number;
          lateReason: string;
        }>;
        leave: Array<{
          userId: string;
          type: string;
          dates: string[];
          reason: string;
        }>;
        users: Array<{ id: string; name: string; dept: string }>;
      }>(
        withQuery("/api/absensi/dashboard", {
          view: "export",
          from: exportStart,
          to: exportEnd,
        }),
      );

      const attLogs = exportData.attendance;
      const reqs    = exportData.leave;
      const dateRange = buildDateRange(exportStart, exportEnd);
      const todayStr  = today;
      const holSet    = new Set(holidays.map((h) => h.date));

      const workbook   = new ExcelJS.Workbook();
      const summaryWs  = workbook.addWorksheet("Rekap Kehadiran");
      const detailWs   = workbook.addWorksheet("Rincian Harian");

      summaryWs.columns = [
        { header: "Nama Staf",      key: "name",         width: 25 },
        { header: "Departemen",     key: "dept",         width: 20 },
        { header: "Kehadiran Aktif",key: "totalActive",  width: 15 },
        { header: "WFO",            key: "totalWFO",     width: 10 },
        { header: "WFA/WFH",        key: "totalWFA",     width: 10 },
        { header: "Cuti Biasa",     key: "totalLeave",   width: 12 },
        { header: "Sakit",          key: "totalSick",    width: 10 },
        { header: "Total Telat",    key: "totalLate",    width: 12 },
        { header: "Total Alpha",    key: "totalAlpha",   width: 12 },
        { header: "Catatan Alpha",  key: "alphaNote",    width: 25 },
        { header: "Total Menit Telat", key: "totalFine",    width: 15 },
        { header: "Denda Radius",   key: "totalRadius",  width: 15 },
      ];

      detailWs.columns = [
        { header: "Tanggal",            key: "date",     width: 15 },
        { header: "Nama Staf",          key: "name",     width: 25 },
        { header: "Divisi",             key: "dept",     width: 20 },
        { header: "Check In",           key: "checkIn",  width: 12 },
        { header: "Check Out",          key: "checkOut", width: 12 },
        { header: "Status",             key: "status",   width: 20 },
        { header: "Tipe",               key: "type",     width: 10 },
        { header: "Menit Telat",        key: "lateFine", width: 15 },
        { header: "Keterangan/Alasan",  key: "reason",   width: 35 },
      ];

      const sorted = [...exportData.users].sort((a, b) => a.name.localeCompare(b.name));

      sorted.forEach((u) => {
        const uLogs = attLogs.filter((l) => l.userId === u.id);
        const totalWFO   = uLogs.filter((l) => l.type === "WFO").length;
        const totalWFA   = uLogs.filter((l) => l.type === "WFA").length;
        const totalLate  = uLogs.filter((l) => l.status === "late" || l.status === "very_late").length;
        const totalFine  = uLogs.reduce((s, l) => s + (l.lateFine ?? 0), 0);
        const totalRadius = uLogs.reduce((s, l) => s + (l.radiusPenalty ?? 0), 0);

        let totalLeave = 0, totalSick = 0;
        reqs.filter((r) => r.userId === u.id).forEach((r) => {
          const valid = r.dates.filter((d) => d >= exportStart && d <= exportEnd);
          if (r.type === "leave")  totalLeave  += valid.length;
          if (r.type === "sick")   totalSick   += valid.length;
        });

        const totalAlpha = dateRange.reduce((s, d) => {
          const dow = new Date(d).getDay();
          if (dow === 0 || dow === 6 || holSet.has(d) || d > todayStr) return s;
          const hasLog = uLogs.some((l) => l.date === d);
          const hasReq = reqs.some((r) => r.userId === u.id && r.dates.includes(d));
          return hasLog || hasReq ? s : s + 1;
        }, 0);

        summaryWs.addRow({
          name: u.name, dept: u.dept,
          totalActive: totalWFO + totalWFA, totalWFO, totalWFA,
          totalLeave, totalSick, totalLate, totalAlpha,
          alphaNote: totalAlpha > 0 ? `Alpa ${totalAlpha} hari` : "-",
          totalFine, totalRadius,
        });
      });

      dateRange.forEach((d) => {
        const dow = new Date(d).getDay();
        const isWeekend = dow === 0 || dow === 6;
        const isHol = holSet.has(d);
        const isFuture = d > todayStr;
        sorted.forEach((u) => {
          const log = attLogs.find((l) => l.userId === u.id && l.date === d);
          const req = reqs.find((r) => r.userId === u.id && r.dates.includes(d));
          if (log) {
            detailWs.addRow({ date: d, name: u.name, dept: u.dept, checkIn: fmt(log.checkIn), checkOut: fmt(log.checkOut), status: log.status.replace("_", " "), type: log.type, lateFine: log.lateFine ?? 0, reason: log.lateReason || "-" });
          } else if (req) {
            const typeLabel = req.type === "leave" ? "Cuti" : req.type === "sick" ? "Sakit" : "WFA";
            detailWs.addRow({ date: d, name: u.name, dept: u.dept, checkIn: "-", checkOut: "-", status: "Disetujui", type: typeLabel, lateFine: 0, reason: req.reason || "-" });
          } else if (!isWeekend && !isHol && !isFuture) {
            detailWs.addRow({ date: d, name: u.name, dept: u.dept, checkIn: "-", checkOut: "-", status: "Alpa / Mangkir", type: "-", lateFine: 0, reason: "Alpa" });
          }
        });
      });

      summaryWs.getRow(1).font = { bold: true };
      summaryWs.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
      detailWs.getRow(1).font  = { bold: true };
      detailWs.getRow(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBBDEFB" } };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url    = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Laporan_Rekap_${exportStart}_sd_${exportEnd}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Laporan berhasil didownload!", { id: tid });
      setShowExport(false);
    } catch (err: unknown) {
      toast.error("Gagal ekspor: " + (err instanceof Error ? err.message : "Unknown"), { id: tid });
    }
  };

  // ─ Derived ──────────────────────────────────────────────────────────────────
  const isHoliday = holidayDates.includes(filterDate);

  const statCards = [
    { label: "Total Aktif",  value: stats.total,   filter: "all"     as const, col: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", icon: <Users size={18} /> },
    { label: "Total Hadir",  value: stats.present, filter: "present" as const, col: "text-teal-600",    bg: "bg-teal-50 dark:bg-teal-900/20",       icon: <Building2 size={18} /> },
    { label: "WFO",          value: stats.wfo,     filter: "wfo"     as const, col: "text-cyan-600",    bg: "bg-cyan-50 dark:bg-cyan-900/20",        icon: <MapPin size={18} /> },
    { label: "WFA",          value: stats.wfa,     filter: "wfa"     as const, col: "text-indigo-600",  bg: "bg-indigo-50 dark:bg-indigo-900/20",    icon: <Laptop size={18} /> },
    { label: "Cuti/Sakit",   value: stats.leave,   filter: "leave"   as const, col: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-900/20",      icon: <Umbrella size={18} /> },
    { label: "Belum Absen",  value: stats.missed,  filter: "missed"  as const, col: "text-rose-600",    bg: "bg-rose-50 dark:bg-rose-900/20",        icon: <Clock size={18} /> },
  ];

  // ─ Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[var(--ab-bg-surface)] rounded-2xl flex items-center justify-center shadow-sm border border-[var(--ab-border)] text-white" style={{ background: "var(--ab-primary)" }}>
            <ClipboardList size={20} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-[var(--ab-text-main)] tracking-tighter">Admin Dashboard</h1>
            <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest mt-0.5">Management & Oversight System</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-[var(--ab-bg-surface)] px-4 py-2 rounded-2xl border border-[var(--ab-border)] shadow-sm">
            <CalendarDays size={12} style={{ color: "var(--ab-primary)" }} />
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent text-[10px] font-black text-[var(--ab-text-main)] outline-none uppercase" />
          </div>
          {isHoliday && (
            <span className="text-[10px] font-black text-white bg-rose-500 px-3 py-1.5 rounded-full">Hari Libur</span>
          )}
          <div className="hidden md:flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 px-4 py-2 rounded-2xl border border-emerald-100 dark:border-emerald-800">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-300 uppercase tracking-widest">Sistem Aktif</span>
          </div>
        </div>
      </div>

      {/* 6 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {statCards.map(({ label, value, filter, col, bg, icon }) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`ab-card-tactile !p-5 flex flex-col items-center text-center transition-all ${activeFilter === filter ? "ring-4 ring-[var(--ab-primary)]/20 scale-[1.03]" : "opacity-80 hover:opacity-100"}`}
          >
            <div className={`${bg} ${col} w-10 h-10 rounded-2xl flex items-center justify-center mb-2 shadow-sm`}>{icon}</div>
            <p className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1">{label}</p>
            <h3 className={`text-2xl font-black font-mono ${col}`}>
              {isLoading ? "—" : <CountUp end={value} />}
            </h3>
          </button>
        ))}
      </div>

      {/* Pendaftar Baru Banner */}
      {pendingStaff > 0 && (
        <div
          className="p-6 rounded-[35px] text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, #f59e0b, #ea580c)" }}
        >
          <Users className="absolute -right-8 -bottom-8 opacity-10" size={120} />
          <div className="relative z-10">
            <h3 className="text-lg font-black uppercase tracking-tight mb-1">Ada {pendingStaff} Pendaftar Baru!</h3>
            <p className="text-xs text-orange-50 font-medium opacity-90">Karyawan baru sedang menunggu persetujuan Anda untuk mulai bekerja.</p>
          </div>
          <button
            onClick={() => router.push("/absensi/admin/staff?tab=pending")}
            className="relative z-10 px-8 py-3 bg-white text-orange-600 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-orange-50 transition-all active:scale-95 flex items-center gap-2"
          >
            Proses Sekarang <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Main Card */}
      <div className="ab-glass rounded-[35px] border border-[var(--ab-border)] overflow-hidden shadow-2xl relative">
        {/* Glow effect behind table */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--ab-primary-glow)] blur-[120px] rounded-full pointer-events-none opacity-50" />
        
        {/* Tabs */}
        <div className="p-3 bg-[var(--ab-bg-main)]/70 backdrop-blur-md border-b border-[var(--ab-border)] relative z-10">
          <div className="flex p-1 bg-[var(--ab-bg-surface)]/80 backdrop-blur-xl rounded-2xl w-fit border border-[var(--ab-border)]">
            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "logs" ? "bg-[var(--ab-bg-surface)] text-[var(--ab-primary)] shadow-sm" : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"}`}
            >
              <ClipboardList size={12} /> Log Absensi
            </button>
            <button
              onClick={() => setActiveTab("fines")}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "fines" ? "bg-[var(--ab-bg-surface)] text-orange-600 shadow-sm" : "text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]"}`}
            >
              <Clock size={12} /> Rekapan Keterlambatan
            </button>
          </div>
        </div>

        {/* Table toolbar */}
        <div className="p-6 bg-[var(--ab-bg-surface)]/30 backdrop-blur-md border-b border-[var(--ab-border)] flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <div className="flex items-center gap-3">
              <h2 className="font-black text-[var(--ab-text-main)] uppercase tracking-tight text-sm">
                {activeTab === "logs" ? "Riwayat Kehadiran" : "Rekapan Keterlambatan Bulan Ini"}
              </h2>
              <span className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest">
                {activeTab === "logs" ? filterDate : filterDate.substring(0, 7)}
              </span>
            </div>
            {activeTab === "logs" && (
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowOverrideAtt(!showOverrideAtt); setShowOverrideLeave(false); }}
                  className="px-4 py-2 bg-[var(--ab-bg-surface)] text-[var(--ab-primary)] rounded-2xl font-black text-[9px] uppercase tracking-widest border border-[var(--ab-border)] flex items-center gap-1.5 hover:bg-[var(--ab-primary)] hover:text-white transition-all active:scale-95"
                >
                  <Zap size={10} /> Override Absensi
                </button>
                <button
                  onClick={() => { setShowOverrideLeave(!showOverrideLeave); setShowOverrideAtt(false); }}
                  className="px-4 py-2 bg-[var(--ab-bg-surface)] text-orange-500 rounded-2xl font-black text-[9px] uppercase tracking-widest border border-[var(--ab-border)] flex items-center gap-1.5 hover:bg-orange-500 hover:text-white transition-all active:scale-95"
                >
                  <FileText size={10} /> Override Cuti/WFA
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search size={12} className="absolute left-3 top-2.5 text-[var(--ab-text-dim)]" />
              <input type="text" placeholder="Cari nama staf..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ab-input pl-9 text-[10px] w-full" />
            </div>
            <button
              onClick={() => setShowExport(true)}
              className="bg-green-600 text-white px-5 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-green-700 flex items-center gap-2 shadow-lg shadow-green-100 dark:shadow-none active:scale-95 transition-all whitespace-nowrap"
            >
              <FileSpreadsheet size={12} /> Excel
            </button>
          </div>
        </div>

        {/* Override: Absensi */}
        {showOverrideAtt && (
          <div className="p-5 bg-emerald-50/30 dark:bg-emerald-900/5 border-b border-[var(--ab-border)] animate-[fadeIn_0.2s]">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-[9px] font-black uppercase text-[var(--ab-primary)] ml-1">Pilih Staf</label>
                <select className="ab-input text-xs w-full" value={overrideAtt.userId} onChange={(e) => setOverrideAtt({ ...overrideAtt, userId: e.target.value })}>
                  <option value="">-- Pilih Staf --</option>
                  {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.dept})</option>)}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[9px] font-black uppercase text-[var(--ab-primary)] ml-1">Tanggal</label>
                <input type="date" className="ab-input text-xs w-full" value={overrideAtt.date} onChange={(e) => setOverrideAtt({ ...overrideAtt, date: e.target.value })} />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[9px] font-black uppercase text-[var(--ab-primary)] ml-1">Jam Masuk</label>
                <input type="time" className="ab-input text-xs w-full" value={overrideAtt.checkIn} onChange={(e) => setOverrideAtt({ ...overrideAtt, checkIn: e.target.value })} />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[9px] font-black uppercase text-[var(--ab-primary)] ml-1">Jam Pulang</label>
                <input type="time" className="ab-input text-xs w-full" value={overrideAtt.checkOut} onChange={(e) => setOverrideAtt({ ...overrideAtt, checkOut: e.target.value })} />
              </div>
              <button onClick={handleOverrideAtt} className="px-8 py-2.5 text-white rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all whitespace-nowrap" style={{ background: "var(--ab-primary)" }}>
                Simpan Override
              </button>
            </div>
          </div>
        )}

        {/* Override: Cuti/WFA */}
        {showOverrideLeave && (
          <div className="p-5 bg-orange-50/30 dark:bg-orange-900/5 border-b border-[var(--ab-border)] animate-[fadeIn_0.2s]">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-orange-600 ml-1">Staf</label>
                <select className="ab-input text-xs w-full" value={overrideLeave.userId} onChange={(e) => setOverrideLeave({ ...overrideLeave, userId: e.target.value })}>
                  <option value="">-- Pilih Staf --</option>
                  {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-orange-600 ml-1">Jenis</label>
                <select className="ab-input text-xs w-full" value={overrideLeave.type} onChange={(e) => setOverrideLeave({ ...overrideLeave, type: e.target.value as "leave" | "sick" | "wfa" })}>
                  <option value="leave">Cuti Biasa</option>
                  <option value="sick">Cuti Sakit</option>
                  <option value="wfa">Izin WFA</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-orange-600 ml-1">Mulai</label>
                <input type="date" className="ab-input text-xs w-full" value={overrideLeave.startDate} onChange={(e) => setOverrideLeave({ ...overrideLeave, startDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-orange-600 ml-1">Sampai</label>
                <input type="date" className="ab-input text-xs w-full" value={overrideLeave.endDate} onChange={(e) => setOverrideLeave({ ...overrideLeave, endDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-orange-600 ml-1">Alasan</label>
                <div className="flex gap-2">
                  <input type="text" placeholder="Keterangan..." className="ab-input text-xs flex-1" value={overrideLeave.reason} onChange={(e) => setOverrideLeave({ ...overrideLeave, reason: e.target.value })} />
                  <button onClick={handleOverrideLeave} className="px-5 py-2 bg-orange-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest active:scale-95 transition-all whitespace-nowrap">
                    Kirim
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className="overflow-x-auto min-h-[300px] relative z-10">
          {isLoading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-[var(--ab-bg-main)]/50 rounded-xl" />)}
            </div>
          ) : activeTab === "logs" ? (
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-[var(--ab-bg-main)]/80 backdrop-blur-md text-[var(--ab-text-dim)] border-b border-[var(--ab-border)]">
                  {["Nama Staf", "Dept", "Status", "In", "Out", "Detail"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-widest text-[9px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr><td colSpan={6} className="p-20 text-center text-[var(--ab-text-dim)] text-[10px] font-black uppercase tracking-widest">Tidak ada data untuk filter ini.</td></tr>
                ) : (
                  displayRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => {
                        if (row.log) {
                          let dist: number | null = null;
                          if (row.log.locationIn && (row.log.locationIn as any).distance !== undefined) {
                            dist = (row.log.locationIn as any).distance;
                          } else if (row.log.locationIn && officeLocations.length > 0) {
                            let minDist = Infinity;
                            for (const ol of officeLocations) {
                              const d = calcDist(row.log.locationIn.lat, row.log.locationIn.lng, ol.lat, ol.lng);
                              if (d < minDist) minDist = d;
                            }
                            dist = minDist;
                          } else if (row.log.locationIn && settings?.officeLat && settings?.officeLng) {
                            dist = calcDist(row.log.locationIn.lat, row.log.locationIn.lng, settings.officeLat, settings.officeLng);
                          }
                          setSelectedDist(dist);
                        } else {
                          setSelectedDist(null);
                        }
                        setSelectedRow(row);
                        setEditingLog(null);
                      }}
                      className={`border-b border-[var(--ab-border)]/50 transition-all text-[10px] hover:bg-[var(--ab-bg-surface)]/60 cursor-pointer ${row.isMissed ? "opacity-40 grayscale" : ""}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--ab-bg-main)] border border-[var(--ab-border)] flex items-center justify-center font-black text-xs text-[var(--ab-primary)]">
                            {row.name.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-[var(--ab-text-main)] text-xs">{row.name}</span>
                            <span className="text-[var(--ab-text-dim)] font-bold text-[9px]">{row.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-black text-[var(--ab-text-dim)] uppercase tracking-widest text-[9px]">{row.dept || "-"}</td>
                      <td className="px-5 py-4">
                        {row.isMissed ? (
                          <span className="bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] px-2.5 py-1 rounded-xl font-black text-[9px] uppercase border border-[var(--ab-border)]">Belum Absen</span>
                        ) : row.isExcused ? (
                          <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-xl font-black text-[9px] uppercase border border-amber-200 dark:border-amber-800">
                            {row.excusedType === "wfa" ? "WFA" : "Cuti/Sakit"}
                          </span>
                        ) : row.log ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`px-2.5 py-1 rounded-xl font-black text-[9px] uppercase border ${row.log.type === "WFA" ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800" : "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800"}`}>{row.log.type}</span>
                            <span className={`text-[8px] font-bold uppercase ${row.log.status === "on_time" ? "text-green-500" : row.log.status === "late" ? "text-orange-500" : "text-red-500"}`}>{row.log.status.replace("_", " ")}</span>
                          </div>
                        ) : "-"}
                      </td>
                      <td className="px-5 py-4 font-mono font-black text-[var(--ab-text-main)] text-sm">{fmt(row.log?.checkIn ?? null)}</td>
                      <td className="px-5 py-4 font-mono font-black text-[var(--ab-text-main)] text-sm">{fmt(row.log?.checkOut ?? null)}</td>
                      <td className="px-5 py-4">
                        {row.log ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] text-[var(--ab-text-dim)] font-bold">{row.log.locationStatus ?? "-"}</span>
                            {(row.log.lateFine ?? 0) > 0 && (
                              <span className="text-[8px] font-black text-orange-500">Telat: {row.log.lateFine} Menit</span>
                            )}
                            {row.log.lateReasonStatus === "pending" && (
                              <span className="text-[8px] font-black text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">Review</span>
                            )}
                          </div>
                        ) : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-[var(--ab-bg-main)]/80 backdrop-blur-md text-[var(--ab-text-dim)] border-b border-[var(--ab-border)]">
                    {["Nama Staf", "Departemen", "Total Terlambat", "Total Menit Telat", "Rata-rata Menit"].map((h) => (
                      <th key={h} className="px-6 py-4 text-left font-black uppercase tracking-widest text-[9px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                {lateSummary.length === 0 ? (
                  <tbody>
                    <tr><td colSpan={5} className="p-16 text-center text-[var(--ab-text-dim)] text-[10px] font-black uppercase tracking-widest">Tidak ada record keterlambatan bulan ini.</td></tr>
                  </tbody>
                ) : (
                  lateSummary.map((r) => (
                    <tbody key={r.id}>
                      <tr 
                        className="border-b border-[var(--ab-border)]/50 hover:bg-[var(--ab-bg-surface)]/60 transition-all cursor-pointer group"
                        onClick={() => setExpandedLateUser(expandedLateUser === r.id ? null : r.id)}
                      >
                        <td className="px-6 py-5 font-black text-[var(--ab-text-main)] flex items-center gap-3">
                          <ChevronRight size={14} className={`transition-transform text-[var(--ab-primary)] ${expandedLateUser === r.id ? "rotate-90" : ""}`} />
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[var(--ab-bg-main)] border border-[var(--ab-border)] flex items-center justify-center font-black text-xs text-[var(--ab-primary)]">
                              {r.name.charAt(0)}
                            </div>
                            <span className="text-sm">{r.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 font-bold text-[var(--ab-text-dim)] uppercase tracking-widest text-[9px]">{r.dept}</td>
                        <td className="px-6 py-5 text-center font-black text-orange-400 group-hover:text-orange-500 transition-colors text-sm">{r.lateCount} x</td>
                        <td className="px-6 py-5 text-center font-black text-rose-500 group-hover:text-rose-400 transition-colors text-sm shadow-sm">{r.totalLateMins} Menit</td>
                        <td className="px-6 py-5 text-center font-bold text-[var(--ab-text-dim)]">{Math.round(r.totalLateMins / r.lateCount)} Menit/kali</td>
                      </tr>
                      {expandedLateUser === r.id && (
                        <tr>
                          <td colSpan={5} className="p-0 border-b border-[var(--ab-border)]">
                            <div className="bg-[var(--ab-bg-surface)]/80 backdrop-blur-2xl p-6 pl-14 space-y-3 shadow-inner relative overflow-hidden">
                              <div className="absolute left-0 top-0 w-1 h-full bg-orange-500" />
                              <p className="text-[10px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest flex items-center gap-2">
                                <Clock size={12} className="text-orange-500" /> Detail Keterlambatan
                              </p>
                              <div className="space-y-2">
                                {r.lateLogs.map((log, idx) => (
                                  <div key={idx} className="flex items-center gap-6 text-xs bg-[var(--ab-bg-main)]/50 p-3 rounded-2xl border border-[var(--ab-border)] hover:border-orange-500/30 transition-colors">
                                    <span className="font-black text-[var(--ab-text-main)] w-24 tabular-nums">{log.date}</span>
                                    <span className="font-black text-orange-500 w-20 flex items-center gap-1">
                                      {log.minutes} Menit
                                    </span>
                                    <span className="font-bold text-[var(--ab-text-dim)] font-mono w-20">In: {log.checkIn}</span>
                                    <span className="text-[var(--ab-text-main)] italic flex-1 border-l border-[var(--ab-border)] pl-4">
                                      "{log.reason}"
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  ))
                )}
              </table>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRow && typeof document !== "undefined" && createPortal(
        <div
          className="ab-confirm-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) { setSelectedRow(null); setEditingLog(null); } }}
        >
          <div className="w-full max-w-md rounded-[32px] shadow-2xl border border-[var(--ab-border)] flex flex-col max-h-[90vh] ab-animate-scaleIn" style={{ background: "var(--ab-bg-surface)" }}>
            {/* Modal header */}
            <div className="p-6 border-b border-[var(--ab-border)] flex justify-between items-center bg-gradient-to-r from-[var(--ab-bg-surface)] to-[var(--ab-bg-main)] rounded-t-[32px]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white" style={{ background: "var(--ab-primary)" }}>
                  <ClipboardList size={16} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-[var(--ab-text-main)] tracking-tight leading-none mb-0.5">Detail Kehadiran</h3>
                  <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">Log Sistem Otomatis</p>
                </div>
              </div>
              <div className="flex gap-2">
                {!editingLog && selectedRow.log ? (
                  <>
                    <button onClick={() => handleDeleteLog(selectedRow.log!.id)} className="w-8 h-8 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-all border border-transparent hover:border-red-100">
                      <Trash2 size={14} />
                    </button>
                    <button onClick={() => setEditingLog({ id: selectedRow.log!.id, checkIn: selectedRow.log!.checkIn?.substring(0, 5) ?? "", checkOut: selectedRow.log!.checkOut?.substring(0, 5) ?? "", status: selectedRow.log!.status, lateFine: selectedRow.log!.lateFine, notes: selectedRow.log!.notes ?? "" })} className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--ab-primary)] hover:bg-[var(--ab-primary)]/10 transition-all border border-transparent hover:border-[var(--ab-primary)]/20">
                      <Pencil size={14} />
                    </button>
                  </>
                ) : editingLog ? (
                  <button onClick={() => setEditingLog(null)} className="w-8 h-8 flex items-center justify-center text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]">
                    <X size={16} />
                  </button>
                ) : (
                  <button onClick={() => setSelectedRow(null)} className="w-8 h-8 flex items-center justify-center text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]">
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Modal body */}
            <div className="p-6 overflow-y-auto ab-scrollbar">
              <div className="mb-5 flex gap-4 items-center">
                <div className="w-14 h-14 rounded-[18px] bg-[var(--ab-bg-main)] flex items-center justify-center text-2xl font-black text-[var(--ab-text-dim)] border border-[var(--ab-border)]">
                  {selectedRow.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-black text-lg text-[var(--ab-text-main)] mb-1">{selectedRow.name}</h4>
                  <div className="flex gap-2">
                    <span className="bg-[var(--ab-bg-main)] px-2 py-0.5 rounded text-[9px] font-black uppercase text-[var(--ab-text-dim)] border border-[var(--ab-border)]">{selectedRow.dept || "Umum"}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase text-white border" style={{ background: "var(--ab-primary)", borderColor: "var(--ab-primary)" }}>{selectedRow.log ? selectedRow.log.type : selectedRow.excusedType === "leave" ? "Cuti" : selectedRow.excusedType === "sick" ? "Sakit" : "WFA"}</span>
                  </div>
                </div>
              </div>

              {!editingLog ? (
                <div className="space-y-4">
                  {selectedRow.log && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[var(--ab-bg-main)] p-4 rounded-3xl border border-[var(--ab-border)]">
                          <p className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1">Check In</p>
                          <p className="text-xl font-black font-mono text-[var(--ab-text-main)]">{fmt(selectedRow.log.checkIn)}</p>
                        </div>
                        <div className="bg-[var(--ab-bg-main)] p-4 rounded-3xl border border-[var(--ab-border)]">
                          <p className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1">Check Out</p>
                          <p className="text-xl font-black font-mono text-[var(--ab-text-main)]">{fmt(selectedRow.log.checkOut)}</p>
                        </div>
                      </div>

                      <div className="bg-[var(--ab-bg-main)] p-5 rounded-3xl border border-[var(--ab-border)] space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-black tracking-widest text-[var(--ab-text-dim)]">Status Waktu</span>
                          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${selectedRow.log.status === "on_time" ? "bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:border-green-800" : selectedRow.log.status === "late" ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800" : "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-800"}`}>
                            {selectedRow.log.status.replace("_", " ")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-black tracking-widest text-[var(--ab-text-dim)]">Status Lokasi</span>
                          <div className="flex items-center gap-1.5">
                            <Navigation size={12} className="text-[var(--ab-text-dim)]" />
                            <span className="text-[10px] font-black uppercase text-[var(--ab-text-main)]">{selectedRow.log.locationStatus ?? "-"}</span>
                          </div>
                        </div>
                        {selectedRow.log.notes && (
                          <div className="flex flex-col gap-1 mt-2">
                            <span className="text-[10px] uppercase font-black tracking-widest text-[var(--ab-text-dim)]">Catatan Absensi</span>
                            <div className="bg-[var(--ab-bg-surface)] p-3 rounded-2xl border border-[var(--ab-border)]">
                              <p className="text-[10px] text-[var(--ab-text-main)] italic">&ldquo;{selectedRow.log.notes}&rdquo;</p>
                            </div>
                          </div>
                        )}
                        {selectedDist !== null && (
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] uppercase font-black tracking-widest text-[var(--ab-text-dim)]">Jarak ke Kantor</span>
                            <span className={`text-[10px] font-black uppercase ${selectedDist <= (officeLocations.length > 0 ? Math.max(...officeLocations.map(o => o.radius)) : (settings?.officeRadius ?? 100)) ? "text-green-500" : "text-red-500"}`}>{Math.round(selectedDist)} meter</span>
                          </div>
                        )}
                        {selectedRow.log.locationIn && (
                          <a
                            href={`https://www.google.com/maps?q=${selectedRow.log.locationIn.lat},${selectedRow.log.locationIn.lng}`}
                            target="_blank" rel="noreferrer"
                            className="w-full flex items-center justify-center gap-2 bg-[var(--ab-bg-surface)] border border-[var(--ab-border)] py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-main)] hover:bg-[var(--ab-bg-main)] transition"
                          >
                            <MapPin size={12} className="text-red-500" /> Buka Google Maps ({selectedRow.log.locationIn.lat.toFixed(5)}, {selectedRow.log.locationIn.lng.toFixed(5)})
                          </a>
                        )}
                      </div>

                      {selectedRow.log.lateReason && (
                        <div className="bg-amber-50 dark:bg-amber-900/10 p-5 rounded-3xl border border-amber-200 dark:border-amber-900/30 space-y-3">
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest">Alasan Keterlambatan</p>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${selectedRow.log.lateReasonStatus === "accepted" ? "bg-green-100 text-green-700" : selectedRow.log.lateReasonStatus === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {selectedRow.log.lateReasonStatus === "accepted" ? "Diterima" : selectedRow.log.lateReasonStatus === "rejected" ? "Ditolak" : "Menunggu"}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-[var(--ab-text-main)] italic">&ldquo;{selectedRow.log.lateReason}&rdquo;</p>
                          {selectedRow.log.lateReasonStatus === "pending" && (
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => handleLateReason(selectedRow.log!.id, "accepted")} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition flex items-center justify-center gap-1">
                                <Check size={12} /> Terima Alasan
                              </button>
                              <button onClick={() => handleLateReason(selectedRow.log!.id, "rejected")} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition flex items-center justify-center gap-1">
                                <X size={12} /> Tolak
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {(selectedRow.log.lateFine ?? 0) > 0 && (
                        <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-3xl border border-orange-100 dark:border-orange-900/30">
                          <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-1">Total Keterlambatan</p>
                          <p className="text-lg font-black text-orange-600 dark:text-orange-400 font-mono">{selectedRow.log.lateFine} Menit</p>
                        </div>
                      )}
                    </>
                  )}

                  {selectedRow.isExcused && (
                    <div className="bg-amber-50 dark:bg-amber-900/10 p-5 rounded-3xl border border-amber-200 dark:border-amber-900/30 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest">Alasan Cuti / WFA</p>
                        <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-green-100 text-green-700">
                          Disetujui
                        </span>
                      </div>
                      <p className="text-sm font-bold text-[var(--ab-text-main)] italic">&ldquo;{selectedRow.excusedReason || "Admin Override"}&rdquo;</p>
                      
                      {selectedRow.excusedCreatedAt && (
                        <div className="pt-3 mt-3 border-t border-amber-200/50 dark:border-amber-800/50 space-y-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-600/70 dark:text-amber-500/70">Waktu Pengajuan</span>
                            <span className="text-xs font-bold text-amber-900 dark:text-amber-100">
                              {new Date(selectedRow.excusedCreatedAt).toLocaleString("id-ID", {
                                day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
                              }).replace(/\./g, ":")}
                            </span>
                          </div>
                          {selectedRow.excusedDates && selectedRow.excusedDates.length > 0 && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] font-black uppercase tracking-widest text-amber-600/70 dark:text-amber-500/70">Tanggal Cuti</span>
                              <span className="text-xs font-bold text-amber-900 dark:text-amber-100">
                                {selectedRow.excusedDates.join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedRow.isMissed && !selectedRow.log && !selectedRow.isExcused && (
                    <div className="bg-rose-50 dark:bg-rose-900/10 p-5 rounded-3xl border border-rose-200 dark:border-rose-900/30">
                      <p className="text-sm font-black text-rose-600 dark:text-rose-500 uppercase tracking-widest text-center">Status: Belum Absen / Alpa</p>
                      <p className="text-[10px] text-rose-500 dark:text-rose-400 mt-2 text-center">Karyawan ini belum melakukan absensi hari ini dan tidak memiliki izin/cuti yang tercatat.</p>
                    </div>
                  )}
                </div>
              ) : editingLog ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-[var(--ab-primary)] uppercase tracking-widest">Jam Masuk</label>
                      <input type="time" className="ab-input text-xs w-full" value={editingLog.checkIn} onChange={(e) => setEditingLog({ ...editingLog, checkIn: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-[var(--ab-primary)] uppercase tracking-widest">Jam Keluar</label>
                      <input type="time" className="ab-input text-xs w-full" value={editingLog.checkOut} onChange={(e) => setEditingLog({ ...editingLog, checkOut: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-[var(--ab-primary)] uppercase tracking-widest">Status Waktu</label>
                    <select className="ab-input text-xs w-full" value={editingLog.status} onChange={(e) => setEditingLog({ ...editingLog, status: e.target.value })}>
                      <option value="on_time">On Time</option>
                      <option value="late">Late</option>
                      <option value="very_late">Very Late</option>
                      <option value="auto_checkout">Auto Checkout</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-[var(--ab-primary)] uppercase tracking-widest">Menit Telat</label>
                    <input type="number" className="ab-input text-xs w-full text-orange-600" value={editingLog.lateFine} onChange={(e) => setEditingLog({ ...editingLog, lateFine: Number(e.target.value) })} />
                  </div>
                  <button onClick={handleSaveEdit} className="w-full text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2" style={{ background: "var(--ab-primary)" }}>
                    <Check size={14} /> Simpan Perubahan
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Export Modal */}
      {showExport && (
        <div className="ab-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowExport(false); }}>
          <div className="bg-[var(--ab-bg-surface)] w-full max-w-sm rounded-[40px] shadow-2xl relative p-8 border border-[var(--ab-border)]">
            <h3 className="text-xl font-black text-[var(--ab-text-main)] uppercase tracking-tight mb-1">Export Excel</h3>
            <p className="text-[10px] text-[var(--ab-text-dim)] font-bold uppercase tracking-widest mb-6">Pilih rentang tanggal laporan</p>
            <div className="space-y-4 mb-6">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-[var(--ab-primary)] uppercase tracking-widest">Dari Tanggal</label>
                <input type="date" className="ab-input text-xs w-full" value={exportStart} onChange={(e) => setExportStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-[var(--ab-primary)] uppercase tracking-widest">Sampai Tanggal</label>
                <input type="date" className="ab-input text-xs w-full" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowExport(false)} className="flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] border border-[var(--ab-border)] active:scale-95 transition-all">
                Batal
              </button>
              <button onClick={handleExportExcel} className="flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-white active:scale-95 transition-all flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700">
                <FileSpreadsheet size={14} /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
