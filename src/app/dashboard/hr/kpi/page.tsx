"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useKpis, useKpisIncludingTrash } from "@/hooks/useKpis";
import { useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber, formatCurrency, formatPercentage, getBrandColor } from "@/lib/utils";
import type { KPI } from "@/types";
import { Plus, Pencil, Trash2, RotateCcw, CheckCircle, PauseCircle, Archive, Search, XCircle, CheckCircle2, FileEdit } from "lucide-react";

const statusLabel: Record<string, string> = {
  draft: "Draft",
  active: "Aktif",
  adjusted: "Adjusted",
  hold: "Hold",
  cancelled: "Dibatalkan",
  completed: "Selesai",
  archived: "Arsip",
};

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  active: "default",
  hold: "outline",
  cancelled: "destructive",
  completed: "secondary",
  archived: "outline",
};

const StatusBadge = ({ status }: { status: string }) => {
  const variant = statusVariant[status] ?? "outline";
  const label = statusLabel[status] ?? status;
  
  return (
    <Badge variant={variant} className="text-xs">
      {status === "active" && <span className="mr-1.5 flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
      {status === "hold" && <PauseCircle className="mr-1 h-3 w-3" />}
      {status === "cancelled" && <XCircle className="mr-1 h-3 w-3" />}
      {status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
      {status === "draft" && <FileEdit className="mr-1 h-3 w-3" />}
      {status === "archived" && <Archive className="mr-1 h-3 w-3" />}
      {label}
    </Badge>
  );
};

const typeLabel: Record<string, string> = { result: "Result", activity: "Activity", quality: "Quality", lead_tim: "Lead Tim", hr: "HR" };
const typeColor: Record<string, string> = {
  result: "text-blue-600 bg-blue-50",
  activity: "text-amber-600 bg-amber-50",
  quality: "text-purple-600 bg-purple-50",
  lead_tim: "text-sky-600 bg-sky-50",
  hr: "text-emerald-600 bg-emerald-50",
};

function formatTarget(kpi: KPI): string {
  if (kpi.unit === "currency") return formatCurrency(kpi.monthlyTarget);
  if (kpi.unit === "percentage") return formatPercentage(kpi.monthlyTarget);
  return formatNumber(kpi.monthlyTarget);
}

function daysAgo(deletedAt: unknown): number {
  if (!deletedAt) return 0;
  return Math.floor((Date.now() - new Date(deletedAt as string).getTime()) / 86400000);
}

export default function HrKpiPage() {
  const router = useRouter();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [copying, setCopying] = useState(false);
  const year = parseInt(selectedMonth.split("-")[0]);
  const month = parseInt(selectedMonth.split("-")[1]);

  /**
   * Tab "Sampah" butuh KPI yang `deleted_at`-nya terisi, jadi halaman ini
   * memang harus meminta `includeTrash=1` sejak awal.
   *
   * formerly `useKpis()` hanya mengembalikan KPI yang belum di-trash,
   * sementara `trashedKpis` dihitung dari `kpis.filter(k => k.deletedAt)`.
   * Padrannya tidak pernah menghasilkan apa pun — tab Sampah selalu
   * kosong dan Restoration/Hapus Permanen tidak pernah bisa dipakai.
   */
  const { kpis, isLoading, refresh } = useKpisIncludingTrash(year, month);

  const patchKpis = useApiMutation<Record<string, unknown>, unknown>(
    "/api/kpis",
    "PATCH",
  );
  const postKpis = useApiMutation<Record<string, unknown>, unknown>(
    "/api/kpis",
    "POST",
  );
  /** Hapus permanen butuh DELETE, yang tidak ada di useApiMutation. */
  const deleteKpis = async (ids: string[]) => {
    const res = await fetch(
      withQuery("/api/kpis", { ids: ids.join(",") }),
      { method: "DELETE", credentials: "include" },
    );
    const envelope = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; data?: unknown }
      | null;
    if (!res.ok) {
      return { ok: false as const, error: envelope?.error ?? "Gagal menghapus." };
    }
    return { ok: true as const, data: envelope?.data };
  };

  const [tab, setTab] = useState<"list" | "trash">("list");
  const [selectedKpis, setSelectedKpis] = useState<Set<string>>(new Set());
  const [trashSelected, setTrashSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ kpis: KPI[]; assignmentCount: number } | null>(null);
  const [confirmPermanent, setConfirmPermanent] = useState<KPI | null>(null);
  const [confirmBulkPermanent, setConfirmBulkPermanent] = useState(false);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const activeKpis = useMemo(() => {
    let list = kpis.filter((k) => !k.deletedAt);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((k) => k.title.toLowerCase().includes(q) || k.department.toLowerCase().includes(q));
    }
    if (filterType !== "all") list = list.filter((k) => k.type === filterType);
    if (filterStatus !== "all") list = list.filter((k) => k.status === filterStatus);
    return list;
  }, [kpis, search, filterType, filterStatus]);

  const trashedKpis = useMemo(() => kpis.filter((k) => !!k.deletedAt), [kpis]);

  /**
   * formerly `supabase.from("kpis").update({ status })` dari browser —
   * tanpa cek pemilik, tanpa cek hasilnya. Gagalnya tidak pernah
   * dilaporkan ke user: `try/finally` tanpa `catch` menelan semuanya.
   */
  async function setStatus(kpiId: string, status: string) {
    setStatusLoading(kpiId);
    setDeleteError("");
    const res = await patchKpis.mutate({ id: kpiId, status });
    setStatusLoading(null);

    if (res.ok) {
      void refresh();
    } else {
      setDeleteError(res.error ?? "Gagal mengubah status KPI.");
    }
  }

  /**
   * formerly `kpis.update({ hide_actual })` dari browser, tanpa cek.
   * Toast "berhasil" muncul bahkan kalau Error-nya ada — `catch` di
   * handler lama hanya menangkap error yang benar-benar dilempar,
   * sedangkan stub tidak pernah melempar apa pun.
   */
  async function toggleHideActual(kpiId: string, hideActual: boolean) {
    setStatusLoading(kpiId);
    setDeleteError("");
    const res = await patchKpis.mutate({ id: kpiId, hideActual });
    setStatusLoading(null);

    if (res.ok) {
      toast.success(
        hideActual ? "Angka aktual disembunyikan" : "Angka aktual ditampilkan",
      );
      void refresh();
    } else {
      setDeleteError(res.error ?? "Gagal menyimpan pengaturan.");
    }
  }

  /**
   * formerly menghitung penugasan aktif dengan satu request per KPI,
   * beruntun dari browser. Kalau 20 KPI dipilih, dialog baru muncul
   * setelah 20 request. Dan kalau salah satunya gagal, jumlahnya tetap
   * dijumlahkan — user melihat angka yang lebih kecil dari kenyataan
   * tanpa ada yang memberitahu.
   */
  async function handleSoftDelete(kpisToDelete: KPI[]) {
    setDeleteError("");

    const res = await fetch(
      withQuery("/api/assignments", {
        kpiIds: kpisToDelete.map((k) => k.id).join(","),
      }),
      { credentials: "include", cache: "no-store" },
    );
    const envelope = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; data?: { count?: number } }
      | null;

    if (!res.ok || typeof envelope?.data?.count !== "number") {
      setDeleteError(
        envelope?.error ?? "Gagal menghitung penugasan. Coba lagi.",
      );
      return;
    }

    setConfirmDelete({
      kpis: kpisToDelete,
      assignmentCount: envelope.data.count,
    });
  }

  /**
   * formerly `for` biasa: cancel assignment per KPI lalu set deleted_at
   * per KPI, semuanya dari browser tanpa cek hasil. Kalau request
   * ketujuh gagal, enam KPI pertama sudah terlanjur dihapus — dan UI
   * tetap menampilkan "7 KPI berhasil dipindahkan ke sampah".
   *
   * sekarang satu request; server melaporkan berapa yang benar-benar
   * terpengaruh.
   */
  async function executeSoftDelete() {
    if (!confirmDelete) return;
    const { kpis: kpisToDelete } = confirmDelete;
    setStatusLoading("bulk-delete");
    setDeleteError("");

    const res = await patchKpis.mutate({
      ids: kpisToDelete.map((k) => k.id),
      action: "soft-delete",
    });
    setStatusLoading(null);

    if (!res.ok) {
      setDeleteError(res.error ?? "Gagal memindahkan KPI ke sampah.");
      return;
    }

    const done = (res.data as { kpis?: number } | undefined)?.kpis ?? 0;
    const cancelled =
      (res.data as { cancelledAssignments?: number } | undefined)
        ?.cancelledAssignments ?? 0;

    if (done !== kpisToDelete.length) {
      setDeleteError(
        `${done} dari ${kpisToDelete.length} KPI dipindahkan. Sisanya tidak berubah — buka tab Sampah untuk memastikan.`,
      );
    }

    toast.success(
      `${done} KPI dipindahkan ke sampah` +
        (cancelled > 0 ? `, ${cancelled} penugasan dibatalkan` : ""),
    );

    setSelectedKpis(new Set());
    setConfirmDelete(null);
    void refresh();
  }

  function toggleSelectKpi(id: string) {
    const newSet = new Set(selectedKpis);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedKpis(newSet);
  }

  function toggleSelectAll() {
    if (selectedKpis.size === activeKpis.length && activeKpis.length > 0) {
      setSelectedKpis(new Set());
    } else {
      setSelectedKpis(new Set(activeKpis.map(k => k.id)));
    }
  }

  /**
   * formerly dua update dari browser: assignment `cancelled` -> `active`,
   * lalu `deleted_at` -> null.
   *
   * Versi server awalnya hanya melakukan yang kedua. Akibatnya KPI-nya
   * muncul kembali dengan NOL penugasan — tidak ada yang bisa mengisinya,
   * dan tidak ada yang bisa melihat bahwa ada yang salah. Restore harus
   * menghidupkan penugasannya lagi; hanya yang berstatus `cancelled`,
   * yang `completed` tetap `completed` supaya skor final tidak berubah.
   */
  async function handleRestore(kpi: KPI) {
    setStatusLoading(kpi.id);
    setDeleteError("");
    const res = await patchKpis.mutate({ id: kpi.id, action: "restore" });
    setStatusLoading(null);

    if (!res.ok) {
      setDeleteError(res.error ?? "Gagal memulihkan KPI.");
      return;
    }

    const restored =
      (res.data as { restoredAssignments?: number } | undefined)
        ?.restoredAssignments ?? 0;

    toast.success(
      restored > 0
        ? `KPI dipulihkan, ${restored} penugasan diaktifkan kembali`
        : "KPI berhasil dipulihkan",
    );
    void refresh();
  }

  async function handleBulkRestore() {
    const ids = [...trashSelected];
    if (ids.length === 0) return;

    setStatusLoading("bulk-restore");
    setDeleteError("");
    const res = await patchKpis.mutate({ ids, action: "restore" });
    setStatusLoading(null);

    if (!res.ok) {
      setDeleteError(res.error ?? "Gagal memulihkan KPI.");
      return;
    }

    const done = (res.data as { kpis?: number } | undefined)?.kpis ?? 0;
    const restored =
      (res.data as { restoredAssignments?: number } | undefined)
        ?.restoredAssignments ?? 0;

    if (done !== ids.length) {
      setDeleteError(
        `${done} dari ${ids.length} KPI dipulihkan. Sisanya tidak berubah.`,
      );
    }
    toast.success(
      `${done} KPI dipulihkan` +
        (restored > 0 ? `, ${restored} penugasan diaktifkan kembali` : ""),
    );
    setTrashSelected(new Set());
    void refresh();
  }

  async function handlePermanentDelete(kpi: KPI) {
    setStatusLoading(kpi.id);
    setDeleteError("");
    const res = await deleteKpis([kpi.id]);
    setStatusLoading(null);

    if (!res.ok) {
      setDeleteError(res.error ?? "Gagal menghapus KPI.");
      return;
    }
    toast.success("KPI berhasil dihapus permanen");
    setConfirmPermanent(null);
    void refresh();
  }

  /**
   * formerly menghapus tiga tabel dari browser secara berurutan
   * (`daily_reports` -> `kpi_assignments` -> `kpis`). Kalau langkah
   * pertama gagal, yang tersisa adalah baris laporan tanpa KPI induknya.
   *
   * sekarang satu delete; anak-anaknya ikut terhapus lewat
   * `ON DELETE CASCADE`. Server juga menolak KPI yang belum di-trash —
   * penghapusan permanen tidak bisa dibatalkan, jadi harus lewat Sampah.
   */
  async function handleBulkPermanentDelete() {
    const ids = [...trashSelected];
    if (ids.length === 0) return;

    setStatusLoading("bulk-perm-delete");
    setDeleteError("");
    const res = await deleteKpis(ids);
    setStatusLoading(null);

    if (!res.ok) {
      setDeleteError(res.error ?? "Gagal menghapus KPI.");
      return;
    }

    const { deleted = [], skipped = [] } = (res.data ?? {}) as {
      deleted?: string[];
      skipped?: string[];
    };

    if (skipped.length > 0) {
      setDeleteError(
        `${skipped.length} KPI tidak ada di Sampah, jadi tidak dihapus. Hapus permanen hanya untuk isi Sampah.`,
      );
    }
    toast.success(`${deleted.length} KPI dihapus permanen`);
    setTrashSelected(new Set());
    setConfirmBulkPermanent(false);
    void refresh();
  }

  function toggleTrashItem(id: string) {
    const next = new Set(trashSelected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setTrashSelected(next);
  }

  function toggleTrashAll() {
    if (trashSelected.size === trashedKpis.length && trashedKpis.length > 0) {
      setTrashSelected(new Set());
    } else {
      setTrashSelected(new Set(trashedKpis.map((k) => k.id)));
    }
  }

  /**
   * formerly membaca semua KPI bulan lalu lalu `insert` sekali dari
 * browser. Yang jadi acuan "sudah ada atau belum" adalah
 * `k.title + "|" + k.department` — tapi baris Supabase tidak punya kolom
 * `department` (yang ada `department_id`), jadi kuncinya selalu berakhir
 * `"judul|undefined"` untuk kedua sisi dan yang dibandingkan cuma
 * judulnya. KPI dengan judul sama di divisi berbeda tetap ikut tersalin.
 *
 * sekarang server yang menentukan; bulan sebelumnya juga dihitung
 * server supaya tidak bergantung pada jam lokal browser.
 */
  async function handleCopyFromLastMonth() {
    setCopying(true);
    setDeleteError("");
    const res = await postKpis.mutate({ action: "copy-from-month", year, month });
    setCopying(false);

    if (!res.ok) {
      setDeleteError(res.error ?? "Gagal menyalin KPI.");
      return;
    }

    const { copied = 0, skipped = 0, from } = (res.data ?? {}) as {
      copied?: number;
      skipped?: number;
      from?: string;
    };

    if (copied === 0 && skipped === 0) {
      toast.error(`Tidak ada KPI di bulan sebelumnya (${from ?? "-"}).`);
      return;
    }
    if (copied === 0) {
      toast.info("Semua KPI dari bulan sebelumnya sudah ada di bulan ini.");
      return;
    }

    toast.success(
      `${copied} KPI disalin sebagai Draft dari bulan sebelumnya` +
        (skipped > 0 ? ` (${skipped} dilewati karena sudah ada)` : "") + ".",
    );
    void refresh();
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-5 w-40 bg-slate-200 rounded" />
            <div className="h-3 w-24 bg-slate-200 rounded" />
          </div>
          <div className="h-9 w-24 bg-slate-200 rounded-md" />
        </div>
        <div className="h-10 w-48 bg-slate-200 rounded-md" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 w-full bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const isReadOnly = (k: KPI) => ["archived", "cancelled", "completed"].includes(k.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Manajemen KPI</h2>
          <p className="text-sm text-muted-foreground">{activeKpis.length} KPI — {year}/{String(month).padStart(2, "0")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyFromLastMonth}
            disabled={copying}
            title="Salin KPI dari bulan sebelumnya sebagai Draft"
          >
            {copying ? "Menyalin..." : "Copy dari Bulan Lalu"}
          </Button>
          <Button size="sm" onClick={() => router.push("/dashboard/hr/kpi/new")}>
            <Plus className="h-4 w-4" />
            Buat KPI
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setTab("list")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === "list" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          KPI Bulan Ini
        </button>
        <button
          onClick={() => setTab("trash")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === "trash" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Sampah
          {trashedKpis.length > 0 && (
            <span className="rounded-full bg-destructive/20 text-destructive text-xs px-1.5">{trashedKpis.length}</span>
          )}
        </button>
      </div>

      {deleteError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {deleteError}
          <button onClick={() => setDeleteError("")} className="ml-2 underline text-xs">Tutup</button>
        </div>
      )}

      {tab === "list" && (
        <>
          {/* Search + Filter */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Cari judul atau departemen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 text-sm w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tipe</SelectItem>
                <SelectItem value="result">Result</SelectItem>
                <SelectItem value="activity">Activity</SelectItem>
                <SelectItem value="quality">Quality</SelectItem>
                <SelectItem value="lead_tim">Lead Tim</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-sm w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="archived">Arsip</SelectItem>
              </SelectContent>
            </Select>

            {selectedKpis.size > 0 && (
              <Button 
                variant="destructive" 
                size="sm" 
                className="h-8 ml-auto"
                onClick={() => handleSoftDelete(activeKpis.filter(k => selectedKpis.has(k.id)))}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Hapus ({selectedKpis.size})
              </Button>
            )}
          </div>

          {/* Select All Row */}
          {activeKpis.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <input 
                type="checkbox" 
                className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer"
                checked={selectedKpis.size === activeKpis.length && activeKpis.length > 0}
                onChange={toggleSelectAll}
              />
              <span className="text-xs text-muted-foreground font-medium cursor-pointer" onClick={toggleSelectAll}>
                Pilih Semua
              </span>
            </div>
          )}

          {/* KPI List */}
          {activeKpis.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground">
                {kpis.filter((k) => !k.deletedAt).length === 0 ? "Belum ada KPI bulan ini" : "Tidak ada hasil yang cocok"}
              </p>
              {kpis.filter((k) => !k.deletedAt).length === 0 && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => router.push("/dashboard/hr/kpi/new")}>
                  Buat KPI pertama
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {activeKpis.map((k) => (
                <div key={k.id} className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer"
                        checked={selectedKpis.has(k.id)}
                        onChange={() => toggleSelectKpi(k.id)}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{k.title || <span className="text-muted-foreground italic">Tanpa judul</span>}</p>
                        <StatusBadge status={k.status} />
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeColor[k.type] ?? ""}`}>
                          {typeLabel[k.type] ?? k.type}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${getBrandColor(k.brand)}`}>
                          {k.brand || "Umum"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {k.department} · Target: {formatTarget(k)}
                      </p>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!isReadOnly(k) && (
                        <label className="relative inline-flex items-center cursor-pointer mr-3" title="Sembunyikan Angka Aktual dari Staf">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={!!k.hideActual}
                            onChange={(e) => toggleHideActual(k.id, e.target.checked)}
                            disabled={statusLoading === k.id}
                          />
                          <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[var(--ab-primary)]"></div>
                          <span className="ml-2 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">Hide Aktual</span>
                        </label>
                      )}
                      {!isReadOnly(k) && (
                        <button
                          onClick={() => router.push(`/dashboard/hr/kpi/edit?id=${k.id}`)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Edit KPI"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleSoftDelete([k])}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Pindah ke sampah"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Status action buttons */}
                  {!isReadOnly(k) && (
                    <div className="flex gap-1.5 flex-wrap ml-7">
                      {k.status === "draft" && (
                        <button
                          onClick={() => setStatus(k.id, "active")}
                          disabled={statusLoading === k.id}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 disabled:opacity-50 border border-green-200"
                        >
                          <CheckCircle className="h-3 w-3" /> Aktifkan
                        </button>
                      )}
                      {k.status === "active" && (
                        <>
                          <button
                            onClick={() => setStatus(k.id, "hold")}
                            disabled={statusLoading === k.id}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 disabled:opacity-50 border border-amber-200"
                          >
                            <PauseCircle className="h-3 w-3" /> Hold
                          </button>
                          <button
                            onClick={() => setStatus(k.id, "archived")}
                            disabled={statusLoading === k.id}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50 border border-border"
                          >
                            <Archive className="h-3 w-3" /> Arsipkan
                          </button>
                        </>
                      )}
                      {k.status === "hold" && (
                        <>
                          <button
                            onClick={() => setStatus(k.id, "active")}
                            disabled={statusLoading === k.id}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 disabled:opacity-50 border border-green-200"
                          >
                            <CheckCircle className="h-3 w-3" /> Aktifkan
                          </button>
                          <button
                            onClick={() => setStatus(k.id, "archived")}
                            disabled={statusLoading === k.id}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50 border border-border"
                          >
                            <Archive className="h-3 w-3" /> Arsipkan
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "trash" && (
        <div className="space-y-3">
          {trashedKpis.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border">
              <p className="text-sm text-muted-foreground">Sampah kosong</p>
            </div>
          ) : (
            <>
              {/* Toolbar: Select All + Bulk Actions */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={trashSelected.size === trashedKpis.length && trashedKpis.length > 0}
                    onChange={toggleTrashAll}
                    className="h-4 w-4 rounded border-slate-300 accent-primary cursor-pointer"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    {trashSelected.size === 0
                      ? `${trashedKpis.length} item di sampah`
                      : `${trashSelected.size} dari ${trashedKpis.length} dipilih`}
                  </span>
                </label>
                {trashSelected.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-600 border-green-200 hover:bg-green-50 h-8 text-xs"
                      disabled={statusLoading === "bulk-restore"}
                      onClick={handleBulkRestore}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Pulihkan ({trashSelected.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 text-xs"
                      disabled={statusLoading === "bulk-perm-delete"}
                      onClick={() => setConfirmBulkPermanent(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Hapus Permanen ({trashSelected.size})
                    </Button>
                  </div>
                )}
              </div>

              {/* Trash Items */}
              {trashedKpis.map((k) => {
                const days = k.deletedAt ? daysAgo(k.deletedAt) : 0;
                const remaining = Math.max(30 - days, 0);
                const isSelected = trashSelected.has(k.id);
                return (
                  <div
                    key={k.id}
                    className={`rounded-xl border bg-card px-4 py-3 transition-colors cursor-pointer ${
                      isSelected ? "border-primary/50 bg-primary/5" : "border-border"
                    }`}
                    onClick={() => toggleTrashItem(k.id)}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTrashItem(k.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-slate-300 accent-primary cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-muted-foreground line-through truncate">
                          {k.title || "Tanpa judul"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {k.department} · Dihapus {days} hari lalu · auto-delete dalam {remaining} hari
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleRestore(k)}
                          disabled={!!statusLoading}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-green-600 hover:bg-green-50 disabled:opacity-50"
                          title="Pulihkan"
                        >
                          <RotateCcw className="h-3 w-3" /> Pulihkan
                        </button>
                        <button
                          onClick={() => setConfirmPermanent(k)}
                          disabled={!!statusLoading}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" /> Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Soft delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pindah ke Sampah?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            {confirmDelete?.kpis.length === 1 ? (
              <p>
                KPI <span className="font-medium text-foreground">"{confirmDelete.kpis[0].title}"</span> akan dipindah ke sampah.
                Bisa dipulihkan dalam 30 hari sebelum dihapus permanen.
              </p>
            ) : (
              <p>
                <span className="font-medium text-foreground">{confirmDelete?.kpis.length} KPI</span> terpilih akan dipindah ke sampah.
                Bisa dipulihkan dalam 30 hari sebelum dihapus permanen.
              </p>
            )}
            {(confirmDelete?.assignmentCount ?? 0) > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                <strong>{confirmDelete!.assignmentCount} penugasan</strong> aktif/hold akan ikut dibatalkan.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={executeSoftDelete}
              disabled={statusLoading === "bulk-delete"}
            >
              {(confirmDelete?.assignmentCount ?? 0) > 0 ? "Batalkan Penugasan & Hapus" : "Pindah ke Sampah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation (single) */}
      <Dialog open={!!confirmPermanent} onOpenChange={(o) => !o && setConfirmPermanent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Hapus Permanen Sepenuhnya?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              KPI <span className="font-bold text-foreground">"{confirmPermanent?.title}"</span> akan dihapus.
            </p>
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 font-medium">
              <p>PERINGATAN KERAS! Data berikut akan LENYAP:</p>
              <ul className="list-disc list-inside mt-1 ml-1 space-y-0.5 text-xs">
                <li>Master data KPI</li>
                <li>Seluruh <b>Penugasan (Assignments)</b> staf</li>
                <li>Seluruh <b>Laporan Harian (Daily Reports)</b> staf</li>
                <li>Perhitungan poin/skor terkait KPI ini</li>
              </ul>
            </div>
            <p className="font-semibold text-destructive">Tindakan ini mutlak tidak dapat dibatalkan.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPermanent(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => confirmPermanent && handlePermanentDelete(confirmPermanent)}>
              Hapus Permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation (bulk) */}
      <Dialog open={confirmBulkPermanent} onOpenChange={(o) => !o && setConfirmBulkPermanent(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Hapus {trashSelected.size} KPI Secara Permanen?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <span className="font-bold text-foreground">{trashSelected.size} KPI</span> yang dipilih akan dihapus.
            </p>
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 font-medium">
              <p>PERINGATAN KERAS! Data berikut akan LENYAP:</p>
              <ul className="list-disc list-inside mt-1 ml-1 space-y-0.5 text-xs">
                <li>Master data KPI</li>
                <li>Seluruh <b>Penugasan (Assignments)</b> staf</li>
                <li>Seluruh <b>Laporan Harian (Daily Reports)</b> staf</li>
                <li>Perhitungan poin/skor terkait KPI ini</li>
              </ul>
            </div>
            <p className="font-semibold text-destructive">Tindakan ini mutlak tidak dapat dibatalkan.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulkPermanent(false)}>Batal</Button>
            <Button
              variant="destructive"
              disabled={statusLoading === "bulk-perm-delete"}
              onClick={handleBulkPermanentDelete}
            >
              {statusLoading === "bulk-perm-delete" ? "Menghapus..." : `Hapus ${trashSelected.size} KPI`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
