"use client";

import { useState, useCallback } from "react";
import { useApiQuery, useApiMutation } from "@/hooks/useApi";
import { apiFetch, withQuery } from "@/lib/api-client";
import type { AbsensiStatus } from "@/types";
import ConfirmDialog from "@/components/absensi/ConfirmDialog";
import { Search, UserMinus, UserCheck, RotateCcw, User, Settings2, X } from "lucide-react";
import ExcelJS from "exceljs";
import { toast } from "sonner";
import { parseLateMinutes } from "@/lib/utils";
import type { KpiRole } from "@/types";

/**
 * Bentuk baris staf yang dikirim /api/absensi/staff.
 *
 * formerly memakai kolom Supabase yang tidak pernah ada di schema Drizzle:
 * ttl, address_ktp, phone_wa, emergency_contact. Sekarang memakai kolom
 * ternormalisasi: birthPlace + birthDate, address, phone,
 * emergencyName + emergencyPhone.
 */
interface StaffUser {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  kpiRole: KpiRole;
  absensiRole: "staff" | "admin";
  absensiStatus: AbsensiStatus;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  leaveQuota: number;
  sickQuota: number;
  isHidden: boolean;
  leaveUsed: number;
  sickUsed: number;

  nik: string | null;
  birthPlace: string | null;
  birthDate: string | null;
  gender: string | null;
  religion: string | null;
  maritalStatus: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  npwp: string | null;

  joinDate: string | null;
  employmentStatus: string | null;
  contractEndDate: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  active:   "Staf Aktif",
  pending:  "Pendaftar Baru",
  rejected: "Akun Ditolak",
  resigned: "Staf Resign",
  deleted:  "Akun Dihapus",
};
const STATUS_TABS = Object.keys(STATUS_LABELS) as AbsensiStatus[];

type ConfirmCfg = { title: string; msg: string; type: "warning" | "danger"; onConfirm: () => Promise<void> } | null;

export default function AdminStaffPage() {
  const [statusFilter, setStatusFilter] = useState<AbsensiStatus>("active");
  const [editingProfile, setEditingProfile] = useState<StaffUser | null>(null);
  const [profileEdits, setProfileEdits] = useState<Partial<StaffUser>>({});
  const [profileTab, setProfileTab] = useState<"personal" | "roles" | "quotas">("personal");
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmCfg, setConfirmCfg] = useState<ConfirmCfg>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(() =>
    new Date().toISOString().substring(0, 7),
  );

  const [kpiUser, setKpiUser] = useState<StaffUser | null>(null);
  const [kpiWeights, setKpiWeights] = useState({
    result: 50,
    activity: 30,
    quality: 20,
    leadTim: 50,
    hr: 50,
  });
  const [globalKpiModalOpen, setGlobalKpiModalOpen] = useState(false);

  // formerly: `SELECT` seluruh tabel users + departments dari browser,
  // plus realtime channel yang memicu fetch ulang setiap perubahan.
  //
  // sekarang: server yang memfilter dan menghitung badge per status,
  // sehingga tab yang sedang tidak aktif tidak ikut ter-download.
  const buildStaff = useCallback(
    () =>
      withQuery("/api/absensi/staff", {
        status: statusFilter,
        withCounts: "1",
      }),
    [statusFilter],
  );

  const { data: staffData, isLoading, refetch: refetchStaff } = useApiQuery<{
    staff: StaffUser[];
    counts: Record<string, number> | null;
  }>(buildStaff, [statusFilter], 30_000);

  const buildDepts = useCallback(() => "/api/departments", []);
  const { data: deptData } = useApiQuery<{
    departments: { id: string; name: string }[];
  }>(buildDepts, [], 60_000);

  const users = staffData?.staff ?? [];
  const counts = staffData?.counts ?? {};
  const departments = deptData?.departments ?? [];

  const patchStaff = useApiMutation<Record<string, unknown>, unknown>(
    "/api/absensi/staff",
    "PATCH",
  );
  const putKpiWeights = useApiMutation<Record<string, unknown>, unknown>(
    "/api/kpi-settings",
    "PUT",
  );

  const [kpiSaving, setKpiSaving] = useState(false);
  const [slipLoading, setSlipLoading] = useState<string | null>(null);

  const openKpiModal = async (u: StaffUser) => {
    const tid = toast.loading("Memuat pengaturan KPI...");
    try {
      const res = await apiFetch<{
        weights: { result: number; activity: number; quality: number; leadTim: number; hr: number };
      }>(withQuery("/api/kpi-settings", { userId: u.id }));

      setKpiWeights(res.weights);
      setKpiUser(u);
      toast.dismiss(tid);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal memuat bobot KPI.",
        { id: tid },
      );
    }
  };

  const getEdit = <K extends keyof StaffUser>(key: K): StaffUser[K] =>
    (profileEdits[key] !== undefined ? profileEdits[key] : editingProfile?.[key]) as StaffUser[K];

  const patchEdit = (patch: Partial<StaffUser>) =>
    setProfileEdits((prev) => ({ ...prev, ...patch }));

  const saveProfile = async () => {
    if (!editingProfile) return;
    if (!Object.keys(profileEdits).length) {
      setEditingProfile(null);
      return;
    }

    const tid = toast.loading("Memperbarui profil...");

    const res = await patchStaff.mutate({
      id: editingProfile.id,
      ...profileEdits,
    });

    if (res.ok) {
      toast.success("Profil berhasil diperbarui.", { id: tid });
      setEditingProfile(null);
      setProfileEdits({});
      void refetchStaff();
    } else {
      toast.error(res.error ?? "Gagal memperbarui profil.", { id: tid });
    }
  };

  /**
   * Validasi bobot sebelum dikirim.
   *
   * Server juga memvalidasi (lihat PUT /api/kpi-settings), tapi slider di
   * form bisa dibiarkan di posisi tidak seimbang. Lebih baik user tahu
   * sebelum menekan Simpan.
   */
  function weightsBalanced() {
    const perf = kpiWeights.result + kpiWeights.activity + kpiWeights.quality;
    const pers = kpiWeights.leadTim + kpiWeights.hr;
    if (perf !== 100) {
      toast.error("Total bobot Performance harus tepat 100%");
      return false;
    }
    if (pers !== 100) {
      toast.error("Total bobot Personality harus tepat 100%");
      return false;
    }
    return true;
  }

  const saveKpiWeights = async () => {
    if (!kpiUser) return;
    if (!weightsBalanced()) return;

    const tid = toast.loading("Menyimpan pengaturan KPI...");
    setKpiSaving(true);

    const res = await putKpiWeights.mutate({
      userId: kpiUser.id,
      ...kpiWeights,
    });

    setKpiSaving(false);

    if (res.ok) {
      toast.success("Pengaturan KPI berhasil disimpan.", { id: tid });
      setKpiUser(null);
    } else {
      toast.error(res.error ?? "Gagal menyimpan KPI.", { id: tid });
    }
  };

  const saveGlobalKpiWeights = async () => {
    if (!weightsBalanced()) return;

    const tid = toast.loading("Menerapkan bobot global...");
    setKpiSaving(true);

    // formerly: upsert per user di browser, jadi hanya kena staf yang
    // kebetulan sedang tampil di tab aktif. Sekarang satu operasi server
    // untuk seluruh staf aktif.
    const res = await putKpiWeights.mutate({ scope: "all", ...kpiWeights });

    setKpiSaving(false);

    if (res.ok) {
      const affected = (res.data as { affected?: number } | undefined)?.affected ?? 0;
      toast.success(`Bobot global diterapkan ke ${affected} staf aktif.`, { id: tid });
      setGlobalKpiModalOpen(false);
    } else {
      toast.error(res.error ?? "Gagal menyimpan bobot global.", { id: tid });
    }
  };

  const updateStatus = (userId: string, newStatus: AbsensiStatus) => {
    const labels: Record<string, string> = {
      resigned: "Resign",
      deleted: "Hapus",
      active: "Aktif",
      rejected: "Tolak",
    };

    setConfirmCfg({
      title: `Konfirmasi ${labels[newStatus] ?? newStatus}`,
      msg: `Yakin ingin memindahkan status staf ini ke ${labels[newStatus] ?? newStatus}?`,
      type: newStatus === "deleted" ? "danger" : "warning",
      onConfirm: async () => {
        const tid = toast.loading("Memperbarui status...");

        const res = await patchStaff.mutate({ id: userId, absensiStatus: newStatus });

        if (res.ok) {
          toast.success("Status berhasil diperbarui.", { id: tid });
          void refetchStaff();
        } else {
          toast.error(res.error ?? "Gagal memperbarui status.", { id: tid });
        }

        setConfirmCfg(null);
      },
    });
  };

  const handleSlipAbsen = async (u: StaffUser) => {
    const tid = toast.loading(`Mengambil data absensi ${u.name}...`);
    setSlipLoading(u.id);

    try {
      // formerly: query attendance langsung dari browser dengan
      // rentang tanggal `YYYY-MM-01` .. `YYYY-MM-31`. Tanggal 31
      // tidak selalu ada (Februari), jadi baris terakhir bisa terlewat.
      // Server sekarang pakai batas bulan yang benar.
      const res = await apiFetch<{
        slip: Array<{
          date: string | null;
          type: string | null;
          status: string | null;
          checkIn: string | null;
          checkOut: string | null;
          lateFine: number;
          radiusPenalty: number;
          lateReasonStatus: string | null;
        }>;
      }>(
        withQuery("/api/absensi/staff", {
          slip: "1",
          userId: u.id,
          month: selectedPeriod,
        }),
      );

      const logs = res.slip;

      if (logs.length === 0) {
        toast.error(
          `Tidak ada absen untuk ${u.name} pada ${selectedPeriod}`,
          { id: tid },
        );
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Slip Absen");
      worksheet.columns = [
        { header: "Tanggal", key: "date", width: 15 },
        { header: "Tipe", key: "type", width: 10 },
        { header: "Status", key: "status", width: 15 },
        { header: "Check In", key: "checkIn", width: 12 },
        { header: "Check Out", key: "checkOut", width: 12 },
        { header: "Menit Telat", key: "lateFine", width: 15 },
        { header: "Denda Radius", key: "radiusPenalty", width: 15 },
        { header: "Status Alasan", key: "lateReasonStatus", width: 15 },
      ];

      for (const l of logs) {
        const raw = l.lateReasonStatus;
        const label =
          raw === "accepted"
            ? "Diterima"
            : raw === "rejected"
              ? "Ditolak"
              : raw === "pending"
                ? "Menunggu"
                : "-";

        worksheet.addRow({
          date: l.date ?? "-",
          type: l.type ?? "-",
          status: (l.status ?? "-").replace("_", " ").toUpperCase(),
          checkIn: l.checkIn ?? "-",
          checkOut: l.checkOut ?? "-",
          lateFine: parseLateMinutes(l.lateFine),
          radiusPenalty: l.radiusPenalty,
          lateReasonStatus: label,
        });
      }

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Slip_Absen_${u.name.replace(/\s+/g, "_")}_${selectedPeriod}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Slip absen ${u.name} berhasil diunduh`, { id: tid });
    } catch (err) {
      toast.error(
        "Gagal: " + (err instanceof Error ? err.message : "Unknown"),
        { id: tid },
      );
    } finally {
      setSlipLoading(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight">
            {STATUS_LABELS[statusFilter]}
          </h1>
          <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest italic">
            Manajemen Profil, Akses, dan Kuota Cuti
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <input
            type="month"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="ab-input text-xs w-36"
            title="Periode slip absen"
          />
          <div className="relative flex-1">
            <Search size={12} className="absolute left-3 top-3 text-[var(--ab-text-dim)]" />
            <input
              type="text"
              placeholder="Cari staf..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ab-input pl-9 text-xs w-full md:w-64"
            />
          </div>
          <button 
            onClick={() => { setKpiWeights({ result: 50, activity: 30, quality: 20, leadTim: 50, hr: 50 }); setGlobalKpiModalOpen(true); }}
            className="px-4 py-2 bg-[var(--ab-primary)] text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:scale-105 transition-transform whitespace-nowrap"
          >
            Set Bobot Global
          </button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border flex items-center gap-2"
            style={statusFilter === s ? {
              background: "var(--ab-primary)", color: "#fff",
              borderColor: "var(--ab-primary)", boxShadow: "0 4px 12px -3px var(--ab-primary-glow)",
            } : {
              background: "var(--ab-bg-surface)", color: "var(--ab-text-dim)",
              borderColor: "var(--ab-border)",
            }}
          >
            {STATUS_LABELS[s].replace("Staf ", "").replace("Pendaftar ", "").replace("Akun ", "")}
            {(counts[s] ?? 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[8px] bg-white/20">{counts[s]}</span>
            )}
          </button>
        ))}
      </div>

      {/* User Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse bg-[var(--ab-bg-surface)] p-6 rounded-3xl border border-[var(--ab-border)] h-48" />
          ))
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-20">
            <div className="w-16 h-16 bg-[var(--ab-bg-surface)] rounded-full flex items-center justify-center mx-auto mb-4 text-[var(--ab-text-dim)]">
              <User size={40} />
            </div>
            <h4 className="text-[11px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest italic">
              Tidak ada staf dalam kategori ini.
            </h4>
          </div>
        ) : (
          filtered.map((u) => (
            <div
              key={u.id}
              className="bg-[var(--ab-bg-surface)] p-6 rounded-3xl border border-[var(--ab-border)] shadow-sm hover:shadow-lg transition-all relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-inner overflow-hidden shrink-0"
                    style={{ background: "var(--ab-primary)" }}
                  >
                    {u.photoUrl ? (
                      <img src={u.photoUrl} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      u.name.substring(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-black text-[var(--ab-text-main)] text-lg tracking-tight truncate flex items-center gap-2">
                      {u.name}
                      {(() => {
                        if (!u.contractEndDate || u.employmentStatus !== "Kontrak") return null;
                        const daysLeft = Math.ceil((new Date(u.contractEndDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                        if (daysLeft <= 30 && daysLeft >= 0) {
                          return <span className="px-2 py-0.5 bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 rounded text-[8px] uppercase tracking-widest font-black animate-pulse">Kontrak H-{daysLeft}</span>;
                        }
                        if (daysLeft < 0) {
                          return <span className="px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded text-[8px] uppercase tracking-widest font-black">Kontrak Habis</span>;
                        }
                        return null;
                      })()}
                    </h4>
                    <p className="text-[9px] text-[var(--ab-text-dim)] font-bold truncate">{u.email}</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-[var(--ab-bg-main)] rounded-lg text-[8px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest border border-[var(--ab-border)]">
                  {u.id.substring(0, 6)}
                </span>
              </div>

              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-2 gap-3 text-[10px] text-[var(--ab-text-dim)]">
                  <div>
                    <span className="block font-black uppercase tracking-widest text-[8px] mb-1">Divisi</span>
                    <span className="font-bold text-[var(--ab-text-main)]">{u.departmentName ?? "-"}</span>
                  </div>
                  <div>
                    <span className="block font-black uppercase tracking-widest text-[8px] mb-1">Posisi</span>
                    <span className="font-bold text-[var(--ab-text-main)]">{u.position ?? "-"}</span>
                  </div>
                  <div>
                    <span className="block font-black uppercase tracking-widest text-[8px] mb-1">Role Absensi</span>
                    <span className="font-bold text-[var(--ab-text-main)] capitalize">{u.absensiRole}</span>
                  </div>
                  <div>
                    <span className="block font-black uppercase tracking-widest text-[8px] mb-1">Role KPI</span>
                    <span className="font-bold text-[var(--ab-text-main)] capitalize">{u.kpiRole}</span>
                  </div>
                  <div>
                    <span className="block font-black uppercase tracking-widest text-[8px] mb-1">No. WA</span>
                    <span className="font-bold text-[var(--ab-text-main)]">{u.phone ?? "-"}</span>
                  </div>
                  <div>
                    <span className="block font-black uppercase tracking-widest text-[8px] mb-1">Status Karyawan</span>
                    <span className="font-bold text-[var(--ab-text-main)]">{u.employmentStatus ?? "-"}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={() => { setEditingProfile(u); setProfileEdits({}); setProfileTab("personal"); }}
                  className="flex-1 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all text-white"
                  style={{ background: "var(--ab-text-main)" }}
                >
                  Edit Profil
                </button>
                <button
                  className="flex-1 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all text-white flex items-center justify-center gap-2 shadow-lg"
                  style={{ background: "var(--ab-primary)", boxShadow: "0 4px 12px -3px var(--ab-primary-glow)" }}
                  onClick={() => handleSlipAbsen(u)}
                  disabled={slipLoading === u.id}
                >
                  <RotateCcw size={10} /> Slip
                </button>
                <button
                  className="flex-1 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all text-[var(--ab-text-main)] flex items-center justify-center gap-2 border border-[var(--ab-border)] bg-[var(--ab-bg-main)] hover:bg-[var(--ab-border)]"
                  onClick={() => openKpiModal(u)}
                >
                  <Settings2 size={10} /> Bobot KPI
                </button>
              </div>

              {statusFilter === "active" && (
                <div className="mt-4 pt-4 border-t border-[var(--ab-border)] flex justify-between items-center">
                  <button
                    onClick={() => updateStatus(u.id, "resigned")}
                    className="text-orange-500 font-black text-[8px] uppercase tracking-widest hover:bg-orange-50 dark:hover:bg-orange-900/20 px-3 py-1.5 rounded-lg transition"
                  >Resign</button>
                  <button
                    onClick={() => updateStatus(u.id, "deleted")}
                    className="text-red-500 font-black text-[8px] uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition"
                  >Hapus</button>
                </div>
              )}
              {statusFilter === "pending" && (
                <div className="mt-4 pt-4 border-t border-[var(--ab-border)] flex gap-2">
                  <button
                    onClick={() => updateStatus(u.id, "active")}
                    className="flex-1 bg-green-500 text-white py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-green-600 flex items-center justify-center gap-2"
                  >
                    <UserCheck size={12} /> Setujui
                  </button>
                  <button
                    onClick={() => updateStatus(u.id, "rejected")}
                    className="flex-1 bg-red-100 dark:bg-red-900/20 text-red-600 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-red-200"
                  >Tolak</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmCfg}
        title={confirmCfg?.title ?? "Konfirmasi"}
        message={confirmCfg?.msg ?? ""}
        type={confirmCfg?.type ?? "warning"}
        onConfirm={confirmCfg?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmCfg(null)}
      />

      {(kpiUser || globalKpiModalOpen) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[var(--ab-bg-surface)] w-full max-w-sm rounded-[30px] border border-[var(--ab-border)] shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => { setKpiUser(null); setGlobalKpiModalOpen(false); }} className="absolute top-4 right-4 text-[var(--ab-text-dim)] hover:text-red-500">
              <X size={20} />
            </button>
            <h3 className="text-xl font-black text-[var(--ab-text-main)] uppercase tracking-tight mb-1">
              {globalKpiModalOpen ? "Bobot KPI Global" : "Bobot KPI"}
            </h3>
            <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest mb-6">
              {globalKpiModalOpen ? "Diterapkan ke seluruh staf aktif" : kpiUser?.name}
            </p>

            <div className="space-y-6">
              {/* Grup Performance 70% */}
              <div className="space-y-4">
                <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--ab-text-main)]">Grup Performance (70%)</span>
                </div>
                {[
                  { key: "result", label: "Hasil Kerja", col: "var(--ab-primary)" },
                  { key: "activity", label: "Aktivitas Harian", col: "#a855f7" },
                  { key: "quality", label: "Kualitas", col: "#f97316" },
                ].map((item) => (
                  <div key={item.key} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: item.col }}>
                        {item.label}
                      </label>
                      <span className="text-[10px] font-bold text-[var(--ab-text-dim)]">{kpiWeights[item.key as keyof typeof kpiWeights]}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={kpiWeights[item.key as keyof typeof kpiWeights]}
                      onChange={(e) => setKpiWeights({ ...kpiWeights, [item.key]: parseInt(e.target.value) })}
                      className="w-full accent-[var(--ab-primary)] h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                ))}
                <p className="text-[9px] font-black uppercase tracking-widest text-right">
                  Sub-Total: <span className={kpiWeights.result + kpiWeights.activity + kpiWeights.quality === 100 ? "text-green-500" : "text-rose-500"}>
                    {kpiWeights.result + kpiWeights.activity + kpiWeights.quality}%
                  </span>
                </p>
              </div>

              {/* Grup Personality 30% */}
              <div className="space-y-4 border-t border-[var(--ab-border)] pt-4">
                <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--ab-text-main)]">Grup Personality (30%)</span>
                </div>
                {[
                  { key: "leadTim", label: "Lead Tim", col: "#3b82f6" },
                  { key: "hr", label: "HR", col: "#10b981" },
                ].map((item) => (
                  <div key={item.key} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: item.col }}>
                        {item.label}
                      </label>
                      <span className="text-[10px] font-bold text-[var(--ab-text-dim)]">{kpiWeights[item.key as keyof typeof kpiWeights]}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={kpiWeights[item.key as keyof typeof kpiWeights]}
                      onChange={(e) => setKpiWeights({ ...kpiWeights, [item.key]: parseInt(e.target.value) })}
                      className="w-full accent-[var(--ab-primary)] h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                ))}
                <p className="text-[9px] font-black uppercase tracking-widest text-right">
                  Sub-Total: <span className={kpiWeights.leadTim + kpiWeights.hr === 100 ? "text-green-500" : "text-rose-500"}>
                    {kpiWeights.leadTim + kpiWeights.hr}%
                  </span>
                </p>
              </div>
              
              <div className="pt-4 border-t border-[var(--ab-border)] flex justify-end mt-6">
                <button
                  onClick={globalKpiModalOpen ? saveGlobalKpiWeights : saveKpiWeights}
                  disabled={kpiSaving || (kpiWeights.result + kpiWeights.activity + kpiWeights.quality !== 100) || (kpiWeights.leadTim + kpiWeights.hr !== 100)}
                  className="bg-[var(--ab-text-main)] text-[var(--ab-bg-main)] px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Profile Edit Modal */}
      {editingProfile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[var(--ab-bg-surface)] w-full max-w-2xl max-h-[90vh] rounded-[30px] border border-[var(--ab-border)] shadow-2xl flex flex-col relative overflow-hidden">
            
            {/* Header */}
            <div className="p-6 border-b border-[var(--ab-border)] flex justify-between items-center bg-[var(--ab-bg-main)]">
              <div>
                <h3 className="text-xl font-black text-[var(--ab-text-main)] uppercase tracking-tight">Edit Profil Karyawan</h3>
                <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest mt-1">ID: {editingProfile.id.substring(0, 8)}</p>
              </div>
              <button onClick={() => { setEditingProfile(null); setProfileEdits({}); }} className="text-[var(--ab-text-dim)] hover:text-rose-500 bg-[var(--ab-bg-surface)] p-2 rounded-full border border-[var(--ab-border)]">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-4 border-b border-[var(--ab-border)] overflow-x-auto bg-[var(--ab-bg-surface)]">
              {[
                { id: "personal", label: "Informasi Pribadi" },
                { id: "roles", label: "Pekerjaan & Divisi" },
                { id: "quotas", label: "Kuota & Pengaturan" }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setProfileTab(tab.id as any)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${profileTab === tab.id ? 'bg-[var(--ab-primary)] text-white border-[var(--ab-primary)] shadow-[0_4px_12px_-3px_var(--ab-primary-glow)]' : 'bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] border-[var(--ab-border)] hover:bg-[var(--ab-border)]'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {profileTab === "personal" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Nama Lengkap</label>
                    <input type="text" value={getEdit("name")} onChange={e => patchEdit({ name: e.target.value })} className="ab-input text-xs w-full" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Email</label>
                    <input type="email" value={getEdit("email")} onChange={e => patchEdit({ email: e.target.value })} className="ab-input text-xs w-full" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Agama</label>
                    <select value={getEdit("religion") ?? ""} onChange={e => patchEdit({ religion: e.target.value })} className="ab-input text-xs w-full bg-white dark:bg-slate-900 appearance-none">
                      <option value="">Pilih Agama</option>
                      <option value="Islam">Islam</option>
                      <option value="Kristen">Kristen</option>
                      <option value="Katolik">Katolik</option>
                      <option value="Hindu">Hindu</option>
                      <option value="Buddha">Buddha</option>
                      <option value="Konghucu">Konghucu</option>
                      <option value="Lainnya">Lainnya</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">NIK Karyawan</label>
                    <input type="text" value={getEdit("nik") ?? ""} onChange={e => patchEdit({ nik: e.target.value })} className="ab-input text-xs w-full" placeholder="Cth: 3201..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">NPWP</label>
                    <input type="text" value={getEdit("npwp") ?? ""} onChange={e => patchEdit({ npwp: e.target.value })} className="ab-input text-xs w-full" placeholder="Cth: 12.345.678.9-123.000" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Tempat Lahir</label>
                    <input type="text" value={getEdit("birthPlace") ?? ""} onChange={e => patchEdit({ birthPlace: e.target.value })} className="ab-input text-xs w-full" placeholder="Jakarta" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Tanggal Lahir</label>
                    <input type="date" value={getEdit("birthDate") ?? ""} onChange={e => patchEdit({ birthDate: e.target.value })} className="ab-input text-xs w-full" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">No. WhatsApp</label>
                    <input type="text" value={getEdit("phone") ?? ""} onChange={e => patchEdit({ phone: e.target.value })} className="ab-input text-xs w-full" placeholder="08123456789" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Status Kawin</label>
                    <select value={getEdit("maritalStatus") ?? ""} onChange={e => patchEdit({ maritalStatus: e.target.value })} className="ab-input text-xs w-full bg-white dark:bg-slate-900 appearance-none">
                      <option value="">Pilih Status</option>
                      {["Belum Menikah", "Menikah", "Cerai Hidup", "Cerai Mati"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Nama Kontak Darurat</label>
                    <input type="text" value={getEdit("emergencyName") ?? ""} onChange={e => patchEdit({ emergencyName: e.target.value })} className="ab-input text-xs w-full" placeholder="Nama Lengkap" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">No. Kontak Darurat</label>
                    <input type="text" value={getEdit("emergencyPhone") ?? ""} onChange={e => patchEdit({ emergencyPhone: e.target.value })} className="ab-input text-xs w-full" placeholder="08123456789" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Kota</label>
                    <input type="text" value={getEdit("city") ?? ""} onChange={e => patchEdit({ city: e.target.value })} className="ab-input text-xs w-full" placeholder="Jakarta Selatan" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Provinsi</label>
                    <input type="text" value={getEdit("province") ?? ""} onChange={e => patchEdit({ province: e.target.value })} className="ab-input text-xs w-full" placeholder="DKI Jakarta" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Kode Pos</label>
                    <input type="text" value={getEdit("postalCode") ?? ""} onChange={e => patchEdit({ postalCode: e.target.value })} className="ab-input text-xs w-full" placeholder="12345" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Alamat KTP</label>
                    <textarea value={getEdit("address") ?? ""} onChange={e => patchEdit({ address: e.target.value })} className="ab-input text-xs w-full h-20 resize-none py-3" placeholder="Alamat lengkap sesuai KTP" />
                  </div>
                </div>
              )}

              {profileTab === "roles" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Divisi / Penempatan</label>
                    <select value={getEdit("departmentId") ?? ""} onChange={e => patchEdit({ departmentId: e.target.value || null })} className="ab-input text-xs w-full">
                      <option value="">-- Belum ada Divisi --</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Posisi / Jabatan</label>
                    <input type="text" value={getEdit("position") ?? ""} onChange={e => patchEdit({ position: e.target.value })} className="ab-input text-xs w-full" placeholder="Cth: Frontend Dev" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Role Aplikasi (Absensi)</label>
                    <select value={getEdit("absensiRole")} onChange={e => patchEdit({ absensiRole: e.target.value as "staff" | "admin" })} className="ab-input text-xs w-full">
                      <option value="staff">Staff Biasa</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Role Penilaian (KPI)</label>
                    <select value={getEdit("kpiRole")} onChange={e => patchEdit({ kpiRole: e.target.value as KpiRole })} className="ab-input text-xs w-full">
                      <option value="tim">Anggota Tim</option>
                      <option value="head">Head Divisi</option>
                      <option value="hr">HRD</option>
                      <option value="executive">Executive (CEO/Direktur)</option>
                      <option value="developer">Developer</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Status Kepegawaian</label>
                    <select value={getEdit("employmentStatus") ?? ""} onChange={e => patchEdit({ employmentStatus: e.target.value })} className="ab-input text-xs w-full">
                      <option value="">-- Pilih Status --</option>
                      <option value="Tetap">Karyawan Tetap (PKWTT)</option>
                      <option value="Kontrak">Kontrak (PKWT)</option>
                      <option value="Probation">Probation</option>
                      <option value="Freelance">Freelance / Magang</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Tgl. Mulai Bekerja (Join Date)</label>
                    <input type="date" value={getEdit("joinDate") ?? ""} onChange={e => patchEdit({ joinDate: e.target.value })} className="ab-input text-xs w-full" />
                  </div>
                  {getEdit("employmentStatus") === "Kontrak" && (
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1">Tgl. Berakhir Kontrak</label>
                      <input type="date" value={getEdit("contractEndDate") ?? ""} onChange={e => patchEdit({ contractEndDate: e.target.value })} className="ab-input text-xs w-full text-orange-500" />
                    </div>
                  )}
                </div>
              )}

              {profileTab === "quotas" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1 text-[var(--ab-primary)]">Kuota Cuti Tahunan</label>
                      <input type="number" value={getEdit("leaveQuota")} onChange={e => patchEdit({ leaveQuota: parseInt(e.target.value) || 0 })} className="ab-input text-lg font-black text-center py-4 w-full text-[var(--ab-primary)]" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest ml-1 text-rose-500">Kuota Sakit Tahunan</label>
                      <input type="number" value={getEdit("sickQuota")} onChange={e => patchEdit({ sickQuota: parseInt(e.target.value) || 0 })} className="ab-input text-lg font-black text-center py-4 w-full text-rose-500" />
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-[var(--ab-bg-main)] border border-[var(--ab-border)] flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-[var(--ab-text-main)] mb-1">Sembunyikan Akun (Ghost Mode)</h4>
                      <p className="text-[10px] text-[var(--ab-text-dim)]">Akun ini tidak akan muncul di laporan dan dashboard, tapi datanya tetap ada.</p>
                    </div>
                    <button
                      onClick={() => patchEdit({ isHidden: !getEdit("isHidden") })}
                      className="w-12 h-12 rounded-xl flex items-center justify-center cursor-pointer transition-all border shrink-0"
                      style={getEdit("isHidden") ? {
                        background: "#a855f715", borderColor: "#a855f740", color: "#a855f7",
                      } : {
                        background: "var(--ab-bg-surface)", borderColor: "var(--ab-border)", color: "var(--ab-text-dim)",
                      }}
                    >
                      <UserMinus size={20} className={getEdit("isHidden") ? "animate-pulse" : ""} />
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Footer Action */}
            <div className="p-4 border-t border-[var(--ab-border)] flex justify-end gap-3 bg-[var(--ab-bg-surface)]">
              <button 
                onClick={() => { setEditingProfile(null); setProfileEdits({}); }}
                className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--ab-text-dim)] hover:bg-[var(--ab-bg-main)] transition"
              >
                Batal
              </button>
              <button
                onClick={saveProfile}
                disabled={!Object.keys(profileEdits).length}
                className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 text-white shadow-[0_4px_12px_-3px_var(--ab-primary-glow)] disabled:shadow-none bg-[var(--ab-primary)] hover:scale-105 disabled:hover:scale-100"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
