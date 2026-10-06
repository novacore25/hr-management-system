/**
 * Konfigurasi penyimpanan foto bukti lembur.
 *
 * MIGRASI BERJALAN: storage Cloudflare R2 belum disiapkan. Semua fungsi
 * upload DITOLAK dengan pesan jelas, bukan diam-diam gagal.
 *
 * Kenapa gagal dengan pesan, bukan fallback ke Supabase atau ke disk:
 *
 *   - diam-diam menyimpan di tempat lain berarti bukti kerja staf ada di
 *     sistem yang tidak diaudit, tidak di-backup, dan tidak terlihat.
 *     Itu lebih buruk daripada tidak ada sama sekali.
 *
 * URL Supabase yang sudah tersimpan untuk pengajuan lama tetap
 * ditampilkan apa adanya (lihat `fotoBisaDibuka`). Hosted image di
 * Supabase Storage memang publik, jadi masih bisa dibuka selama
 * bucket-nya belum dihapus -- jadi foto lama TIDAK hilang.
 *
 * AKTIFKAN R2 (nanti):
 *   1. Buat bucket + API token di Cloudflare.
 *   2. Isi R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *      R2_BUCKET, R2_PUBLIC_URL di environment Coolify.
 *   3. Sambungkan `uploadBukti()` ke route upload, lalu isi bagian
 *      unggahnya. Keduanya belum ada -- dan selama belum ada, fungsi
 *      itu dead code yang build buang, bukan penjaga yang bekerja.
 *
 * Tidak ada migrasi database dan tidak ada perubahan kode lain:
 * `cekStorage()` membaca environment setiap dipanggil, jadi status
 * aktif ikut berubah tanpa perlu deploy ulang.
 *
 * Selama belum aktif, `uploadBukti()` selalu menolak, jadi tidak ada
 * jalur yang bisa menulis ke bucket yang salah.
 */

/**
 * Kredensial R2.
 *
 * Dibaca lewat FUNGSI, bukan konstanta di luar fungsi. `process.env`
 * yang dievaluasi saat modul diimpor bisa ikut ter-inline ke bundle
 * saat build -- hasilnya `undefined` terkunci di dalam kode, walaupun
 * environment-nya sudah terisi penuh saat runtime.
 */
function R2() {
  return {
    endpoint: process.env.R2_ENDPOINT,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    /** URL publik untuk dibaca, kalau R2 punya domain sendiri. */
    publicUrl: process.env.R2_PUBLIC_URL,
  };
}

export type StorageProvider = "supabase" | "r2";

/**
 * Provider yang aktif untuk foto BARU.
 *
 * Nilai diambil dari environment, bukan dari kode, supaya mengaktifkan
 * R2 nanti cukup mengubah satu variabel -- tidak perlu deploy kode.
 *
 * Default "supabase" sengaja: kalau R2 belum siap dan ada kode yang
 * terlupa memanggil `cekStorage()`, foto baru akan ditolak dengan
 * pesan jelas, bukan ditulis ke bucket yang salah.
 */
function providerAktif(): StorageProvider {
  const r = R2();
  // R2 dianggap aktif HANYA kalau kredensialnya lengkap. Kalau hanya
  // sebagian, sistem tetap menolak upload dengan pesan yang menyebut
  // mana yang kurang -- bukan diam-diam memakai yang tidak lengkap.
  const lengkap =
    Boolean(r.endpoint) &&
    Boolean(r.accessKeyId) &&
    Boolean(r.secretAccessKey) &&
    Boolean(r.bucket);

  return lengkap ? "r2" : "supabase";
}

export type StorageStatus = {
  aktif: boolean;
  provider: StorageProvider;
  /** Alasan kalau upload ditolak. */
  alasan?: string;
  /** Nama variabel yang belum diisi, untuk ditampilkan ke admin. */
  kurang?: string[];
};

/**
 * Apakah storage foto sudah siap.
 *
 * Dipanggil dari route sebelum menerima upload, supaya orang
 * mendapat pesan yang benar SEBELUM mengunggah file yang pasti
 * ditolak.
 */
export function cekStorage(): StorageStatus {
  const r = R2();
  const kurang: string[] = [];

  if (!r.endpoint) kurang.push("R2_ENDPOINT");
  if (!r.accessKeyId) kurang.push("R2_ACCESS_KEY_ID");
  if (!r.secretAccessKey) kurang.push("R2_SECRET_ACCESS_KEY");
  if (!r.bucket) kurang.push("R2_BUCKET");

  if (kurang.length > 0) {
    return {
      aktif: false,
      provider: providerAktif(),
      kurang,
      alasan:
        "Penyimpanan foto belum disiapkan. Foto bukti yang sudah ada tetap " +
        "bisa dilihat, tapi foto baru belum bisa diunggah. Hubungi admin.",
    };
  }

  return { aktif: true, provider: "r2", kurang: [] };
}

export type UploadResult =
  | { ok: true; url: string; key: string }
  | { ok: false; error: string };

/**
 * Unggah satu foto bukti.
 *
 * ⚠️ BELUM DISAMBUNGKAN. Fungsi ini belum dipanggil dari mana pun,
 * jadi build produksi membuangnya sebagai dead code -- terbukti dengan
 * grep literal string-nya di dalam container: tidak ada.
 *
 * Artinya validasi format dan ukuran di bawah ini **belum pernah
 * dieksekusi sekali pun**. Jangan memperlakukannya sebagai penjaga
 * yang sudah bekerja (AGENTS.md 3.15).
 *
 * Yang benar-benar berjalan sekarang hanya `cekStorage()` -- dipanggil
 * dari `GET /api/overtime`, dan dia yang membuat UI menonaktifkan
 * tombol unggah.
 *
 * Format dan ukuran diperiksa di server, bukan hanya di form, karena
 * `accept="image/*"` di input file bisa dilewati dengan request biasa.
 * Bagian ini baru berarti kalau ada route yang benar-benar memanggilnya.
 */
export async function uploadBukti(params: {
  userId: string;
  overtimeId: string;
  file: File;
}): Promise<UploadResult> {
  const status = cekStorage();
  if (!status.aktif) {
    // `kurang` hanya diisi di cabang gagal. Kalau somehow tidak ada,
    // jangan tampilkan "undefined" ke staf -- buang saja daftarnya.
    const vars = (status.kurang ?? []).join(", ");
    return {
      ok: false,
      error:
        status.alasan +
        (vars ? ` (Variabel yang belum diisi: ${vars})` : ""),
    };
  }

  // Format dan ukuran diperiksa lebih dulu, sebelum storage dihubungi.
  const JENIS = ["image/jpeg", "image/png", "image/webp"];
  if (!JENIS.includes(params.file.type)) {
    return {
      ok: false,
      error: `Format foto harus JPEG, PNG, atau WebP. Yang dikirim: ${params.file.type || "tidak dikenal"}`,
    };
  }

  const MAKS = 5 * 1024 * 1024;
  if (params.file.size > MAKS) {
    return {
      ok: false,
      error: `Ukuran foto maksimal 5 MB. Ukuran yang dikirim: ${(params.file.size / 1024 / 1024).toFixed(1)} MB`,
    };
  }

  // Sengaja belum menulis ke R2.
  //
  // Kalau kredensialnya sudah lengkap tapi kode ini belum diisi,
  // pengembaliannya HARUS gagal -- bukan URL kosong. URL kosong akan
  // tersimpan ke database dan muncul sebagai `<img src="">`, yang
  // terlihat seperti foto rusak tanpa penjelasan apa pun.
  //
  // Langkah berikut: signed URL dengan S3 client, lalu
  // `publicUrl` + key, atau URL bertanda tangan yang berlaku
  // terbatas.
  return {
    ok: false,
    error:
      "Penyimpanan foto sudah dikonfigurasi tetapi belum ada kode yang " +
      "mengunggah. Hubungi admin.",
  };
}

/**
 * Apakah URL foto lama masih bisa dibuka.
 *
 * Pengajuan lama menyimpan URL Supabase Storage. Hosted image di sana
 * memang publik, jadi masih bisa dibuka selama bucket-nya belum
 * dihapus -- dan foto itu TIDAK hilang.
 *
 * `null` berarti tidak ada foto. String kosong berarti URL-nya rusak
 * (ada di data, tapi tidak bisa dibuka) -- dan itu sengaja dibedakan,
 * karena keduanya terlihat sama kalau hanya diperiksa "ada foto?".
 */
export function fotoBisaDibuka(urls: string[] | null | undefined): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.filter((u) => typeof u === "string" && u.trim() !== "");
}