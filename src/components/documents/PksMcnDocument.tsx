"use client";

import React from "react";
import type { PksMcnData, PksCreatorCalendar } from "@/types/pks";
import {
  terbilang,
  terbilangRupiah,
  formatRupiah,
  formatTanggalLegal,
  formatTanggalId,
} from "@/lib/terbilang";
import { DynamicPksPaginator } from "./DynamicPksPaginator";

const THEME_STYLES: Record<
  string,
  { headerBg: string; subHeaderBg: string; slotBg: string; text: string }
> = {
  blue: {
    headerBg: "#99b3ec",
    subHeaderBg: "#c9daf8",
    slotBg: "#8ea9db",
    text: "#000000",
  },
  pink: {
    headerBg: "#f4bfe0",
    subHeaderBg: "#f9d5ea",
    slotBg: "#e691d8",
    text: "#000000",
  },
  purple: {
    headerBg: "#d9b3ff",
    subHeaderBg: "#ebd9fc",
    slotBg: "#c28dfc",
    text: "#000000",
  },
  emerald: {
    headerBg: "#a8e6cf",
    subHeaderBg: "#dcedc1",
    slotBg: "#88d8b0",
    text: "#000000",
  },
};

interface CalendarCell {
  dateNumber: number | null;
  label?: string;
  slotKey: string;
}

// Layout baku 5 minggu kalender (berawal di hari Rabu seperti kalender resmi TAVI x TNT)
const DEFAULT_CALENDAR_WEEKS: CalendarCell[][] = [
  [
    { dateNumber: null, slotKey: "empty_0_0" },
    { dateNumber: null, slotKey: "empty_0_1" },
    { dateNumber: null, slotKey: "empty_0_2" },
    { dateNumber: 30, label: "30 Sept", slotKey: "prev_30" },
    { dateNumber: 1, slotKey: "1" },
    { dateNumber: 2, slotKey: "2" },
    { dateNumber: 3, slotKey: "3" },
  ],
  [
    { dateNumber: 4, slotKey: "4" },
    { dateNumber: 5, slotKey: "5" },
    { dateNumber: 6, slotKey: "6" },
    { dateNumber: 7, slotKey: "7" },
    { dateNumber: 8, slotKey: "8" },
    { dateNumber: 9, slotKey: "9" },
    { dateNumber: 10, slotKey: "10" },
  ],
  [
    { dateNumber: 11, slotKey: "11" },
    { dateNumber: 12, slotKey: "12" },
    { dateNumber: 13, slotKey: "13" },
    { dateNumber: 14, slotKey: "14" },
    { dateNumber: 15, slotKey: "15" },
    { dateNumber: 16, slotKey: "16" },
    { dateNumber: 17, slotKey: "17" },
  ],
  [
    { dateNumber: 18, slotKey: "18" },
    { dateNumber: 19, slotKey: "19" },
    { dateNumber: 20, slotKey: "20" },
    { dateNumber: 21, slotKey: "21" },
    { dateNumber: 22, slotKey: "22" },
    { dateNumber: 23, slotKey: "23" },
    { dateNumber: 24, slotKey: "24" },
  ],
  [
    { dateNumber: 25, slotKey: "25" },
    { dateNumber: 26, slotKey: "26" },
    { dateNumber: 27, slotKey: "27" },
    { dateNumber: 28, slotKey: "28" },
    { dateNumber: 29, slotKey: "29" },
    { dateNumber: 30, slotKey: "30" },
    { dateNumber: 31, slotKey: "31" },
  ],
];

function CreatorCalendarView({
  roster,
}: {
  roster: PksCreatorCalendar;
}) {
  const theme = THEME_STYLES[roster.themeColor || "blue"] || THEME_STYLES.blue;

  return (
    <div className="space-y-1 mb-4 last:mb-0">
      <p className="font-bold text-[12.5px] text-left">
        {roster.targetInfo || `${roster.creatorName} - (${roster.monthName})`}
      </p>

      <table className="w-full border-collapse border border-black text-[10.5px]">
        <thead>
          <tr>
            <th
              colSpan={7}
              className="border border-black py-0.5 text-center font-bold uppercase tracking-wider text-[11px]"
              style={{ backgroundColor: theme.headerBg }}
            >
              {roster.monthName || "OKTOBER"}
            </th>
          </tr>
          <tr style={{ backgroundColor: theme.subHeaderBg }}>
            <th className="border border-black py-0.5 w-[14.28%] text-center font-bold">Minggu</th>
            <th className="border border-black py-0.5 w-[14.28%] text-center font-bold">Senin</th>
            <th className="border border-black py-0.5 w-[14.28%] text-center font-bold">Selasa</th>
            <th className="border border-black py-0.5 w-[14.28%] text-center font-bold">Rabu</th>
            <th className="border border-black py-0.5 w-[14.28%] text-center font-bold">Kamis</th>
            <th className="border border-black py-0.5 w-[14.28%] text-center font-bold">Jumat</th>
            <th className="border border-black py-0.5 w-[14.28%] text-center font-bold">Sabtu</th>
          </tr>
        </thead>
        <tbody>
          {DEFAULT_CALENDAR_WEEKS.map((week, wIdx) => (
            <tr key={`week-${wIdx}`} className="h-[36px]">
              {week.map((cell, cIdx) => {
                const slotText =
                  roster.slots[cell.slotKey] ||
                  (cell.dateNumber !== null ? roster.slots[String(cell.dateNumber)] : undefined);

                return (
                  <td
                    key={`cell-${wIdx}-${cIdx}`}
                    className="border border-black p-0.5 align-top relative bg-white"
                  >
                    {cell.dateNumber !== null && (
                      <div className="text-right text-[10px] font-semibold pr-0.5 leading-none">
                        {cell.label || cell.dateNumber}
                      </div>
                    )}
                    {slotText && (
                      <div
                        className="mt-0.5 px-0.5 py-0.5 text-center text-[9px] font-bold leading-tight border border-black/20"
                        style={{ backgroundColor: theme.slotBg, color: theme.text }}
                      >
                        {slotText}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Catatan Promo *Note: */}
      {roster.notes && roster.notes.length > 0 && (
        <div className="pt-0.5 text-[10.5px] leading-snug flex items-start gap-4 pl-1">
          <span className="font-bold shrink-0">*Note:</span>
          <div className="space-y-0.5">
            {roster.notes.map((note, nIdx) => (
              <div key={nIdx} className="flex gap-6">
                <span className="w-24 shrink-0 font-medium">{note.date}</span>
                <span className="text-black">{note.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  data: PksMcnData;
}

export function PksMcnDocument({ data }: Props) {
  const { header, client, agency, deliverables, term, financial, legal, schedule } = data;

  const creatorsText = deliverables.creators
    .map((c) => `${c.name} (${c.sessions} sesi)`)
    .join(" dan ");

  const creatorsNamesOnly = deliverables.creators.map((c) => c.name).join(" dan ");

  const taxName =
    financial.taxType === "pph_0_5"
      ? "Pajak Penghasilan (PPh) sebesar 0,5%"
      : financial.taxType === "pph_23"
        ? "Pajak Penghasilan (PPh 23) sebesar 2%"
        : financial.taxType === "ppn_11"
          ? "Pajak Pertambahan Nilai (PPN) sebesar 11%"
          : "Bebas Pajak";

  // ── MODULAR BLOCKS DENGAN FLOW OTOMATIS A4 ─────────────────────────
  const blocks: React.ReactNode[] = [
    /* 1. Header Title */
    <div key="b-header" className="text-center pt-2 pb-2">
      <h1 className="text-[17px] font-bold tracking-wide uppercase">
        PERJANJIAN KERJASAMA
      </h1>
      <h2 className="text-[17px] font-bold tracking-wide uppercase mt-1">
        {client.name.toUpperCase()}{" "}
        {client.brandName ? `("${client.brandName.toUpperCase()}")` : ""}
      </h2>
      <p className="text-[16px] font-bold tracking-wide uppercase my-1">
        DENGAN
      </p>
      <h2 className="text-[17px] font-bold tracking-wide uppercase">
        {agency.companyLegalName.toUpperCase()}
      </h2>
      <p className="text-[14px] mt-2 font-normal">
        Nomor: {header.contractNumber}
      </p>
      <div className="w-full h-[1.5px] bg-black my-3" />
    </div>,

    /* 2. Pembukaan & Komparisi Para Pihak */
    <div key="b-komparisi" className="space-y-3">
      <p className="text-justify indent-8">
        Pada hari ini, {formatTanggalLegal(header.signDate)} telah ditandatangani
        Perjanjian Kerjasama ini (selanjutnya disebut &ldquo;Perjanjian&rdquo;),
        oleh dan antara pihak-pihak yang bertanda tangan di bawah ini:
      </p>

      <ol className="list-decimal pl-6 space-y-2 text-justify">
        <li>
          <strong>{client.name}</strong>{" "}
          {client.brandName && ` (“${client.brandName}”)`}, suatu{" "}
          {client.entityType} yang didirikan berdasarkan hukum Negara Republik
          Indonesia, beralamat di {client.address}, yang dalam hal ini diwakili
          oleh <strong>{client.signeeName}</strong> selaku{" "}
          <strong>{client.signeePosition}</strong>, oleh karenanya sah bertindak
          mewakili {client.signeeBasis} untuk bertindak dan atas nama{" "}
          {client.name}
          {client.brandName ? ` ("${client.brandName}")` : ""}, untuk selanjutnya
          disebut sebagai---------------------------------
          <strong>PIHAK PERTAMA</strong>.
        </li>

        <div className="py-0.5 text-center font-bold tracking-widest text-[13px]">
          Dan
        </div>

        <li>
          <strong>{agency.companyLegalName}</strong> (
          <strong>“{agency.tradeName}”</strong>), suatu perseroan terbatas yang
          didirikan berdasarkan hukum Negara Republik Indonesia, berdomisili di{" "}
          {agency.address}, yang dalam hal ini diwakili oleh{" "}
          <strong>{agency.signeeName}</strong> selaku{" "}
          <strong>{agency.signeePosition}</strong>, oleh karenanya sah bertindak
          mewakili Direksi untuk bertindak dan atas nama{" "}
          {agency.companyLegalName} (<strong>“{agency.tradeName}”</strong>),
          untuk selanjutnya disebut sebagai---------------------------------
          <strong>PIHAK KEDUA</strong>.
        </li>
      </ol>

      <p className="text-justify pt-1">
        <strong>PIHAK PERTAMA</strong> dan <strong>PIHAK KEDUA</strong> secara
        bersama-sama disebut sebagai <strong>“PARA PIHAK”</strong>.
      </p>
    </div>,

    /* 3. Konsideran */
    <div key="b-konsideran" className="space-y-2">
      <p className="font-semibold">
        PARA PIHAK terlebih dahulu menerangkan hal-hal sebagai berikut:
      </p>
      <ol className="list-[lower-alpha] pl-6 space-y-1 text-justify">
        <li>
          Bahwa PIHAK KEDUA adalah perusahaan yang bergerak di bidang jasa
          kreatif digital dan affiliate marketing, termasuk pengelolaan content
          creator (multi-channel network) dan penyelenggaraan siaran langsung
          (live streaming) di platform {deliverables.platform};
        </li>
        <li>
          Bahwa PIHAK PERTAMA bermaksud menggunakan jasa PIHAK KEDUA untuk
          menjalankan program pemasaran berupa &ldquo;{deliverables.programName}&rdquo;
          sebagaimana diatur dalam Perjanjian ini;
        </li>
        <li>
          Bahwa PIHAK KEDUA menyatakan sanggup dan bersedia untuk melaksanakan
          program dimaksud sesuai dengan syarat dan ketentuan dalam Perjanjian
          ini.
        </li>
      </ol>
      <p className="text-justify pt-1">
        Selanjutnya PARA PIHAK sepakat untuk mengikatkan diri dalam Perjanjian
        dengan ketentuan-ketentuan sebagai berikut:
      </p>
    </div>,

    /* 4. PASAL 1 (Ruang Lingkup) */
    <div key="b-pasal-1" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 1</h3>
        <h4 className="font-bold text-[15px] uppercase">RUANG LINGKUP KERJASAMA</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK KEDUA memberikan layanan pengelolaan siaran langsung (live
          streaming) kepada PIHAK PERTAMA, berupa perencanaan strategi,
          pengelolaan content creator dan affiliator, serta pelaksanaan sesi
          siaran langsung produk PIHAK PERTAMA melalui platform{" "}
          {deliverables.platform}.
        </li>
        <li>
          Layanan sebagaimana dimaksud pada ayat 1 (satu) Pasal ini akan
          dilaksanakan sepanjang masa berlaku Perjanjian ini, dengan tujuan untuk
          mendukung kegiatan pemasaran serta meningkatkan performa penjualan
          produk PIHAK PERTAMA.
        </li>
        <li>
          Agar mencapai tujuan sebagaimana dimaksud pada Pasal ini, PIHAK KEDUA
          akan melaksanakan program &ldquo;{deliverables.programName}&rdquo; (selanjutnya
          disebut sebagai &ldquo;Program&rdquo;) untuk kepentingan PIHAK PERTAMA
          dengan rincian pekerjaan (&ldquo;Deliverables&rdquo;) sebagai berikut:
          <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
            <li>
              Content creator yang ditugaskan ialah {creatorsNamesOnly} (&ldquo;Creator&rdquo;).
            </li>
            <li>
              Jumlah sesi sebanyak {creatorsText}, dengan total{" "}
              {deliverables.totalSessions} ({terbilang(deliverables.totalSessions)})
              sesi siaran langsung melalui platform {deliverables.platform}.
            </li>
            <li>
              Durasi minimal per sesi ialah {deliverables.sessionDuration} (
              {terbilang(deliverables.sessionDuration)}) menit.
            </li>
            <li>
              Jadwal siaran langsung sebagaimana tercantum dalam Lampiran I
              Perjanjian ini bersifat fleksibel dan dapat disesuaikan berdasarkan
              kesepakatan tertulis PARA PIHAK.
            </li>
          </ol>
        </li>
        <li>
          PIHAK KEDUA tidak bertanggung jawab atas keterlambatan pelaksanaan sesi
          siaran langsung serta tidak tercapainya target performa yang disebabkan
          oleh faktor di luar kendali PIHAK KEDUA, termasuk pembatasan algoritma
          platform, kondisi stok, harga, dan faktor di luar kendali lainnya.
        </li>
        <li>
          PIHAK KEDUA dianggap telah memenuhi kewajibannya apabila telah
          melaksanakan seluruh {deliverables.totalSessions} (
          {terbilang(deliverables.totalSessions)}) sesi siaran langsung sesuai
          dengan ruang lingkup pekerjaan yang disepakati, terlepas dari tercapai
          atau tidaknya target penjualan PIHAK PERTAMA.
        </li>
      </ol>
    </div>,

    /* 5. PASAL 2 (Jangka Waktu) */
    <div key="b-pasal-2" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 2</h3>
        <h4 className="font-bold text-[15px] uppercase">JANGKA WAKTU</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Perjanjian ini berlaku mengikat bagi PARA PIHAK terhitung sejak tanggal{" "}
          <strong>{formatTanggalId(term.startDate)}</strong> sampai dengan{" "}
          <strong>{formatTanggalId(term.endDate)}</strong>.
        </li>
        <li>
          Pelaksanaan program sesi siaran langsung pertama (First Live) oleh
          Creator pada platform {deliverables.platform} ditargetkan dimulai pada
          tanggal {formatTanggalId(term.firstLiveDate)} dan berakhir pada tanggal{" "}
          {formatTanggalId(term.endDate)}.
        </li>
        <li>
          Perjanjian ini dapat diubah dan/atau diperpanjang atas dasar kesepakatan
          tertulis PARA PIHAK dalam bentuk addendum.
        </li>
        <li>
          Pihak yang bermaksud mengajukan perpanjangan harus menyampaikan
          pemberitahuan tertulis paling lambat {term.noticeDays} (
          {terbilang(term.noticeDays)}) hari kalender sebelum tanggal berakhir.
        </li>
        <li>
          Apabila dalam waktu {term.replyDays} ({terbilang(term.replyDays)}) hari
          kalender tidak ada tanggapan tertulis, Perjanjian dianggap berakhir
          pada tanggal yang disepakati.
        </li>
      </ol>
    </div>,

    /* 6. PASAL 3 (Nilai Kontrak & Pembayaran) */
    <div key="b-pasal-3" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 3</h3>
        <h4 className="font-bold text-[15px] uppercase">NILAI KONTRAK DAN CARA PEMBAYARAN</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Harga yang disepakati dalam Perjanjian ini adalah sebesar{" "}
          <strong>{formatRupiah(financial.contractValue)} (
          {terbilangRupiah(financial.contractValue)})</strong> sebelum pajak
          (selanjutnya disebut &ldquo;Nilai Kontrak&rdquo;).
        </li>
        <li>
          Nilai Kontrak tersebut dikenakan {taxName}, yaitu sebesar{" "}
          <strong>{formatRupiah(financial.taxAmount)} (
          {terbilangRupiah(financial.taxAmount)})</strong>, sehingga Total
          Pembayaran adalah sebesar <strong>{formatRupiah(financial.totalAmount)} (
          {terbilangRupiah(financial.totalAmount)})</strong>.
        </li>
        <li>
          Pembayaran dilakukan melalui transfer ke rekening resmi PIHAK KEDUA:
          <div className="pl-4 py-1 font-mono text-[13px] leading-relaxed">
            <p>Bank : {financial.bank.bankName}</p>
            <p>Nama Rekening : {financial.bank.accountName}</p>
            <p>Nomor Rekening : {financial.bank.accountNumber}</p>
            {financial.bank.kcp && <p>KCP : {financial.bank.kcp}</p>}
          </div>
        </li>
        <li>
          Total pembayaran merupakan imbalan jasa dan tidak bergantung pada
          faktor lain sepanjang kewajiban telah dilaksanakan.
        </li>
        <li>
          Seluruh pembayaran yang telah dilakukan bersifat tidak dapat diminta
          kembali (<em>non-refundable</em>).
        </li>
        <li>
          Pajak dilaksanakan sesuai peraturan perundang-undangan yang berlaku.
        </li>
        <li>
          Apabila terjadi keterlambatan pembayaran, PIHAK KEDUA berhak menunda
          atau menghentikan sesi siaran langsung tanpa mengurangi hak atas
          pembayaran.
        </li>
      </ol>
    </div>,

    /* 7. PASAL 4 (Hak & Kewajiban Pihak Pertama) */
    <div key="b-pasal-4" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 4</h3>
        <h4 className="font-bold text-[15px] uppercase">HAK DAN KEWAJIBAN PIHAK PERTAMA</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK PERTAMA berhak menerima laporan akhir pelaksanaan Program dari
          PIHAK KEDUA.
        </li>
        <li>
          PIHAK PERTAMA berhak memberikan masukan, dengan keputusan akhir
          konsep tetap pada PIHAK KEDUA.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban menyediakan sampel produk, brief, materi
          promosi, dan kepastian stok tepat waktu.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban memastikan etalase toko dan promo siap pada
          setiap jadwal siaran langsung.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban melakukan pembayaran sesuai Pasal 3.
        </li>
        <li>
          PIHAK PERTAMA menjamin seluruh produk diedarkan secara sah dan memiliki
          izin edar resmi serta tidak melanggar HAKI pihak ketiga.
        </li>
        <li>
          PIHAK KEDUA berhak menolak atau menghentikan siaran langsung produk yang
          berpotensi melanggar ketentuan hukum atau platform.
        </li>
      </ol>
    </div>,

    /* 8. PASAL 5 (Hak & Kewajiban Pihak Kedua) */
    <div key="b-pasal-5" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 5</h3>
        <h4 className="font-bold text-[15px] uppercase">HAK DAN KEWAJIBAN PIHAK KEDUA</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK KEDUA berhak menerima pembayaran penuh sesuai Pasal 3.
        </li>
        <li>
          PIHAK KEDUA berhak menentukan konsep, strategi, dan alur pelaksanaan
          siaran langsung.
        </li>
        <li>
          PIHAK KEDUA berhak menolak permintaan perubahan di luar ruang lingkup
          yang telah disepakati.
        </li>
        <li>
          PIHAK KEDUA berhak mengatur penugasan Creator yang dikelolanya.
        </li>
        <li>
          PIHAK KEDUA berkewajiban melaksanakan Program sesuai dengan ruang
          lingkup kerjasama.
        </li>
      </ol>
    </div>,

    /* 9. PASAL 6 (Force Majeure) */
    <div key="b-pasal-6" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 6</h3>
        <h4 className="font-bold text-[15px] uppercase">KEADAAN KAHAR (FORCE MAJEURE)</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Keadaan Kahar meliputi peristiwa di luar kekuasaan seperti bencana
          alam, pandemi, gangguan elektronik/internet, perang, atau regulasi
          pemerintah.
        </li>
        <li>
          Pemberitahuan lisan wajib dalam 48 jam dan tertulis dalam 7 hari
          kalender.
        </li>
        <li>
          Kewajiban pihak terdampak dapat ditunda sementara tanpa dikenakan
          sanksi atau wanprestasi.
        </li>
        <li>
          Apabila berlangsung lebih dari 30 hari kalender, PARA PIHAK
          bermusyawarah untuk tindak lanjut Perjanjian.
        </li>
      </ol>
    </div>,

    /* 10. PASAL 7 (Kerahasiaan & Non-Circumvention) */
    <div key="b-pasal-7" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 7</h3>
        <h4 className="font-bold text-[15px] uppercase">KERAHASIAAN</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PARA PIHAK sepakat menjaga kerahasiaan data dan dokumen yang diperoleh
          selama kerjasama.
        </li>
        <li>
          PIHAK PERTAMA dilarang menghubungi atau bekerjasama langsung dengan
          content creator tanpa izin tertulis PIHAK KEDUA selama perjanjian dan{" "}
          <strong>{legal.nonCircumventionMonths} (
          {terbilang(legal.nonCircumventionMonths)}) bulan</strong> setelahnya.
        </li>
        <li>
          Kewajiban kerahasiaan tetap berlaku meskipun Perjanjian telah berakhir.
        </li>
      </ol>
    </div>,

    /* 11. PASAL 8 (Pengakhiran Perjanjian) */
    <div key="b-pasal-8" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 8</h3>
        <h4 className="font-bold text-[15px] uppercase">PEMBATALAN DAN PENGAKHIRAN PERJANJIAN</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Perjanjian dapat diakhiri atas kesepakatan tertulis PARA PIHAK.
        </li>
        <li>
          Wanprestasi yang tidak diperbaiki dalam {legal.curePeriodDays} (
          {terbilang(legal.curePeriodDays)}) hari kalender memberi hak pihak yang
          dirugikan untuk mengakhiri secara sepihak.
        </li>
        <li>
          Ketentuan Pasal 1266 KUHPerdata dikesampingkan untuk pengakhiran tanpa
          putusan pengadilan.
        </li>
        <li>
          Pelunasan atas pekerjaan yang telah berjalan wajib diselesaikan paling
          lambat 14 hari kalender sejak pengakhiran.
        </li>
      </ol>
    </div>,

    /* 12. PASAL 9, 10, 11, 12 */
    <div key="b-pasal-9-12" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 9</h3>
        <h4 className="font-bold text-[15px] uppercase">PENYELESAIAN PERSELISIHAN</h4>
      </div>
      <p>
        Perselisihan diselesaikan melalui musyawarah mufakat, dan apabila tidak
        tercapai dalam 30 hari kalender, diselesaikan melalui yurisdiksi{" "}
        <strong>{legal.courtJurisdiction}</strong>.
      </p>

      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 10</h3>
        <h4 className="font-bold text-[15px] uppercase">HAK KEKAYAAN INTELEKTUAL</h4>
      </div>
      <p>
        Hak cipta konten live streaming tetap milik creator dan PIHAK KEDUA.
        Lisensi non-eksklusif promosi wajib konfirmasi tertulis 7 hari kerja.
      </p>

      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 11</h3>
        <h4 className="font-bold text-[15px] uppercase">GANTI RUGI</h4>
      </div>
      <p>
        Pihak yang melakukan kelalaian wajib mengganti kerugian dengan batas
        tanggung jawab PIHAK KEDUA maksimal sebesar Nilai Kontrak.
      </p>

      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 12</h3>
        <h4 className="font-bold text-[15px] uppercase">LAIN-LAIN</h4>
      </div>
      <p>
        Perjanjian tunduk pada hukum Republik Indonesia, addendum tertulis, dan
        dibuat dalam rangkap 2 (dua) asli bermaterai cukup.
      </p>
    </div>,

    /* 13. Penutup & Tanda Tangan */
    <div key="b-signatures" className="space-y-4 pt-2">
      <p className="text-justify indent-8">
        Demikian Perjanjian ini dibuat dan ditandatangani oleh PARA PIHAK dengan
        penuh kesadaran dan tanpa paksaan dari pihak manapun, untuk dilaksanakan
        dan dipatuhi sebagaimana mestinya.
      </p>

      <div className="grid grid-cols-2 gap-8 pt-2">
        {/* Pihak Pertama */}
        <div className="text-center">
          <p className="font-bold text-[14px]">PIHAK PERTAMA</p>
          <p className="font-bold text-[13px] uppercase mt-1 min-h-[38px]">
            {client.name}
            {client.brandName ? ` ("${client.brandName}")` : ""}
          </p>

          <div className="h-24 my-3" />

          <p className="font-bold text-[14px] uppercase underline">
            {client.signeeName}
          </p>
          <p className="text-[13px] uppercase text-slate-700">
            {client.signeePosition}
          </p>
        </div>

        {/* Pihak Kedua */}
        <div className="text-center">
          <p className="font-bold text-[14px]">PIHAK KEDUA</p>
          <p className="font-bold text-[13px] uppercase mt-1 min-h-[38px]">
            {agency.companyLegalName}
          </p>

          <div className="h-24 my-3" />

          <p className="font-bold text-[14px] uppercase underline">
            {agency.signeeName}
          </p>
          <p className="text-[13px] uppercase text-slate-700">
            {agency.signeePosition}
          </p>
        </div>
      </div>
    </div>,

    /* 14. LAMPIRAN I (Jadwal & Roster - Wajib Halaman Baru) */
    <div
      key="b-appendix"
      data-page-break="true"
      className="pt-1 space-y-3"
    >
      <div className="text-center pt-2 pb-1">
        <h3 className="font-bold text-[15px] tracking-wide uppercase underline">
          LAMPIRAN I
        </h3>
      </div>

      {data.appendixFormat !== "table" &&
      data.calendarRosters &&
      data.calendarRosters.length > 0 ? (
        <div className="space-y-4">
          {data.calendarRosters.map((roster, idx) => (
            <CreatorCalendarView key={`roster-${idx}`} roster={roster} />
          ))}
        </div>
      ) : (
        /* Fallback / Opsi Table View */
        <div className="overflow-x-auto space-y-2">
          <div className="text-center">
            <p className="text-[13px] font-bold uppercase">
              JADWAL & ROSTER SIARAN LANGSUNG (LIVE STREAMING)
            </p>
            <p className="text-[12px] text-slate-600 mt-0.5">
              Program: {deliverables.programName} · Platform: {deliverables.platform}
            </p>
          </div>

          <table className="w-full text-left border-collapse border border-black text-[12px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-black px-2 py-1.5 text-center w-10 font-bold">
                  No
                </th>
                <th className="border border-black px-2 py-1.5 font-bold w-32">Tanggal</th>
                <th className="border border-black px-2 py-1.5 font-bold w-28">Waktu</th>
                <th className="border border-black px-2 py-1.5 font-bold w-36">Creator</th>
                <th className="border border-black px-2 py-1.5 font-bold">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {schedule.length > 0 ? (
                schedule.map((row, idx) => (
                  <tr key={idx}>
                    <td className="border border-black px-2 py-1.5 text-center">
                      {row.sessionNo || idx + 1}
                    </td>
                    <td className="border border-black px-2 py-1.5">{row.date}</td>
                    <td className="border border-black px-2 py-1.5">{row.time}</td>
                    <td className="border border-black px-2 py-1.5 font-semibold">
                      {row.creator}
                    </td>
                    <td className="border border-black px-2 py-1.5">{row.notes}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="border border-black px-3 py-4 text-center text-slate-500 italic"
                  >
                    Jadwal siaran langsung disepakati Para Pihak sebelum pelaksanaan First Live.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>,
  ];

  return <DynamicPksPaginator blocks={blocks} />;
}
