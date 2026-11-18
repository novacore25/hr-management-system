"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error caught by root boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 text-center space-y-5 animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-sm">
          <AlertCircle size={32} />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">
            Terjadi Kesalahan Sistem
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
            Aplikasi mengalami kendala tak terduga. Silakan coba muat ulang atau kembali ke halaman utama.
          </p>
          {error?.message && (
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-left font-mono text-[11px] text-rose-600 dark:text-rose-400 max-h-24 overflow-y-auto break-words">
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
            Coba Lagi
          </button>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 transition"
          >
            <Home size={14} />
            Ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
