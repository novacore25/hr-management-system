"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global uncaught error caught by root boundary:", error);
  }, [error]);

  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
            <AlertCircle size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight">
              Terjadi Kendala Sistem
            </h2>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Aplikasi mengalami masalah saat memuat data antarmuka. Silakan coba muat ulang atau buka kembali halaman.
            </p>
            {error?.message && (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-left font-mono text-[11px] text-rose-600 max-h-24 overflow-y-auto break-words">
                {error.message}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition"
            >
              <RotateCcw size={14} />
              Coba Lagi
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-200 transition"
            >
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/absensi/home";
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-slate-200 transition"
            >
              <Home size={14} />
              Home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
