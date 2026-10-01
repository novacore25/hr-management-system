"use client";

import { useCallback } from "react";
import { useApiQuery } from "@/hooks/useApi";
import { withQuery } from "@/lib/api-client";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { FileText, Loader2, Download } from "lucide-react";
import type { CompanyLetter } from "@/types";

export default function MyLettersPage() {
  // formerly: .eq("issued_to", user.id) dari browser — userId bisa
  // diubah attacker sehingga bisa melihat surat orang lain.
  // sekarang: server memakai id dari session, `mine=1` tidak bisa
  // diarahkan ke user lain.
  const buildPath = useCallback(
    () => withQuery("/api/absensi/letters", { mine: "1" }),
    [],
  );

  const { data, isLoading } = useApiQuery<{ letters: CompanyLetter[] }>(
    buildPath,
    [],
    60_000,
  );

  const letters = data?.letters ?? [];

  function handleDownload(letter: CompanyLetter) {
    // Untuk sementara belum ada generator PDF; file diunggah manual
    // oleh admin dan disimpan di object storage (Cloudflare R2).
    if (letter.fileUrl) {
      window.open(letter.fileUrl, "_blank", "noopener,noreferrer");
      return;
    }
    alert(
      `Surat: ${letter.fullNumber}\n\nBerkas belum diunggah. Hubungi admin absensi.`,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Surat Saya
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Daftar surat resmi yang diterbitkan untuk Anda.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-xs font-bold uppercase tracking-widest">
                Memuat Data...
              </p>
            </div>
          ) : letters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <p className="text-xs font-bold uppercase tracking-widest">
                Belum ada surat untuk Anda
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {letters.map((letter) => (
                <div
                  key={letter.id}
                  className="p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white transition-all hover:shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-primary/10 text-primary">
                          {letter.company}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {letter.letterTypeName}
                        </span>
                      </div>
                      <p className="text-lg font-black font-mono text-slate-900 tracking-tight">
                        {letter.fullNumber}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Diterbitkan:{" "}
                        {format(new Date(letter.createdAt), "dd MMMM yyyy", {
                          locale: id,
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(letter)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-sm group-hover:shadow"
                  >
                    <Download size={16} />
                    Unduh Surat
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}