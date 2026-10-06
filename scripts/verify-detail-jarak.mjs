/**
 * Verifikasi kolom DETAIL: jarak ke kantor di dashboard admin.
 *
 * Fokus: `jarakDariKantor` yang dihitung server.
 *
 * Yang sebelumnya salah (dan tidak terlihat salah):
 *   - UI membaca `locationIn.distance`, yang hanya ada di 347 dari 2687
 *     baris produksi. Kolom jadi kosong untuk 87 persen data -- dan
 *     kolom kosong selalu terlihat normal.
 *   - Fallback membandingkan jarak dengan radius kantor TERBESAR,
 *     jadi orang yang absen di kantor kecil selalu terbaca "dalam
 *     area" bisa jadi jauh di luar radius kantor itu.
 *   - `locationIn` dibaca sebagai `{lat, lng}` padahal bertipe
 *     Record<string, unknown>. Ada 3 baris dengan lat/lng null, jadi
 *     `null.toFixed()` akan melempar TypeError dan SELURUH modal
 *     gagal dibuka -- bukan hanya tautan Google Maps-nya.
 *
 * Jalankan: node scripts/verify-detail-jarak.mjs
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

function payload(res) {
  return res.envelope?.data ?? res.envelope ?? {};
}

const TOK = {};
for (const u of ["u-hr-001", "u-exec-001", "u-staff-001"]) {
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

// ── Kantor fixture ────────────────────────────────────────────────
//
// KANTOR UJI: lat -6.2, lng 106.6, radius 500.
// Titik UJI JAUH: 0.005 derajat dari kantor. Di khatulistiwa itu
// sekitar 556 meter -- cukup untuk memastikan di luar radius 500.

const KANTOR = { name: "KANTOR UJI", lat: -6.2, lng: 106.6, radius: 500 };
const DI_DEKAT = { lat: -6.2, lng: 106.6 };
const DI_JAUH = { lat: -6.195, lng: 106.6 };

function bersihkanKantor() {
  psql(`DELETE FROM office_locations WHERE name = '${KANTOR.name}';`);
}

function seedKantor() {
  bersihkanKantor();
  psql(
    `INSERT INTO office_locations (name, lat, lng, radius) ` +
      `VALUES ('${KANTOR.name}', ${KANTOR.lat}, ${KANTOR.lng}, ${KANTOR.radius});`,
  );
}

function hariIni() {
  const d = new Date();
  return (
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

const HARI = hariIni();

function bersihkanAbsen() {
  // Diberi tanda lewat `notes` supaya bagian 12 bisa memverifikasinya
  // benar-benar hilang -- bukan hanya terlihat bersih karena tidak dicek.
  psql(`DELETE FROM attendance WHERE notes LIKE 'ZZ Uji Jarak%';`);
}

function seedAbsen(locationIn) {
  bersihkanAbsen();
  const json = locationIn === null ? "NULL" : `'${JSON.stringify(locationIn)}'`;
  psql(
    `INSERT INTO attendance (user_id, date, check_in, check_out, status, type, location_in, location_status, notes) ` +
      `VALUES ('u-staff-001', '${HARI}', '08:00', '17:00', 'on_time', 'WFO', ${json}::jsonb, 'Dalam Area', 'ZZ Uji Jarak');`,
  );
}

async function dashboard() {
  const r = await api("u-hr-001", `/api/absensi/dashboard?date=${HARI}`);
  if (r.status !== 200) return { __status: r.status, __envelope: r.envelope };
  return payload(r);
}

/** Baris log milik u-staff-001 dari respons dashboard. */
function barisStaff(d) {
  const logs = d?.logs ?? [];
  return logs.find((x) => x.userId === "u-staff-001") ?? null;
}

// ═══════════════════════════════════════════════════════════════
section("0. Endpoint dan bentuk respons");
// ═══════════════════════════════════════════════════════════════

seedKantor();
seedAbsen(DI_DEKAT);

const d0 = await dashboard();
check("dashboard 200", d0?.__status === undefined, JSON.stringify(d0).slice(0, 160));
check("logs berupa array", Array.isArray(d0?.logs), `tipe=${typeof d0?.logs}`);

// ═══════════════════════════════════════════════════════════════
section("1. jarakDariKantor ada di setiap baris");
// ═══════════════════════════════════════════════════════════════

const withLoc = (d0?.logs ?? []).filter((x) => x.locationIn);
check("ada baris dengan koordinat untuk diuji", withLoc.length > 0);
const punyaField = withLoc.every((x) => "jarakDariKantor" in x);
check("setiap baris punya field jarakDariKantor", punyaField);

// ═══════════════════════════════════════════════════════════════
section("2. Tepat di kantor -> jarak kecil, dalam radius");
// ═══════════════════════════════════════════════════════════════

seedAbsen(DI_DEKAT);
const dekat = barisStaff(await dashboard());
const jDekat = dekat?.jarakDariKantor;
check("jarakDariKantor bukan null", jDekat !== null, JSON.stringify(dekat?.locationIn));
check("jarak kecil", jDekat !== null && jDekat.meter < 10, `meter=${jDekat?.meter}`);
check("dalamRadius = true", jDekat?.dalamRadius === true, `dalamRadius=${jDekat?.dalamRadius}`);
check("nama kantor benar", jDekat?.namaKantor === KANTOR.name, `nama=${jDekat?.namaKantor}`);
check("radius ikut terkirim", jDekat?.radius === KANTOR.radius, `radius=${jDekat?.radius}`);

// ═══════════════════════════════════════════════════════════════
section("3. Di luar radius -> jarak besar, TIDAK dalam radius");
// ═══════════════════════════════════════════════════════════════
//
// Ini yang menguji perbaikan "radius kantor TERBESAR". Kalau perbandingan
// memakai radius kantor lain yang lebih besar, baris ini akan terbaca
// "dalam area" padahal jaraknya 556 meter dari kantornya sendiri.

seedAbsen(DI_JAUH);
const jauh = barisStaff(await dashboard());
const jJauh = jauh?.jarakDariKantor;
check("jarak > 500 m", jJauh !== null && jJauh.meter > 500, `meter=${jJauh?.meter}`);
check("dalamRadius = false", jJauh?.dalamRadius === false, `dalamRadius=${jJauh?.dalamRadius}`);
check("masih menyebut kantor yang benar",
  jJauh?.namaKantor === KANTOR.name, `nama=${jJauh?.namaKantor}`);

// ═══════════════════════════════════════════════════════════════
section("4. Tanpa koordinat -> null, BUKAN 0");
// ═══════════════════════════════════════════════════════════════
//
// 0 berarti "tepat di kantor". Kalau yang dikembalikan 0 untuk orang
// yang tidak absen dengan GPS, dashboard akan menampilkan
// "0 m dari KANTOR UJI / dalam area" -- kesimpulan yang salah total.

seedAbsen(null);
const tanpaLokasi = barisStaff(await dashboard());
check("locationIn null", tanpaLokasi?.locationIn === null);
check("jarakDariKantor null", tanpaLokasi?.jarakDariKantor === null,
  `nilai=${JSON.stringify(tanpaLokasi?.jarakDariKantor)}`);
check("bukan 0", tanpaLokasi?.jarakDariKantor !== 0);

// ═══════════════════════════════════════════════════════════════
section("5. Koordinat rusak -> null, bukan NaN");
// ═══════════════════════════════════════════════════════════════
//
// Ditemukan 3 baris produksi dengan lat/lng null. Tanpa penanganan,
// NaN lolos ke UI dan tampil sebagai "NaN m" atau "NaN m dari NaN".

for (const [label, loc] of [
  ["lat/lng null", { lat: null, lng: null }],
  ["lat string kosong", { lat: "", lng: "" }],
  ["0/0", { lat: 0, lng: 0 }],
  ["di luar rentang", { lat: 999, lng: 999 }],
  ["bukan objek", "bukan objek"],
]) {
  seedAbsen(loc);
  const rusak = barisStaff(await dashboard());
  check(`${label} -> null`, rusak?.jarakDariKantor === null,
    `nilai=${JSON.stringify(rusak?.jarakDariKantor)}`);
  check(`${label} -> tidak NaN`,
    !String(JSON.stringify(rusak?.jarakDariKantor)).includes("NaN"),
    JSON.stringify(rusak?.jarakDariKantor));
}

// ═══════════════════════════════════════════════════════════════
section("6. Tanpa kantor terdaftar -> null");
// ═══════════════════════════════════════════════════════════════

// Seluruh tabel office_locations dikosongkan sementara.
//
// formerly test ini hanya menghapus KANTOR UJI-nya sendiri, padahal
// DB uji punya kantor bawaan ("Kantor Pusat TNT"). Hasilnya test
// menemukan kantor yang tidak sengaja ada dan menyimpulkan kodenya
// salah -- sementara kodenya benar, dan test-nya yang tidak isolating.
//
// Kantor asli dicadangkan lebih dulu supaya bisa dikembalikan utuh,
// bukan hanya yang kelihatan dihapus.
const jumlahKantorAwal = psql(`SELECT count(*) FROM office_locations;`);
psql(`
  DROP TABLE IF EXISTS office_locations_backup;
  CREATE TABLE office_locations_backup AS SELECT * FROM office_locations;
`);
psql(`DELETE FROM office_locations;`);

seedAbsen(DI_DEKAT);
const tanpaKantor = barisStaff(await dashboard());
check("jarakDariKantor null tanpa kantor", tanpaKantor?.jarakDariKantor === null,
  `nilai=${JSON.stringify(tanpaKantor?.jarakDariKantor)}`);

// Kembalikan kantor asli.
psql(`INSERT INTO office_locations SELECT * FROM office_locations_backup;`);
psql(`DROP TABLE office_locations_backup;`);
const kembali = psql(`SELECT count(*) FROM office_locations;`);
console.log(`  kantor dikembalikan: ${kembali} (aslinya ${jumlahKantorAwal})`);

// ═══════════════════════════════════════════════════════════════
section("7. Kantor TERDEKAT yang dipilih");
// ═══════════════════════════════════════════════════════════════

seedKantor();
psql(
  `INSERT INTO office_locations (name, lat, lng, radius) ` +
    `VALUES ('KANTOR JAUH', ${KANTOR.lat + 0.05}, ${KANTOR.lng}, 500);`,
);
seedAbsen(DI_DEKAT);
const duaKantor = barisStaff(await dashboard());
check("memilih kantor terdekat",
  duaKantor?.jarakDariKantor?.namaKantor === KANTOR.name,
  `nama=${duaKantor?.jarakDariKantor?.namaKantor}, meter=${duaKantor?.jarakDariKantor?.meter}`);

psql(`DELETE FROM office_locations WHERE name = 'KANTOR JAUH';`);

// ═══════════════════════════════════════════════════════════════
section("8. Jarak dihitung dari KOORDINAT, bukan dari field distance");
// ═══════════════════════════════════════════════════════════════
//
// Hanya 347 dari 2687 baris produksi punya location_in.distance. Kalau
// kode masih membacanya, kolom kosong untuk 87 persen data.

seedAbsen({ lat: DI_JAUH.lat, lng: DI_JAUH.lng });
const tanpaField = barisStaff(await dashboard());
check("tetap ada jaraknya tanpa field distance",
  tanpaField?.jarakDariKantor !== null,
  `nilai=${JSON.stringify(tanpaField?.jarakDariKantor)}`);
check("field distance memang tidak ada di fixture",
  tanpaField?.locationIn?.distance === undefined,
  `distance=${tanpaField?.locationIn?.distance}`);

seedAbsen({ lat: DI_DEKAT.lat, lng: DI_DEKAT.lng, distance: 999999 });
const fieldPalsu = barisStaff(await dashboard());
check("field distance yang salah diabaikan",
  fieldPalsu?.jarakDariKantor?.meter < 10,
  `meter=${fieldPalsu?.jarakDariKantor?.meter} (field_distance=999999)`);

// ═══════════════════════════════════════════════════════════════
section("9. Kode client tidak lagi menghitung jarak sendiri");
// ═══════════════════════════════════════════════════════════════
//
// formerly ada salinan rumus haversine di page.tsx. Kalau dibiarkan,
// bisa berbeda dari versi server tanpa ada yang tahu -- dan angkanya
// akan beda untuk data yang sama.

const fs = await import("node:fs");
const src = fs
  .readFileSync("src/app/absensi/admin/dashboard/page.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

check("calcDist tidak ada di client", !/function\s+calcDist/.test(src));
check("tidak ada haversine di client", !/6371e3|6371000/.test(src));
check("tidak ada Math.max(...officeLocations", !/Math\.max\(\.\.\.officeLocations/.test(src));
check("hanya membaca jarakDariKantor", src.includes("jarakDariKantor"));

// ═══════════════════════════════════════════════════════════════
section("10. Otorisasi");
// ═══════════════════════════════════════════════════════════════

const tanpaSesi = await fetch(`${BASE}/api/absensi/dashboard?date=${HARI}`, {
  redirect: "manual",
});
check("tanpa sesi tidak mendapat 200", tanpaSesi.status !== 200, `status ${tanpaSesi.status}`);

const staf = await api("u-staff-001", `/api/absensi/dashboard?date=${HARI}`);
check("staf biasa tidak boleh baca dashboard admin",
  staf.status === 403, `status ${staf.status}`);

// ═══════════════════════════════════════════════════════════════
section("11. Halaman dashboard admin merender");
// ═══════════════════════════════════════════════════════════════

const halaman = await fetch(`${BASE}/absensi/admin/dashboard`, {
  headers: { cookie: `authjs.session-token=${TOK["u-hr-001"]}` },
  redirect: "manual",
});
const html = await halaman.text();
check("halaman 200 untuk HR", halaman.status === 200, `status ${halaman.status}`);
check("tidak ada teks error server",
  !/Application error|Something went wrong|Internal Server Error/.test(html));

// formerly dicek `html.includes("Detail")`. Halaman ini client-side, jadi
// HTML awal hanya berisi shell -- header tabel dirender setelah mount.
// Assert itu akan gagal bukan karena bug, tapi karena mengukur tempat
// yang salah.
//
// Yang diukur di sini: server merender tanpa error, dan header kolom
// ada di SUMBER. Isi tabelnya sudah dibuktikan di bagian 1-8 lewat API.
const srcHalaman = fs
  .readFileSync("src/app/absensi/admin/dashboard/page.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");
check("header kolom Detail ada di sumber",
  srcHalaman.includes('"Detail"') || srcHalaman.includes(">Detail<"));

// ═══════════════════════════════════════════════════════════════
section("12. Kebersihan");
// ═══════════════════════════════════════════════════════════════

bersihkanKantor();
psql(`DELETE FROM office_locations WHERE name IN ('KANTOR UJI', 'KANTOR JAUH');`);
bersihkanAbsen();

const sisaKantor = psql(
  `SELECT count(*) FROM office_locations WHERE name IN ('KANTOR UJI', 'KANTOR JAUH');`,
);
check("kantor fixture dibersihkan", Number(sisaKantor) === 0, `sisa ${sisaKantor}`);
// formerly `WHERE reason LIKE 'ZZ Uji Jarak%'` -- tapi kolom `reason`
// tidak ada di tabel attendance, jadi query-nya error dan fixture tidak
// pernah dibersihkan. Kolom yang dipakai untuk menandai baris uji ini
// `notes`.
const sisaAbsen = psql(
  `SELECT count(*) FROM attendance WHERE notes LIKE 'ZZ Uji Jarak%';`,
);
check("absensi fixture dibersihkan", Number(sisaAbsen) === 0, `sisa ${sisaAbsen}`);
const jumlahKantor = psql(`SELECT count(*) FROM office_locations;`);
console.log(`  kantor yang tersisa: ${jumlahKantor} (sebelumnya 2 di produksi)`);

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);