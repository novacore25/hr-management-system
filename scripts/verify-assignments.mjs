/**
 * Verifikasi penugasan KPI: scoping, otorisasi, dan nilai yang benar-benar
 * tersimpan di database.
 *
 * Jalankan: node scripts/verify-assignments.mjs
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
for (const u of ["u-hr-001", "u-head-001", "u-staff-001", "u-staff-003", "u-exec-001"]) {
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

const year = 2026;
const month = 10;
const q = `year=${year}&month=${month}`;

// KPI uji: dibuat khusus supaya test tidak bergantung pada seed.
const testKpiTitle = "ZZ Uji Ototisasi Penugasan";
const testKpiId = (() => {
  const existing = psql(
    `SELECT id FROM kpis WHERE title = '${testKpiTitle}' AND year=${year} AND month=${month};`,
  );
  if (existing) {
    psql(`DELETE FROM kpi_assignments WHERE kpi_id='${existing}'; DELETE FROM kpis WHERE id='${existing}';`);
  }
  psql(
    `INSERT INTO kpis (title, type, unit, period, status, monthly_target, year, month, created_by)
     VALUES ('${testKpiTitle}','result','number','monthly','draft', 100, ${year}, ${month},'u-hr-001');`,
  );
  return psql(
    `SELECT id FROM kpis WHERE title = '${testKpiTitle}' AND year=${year} AND month=${month};`,
  );
})();

const deptTnt = psql("SELECT id FROM departments WHERE name='TNT';");
const deptHype = psql("SELECT id FROM departments WHERE name='HYPE';");

console.log(`\nKPI uji: ${testKpiId} (status awal: draft)`);

console.log("\n=== 1. GET scope=managed: Head hanya melihat divisinya sendiri ===");
{
  const r = await api("u-head-001", `/api/assignments?scope=managed&status=active,hold,cancelled&${q}`);
  check("status 200", r.status === 200, JSON.stringify(r.body).slice(0, 150));

  const rows = r.body.assignments ?? [];
  const foreign = rows.filter((a) => a.userId === "u-staff-003");
  check(
    `tidak memuat user divisi lain (${rows.length} baris, ${foreign.length} dari HYPE)`,
    foreign.length === 0,
    JSON.stringify(foreign.map((a) => a.userId)),
  );

  const ownTeam = rows.filter((a) => a.userId === "u-staff-001" || a.userId === "u-staff-002");
  check("memuat user divisi yang dikelola", ownTeam.length > 0, `${ownTeam.length} baris`);

  const selfRows = rows.filter((a) => a.userId === "u-head-001");
  check(`KPI Head sendiri ikut terlihat (${selfRows.length})`, selfRows.length > 0);
}

console.log("\n=== 2. GET scope=department: Head tidak boleh menunjuk divisi lain ===");
{
  const ok = await api("u-head-001", `/api/assignments?scope=department&departmentId=${deptTnt}&${q}`);
  check("divisi sendiri boleh (200)", ok.status === 200, `status ${ok.status}`);

  const no = await api("u-head-001", `/api/assignments?scope=department&departmentId=${deptHype}&${q}`);
  check("divisi HYPE ditolak (403)", no.status === 403, `status ${no.status}`);
  check(`pesan sampai ke client (${JSON.stringify(no.envelope?.error)})`, typeof no.envelope?.error === "string");

  const hrOk = await api("u-hr-001", `/api/assignments?scope=department&departmentId=${deptHype}&${q}`);
  check("HR boleh membaca divisi mana pun (200)", hrOk.status === 200, `status ${hrOk.status}`);

  const staffTry = await api("u-staff-001", `/api/assignments?scope=department&departmentId=${deptTnt}&${q}`);
  check("staf biasa ditolak (403)", staffTry.status === 403, `status ${staffTry.status}`);
}

console.log("\n=== 3. GET /api/users?scope=managed ===");
{
  const r = await api("u-head-001", "/api/users?scope=managed");
  check("status 200", r.status === 200, JSON.stringify(r.body).slice(0, 150));

  const ids = (r.body.users ?? []).map((u) => u.id);
  check("tidak memuat user HYPE (u-staff-003)", !ids.includes("u-staff-003"), JSON.stringify(ids));
  check("memuat user TNT (u-staff-001)", ids.includes("u-staff-001"));
  check("memuat Head-nya sendiri", ids.includes("u-head-001"));

  const staffTry = await api("u-staff-001", "/api/users?scope=managed");
  check("staf biasa ditolak (403)", staffTry.status === 403, `status ${staffTry.status}`);
}

console.log("\n=== 4. POST: Head boleh menugaskan ke divisinya, dan KPI draft ikut aktif ===");
{
  const before = psql(`SELECT status FROM kpis WHERE id='${testKpiId}';`);
  check(`status KPI awal = draft (${before})`, before === "draft");

  const r = await api("u-head-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-staff-001", monthlyTarget: 40, year, month },
    ]),
  });
  check("status 200", r.status === 200, JSON.stringify(r.body).slice(0, 200));
  check(`created = 1 (dapat ${r.body?.created})`, r.body?.created === 1);

  const stored = psql(
    `SELECT user_id, department_id, monthly_target, status, assigned_by, working_days_total
     FROM kpi_assignments WHERE kpi_id='${testKpiId}';`,
  );
  console.log(`        assignment: ${stored}`);
  const [uid, deptId, target, status, by, wd] = stored.split("|");
  check(`user_id benar (${uid})`, uid === "u-staff-001");
  check(
    `department_id diambil dari users.department_id, bukan dari client (${deptId})`,
    deptId === deptTnt,
  );
  check(`monthly_target = 40 (${target})`, Number(target) === 40);
  check(`status = active (${status})`, status === "active");
  check(`assigned_by = u-head-001 (${by})`, by === "u-head-001");
  check(`working_days_total terisi (${wd})`, Number(wd) > 0);

  const kpiAfter = psql(`SELECT status FROM kpis WHERE id='${testKpiId}';`);
  check(`KPI draft otomatis diaktifkan (${kpiAfter})`, kpiAfter === "active");

  // Total KPI-level harus ikut ter-recalc
  const kpiTarget = psql(`SELECT monthly_target FROM kpis WHERE id='${testKpiId}';`);
  check(`kpis.monthly_target di-recalc jadi 40 (${kpiTarget})`, Number(kpiTarget) === 40);
}

console.log("\n=== 5. POST: Head DITOLAK untuk user di luar divisinya ===");
{
  const r = await api("u-head-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-staff-003", monthlyTarget: 50, year, month },
    ]),
  });
  check("ditolak (403)", r.status === 403, `status ${r.status}`);
  check(`pesan sampai ke client (${JSON.stringify(r.envelope?.error)})`, typeof r.envelope?.error === "string");

  const leaked = psql(
    `SELECT count(*) FROM kpi_assignments WHERE kpi_id='${testKpiId}' AND user_id='u-staff-003';`,
  );
  check(`tidak ada baris tersimpan (${leaked})`, Number(leaked) === 0);
}

console.log("\n=== 6. POST: validasi input ===");
{
  const bad = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-staff-002", monthlyTarget: -5, year, month },
    ]),
  });
  check("target negatif ditolak", bad.status !== 200 || bad.envelope?.ok === false, `status ${bad.status}`);

  const zero = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-staff-002", monthlyTarget: 0, year, month },
    ]),
  });
  check("target 0 ditolak", zero.status !== 200 || zero.envelope?.ok === false, `status ${zero.status}`);

  const ghostUser = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-hantu", monthlyTarget: 10, year, month },
    ]),
  });
  check("user tidak dikenal ditolak", ghostUser.status === 400, `status ${ghostUser.status}`);

  const ghostKpi = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: "00000000-0000-0000-0000-000000000000", userId: "u-staff-002", monthlyTarget: 10, year, month },
    ]),
  });
  check("KPI tidak dikenal ditolak dengan 400", ghostKpi.status === 400, `status ${ghostKpi.status}`);
  check(
    `pesan menyebut KPI, bukan "Terjadi kesalahan" (${JSON.stringify(ghostKpi.envelope?.error)})`,
    typeof ghostKpi.envelope?.error === "string" && !ghostKpi.envelope.error.includes("Terjadi kesalahan"),
  );

  const badMonth = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-staff-002", monthlyTarget: 10, year, month: 13 },
    ]),
  });
  check("month 13 ditolak", badMonth.status === 400, `status ${badMonth.status}`);
}

console.log("\n=== 7. POST: periode harus cocok dengan periode KPI ===");
{
  // formerly `year`/`month` dibaca dari `body` yang berupa array → undefined
  // → jatuh ke bulan berjalan. Bulk import untuk bulan lain menulis ke bulan
  // yang salah tanpa error, dan `kpis.monthlyTarget` ikut bercampur karena
  // di-recalc dari SUM seluruh assignment KPI itu tanpa filter periode.
  const r = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-staff-002", monthlyTarget: 33, year: 2025, month: 5 },
    ]),
  });
  check("ditolak karena periode KPI berbeda", r.status === 400, `status ${r.status}`);
  check(
    `pesan menyebut periode yang benar (${JSON.stringify(r.envelope?.error)})`,
    typeof r.envelope?.error === "string" && r.envelope.error.includes("2026-10"),
  );

  const leaked = psql(
    `SELECT count(*) FROM kpi_assignments WHERE kpi_id='${testKpiId}' AND user_id='u-staff-002';`,
  );
  check(`tidak ada baris tersimpan (${leaked})`, Number(leaked) === 0);

  // Periode yang benar harus diterima.
  const ok = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-staff-002", monthlyTarget: 33, year, month },
    ]),
  });
  check("periode yang cocok diterima", ok.status === 200, `status ${ok.status}`);
  const stored = psql(
    `SELECT year, month FROM kpi_assignments WHERE kpi_id='${testKpiId}' AND user_id='u-staff-002';`,
  );
  check(`tertulis di 2026-10 (${stored})`, stored === `${year}|${month}`);
}

console.log("\n=== 7b. Bentuk payload { year, month, rows } (yang dipakai form) ===");
{
  // formerly form mengirim array dan meletakkan year/month di elemen
  // terakhir. Server membaca `body[0]` — yang tidak punya year/month —
  // jadi jatuh ke bulan berjalan dan penugasan November ditolak sebagai
  // "bukan 2026-10". Form yang benar selalu gagal.
  const novKpiTitle = "ZZ Uji Periode November";
  psql(`DELETE FROM kpi_assignments WHERE kpi_id IN (SELECT id FROM kpis WHERE title='${novKpiTitle}'); DELETE FROM kpis WHERE title='${novKpiTitle}';`);
  psql(
    `INSERT INTO kpis (title, type, unit, period, status, monthly_target, year, month, created_by)
     VALUES ('${novKpiTitle}','result','number','monthly','draft', 50, 2026, 11, 'u-hr-001');`,
  );
  const novKpiId = psql(`SELECT id FROM kpis WHERE title='${novKpiTitle}';`);

  const r = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify({
      year: 2026,
      month: 11,
      rows: [{ kpiId: novKpiId, userId: "u-staff-001", monthlyTarget: 25 }],
    }),
  });
  check("diterima", r.status === 200, JSON.stringify(r.body).slice(0, 150));

  const stored = psql(
    `SELECT year, month, monthly_target FROM kpi_assignments WHERE kpi_id='${novKpiId}';`,
  );
  check(`tertulis di 2026-11 (${stored})`, stored === "2026|11|25.00");

  // Bentuk legacy: array dengan year/month di elemen terakhir.
  psql(`DELETE FROM kpi_assignments WHERE kpi_id='${novKpiId}';`);
  const legacy = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: novKpiId, userId: "u-staff-001", monthlyTarget: 25 },
      { year: 2026, month: 11 },
    ]),
  });
  check("bentuk legacy (year di elemen terakhir) juga benar", legacy.status === 200, `status ${legacy.status}`);
  const stored2 = psql(
    `SELECT year, month FROM kpi_assignments WHERE kpi_id='${novKpiId}';`,
  );
  check(`tertulis di 2026-11 (${stored2})`, stored2 === "2026|11");

  psql(`DELETE FROM kpi_assignments WHERE kpi_id='${novKpiId}'; DELETE FROM kpis WHERE id='${novKpiId}';`);
}

console.log("\n=== 8. PATCH: set-status dan set-target, termasuk audit trail ===");
{
  const id = psql(
    `SELECT id FROM kpi_assignments WHERE kpi_id='${testKpiId}' AND user_id='u-staff-001';`,
  );

  const hold = await api("u-head-001", "/api/assignments", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "set-status", status: "hold" }),
  });
  check("hold diterima", hold.status === 200, `status ${hold.status}`);

  const held = psql(
    `SELECT status, held_at IS NOT NULL AS ada_waktu FROM kpi_assignments WHERE id='${id}';`,
  );
  check(`status=hold dan held_at terisi (${held})`, held === "hold|t");

  const back = await api("u-head-001", "/api/assignments", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "set-status", status: "active" }),
  });
  check("kembali ke active", back.status === 200, `status ${back.status}`);
  check(
    `status=active (${psql(`SELECT status FROM kpi_assignments WHERE id='${id}';`)})`,
    psql(`SELECT status FROM kpi_assignments WHERE id='${id}';`) === "active",
  );

  const target = await api("u-head-001", "/api/assignments", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "set-target", monthlyTarget: 55 }),
  });
  check("set-target diterima", target.status === 200, `status ${target.status}`);
  check(
    `monthly_target = 55 (${psql(`SELECT monthly_target FROM kpi_assignments WHERE id='${id}';`)})`,
    Number(psql(`SELECT monthly_target FROM kpi_assignments WHERE id='${id}';`)) === 55,
  );
  // Total KPI-level = SUM seluruh assignment aktif untuk KPI itu, jadi di
  // sini bukan 55: u-staff-002 juga punya assignment 33 dari langkah 7.
  const expectedTotal =
    Number(psql(`SELECT monthly_target FROM kpi_assignments WHERE id='${id}';`)) +
    Number(
      psql(
        `SELECT coalesce(sum(monthly_target),0) FROM kpi_assignments
         WHERE kpi_id='${testKpiId}' AND status <> 'cancelled' AND id <> '${id}';`,
      ),
    );
  const kpiTotal = Number(
    psql(`SELECT monthly_target FROM kpis WHERE id='${testKpiId}';`),
  );
  check(
    `kpis.monthly_target = SUM assignment aktif (${kpiTotal}, diharapkan ${expectedTotal})`,
    kpiTotal === expectedTotal,
  );

  const hist = psql(
    `SELECT count(*) FROM kpi_histories WHERE assignment_id='${id}';`,
  );
  check(`audit trail tercatat (${hist} baris)`, Number(hist) >= 3);

  const badStatus = await api("u-head-001", "/api/assignments", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "set-status", status: "ngawur" }),
  });
  check("status tak dikenal ditolak", badStatus.status === 400, `status ${badStatus.status}`);

  const badTarget = await api("u-head-001", "/api/assignments", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "set-target", monthlyTarget: 0 }),
  });
  check("target 0 ditolak", badTarget.status === 400, `status ${badTarget.status}`);

  const noId = await api("u-head-001", "/api/assignments", {
    method: "PATCH",
    body: JSON.stringify({ action: "set-status", status: "hold" }),
  });
  check("tanpa id ditolak", noId.status === 400, `status ${noId.status}`);
}

console.log("\n=== 9. PATCH: Head tidak boleh mengubah assignment divisi lain ===");
{
  // u-staff-003 ada di HYPE, u-head-001 hanya mengelola TNT.
  const foreign = (() => {
    const kpiId = (() => {
      const row = psql(
        `SELECT ka.kpi_id FROM kpi_assignments ka
         JOIN users u ON u.id = ka.user_id JOIN departments d ON d.id = u.department_id
         WHERE ka.user_id='u-staff-003' AND d.name='HYPE'
           AND ka.kpi_type IN ('quality','lead_tim') LIMIT 1;`,
      );
      return row;
    })();

    if (!kpiId) return null;

    return psql(
      `SELECT ka.id FROM kpi_assignments ka WHERE ka.kpi_id='${kpiId}' AND ka.user_id='u-staff-003' LIMIT 1;`,
    );
  })();

  if (!foreign) {
    console.log("  INFO  tidak ada assignment di divisi lain untuk diuji");
  } else {
    const before = psql(`SELECT status, monthly_target FROM kpi_assignments WHERE id='${foreign}';`);
    const r = await api("u-head-001", "/api/assignments", {
      method: "PATCH",
      body: JSON.stringify({ id: foreign, action: "set-status", status: "cancelled" }),
    });
    check("ditolak (403)", r.status === 403, `status ${r.status}`);
    check(
      `pesan sampai ke client (${JSON.stringify(r.envelope?.error)})`,
      typeof r.envelope?.error === "string",
    );
    const after = psql(`SELECT status, monthly_target FROM kpi_assignments WHERE id='${foreign}';`);
    check(`tidak berubah (${before} -> ${after})`, before === after);
  }
}

console.log("\n=== 10. Staf biasa tidak boleh menulis assignment ===");
{
  const id = psql(
    `SELECT id FROM kpi_assignments WHERE kpi_id='${testKpiId}' AND user_id='u-staff-001';`,
  );

  const patch = await api("u-staff-001", "/api/assignments", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "set-status", status: "cancelled" }),
  });
  check("PATCH ditolak (403)", patch.status === 403, `status ${patch.status}`);

  const post = await api("u-staff-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-staff-002", monthlyTarget: 10, year, month },
    ]),
  });
  check("POST ditolak (403)", post.status === 403, `status ${post.status}`);
}

console.log("\n=== 11. Bobot KPI (kpi-settings) untuk Head ===");
{
  // formerly halaman head/penugasan memakai scope=all, yang menolak Head
  // dengan 403. Skor timnya lalu diam-diam memakai DEFAULT_WEIGHTS, bukan
  // bobot yang disetel HR. Tidak ada error, cuma angka yang beda.
  const asHead = await api("u-head-001", "/api/kpi-settings?scope=managed");
  check("scope=managed diterima untuk Head", asHead.status === 200, JSON.stringify(asHead.body).slice(0, 150));

  const ids = Object.keys(asHead.body.weights ?? {});
  check(`memuat user tim yang dikelola (${ids.join(", ")})`, ids.includes("u-staff-001"));
  check("tidak memuat user divisi lain", !ids.includes("u-staff-003"), JSON.stringify(ids));

  // Bobot yang benar-benar tersimpan harus ikut muncul, bukan default.
  const saved = psql(
    `SELECT result_weight, activity_weight, quality_weight FROM kpi_settings WHERE user_id='u-staff-001';`,
  );
  const [r_, a_, q_] = saved.split("|").map(Number);
  const w = asHead.body.weights["u-staff-001"];
  check(
    `bobot asli ikut terbaca (${r_}/${a_}/${q_}), bukan default 50/30/20`,
    w && w.result === r_ && w.activity === a_ && w.quality === q_,
    JSON.stringify(w),
  );

  const all = await api("u-head-001", "/api/kpi-settings?scope=all");
  check("scope=all tetap menolak Head", all.status === 403, `status ${all.status}`);

  const single = await api("u-head-001", `/api/kpi-settings?userId=u-staff-003`);
  check("Head tidak boleh baca bobot user luar timnya", single.status === 403, `status ${single.status}`);

  const own = await api("u-head-001", `/api/kpi-settings?userId=u-staff-001`);
  check("Head boleh baca bobot user divisinya", own.status === 200, `status ${own.status}`);

  const staffTry = await api("u-staff-001", "/api/kpi-settings?scope=managed");
  check("staf biasa ditolak", staffTry.status === 403, `status ${staffTry.status}`);
}

console.log("\n=== 12. Duplikat di-skip, bukan error ===");
{
  const r = await api("u-hr-001", "/api/assignments", {
    method: "POST",
    body: JSON.stringify([
      { kpiId: testKpiId, userId: "u-staff-001", monthlyTarget: 55, year, month },
    ]),
  });
  check(`skipped, bukan error (created=${r.body?.created} skipped=${r.body?.skipped})`, r.body?.skipped === 1);
  const count = psql(
    `SELECT count(*) FROM kpi_assignments WHERE kpi_id='${testKpiId}' AND user_id='u-staff-001';`,
  );
  check(`tetap satu baris (${count})`, Number(count) === 1);
}

// Bersihkan semua jejak uji.
psql(`DELETE FROM kpi_assignments WHERE kpi_id='${testKpiId}'; DELETE FROM kpis WHERE id='${testKpiId}';`);
const leftovers = psql(`SELECT count(*) FROM kpis WHERE title = '${testKpiTitle}';`);
check(`sisa data uji dibersihkan (${leftovers})`, Number(leftovers) === 0);

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
