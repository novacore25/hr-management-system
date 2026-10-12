"use client";

import React, { useState, useEffect, useRef, useId } from "react";

interface Props {
  blocks: React.ReactNode[];
  maxPageHeightPx?: number; // default 870px (~230mm at 96 DPI)
  fontFamily?: string;
}

/**
 * Paginator otomatis untuk dokumen A4 legal formal.
 * Mengalirkan konten secara dinamis ke halaman berikutnya saat melebihi batas margin A4,
 * mencegah blank space yang berlebihan dan mencegah overflow.
 */
export function DynamicPksPaginator({
  blocks,
  maxPageHeightPx = 870,
  fontFamily = '"Times New Roman", Times, Georgia, serif',
}: Props) {
  const measureContainerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([]);
  const [isMeasured, setIsMeasured] = useState(false);
  const uniqueId = useId();

  useEffect(() => {
    const container = measureContainerRef.current;
    if (!container) return;

    // Tunggu font dan layout selesai dirender
    const measure = () => {
      const children = Array.from(container.children) as HTMLElement[];
      if (!children.length) return;

      const newPages: number[][] = [];
      let currentPage: number[] = [];
      let currentHeight = 0;

      children.forEach((child, index) => {
        const style = window.getComputedStyle(child);
        const marginTop = parseFloat(style.marginTop) || 0;
        const marginBottom = parseFloat(style.marginBottom) || 0;
        const elementHeight = child.offsetHeight + marginTop + marginBottom;

        // Cek apakah blok meminta pemisahan halaman paksa (misal Lampiran atau Addendum)
        const isForceBreak =
          child.getAttribute("data-page-break") === "true" ||
          child.querySelector("[data-page-break='true']") !== null;

        // Jika blok ditambahkan melebihi kapasitas halaman atau dipaksa page break, buka halaman baru
        if (currentPage.length > 0 && (isForceBreak || currentHeight + elementHeight > maxPageHeightPx)) {
          newPages.push(currentPage);
          currentPage = [index];
          currentHeight = elementHeight;
        } else {
          currentPage.push(index);
          currentHeight += elementHeight;
        }
      });

      if (currentPage.length > 0) {
        newPages.push(currentPage);
      }

      setPages(newPages);
      setIsMeasured(true);
    };

    // Panggil setelah render frame berikutnya agar ukuran DOM akurat
    const rafId = requestAnimationFrame(() => {
      measure();
    });

    return () => cancelAnimationFrame(rafId);
  }, [blocks, maxPageHeightPx]);

  return (
    <div className="pks-paginator-root" style={{ fontFamily }}>
      {/* ── HIDDEN MEASUREMENT CONTAINER ────────────────────────── */}
      <div
        ref={measureContainerRef}
        aria-hidden="true"
        className="no-print pointer-events-none select-none print:hidden"
        style={{
          position: "absolute",
          left: "-99999px",
          top: 0,
          width: "159.2mm", // 210mm - 2 * 25.4mm margin
          visibility: "hidden",
          fontSize: "13.5px",
          lineHeight: "1.65",
          fontFamily,
        }}
      >
        {blocks.map((block, idx) => (
          <div key={`measure-${uniqueId}-${idx}`} className="pks-measure-block">
            {block}
          </div>
        ))}
      </div>

      {/* ── RENDERED PAGINATED PAGES ────────────────────────────── */}
      {isMeasured && pages.length > 0 ? (
        pages.map((pageIndices, pageIdx) => (
          <section
            key={`page-${pageIdx}`}
            className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border"
            style={{ fontFamily }}
          >
            {/* Page Body Content */}
            <div className="flex-1 space-y-3">
              {pageIndices.map((blockIndex) => (
                <div key={`content-${pageIdx}-${blockIndex}`}>
                  {blocks[blockIndex]}
                </div>
              ))}
            </div>

            {/* Dynamic Page Footer */}
            <div className="pt-4 flex justify-between items-center text-[12px] text-slate-700 border-t border-transparent">
              <span className="text-[11px] text-slate-400 print:text-black">
                {pageIdx === 0 ? "" : "Perjanjian Kerjasama (PKS)"}
              </span>
              <span className="font-semibold text-right">
                {pageIdx + 1}/{pages.length}
              </span>
            </div>
          </section>
        ))
      ) : (
        /* Fallback saat pengukuran sedang berlangsung (hanya 1 frame) */
        <section
          className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 box-border"
          style={{ fontFamily }}
        >
          <div className="space-y-3">
            {blocks.map((block, idx) => (
              <div key={`fallback-${idx}`}>{block}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
