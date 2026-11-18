"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw, Home, Clock } from "lucide-react";
import Link from "next/link";

export default function AbsensiError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Catat error client ke browser console untuk investigasi
    console.error("Absensi module error caught by boundary:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--ab-bg-surface)] rounded-3xl border border-[var(--ab-border)] shadow-xl p-6 sm:p-8 text-center space-y-5 animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm">
          <AlertCircle size={32} />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg sm:text-xl font-black text-[var(--ab-text-main)] uppercase tracking-tight">
            Terjadi Kendala Memuat Data
          </h2>
          <p className="text-xs text-[var(--ab-text-dim)] font-medium leading-relaxed">
            Halaman mengalami masalah saat merender data lembur/absensi. Silakan coba muat ulang atau kembali ke dashboard.
          </p>
          {error?.message && (
            <div className="p-2.5 rounded-xl bg-[var(--ab-bg-main)] border border-[var(--ab-border)] text-left font-mono text-[11px] text-rose-600 dark:text-rose-400 max-h-24 overflow-y-auto break-words">
              {error.message}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition"
          >
            <RotateCcw size={14} />
            Muat Ulang
          </button>
          <Link
            href="/absensi/admin/overtime"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[var(--ab-bg-main)] hover:bg-[var(--ab-border)] text-[var(--ab-text-main)] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-[var(--ab-border)] transition"
          >
            <Clock size={14} className="text-amber-500" />
            Refresh Lembur
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[var(--ab-bg-main)] hover:bg-[var(--ab-border)] text-[var(--ab-text-dim)] hover:text-[var(--ab-text-main)] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-[var(--ab-border)] transition"
          >
            <Home size={14} />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
