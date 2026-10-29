"use client";

import React, { forwardRef } from "react";
import { Printer, CheckCircle2 } from "lucide-react";
import type { PayrollOvertimeDetailItem } from "@/types";

export interface PayslipPrintViewProps {
  employeeName: string;
  contractPosition: string;
  company: "TNT" | "Hype" | "Nova";
  month: number;
  year: number;
  baseSalary: number;
  mobilityAllowance: number;
  performanceBonus: number;
  overtimePay: number;
  deductions: number;
  deductionNotes?: string;
  notes?: string | null;
  snapshotName?: string | null;
  snapshotPosition?: string | null;
  snapshotCompany?: string | null;
  deductionsDetail?: Array<{ name: string; amount: number; note?: string }> | null;
  additionsDetail?: Array<{ name: string; amount: number; note?: string }> | null;
  overtimeNotes?: string | null;
  overtimeDetail?: PayrollOvertimeDetailItem[] | null;
  // Extra fields
  departmentName?: string | null;
  employmentStatus?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  approvedByName?: string | null;
  paymentReference?: string | null;
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const COMPANY_NAMES = {
  TNT: "PT TNT KREATIF DIGITAL",
  Hype: "HYPE MEDIA INDONESIA",
  Nova: "PT SYNERA KREATIF GRUP",
};

const COMPANY_TAGLINES = {
  TNT: "MCN & TAP Agency · Official TikTok Shop Partner",
  Hype: "Official TikTok GO Agency Partner",
  Nova: "Official TikTok Shop Partner & MCN Agency",
};

const COMPANY_COLORS = {
  TNT: "#00897B",
  Hype: "#E53935",
  Nova: "#1E88E5",
};

const OFFICE_ADDRESS =
  "Jalan Kavling Perkebunan Raya #C225A, RT.006/RW.013, Panunggangan Bar., Kec. Cibodas, Kota Tangerang, Banten 15139";

export const PayslipPrintView = forwardRef<HTMLDivElement, PayslipPrintViewProps>(
  (
    {
      employeeName,
      contractPosition,
      company,
      month,
      year,
      baseSalary,
      mobilityAllowance,
      performanceBonus,
      overtimePay,
      deductions,
      deductionNotes,
      notes,
      snapshotName,
      snapshotPosition,
      snapshotCompany,
      deductionsDetail,
      additionsDetail,
      overtimeNotes,
      overtimeDetail,
      departmentName,
      employmentStatus,
      bankName,
      bankAccountNumber,
      bankAccountName,
      createdAt,
      updatedAt,
      approvedByName = "Marcella Dian Mutiara",
      paymentReference,
    },
    ref,
  ) => {
    const formatCurrency = (amount: number) => {
      return "Rp " + Math.round(amount).toLocaleString("id-ID");
    };

    const additionsTotal = (additionsDetail || []).reduce(
      (sum, item) => sum + (item.amount || 0),
      0,
    );

    // Hitung total pendapatan (bruto)
    const grossIncome =
      baseSalary + mobilityAllowance + performanceBonus + overtimePay + additionsTotal;

    // Gaji Bersih / Take Home Pay
    const thp = grossIncome - deductions;

    const finalName = snapshotName || employeeName;
    const finalPosition = snapshotPosition || contractPosition;
    const finalCompany =
      ((snapshotCompany as "TNT" | "Hype" | "Nova") || company || "Nova");

    const monthIndex = month >= 1 && month <= 12 ? month - 1 : 0;
    const monthName = MONTHS[monthIndex] || String(month);

    // Tanggal akhir bulan
    const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
    const periodRange = `${monthName} ${year} (1 ${monthName} ${year} – ${lastDayOfMonth} ${monthName} ${year})`;

    // Masking rekening bank (hanya 4 digit terakhir)
    const maskedAccountNumber = bankAccountNumber
      ? bankAccountNumber.trim().length > 4
        ? `****${bankAccountNumber.trim().slice(-4)}`
        : bankAccountNumber.trim()
      : "—";

    // Format tanggal dokumen dibuat / diterbitkan
    const formatFullDateTime = (dateStr?: string | null) => {
      if (!dateStr) {
        return `${lastDayOfMonth} ${monthName} ${year} WIB`;
      }
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return `${lastDayOfMonth} ${monthName} ${year} WIB`;
        const day = d.getDate();
        const m = MONTHS[d.getMonth()] || monthName;
        const y = d.getFullYear();
        const hrs = String(d.getHours()).padStart(2, "0");
        const mins = String(d.getMinutes()).padStart(2, "0");
        return `${day} ${m} ${y} pukul ${hrs}.${mins} WIB`;
      } catch {
        return `${lastDayOfMonth} ${monthName} ${year} WIB`;
      }
    };

    const formatDateShort = (dateStr?: string | null) => {
      if (!dateStr) return `${lastDayOfMonth} ${monthName} ${year}`;
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return `${lastDayOfMonth} ${monthName} ${year}`;
        return `${d.getDate()} ${MONTHS[d.getMonth()] || monthName} ${d.getFullYear()}`;
      } catch {
        return `${lastDayOfMonth} ${monthName} ${year}`;
      }
    };

    const documentDateWib = formatFullDateTime(updatedAt || createdAt);
    const approvalDate = formatDateShort(updatedAt || createdAt);

    // Overtime processing
    const sortedSessions = (overtimeDetail || [])
      .slice()
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    const formatSessionDate = (dateStr: string) => {
      try {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          const d = parseInt(parts[2], 10);
          const m = parseInt(parts[1], 10);
          const y = parts[0];
          const mName = MONTHS[m - 1] || parts[1];
          return `${d} ${mName} ${y}`;
        }
        return dateStr;
      } catch {
        return dateStr;
      }
    };

    return (
      <div className="w-full flex flex-col items-center ab-animate-fadeIn">
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #print-section, #print-section * {
              visibility: visible;
            }
            #print-section {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              border: none !important;
              box-shadow: none !important;
              padding: 12mm 15mm !important;
            }
            .no-print {
              display: none !important;
            }
          }
        `}</style>

        <div
          id="print-section"
          ref={ref}
          className="bg-white text-gray-900 p-10 md:p-12 mx-auto shadow-sm rounded-none border border-gray-200 shrink-0"
          style={{
            fontFamily:
              "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            width: "210mm",
            minHeight: "297mm",
            boxSizing: "border-box",
          }}
        >
          {/* Top Double Line Accent (Emas/Cokelat Korporat) */}
          <div className="w-full flex items-center justify-between gap-3 mb-6">
            <div className="h-[2px] bg-[#9B7B47]/80 flex-1 border-b border-[#9B7B47]/40 pb-[1px]" />
            <div className="w-2.5 h-2.5 rotate-45 border border-[#9B7B47] bg-[#9B7B47]/20" />
            <div className="h-[2px] bg-[#9B7B47]/80 flex-1 border-b border-[#9B7B47]/40 pb-[1px]" />
          </div>

          {/* Header Kop Dokumen */}
          <div className="flex justify-between items-start gap-6 pb-6 border-b border-gray-200">
            {/* Logo & Identitas Perusahaan */}
            <div className="flex items-start gap-4">
              <img
                src={`/logos/${finalCompany.toLowerCase()}.png`}
                alt={COMPANY_NAMES[finalCompany]}
                className="h-14 w-auto object-contain shrink-0"
              />
              <div className="space-y-1 max-w-md">
                <h2 className="text-base font-black tracking-wide text-gray-900 uppercase">
                  {COMPANY_NAMES[finalCompany]}
                </h2>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  {COMPANY_TAGLINES[finalCompany]}
                </p>
                <p className="text-[10px] text-gray-600 leading-relaxed">
                  {OFFICE_ADDRESS}
                </p>
              </div>
            </div>

            {/* Judul Slip Gaji di Kanan */}
            <div className="text-right shrink-0">
              <h1 className="text-2xl font-black uppercase tracking-wider text-gray-900">
                SLIP GAJI
              </h1>
              <p className="text-xs font-bold uppercase tracking-widest text-[#9B7B47] mt-0.5">
                {monthName} {year}
              </p>
            </div>
          </div>

          {/* Section 1: Metadata 2 Kolom (Informasi Karyawan & Dokumen) */}
          <div className="grid grid-cols-2 gap-8 my-6 text-[12px]">
            {/* Kolom Kiri: Informasi Karyawan */}
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-500 pb-1.5 border-b border-gray-200 mb-3">
                Informasi Karyawan
              </h3>
              <div className="space-y-2">
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Nama</span>
                  <span className="text-gray-400">:</span>
                  <span className="font-bold text-gray-900">{finalName}</span>
                </div>
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Jabatan</span>
                  <span className="text-gray-400">:</span>
                  <span className="font-semibold text-gray-800">{finalPosition || "—"}</span>
                </div>
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Departemen</span>
                  <span className="text-gray-400">:</span>
                  <span className="text-gray-800">{departmentName || "—"}</span>
                </div>
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Status kerja</span>
                  <span className="text-gray-400">:</span>
                  <span className="text-gray-800">{employmentStatus || "Karyawan tetap"}</span>
                </div>
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Periode gaji</span>
                  <span className="text-gray-400">:</span>
                  <span className="text-gray-800">{periodRange}</span>
                </div>
              </div>
            </div>

            {/* Kolom Kanan: Dokumen */}
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-500 pb-1.5 border-b border-gray-200 mb-3">
                Dokumen
              </h3>
              <div className="space-y-2">
                <div className="grid grid-cols-[90px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Status</span>
                  <span className="text-gray-400">:</span>
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      Disetujui
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-[90px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Dibuat</span>
                  <span className="text-gray-400">:</span>
                  <span className="text-gray-800">{documentDateWib}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Rincian Finansial 2 Kolom (Pendapatan vs Potongan) */}
          <div className="grid grid-cols-2 gap-8 my-6 text-[12px]">
            {/* Kolom Kiri: PENDAPATAN */}
            <div className="flex flex-col justify-between border-t border-gray-300 pt-3">
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-700 pb-1 border-b border-gray-200 mb-3">
                  Pendapatan
                </h3>
                <div className="space-y-2 text-gray-800">
                  <div className="flex justify-between items-baseline">
                    <span>Gaji Pokok</span>
                    <span className="font-mono font-medium">{formatCurrency(baseSalary)}</span>
                  </div>
                  {mobilityAllowance > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span>Allowance / Tunjangan</span>
                      <span className="font-mono font-medium">{formatCurrency(mobilityAllowance)}</span>
                    </div>
                  )}
                  {performanceBonus > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span>Bonus Performa</span>
                      <span className="font-mono font-medium">{formatCurrency(performanceBonus)}</span>
                    </div>
                  )}
                  {overtimePay > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span>Upah Lembur</span>
                      <span className="font-mono font-medium">{formatCurrency(overtimePay)}</span>
                    </div>
                  )}
                  {additionsDetail && additionsDetail.length > 0 && (
                    <div className="pt-1 space-y-1.5">
                      {additionsDetail.map((add, idx) => (
                        <div key={idx} className="flex justify-between items-baseline text-gray-700">
                          <span className="pl-2 border-l-2 border-gray-200 text-[11px]">{add.name}</span>
                          <span className="font-mono font-medium">{formatCurrency(add.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Total Pendapatan Bruto */}
              <div className="border-t-2 border-gray-300 pt-3 mt-6 flex justify-between items-baseline">
                <span className="font-black text-gray-900 uppercase tracking-wide">
                  Total pendapatan (bruto)
                </span>
                <span className="font-black font-mono text-gray-900 text-sm">
                  {formatCurrency(grossIncome)}
                </span>
              </div>
            </div>

            {/* Kolom Kanan: POTONGAN */}
            <div className="flex flex-col justify-between border-t border-gray-300 pt-3">
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-700 pb-1 border-b border-gray-200 mb-3">
                  Potongan
                </h3>
                <div className="space-y-2 text-gray-800">
                  {deductionsDetail && deductionsDetail.length > 0 ? (
                    deductionsDetail.map((ded, idx) => (
                      <div key={idx} className="flex justify-between items-baseline text-gray-700">
                        <span>{ded.name}</span>
                        <span className="font-mono font-medium text-rose-700">
                          {formatCurrency(ded.amount)}
                        </span>
                      </div>
                    ))
                  ) : deductions > 0 ? (
                    <div className="flex justify-between items-baseline text-gray-700">
                      <span>{deductionNotes || "Potongan Lainnya"}</span>
                      <span className="font-mono font-medium text-rose-700">
                        {formatCurrency(deductions)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-gray-400 italic py-1">Tidak ada potongan</div>
                  )}
                </div>
              </div>

              {/* Total Potongan */}
              <div className="border-t-2 border-gray-300 pt-3 mt-6 flex justify-between items-baseline">
                <span className="font-black text-gray-900 uppercase tracking-wide">
                  Total potongan
                </span>
                <span className="font-black font-mono text-rose-700 text-sm">
                  {deductions > 0 ? `(${formatCurrency(deductions)})` : formatCurrency(0)}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Highlight Banner TAKE HOME PAY (Gold/Beige Theme) */}
          <div className="bg-[#FAF6EC] border border-[#E7DDCA] rounded-sm px-6 py-4 my-6 flex justify-between items-center shadow-xs">
            <div>
              <h3 className="font-black text-xs uppercase tracking-wider text-[#5A4522]">
                GAJI BERSIH DITERIMA (TAKE HOME PAY)
              </h3>
              <p className="text-[11px] text-[#7A6338] italic mt-0.5">
                Total pendapatan dikurangi total potongan.
              </p>
            </div>
            <div className="text-2xl font-black font-mono text-[#382B12] tracking-tight">
              {formatCurrency(thp)}
            </div>
          </div>

          {/* Section 4: Breakdown Sesi Lembur (Jika Ada Sesi) */}
          {sortedSessions.length > 0 && (
            <div className="my-6 border border-gray-200 rounded-sm p-4 bg-gray-50/50">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-700 mb-2">
                Rincian Upah Lembur
              </h4>
              <table className="w-full text-[11px] border-collapse border border-gray-300 bg-white">
                <thead>
                  <tr className="bg-gray-100 text-gray-800">
                    <th className="border border-gray-300 px-2.5 py-1.5 text-left font-bold">Tanggal Lembur</th>
                    <th className="border border-gray-300 px-2.5 py-1.5 text-center font-bold">Total Jam Lembur</th>
                    <th className="border border-gray-300 px-2.5 py-1.5 text-right font-bold">Nominal Total Lembur</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSessions.map((ot, idx) => {
                    const mins = ot.durationMinutes || 0;
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    const durationStr = ot.hoursFormatted || `${h} Jam ${m > 0 ? `${m} Menit` : ""}`.trim();

                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{formatSessionDate(ot.date)}</span>
                            {ot.dayType === "weekend" && (
                              <span className="text-[9px] text-purple-700 bg-purple-50 px-1 rounded border border-purple-200 font-medium">
                                Weekend
                              </span>
                            )}
                            {ot.dayType === "holiday" && (
                              <span className="text-[9px] text-rose-700 bg-rose-50 px-1 rounded border border-rose-200 font-medium">
                                Libur
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="border border-gray-300 px-2.5 py-1.5 text-center font-mono">{durationStr}</td>
                        <td className="border border-gray-300 px-2.5 py-1.5 text-right font-mono font-medium">{formatCurrency(ot.pay || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td colSpan={2} className="border border-gray-300 px-2.5 py-1.5 text-right font-bold text-gray-800">
                      Total Upah Lembur
                    </td>
                    <td className="border border-gray-300 px-2.5 py-1.5 text-right font-mono font-bold text-gray-900">
                      {formatCurrency(overtimePay)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {overtimeNotes && (
                <p className="text-[10px] text-gray-500 italic mt-1.5 leading-tight">
                  Catatan lembur: {overtimeNotes}
                </p>
              )}
            </div>
          )}

          {/* Catatan Slip Gaji (Jika Ada) */}
          {notes && (
            <div className="my-4 p-3 bg-gray-50 border-l-2 border-[#9B7B47] text-[11px] text-gray-700">
              <span className="font-bold text-gray-900 block mb-0.5">Catatan:</span>
              <p className="whitespace-pre-wrap">{notes}</p>
            </div>
          )}

          {/* Section 5: Dua Kolom Bawah (Informasi Pembayaran & Persetujuan) */}
          <div className="grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-gray-200 text-[12px]">
            {/* Kolom Kiri: Informasi Pembayaran */}
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-500 pb-1.5 border-b border-gray-200 mb-3">
                Informasi Pembayaran
              </h3>
              <div className="space-y-2">
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Bank</span>
                  <span className="text-gray-400">:</span>
                  <span className="font-semibold text-gray-900">{bankName || "BCA"}</span>
                </div>
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Rekening</span>
                  <span className="text-gray-400">:</span>
                  <span className="font-mono text-gray-900">{maskedAccountNumber}</span>
                </div>
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Atas nama</span>
                  <span className="text-gray-400">:</span>
                  <span className="font-semibold text-gray-900">{bankAccountName || finalName}</span>
                </div>
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Status</span>
                  <span className="text-gray-400">:</span>
                  <span className="font-semibold text-emerald-700">Dibayar</span>
                </div>
                <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Tanggal bayar</span>
                  <span className="text-gray-400">:</span>
                  <span className="text-gray-800">{approvalDate}</span>
                </div>
                {paymentReference && (
                  <div className="grid grid-cols-[105px_10px_1fr] items-baseline">
                    <span className="text-gray-500 font-medium">Ref. pembayaran</span>
                    <span className="text-gray-400">:</span>
                    <span className="font-mono text-gray-700 text-[11px]">{paymentReference}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Kolom Kanan: Persetujuan HR & Penerima */}
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-500 pb-1.5 border-b border-gray-200 mb-3">
                Persetujuan
              </h3>
              <div className="space-y-2 mb-4">
                <div className="grid grid-cols-[90px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Disetujui</span>
                  <span className="text-gray-400">:</span>
                  <span className="font-bold text-gray-900">{approvedByName}</span>
                </div>
                <div className="grid grid-cols-[90px_10px_1fr] items-baseline">
                  <span className="text-gray-500 font-medium">Tanggal</span>
                  <span className="text-gray-400">:</span>
                  <span className="text-gray-800">{approvalDate}</span>
                </div>
              </div>

              {/* Slot Tanda Tangan Digital & Penandatangan */}
              <div className="pt-2">
                {/* Area Tanda Tangan */}
                <div className="h-16 flex items-end">
                  {/* Placeholder garis tanda tangan siap pakai */}
                  <div className="w-48 border-b border-gray-400 pb-1">
                    <p className="text-[10px] text-gray-400 italic">Disetujui secara digital</p>
                  </div>
                </div>
                <div className="mt-1.5">
                  <p className="font-black text-gray-900 text-xs">{approvedByName}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Human Resources Manager</p>
                </div>
              </div>
            </div>
          </div>

          {/* Kolom Tanda Tangan Penerima di Bawah */}
          <div className="flex justify-end mt-6 text-xs text-right">
            <div className="w-52 text-left">
              <p className="text-gray-500 text-[11px] mb-8 font-medium">Penerima,</p>
              <div className="border-b border-gray-400 pb-1 mb-1">
                <p className="font-bold text-gray-900">{finalName}</p>
              </div>
              <p className="text-[10px] text-gray-500">{finalPosition}</p>
            </div>
          </div>

          {/* Section 6: Footer Kerahasiaan & Keamanan */}
          <div className="mt-12 pt-4 border-t border-gray-200">
            <p className="text-[10px] text-center text-gray-400 leading-normal mb-2">
              RAHASIA: Slip gaji ini hanya untuk karyawan yang bersangkutan. Hubungi HR bila ada ketidaksesuaian.
            </p>
            <div className="flex justify-between items-center text-[9px] text-gray-400 uppercase tracking-widest font-mono">
              <span>Dibuat secara aman oleh NovaCore HR System</span>
              <span>Confidential</span>
            </div>
          </div>
        </div>

        {/* Tombol Cetak / PDF untuk tampilan browser */}
        <button
          onClick={() => window.print()}
          className="no-print mt-8 mb-8 flex items-center justify-center gap-3 px-8 py-3.5 bg-[var(--ab-primary)] hover:bg-[var(--ab-primary-glow)] text-white rounded-2xl transition-all shadow-lg active:scale-95"
        >
          <Printer size={18} />
          <span className="font-black uppercase tracking-widest text-xs">
            Cetak / Download PDF
          </span>
        </button>
      </div>
    );
  },
);

PayslipPrintView.displayName = "PayslipPrintView";
