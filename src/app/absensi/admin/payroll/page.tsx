"use client";

import { useState, useEffect } from "react";
import { format, subMonths, addMonths } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Save, Send, Loader2,
  FileText, CheckCircle2, Eye, Trash2, Search, X, Filter, ChevronDown, User as UserIcon, Plus,
  Pencil, CalendarDays, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import OvertimeFinalizeModal from "@/components/absensi/OvertimeFinalizeModal";
import type { OvertimeRequest } from "@/types/absensi";
import type { Payroll, PayrollStaffSetting, DeductionType, AdditionType, PayrollOvertimeDetailItem } from "@/types";

const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const COMPANY_COLORS: Record<string, string> = { TNT: "#00897B", Hype: "#E53935", Nova: "#1E88E5" };

export interface OvertimeSessionItem {
  raw: OvertimeRequest;
  id: string;
  date: string;
  durationMinutes: number;
  hoursFormatted: string;
  pay: number;
  dayType?: "weekday" | "weekend" | "holiday";
  isCapped?: boolean;
  maxPayCap?: number | null;
}

interface StaffRow {
  id: string;
  name: string;
  email: string;
  departmentName: string | null;
  setting: PayrollStaffSetting | null;
  payroll: Partial<Payroll> & { _dirty?: boolean };
  overtimeSessions?: OvertimeSessionItem[];
  overtimeDateRange?: string | null;
}

export default function HrPayrollPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [previewRow, setPreviewRow] = useState<StaffRow | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<StaffRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StaffRow | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([]);
  const [newDeductionName, setNewDeductionName] = useState("");
  const [addingDeductionFor, setAddingDeductionFor] = useState<string | null>(null);
  const [newCustomDeduction, setNewCustomDeduction] = useState("");
  const [additionTypes, setAdditionTypes] = useState<AdditionType[]>([]);
  const [addingAdditionFor, setAddingAdditionFor] = useState<string | null>(null);
  const [newCustomAddition, setNewCustomAddition] = useState("");
  const [editingOvertimeReq, setEditingOvertimeReq] = useState<{
    request: OvertimeRequest;
    baseSalary: number;
  } | null>(null);

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const periodLabel = format(currentDate, "MMMM yyyy", { locale: localeId });

  // Autosave to localStorage on every change
  useEffect(() => {
    if (rows.length === 0) return;
    const dirtyRows = rows.filter(r => r.payroll._dirty);
    const draftKey = `payroll_draft_${month}_${year}`;
    if (dirtyRows.length > 0) {
      localStorage.setItem(draftKey, JSON.stringify(dirtyRows));
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [rows, month, year]);

  /**
 * Satu-satunya jalan untuk menulis slip gaji.
 *
 * formerly `supabase.from("payrolls").update/insert(payload).eq("id", id)`
 * **langsung dari browser**, tanpa cek role dan tanpa validasi angka.
 * Siapa pun yang punya sesi bisa menulis slip gaji siapa pun, dengan
 * angka negatif kalau mau.
 *
 * Workaround `overtime_detail` juga dihapus: kolom itu memang ada di
 * schema, dan kegagalan karena kolom tidak dikenal harus muncul sebagai
 * error, bukan dihapus diam-diam sampai detail lembur hilang.
 */
async function savePayroll(payload: Record<string, unknown>) {
    const res = await fetch("/api/payroll", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", ...payload }),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!res.ok) {
      throw new Error(json?.error ?? "Gagal menyimpan slip gaji.");
    }
  }

  /** Buat jenis tambahan / potongan baru. */
  async function createType(
    kind: "addition-type" | "deduction-type",
    name: string,
  ) {
    const res = await fetch("/api/payroll", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: kind, name }),
    });
    const json = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          error?: string;
          data?: {
            additionType?: { id: string; name: string; isDefault: boolean };
            deductionType?: { id: string; name: string; isDefault: boolean };
          };
        }
      | null;

    if (!res.ok) {
      throw new Error(json?.error ?? "Gagal membuat jenis baru.");
    }

    return (
      json?.data?.additionType ?? json?.data?.deductionType ?? null
    ) as { id: string; name: string; isDefault: boolean } | null;
  }

  /**
 * Payload slip gaji untuk satu baris.
 *
 * Dipakai `saveRow`, `publishRow`, dan autosave — supaya ketiganya
 * benar-benar mengirimkolom yang sama.
 *
 * formerly autosave mengirim **9 kolom**, sedangkan `saveRow` mengirim
 * 16 dan `publishRow` 18. Akibatnya slip yang disimpan otomatis
 * kehilangan `overtime_rate`, `system_overtime_minutes`, snapshot, dan
 * `deduction_notes` — lalu masih ditandai `_dirty: false` sehingga
 * localStorage ikut dihapus. Perubahan itu hilang total tanpa error.
 */
function payrollPayload(row: StaffRow, isPublished: boolean) {
    return {
      userId: row.id,
      month,
      year,
      baseSalary: row.payroll.base_salary || 0,
      mobilityAllowance: row.payroll.mobility_allowance || 0,
      performanceBonus: row.payroll.performance_bonus || 0,
      overtimePay: row.payroll.overtime_pay || 0,
      overtimeRate: row.payroll.overtime_rate ?? 25000,
      systemOvertimeMinutes: row.payroll.system_overtime_minutes || 0,
      payrollOvertimeMinutes:
        row.payroll.payroll_overtime_minutes ??
        row.payroll.system_overtime_minutes ??
        0,
      // Dihitung di `fetchData` tapi belum pernah ikut tersimpan --
      // nilainya hilang begitu halaman dimuat ulang. Migrasi 0013.
      systemOvertimeDays: row.payroll.system_overtime_days ?? 0,
      overtimeNotes: row.payroll.overtime_notes || "",
      overtimeDetail: row.payroll.overtime_detail || [],
      additionsDetail: row.payroll.additions_detail || [],
      deductions: row.payroll.deductions || 0,
      deductionsDetail: row.payroll.deductions_detail || [],
      deductionNotes: row.payroll.deduction_notes || "",
      notes: row.payroll.notes || "",
      snapshotName: isPublished ? row.name : null,
      snapshotPosition: isPublished
        ? row.setting?.contract_position || null
        : null,
      snapshotCompany: isPublished ? row.setting?.company || null : null,
      isPublished,
    };
  }

  // Autosave ke DB setelah 60s idle
  useEffect(() => {
    const dirtyRows = rows.filter(r => r.payroll._dirty);
    if (dirtyRows.length === 0) return;

    const timeout = setTimeout(async () => {
      /**
       * formerly `Promise.all` tanpa pemeriksaan hasil per baris. Kalau
       * satu slip ditolak, `Promise.all` melempar -- tapi baris lain
       * yang sudah tersimpan tetap ditandai `_dirty: false` dan
       * localStorage dihapus. Draft yang gagal hilang dari recovery.
       *
       * sekarang hasilnya diperiksa satu per satu, dan baris yang
       * gagal tetap `_dirty` supaya masih tersimpan di localStorage.
       */
      const results = await Promise.all(
        dirtyRows.map(async (row) => {
          try {
            await savePayroll(payrollPayload(row, false));
            return { id: row.id, ok: true as const };
          } catch (e) {
            return {
              id: row.id,
              ok: false as const,
              error: e instanceof Error ? e.message : "Gagal menyimpan.",
            };
          }
        }),
      );

      const gagal = results.filter((r) => !r.ok);

      if (gagal.length === 0) {
        toast.success("Draf gaji berhasil disinkronkan otomatis (Autosave).");
        setRows(prev =>
          prev.map((r) =>
            results.find((d) => d.id === r.id)
              ? { ...r, payroll: { ...r.payroll, _dirty: false } }
              : r,
          ),
        );
        localStorage.removeItem(`payroll_draft_${month}_${year}`);
        return;
      }

      console.error("Autosave gagal untuk:", gagal);
      toast.error(
        `${gagal.length} slip gagal disimpan otomatis: ${gagal[0].error}` +
          (gagal.length > 1 ? " (lihat console untuk sisanya)" : ""),
      );
    }, 60000);

    return () => clearTimeout(timeout);
  }, [rows, month, year]);

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  /**
   * formerly **enam** query paralel dari browser: `users`,
   * `payroll_staff_settings`, `payrolls`, `payroll_deduction_types`,
   * `payroll_addition_types`, dan `overtime_requests` dengan filter
   * tanggal sendiri.
   *
   * Dua masalah:
   *
   *   1. Gaji dasar setiap orang terbaca tanpa cek role.
   *   2. Rentang lembur dihitung dari browser. Kalau browser dan server
   *     _compute_ berbeda timezone, awal/akhir bulan bisa bergeser —
   *      sehingga slip gaji memotong lembur yang bukan periode ini.
   *
   * Sekarang satu endpoint; rentang periode dihitung server.
   */
  async function fetchData() {
    setLoading(true);

    const res = await fetch(
      `/api/payroll?year=${year}&month=${month}`,
      { credentials: "include", cache: "no-store" },
    );
    const json = (await res.json()) as {
      ok: boolean;
      data?: {
        payrolls?: any[];
        staff?: {
          id: string;
          name: string;
          email: string;
          departmentName: string | null;
        }[];
        overtime?: any[];
      };
      error?: string;
    };

    if (!res.ok) {
      toast.error(json.error ?? "Gagal memuat data gaji.");
      setLoading(false);
      return;
    }

    const d = json.data ?? {};

    const users = (d.staff ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      departments: { name: u.departmentName },
    }));

    const payrolls = (d.payrolls ?? []).map((p) => ({
      id: p.id,
      user_id: p.userId,
      month: p.month,
      year: p.year,
      base_salary: Number(p.baseSalary),
      mobility_allowance: Number(p.mobilityAllowance),
      performance_bonus: Number(p.performanceBonus),
      overtime_pay: Number(p.overtimePay),
      overtime_rate: p.overtimeRate === null ? null : Number(p.overtimeRate),
      overtime_notes: p.overtimeNotes ?? "",
      overtime_detail: p.overtimeDetail ?? [],
      system_overtime_minutes: p.systemOvertimeMinutes ?? 0,
      payroll_overtime_minutes: p.payrollOvertimeMinutes ?? null,
      system_overtime_days: p.systemOvertimeDays ?? null,
      additions_detail: p.additionsDetail ?? [],
      deductions: Number(p.deductions),
      deductions_detail: p.deductionsDetail ?? [],
      deduction_notes: p.deductionNotes ?? "",
      notes: p.notes ?? "",
      status: p.status,
    })) as Payroll[];

    /**
     * Pengaturan gaji dasar diambil lewat `?view=settings` karena
     * `GET /api/payroll` untuk periode tidak mengirimkannya — tidak ada
     * yang membutuhkan dua request ini paralel, dan `?view=settings` lebih
     * ringan (tidak ikut menarik seluruh slip).
     */
    const settingsRes = await fetch("/api/payroll?view=settings", {
      credentials: "include",
      cache: "no-store",
    });
    const settingsJson = (await settingsRes.json().catch(() => null)) as {
      ok?: boolean;
      data?: { settings?: any[] };
    } | null;

    const settings = ((settingsJson?.data?.settings ?? []) as any[]).map(
      (s) =>
        ({
          user_id: s.userId,
          contract_position: s.contractPosition,
          company: s.company,
          default_base_salary: Number(s.defaultBaseSalary),
          default_mobility_allowance: Number(s.defaultMobilityAllowance),
          notes: s.notes,
        }) as PayrollStaffSetting,
    );

    const typesRes = await fetch("/api/payroll?view=types", {
      credentials: "include",
      cache: "no-store",
    });
    const typesJson = (await typesRes.json().catch(() => null)) as {
      ok?: boolean;
      data?: { deductions?: any[]; additions?: any[] };
    } | null;

    setDeductionTypes(
      (typesJson?.data?.deductions ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        is_default: t.isDefault,
      })) as DeductionType[],
    );
    setAdditionTypes(
      (typesJson?.data?.additions ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        is_default: t.isDefault,
      })) as AdditionType[],
    );

    // Server sudah mengirim camelCase, jadi `rowToOvertimeRequest` tidak
    // perlu lagi -- pemetaan snake_case-nya sudah terjadi di DAL.
    const parsedOvertimes = (d.overtime ?? []) as OvertimeRequest[];
    
    // Group monthly overtime sessions by user_id
    const userOvertimeMap: Record<string, {
      minutes: number;
      pay: number;
      days: number;
      sessions: OvertimeSessionItem[];
      dateRange: string | null;
      defaultNotes: string;
    }> = {};

    users.forEach((u: any) => {
      const uOts = parsedOvertimes
        .filter((o) => o.userId === u.id)
        .sort((a, b) => a.overtimeDate.localeCompare(b.overtimeDate));

      const totalMins = uOts.reduce((sum, o) => sum + (o.finalDurationMinutes || 0), 0);
      const totalPay = uOts.reduce((sum, o) => sum + (Number(o.totalOvertimePay) || 0), 0);
      const totalDays = uOts.length;

      const sessions: OvertimeSessionItem[] = uOts.map((o) => {
        const mins = o.finalDurationMinutes || 0;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        const hoursFormatted = `${h} Jam ${m > 0 ? `${m} Menit` : ""}`.trim();
        const isCapped = Boolean(o.calculationBreakdown?.isCapped);
        const maxPayCap = o.calculationBreakdown?.maxPayCap ?? null;

        return {
          raw: o,
          id: o.id,
          date: o.overtimeDate,
          durationMinutes: mins,
          hoursFormatted,
          pay: Number(o.totalOvertimePay) || 0,
          dayType: o.dayType,
          isCapped,
          maxPayCap,
        };
      });

      let dateRange: string | null = null;
      if (sessions.length === 1) {
        dateRange = format(new Date(sessions[0].date + "T00:00:00"), "dd MMM yyyy", { locale: localeId });
      } else if (sessions.length > 1) {
        const startStr = format(new Date(sessions[0].date + "T00:00:00"), "dd MMM yyyy", { locale: localeId });
        const endStr = format(new Date(sessions[sessions.length - 1].date + "T00:00:00"), "dd MMM yyyy", { locale: localeId });
        dateRange = `${startStr} s/d ${endStr}`;
      }

      let defaultNotes = "";
      if (sessions.length === 1) {
        defaultNotes = `Lembur 1 sesi (${dateRange}: ${sessions[0].hoursFormatted} - ${formatRp(sessions[0].pay)})`;
      } else if (sessions.length > 1) {
        defaultNotes = `Lembur ${sessions.length} sesi (${dateRange}):\n` +
          sessions.map(s => `• ${format(new Date(s.date + "T00:00:00"), "dd MMM yyyy", { locale: localeId })} (${s.hoursFormatted}) = ${formatRp(s.pay)}`).join("\n");
      }

      userOvertimeMap[u.id] = {
        minutes: totalMins,
        pay: totalPay,
        days: totalDays,
        sessions,
        dateRange,
        defaultNotes,
      };
    });

    const draftKey = `payroll_draft_${month}_${year}`;
    let drafts: StaffRow[] = [];
    try {
      const draftStr = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null;
      if (draftStr) drafts = JSON.parse(draftStr);
    } catch (e) {}

    const built: StaffRow[] = users.map((u: any) => {
      const setting = settings.find((s) => s.user_id === u.id) || null;
      const existing = payrolls.find((p) => p.user_id === u.id);
      const otInfo = userOvertimeMap[u.id] || {
        minutes: 0,
        pay: 0,
        days: 0,
        sessions: [],
        dateRange: null,
        defaultNotes: "",
      };

      const systemOvertimeMins = otInfo.minutes;
      const systemOvertimePay = otInfo.pay;
      const systemOvertimeDays = otInfo.days;
      const overtimeRate = existing?.overtime_rate ?? 25000;
      const payrollMins = existing?.payroll_overtime_minutes !== undefined && existing?.payroll_overtime_minutes !== null
        ? existing.payroll_overtime_minutes
        : systemOvertimeMins;

      // Prioritize calculated pay from finalized overtime sessions if available
      const autoCalculatedPay = systemOvertimePay > 0
        ? systemOvertimePay
        : Math.round((payrollMins / 60) * overtimeRate);

      const overtimeDetailItems: PayrollOvertimeDetailItem[] = otInfo.sessions.map((s) => ({
        id: s.id,
        date: s.date,
        durationMinutes: s.durationMinutes,
        hoursFormatted: s.hoursFormatted,
        pay: s.pay,
        dayType: s.dayType,
        maxPayCap: s.maxPayCap,
        isCapped: s.isCapped,
      }));

      // If system has finalized sessions, prioritize system overtime pay and breakdown
      const finalOvertimePay = systemOvertimePay > 0
        ? systemOvertimePay
        : (existing?.overtime_pay ?? autoCalculatedPay);

      const finalOvertimeDetail = otInfo.sessions.length > 0
        ? overtimeDetailItems
        : (existing?.overtime_detail ?? []);

      const isOldGenericNote = existing?.overtime_notes
        ? existing.overtime_notes.toLowerCase().includes("200k") || existing.overtime_notes.toLowerCase().includes("lembur /jam") || existing.overtime_notes.trim() === ""
        : true;

      const finalOvertimeNotes = otInfo.sessions.length > 0 && isOldGenericNote
        ? otInfo.defaultNotes
        : (existing?.overtime_notes ?? otInfo.defaultNotes);
      
      const payrollBase = {
        id: existing?.id,
        base_salary: existing?.base_salary ?? setting?.default_base_salary ?? 0,
        mobility_allowance: existing?.mobility_allowance ?? setting?.default_mobility_allowance ?? 0,
        performance_bonus: existing?.performance_bonus ?? 0,
        overtime_pay: finalOvertimePay,
        overtime_rate: overtimeRate,
        system_overtime_minutes: systemOvertimeMins,
        payroll_overtime_minutes: payrollMins,
        system_overtime_days: systemOvertimeDays,
        overtime_notes: finalOvertimeNotes,
        overtime_detail: finalOvertimeDetail,
        additions_detail: existing?.additions_detail ?? [],
        deductions: existing?.deductions ?? 0,
        deductions_detail: existing?.deductions_detail ?? [],
        notes: existing?.notes ?? "",
        status: existing?.status ?? "draft",
      };

      const draftRow = drafts.find(d => d.id === u.id);
      const payroll = draftRow && draftRow.payroll._dirty 
        ? { ...payrollBase, ...draftRow.payroll } 
        : payrollBase;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        departmentName: u.departments?.name ?? null,
        setting,
        payroll,
        overtimeSessions: otInfo.sessions,
        overtimeDateRange: otInfo.dateRange,
      };
    });

    setRows(built);
    setLoading(false);
  }

  function updateField(userId: string, field: string, value: number | string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === userId ? { ...r, payroll: { ...r.payroll, [field]: value, _dirty: true } } : r
      )
    );
  }

  async function saveRow(row: StaffRow) {
    const tid = toast.loading(`Menyimpan gaji ${row.name}...`);
    try {
      await savePayroll(payrollPayload(row, false));

      setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, _dirty: false } } : r));
      toast.success(`Draf gaji ${row.name} berhasil disimpan.`, { id: tid });
      void fetchData();
    } catch (err: unknown) {
      toast.error("Gagal: " + (err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err)), { id: tid });
    }
  }

  async function publishRow(row: StaffRow) {
    setConfirmPublish(null);
    const tid = toast.loading(`Mengirim slip gaji ${row.name}...`);
    try {
      await savePayroll(payrollPayload(row, true));

      toast.success(`Slip gaji ${row.name} berhasil dikirim!`, { id: tid });
      void fetchData();
    } catch (err: unknown) {
      toast.error("Gagal: " + (err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err)), { id: tid });
    }
  }

  async function deleteRow(row: StaffRow) {
    setConfirmDelete(null);
    if (!row.payroll.id) { toast.info("Belum ada data untuk dihapus."); return; }
    const tid = toast.loading(`Menghapus slip gaji ${row.name}...`);
    try {
      // formerly `payrolls.delete().eq("id", row.payroll.id)` tanpa cek
      // status. Slip yang sudah `published` sudah dilihat staf —
      // menghapusnya membuat slip yang sama muncul lagi berbeda jumlah.
      // Server yang menolak.
      const res = await fetch(
        `/api/payroll?id=${encodeURIComponent(row.payroll.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok) {
        toast.error(json?.error ?? "Gagal menghapus slip gaji.", { id: tid });
        return;
      }

      toast.success(`Slip gaji ${row.name} berhasil dihapus.`, { id: tid });
      void fetchData();
    } catch (err: unknown) {
      toast.error("Gagal: " + (err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err)), { id: tid });
    }
  }

  const formatRp = (num: number) => "Rp " + (num || 0).toLocaleString("id-ID");
  const calcTHP = (p: Partial<Payroll>) => {
    const adds = (p.additions_detail || []).reduce((sum, item) => sum + (item.amount || 0), 0);
    return (p.base_salary || 0) + (p.mobility_allowance || 0) + (p.performance_bonus || 0) + (p.overtime_pay || 0) + adds - (p.deductions || 0);
  };

  const filtered = rows.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchCompany = filterCompany === "all" || r.setting?.company === filterCompany;
    return matchSearch && matchCompany;
  });

  return (
    <div className="space-y-6 ab-animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--ab-text-main)] tracking-tight">Input Gaji Bulanan</h1>
          <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest mt-1">
            Kelola komponen gaji per karyawan per bulan
          </p>
        </div>

        <div className="flex items-center gap-3 bg-[var(--ab-bg-surface)] px-4 py-2 rounded-2xl border border-[var(--ab-border)] shadow-sm">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-[var(--ab-bg-main)] rounded-lg text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-black text-[var(--ab-text-main)] uppercase tracking-widest min-w-[140px] text-center">
            {periodLabel}
          </span>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-[var(--ab-bg-main)] rounded-lg text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)]">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ab-text-dim)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama karyawan..."
            className="ab-input w-full pl-11 text-xs font-bold"
          />
        </div>
        <div className="flex items-center gap-2 bg-[var(--ab-bg-surface)] px-3 py-2 rounded-2xl border border-[var(--ab-border)]">
          <Filter size={14} className="text-[var(--ab-text-dim)]" />
          {["all", "TNT", "Hype", "Nova"].map((c) => (
            <button
              key={c}
              onClick={() => setFilterCompany(c)}
              className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
              style={
                filterCompany === c
                  ? { background: c === "all" ? "var(--ab-text-main)" : COMPANY_COLORS[c], color: "white" }
                  : { color: "var(--ab-text-dim)" }
              }
            >
              {c === "all" ? "Semua" : c}
            </button>
          ))}
        </div>
      </div>

      {/* Accordion List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-40 text-[var(--ab-text-dim)]">
          <Loader2 className="h-6 w-6 animate-spin mb-2" />
          <p className="text-xs font-bold uppercase tracking-widest">Memuat Data...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-[var(--ab-text-dim)]">
          <p className="text-xs font-black uppercase tracking-widest">Tidak ada data ditemukan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const isPublished = row.payroll.status === "published";
            const thp = calcTHP(row.payroll);
            const companyColor = COMPANY_COLORS[row.setting?.company || "Nova"] || "#1E88E5";
            const isExpanded = expandedRow === row.id;

            return (
              <div
                key={row.id}
                className="ab-card-tactile relative overflow-hidden transition-all duration-300"
              >
                {/* Company color strip */}
                <div className="absolute top-0 left-0 w-1.5 h-full" style={{ background: companyColor }} />

                {/* Accordion Header (Clickable) */}
                <div 
                  onClick={() => setExpandedRow(isExpanded ? null : row.id)}
                  className="flex justify-between items-center p-4 pl-6 cursor-pointer hover:bg-[var(--ab-bg-main)] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 shadow-sm" style={{ borderColor: companyColor + '50', background: companyColor + '10', color: companyColor }}>
                      <UserIcon size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-[var(--ab-text-main)] tracking-tight">{row.name}</p>
                      <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                        {row.setting?.contract_position || "Belum diatur"} • {row.setting?.company || "Nova"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isPublished ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-green-500/20 text-green-500 border border-green-500/30">
                        <CheckCircle2 size={10} /> Terkirim
                      </span>
                    ) : row.payroll.id ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] border border-[var(--ab-border)]">
                        <FileText size={10} /> Draf
                      </span>
                    ) : null}
                    <div className="text-[var(--ab-text-dim)]">
                      <ChevronDown size={18} className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </div>

                {/* Accordion Body */}
                {isExpanded && (
                  <div className="p-4 pl-6 border-t border-[var(--ab-border)] bg-[var(--ab-bg-surface)]">
                    {/* Input Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
                      {[
                        { label: "Gaji Pokok", field: "base_salary" },
                        { label: "Allowance", field: "mobility_allowance" },
                        { label: "Bonus Performa", field: "performance_bonus" },
                      ].map(({ label, field }) => (
                        <div key={field} className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest">{label}</label>
                          <input
                            type="number"
                            disabled={isPublished}
                            value={(row.payroll as any)[field] || ""}
                            onChange={(e) => updateField(row.id, field, Number(e.target.value))}
                            className="ab-input text-sm font-mono w-full py-2.5 disabled:opacity-40"
                            placeholder="0"
                          />
                        </div>
                      ))}
                      
                      {/* Overtime with Summary & Direct link to Management */}
                      <div className="col-span-2 md:col-span-3 space-y-3 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <label className="text-[10px] font-black uppercase text-amber-700 tracking-widest flex items-center gap-1.5 flex-wrap">
                            <span>Manajemen Upah Lembur</span>
                            <span className="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-bold">
                              Sistem: {row.overtimeSessions?.length || 0} Sesi ({row.payroll.system_overtime_days || 0} Hari) • {Math.floor((row.payroll.system_overtime_minutes || 0) / 60)}j {(row.payroll.system_overtime_minutes || 0) % 60}m
                            </span>
                          </label>
                          <div className="flex items-center gap-2 flex-wrap">
                            {!isPublished && (row.overtimeSessions?.length || 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const totalSessPay = (row.overtimeSessions || []).reduce((sum, s) => sum + s.pay, 0);
                                  const sessions = row.overtimeSessions || [];
                                  let generated = "";
                                  if (sessions.length === 1) {
                                    generated = `Lembur 1 sesi (${row.overtimeDateRange}: ${sessions[0].hoursFormatted} - ${formatRp(sessions[0].pay)})`;
                                  } else if (sessions.length > 1) {
                                    generated = `Lembur ${sessions.length} sesi (${row.overtimeDateRange}):\n` +
                                      sessions.map(s => `• ${format(new Date(s.date + "T00:00:00"), "dd MMM yyyy", { locale: localeId })} (${s.hoursFormatted}) = ${formatRp(s.pay)}`).join("\n");
                                  }
                                  
                                  const detailItems = sessions.map(s => ({
                                    id: s.id,
                                    date: s.date,
                                    durationMinutes: s.durationMinutes,
                                    hoursFormatted: s.hoursFormatted,
                                    pay: s.pay,
                                    dayType: s.dayType,
                                    maxPayCap: s.maxPayCap,
                                    isCapped: s.isCapped,
                                  }));

                                  setRows(prev => prev.map(r => r.id === row.id ? {
                                    ...r,
                                    payroll: {
                                      ...r.payroll,
                                      overtime_pay: totalSessPay,
                                      overtime_notes: generated,
                                      overtime_detail: detailItems,
                                      _dirty: true
                                    }
                                  } : r));
                                  toast.success(`Berhasil menyinkronkan ${sessions.length} sesi lembur (${formatRp(totalSessPay)}) ke payroll ${row.name}!`);
                                }}
                                className="text-[9.5px] font-black uppercase tracking-wider text-amber-900 hover:text-amber-950 flex items-center gap-1 bg-amber-200/80 hover:bg-amber-300 px-2 py-1 rounded-lg border border-amber-300 transition-colors shadow-xs"
                                title="Paksa sinkronkan nominal & rincian dari sesi lembur yang sah"
                              >
                                <RefreshCw size={11} />
                                Sinkronkan Ulang Sesi
                              </button>
                            )}
                            <a
                              href="/absensi/admin/overtime"
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-black uppercase tracking-wider text-amber-700 hover:text-amber-900 flex items-center gap-1 hover:underline"
                            >
                              Menu Lembur Lengkap ↗
                            </a>
                            <span className="text-[10px] font-black text-amber-700">
                              Total: {formatRp(row.payroll.overtime_pay || 0)}
                            </span>
                          </div>
                        </div>

                        {/* Rincian Sesi Lembur Sah (Jika Ada) */}
                        {row.overtimeSessions && row.overtimeSessions.length > 0 ? (
                          <div className="bg-white/85 dark:bg-slate-900/80 rounded-xl p-3 border border-amber-200/70 space-y-2.5 shadow-xs">
                            <div className="flex items-center justify-between text-xs border-b border-amber-100 pb-2 flex-wrap gap-2">
                              <span className="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                                <CalendarDays size={13} className="text-amber-600 shrink-0" />
                                <span>Periode: <strong>{row.overtimeDateRange || "-"}</strong> ({row.overtimeSessions.length} Sesi Sah)</span>
                              </span>
                              {!isPublished && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const sessions = row.overtimeSessions || [];
                                    let generated = "";
                                    if (sessions.length === 1) {
                                      generated = `Lembur 1 sesi (${row.overtimeDateRange}: ${sessions[0].hoursFormatted} - ${formatRp(sessions[0].pay)})`;
                                    } else if (sessions.length > 1) {
                                      generated = `Lembur ${sessions.length} sesi (${row.overtimeDateRange}):\n` +
                                        sessions.map(s => `• ${format(new Date(s.date + "T00:00:00"), "dd MMM yyyy", { locale: localeId })} (${s.hoursFormatted}) = ${formatRp(s.pay)}`).join("\n");
                                    }
                                    updateField(row.id, "overtime_notes", generated);
                                    toast.success("Catatan slip gaji disinkronkan ulang dari rincian sesi!");
                                  }}
                                  className="text-[9.5px] font-black uppercase tracking-wider text-amber-800 hover:text-amber-950 hover:underline flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 transition-colors"
                                  title="Sinkronkan format catatan slip gaji dengan rincian sesi di atas"
                                >
                                  <RefreshCw size={10} />
                                  Sinkronkan Catatan Slip
                                </button>
                              )}
                            </div>

                            {/* List of Sesi */}
                            <div className="space-y-1.5">
                              {row.overtimeSessions.map((session, sIdx) => (
                                <div
                                  key={session.id || sIdx}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-amber-50/40 dark:bg-amber-950/20 p-2 rounded-lg border border-amber-100/70"
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                                      {format(new Date(session.date + "T00:00:00"), "dd MMM yyyy", { locale: localeId })}
                                    </span>
                                    {session.dayType === "weekend" ? (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold border border-purple-200">
                                        Weekend
                                      </span>
                                    ) : session.dayType === "holiday" ? (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold border border-rose-200">
                                        Libur
                                      </span>
                                    ) : (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold border border-amber-200">
                                        Weekday
                                      </span>
                                    )}
                                    <span className="text-slate-600 dark:text-slate-300 font-medium">
                                      Durasi: <strong>{session.hoursFormatted}</strong>
                                    </span>
                                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                      {formatRp(session.pay)}
                                    </span>
                                    {session.isCapped && (
                                      <span
                                        className="text-[8.5px] px-1.5 py-0.5 rounded bg-amber-600 text-white font-bold"
                                        title={`Dibatasi plafon maksimal Rp ${formatRp(session.maxPayCap || 0)}`}
                                      >
                                        Plafon: {formatRp(session.maxPayCap || 0)}
                                      </span>
                                    )}
                                  </div>

                                  {!isPublished && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditingOvertimeReq({
                                          request: session.raw,
                                          baseSalary: row.payroll.base_salary || row.setting?.default_base_salary || 0,
                                        })
                                      }
                                      className="self-end sm:self-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-200/90 hover:bg-amber-300 text-amber-950 flex items-center gap-1 transition-all active:scale-95 shrink-0 shadow-xs border border-amber-300"
                                      title="Edit jam dan nominal sesi lembur ini langsung tanpa berpindah menu"
                                    >
                                      <Pencil size={11} />
                                      <span>Edit Sesi</span>
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="pt-1.5 border-t border-amber-100 flex justify-between items-center text-[10px] text-amber-900 dark:text-amber-200 font-bold">
                              <span>Total Upah dari Akumulasi Sesi:</span>
                              <span className="font-mono text-xs text-amber-900 dark:text-amber-100 font-black">
                                {formatRp((row.overtimeSessions || []).reduce((sum, s) => sum + s.pay, 0))}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-white/60 dark:bg-slate-900/50 border border-amber-100 text-xs text-slate-500 italic">
                            Belum ada sesi lembur yang disahkan pada bulan ini. Anda dapat menginput nominal manual di bawah jika diperlukan.
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-amber-900 tracking-widest flex justify-between">
                              <span>Nominal Uang Lembur (Rp)</span>
                              <span className="text-[8.5px] text-amber-700/80 font-normal">
                                Otomatis terisi dari sesi sah (bisa di-edit)
                              </span>
                            </label>
                            <input
                              type="number"
                              disabled={isPublished}
                              value={row.payroll.overtime_pay || ""}
                              onChange={(e) => updateField(row.id, "overtime_pay", Number(e.target.value))}
                              className="ab-input text-xs font-mono font-bold w-full py-2 bg-white text-amber-900"
                              placeholder="0"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-amber-900 tracking-widest">
                              Catatan Lembur di Slip Gaji
                            </label>
                            <textarea
                              rows={2}
                              disabled={isPublished}
                              value={row.payroll.overtime_notes || ""}
                              onChange={(e) => updateField(row.id, "overtime_notes", e.target.value)}
                              className="ab-input text-xs w-full py-1.5 px-2.5 bg-white resize-none rounded-xl"
                              placeholder="Contoh: Lembur project 4 sesi di bulan ini..."
                            />
                          </div>
                        </div>
                      </div>

                      {/* Multi-Addition UI */}
                      <div className="col-span-2 md:col-span-3 space-y-3 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-emerald-600 tracking-widest flex items-center gap-1.5">
                            Upah Tambahan Lainnya
                            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md">Total: {formatRp((row.payroll.additions_detail || []).reduce((sum, item) => sum + (item.amount || 0), 0))}</span>
                          </label>
                        </div>
                        
                        <div className="space-y-2">
                          {(row.payroll.additions_detail || []).map((add, idx) => (
                            <div key={idx} className="flex flex-col gap-1 border-b border-emerald-50 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                              <div className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  disabled={isPublished}
                                  value={add.name}
                                  onChange={(e) => {
                                    const newList = [...(row.payroll.additions_detail || [])];
                                    newList[idx].name = e.target.value;
                                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, additions_detail: newList, _dirty: true } } : r));
                                  }}
                                  className="ab-input text-xs w-1/2 py-2 disabled:opacity-40"
                                  placeholder="Nama Tambahan"
                                />
                                <input
                                  type="number"
                                  disabled={isPublished}
                                  value={add.amount || ""}
                                  onChange={(e) => {
                                    const newList = [...(row.payroll.additions_detail || [])];
                                    newList[idx].amount = Number(e.target.value);
                                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, additions_detail: newList, _dirty: true } } : r));
                                  }}
                                  className="ab-input text-xs font-mono w-1/2 py-2 disabled:opacity-40"
                                  placeholder="0"
                                />
                                {!isPublished && (
                                  <button
                                    onClick={() => {
                                      const newList = [...(row.payroll.additions_detail || [])];
                                      newList.splice(idx, 1);
                                      setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, additions_detail: newList, _dirty: true } } : r));
                                    }}
                                    className="text-emerald-400 hover:text-emerald-600 p-1 bg-white border border-emerald-100 hover:border-emerald-300 rounded"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                              <textarea
                                disabled={isPublished}
                                value={add.note || ""}
                                onChange={(e) => {
                                  const newList = [...(row.payroll.additions_detail || [])];
                                  newList[idx].note = e.target.value;
                                  setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, additions_detail: newList, _dirty: true } } : r));
                                }}
                                className="ab-input text-[11px] w-full py-1.5 min-h-[36px] resize-none disabled:opacity-40 text-emerald-700 bg-emerald-50/30"
                                placeholder="Keterangan tambahan (opsional)..."
                              />
                            </div>
                          ))}
                        </div>

                        {!isPublished && (
                          <div className="flex flex-col gap-2 mt-2">
                            {addingAdditionFor === row.id ? (
                              <div className="flex gap-2 items-center">
                                <input 
                                  autoFocus
                                  type="text" 
                                  className="ab-input text-xs py-1.5 flex-1 bg-white"
                                  placeholder="Ketik nama tambahan..."
                                  value={newCustomAddition}
                                  onChange={e => setNewCustomAddition(e.target.value)}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (!newCustomAddition.trim()) return;
                                      const finalName = newCustomAddition.trim();
                                      // formerly `payroll_addition_types.insert()`
                                      // dari browser: nama jenis tidak divalidasi (bisa kosong atau
                                      // lebih dari 60 karakter), dan tidak ada cek role. Kode ini ada
                                      // di empat tempat (Enter + tombol OK, untuk tambahan dan untuk
                                      // potongan) -- sekarang semuanya lewat satu helper.
                                      const created = await createType("addition-type", finalName).catch((e) => {
                                        toast.error(e instanceof Error ? e.message : "Gagal membuat jenis baru.");
                                        return null;
                                      });
                                      if (!created) return;
                                      if (created) setAdditionTypes(prev => [...prev, created as any]);
                                      
                                      const newList = [...(row.payroll.additions_detail || []), { name: finalName, amount: 0 }];
                                      setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, additions_detail: newList, _dirty: true } } : r));
                                      setAddingAdditionFor(null);
                                      setNewCustomAddition("");
                                    } else if (e.key === 'Escape') {
                                      setAddingAdditionFor(null);
                                      setNewCustomAddition("");
                                    }
                                  }}
                                />
                                <button 
                                  className="px-3 py-1.5 bg-emerald-500 text-white text-xs rounded-md font-bold hover:bg-emerald-600"
                                  onClick={async () => {
                                    if (!newCustomAddition.trim()) return;
                                    const finalName = newCustomAddition.trim();
                                    // formerly `payroll_addition_types.insert()`
                                    // dari browser: nama jenis tidak divalidasi (bisa kosong atau
                                    // lebih dari 60 karakter), dan tidak ada cek role. Kode ini ada
                                    // di empat tempat (Enter + tombol OK, untuk tambahan dan untuk
                                    // potongan) -- sekarang semuanya lewat satu helper.
                                    const created = await createType("addition-type", finalName).catch((e) => {
                                      toast.error(e instanceof Error ? e.message : "Gagal membuat jenis baru.");
                                      return null;
                                    });
                                    if (!created) return;
                                    if (created) setAdditionTypes(prev => [...prev, created as any]);
                                    const newList = [...(row.payroll.additions_detail || []), { name: finalName, amount: 0 }];
                                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, additions_detail: newList, _dirty: true } } : r));
                                    setAddingAdditionFor(null);
                                    setNewCustomAddition("");
                                  }}
                                >OK</button>
                                <button 
                                  className="px-2 py-1.5 bg-gray-100 text-gray-500 text-xs rounded-md hover:bg-gray-200"
                                  onClick={() => {
                                    setAddingAdditionFor(null);
                                    setNewCustomAddition("");
                                  }}
                                >Batal</button>
                              </div>
                            ) : (
                              <select
                                className="ab-input text-xs py-1.5 flex-1 bg-white"
                                value=""
                                onChange={async (e) => {
                                  const val = e.target.value;
                                  if (!val) return;
                                  
                                  if (val === 'NEW') {
                                    setAddingAdditionFor(row.id);
                                    setNewCustomAddition("");
                                    return;
                                  }
  
                                  const newList = [...(row.payroll.additions_detail || []), { name: val, amount: 0 }];
                                  setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, additions_detail: newList, _dirty: true } } : r));
                                }}
                              >
                                <option value="">-- Tambah Upah Lainnya --</option>
                                {additionTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                <option value="NEW" className="font-bold text-emerald-600">+ Tambah Upah Baru</option>
                              </select>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Multi-Deduction UI */}
                      <div className="col-span-2 md:col-span-3 space-y-3 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black uppercase text-rose-500 tracking-widest flex items-center gap-1.5">
                            Potongan
                            <span className="text-[9px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-md">Total: {formatRp(row.payroll.deductions || 0)}</span>
                          </label>
                        </div>
                        
                        <div className="space-y-2">
                          {(row.payroll.deductions_detail || []).map((ded, idx) => (
                            <div key={idx} className="flex flex-col gap-1 border-b border-rose-50 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                              <div className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  disabled={isPublished}
                                  value={ded.name}
                                  onChange={(e) => {
                                    const newList = [...(row.payroll.deductions_detail || [])];
                                    newList[idx].name = e.target.value;
                                    const total = newList.reduce((sum, item) => sum + (item.amount || 0), 0);
                                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, deductions_detail: newList, deductions: total, _dirty: true } } : r));
                                  }}
                                  className="ab-input text-xs w-1/2 py-2 disabled:opacity-40"
                                  placeholder="Nama Potongan"
                                />
                                <input
                                  type="number"
                                  disabled={isPublished}
                                  value={ded.amount || ""}
                                  onChange={(e) => {
                                    const newList = [...(row.payroll.deductions_detail || [])];
                                    newList[idx].amount = Number(e.target.value);
                                    const total = newList.reduce((sum, item) => sum + (item.amount || 0), 0);
                                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, deductions_detail: newList, deductions: total, _dirty: true } } : r));
                                  }}
                                  className="ab-input text-xs font-mono w-1/2 py-2 disabled:opacity-40"
                                  placeholder="0"
                                />
                                {!isPublished && (
                                  <button
                                    onClick={() => {
                                      const newList = [...(row.payroll.deductions_detail || [])];
                                      newList.splice(idx, 1);
                                      const total = newList.reduce((sum, item) => sum + (item.amount || 0), 0);
                                      setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, deductions_detail: newList, deductions: total, _dirty: true } } : r));
                                    }}
                                    className="text-rose-400 hover:text-rose-600 p-1 bg-white border border-rose-100 hover:border-rose-300 rounded"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                              <textarea
                                disabled={isPublished}
                                value={ded.note || ""}
                                onChange={(e) => {
                                  const newList = [...(row.payroll.deductions_detail || [])];
                                  newList[idx].note = e.target.value;
                                  setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, deductions_detail: newList, _dirty: true } } : r));
                                }}
                                className="ab-input text-[11px] w-full py-1.5 min-h-[36px] resize-none disabled:opacity-40 text-rose-700 bg-rose-50/30"
                                placeholder="Keterangan potongan (opsional)..."
                              />
                            </div>
                          ))}
                        </div>

                        {!isPublished && (
                          <div className="flex flex-col gap-2 mt-2">
                            {addingDeductionFor === row.id ? (
                              <div className="flex gap-2 items-center">
                                <input 
                                  autoFocus
                                  type="text" 
                                  className="ab-input text-xs py-1.5 flex-1 bg-white"
                                  placeholder="Ketik nama potongan..."
                                  value={newCustomDeduction}
                                  onChange={e => setNewCustomDeduction(e.target.value)}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (!newCustomDeduction.trim()) return;
                                      const finalName = newCustomDeduction.trim();
                                      // Save to DB
                                      // formerly `payroll_deduction_types.insert()`
                                      // dari browser: nama jenis tidak divalidasi (bisa kosong atau
                                      // lebih dari 60 karakter), dan tidak ada cek role. Kode ini ada
                                      // di empat tempat (Enter + tombol OK, untuk tambahan dan untuk
                                      // potongan) -- sekarang semuanya lewat satu helper.
                                      const created = await createType("deduction-type", finalName).catch((e) => {
                                        toast.error(e instanceof Error ? e.message : "Gagal membuat jenis baru.");
                                        return null;
                                      });
                                      if (!created) return;
                                      if (created) setDeductionTypes(prev => [...prev, created as any]);
                                      
                                      const newList = [...(row.payroll.deductions_detail || []), { name: finalName, amount: 0 }];
                                      setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, deductions_detail: newList, _dirty: true } } : r));
                                      setAddingDeductionFor(null);
                                      setNewCustomDeduction("");
                                    } else if (e.key === 'Escape') {
                                      setAddingDeductionFor(null);
                                      setNewCustomDeduction("");
                                    }
                                  }}
                                />
                                <button 
                                  className="px-3 py-1.5 bg-rose-500 text-white text-xs rounded-md font-bold hover:bg-rose-600"
                                  onClick={async () => {
                                    if (!newCustomDeduction.trim()) return;
                                    const finalName = newCustomDeduction.trim();
                                    // formerly `payroll_deduction_types.insert()`
                                    // dari browser: nama jenis tidak divalidasi (bisa kosong atau
                                    // lebih dari 60 karakter), dan tidak ada cek role. Kode ini ada
                                    // di empat tempat (Enter + tombol OK, untuk tambahan dan untuk
                                    // potongan) -- sekarang semuanya lewat satu helper.
                                    const created = await createType("deduction-type", finalName).catch((e) => {
                                      toast.error(e instanceof Error ? e.message : "Gagal membuat jenis baru.");
                                      return null;
                                    });
                                    if (!created) return;
                                    if (created) setDeductionTypes(prev => [...prev, created as any]);
                                    const newList = [...(row.payroll.deductions_detail || []), { name: finalName, amount: 0 }];
                                    setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, deductions_detail: newList, _dirty: true } } : r));
                                    setAddingDeductionFor(null);
                                    setNewCustomDeduction("");
                                  }}
                                >OK</button>
                                <button 
                                  className="px-2 py-1.5 bg-gray-100 text-gray-500 text-xs rounded-md hover:bg-gray-200"
                                  onClick={() => {
                                    setAddingDeductionFor(null);
                                    setNewCustomDeduction("");
                                  }}
                                >Batal</button>
                              </div>
                            ) : (
                              <select
                                className="ab-input text-xs py-1.5 flex-1 bg-white"
                                value=""
                                onChange={async (e) => {
                                  const val = e.target.value;
                                  if (!val) return;
                                  
                                  if (val === 'NEW') {
                                    setAddingDeductionFor(row.id);
                                    setNewCustomDeduction("");
                                    return;
                                  }
  
                                  const newList = [...(row.payroll.deductions_detail || []), { name: val, amount: 0 }];
                                  setRows(prev => prev.map(r => r.id === row.id ? { ...r, payroll: { ...r.payroll, deductions_detail: newList, _dirty: true } } : r));
                                }}
                              >
                                <option value="">-- Tambah Potongan --</option>
                                {deductionTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                <option value="NEW" className="font-bold text-rose-600">+ Tambah Potongan Baru</option>
                              </select>
                            )}
                          </div>
                        )}
                        
                        </div>
                    </div>

                    <div className="space-y-1 mb-4">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Catatan Slip Gaji</label>
                      <textarea
                        disabled={isPublished}
                        value={row.payroll.notes || ""}
                        onChange={(e) => updateField(row.id, "notes", e.target.value)}
                        className="ab-input text-sm w-full py-2 min-h-[50px] resize-none disabled:opacity-40"
                        placeholder="Tambahkan catatan khusus untuk slip gaji ini (opsional)..."
                      />
                    </div>

                    {/* THP & Actions Container */}
                    <div className="flex flex-col md:flex-row items-center gap-4 bg-[var(--ab-bg-main)] p-4 rounded-2xl border border-[var(--ab-border)]">
                      {/* THP */}
                      <div className="flex-1 flex justify-between md:justify-start md:gap-4 items-center w-full md:w-auto border-b md:border-b-0 md:border-r border-[var(--ab-border)] pb-3 md:pb-0 md:pr-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--ab-text-dim)]">Total Diterima</span>
                        <span className="text-xl font-black font-mono" style={{ color: companyColor }}>{formatRp(thp)}</span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 w-full md:w-auto">
                        <button
                          onClick={() => saveRow(row)}
                          disabled={isPublished}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[var(--ab-bg-surface)] text-[var(--ab-text-main)] border border-[var(--ab-border)] hover:bg-[var(--ab-border)] transition-all disabled:opacity-30 shadow-sm"
                        >
                          <Save size={14} /> Simpan
                        </button>
                        <button
                          onClick={() => setConfirmPublish(row)}
                          disabled={isPublished}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all disabled:opacity-30 shadow-sm shadow-black/10"
                          style={{ background: companyColor }}
                        >
                          <Send size={14} /> Kirim
                        </button>
                        <button
                          onClick={() => setPreviewRow(row)}
                          className="px-3 py-2.5 rounded-xl text-[var(--ab-text-dim)] border border-[var(--ab-border)] bg-[var(--ab-bg-surface)] hover:text-[var(--ab-text-main)] transition-all"
                          title="Preview"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(row)}
                          disabled={!row.payroll.id}
                          className="px-3 py-2.5 rounded-xl text-rose-400 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-all disabled:opacity-20"
                          title="Hapus"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Publish Modal */}
      {confirmPublish && typeof document !== "undefined" && createPortal(
        <div className="ab-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmPublish(null); }}>
          <div className="w-full max-w-sm rounded-[30px] shadow-2xl overflow-hidden ab-animate-scaleIn border border-[var(--ab-border)]" style={{ background: "var(--ab-bg-surface)" }}>
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-white" style={{ background: COMPANY_COLORS[confirmPublish.setting?.company || "Nova"] }}>
                <Send size={28} />
              </div>
              <h3 className="text-xl font-black text-[var(--ab-text-main)] uppercase tracking-tight mb-2">Kirim Slip Gaji?</h3>
              <p className="text-sm text-[var(--ab-text-dim)] mb-2">
                Anda akan mengirim slip gaji <strong>{confirmPublish.name}</strong> untuk periode <strong>{periodLabel}</strong>.
              </p>
              <p className="text-lg font-black font-mono mb-6" style={{ color: COMPANY_COLORS[confirmPublish.setting?.company || "Nova"] }}>
                THP: {formatRp(calcTHP(confirmPublish.payroll))}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmPublish(null)} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] border border-[var(--ab-border)]">
                  Batal
                </button>
                <button onClick={() => publishRow(confirmPublish)} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white" style={{ background: COMPANY_COLORS[confirmPublish.setting?.company || "Nova"] }}>
                  Ya, Kirim!
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && typeof document !== "undefined" && createPortal(
        <div className="ab-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="w-full max-w-sm rounded-[30px] shadow-2xl overflow-hidden ab-animate-scaleIn border border-[var(--ab-border)]" style={{ background: "var(--ab-bg-surface)" }}>
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500">
                <Trash2 size={28} />
              </div>
              <h3 className="text-xl font-black text-[var(--ab-text-main)] uppercase tracking-tight mb-2">Hapus Slip Gaji?</h3>
              <p className="text-sm text-[var(--ab-text-dim)] mb-6">
                Anda akan menghapus data gaji <strong>{confirmDelete.name}</strong> untuk periode <strong>{periodLabel}</strong>. Tindakan ini tidak bisa dibatalkan.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] border border-[var(--ab-border)]">
                  Batal
                </button>
                <button onClick={() => deleteRow(confirmDelete)} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white bg-rose-600">
                  Ya, Hapus!
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Preview Modal */}
      {previewRow && typeof document !== "undefined" && createPortal(
        <div className="ab-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreviewRow(null); }}>
          <div className="w-full max-w-md rounded-[30px] shadow-2xl overflow-hidden ab-animate-scaleIn border border-[var(--ab-border)]" style={{ background: "var(--ab-bg-surface)" }}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--ab-text-main)]">Preview Slip Gaji</h3>
                <button onClick={() => setPreviewRow(null)} className="text-[var(--ab-text-dim)] hover:text-red-500">
                  <X size={20} />
                </button>
              </div>

              {/* Slip Preview */}
              <div className="bg-white text-slate-900 rounded-2xl p-6 border shadow-inner">
                <div className="flex flex-col items-center text-center mb-6 pb-4 border-b-2" style={{ borderColor: COMPANY_COLORS[previewRow.setting?.company || "Nova"] }}>
                  <img 
                    src={`/logos/${(previewRow.setting?.company || "Nova").toLowerCase()}.png`}
                    alt={previewRow.setting?.company || "Nova"}
                    className="h-12 mb-2 object-contain"
                  />
                  <div className="text-[9px] font-medium text-slate-500 mb-3 space-y-0.5">
                    {previewRow.setting?.company === "TNT" && (
                      <>
                        <p className="font-bold text-slate-700">PT TNT Kreatif Digital, MCN & TAP Agency</p>
                        <p>Official TikTok Shop Partner & MCN</p>
                        <p>Email: hr.tntmedia@gmail.com</p>
                      </>
                    )}
                    {(previewRow.setting?.company === "Nova" || !previewRow.setting?.company) && (
                      <>
                        <p className="font-bold text-slate-700">PT Synera Kreatif Grup</p>
                        <p>Official TikTok Shop Partner & MCN</p>
                      </>
                    )}
                    {previewRow.setting?.company === "Hype" && (
                      <>
                        <p className="font-bold text-slate-700">HYPE Media Indonesia</p>
                        <p>Official TikTok GO Agency Partner</p>
                        <p>Email: hypeprojectt@gmail.com</p>
                      </>
                    )}
                  </div>
                  <p className="text-lg font-black uppercase tracking-widest" style={{ color: COMPANY_COLORS[previewRow.setting?.company || "Nova"] }}>
                    SLIP GAJI
                  </p>
                </div>

                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs mb-6">
                  <span className="font-black text-slate-500">Nama Karyawan</span>
                  <span className="font-bold">: {previewRow.name}</span>
                  <span className="font-black text-slate-500">Bulan/Tahun</span>
                  <span className="font-bold">: {MONTH_NAMES[month - 1]} {year}</span>
                  <span className="font-black text-slate-500">Jabatan</span>
                  <span className="font-bold">: {previewRow.setting?.contract_position || "-"}</span>
                </div>

                <table className="w-full text-xs border-collapse mb-6">
                  <thead>
                    <tr className="border-y-2" style={{ borderColor: COMPANY_COLORS[previewRow.setting?.company || "Nova"] }}>
                      <th className="py-2 text-left font-black uppercase text-slate-500">Rincian</th>
                      <th className="py-2 text-right font-black uppercase text-slate-500">Nominal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Gaji Pokok", val: previewRow.payroll.base_salary || 0 },
                      { label: "Allowance", val: previewRow.payroll.mobility_allowance || 0 },
                      { label: "Bonus Performa", val: previewRow.payroll.performance_bonus || 0 },
                    ].map((item) => (
                      <tr key={item.label} className="border-b border-slate-100">
                        <td className="py-2 whitespace-pre-wrap leading-tight">{item.label}</td>
                        <td className="py-2 text-right font-mono font-bold">{formatRp(item.val)}</td>
                      </tr>
                    ))}

                    {/* Upah Lembur with Session Table in Preview */}
                    <tr className="border-b border-slate-100">
                      <td colSpan={2} className="py-2 leading-tight">
                        <span className="font-semibold block mb-1.5">Upah Lembur</span>
                        {previewRow.payroll.overtime_detail && previewRow.payroll.overtime_detail.length > 0 ? (
                          <div className="space-y-1.5">
                            <table className="w-full text-xs border-collapse border border-slate-200">
                              <thead>
                                <tr className="bg-slate-100 text-slate-700">
                                  <th className="border border-slate-200 px-2 py-1 text-left font-bold">Tanggal Lembur</th>
                                  <th className="border border-slate-200 px-2 py-1 text-center font-bold">Total Jam Lembur</th>
                                  <th className="border border-slate-200 px-2 py-1 text-right font-bold">Nominal Total Lembur</th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewRow.payroll.overtime_detail.map((s, idx) => {
                                  const mins = s.durationMinutes || 0;
                                  const h = Math.floor(mins / 60);
                                  const m = mins % 60;
                                  const durationStr = s.hoursFormatted || `${h} Jam ${m > 0 ? `${m} Menit` : ""}`.trim();

                                  return (
                                    <tr key={idx}>
                                      <td className="border border-slate-200 px-2 py-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span>{format(new Date(s.date + "T00:00:00"), "dd MMM yyyy", { locale: localeId })}</span>
                                          {s.dayType === "weekend" && (
                                            <span className="text-[9px] text-purple-700 bg-purple-50 px-1 rounded border border-purple-200 font-medium">
                                              Weekend
                                            </span>
                                          )}
                                          {s.dayType === "holiday" && (
                                            <span className="text-[9px] text-rose-700 bg-rose-50 px-1 rounded border border-rose-200 font-medium">
                                              Libur
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="border border-slate-200 px-2 py-1 text-center font-mono">{durationStr}</td>
                                      <td className="border border-slate-200 px-2 py-1 text-right font-mono font-medium">{formatRp(s.pay || 0)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-slate-100 font-bold">
                                  <td colSpan={2} className="border border-slate-200 px-2 py-1 text-right font-bold text-slate-800">
                                    Total Upah Lembur
                                  </td>
                                  <td className="border border-slate-200 px-2 py-1 text-right font-mono font-bold text-slate-900">
                                    {formatRp(previewRow.payroll.overtime_pay || 0)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                            {previewRow.payroll.overtime_notes && (
                              <div className="text-[10px] text-slate-500 italic mt-1 whitespace-pre-wrap">{previewRow.payroll.overtime_notes}</div>
                            )}
                          </div>
                        ) : (
                          <div className="flex justify-between items-center">
                            <div>
                              {previewRow.payroll.overtime_notes && (
                                <div className="text-xs text-slate-500 italic whitespace-pre-wrap">{previewRow.payroll.overtime_notes}</div>
                              )}
                            </div>
                            <span className="font-bold font-mono">{formatRp(previewRow.payroll.overtime_pay || 0)}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                    {previewRow.payroll.additions_detail && previewRow.payroll.additions_detail.length > 0 && (
                      <tr className="border-b border-slate-100">
                        <td className="py-2 leading-tight">
                          <span className="font-medium block">Upah Tambahan Lainnya</span>
                            {(previewRow.payroll.additions_detail || []).map((add, i) => (
                              <div key={"a-"+i} className="mb-2 last:mb-0">
                                <div className="text-xs ml-2">- {add.name} {add.amount > 0 ? `(${formatRp(add.amount)})` : ''}</div>
                                {add.note && <div className="text-[10px] text-slate-500 italic ml-4 whitespace-pre-wrap">{add.note}</div>}
                              </div>
                            ))}
                        </td>
                        <td className="py-2 text-right font-mono font-bold">{formatRp((previewRow.payroll.additions_detail || []).reduce((sum, a) => sum + (a.amount || 0), 0))}</td>
                      </tr>
                    )}
                    {(previewRow.payroll.deductions || 0) > 0 && (
                      <tr className="border-b border-slate-100 text-rose-600">
                        <td className="py-2 leading-tight">
                          <span className="font-medium block">Potongan</span>
                          {(previewRow.payroll.deductions_detail || []).map((ded, i) => (
                              <div key={"d-"+i} className="mb-2 last:mb-0">
                                <div className="text-xs ml-2 text-rose-500">- {ded.name}</div>
                                {ded.note && <div className="text-[10px] text-slate-500 italic ml-4 whitespace-pre-wrap">{ded.note}</div>}
                              </div>
                            ))}
                        </td>
                        <td className="py-2 text-right font-mono font-bold">({formatRp(previewRow.payroll.deductions || 0)})</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    {previewRow.payroll.notes && (
                      <tr>
                        <td colSpan={2} className="py-3 px-3 italic text-slate-600 bg-slate-50 text-sm whitespace-pre-wrap rounded-md mb-2">
                          <span className="font-semibold block mb-1 not-italic text-slate-800">Catatan:</span>
                          {previewRow.payroll.notes}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t-2" style={{ borderColor: COMPANY_COLORS[previewRow.setting?.company || "Nova"] }}>
                      <td className="py-3 font-black uppercase">Total Diterima</td>
                      <td className="py-3 text-right font-black font-mono text-lg" style={{ color: COMPANY_COLORS[previewRow.setting?.company || "Nova"] }}>
                        {formatRp(calcTHP(previewRow.payroll))}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <div className="text-center mt-8 pt-4 border-t border-slate-200">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Penerima,</p>
                  <p className="font-black text-sm mt-8">{previewRow.name}</p>
                  <p className="text-[10px] text-slate-500">{previewRow.setting?.contract_position || "-"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Direct Modal to Edit Overtime Session from Payroll */}
      {editingOvertimeReq && (
        <OvertimeFinalizeModal
          isOpen={!!editingOvertimeReq}
          onClose={() => setEditingOvertimeReq(null)}
          overtime={editingOvertimeReq.request}
          baseSalary={editingOvertimeReq.baseSalary}
          onSuccess={() => {
            fetchData();
            setEditingOvertimeReq(null);
          }}
        />
      )}
    </div>
  );
}
