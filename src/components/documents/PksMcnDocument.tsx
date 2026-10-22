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

/**
 * Format enumerasi daftar formal EYD bahasa Indonesia:
 * - 0 item: ""
 * - 1 item: "A"
 * - 2 item: "A dan B"
 * - 3+ item: "A, B, dan C"
 */
function formatListIndonesian(items: string[]): string {
  const cleanItems = items.filter((it) => it && it.trim().length > 0);
  if (cleanItems.length === 0) return "";
  if (cleanItems.length === 1) return cleanItems[0];
  if (cleanItems.length === 2) return `${cleanItems[0]} dan ${cleanItems[1]}`;
  const allButLast = cleanItems.slice(0, -1).join(", ");
  return `${allButLast}, dan ${cleanItems[cleanItems.length - 1]}`;
}

interface Props {
  data: PksMcnData;
}

export function PksMcnDocument({ data }: Props) {
  const { header, client, agency, deliverables, term, financial, legal, schedule } = data;

  const creatorsText = formatListIndonesian(
    deliverables.creators.map((c) => `${c.name} (${c.sessions} sesi)`)
  );

  const creatorsNamesOnly = formatListIndonesian(
    deliverables.creators.map((c) => c.name)
  );

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

    /* 4. PASAL 1 (Ruang Lingkup Kerjasama) */
    <div key="b-pasal-1" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 1</h3>
        <h4 className="font-bold text-[15px] uppercase">RUANG LINGKUP KERJASAMA</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK KEDUA memberikan layanan pengelolaan siaran langsung (<em>live streaming</em>)
          kepada PIHAK PERTAMA, berupa perencanaan strategi, pengelolaan content creator
          dan affiliator, serta pelaksanaan sesi siaran langsung produk PIHAK PERTAMA melalui
          platform {deliverables.platform}.
        </li>
        <li>
          Layanan sebagaimana dimaksud pada ayat 1 (satu) Pasal ini akan dilaksanakan sepanjang
          masa berlaku Perjanjian ini, dengan tujuan untuk mendukung kegiatan pemasaran serta
          meningkatkan performa penjualan produk PIHAK PERTAMA.
        </li>
        <li>
          Agar mencapai tujuan sebagaimana dimaksud pada Pasal ini, PIHAK KEDUA akan
          melaksanakan program &ldquo;{deliverables.programName}&rdquo; (selanjutnya disebut
          sebagai &ldquo;Program&rdquo;) untuk kepentingan PIHAK PERTAMA dengan rincian pekerjaan
          (&ldquo;Deliverables&rdquo;) sebagai berikut:
          <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
            <li>
              Content creator yang ditugaskan ialah {creatorsNamesOnly} (&ldquo;Creator&rdquo;).
            </li>
            <li>
              Jumlah sesi sebanyak {creatorsText}, dengan total{" "}
              {deliverables.totalSessions} ({terbilang(deliverables.totalSessions)}) sesi siaran
              langsung melalui platform {deliverables.platform}.
            </li>
            <li>
              Durasi minimal per sesi ialah {deliverables.sessionDuration} (
              {terbilang(deliverables.sessionDuration)}) menit.
            </li>
            <li>
              Jadwal siaran langsung sebagaimana tercantum dalam Lampiran I Perjanjian ini
              bersifat fleksibel dan dapat diubah sewaktu-waktu berdasarkan kesepakatan tertulis
              PARA PIHAK, termasuk melalui media komunikasi elektronik resmi yang dapat
              dipertanggungjawabkan secara hukum.
            </li>
          </ol>
        </li>
        <li>
          PIHAK KEDUA tidak bertanggung jawab atas keterlambatan pelaksanaan sesi siaran
          langsung serta tidak tercapainya target performa yang disebabkan oleh faktor di luar
          kendali PIHAK KEDUA, termasuk namun tidak terbatas pada kebijakan platform termasuk
          pembatasan atau pemblokiran akun/siaran langsung, kondisi pasar, keterbatasan stok,
          perubahan harga, perilaku konsumen, performa konten yang menurun akibat perubahan
          algoritma platform, keterlambatan penyampaian brief atau produk oleh PIHAK PERTAMA,
          dan faktor di luar kendali lainnya.
        </li>
        <li>
          PIHAK KEDUA dianggap telah memenuhi kewajibannya apabila telah melaksanakan seluruh{" "}
          {deliverables.totalSessions} ({terbilang(deliverables.totalSessions)}) sesi siaran
          langsung sesuai dengan ruang lingkup pekerjaan yang disepakati, sebagaimana dimaksud pada
          ayat 3 (tiga) Pasal ini, terlepas dari tercapai atau tidaknya target performa penjualan
          PIHAK PERTAMA.
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
          Pelaksanaan program sesi siaran langsung pertama (<em>First Live</em>) oleh Creator yang
          dikelola PIHAK KEDUA pada platform {deliverables.platform} ditargetkan dimulai pada
          tanggal {formatTanggalId(term.firstLiveDate)} dan berakhir pada tanggal{" "}
          {formatTanggalId(term.endDate)}. Dalam periode tersebut, Creator wajib melaksanakan
          seluruh {deliverables.totalSessions} ({terbilang(deliverables.totalSessions)}) sesi
          siaran langsung.
        </li>
        <li>
          Perjanjian ini dapat diubah dan/atau diperpanjang atas dasar kesepakatan PARA PIHAK yang
          akan dituangkan dalam suatu addendum Perjanjian yang dibuat secara tertulis dan
          ditandatangani oleh PARA PIHAK.
        </li>
        <li>
          Pihak yang bermaksud untuk mengajukan perpanjangan Perjanjian, harus menyampaikan
          pemberitahuan dan/atau mengajukan kesepakatan perpanjangan secara tertulis kepada Pihak
          lainnya, dalam jangka waktu paling lambat {term.noticeDays} (
          {terbilang(term.noticeDays)}) hari kalender sebelum tanggal efektif pengakhiran. Apabila
          dalam jangka waktu {term.replyDays} ({terbilang(term.replyDays)}) hari kalender sejak
          diterimanya pemberitahuan tersebut Pihak lainnya tidak memberikan jawaban, maka
          Perjanjian ini dianggap berakhir pada tanggal berakhirnya Perjanjian sebagaimana diatur
          dalam Pasal ini dan PARA PIHAK tetap berkewajiban menyelesaikan seluruh kewajiban yang
          telah timbul sebelum berakhirnya Perjanjian.
        </li>
      </ol>
    </div>,

    /* 6. PASAL 3 (Nilai Kontrak dan Cara Pembayaran) */
    <div key="b-pasal-3" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 3</h3>
        <h4 className="font-bold text-[15px] uppercase">NILAI KONTRAK DAN CARA PEMBAYARAN</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PARA PIHAK sepakat bahwa harga yang disepakati dalam Perjanjian ini adalah sebesar{" "}
          <strong>{formatRupiah(financial.contractValue)} (
          {terbilangRupiah(financial.contractValue)})</strong> sebelum pajak (selanjutnya disebut
          &ldquo;Nilai Kontrak&rdquo;).
        </li>
        <li>
          Nilai Kontrak tersebut akan dikenakan Pajak sebesar {taxName}, yaitu sebesar{" "}
          <strong>{formatRupiah(financial.taxAmount)} (
          {terbilangRupiah(financial.taxAmount)})</strong>, sehingga total pembayaran yang wajib
          dibayarkan oleh PIHAK PERTAMA kepada PIHAK KEDUA adalah sebesar{" "}
          <strong>{formatRupiah(financial.totalAmount)} (
          {terbilangRupiah(financial.totalAmount)})</strong> (&ldquo;selanjutnya disebut Total
          Pembayaran&rdquo;).
        </li>
        <li>
          Pembayaran dilakukan melalui transfer ke rekening resmi PIHAK KEDUA sebagai berikut:
          <div className="pl-4 py-1 font-mono text-[13px] leading-relaxed">
            <p>Bank : {financial.bank.bankName}</p>
            <p>Nama Rekening : {financial.bank.accountName}</p>
            <p>Nomor Rekening : {financial.bank.accountNumber}</p>
            {financial.bank.kcp && <p>KCP : {financial.bank.kcp}</p>}
          </div>
        </li>
        <li>
          Total pembayaran tersebut merupakan imbalan jasa untuk PIHAK KEDUA dan tidak
          bergantung secara langsung pada faktor lain, sepanjang PIHAK KEDUA telah melaksanakan
          kewajibannya sesuai dengan Perjanjian ini.
        </li>
        <li>
          Seluruh pembayaran yang telah dilakukan oleh PIHAK PERTAMA kepada PIHAK KEDUA tidak
          dapat diminta kembali (<em>non-refundable</em>).
        </li>
        <li>
          Pajak yang timbul sehubungan dengan pelaksanaan Perjanjian ini dilaksanakan sesuai
          dengan ketentuan peraturan perundang-undangan yang berlaku.
        </li>
        <li>
          Apabila PIHAK PERTAMA tidak melakukan pembayaran sesuai dengan ketentuan Perjanjian ini,
          maka PIHAK KEDUA berhak untuk:
          <ol className="list-[lower-alpha] pl-5 mt-1 space-y-0.5">
            <li>Menunda pelaksanaan siaran langsung (<em>live</em>); dan/atau</li>
            <li>
              Menghentikan sementara atau seluruh aktivitas tanpa mengurangi hak PIHAK KEDUA atas
              pembayaran yang telah atau seharusnya diterima.
            </li>
          </ol>
        </li>
      </ol>
    </div>,

    /* 7. PASAL 4 (Hak dan Kewajiban Pihak Pertama) */
    <div key="b-pasal-4" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 4</h3>
        <h4 className="font-bold text-[15px] uppercase">HAK DAN KEWAJIBAN PIHAK PERTAMA</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK PERTAMA berhak menerima laporan akhir pelaksanaan Program dari PIHAK KEDUA
          sebagaimana dijelaskan pada ruang lingkup kerjasama dalam Pasal 1 (satu) Perjanjian ini.
        </li>
        <li>
          PIHAK PERTAMA berhak memberikan masukan terkait pelaksanaan sesi siaran langsung,
          dengan ketentuan keputusan akhir mengenai konsep, alur, dan teknis pelaksanaan siaran
          langsung tetap berada pada PIHAK KEDUA untuk menunjang keberhasilan Program.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban menyediakan produk (termasuk sampel produk), brief Program,
          materi promosi, informasi ketersediaan stok, penetapan harga dan promo secara lengkap
          dan tepat waktu kepada PIHAK KEDUA, serta informasi lain yang diperlukan untuk mendukung
          pelaksanaan Program. Keterlambatan penyediaan produk, brief, informasi, atau materi oleh
          PIHAK PERTAMA yang mengakibatkan tertundanya atau batalnya pelaksanaan sesi siaran
          langsung tidak dapat dibebankan sebagai wanprestasi PIHAK KEDUA dan jadwal sesi yang
          terdampak akan disesuaikan berdasarkan kesepakatan PARA PIHAK.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban memastikan kesiapan produk, stok, harga, dan promo pada
          etalase/toko {deliverables.platform} PIHAK PERTAMA pada setiap jadwal siaran langsung
          yang telah disepakati.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban melakukan pembayaran Total Pembayaran kepada PIHAK KEDUA
          sebagaimana dijelaskan pada Pasal 3 (tiga) Perjanjian ini.
        </li>
        <li>
          PIHAK PERTAMA menjamin dan menyatakan bahwa:
          <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
            <li>
              Seluruh produk yang dipromosikan dalam Program dibuat, diedarkan, dan dijual secara
              sah sesuai peraturan perundang-undangan, termasuk telah memiliki izin edar,
              sertifikasi, dan/atau perizinan lain yang diwajibkan untuk produk tersebut;
            </li>
            <li>
              PIHAK PERTAMA adalah pemilik atau pemegang hak yang sah atas merek, logo, foto,
              video, materi promosi, dan seluruh bahan lain yang diserahkan kepada PIHAK KEDUA
              dan penggunaannya dalam Program tidak melanggar hak kekayaan intelektual atau hak
              lain milik pihak ketiga;
            </li>
            <li>
              Seluruh informasi produk yang diberikan kepada PIHAK KEDUA dan Creator, termasuk
              klaim manfaat atau khasiat, komposisi, harga, promo, dan ketersediaan stok, adalah
              benar, tidak menyesatkan dan dapat dipertanggungjawabkan, serta sesuai dengan
              peraturan perlindungan konsumen dan periklanan yang berlaku.
            </li>
          </ol>
        </li>
        <li>
          PIHAK KEDUA berhak menolak, menunda, atau menghentikan penggunaan produk dan/atau materi
          tertentu dalam Program, termasuk menghentikan sesi siaran langsung yang sedang
          berlangsung, apabila menurut pertimbangan yang wajar produk atau materi tersebut
          berpotensi melanggar peraturan perundang-undangan, hak pihak ketiga, atau ketentuan
          platform. Tindakan tersebut tidak dapat dikategorikan sebagai wanprestasi PIHAK KEDUA.
        </li>
      </ol>
    </div>,

    /* 8. PASAL 5 (Hak dan Kewajiban Pihak Kedua) */
    <div key="b-pasal-5" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 5</h3>
        <h4 className="font-bold text-[15px] uppercase">HAK DAN KEWAJIBAN PIHAK KEDUA</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK KEDUA berhak menerima pembayaran dari PIHAK PERTAMA sesuai dengan yang telah
          disepakati, sebagaimana dijelaskan pada Pasal 3 (tiga) Perjanjian ini.
        </li>
        <li>
          PIHAK KEDUA berhak menentukan serta memutuskan konsep, strategi dan alur pelaksanaan
          siaran langsung dalam Program.
        </li>
        <li>
          PIHAK KEDUA berhak menolak permintaan perubahan dari PIHAK PERTAMA jika permintaan
          tersebut tidak sesuai dengan ruang lingkup pekerjaan yang disepakati, termasuk permintaan
          penambahan jumlah sesi, penambahan durasi, atau perubahan Creator di luar yang diatur
          dalam Pasal 1 (satu) Perjanjian ini.
        </li>
        <li>
          PIHAK KEDUA berhak mengatur penugasan dan penjadwalan Creator yang dikelolanya, dengan
          tetap memenuhi jumlah sesi siaran langsung sebagaimana diatur dalam Pasal 1 (satu)
          Perjanjian ini.
        </li>
        <li>
          PIHAK KEDUA berkewajiban melaksanakan Program sesuai dengan ruang lingkup kerjasama
          sebagaimana diatur dalam Pasal 1 (satu) Perjanjian ini.
        </li>
      </ol>
    </div>,

    /* 9. PASAL 6 (Keadaan Kahar / Force Majeure) */
    <div key="b-pasal-6" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 6</h3>
        <h4 className="font-bold text-[15px] uppercase">KEADAAN KAHAR (FORCE MAJEURE)</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Bahwa yang dimaksud dengan Keadaan Kahar (<em>Force Majeure</em>) dalam Perjanjian ini
          adalah peristiwa-peristiwa atau keadaan yang terjadi di luar kekuasaan dan/atau
          kemampuan PARA PIHAK untuk mengatasinya, bencana alam yang berakibat langsung terhadap
          PARA PIHAK dalam melaksanakan Perjanjian ini, termasuk namun tidak terbatas pada
          kebakaran, banjir, gempa bumi, pandemi, gangguan sistem elektronik/internet, perang,
          revolusi, terorisme, wabah penyakit, perubahan Peraturan Perundang-undangan yang
          berkaitan langsung dengan pelaksanaan Perjanjian ini, dan/atau kekacauan sosial yang
          merintangi dan menghalangi salah satu dari PARA PIHAK untuk menjalankan kewajiban dalam
          Perjanjian ini.
        </li>
        <li>
          Bahwa Pihak yang mengalami Keadaan Kahar (<em>Force Majeure</em>) wajib memberitahukan
          kepada Pihak lainnya secara lisan selambat-lambatnya 48 (empat puluh delapan) jam dan
          diikuti dengan pemberitahuan secara tertulis selambat-lambatnya dalam waktu 7 (tujuh) hari
          kalender setelah terjadinya Keadaan Kahar tersebut, disertai dengan bukti keterangan
          resmi dari instansi pemerintah yang berwenang atau bukti lainnya yang dapat
          dipertanggungjawabkan dan perkiraan atau upaya-upaya yang akan atau telah dilakukan dalam
          rangka mengatasi Keadaan Kahar tersebut.
        </li>
        <li>
          Bahwa Pihak yang mengalami Keadaan Kahar (<em>Force Majeure</em>) dan tidak melaksanakan
          ketentuan sebagaimana dimaksud pada Ayat 2 (dua) Pasal ini menyebabkan peristiwa yang
          dialami tersebut tidak termasuk dalam kategori Keadaan Kahar (<em>Force Majeure</em>).
        </li>
        <li>
          Bahwa Pihak yang menerima pemberitahuan Keadaan Kahar (<em>Force Majeure</em>) dapat
          menolak atau menyetujui Keadaan Kahar yang dialami Pihak lainnya selambat-lambatnya dalam
          waktu 7 (tujuh) hari kalender setelah diterimanya pemberitahuan tertulis sebagaimana
          dimaksud di dalam Ayat 2 (dua) Pasal ini.
        </li>
        <li>
          Bahwa selama Keadaan Kahar (<em>Force Majeure</em>) berlangsung, kewajiban pihak yang
          terdampak dapat ditunda sementara tanpa dikenakan sanksi atau dianggap sebagai
          wanprestasi.
        </li>
        <li>
          Bahwa PARA PIHAK sepakat, apabila terjadi Keadaan Kahar (<em>Force Majeure</em>)
          berlangsung lebih dari 30 (tiga puluh) hari kalender sehingga mengakibatkan salah satu
          Pihak tidak dapat memenuhi kewajiban yang tertuang dalam Perjanjian ini, maka PARA PIHAK
          sepakat untuk melakukan musyawarah untuk membicarakan kembali tindak lanjut dalam
          Perjanjian ini.
        </li>
        <li>
          Bahwa setelah berakhirnya Keadaan Kahar (<em>Force Majeure</em>), PARA PIHAK sepakat
          untuk melakukan musyawarah guna menentukan kelanjutan pelaksanaan Perjanjian ini.
        </li>
      </ol>
    </div>,

    /* 10. PASAL 7 (Kerahasiaan) */
    <div key="b-pasal-7" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 7</h3>
        <h4 className="font-bold text-[15px] uppercase">KERAHASIAAN</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PARA PIHAK sepakat untuk menjaga kerahasiaan seluruh informasi, data, dan dokumen yang
          diperoleh sehubungan dengan pelaksanaan Perjanjian ini dan tidak akan mengungkapkannya
          kepada pihak ketiga tanpa persetujuan tertulis dari Pihak lainnya, kecuali diwajibkan
          oleh peraturan perundang-undangan atau perintah instansi yang berwenang.
        </li>
        <li>
          PIHAK PERTAMA dilarang menghubungi atau bekerja sama secara langsung dengan content
          creator yang digunakan dalam Program ini tanpa sepengetahuan dan persetujuan PIHAK
          KEDUA, baik selama masa berlaku Perjanjian maupun dalam jangka waktu{" "}
          <strong>{legal.nonCircumventionMonths} ({terbilang(legal.nonCircumventionMonths)}) bulan</strong>{" "}
          setelah Perjanjian berakhir.
        </li>
        <li>
          Kewajiban kerahasiaan sebagaimana dimaksud pada Pasal ini tetap berlaku meskipun
          Perjanjian ini telah berakhir.
        </li>
      </ol>
    </div>,

    /* 11. PASAL 8 (Pembatalan dan Pengakhiran Perjanjian) */
    <div key="b-pasal-8" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 8</h3>
        <h4 className="font-bold text-[15px] uppercase">PEMBATALAN DAN PENGAKHIRAN PERJANJIAN</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Perjanjian ini dapat diakhiri sebelum berakhirnya jangka waktu sebagaimana dimaksud
          Pasal 2 (dua) apabila disepakati secara tertulis oleh PARA PIHAK.
        </li>
        <li>
          Dalam hal salah satu Pihak melakukan wanprestasi dan tidak memperbaiki pelanggaran
          tersebut dalam waktu {legal.curePeriodDays} ({terbilang(legal.curePeriodDays)}) hari
          kalender sejak diterimanya surat peringatan/surat somasi tertulis dari Pihak lainnya,
          maka Pihak yang dirugikan berhak mengakhiri Perjanjian ini secara sepihak.
        </li>
        <li>
          Dalam pelaksanaan pengakhiran Perjanjian ini, PARA PIHAK sepakat untuk:
          <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
            <li>
              PARA PIHAK sepakat untuk mengesampingkan ketentuan Pasal 1266 KUHPerdata sepanjang
              mengatur keharusan adanya putusan pengadilan untuk pengakhiran Perjanjian, sehingga
              pengakhiran karena wanprestasi sebagaimana dimaksud pada ayat 2 (dua) Pasal ini dapat
              dilakukan oleh Pihak yang dirugikan secara sepihak melalui pemberitahuan tertulis
              tanpa melalui putusan pengadilan.
            </li>
            <li>
              Pengesampingan sebagaimana dimaksud pada huruf a tidak menghapus atau mengurangi hak
              Pihak yang dirugikan untuk menuntut penggantian biaya, kerugian, dan bunga
              sebagaimana diatur dalam Pasal 1267 KUHPerdata dan Pasal 11 (sebelas) Perjanjian ini.
            </li>
            <li>
              Dalam hal Perjanjian diakhiri karena wanprestasi PIHAK PERTAMA, atau PIHAK PERTAMA
              mengakhiri Perjanjian secara sepihak tanpa alasan yang sah, PIHAK KEDUA berhak atas:
              (i) pembayaran atas pekerjaan yang telah dilaksanakan sampai dengan tanggal efektif
              pengakhiran; (ii) penggantian biaya yang telah dikeluarkan dan/atau kewajiban yang
              telah timbul kepada content creator sehubungan dengan Program ini; dan (iii) ganti
              rugi sesuai Pasal 11 (sebelas) Perjanjian ini.
            </li>
          </ol>
        </li>
        <li>
          Pada saat Perjanjian ini berakhir atau diakhiri, maka hak dan kewajiban masing-masing
          Pihak yang telah timbul sebelum pengakhiran Perjanjian ini efektif berakhir atau
          diakhiri wajib tetap diselesaikan dan dipenuhi oleh masing-masing Pihak dalam Perjanjian
          ini, dengan diberlakukan ketentuan sebagai berikut:
          <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
            <li>
              PIHAK PERTAMA wajib melunasi kepada PIHAK KEDUA seluruh nilai pembayaran yang telah
              jatuh tempo dan/atau timbul sehubungan dengan pekerjaan yang telah dilaksanakan oleh
              PIHAK KEDUA berdasarkan Perjanjian ini sampai dengan tanggal efektif pengakhiran,
              termasuk namun tidak terbatas pada PIHAK KEDUA telah menyerahkan semua invoice dan
              lampiran persyaratan yang diperlukan.
            </li>
            <li>
              Tagihan tambahan yang timbul dari perpanjangan dan/atau addendum Perjanjian ini yang
              belum dibayar pada saat pengakhiran, dengan ketentuan pembayaran sebagaimana
              dimaksud pada huruf a ayat ini wajib dilakukan oleh PIHAK PERTAMA apabila:
              <ol className="list-[lower-roman] pl-5 mt-0.5 space-y-0.5">
                <li>
                  PIHAK KEDUA telah melaksanakan kewajiban-kewajiban pekerjaan yang bersangkutan
                  sesuai dengan ruang lingkup yang disebutkan dalam Perjanjian ini dan/atau
                  addendumnya; dan
                </li>
                <li>
                  PIHAK KEDUA telah menyerahkan invoice dan lampiran persyaratan yang diperlukan
                  atas pekerjaan tersebut.
                </li>
              </ol>
            </li>
            <li>
              Pembayaran sebagaimana dimaksud pada huruf a ayat ini wajib dilunasi oleh PIHAK
              PERTAMA selambat-lambatnya 14 (empat belas) hari kalender sejak tanggal efektif
              pengakhiran Perjanjian ini atau sejak diterimanya invoice dan kelengkapan dokumen dari
              PIHAK KEDUA, mana yang lebih kemudian.
            </li>
            <li>
              Setelah seluruh kewajiban pembayaran sebagaimana dimaksud pada huruf a dan huruf b
              ayat ini terlaksana sepenuhnya, PARA PIHAK sepakat untuk tidak lagi mempunyai hak
              menuntut ganti rugi atau pembayaran apa pun dari Pihak lainnya sehubungan dengan
              pekerjaan yang telah diselesaikan tersebut, tanpa mengurangi berlakunya ketentuan
              Pasal 8 (delapan), Pasal 10 (sepuluh), Pasal 11 (sebelas) dan Pasal 12 (dua belas)
              Perjanjian ini.
            </li>
          </ol>
        </li>
        <li>
          Berakhirnya/batalnya Perjanjian ini tidak membebaskan dan/atau melepaskan kewajiban PARA
          PIHAK untuk tetap wajib menyelesaikan seluruh kewajibannya yang masih ada sampai
          kewajiban tersebut sesuai berdasarkan kesepakatan secara tertulis mengenai penyelesaian
          hak dan kewajiban PARA PIHAK.
        </li>
      </ol>
    </div>,

    /* 12. PASAL 9 (Penyelesaian Perselisihan) */
    <div key="b-pasal-9" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 9</h3>
        <h4 className="font-bold text-[15px] uppercase">PENYELESAIAN PERSELISIHAN</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PARA PIHAK sepakat untuk menyelesaikan segala perselisihan yang mungkin timbul akibat
          dari pelaksanaan Perjanjian ini melalui musyawarah agar mencapai mufakat.
        </li>
        <li>
          Jika dalam waktu 30 (tiga puluh) Hari Kalender sejak dimulainya penyelesaian sengketa
          sebagaimana dimaksud ayat 1 (satu) Pasal ini tidak tercapai mufakat, maka PARA PIHAK
          sepakat untuk menyelesaikan perselisihan tersebut melalui{" "}
          <strong>{legal.courtJurisdiction}</strong>.
        </li>
        <li>Biaya yang timbul sehubungan dengan pasal ini menjadi beban PARA PIHAK.</li>
      </ol>
    </div>,

    /* 13. PASAL 10 (Hak Kekayaan Intelektual) */
    <div key="b-pasal-10" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 10</h3>
        <h4 className="font-bold text-[15px] uppercase">HAK KEKAYAAN INTELEKTUAL</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Bahwa apabila PIHAK PERTAMA ingin lisensi non-eksklusif dengan menggunakan konten untuk
          keperluan promosi dan pemasaran produk PIHAK PERTAMA, serta publikasi di media sosial dan
          platform digital milik PIHAK KEDUA, maka PIHAK PERTAMA wajib konfirmasi secara tertulis
          kepada PIHAK KEDUA paling lambat 7 (tujuh) hari kerja.
        </li>
        <li>
          PIHAK PERTAMA tidak diperkenankan, tanpa persetujuan tertulis terlebih dahulu dari PIHAK
          KEDUA, untuk:
          <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
            <li>Mengubah, mengedit atau memodifikasi konten;</li>
            <li>
              Menggunakan konten untuk tujuan komersial di luar ruang lingkup promosi produk
              sebagaimana dimaksud pada ayat 1 (satu) Pasal ini;
            </li>
            <li>Menjual, mengalihkan, atau melisensikan konten kepada Pihak Ketiga.</li>
          </ol>
        </li>
      </ol>
    </div>,

    /* 14. PASAL 11 (Ganti Rugi) */
    <div key="b-pasal-11" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 11</h3>
        <h4 className="font-bold text-[15px] uppercase">GANTI RUGI</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Apabila salah satu Pihak melakukan kesalahan, kelalaian, dan/atau pelanggaran terhadap
          ketentuan Perjanjian ini maupun peraturan perundang-undangan yang berlaku, yang
          mengakibatkan timbulnya kerugian bagi Pihak lainnya, maka Pihak yang melakukan kesalahan
          tersebut wajib mengganti kerugian yang timbul akibat kesalahan, kelalaian, dan/atau
          pelanggaran dimaksud.
        </li>
        <li>
          Setiap tuntutan dan/atau klaim ganti rugi sebagaimana dimaksud dalam Pasal ini wajib
          diajukan secara tertulis disertai dengan bukti-bukti yang sah dan dapat
          dipertanggungjawabkan mengenai timbulnya kerugian, besarnya nilai kerugian, serta hubungan
          sebab-akibat antara kerugian tersebut dengan kesalahan, kelalaian, dan/atau pelanggaran
          yang dilakukan oleh Pihak yang bersangkutan. Pihak yang menerima tuntutan dan/atau klaim
          ganti rugi berhak untuk menolak tuntutan dan/atau klaim tersebut apabila tidak disertai
          bukti yang memadai.
        </li>
        <li>
          Pihak yang mengalami kerugian tidak berhak menuntut ganti rugi kepada Pihak lainnya
          apabila kerugian tersebut timbul akibat kesalahan atau kelalaian Pihak yang bersangkutan
          sendiri.
        </li>
        <li>
          Ketentuan mengenai ganti rugi dalam Pasal ini berlaku pula terhadap kerugian yang dialami
          oleh salah satu Pihak sebagai akibat dari tuntutan dan/atau klaim pihak ketiga, termasuk
          instansi pemerintah dan penyelenggara platform, sepanjang tuntutan dan/atau klaim tersebut
          timbul karena kesalahan, kelalaian, dan/atau pelanggaran yang dilakukan oleh Pihak lainnya
          dalam pelaksanaan Perjanjian ini.
        </li>
        <li>
          Tanpa mengurangi ketentuan ayat 4 (empat) Pasal ini, PIHAK PERTAMA wajib membebaskan dan
          mengganti seluruh kerugian PIHAK KEDUA, termasuk biaya perkara, denda, dan/atau biaya
          lainnya.
        </li>
        <li>
          Pihak yang menerima tuntutan atau klaim pihak ketiga yang dapat menimbulkan kewajiban
          ganti rugi berdasarkan Pasal ini wajib memberitahukan Pihak lainnya secara tertulis
          dalam waktu paling lambat 7 (tujuh) hari kerja sejak tuntutan atau klaim tersebut
          diterima. Pihak lainnya berhak ikut menanggapi dan menyelesaikan tuntutan atau klaim
          tersebut, dan tidak ada penyelesaian yang mengikat Pihak lainnya tanpa persetujuan
          tertulisnya.
        </li>
        <li>
          Total tanggung jawab PIHAK KEDUA kepada PIHAK PERTAMA berdasarkan atau sehubungan dengan
          Perjanjian ini, atas dasar tuntutan apa pun, tidak melebihi Nilai Kontrak sebagaimana
          dimaksud dalam Pasal 3 ayat 1 (satu) Perjanjian ini.
        </li>
        <li>
          Pembatasan dan pengecualian tanggung jawab sebagaimana dimaksud pada ayat 7 (tujuh) Pasal
          ini tidak berlaku terhadap kewajiban pembayaran PIHAK PERTAMA berdasarkan Pasal 3 dan
          Pasal 8 ayat 3 huruf c Perjanjian ini; kewajiban PIHAK PERTAMA berdasarkan ayat 5 (lima)
          Pasal ini; dan kerugian yang timbul karena kesengajaan atau kelalaian berat Pihak yang
          bersangkutan.
        </li>
        <li>
          Ketentuan mengenai ganti rugi dalam Pasal ini tetap berlaku dan mengikat PARA PIHAK
          sekalipun Perjanjian ini telah berakhir atau diakhiri.
        </li>
      </ol>
    </div>,

    /* 15. PASAL 12 (Lain-Lain) */
    <div key="b-pasal-12" className="space-y-2 text-justify">
      <div className="text-center pt-2">
        <h3 className="font-bold text-[15px]">PASAL 12</h3>
        <h4 className="font-bold text-[15px] uppercase">LAIN-LAIN</h4>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Segala penafsiran yang timbul terhadap ketentuan dalam perjanjian ini seluruhnya tunduk
          pada ketentuan hukum yang berlaku di wilayah Republik Indonesia.
        </li>
        <li>
          Segala perubahan dan/atau penambahan atas Perjanjian ini hanya sah apabila dibuat secara
          tertulis dan ditandatangani oleh PARA PIHAK dalam bentuk addendum yang merupakan satu
          kesatuan dan bagian yang tidak terpisahkan dari Perjanjian ini.
        </li>
        <li>
          Perjanjian ini secara sah telah menggantikan segala persetujuan-persetujuan dan/atau
          janji-janji lisan lainnya yang telah diadakan sebelum perjanjian ini ditandatangani.
        </li>
        <li>
          Ketentuan mengenai kerahasiaan atas seluruh informasi, data dan dokumen yang dipertukarkan
          PARA PIHAK sehubungan dengan Perjanjian ini merujuk sepenuhnya pada Pasal 7 (tujuh)
          Perjanjian ini.
        </li>
        <li>
          Segala ketentuan-ketentuan dan syarat-syarat dalam Perjanjian ini berlaku serta mengikat
          bagi PARA PIHAK yang menandatangani, pengganti-penggantinya dan pihak-pihak yang
          memperoleh keuntungan dari padanya.
        </li>
        <li>
          Perjanjian ini dibuat dalam rangkap 2 (dua), masing-masing bermaterai cukup dan
          mempunyai kekuatan hukum yang sama, di mana masing-masing pihak menerima 1 (satu) rangkap
          asli.
        </li>
      </ol>
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

    /* 14. LAMPIRAN I (Header & Creator Pertama - Wajib Halaman Baru) */
    <div
      key="b-appendix-main"
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
        <CreatorCalendarView roster={data.calendarRosters[0]} />
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

    /* 15. Creator 2 s/d N (Dinamis: 2, 5, 10, atau 50 Creator terpaginasi otomatis) */
    ...(data.appendixFormat !== "table" &&
    data.calendarRosters &&
    data.calendarRosters.length > 1
      ? data.calendarRosters.slice(1).map((roster, idx) => (
          <div key={`b-appendix-creator-${idx + 1}`} className="pt-2">
            <CreatorCalendarView roster={roster} />
          </div>
        ))
      : []),
  ];

  return <DynamicPksPaginator blocks={blocks} />;
}
