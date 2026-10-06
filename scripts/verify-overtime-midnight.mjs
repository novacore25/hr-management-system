/**
 * Verifikasi lembur tengah malam + penghapusan plafon durasi.
 *
 * Fokus: dua hal yang DIBUKTIKAN salah oleh data produksi.
 *
 * 1. **Regresi midnight.** Di produksi ada pengajuan 2026-09-23
 *    19:35 -> 00:30 dengan durasi tersimpan 295 menit (4 jam 55 menit),
 *    sudah disapprove HR (00:35, 300 menit), sudah dibayar 219650.
 *    formerly `calcDurationMinutes` memakai `Math.max(0, end - start)`,
 *    jadi kasus itu menghasilkan 0 dan pengajuannya ditolak "Jam selesai
 *    harus setelah jam mulai". Sistem tidak bisa mereproduksi datanya
 *    sendiri.
 *
 * 2. **Plafon 4 jam sudah melanggar datanya sendiri.** Dua dari empat
 *    pengajuan produksi (295 dan 308 menit) melewati plafon itu, tetap
 *    disetujui, tetap dibayar. Plafon hanya ditegakkan saat pengajuan
 *    dibuat, bukan saat approval -- jadi bukan batas, cuma hambatan di
 *    satu jalur.
 *
 * Jalankan: node scripts/verify-overtime-midnight.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:3100";
const PSQL = "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";

function psql(sql) {
  return execFileSync(
    PSQL,
    ["-h", "127.0.0.1", "-U", "hrtest", "-d", "hr_local_test", "-t", "-A", "-F", "|", "-c", sql],
    { env: { ...process.env, PGPASSWORD: "hrtest_local_only" }, encoding: "utf8" },
  ).trim();
}

function token(userId) {
  return execFileSync("node", ["scripts/local-dev-session.mjs", userId], {
    encoding: "utf8",
  })
    .trim()
    .split(/\s+/)
    .pop();
}

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function section(t) {
  console.log(`\n=== ${t} ===`);
}

function payload(res) {
  return res.envelope?.data ?? res.envelope ?? {};
}

const TOK = {};
for (const u of ["u-staff-001", "u-hr-001", "u-exec-001"]) {
  TOK[u] = token(u);
}

async function api(userId, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      cookie: `authjs.session-token=${TOK[userId]}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    envelope = { raw: text.slice(0, 160) };
  }
  return { status: res.status, envelope };
}

// ═══════════════════════════════════════════════════════════════
section("1. calcDurationMinutes unit test");
// ═══════════════════════════════════════════════════════════════
//
// Dijalankan langsung lewat npx tsx supaya menguji FUNGSINYA, bukan
// efeknya lewat HTTP. Kalau hanya uji lewat HTTP, kasus 00:00 - 00:00
// akan tercampur dengan penolakan lain di route.

const dir = mkdtempSync(join(tmpdir(), "ot-"));
const probe = join(dir, "probe.ts");
writeFileSync(
  probe,
  `import { calcDurationMinutes, crossesMidnight } from ` +
    `${JSON.stringify(process.cwd().replace(/\\/g, "/") + "/src/lib/overtimeHelpers")};\n` +
    `const kasus: Array<[string, string, number]> = [\n` +
    `  ["18:30", "22:00", 210],\n` +
    `  ["19:35", "00:30", 295],\n` +
    `  ["23:00", "01:00", 120],\n` +
    `  ["18:00", "23:08", 308],\n` +
    `  ["09:00", "17:00", 480],\n` +
    `  ["08:00", "08:00", 0],\n` +
    `];\n` +
    `for (const [a, b, mau] of kasus) {\n` +
    `  const dapat = calcDurationMinutes(a, b);\n` +
    `  console.log([a, b, mau, dapat, mau === dapat ? "OK" : "SALAH"].join("|"));\n` +
    `}\n` +
    `console.log("midnight|" + crossesMidnight("19:35", "00:30") + "|" + crossesMidnight("18:30", "22:00"));\n`,
  { encoding: "utf8" },
);

const out = execFileSync(
  "node",
  ["node_modules/tsx/dist/cli.mjs", probe],
  { encoding: "utf8" },
)
  .trim()
  .split("\n");

// Pemisah baris harus "|", BUKAN karakter baris baru.
//
// formerly `output.trim().split("\n")` -- tapi baris yang di-print
// terakhir tidak selalu diakhiri newline, jadi `.trim()` bisa membuat
// dua baris menyatu. Lebih aman: pecah per newline DAN per "|".
//
// Untuk baris midnight, formatnya: midnight|<hasil>|<hasil>
for (const raw of out.join("\n").split("\n")) {
  const line = raw.trim();
  if (!line) continue;

  if (line.startsWith("midnight|")) {
    const p = line.split("|");
    check("crossesMidnight(19:35->00:30) = true", p[1] === "true", `dapat ${p[1]}`);
    check("crossesMidnight(18:30->22:00) = false", p[2] === "false", `dapat ${p[2]}`);
    continue;
  }

  // Baris kasus: mulai|selesai| hopes|dapat|OK/SALAH
  const p = line.split("|");
  if (p.length === 5) {
    check(`calcDurationMinutes(${p[0]} -> ${p[1]}) = ${p[2]}`, p[4] === "OK",
      `dapat ${p[3]}, harus ${p[2]}`);
  }
}

// ═══════════════════════════════════════════════════════════════
section("2. Pengajuan midnight lewat HTTP");
// ═══════════════════════════════════════════════════════════════
//
// Endpointnya `/api/overtime`, BUKAN `/api/absensi/overtime`.
//
// formerly test ini memakai /api/absensi/overtime dan PATCH ke
// /api/absensi/overtime/<id>. Tidak ada route seperti itu -- satu-
// satunya route lembur adalah /api/overtime, dan aksi (approve, report,
// finalize) dikirim lewat body di PATCH yang sama, bukan lewat URL
// terpisah. Hasilnya 404 dengan halaman HTML, yang kalau tidak
// diperiksa terlihat seperti bug server.

function hariKerja(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bersihkanOvertime() {
  psql(`DELETE FROM overtime_requests WHERE staff_notes = 'uji midnight';`);
}

function rowOvertime(id) {
  return psql(
    `SELECT requested_duration_minutes || '|' || coalesce(approved_duration_minutes,-1)
            || '|' || coalesce(actual_duration_minutes,-1) || '|' || coalesce(final_duration_minutes,-1)
            || '|' || status
       FROM overtime_requests WHERE id='${id}';`,
  );
}

async function ajukan(tanggal, mulai, selesai, tugas = [{ name: "Uji midnight" }]) {
  bersihkanOvertime();
  return api("u-staff-001", "/api/overtime", {
    method: "POST",
    body: JSON.stringify({
      overtimeDate: tanggal,
      startTime: mulai,
      endTime: selesai,
      tasks: tugas,
      staffNotes: "uji midnight",
    }),
  });
}

/** ID dari respons POST, dengan tolerate beberapa nama field. */
function idDari(res) {
  const d = payload(res);
  return d.overtime?.id ?? d.request?.id ?? d.id ?? d.data?.id ?? null;
}

// Kasus yang PERSIS ada di produksi.
const tgl = hariKerja(3);
const mid = await ajukan(tgl, "19:35", "00:30");
check("pengajuan 19:35 -> 00:30 DITERIMA (200)", mid.status === 200,
  `status ${mid.status} -- ${JSON.stringify(mid.envelope).slice(0, 180)}`);
const idMid = idDari(mid);

if (!idMid) {
  console.error("");
  console.error("ABORT: id pengajuan tidak ditemukan di respons.");
  console.error("  " + JSON.stringify(payload(mid)).slice(0, 300));
  process.exit(1);
}

const row = rowOvertime(idMid);
console.log(`  baris: ${row}`);
check("durasi = 295 menit (4 jam 55 menit)", row.split("|")[0] === "295",
  `dapat ${row.split("|")[0]}`);
check("status pending", row.split("|")[4] === "pending", row);

// HR menyetujui dengan jam sedikit berbeda, seperti di data produksi.
const app = await api("u-hr-001", "/api/overtime", {
  method: "PATCH",
  body: JSON.stringify({
    id: idMid,
    action: "approve",
    approvedStartTime: "19:35",
    approvedEndTime: "00:35",
    approvalNotes: "uji",
  }),
});
check("approve midnight DITERIMA", app.status === 200,
  `status ${app.status} -- ${JSON.stringify(app.envelope).slice(0, 180)}`);
const row2 = rowOvertime(idMid);
console.log(`  setelah approve: ${row2}`);
check("durasi approved = 300 menit", row2.split("|")[1] === "300",
  `dapat ${row2.split("|")[1]}`);

// Laporan aktual juga harus bisa midnight.
const rep = await api("u-staff-001", "/api/overtime", {
  method: "PATCH",
  body: JSON.stringify({
    id: idMid,
    action: "report",
    actualStartTime: "19:35",
    actualEndTime: "00:35",
    taskReports: [{ task: "Uji", detail: "ok" }],
  }),
});
check("laporan aktual midnight DITERIMA", rep.status === 200,
  `status ${rep.status} -- ${JSON.stringify(rep.envelope).slice(0, 180)}`);
const row3 = rowOvertime(idMid);
console.log(`  setelah laporan: ${row3}`);
check("durasi aktual = 300 menit", row3.split("|")[2] === "300",
  `dapat ${row3.split("|")[2]}`);
check("status reported", row3.split("|")[4] === "reported", row3);

// ═══════════════════════════════════════════════════════════════
section("3. Plafon durasi sudah dihapus");
// ═══════════════════════════════════════════════════════════════
//
// formerly 4 jam (hari kerja) dan 12 jam (hari libur) ditolak dengan
// "Durasi maksimal lembur". Dua dari empat pengajuan produksi sudah
// melewati 4 jam, jadi batas itu hanya menolak yang sah.

const panjang = await ajukan(hariKerja(4), "09:00", "18:00");
check("lembur 9 jam DITERIMA (dulu ditolak)", panjang.status === 200,
  `status ${panjang.status} -- ${JSON.stringify(panjang.envelope).slice(0, 180)}`);
const idPanjang = idDari(panjang);
if (idPanjang) {
  check("durasi 9 jam = 540 menit", rowOvertime(idPanjang).split("|")[0] === "540",
    rowOvertime(idPanjang));
}

// Kasus produksi yang nyata: 18:00 - 23:08 = 308 menit.
const produksi = await ajukan(hariKerja(5), "18:00", "23:08");
check("18:00 - 23:08 (308 mnt, ada di produksi) DITERIMA", produksi.status === 200,
  `status ${produksi.status}`);
const idProduksi = idDari(produksi);
if (idProduksi) {
  check("durasi = 308 menit", rowOvertime(idProduksi).split("|")[0] === "308",
    rowOvertime(idProduksi));
}

// ═══════════════════════════════════════════════════════════════
section("4. Yang harus tetap ditolak");
// ═══════════════════════════════════════════════════════════════

const sama = await ajukan(hariKerja(6), "08:00", "08:00");
check("mulai = selesai DITOLAK", sama.status === 400, `status ${sama.status}`);

const salah = await api("u-staff-001", "/api/overtime", {
  method: "POST",
  body: JSON.stringify({
    overtimeDate: hariKerja(6),
    startTime: "25:00",
    endTime: "26:00",
    tasks: [{ name: "x" }],
    staffNotes: "uji midnight",
  }),
});
check("jam tidak valid DITOLAK", salah.status === 400, `status ${salah.status}`);

const lampau = await ajukan("2020-01-01", "18:00", "20:00");
check("tanggal lampau DITOLAK", lampau.status === 400, `status ${lampau.status}`);

const tanpaTugas = await api("u-staff-001", "/api/overtime", {
  method: "POST",
  body: JSON.stringify({
    overtimeDate: hariKerja(6),
    startTime: "18:00",
    endTime: "20:00",
    tasks: [],
    staffNotes: "uji midnight",
  }),
});
check("tanpa tugas DITOLAK", tanpaTugas.status === 400, `status ${tanpaTugas.status}`);

// ═══════════════════════════════════════════════════════════════
section("5. Otorisasi");
// ═══════════════════════════════════════════════════════════════

if (idProduksi) {
  const staffApprove = await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id: idProduksi,
      action: "approve",
      approvedStartTime: "18:00",
      approvedEndTime: "23:00",
    }),
  });
  check("staf tidak boleh approve", staffApprove.status === 403,
    `status ${staffApprove.status}`);
}

const tanpaSesi = await fetch(`${BASE}/api/overtime`, { redirect: "manual" });
check("tanpa sesi tidak mendapat 200", tanpaSesi.status !== 200, `status ${tanpaSesi.status}`);

// ═══════════════════════════════════════════════════════════════
section("6. Tidak ada teks plafon di kode");
// ═══════════════════════════════════════════════════════════════

const fs = await import("node:fs");
const bersihkan = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

const dal = bersihkan(fs.readFileSync("src/server/dal/overtime.ts", "utf8"));
check("tidak ada MAX_MINUTES di DAL", !/MAX_MINUTES/.test(dal));
check("tidak ada 'Durasi maksimal' di DAL", !/Durasi maksimal/.test(dal));
check("tidak ada 4 * 60 di DAL", !/4\s*\*\s*60/.test(dal));
check("tidak ada 12 * 60 di DAL", !/12\s*\*\s*60/.test(dal));

const ui = bersihkan(
  fs.readFileSync("src/components/absensi/OvertimeStaffSection.tsx", "utf8"),
);
check("tidak ada maxMinutes di UI", !/maxMinutes/.test(ui));
check("tidak ada 'Durasi maksimal' di UI", !/Durasi maksimal/.test(ui));

const helpers = bersihkan(fs.readFileSync("src/lib/overtimeHelpers.ts", "utf8"));
check("tidak ada Math.max(0, endMins - startMins)",
  !/Math\.max\(0,\s*endMins\s*-\s*startMins\)/.test(helpers));
check("memiliki crossesMidnight", /export function crossesMidnight/.test(helpers));

// ═══════════════════════════════════════════════════════════════
section("7. Kebersihan");
// ═══════════════════════════════════════════════════════════════

bersihkanOvertime();
const sisa = psql(`SELECT count(*) FROM overtime_requests WHERE staff_notes = 'uji midnight';`);
check("fixture overtime dibersihkan", Number(sisa) === 0, `sisa ${sisa}`);
const total = psql(`SELECT count(*) FROM overtime_requests;`);
console.log(`  total pengajuan overtime sekarang: ${total}`);

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);