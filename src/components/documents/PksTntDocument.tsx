"use client";

import React from "react";
import type { PksTntData } from "@/types/pks";
import {
  terbilang,
  terbilangRupiah,
  formatRupiah,
  formatTanggalLegal,
  formatTanggalId,
} from "@/lib/terbilang";

interface Props {
  data: PksTntData;
}

export function PksTntDocument({ data }: Props) {
  const { header, client, agency, campaign, term, financial, approval, legal } = data;

  const taxName =
    financial.taxType === "pph_0_5"
      ? "Pajak Penghasilan (PPh) sebesar 0,5%"
      : financial.taxType === "pph_23"
        ? "Pajak Penghasilan (PPh 23) sebesar 2%"
        : financial.taxType === "ppn_11"
          ? "Pajak Pertambahan Nilai (PPN) sebesar 11%"
          : "Bebas Pajak";

  const taxPercentText =
    financial.taxType === "pph_0_5"
      ? "0,5% (nol koma lima persen)"
      : financial.taxType === "pph_23"
        ? "2% (dua persen)"
        : financial.taxType === "ppn_11"
          ? "11% (sebelas persen)"
          : "0%";

  return (
    <div
      className="pks-document text-black text-[13.5px] leading-[1.65] select-text"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 1 : KOMPARISI PARA PIHAK & PASAL 1 (RUANG LINGKUP)
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

          {/* Pembukaan & Komparisi */}
          <p className="text-justify indent-8 mb-4">
            Pada hari ini, {formatTanggalLegal(header.signDate)}, telah
            ditandatangani Perjanjian Kerjasama ini (selanjutnya disebut{" "}
            <strong>“Perjanjian”</strong>), oleh dan antara pihak-pihak yang
            bertanda tangan di bawah ini:
          </p>

          <ol className="list-decimal pl-6 space-y-3 text-justify">
            <li>
              <strong>{client.name}</strong>{" "}
              {client.brandName ? `("${client.brandName}")` : ""}, suatu{" "}
              {client.entityType} yang didirikan berdasarkan hukum Negara
              Republik Indonesia, beralamat di {client.address}, yang dalam hal
              ini diwakili oleh <strong>{client.signeeName}</strong> selaku{" "}
              <strong>{client.signeePosition}</strong>, oleh karenanya sah
              bertindak mewakili {client.signeeBasis} untuk bertindak dan atas
              nama {client.name}{" "}
              {client.brandName ? `("${client.brandName}")` : ""}, untuk
              selanjutnya disebut sebagai---------------------------------
              <strong>PIHAK PERTAMA</strong>.
            </li>

            <div className="py-1 text-center font-bold tracking-widest text-[13px]">
              Dan
            </div>

            <li>
              <strong>{agency.companyLegalName}</strong> (
              <strong>“{agency.tradeName}”</strong>), suatu perseroan terbatas
              yang didirikan berdasarkan hukum Negara Republik Indonesia,
              berdomisili di {agency.address}, yang dalam hal ini diwakili oleh{" "}
              <strong>{agency.signeeName}</strong> selaku{" "}
              <strong>{agency.signeePosition}</strong>, oleh karenanya sah
              bertindak mewakili Direksi untuk bertindak dan atas nama{" "}
              {agency.companyLegalName} (<strong>“{agency.tradeName}”</strong>),
              untuk selanjutnya disebut sebagai---------------------------------
              <strong>PIHAK KEDUA</strong>.
            </li>
          </ol>

          <p className="mt-4 text-justify">
            <strong>PIHAK PERTAMA</strong> dan <strong>PIHAK KEDUA</strong>{" "}
            secara bersama-sama disebut sebagai <strong>“PARA PIHAK”</strong>.
          </p>

          <div className="mt-3">
            <p className="font-semibold mb-2">
              PARA PIHAK terlebih dahulu menerangkan hal-hal sebagai berikut:
            </p>
            <ol className="list-[lower-alpha] pl-6 space-y-1.5 text-justify">
              <li>
                Bahwa PIHAK KEDUA adalah perusahaan yang bergerak di bidang jasa
                kreatif digital dan affiliate marketing, termasuk pengelolaan
                Campaign pemasaran melalui creator/affiliate.
              </li>
              <li>
                Bahwa PIHAK PERTAMA bermaksud menggunakan jasa PIHAK KEDUA untuk
                menjalankan Campaign pemasaran berupa{" "}
                <strong>“{campaign.programName}”</strong> sebagaimana diatur
                dalam Perjanjian ini.
              </li>
              <li>
                Bahwa PIHAK KEDUA menyatakan sanggup dan bersedia untuk
                melaksanakan Campaign dimaksud sesuai dengan syarat dan ketentuan
                dalam Perjanjian ini.
              </li>
            </ol>
          </div>

          <p className="mt-4 text-justify">
            Selanjutnya PARA PIHAK sepakat untuk mengikatkan diri dalam Perjanjian
            dengan ketentuan-ketentuan sebagai berikut:
          </p>

          {/* PASAL 1 */}
          <div className="mt-5 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 1</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              RUANG LINGKUP KERJASAMA
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2 text-justify">
            <li>
              PIHAK KEDUA memberikan layanan pengelolaan affiliate booster
              kepada PIHAK PERTAMA, berupa perencanaan strategi meliputi
              Campaign, pemilihan dan koordinasi content creator, serta
              pelaksanaan aktivitas promosi dalam bentuk konten video melalui
              platform TikTok.
            </li>
            <li>
              Layanan sebagaimana dimaksud pada ayat 1 (satu) Pasal ini akan
              dilaksanakan sepanjang masa berlaku Perjanjian ini, dengan tujuan
              untuk mendukung kegiatan pemasaran serta meningkatkan performa
              penjualan produk PIHAK PERTAMA.
            </li>
            <li>
              Agar mencapai tujuan sebagaimana dimaksud pada Pasal ini, PIHAK
              KEDUA akan melaksanakan program{" "}
              <strong>“{campaign.programName}”</strong> (selanjutnya disebut
              sebagai <strong>“Campaign”</strong>) untuk kepentingan PIHAK
              PERTAMA dengan ketentuan (<strong>“Target”</strong>) sebagai
              berikut:
              <ol className="list-[lower-alpha] pl-5 mt-1.5 space-y-1 text-justify">
                <li>
                  Melibatkan <strong>{campaign.totalCreators} (
                  {terbilang(campaign.totalCreators)}) creators</strong>, dengan
                  ketentuan konsep dan jumlah creator dapat disesuaikan (adjust)
                  oleh PIHAK KEDUA;
                </li>
                <li>
                  Menghasilkan sebanyak <strong>{campaign.totalVideos} (
                  {terbilang(campaign.totalVideos)}) video</strong> dengan fitur
                  keranjang kuning (<em>Yellow Cart</em>);
                </li>
                <li>
                  Konten dan Scope of Work (SOW) pembuatan video ditentukan oleh
                  PIHAK KEDUA dengan tetap memperhatikan jaminan PIHAK PERTAMA
                  sebagaimana dimaksud dalam Pasal 4 ayat 5 (lima) Perjanjian
                  ini;
                </li>
                <li>
                  PIHAK KEDUA menyediakan Tier Creator:
                  <ul className="list-disc pl-6 mt-1 space-y-0.5">
                    <li>
                      Mega: {campaign.tiers.mega} ({terbilang(campaign.tiers.mega)}) creator
                    </li>
                    <li>
                      Macro: {campaign.tiers.macro} ({terbilang(campaign.tiers.macro)}) creator
                    </li>
                    <li>
                      Micro: {campaign.tiers.micro} ({terbilang(campaign.tiers.micro)}) creator
                    </li>
                    <li>
                      Nano: {campaign.tiers.nano} ({terbilang(campaign.tiers.nano)}) creator
                    </li>
                  </ul>
                </li>
                <li>
                  Komposisi tingkatan (tier) creator terdiri dari:
                  <ul className="list-disc pl-6 mt-1 space-y-0.5">
                    <li>
                      1.000 s/d 9.999 (seribu sampai dengan sembilan ribu sembilan
                      ratus sembilan puluh sembilan) followers untuk Tier Nano;
                    </li>
                    <li>
                      10.000 s/d 99.999 (sepuluh ribu sampai dengan sembilan puluh
                      sembilan ribu sembilan ratus sembilan puluh sembilan)
                      followers untuk Tier Micro;
                    </li>
                    <li>
                      100.000 s/d 999.999 (seratus ribu sampai dengan sembilan
                      ratus sembilan puluh sembilan ribu sembilan ratus sembilan
                      puluh sembilan) followers untuk Tier Macro;
                    </li>
                    <li>Followers di atas 1.000.000 (satu juta) untuk Tier Mega.</li>
                  </ul>
                </li>
              </ol>
            </li>
          </ol>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>1</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 2 : PASAL 1 (LANJUTAN), PASAL 2, PASAL 3
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <ol className="list-decimal pl-6 space-y-2 text-justify" start={4}>
            <li>
              Ketentuan sebagaimana dimaksud pada ayat 3 (tiga) Pasal ini
              merupakan total akumulasi yang tercatat pada dashboard resmi TikTok
              Affiliate Partner milik PIHAK KEDUA dan berasal secara langsung
              dari video konten creator yang dikelola oleh PIHAK KEDUA selama
              periode Campaign.
            </li>
            <li>
              Target Kuantitas Video dan Kreator ditetapkan sebagai salah satu
              indikator performa Campaign dan disepakati untuk dicapai
              berdasarkan prinsip <em>best effort</em>, serta bukan merupakan
              jaminan mutlak atas hasil penjualan dan bukan merupakan satu-satunya
              tolak ukur pelaksanaan kewajiban PIHAK KEDUA.
            </li>
            <li>
              PIHAK KEDUA tidak bertanggung jawab atas keterlambatan Campaign
              serta tidak tercapainya target performa yang disebabkan oleh faktor
              di luar kendali PIHAK KEDUA, termasuk namun tidak terbatas pada
              kebijakan platform, kondisi pasar, keterbatasan stok, perubahan
              harga, perilaku konsumen, performa konten yang menurun akibat
              perubahan algoritma platform, dan faktor di luar kendali lainnya.
            </li>
            <li>
              PIHAK KEDUA dianggap telah memenuhi kewajibannya apabila telah
              melaksanakan Campaign sesuai dengan ruang lingkup pekerjaan yang
              disepakati, sebagaimana dimaksud pada Pasal ini, terlepas dari
              tercapai atau tidaknya Target sebagaimana dimaksud pada ayat 3
              (tiga) Pasal ini.
            </li>
          </ol>

          {/* PASAL 2 */}
          <div className="mt-6 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 2</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              JANGKA WAKTU
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2.5 text-justify">
            <li>
              Perjanjian ini berlaku mengikat bagi PARA PIHAK terhitung sejak
              tanggal <strong>{formatTanggalId(term.startDate)}</strong>, yang
              terdiri atas masa persiapan pelaksanaan Campaign dan masa
              pelaksanaan (<em>running</em>) Campaign sebagaimana diatur dalam
              ayat 2 (dua) dan ayat 3 (tiga) Pasal ini.
            </li>
            <li>
              PIHAK KEDUA wajib memulai persiapan pelaksanaan Campaign
              selambat-lambatnya <strong>{term.prepDurationDays} (
              {terbilang(term.prepDurationDays)}) hari kalender</strong> sebelum
              Campaign berjalan (<em>running</em>) yaitu terhitung sejak tanggal{" "}
              <strong>{formatTanggalId(term.prepStartDate)}</strong> sampai
              dengan tanggal <strong>{formatTanggalId(term.prepEndDate)}</strong>.
              Masa persiapan sebagaimana dimaksud pada ayat ini dihitung di luar
              dan tidak mengurangi jangka waktu pelaksanaan (<em>running</em>){" "}
              Campaign selama {term.runningDurationDays} (
              {terbilang(term.runningDurationDays)}) hari kalender sebagaimana
              dimaksud pada ayat 3 (tiga) Pasal ini.
            </li>
            <li>
              Campaign dinyatakan mulai berjalan (<em>running</em>) sejak tanggal
              publikasi konten video pertama (<strong>“First VT”</strong>) oleh
              content creator yang dikelola PIHAK KEDUA di platform TikTok (
              <strong>“Tanggal Mulai Campaign”</strong>), yang ditargetkan jatuh
              pada tanggal <strong>{formatTanggalId(term.firstVtDate)}</strong>{" "}
              dan berlangsung selama <strong>{term.runningDurationDays} (
              {terbilang(term.runningDurationDays)}) hari kalender</strong> sejak
              Tanggal Mulai Campaign tersebut sampai dengan tanggal{" "}
              <strong>{formatTanggalId(term.runningEndDate)}</strong>.
            </li>
            <li>
              Perjanjian ini dapat diubah dan/atau diperpanjang atas dasar
              kesepakatan PARA PIHAK yang akan dituangkan dalam suatu addendum
              Perjanjian yang dibuat secara tertulis dan ditandatangani oleh PARA
              PIHAK.
            </li>
            <li>
              Pihak yang bermaksud untuk mengajukan perpanjangan Perjanjian, harus
              mengajukan pemberitahuan dan/atau kesepakatan perpanjangan secara
              tertulis kepada Pihak lainnya, dalam jangka waktu paling lambat{" "}
              <strong>{term.noticeDays} ({terbilang(term.noticeDays)}) hari
              kalender</strong> sebelum tanggal efektif pengakhiran. Apabila dalam
              jangka waktu <strong>{term.replyDays} ({terbilang(term.replyDays)})
              hari kalender</strong> sejak diterimanya pemberitahuan tersebut Pihak
              lainnya tidak memberikan jawaban, maka Perjanjian ini dianggap
              berakhir pada tanggal yang dikehendaki dalam Surat Pemberitahuan
              tersebut dan PIHAK PERTAMA tetap berkewajiban melaksanakan seluruh
              kewajibannya kepada PIHAK KEDUA tanpa memperhatikan berakhirnya
              Perjanjian.
            </li>
          </ol>

          {/* PASAL 3 */}
          <div className="mt-6 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 3</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              NILAI KONTRAK DAN CARA PEMBAYARAN
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2 text-justify">
            <li>
              PARA PIHAK sepakat bahwa harga yang disepakati dalam Perjanjian ini
              adalah sebesar <strong>{formatRupiah(financial.contractValue)},- (
              {terbilangRupiah(financial.contractValue)})</strong> sebelum pajak
              (selanjutnya disebut <strong>“Nilai Kontrak”</strong>).
            </li>
            <li>
              Nilai Kontrak tersebut akan dikenakan Pajak Penghasilan (PPh)
              sebesar <strong>{taxPercentText}</strong>, yaitu sebesar{" "}
              <strong>{formatRupiah(financial.taxAmount)},- (
              {terbilangRupiah(financial.taxAmount)})</strong>, sehingga total
              pembayaran yang wajib dibayarkan oleh PIHAK PERTAMA kepada PIHAK
              KEDUA adalah sebesar <strong>{formatRupiah(financial.totalAmount)},- (
              {terbilangRupiah(financial.totalAmount)})</strong> (selanjutnya
              disebut <strong>“Total Pembayaran”</strong>).
            </li>
            <li>
              Nilai Kontrak sebagaimana dimaksud pada ayat 1 (satu) Pasal ini
              telah termasuk seluruh biaya KOL (<em>Key Opinion Leader</em>) dan
              Affiliator.
            </li>
            <li>
              Pembayaran dilakukan melalui transfer ke rekening resmi PIHAK
              KEDUA sebagai berikut:
              <div className="pl-4 py-1.5 font-mono text-[13px]">
                <p>Bank : {financial.bank.bankName}</p>
                <p>Nama Rekening : {financial.bank.accountName}</p>
                <p>Nomor Rekening : {financial.bank.accountNumber}</p>
                {financial.bank.kcp && <p>KCP : {financial.bank.kcp}</p>}
              </div>
            </li>
          </ol>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>2</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 3 : PASAL 3 (LANJUTAN), PASAL 4, PASAL 5
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <ol className="list-decimal pl-6 space-y-2 text-justify" start={5}>
            <li>
              Total pembayaran tersebut merupakan imbalan jasa pengelolaan
              Campaign dan tidak bergantung secara langsung pada tercapai atau
              tidak tercapainya target Kuantitas Video dan Kreator, sepanjang
              PIHAK KEDUA telah melaksanakan kewajibannya sesuai dengan
              Perjanjian ini.
            </li>
            <li>
              Seluruh pembayaran yang telah dilakukan oleh PIHAK PERTAMA kepada
              PIHAK KEDUA tidak dapat diminta kembali (<em>non-refundable</em>).
            </li>
            <li>
              Pajak yang timbul sehubungan dengan pelaksanaan Perjanjian ini
              dilaksanakan sesuai dengan ketentuan peraturan perundang-undangan
              yang berlaku.
            </li>
            <li>
              Apabila PIHAK PERTAMA tidak melakukan pembayaran sesuai dengan
              ketentuan Perjanjian ini, maka PIHAK KEDUA berhak untuk:
              <ol className="list-[lower-alpha] pl-5 mt-1 space-y-0.5">
                <li>Menunda pelaksanaan Campaign; dan/atau</li>
                <li>
                  Menghentikan sementara atau seluruh aktivitas Campaign, tanpa
                  mengurangi hak PIHAK KEDUA atas pembayaran yang telah atau
                  seharusnya diterima.
                </li>
              </ol>
            </li>
          </ol>

          {/* PASAL 4 */}
          <div className="mt-5 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 4</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              HAK DAN KEWAJIBAN PIHAK PERTAMA
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2 text-justify">
            <li>
              PIHAK PERTAMA berhak menerima laporan pelaksanaan Campaign dari
              PIHAK KEDUA sebagaimana dijelaskan pada ruang lingkup kerjasama
              dalam Pasal 1 (satu) Perjanjian ini.
            </li>
            <li>
              PIHAK PERTAMA berhak memberikan masukan terhadap konsep dan materi
              konten Campaign dengan catatan tetap diputuskan oleh PIHAK KEDUA
              untuk menunjang keberhasilan Campaign.
            </li>
            <li>
              PIHAK PERTAMA berkewajiban menyediakan produk, materi promosi,
              informasi ketersediaan stok, penetapan harga secara lengkap dan
              tepat waktu kepada PIHAK KEDUA, serta informasi lain yang
              diperlukan untuk mendukung pelaksanaan Campaign. Keterlambatan
              penyediaan informasi/materi oleh PIHAK PERTAMA yang mengakibatkan
              tertundanya pelaksanaan Campaign tidak dapat dibebankan sebagai
              Wanprestasi PIHAK KEDUA.
            </li>
            <li>
              PIHAK PERTAMA berkewajiban melakukan pembayaran Total Pembayaran
              kepada PIHAK KEDUA sebagaimana dijelaskan pada Pasal 3 (tiga)
              Perjanjian ini.
            </li>
            <li>
              PIHAK PERTAMA menjamin dan menyatakan bahwa:
              <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
                <li>
                  Seluruh produk yang dipromosikan dalam Campaign dibuat,
                  diedarkan, dan dijual secara sah sesuai peraturan
                  perundang-undangan, termasuk telah memiliki izin edar,
                  sertifikasi, dan/atau perizinan lain yang diwajibkan untuk
                  produk tersebut;
                </li>
                <li>
                  PIHAK PERTAMA adalah pemilik atau pemegang hak yang sah atas
                  merek, logo, foto, video, materi promosi, dan seluruh bahan
                  lain yang diserahkan kepada PIHAK KEDUA dan penggunaannya dalam
                  Campaign tidak melanggar hak kekayaan intelektual atau hak
                  lain milik pihak ketiga;
                </li>
                <li>
                  Seluruh informasi produk yang diberikan kepada PIHAK KEDUA,
                  termasuk klaim manfaat atau khasiat, komposisi, harga, promo,
                  dan ketersediaan stok, adalah benar, tidak menyesatkan, dan
                  dapat dipertanggungjawabkan, serta sesuai dengan peraturan
                  perlindungan konsumen dan periklanan yang berlaku.
                </li>
              </ol>
            </li>
            <li>
              PIHAK KEDUA berhak menolak, menunda, atau menghentikan penggunaan
              produk dan/atau materi tertentu dalam Campaign apabila menurut
              pertimbangan yang wajar produk atau materi tersebut berpotensi
              melanggar peraturan perundang-undangan, hak pihak ketiga, atau
              ketentuan platform, dan tindakan tersebut tidak dapat
              dikategorikan sebagai wanprestasi PIHAK KEDUA.
            </li>
          </ol>

          {/* PASAL 5 */}
          <div className="mt-5 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 5</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              HAK DAN KEWAJIBAN PIHAK KEDUA
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-1.5 text-justify">
            <li>
              PIHAK KEDUA berhak menerima pembayaran dari PIHAK PERTAMA sesuai
              dengan yang telah disepakati, sebagaimana dijelaskan pada Pasal 3
              (tiga) Perjanjian ini.
            </li>
            <li>
              PIHAK KEDUA berhak menentukan serta memutuskan konsep, strategi
              dan materi konten Campaign.
            </li>
            <li>
              PIHAK KEDUA berhak menolak permintaan perubahan dari PIHAK PERTAMA
              jika permintaan tersebut tidak sesuai dengan ruang lingkup pekerjaan
              yang disepakati.
            </li>
            <li>
              PIHAK KEDUA berkewajiban melaksanakan Campaign sesuai dengan ruang
              lingkup kerjasama sebagaimana diatur dalam Pasal 1 (satu) Perjanjian
              ini.
            </li>
            <li>
              PIHAK KEDUA berkewajiban memberikan laporan perkembangan (
              <em>progress report</em>) pelaksanaan Campaign kepada PIHAK
              PERTAMA secara berkala.
            </li>
          </ol>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>3</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 4 : PASAL 6 (APPROVAL KREATOR & KONTEN) & PASAL 7
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          {/* PASAL 6 */}
          <div className="text-center pt-2">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 6</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              APPROVAL KREATOR DAN KONTEN
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2 text-justify">
            <li>
              PIHAK PERTAMA berhak melakukan persetujuan (<em>approval</em>) atas
              list kreator yang diajukan oleh PIHAK KEDUA, dengan ketentuan
              revisi atas list kreator tersebut dapat diajukan maksimal sebanyak{" "}
              <strong>{approval.maxRevisions} ({terbilang(approval.maxRevisions)})
              kali</strong> pada setiap pemberian list kreator yang dilakukan
              PIHAK KEDUA.
            </li>
            <li>
              Apabila PIHAK PERTAMA tidak memberikan tanggapan dalam jangka waktu{" "}
              <strong>{approval.replyDays} ({terbilang(approval.replyDays)}) hari
              kerja</strong> sejak setiap pengajuan list kreator diterima, maka
              PIHAK PERTAMA dianggap telah menyetujui (<em>deemed approved</em>)
              list kreator yang diajukan tersebut.
            </li>
            <li>
              PIHAK PERTAMA berhak memberikan persetujuan (<em>approval</em>) atas
              drafting video yang dibuat oleh kreator, dalam jangka waktu paling
              lama <strong>{approval.replyDays} ({terbilang(approval.replyDays)})
              hari kerja</strong> sejak drafting video tersebut diterima oleh
              PIHAK PERTAMA.
            </li>
            <li>
              Apabila PIHAK PERTAMA tidak memberikan tanggapan dalam jangka waktu{" "}
              <strong>{approval.replyDays} ({terbilang(approval.replyDays)}) hari
              kerja</strong> sejak diterimanya drafting video sebagaimana dimaksud
              pada Ayat 3 (tiga), maka PIHAK PERTAMA dianggap telah menyetujui (
              <em>deemed approved</em>) drafting video tersebut.
            </li>
            <li>
              PIHAK KEDUA berhak menolak untuk melakukan revisi lebih lanjut atas
              list kreator dan/atau drafting video sebagaimana dimaksud pada Ayat
              1 (satu) dan Ayat 3 (tiga), apabila permintaan revisi atas objek
              yang sama telah diajukan oleh PIHAK PERTAMA lebih dari{" "}
              {approval.maxRevisions} ({terbilang(approval.maxRevisions)}) kali.
            </li>
            <li>
              Dalam hal PIHAK PERTAMA tidak memberikan persetujuan, revisi, atau
              tanggapan dalam jangka waktu sebagaimana dimaksud pada Ayat 2 (dua)
              dan Ayat 4 (empat), sehingga mengakibatkan mundurnya jadwal
              persiapan dan/atau pelaksanaan (<em>running</em>) Campaign
              sebagaimana diatur dalam Pasal 2 (dua) maka:
              <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
                <li>
                  Keterlambatan tersebut sepenuhnya menjadi tanggung jawab PIHAK
                  PERTAMA dan tidak dapat dikategorikan sebagai wanprestasi PIHAK
                  KEDUA;
                </li>
                <li>
                  Jangka waktu persiapan dan/atau pelaksanaan (<em>running</em>){" "}
                  Campaign diperpanjang secara otomatis sesuai jumlah hari
                  keterlambatan tersebut, tanpa memerlukan addendum tertulis,
                  dengan batas akumulatif paling lama{" "}
                  <strong>{approval.maxExtensionDays} (
                  {terbilang(approval.maxExtensionDays)}) hari kalender</strong>{" "}
                  (“Batas Perpanjangan”);
                </li>
                <li>
                  Total Pembayaran sebagaimana dimaksud dalam Pasal 3 (tiga)
                  tidak berkurang dan/atau tidak dapat diminta kembali oleh PIHAK
                  PERTAMA akibat keterlambatan dimaksud.
                </li>
              </ol>
            </li>
            <li>
              Segala permintaan revisi oleh PIHAK PERTAMA wajib diajukan secara
              tertulis (termasuk melalui WhatsApp atau email atau platform
              komunikasi kerja yang disepakati PARA PIHAK) disertai alasan yang
              jelas dan spesifik.
            </li>
            <li>
              Apabila akumulasi keterlambatan sebagaimana dimaksud pada ayat 6
              (enam) Pasal ini melampaui Batas Perpanjangan, PIHAK KEDUA berhak
              dengan pemberitahuan tertulis kepada PIHAK PERTAMA, memilih salah
              satu dari:
              <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
                <li>
                  Melanjutkan Campaign dengan jadwal baru yang ditetapkan PIHAK
                  KEDUA secara wajar, dengan ketentuan bahwa biaya tambahan yang
                  wajar dan dapat dibuktikan akibat penjadwalan ulang, termasuk
                  biaya creator yang harus dijadwalkan ulang atau diganti,
                  ditanggung oleh PIHAK PERTAMA berdasarkan persetujuan secara
                  tertulis dan/atau melalui chat WhatsApp PARA PIHAK; atau
                </li>
                <li>
                  Mengakhiri Perjanjian dengan pemberitahuan tertulis tanpa
                  memerlukan somasi, dengan akibat hukum sebagaimana diatur dalam
                  Pasal 9 ayat 3 huruf c angka (i) dan angka (ii) Perjanjian ini.
                </li>
              </ol>
            </li>
            <li>
              Hak persetujuan (<em>approval</em>) PIHAK PERTAMA sebagaimana
              dimaksud dalam Pasal ini terbatas pada:
              <ol className="list-[lower-alpha] pl-5 mt-1 space-y-0.5">
                <li>
                  Kesesuaian list kreator dengan jumlah dan tier sebagaimana
                  diatur dalam Pasal 1 ayat 3 (tiga) Perjanjian ini;
                </li>
                <li>
                  Kesesuaian drafting video dengan informasi produk yang
                  diberikan PIHAK PERTAMA; dan
                </li>
                <li>
                  Kepatuhan drafting video terhadap peraturan perundang-undangan
                  dan ketentuan platform. Keputusan akhir atas konsep, strategi,
                  gaya, format, dan eksekusi kreatif konten tetap berada pada
                  PIHAK KEDUA. PIHAK PERTAMA tidak dapat menolak list kreator
                  atau drafting video atas dasar selera atau preferensi kreatif
                  semata.
                </li>
              </ol>
            </li>
          </ol>

          {/* PASAL 7 */}
          <div className="mt-5 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 7</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              KEADAAN KAHAR (FORCE MAJEURE)
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-1.5 text-justify">
            <li>
              Bahwa yang dimaksud dengan Keadaan Kahar (<em>Force Majeure</em>){" "}
              dalam Perjanjian ini adalah peristiwa-peristiwa atau keadaan yang
              terjadi di luar kekuasaan dan/atau kemampuan PARA PIHAK untuk
              mengatasinya, bencana alam yang berakibat langsung terhadap PARA
              PIHAK dalam melaksanakan Perjanjian ini, termasuk namun tidak
              terbatas pada kebakaran, banjir, gempa bumi, pandemi, gangguan
              sistem elektronik/internet, perang, revolusi, terorisme, wabah
              penyakit, perubahan Peraturan Perundang-undangan yang berkaitan
              langsung dengan pelaksanaan Perjanjian ini, dan/atau kekacauan
              sosial yang merintangi dan menghalangi salah satu dari PARA PIHAK
              untuk menjalankan kewajiban dalam Perjanjian ini.
            </li>
            <li>
              Bahwa Pihak yang mengalami Keadaan Kahar (<em>Force Majeure</em>){" "}
              wajib memberitahukan kepada Pihak lainnya secara lisan
              selambat-lambatnya 48 (empat puluh delapan) jam dan diikuti dengan
              pemberitahuan secara tertulis selambat-lambatnya dalam waktu 7
              (tujuh) hari kalender setelah terjadinya Keadaan Kahar tersebut.
            </li>
          </ol>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>4</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 5 : PASAL 7 (LANJUTAN), PASAL 8, PASAL 9
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          <ol className="list-decimal pl-6 space-y-2 text-justify" start={3}>
            <li>
              Bahwa Pihak yang mengalami Keadaan Kahar dan tidak melaksanakan
              ketentuan sebagaimana dimaksud pada Ayat 2 (dua) Pasal ini
              menyebabkan peristiwa yang dialami tersebut tidak termasuk dalam
              kategori Keadaan Kahar (<em>Force Majeure</em>).
            </li>
            <li>
              Bahwa Pihak yang menerima pemberitahuan Keadaan Kahar dapat menolak
              atau menyetujui Keadaan Kahar yang dialami Pihak lainnya
              selambat-lambatnya dalam waktu 7 (tujuh) hari kalender setelah
              diterimanya pemberitahuan tertulis.
            </li>
            <li>
              Bahwa selama Keadaan Kahar berlangsung, kewajiban pihak yang
              terdampak dapat ditunda sementara tanpa dikenakan sanksi atau
              dianggap sebagai wanprestasi.
            </li>
            <li>
              Bahwa PARA PIHAK sepakat, apabila Keadaan Kahar berlangsung lebih
              dari 30 (tiga puluh) hari kalender sehingga salah satu Pihak tidak
              dapat memenuhi kewajiban, maka PARA PIHAK sepakat untuk melakukan
              musyawarah untuk membicarakan kembali tindak lanjut Perjanjian ini.
            </li>
            <li>
              Bahwa setelah berakhirnya Keadaan Kahar, PARA PIHAK sepakat untuk
              melakukan musyawarah guna menentukan kelanjutan pelaksanaan
              Perjanjian ini.
            </li>
          </ol>

          {/* PASAL 8 */}
          <div className="mt-5 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 8</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              KERAHASIAAN
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2 text-justify">
            <li>
              PARA PIHAK sepakat untuk menjaga kerahasiaan seluruh informasi,
              data, dan dokumen yang diperoleh sehubungan dengan pelaksanaan
              Perjanjian ini dan tidak akan mengungkapkannya kepada pihak ketiga
              tanpa persetujuan tertulis dari Pihak lainnya, kecuali diwajibkan
              oleh peraturan perundang-undangan atau perintah instansi yang
              berwenang.
            </li>
            <li>
              PIHAK PERTAMA dilarang menghubungi atau bekerja sama secara
              langsung dengan content creator yang digunakan dalam Campaign ini
              tanpa sepengetahuan dan persetujuan PIHAK KEDUA, baik selama masa
              berlaku Perjanjian maupun dalam jangka waktu{" "}
              <strong>{legal.nonCircumventionMonths} (
              {terbilang(legal.nonCircumventionMonths)}) bulan</strong> setelah
              Perjanjian berakhir.
            </li>
            <li>
              Kewajiban kerahasiaan sebagaimana dimaksud pada Pasal ini tetap
              berlaku meskipun Perjanjian ini telah berakhir.
            </li>
          </ol>

          {/* PASAL 9 */}
          <div className="mt-5 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 9</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              PEMBATALAN DAN PENGAKHIRAN PERJANJIAN
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2 text-justify">
            <li>
              Perjanjian ini dapat diakhiri sebelum berakhirnya jangka waktu
              sebagaimana dimaksud Pasal 2 (dua) apabila disepakati secara
              tertulis oleh PARA PIHAK.
            </li>
            <li>
              Dalam hal salah satu Pihak melakukan wanprestasi dan tidak
              memperbaiki pelanggaran tersebut dalam waktu{" "}
              <strong>{legal.curePeriodDays} ({terbilang(legal.curePeriodDays)})
              hari kalender</strong> sejak diterimanya surat peringatan/surat
              somasi tertulis dari Pihak lainnya, maka Pihak yang dirugikan berhak
              mengakhiri Perjanjian ini secara sepihak.
            </li>
            <li>
              Dalam pelaksanaan pengakhiran Perjanjian ini, PARA PIHAK sepakat
              untuk:
              <ol className="list-[lower-alpha] pl-5 mt-1 space-y-1">
                <li>
                  Mengesampingkan ketentuan Pasal 1266 KUHPerdata sepanjang
                  mengatur keharusan adanya putusan pengadilan untuk pengakhiran
                  Perjanjian, sehingga pengakhiran dapat dilakukan secara sepihak
                  melalui pemberitahuan tertulis tanpa melalui putusan pengadilan;
                </li>
                <li>
                  Pengesampingan tersebut tidak menghapus hak Pihak yang dirugikan
                  untuk menuntut penggantian biaya, kerugian, dan bunga sesuai
                  Pasal 1267 KUHPerdata dan Pasal 12 Perjanjian ini;
                </li>
                <li>
                  Dalam hal Perjanjian diakhiri karena wanprestasi PIHAK PERTAMA,
                  atau diakhiri sepihak tanpa alasan yang sah, PIHAK KEDUA berhak
                  atas: (i) pembayaran pekerjaan yang telah dilaksanakan sampai
                  tanggal efektif pengakhiran; (ii) penggantian biaya yang telah
                  dikeluarkan dan/atau kewajiban kepada content creator; dan (iii)
                  ganti rugi sesuai Pasal 12 Perjanjian ini.
                </li>
              </ol>
            </li>
            <li>
              Pada saat Perjanjian ini berakhir atau diakhiri, seluruh hak dan
              kewajiban yang telah timbul wajib tetap diselesaikan dan dipenuhi
              oleh masing-masing Pihak, dengan ketentuan PIHAK PERTAMA wajib
              melunasi seluruh tagihan selambat-lambatnya 14 (empat belas) hari
              kalender sejak tanggal efektif pengakhiran atau diterimanya invoice.
            </li>
            <li>
              Berakhirnya/batalnya Perjanjian ini tidak membebaskan kewajiban PARA
              PIHAK untuk tetap menyelesaikan seluruh kewajibannya yang masih ada
              sampai disepakati secara tertulis.
            </li>
          </ol>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>5</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 6 : PASAL 10, PASAL 11, PASAL 12
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          {/* PASAL 10 */}
          <div className="text-center pt-2">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 10</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              PENYELESAIAN PERSELISIHAN
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2 text-justify">
            <li>
              PARA PIHAK sepakat untuk menyelesaikan segala perselisihan yang
              mungkin timbul akibat dari pelaksanaan Perjanjian ini melalui
              musyawarah agar mencapai mufakat.
            </li>
            <li>
              Jika dalam waktu 30 (tiga puluh) Hari Kalender sejak dimulainya
              penyelesaian sengketa tidak tercapai mufakat, maka PARA PIHAK
              sepakat untuk menyelesaikan perselisihan tersebut melalui{" "}
              <strong>{legal.courtJurisdiction}</strong>.
            </li>
            <li>
              Biaya yang timbul sehubungan dengan pasal ini menjadi beban PARA
              PIHAK.
            </li>
          </ol>

          {/* PASAL 11 */}
          <div className="mt-5 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 11</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              HAK KEKAYAAN INTELEKTUAL
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2 text-justify">
            <li>
              Bahwa Hak cipta atas konten yang diproduksi dalam kampanye ini tetap
              menjadi milik content creator dan PIHAK KEDUA.
            </li>
            <li>
              Apabila PIHAK PERTAMA ingin lisensi non-eksklusif dengan menggunakan
              konten Campaign untuk keperluan promosi dan pemasaran produk PIHAK
              PERTAMA, serta publikasi di media sosial dan platform digital milik
              PIHAK KEDUA, maka PIHAK PERTAMA wajib konfirmasi secara tertulis
              kepada PIHAK KEDUA paling lambat 7 (tujuh) hari kerja.
            </li>
            <li>
              PIHAK PERTAMA tidak diperkenankan, tanpa persetujuan tertulis
              terlebih dahulu dari PIHAK KEDUA, untuk:
              <ol className="list-[lower-alpha] pl-5 mt-1 space-y-0.5">
                <li>Mengubah, mengedit atau memodifikasi konten;</li>
                <li>
                  Menggunakan konten untuk tujuan komersial di luar ruang lingkup
                  promosi produk sebagaimana dimaksud pada ayat 2 (dua) Pasal ini;
                </li>
                <li>
                  Menjual, mengalihkan, atau melisensikan konten kepada Pihak
                  Ketiga.
                </li>
              </ol>
            </li>
          </ol>

          {/* PASAL 12 */}
          <div className="mt-5 text-center">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 12</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              GANTI RUGI
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2 text-justify">
            <li>
              Apabila salah satu Pihak melakukan kesalahan, kelalaian, dan/atau
              pelanggaran terhadap ketentuan Perjanjian ini maupun peraturan
              perundang-undangan yang berlaku yang mengakibatkan timbulnya
              kerugian bagi Pihak lainnya, maka Pihak yang melakukan kesalahan
              tersebut wajib mengganti kerugian yang timbul.
            </li>
            <li>
              Setiap tuntutan ganti rugi wajib diajukan secara tertulis disertai
              bukti-bukti yang sah mengenai timbulnya kerugian, besarnya nilai,
              serta hubungan sebab-akibat.
            </li>
            <li>
              Pihak yang mengalami kerugian tidak berhak menuntut ganti rugi
              apabila kerugian tersebut timbul akibat kesalahan atau kelalaian
              Pihak yang bersangkutan sendiri.
            </li>
            <li>
              Ketentuan mengenai ganti rugi berlaku pula terhadap kerugian akibat
              tuntutan pihak ketiga termasuk instansi pemerintah dan penyelenggara
              platform.
            </li>
            <li>
              PIHAK PERTAMA wajib membebaskan dan mengganti seluruh kerugian PIHAK
              KEDUA, termasuk biaya perkara, denda, dan/atau biaya lainnya.
            </li>
            <li>
              Pihak yang menerima klaim pihak ketiga wajib memberitahukan Pihak
              lainnya secara tertulis paling lambat 7 (tujuh) hari kerja.
            </li>
            <li>
              Total tanggung jawab PIHAK KEDUA kepada PIHAK PERTAMA berdasarkan
              atau sehubungan dengan Perjanjian ini tidak melebihi Nilai Kontrak
              sebagaimana dimaksud dalam Pasal 3 ayat 1 (satu) Perjanjian ini.
            </li>
            <li>
              Ketentuan ganti rugi tetap berlaku dan mengikat sekalipun Perjanjian
              ini telah berakhir atau diakhiri.
            </li>
          </ol>
        </div>

        <div className="text-right text-[12px] pt-4">
          <span>6</span>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          HALAMAN 7 : PASAL 13 & TANDA TANGAN PARA PIHAK
      ───────────────────────────────────────────────────────────── */}
      <section className="pks-page relative flex flex-col justify-between bg-white text-black p-[25.4mm] w-[210mm] min-h-[297mm] shadow-md mx-auto mb-8 print:shadow-none print:m-0 print:mb-0 print:break-after-page box-border">
        <div>
          {/* PASAL 13 */}
          <div className="text-center pt-2">
            <h3 className="font-bold text-[15px] tracking-wide">PASAL 13</h3>
            <h4 className="font-bold text-[14px] uppercase tracking-wide">
              LAIN-LAIN
            </h4>
          </div>

          <ol className="list-decimal pl-6 mt-3 space-y-2.5 text-justify">
            <li>
              Segala penafsiran yang timbul terhadap ketentuan dalam perjanjian ini
              seluruhnya tunduk pada ketentuan hukum yang berlaku di wilayah
              Republik Indonesia.
            </li>
            <li>
              Segala perubahan dan/atau penambahan atas Perjanjian ini hanya sah
              apabila dibuat secara tertulis dan ditandatangani oleh PARA PIHAK
              dalam bentuk addendum yang merupakan satu kesatuan dan bagian yang
              tidak terpisahkan dari Perjanjian ini.
            </li>
            <li>
              Perjanjian ini secara sah telah menggantikan segala
              persetujuan-persetujuan dan/atau janji-janji lisan lainnya yang
              telah diadakan sebelum perjanjian ini ditandatangani.
            </li>
            <li>
              Ketentuan mengenai kerahasiaan atas seluruh informasi, data dan
              dokumen yang dipertukarkan PARA PIHAK sehubungan dengan Perjanjian
              ini merujuk sepenuhnya pada Pasal 8 (delapan) Perjanjian ini.
            </li>
            <li>
              Segala ketentuan-ketentuan dan syarat-syarat dalam Perjanjian ini
              berlaku serta mengikat bagi PARA PIHAK yang menandatangani,
              pengganti-penggantinya dan pihak-pihak yang memperoleh keuntungan dari
              padanya.
            </li>
            <li>
              Perjanjian ini dibuat dalam rangkap 2 (dua), masing-masing bermaterai
              cukup dan mempunyai kekuatan hukum yang sama, di mana masing-masing
              pihak menerima 1 (satu) rangkap asli.
            </li>
          </ol>

          <p className="mt-6 text-justify indent-8">
            Demikian Perjanjian ini dibuat dan ditandatangani oleh PARA PIHAK
            dengan penuh kesadaran dan tanpa paksaan dari pihak manapun, untuk
            dilaksanakan dan dipatuhi sebagaimana mestinya.
          </p>

          {/* Kotak Tanda Tangan Para Pihak (Clean - Tanpa Materai Box) */}
          <div className="grid grid-cols-2 gap-8 mt-10 pt-4">
            {/* Pihak Pertama (Brand / Klien) */}
            <div className="text-center">
              <p className="font-bold text-[14px]">PIHAK PERTAMA</p>
              <p className="font-bold text-[13px] uppercase mt-1 min-h-[40px]">
                {client.name}
                {client.brandName ? ` ("${client.brandName}")` : ""}
              </p>

              {/* Ruang Tanda Tangan Bersih */}
              <div className="h-24 my-4" />

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

              {/* Ruang Tanda Tangan Bersih */}
              <div className="h-24 my-4" />

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
          <span>7</span>
        </div>
      </section>
    </div>
  );
}
