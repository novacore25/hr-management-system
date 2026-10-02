/**
 * Jalankan file .sql ke database uji lokal.
 *
 * Dipakai karena `psql` tidak ada di PATH Windows -- path-nya
 * hardcode di sini, dan variabel DATABASE_URL diambil dari
 * .env.local tanpa pernah dicetak.
 *
 * Cara pakai:
 *   node scripts/run-sql.mjs drizzle/0014_supabase_parity.sql
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PSQL = "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";
const file = process.argv[2];
if (!file) {
  console.error("Cara pakai: node scripts/run-sql.mjs <file.sql>");
  process.exit(1);
}

const env = readFileSync(".env.local", "utf8");
const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
if (!m) {
  console.error("DATABASE_URL tidak ditemukan di .env.local");
  process.exit(1);
}
const url = new URL(m[1].trim());

// Password lewat environment PGPASSWORD, bukan argumen -- supaya
// tidak muncul di daftar proses.
const args = [
  "-h", url.hostname,
  "-p", url.port || "5432",
  "-U", url.username,
  "-d", url.pathname.replace(/^\//, ""),
  "-v", "ON_ERROR_STOP=1",
  "-f", file,
];

try {
  const out = execFileSync(PSQL, args, {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
    maxBuffer: 32 * 1024 * 1024,
  });
  console.log(out);
  console.log("=== OK ===");
} catch (e) {
  console.error(e.stdout ?? "");
  console.error(e.stderr ?? "");
  console.error("=== GAGAL (kode " + e.status + ") ===");
  process.exit(1);
}