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
 * Satu-satunya import stub yang masih diizinkan.
 *
 * Yang masih diizinkan adalah file yang dijadwalkan pindah di Phase 4c
 * (overtime) dan Phase 5 (payroll), plus halaman /dashboard/** yang
 * migrasinya belum dikerjakan. Hapus dari daftar ini seiring file
 * dipindahkan - jangan pernah menambahkan.
 */
const ALLOWLIST = [
  "app/absensi/admin/approvals/page.tsx",
  "app/absensi/admin/overtime/page.tsx",
  "app/absensi/admin/payroll/page.tsx",
  "app/absensi/admin/payroll/settings/page.tsx",
  "app/absensi/(staff)/payroll/page.tsx",
  "components/absensi/OvertimeFinalizeModal.tsx",
  "components/absensi/OvertimeStaffSection.tsx",
  "app/dashboard/developer/feedbacks/page.tsx",
  "app/dashboard/developer/import/page.tsx",
  "app/dashboard/head/kpi-setup/page.tsx",
  "app/dashboard/hr/employees/page.tsx",
  "app/dashboard/hr/kpi/page.tsx",
  
  "app/dashboard/tim/history/page.tsx",
  "components/FeedbackModal.tsx",
  "components/hr/KpiFormPage.tsx",
  "components/kpi/DailyActivityFeed.tsx",
  "components/kpi/DailyInputForm.tsx",
  "components/kpi/DailyReportsViewer.tsx",
];

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
  console.error("GAGAL: file berikut memakai stub Supabase tanpa izin:");
  for (const f of offenders) console.error("  - " + f);
  console.error("");
  console.error("Sudah selesai? Tambahkan ALLOWLIST di scripts/verify-no-stub.ts");
  console.error(
    "Belum? Pindahkan ke Route Handler. Janganandalkan stub: dia membalas",
  );
  console.error("`error: null`, jadi UI bisa menampilkan 'Berhasil' tanpa menyimpan.");
  process.exit(1);
}

console.log(
  `PASS: tidak ada import stub di luar allowlist (${allowedCount} file masih di allowlist).`,
);