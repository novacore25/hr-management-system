"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useApiMutation, useApiQuery } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { useKpis } from "@/hooks/useKpis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import type { KPI } from "@/types";

type Department = { id: string; name: string };

interface KpiFormPageProps {
  kpiId?: string;
  /**
   * @deprecated tidak lagi dipakai. Dulu Head Restrictions-nya datang dari
   * `AuthContext.user.managedDepartments` — bisa dimanipulasi di browser.
   * Sekarang server yang menyaring lewat `scope=managed`.
   */
  allowedDepartments?: string[];
  backHref?: string;
}

/** Halaman ini dipakai /dashboard/hr/kpi/* dan /dashboard/head/kpi-setup/*. */
export function KpiFormPage({ kpiId, backHref }: KpiFormPageProps) {
  const router = useRouter();
  const isEdit = !!kpiId;
  const resolvedBackHref = backHref ?? "/dashboard/hr/kpi";

  /**
   * `scope=managed` untuk Head, semua divisi untuk HR.
   *
   * Server yang memutuskan: `/dashboard/head/kpi-setup/{new,edit}`
   * formerly mengirim `allowedDepartments` dari `AuthContext`, jadi Head
   * tinggal mengubah nilainya lalu membuat KPI untuk divisi mana pun.
   */
  const { data: deptData, isLoading: departmentsLoading } = useApiQuery<{
    departments: Department[];
  }>(useCallback(() => withQuery("/api/departments", { scope: "managed" }), []), []);

  const departments = deptData?.departments ?? [];
  const departmentNameById = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>("");
  const [unit, setUnit] = useState<string>("");
  const [period, setPeriod] = useState<string>("");
  /** Sekarang **id** divisi, bukan nama. */
  const [departmentId, setDepartmentId] = useState("");
  const [monthlyTarget, setMonthlyTarget] = useState("");
  const [hideActual, setHideActual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const year = parseInt(selectedMonth.split("-")[0]);
  const month = parseInt(selectedMonth.split("-")[1]);
  const { kpis: existingKpis } = useKpis(year, month);

  const duplicates = useMemo(() => {
    if (!title.trim() || isEdit) return [];
    const titleNorm = title.trim().toLowerCase();
    const brandNorm = brand.trim().toLowerCase();
    return existingKpis.filter((k) => {
      if (k.deletedAt) return false;
      if (k.id === kpiId) return false;
      const kTitleNorm = k.title.toLowerCase();
      const kBrandNorm = (k.brand ?? "").toLowerCase();
      return kTitleNorm === titleNorm && kBrandNorm === brandNorm;
    });
  }, [title, brand, existingKpis, isEdit, kpiId]);

  const postKpi = useApiMutation<Record<string, unknown>, unknown>("/api/kpis", "POST");
  const patchKpi = useApiMutation<Record<string, unknown>, unknown>("/api/kpis", "PATCH");

  const [kpi, setKpi] = useState<KPI | null>(null);
  const [loadingKpi, setLoadingKpi] = useState(isEdit);
  const [assignmentCount, setAssignmentCount] = useState(0);

  /**
   * formerly `supabase.from("departments").select("id").eq("name", name)`
   * lalu `deptData?.id ?? null`. Dengan stub, hasilnya selalu `null` —
   * jadi setiap KPI yang dibuat **tidak punya divisi**, tanpa error apa
   * pun. Sekarang id diambil langsung dari API KPI.
   */
  useEffect(() => {
    if (!kpiId) return;

    let cancelled = false;

    async function loadKpi() {
      try {
        const [res, assignRes] = await Promise.all([
          fetch(withQuery("/api/kpis", { id: kpiId }), {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(withQuery("/api/assignments", { kpiId }), {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const json = (await res.json()) as {
          ok: boolean;
          data?: { kpi?: KPI | null };
        };

        if (cancelled) return;

        const found = json.data?.kpi ?? null;
        if (!found) {
          // Gagal memuat -> jangan biarkan form tersimpan kosong lalu
          // di-submit (sebelumnya ini bisa menimpa data dengan blank).
          setError("KPI tidak ditemukan atau Anda tidak punya akses.");
          return;
        }

        setKpi(found);
        setTitle(found.title);
        setBrand(found.brand ?? "");
        setDescription(found.description ?? "");
        setType(found.type);
        setUnit(found.unit);
        setPeriod(found.period);
        setDepartmentId(
          (found as { departmentId?: string | null }).departmentId ?? "",
        );
        setMonthlyTarget(String(found.monthlyTarget ?? 0));
        setHideActual(Boolean(found.hideActual));
        setSelectedMonth(
          `${found.year}-${String(found.month).padStart(2, "0")}`,
        );

        if (assignRes.ok) {
          const aj = (await assignRes.json()) as { data?: { count?: number } };
          setAssignmentCount(aj.data?.count ?? 0);
        }
      } catch {
        if (!cancelled) setError("Gagal memuat data KPI.");
      } finally {
        if (!cancelled) setLoadingKpi(false);
      }
    }

    void loadKpi();
    return () => {
      cancelled = true;
    };
  }, [kpiId]);

  /**
   * formerly menulis `kpis` DAN `kpi_assignments` langsung dari browser.
   * Dua masalah:
   *
   * 1. `kpi_assignments.update({ monthly_target: target })` menimpa target
   *    **per orang** dengan total KPI. Karena `kpis.monthlyTarget` =
   *    SUM(assignment), totalnya jadi n kali terlalu besar dan target
   *    tiap orang hilang. Sekarang server menolak perubahan target kalau
   *    KPI sudah punya penugasan, dengan pesan yang memberi arah.
   * 2. Divisi dikirim sebagai NAMA, dan kalau tidak ketemu `departmentId`
   *    jadi null tanpa pesan apa pun - KPI tercipta tanpa divisi.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Judul KPI tidak boleh kosong.");
      return;
    }
    if (!type || !unit || !period || !departmentId) {
      setError("Semua field wajib diisi.");
      return;
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      brand: brand.trim(),
      description: description.trim(),
      type,
      unit,
      period,
      departmentId,
      hideActual,
    };

    if (assignmentCount === 0) {
      const target = parseFloat(monthlyTarget);
      if (isNaN(target) || target <= 0) {
        setError("Target bulanan harus angka positif.");
        return;
      }
      payload.monthlyTarget = target;
    }

    setSubmitting(true);

    const res = isEdit && kpiId
      ? await patchKpi.mutate({ id: kpiId, ...payload })
      : await postKpi.mutate({ ...payload, year, month, status: "draft" });

    setSubmitting(false);

    if (res.ok) {
      router.push(resolvedBackHref);
      return;
    }

    setError(res.error ?? "Gagal menyimpan. Coba lagi.");
  }

  if (loadingKpi) {
    return (
      <div className="space-y-6 animate-pulse max-w-lg">
        <div className="h-5 w-32 bg-slate-200 rounded" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-full bg-slate-200 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Header */}
      <div className="space-y-0.5">
        <button
          onClick={() => router.push(resolvedBackHref)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Manajemen KPI
        </button>
        <h2 className="text-base font-semibold">{isEdit ? "Edit KPI" : "Buat KPI Baru"}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <div className="space-y-1.5">
            <Label htmlFor="kpi-month">Bulan</Label>
            <Input
              id="kpi-month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-9 w-[155px]"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="kpi-title">Judul KPI</Label>
          <Input
            id="kpi-title"
            placeholder="Contoh: Target Penjualan Bulanan"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="kpi-brand">
            Brand / Merek{" "}
            <span className="text-muted-foreground font-normal">(opsional)</span>
          </Label>
          <Input
            id="kpi-brand"
            placeholder="Contoh: Nama Brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>

        {duplicates.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p className="text-sm font-semibold">
                KPI dengan nama dan brand ini sudah ada ({duplicates.length}):
              </p>
            </div>
            <ul className="space-y-1">
              {duplicates.map((k) => (
                <li key={k.id} className="text-xs text-amber-800 ml-6">
                  <span className="font-medium">{k.title}</span>
                  {k.brand && <span> · {k.brand}</span>}
                  {" · "}
                  <span className="text-amber-700">{k.department}</span>
                  {" · "}
                  <span className="italic">{k.status}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-600 ml-6">Tetap lanjut jika memang berbeda (misal: departemen berbeda).</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="kpi-desc">Deskripsi</Label>
          <Textarea
            id="kpi-desc"
            placeholder="Penjelasan singkat tentang KPI ini..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tipe</Label>
            <Select onValueChange={setType} value={type}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="result">Result</SelectItem>
                <SelectItem value="activity">Activity</SelectItem>
                <SelectItem value="quality">Quality</SelectItem>
                <SelectItem value="lead_tim">Lead Tim</SelectItem>
                <SelectItem value="hr">HR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select onValueChange={setUnit} value={unit}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Angka</SelectItem>
                <SelectItem value="currency">Rupiah</SelectItem>
                <SelectItem value="percentage">Persentase</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Periode</Label>
            <Select onValueChange={setPeriod} value={period}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih periode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Harian</SelectItem>
                <SelectItem value="weekly">Mingguan</SelectItem>
                <SelectItem value="monthly">Bulanan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Departemen</Label>
            {/*
              `value` sekarang berisi **id** divisi, bukan nama.
              formerly `value={department}` (nama) dicocokkan dengan
              `SelectItem value={d}` — dan `d` itu daftar id dari
              `allowedDepartments`. Dua format berbeda, jadi tidak pernah
              cocok: dropdown Head tidak pernah menampilkan apa pun yang
              terpilih.
            */}
            <Select onValueChange={setDepartmentId} value={departmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih departemen" />
              </SelectTrigger>
              <SelectContent>
                {departmentsLoading ? (
                  <SelectItem value="__loading" disabled>
                    Memuat divisi...
                  </SelectItem>
                ) : departments.length === 0 ? (
                  <SelectItem value="__kosong" disabled>
                    Tidak ada divisi yang bisa dipilih
                  </SelectItem>
                ) : (
                  departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="monthly-target">
            {period === "daily"
              ? "Target Harian"
              : period === "weekly"
              ? "Target Mingguan"
              : "Target Bulanan"}
            {assignmentCount > 0 && (
              <span className="text-muted-foreground font-normal">
                {" "}
                (total {assignmentCount} penugasan)
              </span>
            )}
          </Label>
          <Input
            id="monthly-target"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            placeholder={period === "daily" ? "Target untuk tugas harian ini..." : "0"}
            value={monthlyTarget}
            onChange={(e) => setMonthlyTarget(e.target.value)}
            required
            // Kalau KPI sudah punya penugasan, angka ini adalah JUMLAH
            // target per orang — bukan milik form ini. Server menolak
            // perubahan, jadi field-nya dikunci. Dulu field ini bebas
            // diisi dan nilainya diam-diam ditimpa total per orang,
            // sehingga target tiap orang hilang.
            disabled={assignmentCount > 0}
          />
          {assignmentCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Target di sini adalah jumlah target seluruh penugasan. Ubah
              target tiap orang di halaman Penugasan KPI.
            </p>
          )}
        </div>

        <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm bg-background">
          <label className="relative inline-flex items-center cursor-pointer mt-0.5">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={hideActual}
              onChange={(e) => setHideActual(e.target.checked)}
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--ab-primary)]"></div>
          </label>
          <div className="space-y-1 leading-none">
            <Label className="text-sm font-semibold cursor-pointer" onClick={() => setHideActual(!hideActual)}>
              Sembunyikan Angka Aktual dari Staf
            </Label>
            <p className="text-xs text-muted-foreground">
              Jika diaktifkan, staf hanya akan melihat persentase pencapaian (%), tanpa melihat angka aktual. Berguna untuk KPI subjektif.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-between gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={() => router.push(resolvedBackHref)}>
            Batal
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat KPI"}
          </Button>
        </div>
      </form>
    </div>
  );
}
