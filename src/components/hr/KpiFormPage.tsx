"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDepartments } from "@/hooks/useDivisions";
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

interface KpiFormPageProps {
  kpiId?: string;
  allowedDepartments?: string[];
  backHref?: string;
}

export function KpiFormPage({ kpiId, allowedDepartments, backHref }: KpiFormPageProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { departments: allDepartments } = useDepartments();
  const departments = allowedDepartments && allowedDepartments.length > 0 ? allowedDepartments : allDepartments;
  const isEdit = !!kpiId;
  const resolvedBackHref = backHref ?? "/dashboard/hr/kpi";

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  const [loadingKpi, setLoadingKpi] = useState(isEdit);
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>("");
  const [unit, setUnit] = useState<string>("");
  const [period, setPeriod] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
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

  useEffect(() => {
    if (!kpiId) return;

    // formerly: query langsung ke Supabase dari browser
    // sekarang: Route Handler dengan guard role di server
    let cancelled = false;

    async function loadKpi() {
      try {
        const res = await fetch(`/api/kpis?id=${encodeURIComponent(kpiId!)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok: boolean;
          data?: { kpi?: Record<string, any> | null };
        };

        const kpi = json.data?.kpi;
        if (cancelled) return;

        if (kpi) {
          setTitle(kpi.title);
          setBrand(kpi.brand || "");
          setDescription(kpi.description || "");
          setType(kpi.type);
          setUnit(kpi.unit);
          setPeriod(kpi.period);
          setDepartment(kpi.department || "");
          setMonthlyTarget(String(kpi.monthlyTarget ?? 0));
          setHideActual(Boolean(kpi.hideActual));
          setSelectedMonth(`${kpi.year}-${String(kpi.month).padStart(2, "0")}`);
        } else {
          // Gagal memuat -> jangan biarkan form tersimpan kosong lalu
          // di-submit (sebelumnya ini bisa menimpa data dengan blank).
          setError("KPI tidak ditemukan atau Anda tidak punya akses.");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError("Judul KPI tidak boleh kosong."); return; }
    if (!type || !unit || !period || !department) { setError("Semua field wajib diisi."); return; }
    const target = parseFloat(monthlyTarget);
    if (isNaN(target) || target <= 0) { setError("Target bulanan harus angka positif."); return; }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: deptData } = await supabase.from("departments").select("id").eq("name", department).single();
      const departmentId = deptData?.id ?? null;
      const kpiType = type as "result" | "activity" | "quality";

      if (isEdit && kpiId) {
        const { error: updateErr } = await supabase.from("kpis").update({
          title: title.trim(),
          brand: brand.trim(),
          description: description.trim(),
          type: kpiType,
          unit,
          period,
          department_id: departmentId,
          monthly_target: target,
          hide_actual: hideActual,
        }).eq("id", kpiId);
        if (updateErr) throw updateErr;

        await supabase.from("kpi_assignments").update({ monthly_target: target }).eq("kpi_id", kpiId);
      } else {
        const { error: insertErr } = await supabase.from("kpis").insert({
          title: title.trim(),
          brand: brand.trim(),
          description: description.trim(),
          type: kpiType,
          unit,
          period,
          department_id: departmentId,
          monthly_target: target,
          year,
          month,
          hide_actual: hideActual,
          status: "draft",
          created_by: user?.id ?? "",
          deleted_at: null,
        });
        if (insertErr) throw insertErr;
      }
      router.push(resolvedBackHref);
    } catch (err) {
      console.error("[KpiFormPage]", err);
      setError(isEdit ? "Gagal menyimpan perubahan. Coba lagi." : "Gagal membuat KPI. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
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
            <Select onValueChange={setDepartment} value={department}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih departemen" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="monthly-target">Target Bulanan</Label>
          <Input
            id="monthly-target"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            placeholder="0"
            value={monthlyTarget}
            onChange={(e) => setMonthlyTarget(e.target.value)}
            required
          />
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
