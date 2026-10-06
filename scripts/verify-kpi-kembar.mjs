/**
 * Verifikasi: pencegahan KPI kembar ditegakkan di SERVER.
 *
 * Latar belakang (semua ini terverifikasi ke produksi, bukan dugaan):
 *
 *   1. Constraint `kpis_title_period_unique` **ada di 0010 lalu
 *      dilepas oleh 0014 dengan sengaja** -- data Supabase punya 962
 *      baris duplikat dan memasangnya lagi akan memaksa menghapus
 *      data. Jadi tidak ada constraint yang bisa diandalkan.
 *
 *   2. Yang menggantikannya cuma `useMemo` di `KpiFormPage` yang
 *      membandingkan title+brand dari daftar browser. Dua masalah:
 *      bisa dilewati dengan POST langsung, dan kuncinya tidak cocok
 *      dengan data (masih ada 19 grup duplikat pada title+brand).
 *
 *   3. `copyKpisFromMonth` punya dedup sendiri dengan kunci
 *      (title, department) -- case-SENSITIVE dan tanpa brand. Dua
 *      aturan berbeda untuk hal yang sama.
 *
 * Jadi yang diuji: satu aturan, di server, kunci title+brand+divisi,
 * case-insensitive.
 *
 * Jalankan: node scripts/verify-kpi-kembar.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
for (const u of ["u-hr-001", "u-exec-001", "u-head-001", "u-staff-001"]) {
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
    envelope = { raw: text.slice(0, 200) };
  }
  return { status: res.status, envelope };
}

/** Body POST /api/kpis yang valid. */
function kpiBody(over = {}) {
  return {
    title: "Kembar Uji",
    type: "result",
    unit: "number",
    period: "monthly",
    monthlyTarget: 10,
    year: 2091,
    month: 3,
    departmentId: null,
    ...over,
  };
}

// Divisi uji yang pasti ada dan tidak dipakai apa pun di 2091-03.
const DEPT = psql(
  "SELECT id FROM departments ORDER BY name LIMIT 1",
);
const DEPT2 = psql(
  "SELECT id FROM departments ORDER BY name DESC LIMIT 1",
);

// Bersihkan sisa uji sebelumnya.
psql("DELETE FROM kpis WHERE year = 2091");
console.log("divisi uji:", DEPT, "|", DEPT2);

async function post(userId, body) {
  return api(userId, "/api/kpis", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function patch(userId, body) {
  return api(userId, "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

try {
  // ══════════════════════════════════════════════════════════
  section("A. KPI kembar ditolak saat dibuat");
  // ══════════════════════════════════════════════════════════

  const pertama = await post("u-hr-001", kpiBody({ departmentId: DEPT }));
  check("KPI pertama dibuat", pertama.status === 200, `status ${pertama.status} ${JSON.stringify( pertama.envelope).slice(0,120)}`);

  const kedua = await post("u-hr-001", kpiBody({ departmentId: DEPT }));
  check(
    "kembar identik ditolak",
    kedua.status === 400,
    `status ${kedua.status}`,
  );
  check(
    "pesan menyebut judulnya",
    /Kembar Uji/.test(kedua.envelope?.error ?? ""),
    kedua.envelope?.error,
  );

  // ══════════════════════════════════════════════════════════
  section("B. Beda brand = bukan kembar");
  // ══════════════════════════════════════════════════════════

  const brandB = await post(
    "u-hr-001",
    kpiBody({ departmentId: DEPT, brand: "BrandX" }),
  );
  check("brand berbeda boleh", brandB.status === 200, `status ${brandB.status} ${JSON.stringify(brandB.envelope).slice(0,120)}`);

  const brandB2 = await post(
    "u-hr-001",
    kpiBody({ departmentId: DEPT, brand: "BrandX" }),
  );
  check(
    "brand sama ditolak",
    brandB2.status === 400,
    `status ${brandB2.status}`,
  );

  // ══════════════════════════════════════════════════════════
  section("C. Beda divisi = bukan kembar");
  // ══════════════════════════════════════════════════════════

  const dept2 = await post("u-hr-001", kpiBody({ departmentId: DEPT2 }));
  check("divisi berbeda boleh", dept2.status === 200, `status ${dept2.status} ${JSON.stringify(dept2.envelope).slice(0,120)}`);

  const dept2b = await post("u-hr-001", kpiBody({ departmentId: DEPT2 }));
  check("divisi sama ditolak", dept2b.status === 400, `status ${dept2b.status}`);

  // ══════════════════════════════════════════════════════════
  section("D. Case-insensitive");
  // ══════════════════════════════════════════════════════════

  const upper = await post(
    "u-hr-001",
    kpiBody({ departmentId: DEPT, title: "KEMBAR UJI" }),
  );
  check(
    "huruf besar ditolak sebagai kembar",
    upper.status === 400,
    `status ${upper.status}`,
  );

  const brandCase = await post(
    "u-hr-001",
    kpiBody({ departmentId: DEPT, brand: "BRANDX" }),
  );
  check(
    "brand beda huruf besar juga kembar",
    brandCase.status === 400,
    `status ${brandCase.status}`,
  );

  // ══════════════════════════════════════════════════════════
  section("E. Divisi NULL dibandingkan dengan benar");
  // ══════════════════════════════════════════════════════════

  // `department_id = NULL` tidak pernah true di SQL. Kalau tidak
  // ditangani, KPI tanpa divisi akan lolos dari cek dan jadi
  // kembar yang tersembunyi.
  const tanpaDiv = await post("u-hr-001", kpiBody({ departmentId: null }));
  check(
    "KPI tanpa divisi ditolak di route (kalau aturan tetap ada)",
    tanpaDiv.status === 400,
    `status ${tanpaDiv.status}`,
  );

  // Route sudah menolak division kosong sebelum DAL sempat dipanggil,
  // jadi lewat API tidak ada KPI tanpa divisi yang bisa dibuat sama
  // sekali. Justru itu yang membuat cabang isNull() di DAL tidak
  // terjangkau dari sini -- dia tetap diuji di bagian M lewat kode,
  // karena akan relevan begitu suatu saat divisi boleh dikosongkan.
  const jmlTanpaDiv = psql(
    `SELECT count(*) FROM kpis WHERE year=2091 AND month=3 AND department_id IS NULL`,
  );
  check(
    "tidak ada KPI tanpa divisi sama sekali",
    jmlTanpaDiv === "0",
    `jumlah ${jmlTanpaDiv} -- route sudah menolak divisi kosong`,
  );

  // ══════════════════════════════════════════════════════════
  section("F. Edit boleh menyimpan dirinya sendiri");
  // ══════════════════════════════════════════════════════════

  const idPertama = psql(
    `SELECT id FROM kpis WHERE year=2091 AND month=3 AND title='Kembar Uji' AND department_id='${DEPT}' LIMIT 1`,
  );

  const editSendiri = await patch("u-hr-001", {
    id: idPertama,
    title: "Kembar Uji",
    monthlyTarget: 20,
  });
  check(
    "edit tanpa mengubah judul boleh",
    editSendiri.status === 200,
    `status ${editSendiri.status} ${JSON.stringify(editSendiri.envelope).slice(0,120)}`,
  );

  const editSendiri2 = await patch("u-hr-001", {
    id: idPertama,
    title: "Kembar Uji",
    monthlyTarget: 30,
  });
  check("edit dua kali tetap boleh", editSendiri2.status === 200, `status ${editSendiri2.status}`);

  // ══════════════════════════════════════════════════════════
  section("G. Edit yang menabrak KPI lain ditolak");
  // ══════════════════════════════════════════════════════════

  const idDept2 = psql(
    `SELECT id FROM kpis WHERE year=2091 AND month=3 AND title='Kembar Uji' AND department_id='${DEPT2}' LIMIT 1`,
  );

  // Pindahkan KPI divisi 2 ke divisi 1 -- jadi kembar dengan yang di sana.
  const tabrak = await patch("u-hr-001", {
    id: idDept2,
    departmentId: DEPT,
  });
  check(
    "edit menabrak KPI lain ditolak",
    tabrak.status === 400,
    `status ${tabrak.status}`,
  );
  check(
    "pesan menyebut judulnya",
    /Kembar Uji/.test(tabrak.envelope?.error ?? ""),
    tabrak.envelope?.error,
  );

  // ══════════════════════════════════════════════════════════
  section("H. Edit menyetel brand yang sudah dipakai");
  // ══════════════════════════════════════════════════════════

  const tabrakBrand = await patch("u-hr-001", {
    id: idPertama,
    brand: "BrandX",
  });
  check(
    "edit brand menabrak ditolak",
    tabrakBrand.status === 400,
    `status ${tabrakBrand.status}`,
  );

  // ══════════════════════════════════════════════════════════
  section("I. Periode lain = bukan kembar");
  // ══════════════════════════════════════════════════════════

  const bulanLain = await post(
    "u-hr-001",
    kpiBody({ departmentId: DEPT, month: 4 }),
  );
  check("bulan berbeda boleh", bulanLain.status === 200, `status ${bulanLain.status}`);

  // ══════════════════════════════════════════════════════════
  section("J. KPI soft-deleted tidak memblokir");
  // ══════════════════════════════════════════════════════════

  psql(`UPDATE kpis SET deleted_at = now() WHERE id = '${idPertama}'`);

  const setelahDiHapus = await post(
    "u-hr-001",
    kpiBody({ departmentId: DEPT }),
  );
  check(
    "KPI yang di-archive tidak memblokir pembuatan ulang",
    setelahDiHapus.status === 200,
    `status ${setelahDiHapus.status} ${JSON.stringify(setelahDiHapus.envelope).slice(0,120)}`,
  );

  // ══════════════════════════════════════════════════════════
  section("K.(copy-from-month ikut aturan yang sama");
  // ══════════════════════════════════════════════════════════

  // copied twice into the same target must not create duplicates.
  const copy1 = await post("u-hr-001", {
    action: "copy-from-month",
    year: 2091,
    month: 5,
  });
  const copy2 = await post("u-hr-001", {
    action: "copy-from-month",
    year: 2091,
    month: 5,
  });

  check("copy pertama jalan", copy1.status === 200, `status ${copy1.status}`);
  check(
    "copy kedua tidak menambah apa pun",
    payload(copy2).copied === 0,
    `copied=${payload(copy2).copied} skipped=${payload(copy2).skipped}`,
  );

  const duplikatSetelahCopy = psql(`
    SELECT count(*) FROM (
      SELECT title, brand, department_id FROM kpis
       WHERE year=2091 AND month=5 AND deleted_at IS NULL
       GROUP BY title, brand, department_id HAVING count(*) > 1
    ) d`);
  check(
    "tidak ada kembar di bulan tujuan",
    duplikatSetelahCopy === "0",
    `${duplikatSetelahCopy} grup kembar`,
  );

  // ══════════════════════════════════════════════════════════
  section("L. Otorisasi tidak berubah");
  // ══════════════════════════════════════════════════════════

  const staf = await post("u-staff-001", kpiBody({ departmentId: DEPT }));
  check("staf biasa tidak bisa buat KPI", staf.status === 403, `status ${staf.status}`);

  // formerly test ini memakai `api("u-hr-001", ...)` -- jadi bukan tanpa
  // sesi, cuma body-nya yang tidak lengkap. Balasan 400 lalu dianggap
  // bukti otorisasi, padahal body-lah yang ditolak.
  const tanpaSesi = await fetch(`${BASE}/api/kpis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(kpiBody({ departmentId: DEPT })),
  });
  check(
    "tanpa sesi ditolak",
    tanpaSesi.status === 401,
    `status ${tanpaSesi.status}`,
  );

  // ══════════════════════════════════════════════════════════
  section("M. Kode: satu aturan, bukan dua");
  // ══════════════════════════════════════════════════════════

  const dal = readFileSync("src/server/dal/kpi.ts", "utf8");

  check(
    "cek kembar dipanggil dari createKpi",
    /export async function createKpi[\s\S]{0,400}assertTidakKembar/.test(dal),
  );

  check(
    "cek kembar dipanggil dari updateKpi",
    /export async function updateKpi[\s\S]{0,1200}assertTidakKembar/.test(dal),
  );

  check(
    "kunci memuat brand",
    /lower\(\$\{kpis\.brand\}\)/.test(dal),
    "kunci harus title+brand+divisi",
  );

  check(
    "divisi NULL ditangani terpisah",
    /isNull\(kpis\.departmentId\)/.test(dal),
    "department_id = NULL tidak pernah true di SQL",
  );

  check(
    "soft-deleted tidak dihitung",
    /isNull\(kpis\.deletedAt\)/.test(dal),
  );

  check(
    "KPI kembar yang sudah ada tidak dihapus",
    !/DELETE FROM kpis/i.test(dal),
    "fungsi ini hanya mencegah yang baru, tidak membersihkan data lama",
  );
} finally {
  psql("DELETE FROM kpis WHERE year = 2091");
  console.log("\nData uji dibersihkan.");
}

console.log(`\n${pass} pass, ${fail} gagal`);
process.exit(fail === 0 ? 0 : 1);