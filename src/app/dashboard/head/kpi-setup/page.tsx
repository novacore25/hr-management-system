"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useManagedKpis } from "@/hooks/useKpis";
import { useApiMutation } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber, formatCurrency, formatPercentage, getBrandColor } from "@/lib/utils";
import type { KPI } from "@/types";
import { Plus, Pencil, Trash2, CheckCircle, PauseCircle, Archive, Search, XCircle, CheckCircle2, FileEdit } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const statusLabel: Record<string, string> = {
  draft: "Draft", active: "Aktif", hold: "Hold", cancelled: "Dibatalkan", completed: "Selesai", archived: "Arsip",
};
const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary", active: "default", hold: "outline", cancelled: "destructive", completed: "secondary", archived: "outline",
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

const StatusBadge = ({ status }: { status: string }) => (
  <Badge variant={statusVariant[status] ?? "outline"} className="text-xs">
    {status === "active" && <span className="mr-1.5 flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
    {status === "hold" && <PauseCircle className="mr-1 h-3 w-3" />}
    {status === "cancelled" && <XCircle className="mr-1 h-3 w-3" />}
    {status === "completed" && <CheckCircle2 className="mr-1 h-3 w-3" />}
    {status === "draft" && <FileEdit className="mr-1 h-3 w-3" />}
    {status === "archived" && <Archive className="mr-1 h-3 w-3" />}
    {statusLabel[status] ?? status}
  </Badge>
);

export default function HeadKpiSetupPage() {
  const router = useRouter();
  const now = new Date();

  const [selectedMonth, setSelectedMonth] = useState(
    () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const year = parseInt(selectedMonth.split("-")[0]);
  const month = parseInt(selectedMonth.split("-")[1]);

  /**
   * formerly: `useKpis(year, month)` + penyaringan di browser
   * `managedDepartments.includes(k.department)`.
   *
   * Dua masalah sekaligus:
   *   - `managedDepartments` berisi **id** divisi, sedangkan `k.department`
   *     berisi **nama**. Perbandingan itu tidak pernah cocok, jadi halaman
   *     selalu kosong.
   *   - daftar divisi datang dari AuthContext, bisa dimanipulasi.
   *
   * sekarang: `scope=managed` — server yang menyaring dari
   * `users.managed_departments`.
   */
  const { kpis, isLoading, refresh } = useManagedKpis(year, month);

  const patchKpi = useApiMutation<Record<string, unknown>, unknown>(
    "/api/kpis",
    "PATCH",
  );

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    kpi: KPI;
    assignmentCount: number;
  } | null>(null);

  const managedDepartmentNames = useMemo(
    () => [...new Set(kpis.map((k) => k.department).filter(Boolean))].sort(),
    [kpis],
  );

  const myKpis = useMemo(() => {
    let list = kpis.filter((k) => !k.deletedAt);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (k) =>
          k.title.toLowerCase().includes(q) ||
          k.department.toLowerCase().includes(q),
      );
    }
    if (filterType !== "all") list = list.filter((k) => k.type === filterType);
    if (filterStatus !== "all")
      list = list.filter((k) => k.status === filterStatus);
    return list;
  }, [kpis, search, filterType, filterStatus]);

  /**
   * formerly `supabase.from("kpis").update({ status }).eq("id", kpiId)` dari
   * browser — tanpa cek siapa pemilik KPI. Head bisa mengubah status KPI
   * divisi mana pun hanya dengan mengirim `id`.
   */
  async function setStatus(kpiId: string, status: string) {
    setStatusLoading(kpiId);
    setActionError(null);
    const res = await patchKpi.mutate({ id: kpiId, status });
    setStatusLoading(null);

    if (res.ok) {
      void refresh();
    } else {
      setActionError(res.error ?? "Gagal mengubah status KPI.");
    }
  }

  async function handleSoftDelete(kpi: KPI) {
    setActionError(null);
    const res = await fetch(
      withQuery("/api/assignments", { kpiId: kpi.id }),
      { credentials: "include", cache: "no-store" },
    );
    const json = (await res.json()) as {
      ok: boolean;
      data?: { count?: number };
      error?: string;
    };
    setConfirmDelete({ kpi, assignmentCount: json.data?.count ?? 0 });
  }

  /**
   * formerly dua update dari browser tanpa memeriksa hasilnya: cancel
   * assignment dulu, baru set `deleted_at`. Kalau yang pertama gagal, KPI
   * terhapus tapi penugasannya tetap aktif — dan karena KPI-nya tidak
   * tampil lagi, orang tidak pernah tahu penugasan yatim itu ada.
   *
   * sekarang: satu request; DAL membatalkan assignment lalu soft-delete
   * KPI dalam satu jalur.
   */
  async function executeSoftDelete() {
    if (!confirmDelete) return;
    const { kpi } = confirmDelete;
    setStatusLoading("deleting");
    setActionError(null);

    const res = await patchKpi.mutate({ id: kpi.id, action: "soft-delete" });
    setStatusLoading(null);

    if (res.ok) {
      toast.success("KPI berhasil dihapus");
      setConfirmDelete(null);
      void refresh();
    } else {
      setActionError(res.error ?? "Gagal menghapus KPI.");
    }
  }

  const isReadOnly = (k: KPI) => ["archived", "cancelled", "completed"].includes(k.status);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-5 w-40 bg-slate-200 rounded" />
          <div className="h-9 w-24 bg-slate-200 rounded-md" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 w-full bg-slate-200 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Kelola KPI Tim</h2>
          <p className="text-sm text-muted-foreground">
            {myKpis.length} KPI · {managedDepartmentNames.join(", ") || "semua divisi"} · {year}/{String(month).padStart(2, "0")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button size="sm" onClick={() => router.push("/dashboard/head/kpi-setup/new")}>
            <Plus className="h-4 w-4" />
            Buat KPI
          </Button>
        </div>
      </div>

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
          <SelectTrigger className="h-8 text-sm w-32"><SelectValue /></SelectTrigger>
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
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="hold">Hold</SelectItem>
            <SelectItem value="archived">Arsip</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {actionError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-destructive/60 hover:text-destructive text-xs font-medium"
          >
            ✕
          </button>
        </div>
      )}

      {myKpis.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            {kpis.length === 0
              ? "Belum ada KPI untuk departemen ini bulan ini"
              : "Tidak ada hasil yang cocok"}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => router.push("/dashboard/head/kpi-setup/new")}>
            Buat KPI pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {myKpis.map((k) => (
            <div key={k.id} className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{k.title}</p>
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
                <div className="flex items-center gap-1 shrink-0">
                  {!isReadOnly(k) && (
                    <button
                      onClick={() => router.push(`/dashboard/head/kpi-setup/edit?id=${k.id}`)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Edit KPI"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleSoftDelete(k)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Hapus KPI"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {!isReadOnly(k) && (
                <div className="flex gap-1.5 flex-wrap">
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
                    <button
                      onClick={() => setStatus(k.id, "active")}
                      disabled={statusLoading === k.id}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 disabled:opacity-50 border border-green-200"
                    >
                      <CheckCircle className="h-3 w-3" /> Aktifkan
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus KPI?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              KPI <span className="font-medium text-foreground">"{confirmDelete?.kpi.title}"</span> akan dihapus.
            </p>
            {(confirmDelete?.assignmentCount ?? 0) > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                <strong>{confirmDelete!.assignmentCount} penugasan</strong> aktif akan ikut dibatalkan.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="destructive" onClick={executeSoftDelete} disabled={statusLoading === "deleting"}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
