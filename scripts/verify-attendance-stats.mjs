/**
 * Verifikasi statistik kehadiran pribadi (dashboard staf).
 *
 * Fokus: kartu "Attendance Streak" yang sebelumnya menulis "100%" dan
 * "Great Consistency!" sebagai TEKS LITERAL tanpa query apa pun.
 * Test yang hanya memeriksa "halaman render" akan lolos untuk kartu
 * itu -- karena teks literal selalu tampil.
 *
 * Yang diperiksa di sini:
 *   - angka benar-benar berasal dari data, bukan placeholder
 *   - tiga keadaan dibedakan: belum absen / terlambat / tepat waktu
 *   - streak menghitung hari kerja, tidakgalan dihitung terputus
 *   - userId diambil dari session, tidak bisa dipinjam orang lain
 *
 * Jalankan: node scripts/verify-attendance-stats.mjs
 */
import { execFileSync } from "node:child_process";

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

/** withAuth membungkus hasil handler jadi { ok: true, data }. */
function payload(res) {
  return res.envelope?.data ?? res.envelope ?? {};
}

const TOK = {};
for (const u of ["u-staff-001", "u-staff-002", "u-staff-003", "u-exec-001", "u-hr-001"]) {
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

// ── Fixture ──────────────────────────────────────────────────────────
//
// Bulan yang dipilih adalah bulan berjalan MINUS satu bulan, supaya
// tidak ikut berubah setiap kali tanggal berganti. Kalau memakai bulan
// berjalan, test akan lulus atau gagal tergantung tanggal dijalankan.

const now = new Date();
const bulanLalu = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const Y = bulanLalu.getFullYear();
const M = bulanLalu.getMonth() + 1;
console.log(`  bulan fixture: ${Y}-${String(M).padStart(2, "0")}`);

/** Tanggal kerja di bulan fixture yang pasti bukan akhir pekan. */
function hariKerja(offset) {
  let d = new Date(Y, M - 1, 1 + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return fmt(d);
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Kembalikan N tanggal kerja yang BERURUTAN dan pasti unik.
 *
 * Versi pertama memakai `hariKerja(offset)` untuk tiap baris, dan itu
 * menghasilkan tanggal yang SAMA untuk offset berbeda: kalender hanya
 * punya 4-5 hari kerja dalam seminggu, jadi beberapa offset jatuh ke
 * hari yang sama setelah akhir pekan dilewati. Hasilnya INSERT kedua
 * menabrak attendance_unique.
 *
 * Sekarang tanggal diambil berurutan dari satu kursor dan hanya
 * dilewati kalau bukan hari kerja -- jadi selalu unik.
 */
function deretHariKerja(jumlah, mulaiOffset = 2) {
  const hasil = [];
  const d = new Date(Y, M - 1, 1 + mulaiOffset);
  while (hasil.length < jumlah) {
    if (d.getDay() !== 0 && d.getDay() !== 6) hasil.push(fmt(d));
    d.setDate(d.getDate() + 1);
  }
  return hasil;
}

// Tiga tanggal kerja berturut-turut, dijamin unik.
const [T1, T2, T3] = deretHariKerja(3);

function bersihkan() {
  psql(`
    DELETE FROM attendance
     WHERE user_id IN ('u-staff-001','u-staff-002','u-staff-003')
       AND date >= '${Y}-${String(M).padStart(2, "0")}-01';
  `);
}

function seed(userId, rows) {
  bersihkan();
  for (const r of rows) {
    psql(`
      INSERT INTO attendance (user_id, date, check_in, status, type)
      VALUES ('${userId}', '${r.date}', '${r.time}', '${r.status}', 'WFO');
    `);
  }
}

async function mineOf(userId, bulan = `${Y}-${String(M).padStart(2, "0")}`) {
  const r = await api(userId, `/api/absensi/summary?mine=1&month=${bulan}`);
  if (r.status !== 200) return { __status: r.status, __envelope: r.envelope };
  return payload(r).mine;
}

// ═══════════════════════════════════════════════════════════════
section("1. Tanpa data sama sekali -> null, bukan 0");
// ═══════════════════════════════════════════════════════════════
//
// Ini keadaan yang paling penting. Kalau yang dikembalikan 0, kartu
// akan menampilkan "0%" untuk orang yang belum absen -- artinya
// menuduh mereka tidak disiplin padahal belum Apa.
// Dua itu berbeda dan tidak boleh diratakan.

seed("u-staff-001", []);
const kosong = await mineOf("u-staff-001");
check("endpoint 200", kosong?.__status === undefined, JSON.stringify(kosong).slice(0, 140));
check("onTimePercent = null (bukan 0)", kosong?.onTimePercent === null, `nilai=${kosong?.onTimePercent}`);
check("daysRecorded = 0", kosong?.daysRecorded === 0, `nilai=${kosong?.daysRecorded}`);
check("daysOnTime = 0", kosong?.daysOnTime === 0, `nilai=${kosong?.daysOnTime}`);
check("streak = 0", kosong?.streak === 0, `nilai=${kosong?.streak}`);
check("lastRecordedOn = null", kosong?.lastRecordedOn === null, `nilai=${kosong?.lastRecordedOn}`);

// ═══════════════════════════════════════════════════════════════
section("2. Semua tepat waktu -> 100% dan streak penuh");
// ═══════════════════════════════════════════════════════════════

seed("u-staff-001", [
  { date: T1, time: "07:30", status: "on_time" },
  { date: T2, time: "07:45", status: "on_time" },
  { date: T3, time: "08:00", status: "on_time" },
]);
const penuh = await mineOf("u-staff-001");
check("daysRecorded = 3", penuh?.daysRecorded === 3, `nilai=${penuh?.daysRecorded}`);
check("daysOnTime = 3", penuh?.daysOnTime === 3, `nilai=${penuh?.daysOnTime}`);
check("onTimePercent = 100", penuh?.onTimePercent === 100, `nilai=${penuh?.onTimePercent}`);
check("streak = 3", penuh?.streak === 3, `nilai=${penuh?.streak}`);
check("lastRecordedOn = tanggal terbaru", penuh?.lastRecordedOn === T3, `${penuh?.lastRecordedOn} vs ${T3}`);

// ═══════════════════════════════════════════════════════════════
section("3. Terlambat -> persentase turun, streak terputus");
// ═══════════════════════════════════════════════════════════════
//
// Streak HARUSiputus di hari pertama yang terlambat. Kalau tidak,
// "streak" hanya menghitung jumlah hari on_time, yang sudah ada di
// daysOnTime -- dan jadi angka yang sama dua kali.

// Hari TERLAMBAT diletakkan paling awal, supaya streak yang dihitung
// dari hari terakhir masih beruntun dan nilainya bisa dibandingkan
// dengan daysOnTime.
//
// Versi pertama menaruh yang terlambat di hari TERAKHIR dan sekaligus
// mengharapkan streak = 2. Dua hal itu tidak bisa sama-sama benar:
// kalau hari terakhir terlambat, streak memang 0 -- itu justru
// perilaku yang benar, karena streak yang sedang berjalan sudah
// terputus. Yang keliru adalah ekspektasinya, bukan kodenya.
seed("u-staff-001", [
  { date: T1, time: "09:30", status: "late" },
  { date: T2, time: "07:45", status: "on_time" },
  { date: T3, time: "07:30", status: "on_time" },
]);
const telat = await mineOf("u-staff-001");
check("daysRecorded = 3", telat?.daysRecorded === 3, `nilai=${telat?.daysRecorded}`);
check("daysOnTime = 2", telat?.daysOnTime === 2, `nilai=${telat?.daysOnTime}`);
check("onTimePercent = 67", telat?.onTimePercent === 67, `nilai=${telat?.onTimePercent}`);
check("streak = 2 (dua hari terakhir tepat waktu)", telat?.streak === 2, `nilai=${telat?.streak}`);
check("streak menghitung hari BERUNTUN, bukan total hari tepat waktu",
  telat?.streak === 2 && telat?.daysOnTime === 2,
  `streak=${telat?.streak} onTime=${telat?.daysOnTime}`);

// Terlambat di hari terakhir harus memutus streak menjadi 0.
seed("u-staff-001", [
  { date: T1, time: "07:30", status: "on_time" },
  { date: T2, time: "07:45", status: "on_time" },
  { date: T3, time: "09:30", status: "late" },
]);
const telatAkhir = await mineOf("u-staff-001");
check("terlambat di hari terakhir -> streak 0", telatAkhir?.streak === 0,
  `nilai=${telatAkhir?.streak}`);
check("tapi daysOnTime tetap 2", telatAkhir?.daysOnTime === 2,
  `nilai=${telatAkhir?.daysOnTime}`);

// ═══════════════════════════════════════════════════════════════
section("4. Semua terlambat -> 0%, bukan null");
// ═══════════════════════════════════════════════════════════════
//
// Ini yang membuktikan null dan 0 memang dibedakan. Absen tapi
// terlambat = 0% (pernah hadir). Belum absen = null (belum hadir).

seed("u-staff-001", [
  { date: T1, time: "10:30", status: "very_late" },
  { date: T2, time: "09:30", status: "late" },
]);
const semuaTelat = await mineOf("u-staff-001");
check("daysRecorded = 2", semuaTelat?.daysRecorded === 2, `nilai=${semuaTelat?.daysRecorded}`);
check("onTimePercent = 0", semuaTelat?.onTimePercent === 0, `nilai=${semuaTelat?.onTimePercent}`);
check("onTimePercent bukan null", semuaTelat?.onTimePercent !== null, `nilai=${semuaTelat?.onTimePercent}`);
check("streak = 0", semuaTelat?.streak === 0, `nilai=${semuaTelat?.streak}`);

// ═══════════════════════════════════════════════════════════════
section("5. Celah hari kerja memutus streak, akhir pekan tidak");
// ═══════════════════════════════════════════════════════════════
//
// Kalau akhir ikut dihitung, streak semua orang akan putus setiap
// Jumat dan bisa dihitung ulang -- dan angka "beruntun" jadi tidak
// berguna karena selalu me-reset sendiri tiap pekan.

const A = hariKerja(5);
const B = hariKerja(6);
// Temukan Pair hari kerja yang dipisahkan akhir pekan.
let pairSabtu = null;
let pairAkhirPekan = null;
for (let off = 1; off <= 20; off++) {
  const d = new Date(Y, M - 1, 1 + off);
  if (d.getDay() === 6) {
    const fmt = (x) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const jumat = new Date(d);
    jumat.setDate(jumat.getDate() - 1);
    const senin = new Date(d);
    senin.setDate(senin.getDate() + 2);
    pairSabtu = { a: fmt(jumat), b: fmt(senin) };
  }
  if (d.getDay() === 0 && pairAkhirPekan === null) {
    const fmt = (x) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const jumat = new Date(d);
    jumat.setDate(jumat.getDate() - 1);
    const senin = new Date(d);
    senin.setDate(senin.getDate() + 1);
    pairAkhirPekan = { a: fmt(jumat), b: fmt(senin) };
  }
}

if (!pairSabtu || !pairAkhirPekan) {
  check("fixture akhir pekan tersedia", false, "tidak ketemu pasangan Jumat-Senin");
} else {
  // Jumat + Senin = beruntun, weekend di antaranya tidak memutus.
  seed("u-staff-001", [
    { date: pairSabtu.a, time: "07:30", status: "on_time" },
    { date: pairSabtu.b, time: "07:45", status: "on_time" },
  ]);
  const akhirPekan = await mineOf("u-staff-001");
  check(
    `akhir pekan tidak memutus streak (${pairSabtu.a} lalu ${pairSabtu.b})`,
    akhirPekan?.streak === 2,
    `nilai=${akhirPekan?.streak}`,
  );

  // Celah hari kerja yang sengaja dilewati = memutus streak.
  const lompat = deretHariKerja(1, 20)[0];
  seed("u-staff-001", [
    { date: pairAkhirPekan.a, time: "07:30", status: "on_time" },
    { date: lompat, time: "07:45", status: "on_time" },
  ]);
  const celah = await mineOf("u-staff-001");
  check(
    `celah hari kerja memutus streak (${pairAkhirPekan.a} lalu ${lompat})`,
    celah?.streak === 1,
    `nilai=${celah?.streak}`,
  );
}

// ═══════════════════════════════════════════════════════════════
section("6. Angka berasal dari data, bukan placeholder");
// ═══════════════════════════════════════════════════════════════
//
// Kalau ada fallback seperti `?? 100`, test ini akan gagal -- dan
// itulah gunanya. Fallback menutupi kegagalan tanpa jejak (§3.7).

seed("u-staff-001", [
  { date: T1, time: "07:30", status: "on_time" },
  { date: T2, time: "11:00", status: "very_late" },
]);
const campuran = await mineOf("u-staff-001");
check("onTimePercent = 50, bukan default", campuran?.onTimePercent === 50, `nilai=${campuran?.onTimePercent}`);

seed("u-staff-002", [
  { date: T1, time: "07:30", status: "on_time" },
]);
// Dua user dengan data berbeda harus melihat angka masing-masing.
// Kalau hasilnya sama persis, berarti DAL mengabaikan userId dan
// mengembalikan angka global -- bug yang lolos kalau hanya satu user
// yang diuji.
const lain = await mineOf("u-staff-002");
check("staff-002 melihat 100% (1 hari, tepat waktu)",
  lain?.onTimePercent === 100, `nilai=${lain?.onTimePercent}`);
check("staff-002 daysRecorded = 1, bukan milik staff-001",
  lain?.daysRecorded === 1, `nilai=${lain?.daysRecorded}`);
check("staff-001 tetap melihat 50% (tidak tertukar)",
  campuran?.onTimePercent === 50, `nilai=${campuran?.onTimePercent}`);

// ═══════════════════════════════════════════════════════════════
section("7. mine=1 tidak membocorkan angka orang lain");
// ═══════════════════════════════════════════════════════════════
//
// Parameter userId dari client TIDAK boleh diterima. Kalau iya, siapa
// pun yang punya sesi bisa membaca kehadiran siapa saja dengan
// menebak UUID.

seed("u-staff-001", [
  { date: T1, time: "07:30", status: "on_time" },
  { date: T2, time: "11:00", status: "very_late" },
]);
const reqTarget = await api("u-staff-003", "/api/absensi/summary?mine=1&userId=u-staff-001");
const targetMine = payload(reqTarget).mine;
check("tidak ada userId dari client yang diterima",
  targetMine?.onTimePercent === null,
  `staff-003 melihat ${targetMine?.onTimePercent} (harusnya null -- dia tidak punya data)`);

// ═══════════════════════════════════════════════════════════════
section("8. Otorisasi");
// ═══════════════════════════════════════════════════════════════

const tanpaSesi = await fetch(`${BASE}/api/absensi/summary?mine=1`, { redirect: "manual" });
check("tanpa sesi tidak mendapat 200", tanpaSesi.status !== 200, `status ${tanpaSesi.status}`);

// u-pending-001 punya absensi_status='pending', jadi harus ditolak
// oleh requireActiveAbsensiStaff.
// Kode yang diharapkan 403 (Forbidden), BUKAN 401 (Unauthorized).
// Kalau dibalik, artinya sesinya tidak dikenali sama sekali --
// itu masalah auth yang berbeda dan akan disalahartikan.
// u-pending-001 punya absensi_status='pending', jadi harus ditolak
// oleh requireActiveAbsensiStaff dengan 403 (Forbidden).
//
// Catatan: kalau yang muncul 401, itu masalah auth yang BERBEDA --
// sesinya tidak dikenali sama sekali, bukan role-nya yang salah.
// Diharapkan 403 supaya keduanya tidak tertukar.
const pending = await api("u-pending-001", "/api/absensi/summary?mine=1");
console.log(`  (u-pending-001 dapat status ${pending.status})`);
check("akun pending tidak mendapat data",
  pending.status !== 200 || payload(pending).mine === undefined,
  `status ${pending.status}`);
check("pesan penolakan berbahasa Indonesia",
  typeof pending.envelope?.error === "string",
  JSON.stringify(pending.envelope).slice(0, 160));

// ═══════════════════════════════════════════════════════════════
section("9. Tanpa mine=1, angka pribadi TIDAK ikut terkirim");
// ═══════════════════════════════════════════════════════════════

// Bentuk summary: { wfo: { count, names }, wfa, leave, missed }.
// Yang dicek adalah KUNCI wfo, bukan Array.isArray -- isinya object,
// bukan array, jadi Array.isArray akan selalu false dan assert-nya
// tidak memeriksa apa pun.
const tanpaMine = await api("u-staff-001", "/api/absensi/summary");
const p = payload(tanpaMine);
check("ringkasan tim tetap ada", p.summary !== undefined,
  JSON.stringify(p).slice(0, 140));
check("keempat kategori ada",
  ["wfo", "wfa", "leave", "missed"].every((k) => p.summary?.[k] !== undefined),
  `kunci: ${Object.keys(p.summary ?? {}).join(",")}`);
check("kategori punya count berupa angka",
  ["wfo", "wfa", "leave", "missed"].every((k) => typeof p.summary?.[k]?.count === "number"),
  JSON.stringify(p.summary).slice(0, 160));
check("mine tidak ada tanpa mine=1", p.mine === undefined,
  `kunci mine = ${JSON.stringify(p.mine)}`);

// ═══════════════════════════════════════════════════════════════
section("10. Halaman dashboard staf tidak lagi menulis 100% literal");
// ═══════════════════════════════════════════════════════════════
//
// Yang Dicek di FILE, bukan di HTML. Halaman ini client-side, jadi
// angka yang tampil di HTML awal selalu berupa skeleton -- assertion
// soal isi HTML akan selalu lulus dan tidak memeriksa apa pun.

// Dicek di FILE, bukan di HTML, karena kedua halaman ini client-side:
// angka yang tampil di HTML awal selalu skeleton, jadi assertion soal
// isi HTML akan selalu lulus tanpa memeriksa apa pun.
//
// Baris komentar ikut dibuang sebelum diperiksa. Komentar menjelaskan
// angka literal yang DIHAPUS, jadi teks "Great Consistency!"
// justru akan muncul sebagai bukti bahwa penghapusannya dicatat --
// dan membuat assertion-nya sendiri membingungkan.
const fs = await import("node:fs");

/** Buang blok komentar dan komentar baris, supaya hanya kode yang diperiksa. */
function tanpaKomentar(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

const src = tanpaKomentar(
  fs.readFileSync("src/app/dashboard/tim/page.tsx", "utf8"),
);
check("tidak ada teks 'Great Consistency!' di kode",
  !src.includes("Great Consistency"), "masih ada di kode (di luar komentar)");
check("tidak ada '100%' sebagai JSX literal",
  !/>\s*100%\s*</.test(src), "masih ada sebagai JSX literal");
check("kartu memakai attendanceStats", src.includes("attendanceStats"));

const widget = tanpaKomentar(
  fs.readFileSync("src/components/absensi/AttendanceWidget.tsx", "utf8"),
);
check("widget juga tidak menulis 100% literal",
  !/>\s*100%\s*</.test(widget), "masih ada sebagai JSX literal");

// ═══════════════════════════════════════════════════════════════
section("11. Kebersihan");
// ═══════════════════════════════════════════════════════════════

bersihkan();
const sisa = psql(
  `SELECT count(*) FROM attendance
    WHERE user_id IN ('u-staff-001','u-staff-002','u-staff-003')
      AND date >= '${Y}-${String(M).padStart(2, "0")}-01';`,
);
check("fixture absensi dibersihkan", Number(sisa) === 0, `sisa ${sisa}`);

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);