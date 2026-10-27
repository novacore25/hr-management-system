"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { PenLine, AlertTriangle } from "lucide-react";

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
  type?: "primary" | "danger";
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export default function PromptDialog({
  isOpen,
  title,
  message,
  placeholder,
  confirmLabel = "Kirim",
  type = "primary",
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock scroll on body and main container when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalBodyOverflow = document.body.style.overflow;
    const mainEl = document.querySelector("main");
    const originalMainOverflow = mainEl ? mainEl.style.overflow : "";

    document.body.style.overflow = "hidden";
    if (mainEl) mainEl.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      if (mainEl) mainEl.style.overflow = originalMainOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  const handleConfirm = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
    setValue("");
  };

  const isDanger = type === "danger";

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-md overflow-y-auto overscroll-contain animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setValue("");
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-sm sm:max-w-md my-auto bg-[var(--ab-bg-surface)] rounded-[32px] p-6 sm:p-8 border border-[var(--ab-border)] shadow-2xl ab-animate-scaleIn max-h-[90vh] overflow-y-auto text-center">
        <div className="flex flex-col items-center">
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-3xl flex items-center justify-center text-white mb-5 shadow-lg ${
              isDanger
                ? "bg-rose-600 shadow-rose-500/30"
                : "bg-blue-600 shadow-blue-500/30"
            }`}
          >
            {isDanger ? <AlertTriangle size={30} /> : <PenLine size={30} />}
          </div>
          <h3 className="text-lg sm:text-xl font-black text-[var(--ab-text-main)] mb-2 tracking-tight">
            {title}
          </h3>
          <p className="text-[var(--ab-text-dim)] text-xs sm:text-sm font-medium leading-relaxed mb-4 px-2">
            {message}
          </p>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder ?? "Tulis alasan..."}
            rows={3}
            className={`w-full rounded-2xl px-4 py-3 text-xs sm:text-sm border border-[var(--ab-border)] bg-[var(--ab-bg-main)] text-[var(--ab-text-main)] resize-none outline-none mb-6 focus:ring-2 ${
              isDanger ? "focus:ring-rose-500/30" : "focus:ring-blue-500/30"
            }`}
            autoFocus
          />
          <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 w-full">
            <button
              type="button"
              onClick={() => {
                setValue("");
                onCancel();
              }}
              className="w-full sm:flex-1 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest text-[var(--ab-text-dim)] hover:bg-[var(--ab-bg-main)] transition-all border border-[var(--ab-border)]"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!value.trim()}
              className={`w-full sm:flex-1 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isDanger
                  ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20"
                  : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
