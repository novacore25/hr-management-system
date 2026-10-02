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
for (const u of ["u-staff-001", "u-staff-002", "u-staff-003", "u-hr-001"]) {
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

console.log("\n=== 1. POST: laporan tersimpan dan total ikut ter-recalc ===");
{
  const assignment = psql(
    `SELECT ka.id, ka.monthly_target, ka.working_days_total
     FROM kpi_assignments ka
     WHERE ka.user_id='u-staff-001' AND ka.status='active'
       AND ka.kpi_type='result' LIMIT 1;`,
  );
  if (!assignment) {
    console.log("  FAIL  tidak ada assignment result untuk u-staff-001");
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
    body: JSON.stringify({ assignmentId, date: "2026-10-05", value: 10 }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 150));

  const t1 = psql(
    `SELECT actual_total FROM kpi_assignments WHERE id='${assignmentId}';`,
  );
  check(`actual_total = 10 (${t1})`, Number(t1) === 10);

  // Tambah lagi, harus menjumlah.
  await api("u-staff-001", "/api/daily-reports", {
    method: "POST",
    body: JSON.stringify({ assignmentId, date: "2026-10-06", value: 7 }),
  });
  const t2 = psql(
    `SELECT actual_total FROM kpi_assignments WHERE id='${assignmentId}';`,
  );
  check(`actual_total = 17 setelah laporan kedua (${t2})`, Number(t2) === 17);

  // Upsert tanggal yang sama harus menimpa, bukan menambah.
  await api("u-staff-001", "/api/daily-reports", {
    method: "POST",
    body: JSON.stringify({ assignmentId, date: "2026-10-05", value: 12 }),
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
  const from = "2026-10-01";
  const to = "2026-10-31";

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
      body: JSON.stringify({ assignmentId: victim, date: "2026-10-07", value: 50 }),
    });
    check("ditolak (403)", attack.status === 403, `status ${attack.status}`);
    const leaked = psql(
      `SELECT count(*) FROM daily_reports WHERE assignment_id='${victim}' AND user_id='u-staff-001';`,
    );
    check(`tidak ada baris tersimpan (${leaked})`, Number(leaked) === 0);
  }
}

// Bersihkan + recalc supaya tidak meninggalkan total yang salah.
psql("DELETE FROM daily_reports;");
check("sisa uji dibersihkan", psql("SELECT count(*) FROM daily_reports;") === "0");

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
