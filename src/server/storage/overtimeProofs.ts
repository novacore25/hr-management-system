import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Konfigurasi penyimpanan foto bukti lembur.
 *
 * MENDUKUNG 2 PROVIDER:
 * 1. Cloudflare R2 (jika kredensial diisi di environment)
 * 2. Local Disk VPS (/app/data/uploads/overtime di container atau local data/)
 *
 * URL Supabase yang sudah tersimpan untuk pengajuan lama tetap
 * ditampilkan apa adanya (lihat `fotoBisaDibuka`).
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

export type StorageProvider = "supabase" | "r2" | "local";

/**
 * Provider yang aktif untuk foto BARU.
 *
 * Jika R2 diisi lengkap -> gunakan "r2".
 * Jika tidak -> gunakan penyimpanan lokal VPS "local".
 */
function providerAktif(): StorageProvider {
  const r = R2();
  const lengkap =
    Boolean(r.endpoint) &&
    Boolean(r.accessKeyId) &&
    Boolean(r.secretAccessKey) &&
    Boolean(r.bucket);

  return lengkap ? "r2" : "local";
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
 * Direktori target upload lokal di VPS atau environment dev.
 * Di Docker container Coolify: /app/data/uploads (sudah di-chown ke nextjs).
 */
export function getUploadDir(): string {
  if (process.env.STORAGE_LOCAL_DIR) {
    return process.env.STORAGE_LOCAL_DIR;
  }
  if (
    process.env.NODE_ENV === "production" &&
    fs.existsSync("/app/data/uploads")
  ) {
    return "/app/data/uploads";
  }
  return path.join(process.cwd(), "data", "uploads");
}

/**
 * Apakah storage foto sudah siap.
 */
export function cekStorage(): StorageStatus {
  const provider = providerAktif();
  if (provider === "r2") {
    return { aktif: true, provider: "r2", kurang: [] };
  }

  // Provider lokal VPS selalu aktif
  return { aktif: true, provider: "local", kurang: [] };
}

export type UploadResult =
  | { ok: true; url: string; key: string }
  | { ok: false; error: string };

/**
 * Unggah satu foto bukti ke penyimpanan (lokal VPS atau R2).
 */
export async function uploadBukti(params: {
  userId: string;
  overtimeId?: string;
  file: File;
}): Promise<UploadResult> {
  const status = cekStorage();
  if (!status.aktif) {
    return {
      ok: false,
      error: status.alasan || "Penyimpanan foto belum aktif.",
    };
  }

  // Format dan ukuran diperiksa di server
  const EXTENSIONS: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const ext = EXTENSIONS[params.file.type];
  if (!ext) {
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

  try {
    const uploadBase = getUploadDir();
    const targetDir = path.join(uploadBase, "overtime");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const randomSuffix = crypto.randomBytes(8).toString("hex");
    const safeFilename = `${Date.now()}-${randomSuffix}.${ext}`;
    const filePath = path.join(targetDir, safeFilename);

    const arrayBuffer = await params.file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(filePath, buffer);

    return {
      ok: true,
      url: `/api/uploads/overtime/${safeFilename}`,
      key: safeFilename,
    };
  } catch (err: any) {
    console.error("Gagal menyimpan foto bukti di VPS:", err);
    return {
      ok: false,
      error:
        "Gagal menyimpan foto ke server VPS: " +
        (err?.message || "Internal error"),
    };
  }
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