/**
 * Guard: pastikan middleware benar-benar ter-build.
 *
 * Kenapa perlu ada file ini?
 *
 * `next build` TIDAK pernah gagal kalau middleware tidak ter-detect.
 * Dia hanya menulis `middleware: {}` ke `middleware-manifest.json`,
 * lalu build tetap hijau. Akibatnya route protection di level halaman
 * hilang tanpa satu baris pun di log.
 *
 * Dua penyebab yang sudah pernah kejadian di repo ini:
 *
 *   1. File-nya di root (`middleware.ts`). Project ini memakai
 *      direktori `src/`, jadi Next.js mencarinya di `src/middleware.ts`.
 *      File di root diabaikan tanpa peringatan.
 *
 *   2. Middlechainya meng-import modul yang menyentuh database.
 *      `middleware.ts -> src/server/auth.ts -> src/db/index.ts ->
 *      import "server-only"`. Middleware adalah edge bundle; menarik
 *      `server-only` membuatnya gagal dibuild, dan lagi-lagi Next.js
 *      tidak melaporkannya.
 *
 * Jalankan setelah `npm run build`:
 *   npm run verify:build
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Sama dengan yang dipakai `scripts/build-verify.mjs`. Kalau folder ini
// diubah di sana, ubah juga di sini — kalau tidak, build dan pemeriksa
// akan membaca folder yang berbeda, dan penjaga selalu lolos tanpa
// memeriksa apa pun.
const DIST_DIR = process.env.NEXT_DIST_DIR || ".next";

const manifestPath = resolve(DIST_DIR, "server", "middleware-manifest.json");

let manifest: { middleware?: Record<string, unknown> };

try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  console.error(`GAGAL: ${manifestPath} tidak terbaca.`);
  console.error("      Jalankan `npm run build` dulu.");
  process.exit(1);
}

const registered = Object.keys(manifest.middleware ?? {});

if (registered.length === 0) {
  console.error("GAGAL: middleware tidak ter-build (manifest kosong).");
  console.error("");
  console.error("Kemungkinan penyebab:");
  console.error(
    "  1. File middleware.ts salah lokasi. Karena project memakai",
  );
  console.error(
    "     direktori src/, file HARUS di src/middleware.ts, bukan root.",
  );
  console.error(
    "  2. Import middleware menarik modul server-only.",
  );
  console.error(
    "     Middleware = edge bundle. Pastikan middleware hanya meng-import",
  );
  console.error("     dari @/server/auth-config, bukan @/server/auth atau @/db.");
  console.error("");
  console.error("Dampak: tidak ada lagi yang mengarahkan pengunjung yang");
  console.error("belum login ke /login. Route Handler tetap 401 (DAL), tapi");
  console.error("halaman dilayani apa adanya sehingga visitor melihat shell");
  console.error("kosong.");
  process.exit(1);
}

console.log(`PASS: middleware ter-build -> ${registered.join(", ")}`);