import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { PerformanceCategory, KpiAssignment, WeightedScore } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Parses late_fine column into minutes. Safely handles legacy Rupiah data.
export function parseLateMinutes(value: number | null | undefined): number {
  if (!value) return 0;
  // If the value is 1000 or more, it's likely the old Rupiah fine system.
  // The old formula was: lateFine = Math.ceil(diffMins / 10) * 30000;
  if (value >= 1000) {
    return Math.round((value / 30000) * 10);
  }
  return value; // New system simply stores minutes.
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function getPerformanceCategory(
  achievementPct: number
): PerformanceCategory {
  if (achievementPct >= 100) return "excellent";
  if (achievementPct >= 80) return "good";
  if (achievementPct >= 50) return "warning";
  return "critical";
}

export function performanceCategoryLabel(
  category: PerformanceCategory
): string {
  const labels: Record<PerformanceCategory, string> = {
    excellent: "Excellent",
    good: "Good",
    warning: "Warning",
    critical: "Critical",
  };
  return labels[category];
}

export function performanceCategoryColor(
  category: PerformanceCategory
): string {
  const colors: Record<PerformanceCategory, string> = {
    excellent: "text-emerald-600 bg-emerald-50",
    good: "text-blue-600 bg-blue-50",
    warning: "text-amber-600 bg-amber-50",
    critical: "text-red-600 bg-red-50",
  };
  return colors[category];
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function getWorkingDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (!isWeekend(date)) count++;
  }
  return count;
}

export function getWorkingDaysElapsed(
  year: number,
  month: number,
  upToDay: number
): number {
  let count = 0;
  for (let day = 1; day <= upToDay; day++) {
    const date = new Date(year, month - 1, day);
    if (!isWeekend(date)) count++;
  }
  return count;
}

/**
 * Hitung sisa hari kerja secara live (tidak bergantung pada data Firestore).
 * Selalu akurat berdasarkan tanggal hari ini.
 */
export function getLiveWorkingDaysRemaining(year: number, month: number): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Bulan sudah lewat → tidak ada sisa
  if (year < currentYear || (year === currentYear && month < currentMonth)) return 0;
  // Bulan belum mulai → semua hari tersedia
  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    return getWorkingDaysInMonth(year, month);
  }
  // Bulan berjalan → hitung dari hari ini ke akhir bulan
  const total = getWorkingDaysInMonth(year, month);
  const elapsed = getWorkingDaysElapsed(year, month, now.getDate());
  return Math.max(total - elapsed, 0);
}

export function getNextWorkingDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (isWeekend(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateDisplay(isoDate: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(isoDate));
}

export function monthName(month: number): string {
  return new Intl.DateTimeFormat("id-ID", { month: "long" }).format(
    new Date(2024, month - 1, 1)
  );
}

export function calcWeightedScore(
  assignments: KpiAssignment[],
  weights: { result: number; activity: number; quality: number; leadTim: number; hr: number },
  reportsByAssignment?: Record<string, { actualValue: number }[]>
): WeightedScore {
  const buckets = { 
    result: [] as number[], 
    activity: [] as number[], 
    quality: [] as number[],
    lead_tim: [] as number[],
    hr: [] as number[]
  };

  for (const a of assignments) {
    if (a.status !== "active" && a.status !== "completed") continue;
    const t = a.kpiType ?? "result";
    if (t !== "result" && t !== "activity" && t !== "quality" && t !== "lead_tim" && t !== "hr") continue;

    const reports = reportsByAssignment?.[a.id];
    let pct: number;
    if (reports && reports.length > 0) {
      const displayActual = reports.reduce((s, r) => s + r.actualValue, 0);
      pct = a.monthlyTarget > 0 ? (displayActual / a.monthlyTarget) * 100 : 0;
    } else {
      pct = a.achievementPercentage;
    }

    buckets[t].push(pct);
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const resultAvg = avg(buckets.result);
  const activityAvg = avg(buckets.activity);
  const qualityAvg = avg(buckets.quality);
  const leadTimAvg = avg(buckets.lead_tim);
  const hrAvg = avg(buckets.hr);

  const performanceTotal = 
    resultAvg * (weights.result / 100) +
    activityAvg * (weights.activity / 100) +
    qualityAvg * (weights.quality / 100);

  const personalityTotal = 
    leadTimAvg * (weights.leadTim / 100) +
    hrAvg * (weights.hr / 100);

  // Final Total: 70% Performance + 30% Personality
  // Jika KPI kosong, nilainya 0 (tidak diskala otomatis).
  const finalTotal = (performanceTotal * 0.7) + (personalityTotal * 0.3);

  return {
    resultAvg,
    activityAvg,
    qualityAvg,
    leadTimAvg,
    hrAvg,
    resultWeight: weights.result,
    activityWeight: weights.activity,
    qualityWeight: weights.quality,
    leadTimWeight: weights.leadTim,
    hrWeight: weights.hr,
    resultCount: buckets.result.length,
    activityCount: buckets.activity.length,
    qualityCount: buckets.quality.length,
    leadTimCount: buckets.lead_tim.length,
    hrCount: buckets.hr.length,
    performanceTotal,
    personalityTotal,
    total: finalTotal,
    category: getPerformanceCategory(finalTotal),
  };
}

/**
 * Alasan kenapa KPI ini tidak bisa diinput staf, plus keterangan
 * apa yang akan dinilai.
 *
 * Dulu tiap halaman menulis sendiri: `"Akan diinput oleh HR"` di satu
 * tempat, `"Diinput HR"` di tempat lain, dan tiap kali menambah
 * kalimat baru harus ingat mengedit ketiganya.
 *
 * Sekarang satu fungsi. Urutannya penting: **deskripsi lebih dulu**,
 * karena staf perlu tahu apa yang sebenarnya dinilai -- "Akan
 * diinput oleh HR" saja tidak memberi tahu apa pun.
 *
 * Tapi deskripsi sering kosong, jadi harus ada fallback. Di produksi
 * per 2026-10-06: `hr` 30 dari 33 punya deskripsi (91%), `lead_tim`
 * cuma **3 dari 38** (8%). Kalau tidak ada fallback, 35 dari 38 KPI
 * `lead_tim` akan tampil sebagai kotak kosong -- dan kotak kosong
 * selalu terlihat normal, tidak ada yang melaporkannya.
 *
 * `null` berarti KPI ini boleh diinput staf.
 */
export function pesanKpiReadonly(
  kpi: { type?: string | null; description?: string | null } | null | undefined,
  penilai: "Head" | "HR",
): string | null {
  if (!kpi) return null;
  if (kpi.type !== "quality" && kpi.type !== "lead_tim" && kpi.type !== "hr") {
    return null;
  }

  const deskripsi = (kpi.description ?? "").trim();
  if (deskripsi !== "") {
    return `Diinput ${penilai} · ${deskripsi}`;
  }

  return `Akan diinput oleh ${penilai}`;
}

export function getBrandColor(brand: string | undefined): string {
  if (!brand || brand.toLowerCase() === "umum") {
    return "text-slate-600 bg-slate-100 border-slate-200";
  }
  
  const b = brand.toLowerCase();
  if (b.includes("tnt")) return "text-orange-600 bg-orange-50 border-orange-200";
  if (b.includes("iswhite")) return "text-sky-600 bg-sky-50 border-sky-200";
  if (b.includes("syb")) return "text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200";
  if (b.includes("msglow")) return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (b.includes("naisday")) return "text-indigo-600 bg-indigo-50 border-indigo-200";
  
  // Default fallback for other brands, generate based on first letter or just default
  const colors = [
    "text-red-600 bg-red-50 border-red-200",
    "text-teal-600 bg-teal-50 border-teal-200",
    "text-pink-600 bg-pink-50 border-pink-200",
    "text-violet-600 bg-violet-50 border-violet-200",
    "text-cyan-600 bg-cyan-50 border-cyan-200",
  ];
  const charCode = b.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
}

/**
 * Ekstrak tanggal spesifik ISO (YYYY-MM-DD) dari judul KPI harian jika ada (format: [YYYY-MM-DD]).
 */
export function extractKpiDate(title: string | undefined): string | null {
  if (!title) return null;
  const match = title.match(/\[(\d{4}-\d{2}-\d{2})\]/);
  return match ? match[1] : null;
}

/**
 * Menghilangkan tag tanggal [YYYY-MM-DD] dari judul agar tampil bersih.
 */
export function cleanKpiTitle(title: string | undefined): string {
  if (!title) return "";
  return title.replace(/\[\d{4}-\d{2}-\d{2}\]\s*/, "").trim();
}
