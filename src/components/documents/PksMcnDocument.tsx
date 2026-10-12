"use client";

import React from "react";
import type { PksMcnData } from "@/types/pks";
import {
  terbilang,
  terbilangRupiah,
  formatRupiah,
  formatTanggalLegal,
  formatTanggalId,
} from "@/lib/terbilang";

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

  return (
    <div className="pks-document text-black font-serif text-[13.5px] leading-[1.65] select-text">
      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 1 : KOMPARISI PARA PIHAK
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          {/* Header Title */}
          <div className="text-center pt-2 pb-4">
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
            <div className="w-full h-[1.5px] bg-black my-4" />
          </div>

          {/* Pembuka */}
          <p className="text-justify indent-0 mb-4">
            Pada hari ini, {formatTanggalLegal(header.signDate)} telah ditandatangani
            Perjanjian Kerjasama ini (selanjutnya disebut &ldquo;Perjanjian&rdquo;),
            oleh dan antara pihak-pihak yang bertanda tangan di bawah ini:
          </p>

          {/* Pihak Pertama */}
          <div className="flex items-start gap-3 mb-4 text-justify">
            <span className="font-bold shrink-0">1.</span>
            <div>
              <p>
                <span className="font-bold">{client.name}</span>
                {client.brandName && (
                  <span className="font-bold"> (&ldquo;{client.brandName}&rdquo;)</span>
                )}
                , suatu {client.entityType} yang didirikan berdasarkan hukum Negara
                Republik Indonesia, beralamat di {client.address}, yang dalam hal ini
                diwakili oleh{" "}
                <span className="font-bold uppercase">{client.signeeName}</span> selaku{" "}
                <span className="font-bold uppercase">{client.signeePosition}</span>{" "}
                oleh karenanya sah bertindak mewakili {client.signeeBasis} untuk bertindak
                dan atas nama {client.name}
                {client.brandName ? ` ("${client.brandName}")` : ""}, untuk selanjutnya
                disebut sebagai-----------------------------------------------------------------------------------------------------------------------------------------------------------------------
                <span className="font-bold">PIHAK PERTAMA</span>.
              </p>
            </div>
          </div>

          <p className="text-center font-bold my-3">Dan</p>

          {/* Pihak Kedua */}
          <div className="flex items-start gap-3 mb-4 text-justify">
            <span className="font-bold shrink-0">2.</span>
            <div>
              <p>
                <span className="font-bold">{agency.companyLegalName}</span>
                {agency.tradeName && (
                  <span className="font-bold"> (&ldquo;{agency.tradeName}&rdquo;)</span>
                )}
                , suatu perseroan terbatas yang didirikan berdasarkan hukum Negara
                Republik Indonesia, berdomisili di {agency.address}, yang dalam hal ini
                diwakili oleh{" "}
                <span className="font-bold uppercase">{agency.signeeName}</span> selaku{" "}
                <span className="font-bold uppercase">{agency.signeePosition}</span>,
                oleh karenanya sah bertindak mewakili Direksi untuk bertindak dan atas
                nama {agency.companyLegalName}
                {agency.tradeName ? ` ("${agency.tradeName}")` : ""}, untuk selanjutnya
                disebut sebagai-----------------------------------------------------------------------------------------------------------------------------------------------------------------------
                <span className="font-bold">PIHAK KEDUA</span>.
              </p>
            </div>
          </div>

          <p className="text-justify mt-6">
            PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama disebut sebagai &ldquo;PARA
            PIHAK&rdquo;.
          </p>
        </div>

        {/* Footer Page */}
        <div className="text-right text-[12px] pt-4 border-t border-transparent">
          <span>1</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 2 : KONSIDERAN & PASAL 1 RUANG LINGKUP
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <p className="text-justify mb-4">
            PARA PIHAK terlebih dahulu menerangkan hal-hal sebagai berikut:
          </p>

          <div className="space-y-3 mb-6 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">a.</span>
              <p>
                Bahwa PIHAK KEDUA adalah perusahaan yang bergerak di bidang jasa kreatif
                digital dan affiliate marketing, termasuk pengelolaan content creator
                (multi-channel network) dan penyelenggaraan siaran langsung (live
                streaming) di platform {deliverables.platform};
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">b.</span>
              <p>
                Bahwa PIHAK PERTAMA bermaksud menggunakan jasa PIHAK KEDUA untuk
                menjalankan program pemasaran berupa &ldquo;{deliverables.programName}&rdquo;
                sebagaimana diatur dalam Perjanjian ini;
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">c.</span>
              <p>
                Bahwa PIHAK KEDUA menyatakan sanggup dan bersedia untuk melaksanakan
                program dimaksud sesuai dengan syarat dan ketentuan dalam Perjanjian ini.
              </p>
            </div>
          </div>

          <p className="text-justify mb-6">
            Selanjutnya PARA PIHAK sepakat untuk mengikatkan diri dalam Perjanjian dengan
            ketentuan-ketentuan sebagai berikut:
          </p>

          <div className="text-center mb-4">
            <h3 className="font-bold text-[15px]">PASAL 1</h3>
            <h4 className="font-bold text-[15px]">RUANG LINGKUP KERJASAMA</h4>
          </div>

          <div className="space-y-3 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                PIHAK KEDUA memberikan layanan pengelolaan siaran langsung (live
                streaming) kepada PIHAK PERTAMA, berupa perencanaan strategi,
                pengelolaan content creator dan affiliator, serta pelaksanaan sesi
                siaran langsung produk PIHAK PERTAMA melalui platform {deliverables.platform}.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                Layanan sebagaimana dimaksud pada ayat 1 (satu) Pasal ini akan
                dilaksanakan sepanjang masa berlaku Perjanjian ini, dengan tujuan untuk
                mendukung kegiatan pemasaran serta meningkatkan performa penjualan produk
                PIHAK PERTAMA.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <div>
                <p>
                  Agar mencapai tujuan sebagaimana dimaksud pada Pasal ini, PIHAK KEDUA
                  akan melaksanakan program &ldquo;{deliverables.programName}&rdquo; (selanjutnya
                  disebut sebagai &ldquo;Program&rdquo;) untuk kepentingan PIHAK PERTAMA
                  dengan rincian pekerjaan (&ldquo;Deliverables&rdquo;) sebagai berikut:
                </p>
                <div className="ml-4 mt-2 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">a.</span>
                    <p>
                      Content creator yang ditugaskan ialah {creatorsNamesOnly} (&ldquo;Creator&rdquo;).
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">b.</span>
                    <p>
                      Jumlah sesi sebanyak {creatorsText}, dengan total{" "}
                      {deliverables.totalSessions} ({terbilang(deliverables.totalSessions)})
                      sesi siaran langsung melalui platform {deliverables.platform}.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">c.</span>
                    <p>
                      Durasi minimal per sesi ialah {deliverables.sessionDuration} (
                      {terbilang(deliverables.sessionDuration)}) menit.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">d.</span>
                    <p>
                      Jadwal siaran langsung sebagaimana tercantum dalam Lampiran I
                      Perjanjian ini bersifat fleksibel dan dapat diubah sewaktu-waktu
                      berdasarkan kesepakatan tertulis
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>2</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 3 : PASAL 1 (LANJUTAN) & PASAL 2 JANGKA WAKTU
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <p className="text-justify mb-4">
            PARA PIHAK, termasuk melalui media komunikasi elektronik resmi yang dapat
            dipertanggungjawabkan secara hukum.
          </p>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">4.</span>
              <p>
                PIHAK KEDUA tidak bertanggung jawab atas keterlambatan pelaksanaan sesi
                siaran langsung serta tidak tercapainya target performa yang disebabkan
                oleh faktor di luar kendali PIHAK KEDUA, termasuk namun tidak terbatas
                pada kebijakan platform termasuk pembatasan atau pemblokiran akun/siaran
                langsung, kondisi pasar, keterbatasan stok, perubahan harga, perilaku
                konsumen, performa konten yang menurun akibat perubahan algoritma
                platform, keterlambatan penyampaian brief atau produk oleh PIHAK PERTAMA
                dan faktor di luar kendali lainnya.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">5.</span>
              <p>
                PIHAK KEDUA dianggap telah memenuhi kewajibannya apabila telah
                melaksanakan seluruh {deliverables.totalSessions} (
                {terbilang(deliverables.totalSessions)}) sesi siaran langsung sesuai
                dengan ruang lingkup pekerjaan yang disepakati, sebagaimana dimaksud pada
                ayat 3 (tiga) Pasal ini, terlepas dari tercapai atau tidaknya target
                performa penjualan PIHAK PERTAMA.
              </p>
            </div>
          </div>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 2</h3>
            <h4 className="font-bold text-[15px]">JANGKA WAKTU</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                Perjanjian ini berlaku mengikat bagi PARA PIHAK terhitung sejak tanggal{" "}
                {formatTanggalId(term.startDate)} sampai dengan{" "}
                {formatTanggalId(term.endDate)}.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                Pelaksanaan program sesi siaran langsung pertama (First Live) oleh
                Creator yang dikelola PIHAK KEDUA pada platform {deliverables.platform} ditargetkan
                dimulai pada tanggal {formatTanggalId(term.firstLiveDate)} dan berakhir pada
                tanggal {formatTanggalId(term.endDate)}. Dalam periode tersebut, Creator wajib
                melaksanakan seluruh {deliverables.totalSessions} (
                {terbilang(deliverables.totalSessions)}) sesi siaran langsung.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <p>
                Perjanjian ini dapat diubah dan/atau diperpanjang atas dasar kesepakatan
                PARA PIHAK yang akan dituangkan dalam suatu addendum Perjanjian yang
                dibuat secara tertulis dan ditandatangani oleh PARA PIHAK.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">4.</span>
              <p>
                Pihak yang bermaksud untuk mengajukan perpanjangan Perjanjian, harus
                menyampaikan pemberitahuan dan/atau mengajukan kesepakatan perpanjangan
                secara tertulis kepada Pihak lainnya, dalam jangka waktu paling lambat{" "}
                {term.noticeDays} ({terbilang(term.noticeDays)}) hari kalender sebelum
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>3</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 4 : PASAL 3 NILAI KONTRAK & PEMBAYARAN
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <p className="text-justify mb-4">
            tanggal efektif pengakhiran. Apabila dalam jangka waktu {term.replyDays} (
            {terbilang(term.replyDays)}) hari kalender sejak diterimanya pemberitahuan
            tersebut Pihak lainnya tidak memberikan jawaban, maka Perjanjian ini
            dianggap berakhir pada tanggal berakhirnya Perjanjian sebagaimana diatur
            dalam Pasal ini dan PARA PIHAK tetap berkewajiban menyelesaikan seluruh
            kewajiban yang telah timbul sebelum berakhirnya Perjanjian.
          </p>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 3</h3>
            <h4 className="font-bold text-[15px]">NILAI KONTRAK DAN CARA PEMBAYARAN</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                PARA PIHAK sepakat bahwa harga yang disepakati dalam Perjanjian ini
                adalah sebesar {formatRupiah(financial.contractValue)} (
                {terbilangRupiah(financial.contractValue)}) sebelum pajak (selanjutnya
                disebut &ldquo;Nilai Kontrak&rdquo;).
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                Nilai Kontrak tersebut akan dikenakan {taxName}, yaitu sebesar{" "}
                {formatRupiah(financial.taxAmount)} ({terbilangRupiah(financial.taxAmount)}),
                sehingga total pembayaran yang wajib dibayarkan oleh PIHAK PERTAMA kepada
                PIHAK KEDUA adalah sebesar {formatRupiah(financial.totalAmount)} (
                {terbilangRupiah(financial.totalAmount)}) (&ldquo;selanjutnya disebut Total
                Pembayaran&rdquo;).
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <div>
                <p>
                  Pembayaran dilakukan melalui transfer ke rekening resmi PIHAK KEDUA
                  sebagai berikut:
                </p>
                <div className="ml-4 mt-2 space-y-1">
                  <p>
                    <span className="inline-block w-40 font-medium">Bank</span>:{" "}
                    {financial.bank.bankName}
                  </p>
                  <p>
                    <span className="inline-block w-40 font-medium">Nama Rekening</span>:{" "}
                    {financial.bank.accountName}
                  </p>
                  <p>
                    <span className="inline-block w-40 font-medium">Nomor Rekening</span>:{" "}
                    {financial.bank.accountNumber}
                  </p>
                  {financial.bank.kcp && (
                    <p>
                      <span className="inline-block w-40 font-medium">KCP</span>:{" "}
                      {financial.bank.kcp}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">4.</span>
              <p>
                Total pembayaran tersebut merupakan imbalan jasa untuk PIHAK KEDUA dan
                tidak bergantung secara langsung pada faktor lain, sepanjang PIHAK KEDUA
                telah melaksanakan kewajibannya sesuai dengan Perjanjian ini.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">5.</span>
              <p>
                Seluruh pembayaran yang telah dilakukan oleh PIHAK PERTAMA kepada PIHAK
                KEDUA tidak dapat diminta kembali (non-refundable).
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">6.</span>
              <p>
                Pajak yang timbul sehubungan dengan pelaksanaan Perjanjian ini
                dilaksanakan sesuai dengan ketentuan peraturan perundang-undangan yang
                berlaku.
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>4</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 5 : PASAL 3 (LANJUTAN) & PASAL 4 HAK & KEWAJIBAN PIHAK I
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="flex items-start gap-3 text-justify mb-6">
            <span className="shrink-0 font-bold">7.</span>
            <div>
              <p>
                Apabila PIHAK PERTAMA tidak melakukan pembayaran sesuai dengan ketentuan
                Perjanjian ini, maka PIHAK KEDUA berhak untuk:
              </p>
              <div className="ml-4 mt-2 space-y-1">
                <p>a. Menunda pelaksanaan siaran langsung (live) dan/atau</p>
                <p>
                  b. Menghentikan sementara atau seluruh aktivitas tanpa mengurangi hak
                  PIHAK KEDUA atas pembayaran yang telah atau seharusnya diterima.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 4</h3>
            <h4 className="font-bold text-[15px]">HAK DAN KEWAJIBAN PIHAK PERTAMA</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                PIHAK PERTAMA berhak menerima laporan akhir pelaksanaan Program dari
                PIHAK KEDUA sebagaimana dijelaskan pada ruang lingkup kerjasama dalam
                Pasal 1 (satu) Perjanjian ini.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                PIHAK PERTAMA berhak memberikan masukan terkait pelaksanaan sesi siaran
                langsung, dengan ketentuan keputusan akhir mengenai konsep, alur, dan
                teknis pelaksanaan siaran langsung tetap berada pada PIHAK KEDUA untuk
                menunjang keberhasilan Program.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <p>
                PIHAK PERTAMA berkewajiban menyediakan produk (termasuk sampel produk),
                brief Program, materi promosi, informasi ketersediaan stok, penetapan harga
                dan promo secara lengkap dan tepat waktu kepada PIHAK KEDUA, serta
                informasi lain yang diperlukan untuk mendukung pelaksanaan Program.
                Keterlambatan penyediaan produk, brief, informasi, atau materi oleh PIHAK
                PERTAMA yang mengakibatkan tertundanya atau batalnya pelaksanaan sesi
                siaran langsung tidak dapat dibebankan sebagai wanprestasi PIHAK KEDUA,
                dan jadwal sesi yang terdampak akan disesuaikan berdasarkan kesepakatan
                PARA PIHAK.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">4.</span>
              <p>
                PIHAK PERTAMA berkewajiban memastikan kesiapan produk, stok, harga, dan
                promo pada etalase/toko {deliverables.platform} PIHAK PERTAMA pada setiap
                jadwal siaran langsung yang telah disepakati.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">5.</span>
              <p>
                PIHAK PERTAMA berkewajiban melakukan pembayaran Total Pembayaran kepada
                PIHAK KEDUA sebagaimana dijelaskan pada Pasal 3 (tiga) Perjanjian ini.
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>5</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 6 : PASAL 4 (LANJUTAN) & PASAL 5 HAK & KEWAJIBAN PIHAK II
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">6.</span>
              <div>
                <p>PIHAK PERTAMA menjamin dan menyatakan bahwa:</p>
                <div className="ml-4 mt-2 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">a.</span>
                    <p>
                      Seluruh produk yang dipromosikan dalam Program dibuat, diedarkan,
                      dan dijual secara sah sesuai peraturan perundang-undangan,
                      termasuk telah memiliki izin edar, sertifikasi, dan/atau perizinan
                      lain yang diwajibkan untuk produk tersebut;
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">b.</span>
                    <p>
                      PIHAK PERTAMA adalah pemilik atau pemegang hak yang sah atas merek,
                      logo, foto, video, materi promosi, dan seluruh bahan lain yang
                      diserahkan kepada PIHAK KEDUA dan penggunaannya dalam Program tidak
                      melanggar hak kekayaan intelektual atau hak lain milik pihak ketiga;
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">c.</span>
                    <p>
                      Seluruh informasi produk yang diberikan kepada PIHAK KEDUA dan
                      Creator, termasuk klaim manfaat atau khasiat, komposisi, harga,
                      promo, dan ketersediaan stok, adalah benar, tidak menyesatkan dan
                      dapat dipertanggungjawabkan, serta sesuai dengan peraturan
                      perlindungan konsumen dan periklanan yang berlaku.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">7.</span>
              <p>
                PIHAK KEDUA berhak menolak, menunda, atau menghentikan penggunaan produk
                dan/atau materi tertentu dalam Program, termasuk menghentikan sesi siaran
                langsung yang sedang berlangsung, apabila menurut pertimbangan yang wajar
                produk atau materi tersebut berpotensi melanggar peraturan
                perundang-undangan, hak pihak ketiga, atau ketentuan platform. Tindakan
                tersebut tidak dapat dikategorikan sebagai wanprestasi PIHAK KEDUA.
              </p>
            </div>
          </div>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 5</h3>
            <h4 className="font-bold text-[15px]">HAK DAN KEWAJIBAN PIHAK KEDUA</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                PIHAK KEDUA berhak menerima pembayaran dari PIHAK PERTAMA sesuai dengan
                yang telah disepakati, sebagaimana dijelaskan pada Pasal 3 (tiga)
                Perjanjian ini.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                PIHAK KEDUA berhak menentukan serta memutuskan konsep, strategi dan alur
                pelaksanaan siaran langsung dalam Program.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <p>
                PIHAK KEDUA berhak menolak permintaan perubahan dari PIHAK PERTAMA jika
                permintaan tersebut tidak sesuai dengan ruang lingkup pekerjaan yang
                disepakati, termasuk permintaan penambahan jumlah sesi, penambahan
                durasi, atau perubahan Creator di luar yang diatur dalam Pasal 1 (satu)
                Perjanjian ini.
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>6</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 7 : PASAL 5 (LANJUTAN) & PASAL 6 FORCE MAJEURE
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="space-y-4 text-justify mb-6">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">4.</span>
              <p>
                PIHAK KEDUA berhak mengatur penugasan dan penjadwalan Creator yang
                dikelolanya, dengan tetap memenuhi jumlah sesi siaran langsung
                sebagaimana diatur dalam Pasal 1 (satu) Perjanjian ini.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">5.</span>
              <p>
                PIHAK KEDUA berkewajiban melaksanakan Program sesuai dengan ruang lingkup
                kerjasama sebagaimana diatur dalam Pasal 1 (satu) Perjanjian ini.
              </p>
            </div>
          </div>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 6</h3>
            <h4 className="font-bold text-[15px]">KEADAAN KAHAR (FORCE MAJEURE)</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                Bahwa yang dimaksud dengan Keadaan Kahar (Force Majeure) dalam Perjanjian
                ini adalah peristiwa-peristiwa atau keadaan yang terjadi di luar
                kekuasaan dan/atau kemampuan PARA PIHAK untuk mengatasinya, bencana alam
                yang berakibat langsung terhadap PARA PIHAK dalam melaksanakan Perjanjian
                ini, termasuk namun tidak terbatas pada kebakaran, banjir, gempa bumi,
                pandemi, gangguan sistem elektronik/internet, perang, revolusi,
                terorisme, wabah penyakit, perubahan Peraturan Perundang-undangan yang
                berkaitan langsung dengan pelaksanaan Perjanjian ini, dan/atau kekacauan
                sosial yang merintangi dan menghalangi salah satu dari PARA PIHAK untuk
                menjalankan kewajiban dalam Perjanjian ini.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                Bahwa Pihak yang mengalami Keadaan Kahar (Force Majeure) wajib
                memberitahukan kepada Pihak lainnya secara lisan selambat-lambatnya 48
                (empat puluh delapan) jam dan diikuti dengan pemberitahuan secara tertulis
                selambat-lambatnya dalam waktu 7 (tujuh) hari kalender setelah terjadinya
                Keadaan Kahar (Force Majeure) tersebut, disertai dengan bukti keterangan
                resmi dari instansi pemerintah yang berwenang atau bukti lainnya yang
                dapat dipertanggungjawabkan dan perkiraan atau upaya-upaya yang akan atau
                telah dilakukan dalam rangka mengatasi Keadaan Kahar (Force Majeure)
                tersebut.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <p>
                Bahwa Pihak yang mengalami Keadaan Kahar (Force Majeure) dan tidak
                melaksanakan ketentuan sebagaimana dimaksud pada Ayat 2 (dua) Pasal ini
                menyebabkan peristiwa yang dialami tersebut tidak termasuk dalam kategori
                Keadaan Kahar (Force Majeure).
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>7</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 8 : PASAL 6 (LANJUTAN), PASAL 7 KERAHASIAAN & PASAL 8
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="space-y-4 text-justify mb-6">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">4.</span>
              <p>
                Bahwa Pihak yang menerima pemberitahuan Keadaan Kahar (Force Majeure)
                dapat menolak atau menyetujui Keadaan Kahar (Force Majeure) yang dialami
                Pihak lainnya selambat-lambatnya dalam waktu 7 (tujuh) hari kalender
                setelah diterimanya pemberitahuan tertulis sebagaimana dimaksud di dalam
                Ayat 2 (dua) Pasal ini.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">5.</span>
              <p>
                Bahwa selama Keadaan Kahar (Force Majeure) berlangsung, kewajiban pihak
                yang terdampak dapat ditunda sementara tanpa dikenakan sanksi atau
                dianggap sebagai wanprestasi.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">6.</span>
              <p>
                Bahwa PARA PIHAK sepakat, apabila terjadi Keadaan Kahar (Force Majeure)
                berlangsung lebih dari 30 (tiga puluh) hari kalender sehingga
                mengakibatkan salah satu Pihak tidak dapat memenuhi kewajiban yang
                tertuang dalam Perjanjian ini, maka PARA PIHAK sepakat untuk melakukan
                musyawarah untuk membicarakan kembali tindak lanjut dalam Perjanjian ini.
              </p>
            </div>
          </div>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 7</h3>
            <h4 className="font-bold text-[15px]">KERAHASIAAN</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                PARA PIHAK sepakat untuk menjaga kerahasiaan seluruh informasi, data,
                dan dokumen yang diperoleh sehubungan dengan pelaksanaan Perjanjian ini
                dan tidak akan mengungkapkannya kepada pihak ketiga tanpa persetujuan
                tertulis dari Pihak lainnya, kecuali diwajibkan oleh peraturan
                perundang-undangan atau perintah instansi yang berwenang.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                PIHAK PERTAMA dilarang menghubungi atau bekerja sama secara langsung
                dengan content creator yang digunakan dalam Program ini tanpa
                sepengetahuan dan persetujuan PIHAK KEDUA, baik selama masa berlaku
                Perjanjian maupun dalam jangka waktu {legal.nonCircumventionMonths} (
                {terbilang(legal.nonCircumventionMonths)}) bulan setelah Perjanjian
                berakhir.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <p>
                Kewajiban kerahasiaan sebagaimana dimaksud pada Pasal ini tetap berlaku
                meskipun Perjanjian ini telah berakhir.
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>8</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 9 : PASAL 8 PENGAKHIRAN PERJANJIAN
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="text-center mb-6">
            <h3 className="font-bold text-[15px]">PASAL 8</h3>
            <h4 className="font-bold text-[15px]">PEMBATALAN DAN PENGAKHIRAN PERJANJIAN</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                Perjanjian ini dapat diakhiri sebelum berakhirnya jangka waktu
                sebagaimana dimaksud Pasal 2 (dua) apabila disepakati secara tertulis
                oleh PARA PIHAK.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                Dalam hal salah satu Pihak melakukan wanprestasi dan tidak memperbaiki
                pelanggaran tersebut dalam waktu {legal.curePeriodDays} (
                {terbilang(legal.curePeriodDays)}) hari kalender sejak diterimanya surat
                peringatan/surat somasi tertulis dari Pihak lainnya, maka Pihak yang
                dirugikan berhak mengakhiri Perjanjian ini secara sepihak.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <div>
                <p>
                  Dalam pelaksanaan pengakhiran Perjanjian ini, PARA PIHAK sepakat
                  untuk:
                </p>
                <div className="ml-4 mt-2 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">a.</span>
                    <p>
                      Mengesampingkan ketentuan Pasal 1266 KUHPerdata sepanjang mengatur
                      keharusan adanya putusan pengadilan untuk pengakhiran Perjanjian,
                      sehingga pengakhiran karena wanprestasi sebagaimana dimaksud pada
                      ayat 2 (dua) Pasal ini dapat dilakukan oleh Pihak yang dirugikan
                      secara sepihak melalui pemberitahuan tertulis tanpa melalui putusan
                      pengadilan.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">b.</span>
                    <p>
                      Pengesampingan sebagaimana dimaksud pada huruf a tidak menghapus
                      atau mengurangi hak Pihak yang dirugikan untuk menuntut penggantian
                      biaya, kerugian, dan bunga sebagaimana diatur dalam Pasal 1267
                      KUHPerdata dan Pasal 11 (sebelas) Perjanjian ini.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold shrink-0">c.</span>
                    <p>
                      Dalam hal Perjanjian diakhiri karena wanprestasi PIHAK PERTAMA, atau
                      PIHAK PERTAMA mengakhiri Perjanjian secara sepihak tanpa alasan
                      yang sah, PIHAK KEDUA berhak atas: (i) pembayaran atas pekerjaan
                      yang telah dilaksanakan sampai dengan tanggal efektif pengakhiran;
                      (ii) penggantian biaya yang telah dikeluarkan dan/atau kewajiban
                      yang telah timbul kepada content creator sehubungan dengan Program
                      ini; dan (iii) ganti rugi sesuai Pasal 11 (sebelas) Perjanjian ini.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>9</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 10 : PASAL 8 (LANJUTAN), PASAL 9 & PASAL 10
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="space-y-4 text-justify mb-6">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">4.</span>
              <p>
                Pada saat Perjanjian ini berakhir atau diakhiri, seluruh nilai
                pembayaran yang telah timbul dan/atau jatuh tempo atas pekerjaan yang
                telah diselesaikan oleh PIHAK KEDUA wajib dilunasi oleh PIHAK PERTAMA
                selambat-lambatnya 14 (empat belas) hari kalender sejak tanggal efektif
                pengakhiran.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">5.</span>
              <p>
                Berakhirnya/batalnya Perjanjian ini tidak membebaskan dan/atau melepaskan
                kewajiban PARA PIHAK untuk tetap wajib menyelesaikan seluruh
                kewajibannya yang masih ada sampai kewajiban tersebut tuntas diselesaikan.
              </p>
            </div>
          </div>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 9</h3>
            <h4 className="font-bold text-[15px]">PENYELESAIAN PERSELISIHAN</h4>
          </div>

          <div className="space-y-4 text-justify mb-6">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                PARA PIHAK sepakat untuk menyelesaikan segala perselisihan yang mungkin
                timbul akibat dari pelaksanaan Perjanjian ini melalui musyawarah agar
                mencapai mufakat.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                Jika dalam waktu 30 (tiga puluh) Hari Kalender sejak dimulainya
                penyelesaian sengketa tidak tercapai mufakat, maka PARA PIHAK sepakat
                untuk menyelesaikan perselisihan tersebut melalui yurisdiksi kepaniteraan{" "}
                <span className="font-bold">{legal.courtJurisdiction}</span>.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <p>Biaya yang timbul sehubungan dengan pasal ini menjadi beban PARA PIHAK.</p>
            </div>
          </div>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 10</h3>
            <h4 className="font-bold text-[15px]">HAK KEKAYAAN INTELEKTUAL</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                Bahwa apabila PIHAK PERTAMA ingin lisensi non-eksklusif dengan
                menggunakan konten hasil live untuk keperluan promosi dan pemasaran
                produk PIHAK PERTAMA, serta publikasi di media sosial dan platform
                digital milik PIHAK KEDUA, maka PIHAK PERTAMA wajib konfirmasi secara
                tertulis kepada PIHAK KEDUA paling lambat 7 (tujuh) hari kerja.
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>10</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 11 : PASAL 10 (LANJUTAN) & PASAL 11 GANTI RUGI
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="space-y-4 text-justify mb-6">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <div>
                <p>
                  PIHAK PERTAMA tidak diperkenankan, tanpa persetujuan tertulis terlebih
                  dahulu dari PIHAK KEDUA, untuk:
                </p>
                <div className="ml-4 mt-2 space-y-1">
                  <p>a. Mengubah, mengedit atau memodifikasi konten;</p>
                  <p>
                    b. Menggunakan konten untuk tujuan komersial di luar ruang lingkup
                    promosi produk;
                  </p>
                  <p>
                    c. Menjual, mengalihkan, atau melisensikan konten kepada Pihak Ketiga.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 11</h3>
            <h4 className="font-bold text-[15px]">GANTI RUGI</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                Apabila salah satu Pihak melakukan kesalahan, kelalaian, dan/atau
                pelanggaran terhadap ketentuan Perjanjian ini maupun peraturan
                perundang-undangan yang berlaku, yang mengakibatkan timbulnya kerugian
                bagi Pihak lainnya, maka Pihak yang melakukan kesalahan tersebut wajib
                mengganti kerugian yang timbul akibat kesalahan, kelalaian, dan/atau
                pelanggaran dimaksud.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                Setiap tuntutan dan/atau klaim ganti rugi wajib diajukan secara tertulis
                disertai bukti yang sah mengenai timbulnya kerugian dan besarnya nilai
                kerugian.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <p>
                Pihak yang mengalami kerugian tidak berhak menuntut ganti rugi kepada
                Pihak lainnya apabila kerugian tersebut timbul akibat kesalahan atau
                kelalaian Pihak yang bersangkutan sendiri.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">4.</span>
              <p>
                Ketentuan mengenai ganti rugi dalam Pasal ini berlaku pula terhadap
                kerugian yang dialami oleh salah satu Pihak sebagai akibat dari tuntutan
                dan/atau klaim pihak ketiga sepanjang timbul karena kesalahan Pihak
                lainnya.
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>11</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 12 : PASAL 11 (LANJUTAN) & PASAL 12 LAIN-LAIN
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="space-y-4 text-justify mb-6">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">5.</span>
              <p>
                Total tanggung jawab PIHAK KEDUA kepada PIHAK PERTAMA berdasarkan atau
                sehubungan dengan Perjanjian ini, atas dasar tuntutan apa pun, tidak
                melebihi Nilai Kontrak sebagaimana dimaksud dalam Pasal 3 ayat 1 (satu)
                Perjanjian ini.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">6.</span>
              <p>
                Ketentuan mengenai ganti rugi dalam Pasal ini tetap berlaku dan mengikat
                PARA PIHAK sekalipun Perjanjian ini telah berakhir atau diakhiri.
              </p>
            </div>
          </div>

          <div className="text-center my-6">
            <h3 className="font-bold text-[15px]">PASAL 12</h3>
            <h4 className="font-bold text-[15px]">LAIN-LAIN</h4>
          </div>

          <div className="space-y-4 text-justify">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">1.</span>
              <p>
                Segala penafsiran yang timbul terhadap ketentuan dalam Perjanjian ini
                seluruhnya tunduk pada ketentuan hukum yang berlaku di wilayah Republik
                Indonesia.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">2.</span>
              <p>
                Segala perubahan dan/atau penambahan atas Perjanjian ini hanya sah apabila
                dibuat secara tertulis dan ditandatangani oleh PARA PIHAK dalam bentuk
                addendum yang merupakan satu kesatuan dan bagian yang tidak terpisahkan
                dari Perjanjian ini.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">3.</span>
              <p>
                Perjanjian ini secara sah telah menggantikan segala persetujuan-persetujuan
                dan/atau janji-janji lisan lainnya yang telah diadakan sebelum perjanjian
                ini ditandatangani.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">4.</span>
              <p>
                Segala ketentuan-ketentuan dan syarat-syarat dalam Perjanjian ini berlaku
                serta mengikat bagi PARA PIHAK yang menandatangani,
                pengganti-penggantinya dan pihak-pihak yang memperoleh keuntungan dari
                padanya.
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>12</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 13 : PENUTUP & TANDA TANGAN PARA PIHAK
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="space-y-4 text-justify mb-8">
            <div className="flex items-start gap-3">
              <span className="shrink-0 font-bold">5.</span>
              <p>
                Perjanjian ini dibuat dalam rangkap 2 (dua), masing-masing bermaterai
                cukup dan mempunyai kekuatan hukum yang sama, di mana masing-masing pihak
                menerima 1 (satu) rangkap asli.
              </p>
            </div>

            <p className="indent-0">
              Demikian Perjanjian ini dibuat dan ditandatangani oleh PARA PIHAK dengan
              penuh kesadaran dan tanpa paksaan dari pihak manapun, untuk dilaksanakan dan
              dipatuhi sebagaimana mestinya.
            </p>
          </div>

          {/* Kolom Tanda Tangan */}
          <div className="grid grid-cols-2 gap-8 pt-8">
            {/* Pihak Pertama (Klien) */}
            <div className="text-center">
              <p className="font-bold text-[14px]">PIHAK PERTAMA</p>
              <p className="font-bold text-[13px] uppercase mt-1 min-h-[40px]">
                {client.name}
                {client.brandName ? ` ("${client.brandName}")` : ""}
              </p>

              {/* Kotak Materai */}
              <div className="w-24 h-28 border border-dashed border-slate-300 rounded mx-auto my-6 flex flex-col items-center justify-center text-[10px] text-slate-400">
                <span>MATERAI</span>
                <span>TEMPEL</span>
                <span className="font-bold">10.000</span>
              </div>

              <p className="font-bold text-[14px] uppercase underline">
                {client.signeeName}
              </p>
              <p className="text-[13px] uppercase text-slate-700">
                {client.signeePosition}
              </p>
            </div>

            {/* Pihak Kedua (TNT) */}
            <div className="text-center">
              <p className="font-bold text-[14px]">PIHAK KEDUA</p>
              <p className="font-bold text-[13px] uppercase mt-1 min-h-[40px]">
                {agency.companyLegalName}
              </p>

              {/* Kotak Materai */}
              <div className="w-24 h-28 border border-dashed border-slate-300 rounded mx-auto my-6 flex flex-col items-center justify-center text-[10px] text-slate-400">
                <span>MATERAI</span>
                <span>TEMPEL</span>
                <span className="font-bold">10.000</span>
              </div>

              <p className="font-bold text-[14px] uppercase underline">
                {agency.signeeName}
              </p>
              <p className="text-[13px] uppercase text-slate-700">
                {agency.signeePosition}
              </p>
            </div>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>13</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 14 : LAMPIRAN I (JADWAL SIARAN LANGSUNG)
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <div className="text-center pt-2 pb-6">
            <h3 className="font-bold text-[17px] tracking-wide">LAMPIRAN I</h3>
            <div className="w-28 h-[1.5px] bg-black mx-auto my-2" />
            <p className="text-[14px] font-bold uppercase mt-1">
              JADWAL & ROSTER SIARAN LANGSUNG (LIVE STREAMING)
            </p>
            <p className="text-[13px] text-slate-700 mt-1">
              Program: {deliverables.programName} · Platform: {deliverables.platform}
            </p>
          </div>

          <div className="overflow-x-auto my-4">
            <table className="w-full text-left border-collapse border border-black text-[12.5px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-black px-3 py-2 text-center w-12 font-bold">
                    No
                  </th>
                  <th className="border border-black px-3 py-2 font-bold w-36">
                    Tanggal
                  </th>
                  <th className="border border-black px-3 py-2 font-bold w-32">
                    Waktu / Jam
                  </th>
                  <th className="border border-black px-3 py-2 font-bold w-44">
                    Creator / Talent
                  </th>
                  <th className="border border-black px-3 py-2 font-bold">
                    Catatan / Produk
                  </th>
                </tr>
              </thead>
              <tbody>
                {schedule.length > 0 ? (
                  schedule.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="border border-black px-3 py-2 text-center">
                        {row.sessionNo || idx + 1}
                      </td>
                      <td className="border border-black px-3 py-2">{row.date}</td>
                      <td className="border border-black px-3 py-2">{row.time}</td>
                      <td className="border border-black px-3 py-2 font-semibold">
                        {row.creator}
                      </td>
                      <td className="border border-black px-3 py-2">{row.notes}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="border border-black px-3 py-8 text-center text-slate-500 italic"
                    >
                      Jadwal sesi siaran langsung akan disesuaikan dan disepakati oleh Para
                      Pihak sebelum sesi perdana (First Live).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 text-[12.5px] text-justify space-y-2 text-slate-800">
            <p>
              <span className="font-bold">Ketentuan Lampiran:</span>
            </p>
            <p>
              1. Jadwal siaran langsung di atas bersifat fleksibel dan dapat disesuaikan
              sewaktu-waktu berdasarkan kesepakatan tertulis Para Pihak (termasuk via grup
              komunikasi resmi).
            </p>
            <p>
              2. Durasi minimal per sesi siaran langsung adalah{" "}
              {deliverables.sessionDuration} ({terbilang(deliverables.sessionDuration)})
              menit.
            </p>
            <p>
              3. PIHAK PERTAMA wajib memastikan ketersediaan stok, harga promo, dan sampel
              produk pada etalase toko sebelum masing-masing sesi siaran langsung dimulai.
            </p>
          </div>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>14</span>
        </div>
      </section>
    </div>
  );
}
