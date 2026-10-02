/**
 * Sekali jalan: menguji bahwa `verify-no-stub.ts` benar-benar GAGAL
 * kalau ALLOWLIST diisi.
 *
 * Guard yang tidak pernah gagal sama dengan tidak ada guard. Skrip ini
 * adalah skrip yang menguji guard-nya.
 *
 * Dipakai file Node, bukan `node -e`, karena PowerShell selalu merusak
 * escaping-nya (AGENTS.md §2.3).
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";

const p = "scripts/verify-no-stub.ts";
const bak = p + ".uji-bak";
const asli = readFileSync(p, "utf8");

let gagal = 0;
let lulus = 0;
function check(label, cond, detail = "") {
  if (cond) {
    lulus++;
    console.log(`  PASS  ${label}`);
  } else {
    gagal++;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

/**
 * Jalankan guard; balik kode keluar + seluruh output (stdout + stderr).
 *
 * `tsx` dipanggil lewat `node <path>/cli.mjs`, bukan `npx tsx`:
 * `spawnSync` tanpa `shell: true` tidak bisa menjalankan `.cmd` di
 * Windows, dan hasilnya kode 1 tanpa output sama sekali -- yang
 * terlihat seperti guard-nya gagal, bukan seperti masalah pemanggilan.
 */
function jalankan() {
  const r = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", p],
    { encoding: "utf8" },
  );
  return {
    kode: r.status ?? 1,
    out: `${r.stdout ?? ""}\n${r.stderr ?? ""}`,
  };
}

const target = "src/app/__uji_stub__.tsx";

try {
  console.log("\n=== 1. Keadaan normal: harus PASS ===");
  copyFileSync(p, bak);
  const normal = jalankan();
  check(`kode 0 (dapat ${normal.kode})`, normal.kode === 0, normal.out.trim());
  check("allowlist kosong", normal.out.includes("0 di allowlist"));

  console.log("\n=== 2. ALLOWLIST diisi: harus GAGAL ===");
  writeFileSync(
    p,
    asli.replace(
      "const ALLOWLIST: string[] = [];",
      'const ALLOWLIST: string[] = ["app/dummy/page.tsx"];',
    ),
    "utf8",
  );
  const diisi = jalankan();
  check(`kode bukan 0 (dapat ${diisi.kode})`, diisi.kode !== 0, diisi.out.trim());
  check("menyebut ALLOWLIST", diisi.out.includes("ALLOWLIST tidak kosong"));
  check(
    "menyarankan allowlist harus menyusut",
    diisi.out.includes("harus menyusut"),
  );

  console.log("\n=== 3. File baru memakai stub: harus GAGAL ===");
  writeFileSync(p, asli, "utf8");
  writeFileSync(
    target,
    'import { createClient } from "@/lib/supabase/client";\n' +
      "export default function X() { return createClient(); }\n",
    "utf8",
  );
  const offender = jalankan();
  check(`kode bukan 0 (dapat ${offender.kode})`, offender.kode !== 0, offender.out.trim());
  check("menyebut nama file", offender.out.includes("__uji_stub__"));
  check("menyarankan Route Handler", offender.out.includes("Route Handler"));

  console.log("\n=== 4. Setelah semuanya dibersihkan: PASS lagi ===");
  unlinkSync(target);
  const akhir = jalankan();
  check(`kode 0 (dapat ${akhir.kode})`, akhir.kode === 0, akhir.out.trim());
  check("file uji benar-benar hilang", !existsSync(target));
} finally {
  copyFileSync(bak, p);
  unlinkSync(bak);
  if (existsSync(target)) unlinkSync(target);
}

console.log(`\n=== ${lulus} pass, ${gagal} fail ===`);
process.exit(gagal > 0 ? 1 : 0);