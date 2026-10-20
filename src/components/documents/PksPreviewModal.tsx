"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  Printer,
  Edit3,
  ZoomIn,
  ZoomOut,
  Loader2,
  FileText,
  Building2,
  Calendar,
} from "lucide-react";
import { PksTntDocument } from "./PksTntDocument";
import { PksMcnDocument } from "./PksMcnDocument";
import { PksHypeDocument } from "./PksHypeDocument";
import type {
  PksTntData,
  PksMcnData,
  PksHypeData,
  PksTemplateType,
} from "@/types/pks";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contractId?: string | null;
  initialPayload?: Record<string, unknown> | null;
  initialContractType?: string | null;
  contractNumber?: string | null;
}

export function PksPreviewModal({
  isOpen,
  onClose,
  contractId,
  initialPayload,
  initialContractType,
  contractNumber,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const [contractType, setContractType] = useState<PksTemplateType>(
    (initialContractType as PksTemplateType) || "PKS_KLIEN_TNT",
  );
  const [payload, setPayload] = useState<Record<string, unknown> | null>(
    initialPayload || null,
  );
  const [displayNumber, setDisplayNumber] = useState<string>(
    contractNumber || "",
  );

  useEffect(() => {
    if (!isOpen) return;

    if (initialPayload) {
      setPayload(initialPayload);
      if (initialContractType) {
        setContractType(initialContractType as PksTemplateType);
      }
      return;
    }

    if (contractId) {
      setLoading(true);
      setError(null);
      fetch(`/api/absensi/contracts?id=${encodeURIComponent(contractId)}`)
        .then((res) => res.json())
        .then((json) => {
          if (!json.ok || !json.data?.contract) {
            throw new Error(json.error || "Gagal memuat dokumen kontrak.");
          }
          const c = json.data.contract;
          setDisplayNumber(c.contractNumber || "");
          setContractType(
            (c.contractType as PksTemplateType) || "PKS_KLIEN_TNT",
          );
          setPayload(c.documentPayload);
        })
        .catch((err) => {
          console.error("Gagal load kontrak:", err);
          setError(err.message || "Gagal memuat dokumen.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, contractId, initialPayload, initialContractType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-5xl h-[94vh] bg-slate-100 dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* ── TOP HEADER / TOOLBAR (no-print) ────────────────────────── */}
        <div className="no-print bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <FileText size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  Pratinjau Dokumen Kontrak Resmi
                </h3>
                <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {contractType === "PKS_KLIEN_TNT" ? "PKS TNT" : "PKS MCN (LS)"}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                {displayNumber || "Dokumen PKS"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
                className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300"
                title="Perkecil"
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={() => setZoom(0.85)}
                className="px-2 py-1 font-bold text-[11px] text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
                className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300"
                title="Perbesar"
              >
                <ZoomIn size={14} />
              </button>
            </div>

            {/* Edit in Generator */}
            {contractId && (
              <Link
                href={`/absensi/admin/letters/generator?contractId=${encodeURIComponent(
                  contractId,
                )}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition shadow-sm"
              >
                <Edit3 size={14} />
                <span>Edit Kontrak</span>
              </Link>
            )}

            {/* Print / Save PDF Button */}
            <button
              onClick={() => window.print()}
              disabled={loading || !payload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              <Printer size={14} />
              <span>Cetak / PDF</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── DOCUMENT VIEWPORT ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center pks-document-container">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
              <p className="text-xs font-bold uppercase tracking-widest">
                Memuat dokumen kontrak...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-red-500 max-w-sm text-center">
              <p className="text-sm font-bold mb-2">Terjadi Kesalahan</p>
              <p className="text-xs text-slate-500 mb-4">{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Tutup
              </button>
            </div>
          ) : payload ? (
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
                transition: "transform 0.15s ease-out",
              }}
            >
              {contractType === "PKS_KLIEN_TNT" ? (
                <PksTntDocument data={payload as unknown as PksTntData} />
              ) : contractType === "PKS_HYPE" ? (
                <PksHypeDocument data={payload as unknown as PksHypeData} />
              ) : (
                <PksMcnDocument data={payload as unknown as PksMcnData} />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <p className="text-xs font-bold uppercase tracking-widest">
                Tidak ada data dokumen
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
