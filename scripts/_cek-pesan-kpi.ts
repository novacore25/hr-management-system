/**
 * Pembungkus tipis untuk menguji `pesanKpiReadonly` dari skrip verify.
 *
 * Dipisah supaya skrip verifikasi memanggil fungsi yang benar-benar
 * dipakai aplikasi. Menyalin logikanya ke dalam skrip test akan
 * menguji salinan, bukan produknya -- dan test pun hijau sementara
 * aplikasinya salah.
 *
 * Argumen: <type|"null"|"undefined"> <description|"undefined"> <Head|HR>
 * Keluaran: pesan, atau literal "NULL" kalau null.
 */
import { pesanKpiReadonly } from "../src/lib/utils";

const [type, deskripsi, penilai] = process.argv.slice(2);

const kpi =
  type === "null"
    ? null
    : type === "undefined"
      ? undefined
      : {
          type,
          description: deskripsi === "undefined" ? undefined : deskripsi,
        };

const hasil = pesanKpiReadonly(kpi, penilai as "Head" | "HR");
process.stdout.write(hasil === null ? "NULL" : hasil);