/**
 * Verifikasi endpoint /api/kpi/quality terhadap database uji lokal.
 *
 * Ini yang menangkap bug yang tidak terlihat dari kompilator:
 * - angka yang salah (bukan cuma status 200)
 * - scoping yang bocor: Head bisa membaca/menilai divisi orang lain
 * - nilai yang tidak benar-benar tersimpan di database
 *
 * Jalankan: node scripts/verify-quality.mjs
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
  const out = execFileSync("node", ["scripts/local-dev-session.mjs", userId], {
    encoding: "utf8",
  });
  return out.trim().split(/\s+/).pop();
}

async function api(userId, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      cookie: `authjs.session-token=${token(userId)}`,
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
  // `withAuth` membungkus hasil sebagai { ok, data } — buka lapannya di sini
  // supaya test bisa memeriksa isi, bukan cuma status code.
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

console.log("\n=== 1. HR melihat semua KPI kualitas bulan ini ===");
{
  const expected = psql(
    `SELECT count(*) FROM kpi_assignments ka JOIN kpis k ON k.id=ka.kpi_id
     WHERE ka.year=${year} AND ka.month=${month} AND ka.status='active'
       AND ka.kpi_type IN ('quality','lead_tim');`,
  );
  const r = await api("u-hr-001", `/api/kpi/quality?scope=all&${q}`);
  check("status 200", r.status === 200, JSON.stringify(r.body).slice(0, 200));
  check(
    `jumlah baris ${r.body?.rows?.length} = hitungan DB ${expected}`,
    r.body?.rows?.length === Number(expected),
  );
  check("ada userName yang terisi", r.body.rows.every((x) => x.userName && x.userName !== "Unknown"));
  check("punya kpiBrand (kolom migrasi 0011)", r.body.rows.every((x) => "kpiBrand" in x));
  check("punya kpiType", r.body.rows.every((x) => ["quality", "lead_tim"].includes(x.kpiType)));
}

console.log("\n=== 2. Division: user di divisi saja ===");
{
  const r = await api("u-staff-001", `/api/kpi/quality?scope=self&${q}`);
  check("staf biasa ditolak (403)", r.status === 403, `status ${r.status}`);
}

console.log("\n=== 3. Head: hanya divisi yang dikelola + dirinya sendiri ===");
{
  const managed = psql("SELECT managed_departments::text FROM users WHERE id='u-head-001';");
  console.log(`        managed_departments(u-head-001) = ${managed}`);

  const r = await api("u-head-001", `/api/kpi/quality?scope=managed&${q}`);
  check("status 200", r.status === 200, JSON.stringify(r.body).slice(0, 200));

  const foreign = psql(
    `SELECT ka.id FROM kpi_assignments ka
     WHERE ka.year=${year} AND ka.month=${month} AND ka.status='active'
       AND ka.kpi_type IN ('quality','lead_tim')
       AND ka.department_id IS NOT NULL
       AND NOT (ka.department_id::text = ANY (
             SELECT jsonb_array_elements_text(managed_departments)
             FROM users WHERE id='u-head-001'));`,
  );

  if (foreign) {
    const leaked = r.body.rows.some((x) => x.assignmentId === foreign);
    check("tidak membocorkan assignment divisi lain", !leaked, `assignmentId ${foreign}`);
  } else {
    console.log("  INFO  tidak ada assignment di divisi lain untuk dibandingkan");
  }

  const own = r.body.rows.filter((x) => x.userId === "u-head-001");
  check("KPI miliknya sendiri terlihat", own.length > 0, `${own.length} baris`);
}

console.log("\n=== 4. Head boleh menilai assignment divisinya sendiri ===");
{
  const own = psql(
    `SELECT ka.id FROM kpi_assignments ka JOIN users u ON u.id = ka.user_id
     JOIN departments d ON d.id = u.department_id
     WHERE ka.year=${year} AND ka.month=${month} AND ka.status='active'
       AND u.id='u-staff-001' AND d.name='TNT'
       AND ka.kpi_type IN ('quality','lead_tim') LIMIT 1;`,
  );

  if (!own) {
    console.log("  INFO  tidak ada assignment di divisi yang dikelola");
  } else {
    const r = await api("u-head-001", "/api/kpi/quality", {
      method: "PUT",
      body: JSON.stringify({ assignmentId: own, year, month, actualTotal: 71 }),
    });
    check("diterima (status 200)", r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);

    const stored = psql(
      `SELECT actual_total FROM monthly_scores
       WHERE assignment_id='${own}' AND year=${year} AND month=${month};`,
    );
    check(`benar-benar tersimpan (${stored})`, Number(stored) === 71);

    psql(`DELETE FROM monthly_scores WHERE assignment_id='${own}' AND year=${year} AND month=${month};`);
  }
}

console.log("\n=== 5. Head TIDAK boleh menilai assignment divisi lain ===");
{
  // u-staff-003 ada di HYPE, sedangkan u-head-001 hanya mengelola TNT.
  const foreign = psql(
    `SELECT ka.id FROM kpi_assignments ka
     JOIN users u ON u.id = ka.user_id
     JOIN departments d ON d.id = u.department_id
     WHERE ka.year=${year} AND ka.month=${month} AND ka.status='active'
       AND u.id = 'u-staff-003' AND d.name = 'HYPE'
       AND ka.kpi_type IN ('quality','lead_tim')
     LIMIT 1;`,
  );

  if (!foreign) {
    console.log("  INFO  tidak ada assignment target untuk diuji");
  } else {
    const r = await api("u-head-001", "/api/kpi/quality", {
      method: "PUT",
      body: JSON.stringify({
        assignmentId: foreign,
        year,
        month,
        actualTotal: 99,
        notes: "percobaan yang harus ditolak server",
      }),
    });
    const rejected = r.status !== 200 || r.body?.ok === false || r.body?.error;
    check("server menolak (bukan diam-diam 200)", rejected, `status ${r.status}`);

    const stored = psql(
      `SELECT coalesce(max(actual_total), 0) FROM monthly_scores
       WHERE assignment_id='${foreign}' AND year=${year} AND month=${month};`,
    );
    check(`tidak ada tersimpan (max actual_total = ${stored})`, Number(stored) === 0);
  }
}

console.log("\n=== 6. Menyimpan nilai benar-benar menulis ke database ===");
{
  const target = psql(
    `SELECT ka.id FROM kpi_assignments ka
     WHERE ka.year=${year} AND ka.month=${month} AND ka.status='active'
       AND ka.kpi_type IN ('quality','lead_tim') AND ka.user_id='u-staff-001'
     LIMIT 1;`,
  );

  const r = await api("u-hr-001", "/api/kpi/quality", {
    method: "PUT",
    body: JSON.stringify({
      assignmentId: target,
      year,
      month,
      actualTotal: 87.5,
      notes: "verifikasi otomatis batch quality",
    }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.body).slice(0, 200));

  const row = psql(
    `SELECT actual_total, monthly_target, achievement_percentage, notes, inputted_by
     FROM monthly_scores
     WHERE assignment_id='${target}' AND year=${year} AND month=${month};`,
  );
  const [actual, target_, pct, notes, by] = row.split("|");
  console.log(`        monthly_scores: ${row}`);

  check(`actual_total = 87.50 (tertulis: ${actual})`, Number(actual) === 87.5);
  check(`monthly_target ikut tertulis (tidak 0) — ${target_}`, Number(target_) > 0);
  check(
    `percentage dihitung server = ${Number(actual) / Number(target_) * 100} vs tersimpan ${Number(pct).toFixed(2)}`,
    Math.abs(Number(pct) - (Number(actual) / Number(target_)) * 100) < 0.01,
  );
  check(`catatan tersimpan (${notes})`, notes.length > 0);
  check(`inputted_by = u-hr-001 (${by})`, by === "u-hr-001");

  const mirrored = psql(
    `SELECT actual_total, achievement_percentage FROM kpi_assignments WHERE id='${target}';`,
  );
  check(
    `kpi_assignments ikut sinkron — ${mirrored}`,
    Number(mirrored.split("|")[0]) === 87.5,
  );

  // Percentage harus menolak nilai di luar 0-100 lewat jalur biasa,
  // dan angkanya harus kembali dihitung ulang dari DB.
  const reread = await api("u-hr-001", `/api/kpi/quality?scope=all&${q}`);
  const back = reread.body.rows.find((x) => x.assignmentId === target);
  check("API mengembalikan nilai yang sama dengan DB", back?.actualTotal === 87.5, `dapat ${back?.actualTotal}`);

  // Bersihkan supaya test bisa diulang. `kpi_assignments` ikut dinolkan
  // karena `listQualityRows` jatuh ke kolom denormalisasi itu kalau baris
  // monthly_scores tidak ada — sisa uji kalau tidak direset.
  psql(
    `DELETE FROM monthly_scores WHERE assignment_id='${target}' AND year=${year} AND month=${month};
     UPDATE kpi_assignments SET actual_total = 0, achievement_percentage = 0 WHERE id='${target}';`,
  );
  const after = await api("u-hr-001", `/api/kpi/quality?scope=all&${q}`);
  const clean = after.body.rows.find((x) => x.assignmentId === target);
  check(
    `sisa uji terhapus (kembali ke 0, bukan 87.5) — dapat ${clean?.actualTotal}`,
    clean?.actualTotal === 0 && clean?.hasScore === false,
  );
  console.log("        (baris uji dihapus supaya bisa diulang)");
}

console.log("\n=== 7. Evaluasi HR: filter tipe lead_tim + hr ===");
{
  const r = await api("u-hr-001", `/api/kpi/quality?scope=all&kpiTypes=lead_tim,hr&${q}`);
  check("status 200", r.status === 200, JSON.stringify(r.body).slice(0, 200));
  check(
    "semua baris bertipe lead_tim atau hr",
    r.body.rows.every((x) => ["lead_tim", "hr"].includes(x.kpiType)),
    JSON.stringify(r.body.rows.map((x) => x.kpiType)),
  );
}

console.log("\n=== 8. Nilai tidak boleh negatif / bukan angka ===");
{
  const target = psql(
    `SELECT ka.id FROM kpi_assignments ka
     WHERE ka.year=${year} AND ka.month=${month} AND ka.status='active'
       AND ka.kpi_type IN ('quality','lead_tim') AND ka.user_id='u-hr-001' LIMIT 1;`,
  );

  const neg = await api("u-hr-001", "/api/kpi/quality", {
    method: "PUT",
    body: JSON.stringify({ assignmentId: target, year, month, actualTotal: -5 }),
  });
  check("nilai negatif ditolak", neg.status !== 200 || neg.body?.error, `status ${neg.status}`);

  const nan = await api("u-hr-001", "/api/kpi/quality", {
    method: "PUT",
    body: JSON.stringify({ assignmentId: target, year, month, actualTotal: "abc" }),
  });
  check("nilai non-angka ditolak", nan.status === 400, `status ${nan.status}`);
}

console.log("\n=== 9. Month di luar 1-12 ditolak ===");
{
  const r = await api("u-hr-001", `/api/kpi/quality?scope=all&year=${year}&month=13`);
  check("status 400", r.status === 400, `status ${r.status}`);
  check(
    `pesan error benar sampai ke client (${JSON.stringify(r.envelope?.error)})`,
    typeof r.envelope?.error === "string" && r.envelope.error.length > 0,
  );
}

console.log("\n=== 10. Penolakan lain: divisi bukan milik Head, scope tak dikenal ===");
{
  const deptId = psql("SELECT id FROM departments WHERE name = 'HYPE';");
  const r = await api("u-head-001", `/api/kpi/quality?scope=managed&departmentId=${deptId}&${q}`);
  check("divisi HYPE ditolak untuk Head (403)", r.status === 403, `status ${r.status}`);
  check(
    `pesan sampai ke client (${JSON.stringify(r.envelope?.error)})`,
    typeof r.envelope?.error === "string",
  );

  const bad = await api("u-hr-001", `/api/kpi/quality?scope=ngawur&${q}`);
  check("scope tak dikenal ditolak (400)", bad.status === 400, `status ${bad.status}`);

  const noPerm = await api("u-staff-001", `/api/kpi/quality?scope=all&${q}`);
  check("scope=all ditolak untuk staf biasa (403)", noPerm.status === 403, `status ${noPerm.status}`);
}

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
