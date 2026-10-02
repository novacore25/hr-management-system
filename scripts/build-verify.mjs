/**
 * Build produksi ke folder TERPISA dari `.next`.
 *
 * Kenapa tidak `npm run build` langsung?
 *
 * `next dev` dan `next build` memakai folder output yang sama kalau
 * `distDir` tidak diubah. Kalau build dijalankan saat dev server masih
 * hidup, build menimpa chunk yang sedang dipakai dev server. Gejalanya
 * jauh dari build — semuanya terlihat seperti bug aplikasi:
 *
 *   - `/_next/static/css/app/layout.css` dilayani sebagai `text/plain`
 *     → "Refused to apply style ... MIME type ('text/plain')"
 *   - Route Handler membalas 500 padahal tidak ada kode yang berubah
 *   - overlay Next.js menampilkan "Runtime Error [object Event]"
 *   - `tsc` bersih, log server bersih, tidak ada satu pun jejak bahwa
 *     penyebabnya build yang menabrak dev server
 *
 * Jadi `NEXT_DIST_DIR` disetel di sini, dan `next.config.ts` membacanya.
 * Docker build tidak menyetel env ini, jadi `.next` tetap seperti biasa.
 */

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const DIST_DIR = ".next-verify";

/** Bersihkan sisa build sebelumnya supaya tidak tertukar dengan yang lama. */
rmSync(DIST_DIR, { recursive: true, force: true });

const build = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_DIST_DIR: DIST_DIR },
});

if (build.status !== 0) {
  console.error("");
  console.error(`GAGAL: next build keluar dengan kode ${build.status}.`);
  process.exit(build.status ?? 1);
}

// Teruskan ke penjaga middleware, yang membaca folder yang sama.
const check = spawnSync("npx", ["tsx", "scripts/verify-build.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, NEXT_DIST_DIR: DIST_DIR },
});

process.exit(check.status ?? 1);