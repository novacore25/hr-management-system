/**
 * Konversi angka ke kalimat terbilang Bahasa Indonesia.
 */
const SATUAN = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

export function terbilang(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "nol";
  if (n < 12) return SATUAN[n];
  if (n < 20) return (terbilang(n - 10) + " belas").trim();
  if (n < 100)
    return (terbilang(Math.floor(n / 10)) + " puluh " + SATUAN[n % 10]).trim();
  if (n < 200) return ("seratus " + terbilang(n - 100)).trim();
  if (n < 1000)
    return (
      SATUAN[Math.floor(n / 100)] +
      " ratus " +
      terbilang(n % 100)
    ).trim();
  if (n < 2000) return ("seribu " + terbilang(n - 1000)).trim();
  if (n < 1_000_000)
    return (
      terbilang(Math.floor(n / 1000)) +
      " ribu " +
      terbilang(n % 1000)
    ).trim();
  if (n < 1_000_000_000)
    return (
      terbilang(Math.floor(n / 1_000_000)) +
      " juta " +
      terbilang(n % 1_000_000)
    ).trim();
  if (n < 1_000_000_000_000)
    return (
      terbilang(Math.floor(n / 1_000_000_000)) +
      " miliar " +
      terbilang(n % 1_000_000_000)
    ).trim();

  return (
    terbilang(Math.floor(n / 1_000_000_000_000)) +
    " triliun " +
    terbilang(n % 1_000_000_000_000)
  ).trim();
}

/**
 * Format angka ke terbilang rupiah resmi.
 * Contoh: 4500000 -> "empat juta lima ratus ribu rupiah"
 */
export function terbilangRupiah(n: number): string {
  const clean = terbilang(n).replace(/\s+/g, " ").trim();
  return `${clean} rupiah`;
}

/**
 * Format angka ke format mata uang Rupiah standar.
 * Contoh: 4500000 -> "Rp4.500.000"
 */
export function formatRupiah(n: number): string {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`;
}

const NAMA_HARI = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * Format tanggal legal untuk pembuka perjanjian:
 * Contoh: "2026-10-09" -> "Jumat tanggal 09 Oktober 2026"
 */
export function formatTanggalLegal(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const hari = NAMA_HARI[d.getDay()];
  const tgl = String(d.getDate()).padStart(2, "0");
  const bulan = NAMA_BULAN[d.getMonth()];
  const tahun = d.getFullYear();

  return `${hari} tanggal ${tgl} ${bulan} ${tahun}`;
}

/**
 * Format tanggal standar Indonesia:
 * Contoh: "2026-10-09" -> "09 Oktober 2026"
 */
export function formatTanggalId(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const tgl = String(d.getDate()).padStart(2, "0");
  const bulan = NAMA_BULAN[d.getMonth()];
  const tahun = d.getFullYear();

  return `${tgl} ${bulan} ${tahun}`;
}
