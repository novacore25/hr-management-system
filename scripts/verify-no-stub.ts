/**
 * Guard: tidak boleh ada kode baru yang memakai stub Supabase.
 *
 * Kenapa ini perlu ada?
 *
 * `src/lib/supabase/client.ts` adalah stub yang SELALU membalas
 * `error: null` dan `data: []`. Kombinasi itu berbahaya karena:
 *
 *   const { error } = await supabase.from("attendance").insert({...});
 *   if (error) { /* tampilkan error *\/ }
 *   return { success: true };   // <-- selalu tercapai
 *
 * Widget check-in pernah persis begini: user diberi tahu "Berhasil
 * Check-In" sementara tidak ada satu baris pun yang tersimpan. Tidak ada
 * error, tidak ada crash, `tsc` bersih, build hijau. Yang memberitahu
 * hanya orang yang benar-benar mencoba check-in lalu membuka dashboard
 * admin.
 *
 * File ini gagal kalau ada file baru (di luar daftar putih) yang masih
 * meng-import stub.
 *
 * Jalankan: npm run verify:stub
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = "src";
const STUB_IMPORT = /from\s+["'][^"']*lib\/supabase\/(client|server)["']/;

/**
 * Daftar putih import stub — SUDAH KOSONG.
 *
 * Migrasi dari Supabase selesai: tidak ada satu pun file di `src/` lagi
 * yang meng-import `lib/supabase/client`. Daftar ini sengaja dibiarkan
 * ada (dan dijaga kosong) supaya:
 *
 *   1. Kalau nanti ada yang menambahkannya, itu terlihat di diff --
 *      dan diff itu adalah keputusan, bukan hal yang terjadi diam-diam.
 *   2. Tidak ada kode yang perlu dihapus sebelum migrate berikutnya.
 *
 * allowlist ini pernah berisi 14 file. Kalau Anda melihat isinya tidak
 * kosong: jangan langsung menambah. Tanya dulu apakah file itu bisa
 * lewat Route Handler -- stub membalas `error: null`, jadi UI bisa
 * menampilkan "Berhasil" tanpa menyimpan apa pun.
 */
const ALLOWLIST: string[] = [];

/** Stub itu sendiri tidak dihitung. */
const SELF = [
  "lib/supabase/client.ts",
  "lib/supabase/server.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const allow = new Set(ALLOWLIST.map((p) => p.split("/").join(sep)));
const self = new Set(SELF.map((p) => p.split("/").join(sep)));

const offenders: string[] = [];
let allowedCount = 0;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);

  if (self.has(rel)) continue;

  const src = readFileSync(file, "utf8");
  if (!STUB_IMPORT.test(src)) continue;

  if (allow.has(rel)) {
    allowedCount++;
  } else {
    offenders.push(rel);
  }
}

if (offenders.length > 0) {
  console.error("GAGAL: file berikut memakai stub Supabase:");
  for (const f of offenders) console.error("  - " + f);
  console.error("");
  console.error(
    "Migrasi sudah selesai -- tidak ada allowlist yang tersisa. Pindahkan",
  );
  console.error(
    "file ini ke Route Handler. Jangan mengandalkan stub: dia membalas",
  );
  console.error(
    "`error: null`, jadi UI bisa menampilkan 'Berhasil' tanpa menyimpan.",
  );
  process.exit(1);
}

/**
 * Allowlist yang tidak kosong selalu gagal, walau file yang terdaftar
 * sudah tidak memakai stub.
 *
 * Alasannya: allowlist adalah daftar file yang *masih* perlu dipindah.
 * Kalau sudah kosong, migrasi selesai dan daftarnya harus dihapus --
 * supaya tidak ada yang mengira masih ada pekerjaan tertunda. Kalau
 * allowlist boleh tumbuh diam-diam, dia akan tumbuh.
 */
if (ALLOWLIST.length > 0) {
  console.error("GAGAL: ALLOWLIST tidak kosong.");
  console.error("");
  for (const f of ALLOWLIST) console.error("  - " + f);
  console.error("");
  console.error(
    "Kalau file-file ini sudah tidak memakai stub, HAPUS dari daftar.",
  );
  console.error("Allowlist harus menyusut, tidak pernah tumbuh.");
  process.exit(1);
}

console.log(
  `PASS: tidak ada import stub di src/ sama sekali (${allowedCount} di allowlist).`,
);