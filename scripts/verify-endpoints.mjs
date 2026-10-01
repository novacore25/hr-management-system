/**
 * Cek SEMUA endpoint /api dengan session ter-forge, supaya perubahan
 * `withAuth` (sekarang Response dari handler diteruskan apa adanya)
 * tidak merusak halaman lain.
 *
 * Jalankan: node scripts/verify-endpoints.mjs
 */
import { execFileSync } from "node:child_process";

const BASE = "http://localhost:3100";

function token(userId) {
  return execFileSync("node", ["scripts/local-dev-session.mjs", userId], {
    encoding: "utf8",
  })
    .trim()
    .split(/\s+/)
    .pop();
}

const TOKENS = {
  hr: token("u-hr-001"),
  exec: token("u-exec-001"),
  head: token("u-head-001"),
  staff: token("u-staff-001"),
};

/** [method, path, role, allowAnyStatus] */
const CASES = [
  // /api/health tidak lewat withAuth — bentuknya `{ status, db, ... }`
  // tanpa amplop `{ ok, data }`, jadi dicek terpisah.
  ["GET", "/api/health", "staff", "raw"],
  ["GET", "/api/me", "staff", true],
  ["GET", "/api/me/profile", "staff", true],
  ["GET", "/api/users", "staff", true],
  // 403 di sini yang BENAR: staf biasa tidak boleh melihat semua user.
  ["GET", "/api/users?scope=all", "staff", 403],
  ["GET", "/api/departments", "staff", true],
  ["GET", "/api/departments?names=1", "staff", true],
  ["GET", "/api/kpis?year=2026&month=10", "hr", true],
  ["GET", "/api/kpi-settings", "hr", true],
  ["GET", "/api/assignments?year=2026&month=10", "hr", true],
  ["GET", "/api/assignments/period?year=2026&month=10", "hr", true],
  ["GET", "/api/daily-reports?year=2026&month=10", "staff", true],
  ["GET", "/api/kpi/quality?scope=all&year=2026&month=10", "hr", true],
  ["GET", "/api/kpi/quality?scope=managed&year=2026&month=10", "head", true],
  ["GET", "/api/absensi/dashboard?year=2026&month=10", "hr", true],
  ["GET", "/api/absensi/summary?year=2026&month=10", "hr", true],
  ["GET", "/api/absensi/staff", "hr", true],
  ["GET", "/api/absensi/settings", "hr", true],
  ["GET", "/api/absensi/logs?year=2026&month=10", "hr", true],
  ["GET", "/api/absensi/leave?year=2026&month=10", "hr", true],
  ["GET", "/api/absensi/attendance?year=2026&month=10", "hr", true],
  ["GET", "/api/absensi/letters?year=2026", "hr", true],
  ["GET", "/api/absensi/locations", "hr", true],
  ["GET", "/api/absensi/team?month=2026-10", "staff", true],
];

let pass = 0;
let fail = 0;

console.log("");
console.log("endpoint                                        role     status  ok");
console.log("----------------------------------------------- -------- ------  ---");

for (const [method, path, role, allow] of CASES) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie: `authjs.session-token=${TOKENS[role]}` },
  });
  const text = await res.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  // `withAuth` sekarang meneruskan Response apa adanya, jadi setiap
  // penolakan harus punya `error` yang terbaca dan status yang sesuai.
  // `allow` = true (status apa pun harus 200) atau nomor status yang
  // diharapkan kalau memang endpoint itu WAJIB menolak role ini.
  const ok =
    allow === "raw"
      ? res.status === 200 && body?.db === "connected"
      : allow === true
        ? res.status === 200 && body?.ok === true && body.data != null && !body.error
        : res.status === allow && body?.ok === false && typeof body.error === "string";

  if (ok) pass++;
  else fail++;

  const note =
    res.status === 200 && body?.ok === true && body.data === undefined
      ? " <- data undefined"
      : body?.error
        ? ` <- ${String(body.error).slice(0, 40)}`
        : "";

  console.log(
    `${(path + (method === "GET" ? "" : " " + method)).padEnd(47)} ${role.padEnd(8)} ${String(res.status).padStart(6)}  ${ok ? "ya" : "TIDAK"}${note}`,
  );
}

console.log("");
console.log(`=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
