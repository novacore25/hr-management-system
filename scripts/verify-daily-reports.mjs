/**
 * Verifikasi riwayat laporan harian (/dashboard/tim/history).
 *
 * Fokus: value koreksi benar-benar tersimpan DAN ikut mengubah
 * kpi_assignments.actual_total, serta tidak bisa mengubah milik orang lain.
 *
 * Jalankan: node scripts/verify-daily-reports.mjs
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

const TOK = {};
for (const u of [
  "u-staff-001",
  "u-staff-002",
  "u-staff-003",
  "u-head-001",
  "u-hr-001",
]) {
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
  return { status: res.status, body: envelope?.data ?? envelope, envelope };
}

let pass = 0;
let fail = 0;
function check(label, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

// Bersihkan laporan uji.
psql("DELETE FROM daily_reports;");

/**
 * Fixture sendiri, di bulan LALU.
 *
 * Dulu skrip ini memakai assignment dari seed (bulan berjalan) dengan
 * tanggal hard-coded seperti 2026-10-05. Sekarang `POST /api/daily-reports`
 * menolak tanggal di masa depan — dan rightly so, karena `actual_total`
 * akan mengandung angka yang belum terjadi.
 *
 * Kalau fixture memakai bulan berjalan, test ini hanya bisa jalan di
 * tanggal 1 atau 2, dan langsung worthless di tanggal 3. Bulan lalu
 * selalu sepenuhnya di masa lalu, jadi test-nya stabil kapan pun
 * dijalankan.
 */
const prev = new Date();
prev.setMonth(prev.getMonth() - 1);
const PREV_YEAR = prev.getFullYear();
const PREV_MONTH = prev.getMonth() + 1;
const pad = (n) => String(n).padStart(2, "0");
const PREV_PREFIX = `${PREV_YEAR}-${pad(PREV_MONTH)}`;
const D1 = `${PREV_PREFIX}-05`;
const D2 = `${PREV_PREFIX}-06`;
console.log(`        fixture bulan: ${PREV_PREFIX}`);

function cleanupFixture() {
  // `user_id` harus user yang benar-benar ada (foreign key), jadi fixture
  // dicatat lewat KPI-nya, bukan lewat user baru.
  psql(`
    DELETE FROM daily_reports WHERE assignment_id IN
      (SELECT ka.id FROM kpi_assignments ka
        JOIN kpis k ON k.id = ka.kpi_id WHERE k.title='ZZ Uji Laporan Harian');
    DELETE FROM kpi_assignments WHERE kpi_id IN
      (SELECT id FROM kpis WHERE title='ZZ Uji Laporan Harian');
    DELETE FROM kpis WHERE title='ZZ Uji Laporan Harian';
  `);
}
cleanupFixture();

psql(`
  INSERT INTO kpis (title, description, type, unit, period, status, monthly_target,
                    year, month, created_by, department_id)
  VALUES ('ZZ Uji Laporan Harian', 'fixture uji', 'result', 'number', 'monthly',
          'active', 100, ${PREV_YEAR}, ${PREV_MONTH}, 'u-hr-001',
          (SELECT id FROM departments WHERE name='TNT'));

  INSERT INTO kpi_assignments (kpi_id, kpi_type, user_id, department_id, monthly_target,
    actual_total, expected_total, achievement_percentage, current_daily_target,
    working_days_total, working_days_elapsed, working_days_remaining, active_days,
    status, performance_category, year, month)
  SELECT id, 'result', 'u-staff-001', (SELECT id FROM departments WHERE name='TNT'), 100,
         0, 0, 0, 5, 22, 10, 12, 10, 'active', 'warning', ${PREV_YEAR}, ${PREV_MONTH}
  FROM kpis WHERE title='ZZ Uji Laporan Harian';
`);

console.log("\n=== 1. POST: laporan tersimpan dan total ikut ter-recalc ===");
{
  const assignment = psql(
    `SELECT ka.id, ka.monthly_target, ka.working_days_total
     FROM kpi_assignments ka
     JOIN kpis k ON k.id = ka.kpi_id
     WHERE k.title='ZZ Uji Laporan Harian' AND ka.status='active' LIMIT 1;`,
  );
  if (!assignment) {
    console.log("  FAIL  fixture assignment tidak terbentuk");
    process.exit(1);
  }
  const [assignmentId] = assignment.split("|");
  console.log(`        assignment: ${assignmentId}`);

  const before = psql(
    `SELECT actual_total, expected_total, achievement_percentage
     FROM kpi_assignments WHERE id='${assignmentId}';`,
  );
  console.log(`        sebelum: ${before}`);

  const r = await api("u-staff-001", "/api/daily-reports", {
    method: "POST",
    body: JSON.stringify({ assignmentId, date: D1, value: 10 }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 150));

  const t1 = psql(
    `SELECT actual_total FROM kpi_assignments WHERE id='${assignmentId}';`,
  );
  check(`actual_total = 10 (${t1})`, Number(t1) === 10);

  // Tambah lagi, harus menjumlah.
  await api("u-staff-001", "/api/daily-reports", {
    method: "POST",
    body: JSON.stringify({ assignmentId, date: D2, value: 7 }),
  });
  const t2 = psql(
    `SELECT actual_total FROM kpi_assignments WHERE id='${assignmentId}';`,
  );
  check(`actual_total = 17 setelah laporan kedua (${t2})`, Number(t2) === 17);

  // Upsert tanggal yang sama harus menimpa, bukan menambah.
  await api("u-staff-001", "/api/daily-reports", {
    method: "POST",
    body: JSON.stringify({ assignmentId, date: D1, value: 12 }),
  });
  const t3 = psql(
    `SELECT actual_total, (SELECT count(*) FROM daily_reports WHERE assignment_id='${assignmentId}') AS n
     FROM kpi_assignments WHERE id='${assignmentId}';`,
  );
  const [total, n] = t3.split("|");
  check(`actual_total = 19 (10 -> 12, +7) — ${total}`, Number(total) === 19);
  check(`hanya 2 baris daily_reports (${n})`, Number(n) === 2);
}

console.log("\n=== 2. PATCH koreksi: nilai DAN total assignment ikut berubah ===");
{
  const assignment = psql(
    `SELECT ka.id FROM kpi_assignments ka
     JOIN daily_reports d ON d.assignment_id = ka.id
     WHERE d.user_id='u-staff-001' LIMIT 1;`,
  );
  const report = psql(
    `SELECT id, value FROM daily_reports WHERE assignment_id='${assignment}' ORDER BY date LIMIT 1;`,
  );
  const [reportId] = report.split("|");
  console.log(`        laporan: ${report}`);

  const beforeTotal = psql(`SELECT actual_total FROM kpi_assignments WHERE id='${assignment}';`);

  const r = await api("u-staff-001", "/api/daily-reports", {
    method: "PATCH",
    body: JSON.stringify({ id: reportId, value: 20, notes: "salah input" }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 150));

  const afterValue = psql(`SELECT value, notes FROM daily_reports WHERE id='${reportId}';`);
  check(`nilai tersimpan 20 (${afterValue})`, Number(afterValue.split("|")[0]) === 20);
  check(`catatan tersimpan (${afterValue.split("|")[1]})`, afterValue.includes("salah input"));

  // INI yang dulu tidak terjadi: update daily_reports tidak menyentuh
  // kpi_assignments, jadi skor di dashboard tetap memakai total lama.
  const afterTotal = psql(`SELECT actual_total FROM kpi_assignments WHERE id='${assignment}';`);
  console.log(`        actual_total: ${beforeTotal} -> ${afterTotal}`);
  check(
    "kpi_assignments.actual_total ikut di-recalc",
    Number(afterTotal) !== Number(beforeTotal),
    `tidak berubah: ${afterTotal}`,
  );
  check(
    `total = 27 (20 + 7), dapat ${afterTotal}`,
    Number(afterTotal) === 27,
  );

  const achievement = psql(
    `SELECT actual_total, expected_total, achievement_percentage FROM kpi_assignments WHERE id='${assignment}';`,
  );
  console.log(`        rekap: ${achievement}`);
  const [at, et, ap] = achievement.split("|");
  check(`expected_total terisi (${et})`, Number(et) > 0);

  // expected = monthlyTarget / workingDaysTotal * workingDaysElapsed
  const meta = psql(
    `SELECT monthly_target, working_days_total FROM kpi_assignments WHERE id='${assignment}';`,
  );
  const [target, wdTotal] = meta.split("|").map(Number);
  const wdElapsed = psql(
    `SELECT working_days_elapsed FROM kpi_assignments WHERE id='${assignment}';`,
  );
  const expectedFormula = (target / wdTotal) * Number(wdElapsed);
  // expected_total disimpan numeric(15,2) jadi terbulat; achievement dihitung
  // dari nilai sebelum pembulatan. Bandingkan achievement ke formula penuh,
  // bukan ke expected_total yang sudah dibulatkan.
  check(
    `expected_total = target/wdTotal*elapsed = ${expectedFormula.toFixed(2)}, dapat ${et}`,
    Math.abs(Number(et) - expectedFormula) < 0.01,
  );
  check(
    `achievement = actual/expected*100 = ${((Number(at) / expectedFormula) * 100).toFixed(2)}, dapat ${ap}`,
    Math.abs(Number(ap) - (Number(at) / expectedFormula) * 100) < 0.05,
  );
  check("achievement bukan 0 lagi (dulu selalu 0)", Number(ap) > 0, `dapat ${ap}`);
}

console.log("\n=== 3. PATCH validasi ===");
{
  const report = psql(`SELECT id FROM daily_reports ORDER BY date LIMIT 1;`);

  const neg = await api("u-staff-001", "/api/daily-reports", {
    method: "PATCH",
    body: JSON.stringify({ id: report, value: -5 }),
  });
  check("nilai negatif ditolak", neg.status === 400, `status ${neg.status}`);
  check(`pesan sampai ke user (${JSON.stringify(neg.envelope?.error)})`, typeof neg.envelope?.error === "string");

  const nan = await api("u-staff-001", "/api/daily-reports", {
    method: "PATCH",
    body: JSON.stringify({ id: report, value: "abc" }),
  });
  check("nilai bukan angka ditolak", nan.status === 400, `status ${nan.status}`);

  const noId = await api("u-staff-001", "/api/daily-reports", {
    method: "PATCH",
    body: JSON.stringify({ value: 5 }),
  });
  check("tanpa id ditolak", noId.status === 400, `status ${noId.status}`);

  const ghost = await api("u-staff-001", "/api/daily-reports", {
    method: "PATCH",
    body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000", value: 5 }),
  });
  check("id tidak ada ditolak (404)", ghost.status === 404, `status ${ghost.status}`);
}

console.log("\n=== 4. PATCH: tidak bisa mengubah laporan orang lain ===");
{
  // formerly halaman menulis `.eq("id", id)` tanpa cek pemilik, jadi cukup
  // menebak id, staf biasa bisa mengubah laporannya orang lain.
  const victim = psql(
    `SELECT d.id, d.value FROM daily_reports d WHERE d.user_id='u-staff-001' LIMIT 1;`,
  );
  const [victimId, beforeValue] = victim.split("|");

  const attack = await api("u-staff-002", "/api/daily-reports", {
    method: "PATCH",
    body: JSON.stringify({ id: victimId, value: 999 }),
  });
  check("staf lain ditolak (403)", attack.status === 403, `status ${attack.status}`);
  check(`pesan sampai ke user (${JSON.stringify(attack.envelope?.error)})`, typeof attack.envelope?.error === "string");

  const afterValue = psql(`SELECT value FROM daily_reports WHERE id='${victimId}';`);
  check(`nilai korban tidak berubah (${beforeValue} -> ${afterValue})`, beforeValue === afterValue);

  const hr = await api("u-hr-001", "/api/daily-reports", {
    method: "PATCH",
    body: JSON.stringify({ id: victimId, value: 30, notes: "dikoreksi HR" }),
  });
  check("HR boleh mengoreksi (200)", hr.status === 200, `status ${hr.status}`);
  check(
    `nilai benar-benar berubah HR (${psql(`SELECT value FROM daily_reports WHERE id='${victimId}';`)})`,
    Number(psql(`SELECT value FROM daily_reports WHERE id='${victimId}';`)) === 30,
  );
}

console.log("\n=== 5. GET: userId dari client tidak bisa membuka laporan orang lain ===");
{
  // formerly `targetUser ?? (privileged ? undefined : me.id)` — kalau client
  // mengirim userId, targetUser selalu terisi dan cek privileged dilewati.
  //
  // Rentangnya mengikuti bulan fixture, bukan tanggal hard-coded.
  // `31` tidak boleh dipakai bulat-bulat: September hanya punya 30 hari,
  // dan `2026-09-31` membuat Postgres menolak seluruh query (500).
  const lastDay = new Date(PREV_YEAR, PREV_MONTH, 0).getDate();
  const from = `${PREV_PREFIX}-01`;
  const to = `${PREV_PREFIX}-${pad(lastDay)}`;

  const own = await api("u-staff-001", `/api/daily-reports?from=${from}&to=${to}`);
  check("laporan sendiri terbaca (200)", own.status === 200, `status ${own.status}`);
  check(
    `semua laporan milik sendiri (${own.body.reports?.length} baris)`,
    (own.body.reports?.length ?? 0) > 0,
  );

  const spoof = await api("u-staff-001", `/api/daily-reports?from=${from}&to=${to}&userId=u-staff-002`);
  check("userId orang lain ditolak (403)", spoof.status === 403, `status ${spoof.status}`);

  const spoof2 = await api("u-staff-001", `/api/daily-reports?from=${from}&to=${to}&userId=u-hr-001`);
  check("userId HR ditolak untuk staf (403)", spoof2.status === 403, `status ${spoof2.status}`);

  const scopeAll = await api("u-staff-001", `/api/daily-reports?from=${from}&to=${to}&scope=all`);
  check("scope=all ditolak untuk staf (403)", scopeAll.status === 403, `status ${scopeAll.status}`);

  const hrAll = await api("u-hr-001", `/api/daily-reports?from=${from}&to=${to}&scope=all`);
  check("HR boleh scope=all (200)", hrAll.status === 200, `status ${hrAll.status}`);
  check(
    `HR melihat laporan semua orang (${hrAll.body.reports?.length} >= ${own.body.reports?.length})`,
    (hrAll.body.reports?.length ?? 0) >= (own.body.reports?.length ?? 0),
  );

  const noAuth = await fetch(`${BASE}/api/daily-reports?from=${from}&to=${to}`);
  check("tanpa session ditolak (401)", noAuth.status === 401, `status ${noAuth.status}`);
}

console.log("\n=== 6. POST: tidak bisa lapor untuk assignment orang lain ===");
{
  const victim = psql(
    `SELECT ka.id FROM kpi_assignments ka
     JOIN users u ON u.id = ka.user_id
     JOIN departments d ON d.id = u.department_id
     WHERE u.id='u-staff-003' AND d.name='HYPE' AND ka.status='active' LIMIT 1;`,
  );

  if (!victim) {
    console.log("  INFO  tidak ada assignment untuk diuji");
  } else {
    const attack = await api("u-staff-001", "/api/daily-reports", {
      method: "POST",
      body: JSON.stringify({ assignmentId: victim, date: `${PREV_PREFIX}-07`, value: 50 }),
    });
    check("ditolak (403)", attack.status === 403, `status ${attack.status}`);
    const leaked = psql(
      `SELECT count(*) FROM daily_reports WHERE assignment_id='${victim}' AND user_id='u-staff-001';`,
    );
    check(`tidak ada baris tersimpan (${leaked})`, Number(leaked) === 0);
  }
}

console.log("\n=== 7. GET ?assignmentId: pemilik ditentukan server, bukan dari query ===");
{
  // formerly halaman /dashboard/tim/history mengirim `userId` dari state
  // browser, dan server hanya membandingkannya dengan `me.id`. Head yang
  // sah bisa membaca laporan divisinya — tapi begitu juga staf yang
  // mengganti `userId` dengan id orang lain.
  //
  // Sekarang pemilik diambil dari assignment-nya, lalu server yang
  // memutuskan apakah aktornya berhak.
  psql(`
    INSERT INTO kpis (title, description, type, unit, period, status, monthly_target,
                      year, month, created_by, department_id)
    VALUES ('ZZ Uji Kepemilikan', 'fixture', 'result', 'number', 'monthly',
            'active', 50, ${PREV_YEAR}, ${PREV_MONTH}, 'u-hr-001',
            (SELECT id FROM departments WHERE name='TNT'));
    INSERT INTO kpi_assignments (kpi_id, kpi_type, user_id, department_id, monthly_target,
      actual_total, expected_total, achievement_percentage, current_daily_target,
      working_days_total, working_days_elapsed, working_days_remaining, active_days,
      status, performance_category, year, month)
    SELECT id, 'result', 'u-staff-001', (SELECT id FROM departments WHERE name='TNT'), 50,
           0, 0, 0, 2, 22, 10, 12, 10, 'active', 'warning', ${PREV_YEAR}, ${PREV_MONTH}
    FROM kpis WHERE title='ZZ Uji Kepemilikan';
  `);

  const owned = psql(
    `SELECT ka.id FROM kpi_assignments ka JOIN kpis k ON k.id=ka.kpi_id
     WHERE k.title='ZZ Uji Kepemilikan' LIMIT 1;`,
  );

  const luar = psql(
    `SELECT ka.id FROM kpi_assignments ka
     JOIN users u ON u.id = ka.user_id
     JOIN departments d ON d.id = u.department_id
     WHERE u.id='u-staff-003' AND d.name='HYPE' AND ka.status='active' LIMIT 1;`,
  );

  // Pemilik sendiri boleh.
  const sendiri = await api("u-staff-001", `/api/daily-reports?assignmentId=${owned}`);
  check("pemilik sendiri boleh (200)", sendiri.status === 200, `status ${sendiri.status}`);

  // Head boleh melihat laporan divisinya (u-staff-001 ada di TNT).
  const head = await api("u-head-001", `/api/daily-reports?assignmentId=${owned}`);
  check(`Head boleh melihat laporan divisinya (${head.status})`, head.status === 200, `status ${head.status}`);

  // Head TIDAK boleh melihat laporan divisi lain.
  if (luar) {
    const headLuar = await api("u-head-001", `/api/daily-reports?assignmentId=${luar}`);
    check(`Head ditolak untuk divisi lain (${headLuar.status})`, headLuar.status === 403, `status ${headLuar.status}`);
    check(`pesan terbaca (${JSON.stringify(headLuar.envelope?.error)})`,
      typeof headLuar.envelope?.error === "string");
  }

  // Staf biasa yang bukan pemilik ditolak.
  const stafLain = await api("u-staff-002", `/api/daily-reports?assignmentId=${owned}`);
  check(`staf lain ditolak (${stafLain.status})`, stafLain.status === 403, `status ${stafLain.status}`);

  // userId hasil(req) yang tidak cocok denganyang sebenarnya harus ditolak,
  // bukan diam-diam diabaikan.
  const bobot = await api(
    "u-hr-001",
    `/api/daily-reports?assignmentId=${owned}&userId=u-staff-002`,
  );
  check(`userId tidak cocok ditolak (${bobot.status})`, bobot.status === 403, `status ${bobot.status}`);

  const cocok = await api(
    "u-hr-001",
    `/api/daily-reports?assignmentId=${owned}&userId=u-staff-001`,
  );
  check(`userId yang cocok diterima (${cocok.status})`, cocok.status === 200, `status ${cocok.status}`);

  const hilang = await api("u-hr-001", "/api/daily-reports?assignmentId=00000000-0000-4000-8000-000000000000");
  check(`assignment tidak ada → 404 (${hilang.status})`, hilang.status === 404, `status ${hilang.status}`);

  // Filter rentang tanggal.
  await api("u-staff-001", "/api/daily-reports", {
    method: "POST",
    body: JSON.stringify({ assignmentId: owned, date: D1, value: 3 }),
  });
  const semua = await api("u-staff-001", `/api/daily-reports?assignmentId=${owned}`);
  check(`tanpa rentang: semua laporan (${(semua.body?.reports ?? []).length})`,
    (semua.body?.reports ?? []).length === 1);

  const disaring = await api(
    "u-staff-001",
    `/api/daily-reports?assignmentId=${owned}&from=${PREV_PREFIX}-20&to=${PREV_PREFIX}-28`,
  );
  check(`dengan rentang lain: 0 baris (${(disaring.body?.reports ?? []).length})`,
    (disaring.body?.reports ?? []).length === 0, JSON.stringify(disaring.envelope).slice(0, 120));

  const dalam = await api(
    "u-staff-001",
    `/api/daily-reports?assignmentId=${owned}&from=${PREV_PREFIX}-01&to=${PREV_PREFIX}-10`,
  );
  check(`rentang mencakup tanggalnya: 1 baris (${(dalam.body?.reports ?? []).length})`,
    (dalam.body?.reports ?? []).length === 1);

  psql(`
    DELETE FROM daily_reports WHERE assignment_id='${owned}';
    DELETE FROM kpi_assignments WHERE id='${owned}';
    DELETE FROM kpis WHERE title='ZZ Uji Kepemilikan';
  `);
  check("fixture kepemilikan dibersihkan",
    psql("SELECT count(*) FROM kpis WHERE title='ZZ Uji Kepemilikan';") === "0");
}

console.log("\n=== 8. POST: tanggal & nilai divalidasi di server ===");
{
  // formerly `<input type="date" min max>` satu-satunya penjaga — dan itu
  // bisa dilewati dengan satu request biasa.
  //
  // Tanggal masa depan membuat `actual_total` sudah mengandung angka yang
  // belum terjadi; tanggal salah bulan masuk ke total tanpa pernah tampil
  // di kalender bulan itu.
  psql(`
    INSERT INTO kpis (title, description, type, unit, period, status, monthly_target,
                      year, month, created_by, department_id)
    VALUES ('ZZ Uji Validasi Tanggal', 'fixture', 'result', 'number', 'monthly',
            'active', 50, ${PREV_YEAR}, ${PREV_MONTH}, 'u-hr-001',
            (SELECT id FROM departments WHERE name='TNT'));
    INSERT INTO kpi_assignments (kpi_id, kpi_type, user_id, department_id, monthly_target,
      actual_total, expected_total, achievement_percentage, current_daily_target,
      working_days_total, working_days_elapsed, working_days_remaining, active_days,
      status, performance_category, year, month)
    SELECT id, 'result', 'u-staff-001', (SELECT id FROM departments WHERE name='TNT'), 50,
           0, 0, 0, 2, 22, 10, 12, 10, 'active', 'warning', ${PREV_YEAR}, ${PREV_MONTH}
    FROM kpis WHERE title='ZZ Uji Validasi Tanggal';
  `);

  const id = psql(
    `SELECT ka.id FROM kpi_assignments ka JOIN kpis k ON k.id=ka.kpi_id
     WHERE k.title='ZZ Uji Validasi Tanggal' LIMIT 1;`,
  );

  const besok = new Date();
  besok.setDate(besok.getDate() + 1);
  const besokStr = `${besok.getFullYear()}-${pad(besok.getMonth() + 1)}-${pad(besok.getDate())}`;

  for (const [label, date, value, expected] of [
    ["tanggal masa depan", besokStr, 5, 400],
    ["tanggal format salah", `${PREV_PREFIX}-5`, 5, 400],
    ["tanggal ngawur", "besok", 5, 400],
    ["nilai negatif", `${PREV_PREFIX}-08`, -3, 400],
    ["nilai bukan angka", `${PREV_PREFIX}-08`, "abc", 400],
  ]) {
    const r = await api("u-staff-001", "/api/daily-reports", {
      method: "POST",
      body: JSON.stringify({ assignmentId: id, date, value }),
    });
    check(`${label} → ${expected} (dapat ${r.status})`, r.status === expected, JSON.stringify(r.envelope).slice(0, 120));
    check(`  ${label}: pesan terbaca`,
      typeof r.envelope?.error === "string" && !r.envelope.error.includes("Terjadi kesalahan"),
      JSON.stringify(r.envelope?.error));
  }

  const bocor = psql(`SELECT count(*) FROM daily_reports WHERE assignment_id='${id}';`);
  check(`tidak ada baris tersimpan dari semua payloadan itu (${bocor})`, Number(bocor) === 0);

  // Bulan yang salah: assignment-nya bulan fixture.
  const bulanLain = PREV_MONTH === 1
    ? `${PREV_YEAR}-02-08`
    : `${PREV_YEAR}-01-08`;
  const salahBulan = await api("u-staff-001", "/api/daily-reports", {
    method: "POST",
    body: JSON.stringify({ assignmentId: id, date: bulanLain, value: 5 }),
  });
  check(`tanggal di luar bulan assignment ditolak (${salahBulan.status})`,
    salahBulan.status === 400, `status ${salahBulan.status}`);
  check(`pesan menyebut bulannya (${JSON.stringify(salahBulan.envelope?.error)})`,
    typeof salahBulan.envelope?.error === "string" && salahBulan.envelope.error.includes("bulan"));

  // Nilai valid tetap diterima.
  const ok = await api("u-staff-001", "/api/daily-reports", {
    method: "POST",
    body: JSON.stringify({ assignmentId: id, date: `${PREV_PREFIX}-08`, value: 9 }),
  });
  check(`tanggal & nilai valid diterima (${ok.status})`, ok.status === 200, JSON.stringify(ok.envelope).slice(0, 120));
  // Dibandingkan sebagai ANGKA, bukan sebagai teks.
  //
  // Bentuk teks sebuah numeric ditentukan oleh scale kolomnya, jadi
  // membandingkan dengan "9.00" akan gagal begitu scale-nya berubah --
  // dan test itu akan menyimpulkan datanya salah padahal yang tersimpan
  // benar. 0017 Thoroughly zmienia scale daily_reports.value ke 6.
  check("benar-benar tersimpan",
    Number(psql(`SELECT value FROM daily_reports WHERE assignment_id='${id}';`)) === 9);

  psql(`
    DELETE FROM daily_reports WHERE assignment_id='${id}';
    DELETE FROM kpi_assignments WHERE id='${id}';
    DELETE FROM kpis WHERE title='ZZ Uji Validasi Tanggal';
  `);
  check("fixture validasi dibersihkan",
    psql("SELECT count(*) FROM kpis WHERE title='ZZ Uji Validasi Tanggal';") === "0");
}

// Bersihkan + recalc supaya tidak meninggalkan total yang salah.
cleanupFixture();
psql("DELETE FROM daily_reports;");
check("sisa uji dibersihkan", psql("SELECT count(*) FROM daily_reports;") === "0");
check("fixture KPI ikut hilang", psql("SELECT count(*) FROM kpis WHERE title='ZZ Uji Laporan Harian';") === "0");
check("fixture assignment ikut hilang",
  psql(`SELECT count(*) FROM kpi_assignments WHERE kpi_id IN
        (SELECT id FROM kpis WHERE title='ZZ Uji Laporan Harian');`) === "0");

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
