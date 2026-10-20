"use client";

import React from "react";
import type { PksHypeData } from "@/types/pks";
import {
  terbilang,
  terbilangRupiah,
  formatRupiah,
  formatTanggalLegal,
  formatTanggalId,
} from "@/lib/terbilang";
import { DynamicPksPaginator } from "./DynamicPksPaginator";

interface Props {
  data: PksHypeData;
}

export function PksHypeDocument({ data }: Props) {
  const { header, client, agency, campaign, term, financial, approval, legal } =
    data;

  const taxPercentText =
    financial.taxType === "ppn_11"
      ? "11% (sebelas persen)"
      : financial.taxType === "pph_0_5"
        ? "0,5% (nol koma lima persen)"
        : financial.taxType === "pph_23"
          ? "2% (dua persen)"
          : "0%";

  const blocks: React.ReactNode[] = [
    /* 1. Header Judul */
    <div key="b-header" className="text-center pt-2 pb-2">
      <h1 className="text-[17px] font-bold tracking-wide uppercase">
        PERJANJIAN KERJASAMA MARKETING
      </h1>
      <p className="text-[15px] font-bold tracking-wide uppercase my-1">
        ANTARA
      </p>
      <h2 className="text-[17px] font-bold tracking-wide uppercase">
        {client.name.toUpperCase()}{" "}
        {client.brandName ? `("${client.brandName.toUpperCase()}")` : ""}
      </h2>
      <p className="text-[15px] font-bold tracking-wide uppercase my-1">
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
        Pada hari ini, {formatTanggalLegal(header.signDate)}, telah
        ditandatangani Perjanjian Kerjasama ini (selanjutnya disebut{" "}
        <strong>“Perjanjian”</strong>), oleh dan antara pihak-pihak yang
        bertanda tangan di bawah ini:
      </p>

      <ol className="list-decimal pl-6 space-y-2 text-justify">
        <li>
          <strong>{client.name}</strong>{" "}
          {client.brandName ? `("${client.brandName}")` : ""}, suatu{" "}
          {client.entityType} yang didirikan berdasarkan hukum Negara Republik
          Indonesia, beralamat di {client.address}, yang dalam hal ini diwakili
          oleh <strong>{client.signeeName}</strong> selaku{" "}
          <strong>{client.signeePosition}</strong>, oleh karenanya sah bertindak
          mewakili {client.signeeBasis} untuk bertindak dan atas nama{" "}
          {client.name}{" "}
          {client.brandName ? `("${client.brandName}")` : ""}, untuk selanjutnya
          disebut sebagai---------------------------------
          <strong>PIHAK PERTAMA</strong>.
        </li>

        <div className="py-0.5 text-center font-bold tracking-widest text-[13px]">
          Dan
        </div>

        <li>
          <strong>{agency.companyLegalName}</strong>, suatu perseroan komanditer
          yang didirikan berdasarkan hukum Negara Republik Indonesia,
          berdomisili di {agency.address}, yang dalam hal ini diwakili oleh{" "}
          <strong>{agency.signeeName}</strong> selaku{" "}
          <strong>{agency.signeePosition}</strong>, oleh karenanya sah bertindak
          mewakili untuk bertindak dan atas nama{" "}
          <strong>{agency.companyLegalName}</strong>, untuk selanjutnya disebut
          sebagai--------------------------------------------------------------------------------------------------------------------
          <strong>PIHAK KEDUA</strong>.
        </li>
      </ol>

      <p className="text-justify pt-1">
        <strong>PIHAK PERTAMA</strong> dan <strong>PIHAK KEDUA</strong> secara
        bersama-sama disebut sebagai <strong>“PARA PIHAK”</strong>.
      </p>
    </div>,

    /* 3. Latar Belakang / Premis */
    <div key="b-premis" className="space-y-2 text-justify">
      <p>PARA PIHAK terlebih dahulu menerangkan hal-hal sebagai berikut:</p>
      <ol className="list-[lower-alpha] pl-6 space-y-1">
        <li>
          Bahwa PIHAK PERTAMA adalah{" "}
          {client.businessDescription ||
            `pemilik dan pengelola brand “${client.brandName || client.name}”`};
        </li>
        <li>
          Bahwa PIHAK KEDUA adalah perusahaan yang bergerak di bidang jasa;
        </li>
        <li>
          Bahwa PIHAK PERTAMA bermaksud menggunakan jasa PIHAK KEDUA tersebut,
          dengan hak dan kewajiban PARA PIHAK sebagaimana diatur lebih lanjut
          dalam Perjanjian ini;
        </li>
        <li>
          Bahwa PARA PIHAK sepakat untuk melakukan Kerjasama di bidang marketing.
        </li>
      </ol>
      <p className="pt-1">
        Selanjutnya PARA PIHAK sepakat untuk mengikatkan diri dalam Perjanjian
        dengan ketentuan-ketentuan sebagai berikut:
      </p>
    </div>,

    /* 4. PASAL 1: RUANG LINGKUP KERJASAMA */
    <div key="b-pasal-1" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 1</p>
        <p className="uppercase">RUANG LINGKUP KERJASAMA</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK PERTAMA dengan ini menunjuk PIHAK KEDUA dan PIHAK KEDUA dengan
          ini menerima penunjukan dari PIHAK PERTAMA untuk melaksanakan Jasa dan
          setiap bagian daripadanya sebagaimana dimaksud dalam Perjanjian ini,
          sesuai dengan perintah dan petunjuk PIHAK PERTAMA yang berkaitan
          langsung dengan ruang lingkup pekerjaan sebagaimana tercantum dalam
          Perjanjian ini dan lampiran-lampirannya.
        </li>
        <li>
          Pekerjaan yang dimaksud yaitu berupa membantu PIHAK PERTAMA untuk
          mendapatkan <strong>{campaign.programName}</strong> di platform
          TikTok.
        </li>
        <li>
          PIHAK KEDUA wajib menyediakan KOL/Creator yang sudah ditentukan pada
          Outlet <strong>{campaign.outletName}</strong> yang beralamat di{" "}
          {campaign.outletAddress}. Dengan ketentuan sebagai berikut:
          <ol className="list-[lower-alpha] pl-6 space-y-1 mt-1">
            <li>
              Menyediakan <strong>{campaign.creatorsCount}</strong> (
              {terbilang(campaign.creatorsCount)}) Creator/Outlet;
            </li>
            <li>
              Masing-masing Creator wajib mengunggah minimal{" "}
              <strong>{campaign.minVtPerCreator}</strong> (
              {terbilang(campaign.minVtPerCreator)}) Video Content Tiktok (VT),
              sehingga total konten yang dihasilkan untuk Outlet{" "}
              <strong>{campaign.outletName}</strong> berjumlah{" "}
              <strong>{campaign.totalVt}</strong> ({terbilang(campaign.totalVt)}
              ) VT;
            </li>
            <li>
              PIHAK KEDUA juga bertanggung jawab atas penyusunan{" "}
              <strong>TikTok GO Campaign Strategy</strong> secara menyeluruh,
              mulai dari perencanaan awal hingga pelaksanaan akhir, termasuk
              penentuan Creator, penyusunan brief, dan hal-hal terkait lainnya;
            </li>
            <li>
              Serta melaksanakan Back-end Management berupa aktivasi{" "}
              <strong>TikTok-Go Dashboard</strong>.
            </li>
          </ol>
        </li>
      </ol>
    </div>,

    /* 5. PASAL 2: JANGKA WAKTU DAN BERAKHIRNYA PERJANJIAN */
    <div key="b-pasal-2" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 2</p>
        <p className="uppercase">JANGKA WAKTU DAN BERAKHIRNYA PERJANJIAN</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Perjanjian ini berlaku mengikat bagi PARA PIHAK terhitung sejak tanggal{" "}
          <strong>{formatTanggalId(term.startDate)}</strong> yang terdiri atas
          masa persiapan pelaksanaan Campaign dan masa pelaksanaan (running)
          Campaign sebagaimana diatur dalam ayat 2 (dua) Pasal ini.
        </li>
        <li>
          PIHAK KEDUA wajib memulai persiapan pelaksanaan Campaign
          selambat-lambatnya {term.prepDurationDays} (tiga puluh) hari kalender
          sebelum Campaign berjalan (running) yaitu terhitung sejak tanggal{" "}
          <strong>{formatTanggalId(term.prepStartDate)}</strong> sampai dengan
          tanggal <strong>{formatTanggalId(term.prepEndDate)}</strong>, masa
          persiapan sebagaimana dimaksud pada ayat ini dihitung di luar dan tidak
          mengurangi jangka waktu pelaksanaan (running) Campaign selama{" "}
          {term.runningDurationDays} (tiga puluh) hari kalender sebagaimana
          dimaksud pada ayat 3 (tiga) Pasal ini.
        </li>
        <li>
          Campaign dinyatakan mulai berjalan (running) sejak tanggal publikasi
          konten video pertama (<strong>“First VT”</strong>) oleh content
          creator yang dikelola PIHAK KEDUA di platform TikTok (
          <strong>“Tanggal Mulai Campaign”</strong>), yang ditargetkan jatuh
          pada tanggal <strong>{formatTanggalId(term.firstVtDate)}</strong> dan
          berlangsung selama {term.runningDurationDays} (tiga puluh) hari
          kalender sejak Tanggal Mulai Campaign tersebut sampai dengan tanggal{" "}
          <strong>{formatTanggalId(term.runningEndDate)}</strong>.
        </li>
        <li>
          Perjanjian ini dapat diubah dan/atau diperpanjang atas dasar kesepakatan
          PARA PIHAK yang akan dituangkan dalam suatu Addendum Perjanjian yang
          dibuat secara tertulis dan ditandatangani oleh PARA PIHAK.
        </li>
        <li>
          Pihak yang bermaksud untuk tidak memperpanjang Perjanjian ini wajib
          memberitahukan secara tertulis kepada Pihak lainnya
          selambat-lambatnya {term.noticeDays} (empat belas) hari kerja sebelum
          berakhirnya Perjanjian.
        </li>
      </ol>
    </div>,

    /* 6. PASAL 3: NILAI KONTRAK DAN TATA CARA PEMBAYARAN */
    <div key="b-pasal-3" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 3</p>
        <p className="uppercase">NILAI KONTRAK DAN TATA CARA PEMBAYARAN</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PARA PIHAK sepakat bahwa harga yang disepakati dalam Perjanjian ini
          adalah sebesar <strong>Rp. {formatRupiah(financial.contractValue)},-</strong>{" "}
          ({terbilangRupiah(financial.contractValue)}) sebelum pajak
          (selanjutnya disebut <strong>“Nilai Kontrak”</strong>).
        </li>
        <li>
          Nilai Kontrak tersebut akan dikenakan PPN sebesar {taxPercentText}{" "}
          yaitu sebesar <strong>Rp. {formatRupiah(financial.taxAmount)},-</strong>{" "}
          ({terbilangRupiah(financial.taxAmount)}), sehingga total pembayaran
          yang wajib dibayarkan oleh PIHAK PERTAMA kepada PIHAK KEDUA adalah
          sebesar <strong>Rp. {formatRupiah(financial.totalAmount)},-</strong>{" "}
          ({terbilangRupiah(financial.totalAmount)}), (selanjutnya disebut{" "}
          <strong>“Total Pembayaran”</strong>).
        </li>
        <li>
          PARA PIHAK sepakat pembayaran dilakukan langsung tanpa termin waktu
          pembayaran, yakni <strong>100% (seratus persen)</strong> setelah
          ditandatanganinya perjanjian ini sebelum pekerjaan dimulai.
        </li>
        <li>
          PARA PIHAK sepakat bahwa harga yang tertera pada Ayat 2 (dua) Pasal ini
          merupakan akumulasi dari pembayaran Outlet{" "}
          <strong>{campaign.outletName}</strong> yang beralamat di{" "}
          {campaign.outletAddress}.
        </li>
        <li>
          Bahwa rincian penagihan adalah sebagai berikut:
          <ol className="list-[lower-alpha] pl-6 space-y-1 mt-1">
            <li>
              Sebelum pengiriman invoice, PIHAK KEDUA akan mengirimkan softcopy
              invoice untuk disesuaikan dengan data PIHAK PERTAMA, jangka waktu
              konfirmasi softcopy invoice dari PIHAK PERTAMA paling lambat 1
              (satu) hari kerja setelah softcopy invoice diterima oleh PIHAK
              PERTAMA.
            </li>
            <li>
              PIHAK PERTAMA berhak untuk menolak invoice PIHAK KEDUA apabila
              terbukti lampiran sebagaimana dimaksud dalam pasal ini tidak
              lengkap dan/atau tidak sesuai dengan yang sebenarnya paling lambat
              1 (satu) hari kerja setelah Invoice diterima oleh PIHAK PERTAMA,
              apabila tidak ada pemberitahuan penolakan invoice dalam kurun waktu
              1 (satu) hari kerja setelah invoice diterima oleh PIHAK PERTAMA,
              maka invoice beserta lampiran yang PIHAK KEDUA kirimkan dianggap
              sudah sesuai dengan yang sebenarnya.
            </li>
            <li>
              Jangka waktu pembayaran yang dilakukan oleh PIHAK PERTAMA paling
              lambat 7 (tujuh) hari kerja setelah invoice diterima.
            </li>
            <li>
              Apabila PIHAK PERTAMA tidak melakukan pembayaran dalam jangka
              waktu yang telah ditentukan, maka PIHAK KEDUA berhak menunda
              pelaksanaan pekerjaan hingga pembayaran diterima sepenuhnya, tanpa
              dianggap sebagai Wanprestasi.
            </li>
            <li>
              Seluruh pembayaran yang telah dilakukan oleh PIHAK PERTAMA kepada
              PIHAK KEDUA tidak dapat diminta kembali (<em>non-refundable</em>).
            </li>
            <li>
              Apabila PIHAK PERTAMA tidak melakukan pembayaran sesuai dengan
              ketentuan Perjanjian ini, maka PIHAK KEDUA berhak untuk menunda
              pelaksanaan dan/atau menghentikan sementara atau seluruh aktivitas,
              tanpa mengurangi hak PIHAK KEDUA atas pembayaran yang telah atau
              seharusnya diterima.
            </li>
            <li>
              Pembayaran yang dilakukan PIHAK PERTAMA di luar rekening tidak akan
              diterima. PIHAK KEDUA hanya menerima segala pembayaran melalui
              transfer dan bukti transfer akan menjadi bukti yang sah penerimaan
              pembayaran ke rekening:
              <div className="pl-4 py-1.5 font-semibold text-[13px] space-y-0.5">
                <p>Nama Rekening : {financial.bank.accountName}</p>
                <p>Nama Bank : {financial.bank.bankName}</p>
                <p>No. Rekening : {financial.bank.accountNumber}</p>
              </div>
            </li>
          </ol>
        </li>
      </ol>
    </div>,

    /* 7. PASAL 4: HAK DAN KEWAJIBAN PIHAK PERTAMA */
    <div key="b-pasal-4" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 4</p>
        <p className="uppercase">HAK DAN KEWAJIBAN PIHAK PERTAMA</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK PERTAMA berhak mendapatkan jumlah kreator dan kewajiban lain yang
          sudah dijanjikan oleh kedua belah pihak sebagaimana tercantum pada
          Pasal 1 (satu) Perjanjian ini.
        </li>
        <li>
          PIHAK PERTAMA berhak mendapatkan laporan hasil pekerjaan yang
          diberikan oleh PIHAK KEDUA sesuai dengan ketentuan yang diatur dalam
          Perjanjian ini.
        </li>
        <li>
          PIHAK PERTAMA berhak mendapatkan laporan final hasil pekerjaan dari
          PIHAK KEDUA, dengan target creator dan video yang telah disepakati
          PARA PIHAK, sepanjang PIHAK PERTAMA memberikan persetujuan (approval)
          sesuai jangka waktu yang diatur dalam Pasal 5 (lima) Perjanjian ini.
          Keterlambatan pencapaian target akibat keterlambatan approval PIHAK
          PERTAMA tidak dapat dikategorikan sebagai wanprestasi PIHAK KEDUA.
        </li>
        <li>
          Perhitungan dari Target di atas dihitung mulai dari tanggal{" "}
          <strong>{formatTanggalId(term.firstVtDate)}</strong> hingga
          berakhirnya perjanjian ini.
        </li>
        <li>
          PIHAK PERTAMA berhak untuk menerima laporan performa secara berkala
          terkait Pekerjaan yang diperjanjikan dalam Perjanjian ini.
        </li>
        <li>
          PIHAK PERTAMA berhak untuk meminta dokumen-dokumen lain yang diperlukan
          berkaitan dengan dilaksanakannya Perjanjian ini termasuk namun tidak
          terbatas terhadap kepentingan perpajakan, dan keperluan lainnya yang
          diatur oleh Peraturan Perundang-Undangan apabila diperlukan.
        </li>
        <li>
          PIHAK PERTAMA berhak untuk mendapatkan kepastian bahwa data-data yang
          diberikan oleh PIHAK KEDUA merupakan data-data yang valid, benar, dan
          dapat dipertanggungjawabkan.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban melakukan pembayaran Total Pembayaran
          kepada PIHAK KEDUA sebagaimana dijelaskan pada Pasal 3 (tiga)
          Perjanjian ini.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban memastikan SOP sudah sesuai dengan standar
          dari <strong>{client.brandName || client.name}</strong>, tujuannya
          agar video promosi tidak salah atau menyimpang.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban menjaga nama baik dan/atau kerahasiaan
          data-data yang diberikan oleh PIHAK KEDUA baik selama jangka waktu
          Perjanjian ini maupun setelah berakhirnya jangka waktu Perjanjian ini.
        </li>
        <li>
          PIHAK PERTAMA berkewajiban mematuhi segala ketentuan peraturan
          perundang-undangan yang berlaku berkaitan dengan dilaksanakannya
          Perjanjian ini.
        </li>
        <li>
          PIHAK PERTAMA telah membaca dan menyetujui pedoman tata cara serta
          syarat-syarat berkaitan dengan pelaksanaan Perjanjian ini yang
          ditentukan oleh PIHAK KEDUA.
        </li>
      </ol>
    </div>,

    /* 8. PASAL 5: APPROVAL KREATOR DAN KONTEN */
    <div key="b-pasal-5" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 5</p>
        <p className="uppercase">APPROVAL KREATOR DAN KONTEN</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK PERTAMA berhak melakukan persetujuan (approval) atas list kreator
          yang diajukan oleh PIHAK KEDUA, dengan ketentuan revisi atas list
          kreator tersebut dapat diajukan maksimal sebanyak {approval.maxRevisions}{" "}
          (tiga) kali pada setiap pemberian list kreator yang dilakukan PIHAK
          KEDUA.
        </li>
        <li>
          Apabila PIHAK PERTAMA tidak memberikan tanggapan dalam jangka waktu{" "}
          {approval.replyDays} (tiga) hari kerja sejak setiap pengajuan list
          kreator diterima, maka PIHAK PERTAMA dianggap telah menyetujui (
          <em>deemed approved</em>) list kreator yang diajukan tersebut.
        </li>
        <li>
          PIHAK PERTAMA berhak memberikan persetujuan (approval) atas drafting
          video yang dibuat oleh kreator, dalam jangka waktu paling lama{" "}
          {approval.replyDays} (tiga) hari kerja sejak drafting video tersebut
          diterima oleh PIHAK PERTAMA.
        </li>
        <li>
          Apabila PIHAK PERTAMA tidak memberikan tanggapan dalam jangka waktu{" "}
          {approval.replyDays} (tiga) hari kerja sejak diterimanya drafting video
          sebagaimana dimaksud pada Ayat 3 (tiga), maka PIHAK PERTAMA dianggap
          telah menyetujui (<em>deemed approved</em>) drafting video tersebut.
        </li>
        <li>
          PIHAK KEDUA berhak menolak untuk melakukan revisi lebih lanjut atas
          list kreator dan/atau drafting video sebagaimana dimaksud pada Ayat 1
          (satu) dan Ayat 3 (tiga), apabila permintaan revisi atas objek yang
          sama telah diajukan oleh PIHAK PERTAMA lebih dari {approval.maxRevisions}{" "}
          (tiga) kali.
        </li>
        <li>
          Dalam hal PIHAK PERTAMA tidak memberikan persetujuan, revisi, atau
          tanggapan dalam jangka waktu sebagaimana dimaksud pada Ayat 2 (dua)
          dan Ayat 4 (empat), sehingga mengakibatkan mundurnya jadwal persiapan
          dan/atau pelaksanaan (running) Campaign sebagaimana diatur dalam Pasal
          2 (dua) maka:
          <ol className="list-[lower-alpha] pl-6 space-y-1 mt-1">
            <li>
              Keterlambatan tersebut sepenuhnya menjadi tanggung jawab PIHAK
              PERTAMA dan tidak dapat dikategorikan sebagai wanprestasi PIHAK
              KEDUA.
            </li>
            <li>
              Jangka waktu persiapan dan/atau pelaksanaan (running) Campaign
              diperpanjang secara otomatis sesuai dengan jumlah hari
              keterlambatan tersebut, tanpa memerlukan persetujuan dan/atau
              Addendum tertulis lebih lanjut dari PARA PIHAK.
            </li>
            <li>
              Total Pembayaran sebagaimana dimaksud dalam Pasal 3 (tiga) tidak
              berkurang dan/atau dapat diminta kembali oleh PIHAK PERTAMA akibat
              keterlambatan dimaksud.
            </li>
          </ol>
        </li>
        <li>
          Segala permintaan revisi oleh PIHAK PERTAMA wajib diajukan secara
          tertulis (termasuk melalui WhatsApp atau email atau platform komunikasi
          kerja yang disepakati PARA PIHAK) disertai alasan yang jelas dan
          spesifik.
        </li>
      </ol>
    </div>,

    /* 9. PASAL 6: HAK DAN KEWAJIBAN PIHAK KEDUA */
    <div key="b-pasal-6" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 6</p>
        <p className="uppercase">HAK DAN KEWAJIBAN PIHAK KEDUA</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PIHAK KEDUA berhak menerima pembayaran dari PIHAK PERTAMA sesuai
          dengan yang telah disepakati, sebagaimana dijelaskan pada Pasal 3
          (tiga) Perjanjian ini.
        </li>
        <li>
          PARA PIHAK memahami dan sepakat akan bertanggung jawab untuk
          pembayaran pajak masing-masing dan untuk memenuhi persyaratan
          administratif perpajakan sesuai dengan peraturan pajak yang berlaku di
          Negara Republik Indonesia.
        </li>
        <li>
          Apabila ditemukan pelaksanaan yang tidak sesuai dengan SOP pada saat
          Kreator mengambil konten di Outlet <strong>{campaign.outletName}</strong>,
          maka PIHAK KEDUA berhak menyampaikan informasi dan/atau keberatan
          tersebut secara tertulis dan/atau menyampaikan keberatan via telepon
          kepada Penanggung Jawab PIHAK PERTAMA guna untuk ditindaklanjuti.
        </li>
        <li>
          PIHAK KEDUA berhak untuk melakukan penagihan pembayaran terhadap PIHAK
          PERTAMA atas balas jasa terhadap pekerjaan yang telah dilakukan apabila
          setelah jangka waktu pembayaran yang ditentukan PIHAK PERTAMA belum
          melakukan pembayaran.
        </li>
        <li>
          PIHAK KEDUA berhak menolak untuk melakukan pekerjaan yang diduga
          melanggar ketentuan peraturan PIHAK KEDUA dan/atau melanggar
          peraturan perundang-undangan yang berlaku.
        </li>
        <li>
          PIHAK KEDUA berhak memastikan kepada PIHAK PERTAMA mengenai data-data
          maupun dokumen-dokumen yang dikirimkan kepada PIHAK PERTAMA telah
          digunakan sesuai dengan maksud dan tujuan dalam Perjanjian ini.
        </li>
        <li>
          PIHAK KEDUA berhak untuk menghapus penyimpanan pekerjaan yang
          diberikan kepada PIHAK PERTAMA apabila di kemudian hari terdapat kasus
          hukum yang menyangkut PIHAK PERTAMA, kecuali kasus tersebut melibatkan
          PIHAK KEDUA.
        </li>
        <li>
          PIHAK KEDUA berhak menolak permintaan perubahan dari PIHAK PERTAMA jika
          permintaan tersebut tidak sesuai dengan ruang lingkup pekerjaan yang
          disepakati.
        </li>
        <li>
          PIHAK KEDUA berkewajiban melaksanakan pekerjaan sesuai ruang lingkup
          Pasal 1 (satu) Perjanjian ini.
        </li>
      </ol>
    </div>,

    /* 10. PASAL 7: KEADAAN KAHAR (FORCE MAJEURE) */
    <div key="b-pasal-7" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 7</p>
        <p className="uppercase">KEADAAN KAHAR (FORCE MAJEURE)</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Bahwa yang dimaksud dengan Keadaan Kahar (<em>Force Majeure</em>) dalam
          Perjanjian ini adalah peristiwa-peristiwa atau keadaan yang terjadi di
          luar kekuasaan dan/atau kemampuan PARA PIHAK untuk mengatasinya,
          bencana alam yang berakibat langsung terhadap PARA PIHAK dalam
          melaksanakan Perjanjian ini, termasuk namun tidak terbatas pada
          kebakaran, banjir, gempa bumi, pandemi, gangguan sistem
          elektronik/internet, perang, revolusi, terorisme, wabah penyakit,
          perubahan Peraturan Perundang-undangan yang berkaitan langsung dengan
          pelaksanaan Perjanjian ini, dan/atau kekacauan sosial yang merintangi
          dan menghalangi salah satu dari PARA PIHAK untuk menjalankan kewajiban
          dalam Perjanjian ini.
        </li>
        <li>
          Bahwa Pihak yang mengalami Keadaan Kahar (<em>Force Majeure</em>) wajib
          memberitahukan kepada Pihak lainnya secara lisan selambat-lambatnya
          48 (empat puluh delapan) jam dan diikuti dengan pemberitahuan secara
          tertulis selambat-lambatnya dalam waktu 7 (tujuh) hari kalender setelah
          terjadinya Keadaan Kahar (<em>Force Majeure</em>) tersebut, disertai
          dengan bukti keterangan resmi dari instansi pemerintah yang berwenang
          atau bukti lainnya yang dapat dipertanggungjawabkan dan perkiraan atau
          upaya-upaya yang akan atau telah dilakukan dalam rangka mengatasi
          Keadaan Kahar (<em>Force Majeure</em>) tersebut.
        </li>
        <li>
          Bahwa Pihak yang mengalami Keadaan Kahar (<em>Force Majeure</em>) dan
          tidak melaksanakan ketentuan sebagaimana dimaksud pada Ayat 2 (dua)
          Pasal ini menyebabkan peristiwa yang dialami tersebut tidak termasuk
          dalam kategori Keadaan Kahar (<em>Force Majeure</em>).
        </li>
        <li>
          Bahwa Pihak yang menerima pemberitahuan Keadaan Kahar (
          <em>Force Majeure</em>) dapat menolak atau menyetujui Keadaan Kahar (
          <em>Force Majeure</em>) yang dialami Pihak lainnya selambat-lambatnya
          dalam waktu 7 (tujuh) hari kalender setelah diterimanya pemberitahuan
          tertulis sebagaimana dimaksud di dalam Ayat 2 (dua) Pasal ini.
        </li>
        <li>
          Bahwa selama Keadaan Kahar (<em>Force Majeure</em>) berlangsung,
          kewajiban pihak yang terdampak dapat ditunda sementara tanpa dikenakan
          sanksi atau dianggap sebagai wanprestasi.
        </li>
        <li>
          Bahwa PARA PIHAK sepakat, apabila terjadi Keadaan Kahar (
          <em>Force Majeure</em>) berlangsung lebih dari 30 (tiga puluh) hari
          kalender sehingga mengakibatkan salah satu Pihak tidak dapat memenuhi
          kewajiban yang tertuang dalam Perjanjian ini, maka PARA PIHAK sepakat
          untuk melakukan musyawarah untuk membicarakan kembali tindak lanjut
          dalam Perjanjian ini.
        </li>
        <li>
          Bahwa setelah berakhirnya Keadaan Kahar (<em>Force Majeure</em>), PARA
          PIHAK sepakat untuk melakukan musyawarah guna menentukan kelanjutan
          pelaksanaan Perjanjian ini.
        </li>
      </ol>
    </div>,

    /* 11. PASAL 8: KERAHASIAAN */
    <div key="b-pasal-8" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 8</p>
        <p className="uppercase">KERAHASIAAN</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PARA PIHAK sepakat untuk menjaga kerahasiaan seluruh informasi, data,
          dan dokumen yang diperoleh sehubungan dengan pelaksanaan Perjanjian
          ini dan tidak akan mengungkapkannya kepada pihak ketiga tanpa
          persetujuan tertulis dari Pihak lainnya, kecuali diwajibkan oleh
          peraturan perundang-undangan atau perintah instansi yang berwenang.
        </li>
        <li>
          PIHAK PERTAMA dilarang menghubungi atau bekerja sama secara langsung
          dengan content creator yang digunakan dalam Campaign ini tanpa
          sepengetahuan dan persetujuan PIHAK KEDUA, baik selama masa berlaku
          Perjanjian maupun dalam jangka waktu {legal.nonCircumventionMonths} (tiga)
          bulan setelah Perjanjian berakhir.
        </li>
        <li>
          Kewajiban kerahasiaan sebagaimana dimaksud pada Pasal ini tetap berlaku
          meskipun Perjanjian ini telah berakhir.
        </li>
      </ol>
    </div>,

    /* 12. PASAL 9: PENYELESAIAN PERSELISIHAN */
    <div key="b-pasal-9" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 9</p>
        <p className="uppercase">PENYELESAIAN PERSELISIHAN</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          PARA PIHAK sepakat untuk menyelesaikan segala perselisihan yang mungkin
          timbul akibat dari pelaksanaan Perjanjian ini melalui musyawarah agar
          mencapai mufakat.
        </li>
        <li>
          Jika dalam waktu {legal.disputeDays} (tiga puluh) Hari Kalender sejak
          dimulainya penyelesaian sengketa sebagaimana dimaksud ayat 1 (satu)
          Pasal ini tidak tercapai mufakat, maka PARA PIHAK sepakat untuk
          menyelesaikan perselisihan tersebut melalui{" "}
          <strong>{legal.courtJurisdiction}</strong>.
        </li>
        <li>
          Biaya yang timbul sehubungan dengan pasal ini menjadi beban PARA
          PIHAK.
        </li>
      </ol>
    </div>,

    /* 13. PASAL 10: HAK KEKAYAAN INTELEKTUAL */
    <div key="b-pasal-10" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 10</p>
        <p className="uppercase">HAK KEKAYAAN INTELEKTUAL</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Bahwa Hak cipta atas konten yang diproduksi dalam kampanye ini tetap
          menjadi milik content creator dan PIHAK KEDUA.
        </li>
        <li>
          Apabila PIHAK PERTAMA ingin lisensi non-eksklusif dengan menggunakan
          konten Campaign untuk keperluan promosi dan pemasaran produk PIHAK
          PERTAMA, serta publikasi di media sosial dan platform digital milik
          PIHAK KEDUA, maka PIHAK PERTAMA wajib konfirmasi kepada PIHAK KEDUA
          paling lambat 7 (tujuh) hari kerja dan wajib mendapatkan persetujuan
          secara tertulis dari PIHAK KEDUA.
        </li>
        <li>
          PIHAK PERTAMA tidak diperkenankan tanpa persetujuan tertulis terlebih
          dahulu dari PIHAK KEDUA untuk:
          <ol className="list-[lower-alpha] pl-6 space-y-1 mt-1">
            <li>Mengubah, mengedit atau memodifikasi konten;</li>
            <li>
              Menggunakan konten untuk tujuan komersial di luar ruang lingkup
              promosi produk sebagaimana dimaksud pada ayat 2 (dua) Pasal ini;
            </li>
            <li>
              Menjual, mengalihkan, atau melisensikan konten kepada pihak ketiga.
            </li>
          </ol>
        </li>
      </ol>
    </div>,

    /* 14. PASAL 11: GANTI RUGI */
    <div key="b-pasal-11" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 11</p>
        <p className="uppercase">GANTI RUGI</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Apabila salah satu Pihak melakukan kesalahan, kelalaian, dan/atau
          pelanggaran terhadap ketentuan Perjanjian ini maupun peraturan
          perundang-undangan yang berlaku, yang mengakibatkan timbulnya kerugian
          bagi Pihak lainnya, maka Pihak yang melakukan kesalahan tersebut wajib
          mengganti kerugian yang timbul akibat kesalahan, kelalaian, dan/atau
          pelanggaran dimaksud.
        </li>
        <li>
          Setiap tuntutan dan/atau klaim ganti rugi sebagaimana dimaksud dalam
          Pasal ini wajib diajukan secara tertulis disertai dengan bukti-bukti
          yang sah dan dapat dipertanggungjawabkan mengenai timbulnya kerugian,
          besarnya nilai kerugian, serta hubungan sebab-akibat antara kerugian
          tersebut dengan kesalahan, kelalaian, dan/atau pelanggaran yang
          dilakukan oleh Pihak yang bersangkutan. Pihak yang menerima tuntutan
          dan/atau klaim ganti rugi berhak untuk menolak tuntutan dan/atau klaim
          tersebut apabila tidak disertai bukti yang memadai.
        </li>
        <li>
          Pihak yang mengalami kerugian tidak berhak menuntut ganti rugi kepada
          Pihak lainnya apabila kerugian tersebut timbul akibat kesalahan atau
          kelalaian Pihak yang bersangkutan sendiri.
        </li>
        <li>
          Ketentuan mengenai ganti rugi sebagaimana dimaksud dalam Pasal ini
          berlaku pula terhadap kerugian yang dialami oleh salah satu Pihak
          sebagai akibat dari tuntutan dan/atau klaim pihak ketiga, sepanjang
          tuntutan dan/atau klaim tersebut timbul karena kesalahan, kelalaian
          dan/atau pelanggaran yang dilakukan oleh Pihak lainnya dalam
          pelaksanaan Perjanjian ini.
        </li>
        <li>
          Ketentuan mengenai ganti rugi sebagaimana diatur dalam Pasal ini tetap
          berlaku dan mengikat PARA PIHAK sekalipun Perjanjian ini telah berakhir
          atau diakhiri.
        </li>
      </ol>
    </div>,

    /* 15. PASAL 12: LAIN-LAIN */
    <div key="b-pasal-12" className="space-y-2 text-justify">
      <div className="text-center font-bold">
        <p className="uppercase">PASAL 12</p>
        <p className="uppercase">LAIN-LAIN</p>
      </div>
      <ol className="list-decimal pl-6 space-y-1.5">
        <li>
          Segala penafsiran yang timbul terhadap ketentuan dalam perjanjian ini
          seluruhnya tunduk pada ketentuan hukum yang berlaku di wilayah Republik
          Indonesia.
        </li>
        <li>
          Segala perubahan dan/atau penambahan atas Perjanjian ini hanya sah
          apabila dibuat secara tertulis dan ditandatangani oleh PARA PIHAK dalam
          bentuk addendum yang merupakan satu kesatuan dan bagian yang tidak
          terpisahkan dari Perjanjian ini.
        </li>
        <li>
          Setiap perubahan atau pengaturan lebih lanjut terhadap hal-hal yang
          tidak atau belum diatur dalam perjanjian ini harus disetujui secara
          tertulis oleh PARA PIHAK serta dituangkan dalam bentuk Addendum yang
          merupakan bagian yang tidak terpisahkan dari perjanjian ini.
        </li>
        <li>
          Perjanjian ini secara sah telah menggantikan segala
          persetujuan-persetujuan dan/atau janji-janji lisan lainnya yang telah
          diadakan sebelum perjanjian ini ditandatangani.
        </li>
        <li>
          Ketentuan mengenai kerahasiaan atas seluruh informasi, data, dan
          dokumen yang dipertukarkan PARA PIHAK sehubungan dengan Perjanjian ini
          merujuk sepenuhnya pada Pasal 8 (delapan) Perjanjian ini.
        </li>
        <li>
          Segala ketentuan-ketentuan dan syarat-syarat dalam Perjanjian ini
          berlaku serta mengikat bagi PARA PIHAK yang menandatangani,
          pengganti-penggantinya dan mereka memperoleh keuntungan dari padanya.
        </li>
        <li>
          Perjanjian ini dibuat dalam rangkap 2 (dua), masing-masing bermaterai
          cukup dan mempunyai kekuatan hukum yang sama, di mana masing-masing
          pihak menerima 1 (satu) rangkap asli.
        </li>
      </ol>
    </div>,

    /* 16. Penutup & Tanda Tangan */
    <div key="b-penutup" className="space-y-4 pt-2">
      <p className="text-justify indent-8">
        Demikian Perjanjian ini dibuat dan ditandatangani oleh PARA PIHAK dengan
        penuh kesadaran dan tanpa paksaan dari pihak manapun, untuk dilaksanakan
        dan dipatuhi sebagaimana mestinya.
      </p>

      {/* Signature Grid */}
      <div className="pt-4 grid grid-cols-2 gap-8 text-center text-[13.5px]">
        {/* Kolom Pihak Pertama */}
        <div className="flex flex-col items-center">
          <p className="font-bold uppercase tracking-wide">PIHAK PERTAMA</p>
          <p className="font-bold uppercase mt-0.5">
            {client.name}
          </p>
          <div className="h-28 flex items-center justify-center">
            <span className="text-[11px] text-slate-400 border border-dashed border-slate-300 rounded px-3 py-1.5">
              Materai Rp 10.000 & Tanda Tangan
            </span>
          </div>
          <p className="font-bold uppercase underline underline-offset-2">
            {client.signeeName}
          </p>
          <p className="text-[12.5px] uppercase mt-0.5 text-slate-700">
            {client.signeePosition}
          </p>
        </div>

        {/* Kolom Pihak Kedua */}
        <div className="flex flex-col items-center">
          <p className="font-bold uppercase tracking-wide">PIHAK KEDUA</p>
          <p className="font-bold uppercase mt-0.5">
            {agency.companyLegalName}
          </p>
          <div className="h-28 flex items-center justify-center">
            <span className="text-[11px] text-slate-400 border border-dashed border-slate-300 rounded px-3 py-1.5">
              Tanda Tangan & Cap
            </span>
          </div>
          <p className="font-bold uppercase underline underline-offset-2">
            {agency.signeeName}
          </p>
          <p className="text-[12.5px] uppercase mt-0.5 text-slate-700">
            {agency.signeePosition}
          </p>
        </div>
      </div>
    </div>,
  ];

  return <DynamicPksPaginator blocks={blocks} maxPageHeightPx={870} />;
}
