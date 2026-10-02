/**
 * Verifikasi /dashboard/hr/employees dan /dashboard/head/kpi-setup.
 *
 * Fokus:
 * - managed_departments diisi dengan ID (bukan NAMA) dan benar-benar
 *   diterima server
 * - role KPI tidak bisa diubah oleh selain HR/Executive
 * - Head hanya bisa menyentuh KPI di divisinya
 * - soft delete KPI membatalkan penugasannya sekalian
 *
 * Jalankan: node scripts/verify-admin-kpi.mjs
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
  "u-hr-001",
  "u-head-001",
  "u-staff-001",
  "u-exec-001",
  "u-dev-001",
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

// Bersihkan sisa uji.
psql(`
  UPDATE users SET kpi_role='tim', managed_departments='[]'::jsonb WHERE id='u-staff-002';
  UPDATE kpis SET status='active' WHERE title='ZZ Uji Hapus KPI';
  DELETE FROM kpi_assignments WHERE kpi_id IN (SELECT id FROM kpis WHERE title='ZZ Uji Hapus KPI');
  DELETE FROM kpis WHERE title='ZZ Uji Hapus KPI';
`);

const tnt = psql("SELECT id FROM departments WHERE name='TNT';");
const hype = psql("SELECT id FROM departments WHERE name='HYPE';");

console.log("\n=== 1. PATCH /api/users: managed_departments diisi ID ===");
{
  // formerly form menulis NAMA divisi dari useDepartments(). Server
  // membandingkannya dengan ID, jadi hasilnya tidak pernah cocok dan
  // semua halaman Head kosong — tanpa error.
  const r = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({
      id: "u-staff-002",
      kpiRole: "head",
      managedDepartments: [tnt],
    }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 180));

  const row = psql(
    "SELECT kpi_role, managed_departments::text FROM users WHERE id='u-staff-002';",
  );
  console.log(`        users: ${row}`);
  const [role, deptsRaw] = row.split("|");
  // `managed_departments::text` menghasilkan JSON, jadi nilainya
  // `["uuid"]` — dengan tanda kutip. Bandingkan isinya, bukan stringnya.
  const depts = JSON.parse(deptsRaw);

  check(`role tersimpan (${role})`, role === "head");
  check(
    `managed_departments = [${tnt}]`,
    Array.isArray(depts) && depts.length === 1 && depts[0] === tnt,
    JSON.stringify(depts),
  );

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    depts[0] ?? "",
  );
  check("isinya UUID, bukan nama divisi", isUuid, JSON.stringify(depts));
}

console.log("\n=== 2. Divisi yang tidak dikenal ditolak ===");
{
  const fake = "00000000-0000-0000-0000-000000000000";
  const r = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({
      id: "u-staff-002",
      kpiRole: "head",
      managedDepartments: [fake],
    }),
  });
  check("ditolak (400)", r.status === 400, `status ${r.status}`);
  check(
    `pesan menyebut divisi yang tidak dikenal (${JSON.stringify(r.envelope?.error)})`,
    typeof r.envelope?.error === "string" && r.envelope.error.includes("tidak dikenal"),
  );

  const still = psql(
    "SELECT managed_departments::text FROM users WHERE id='u-staff-002';",
  );
  check(`tidak berubah (${still})`, still.includes(tnt));

  const byName = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({
      id: "u-staff-002",
      kpiRole: "head",
      managedDepartments: ["TNT"],
    }),
  });
  check("nama divisi (bukan id) ditolak", byName.status === 400, `status ${byName.status}`);
}

console.log("\n=== 3. Head wajib punya divisi ===");
{
  const r = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({
      id: "u-staff-002",
      kpiRole: "head",
      managedDepartments: [],
    }),
  });
  check("role head tanpa divisi ditolak (400)", r.status === 400, `status ${r.status}`);
  check(
    `pesan sampai ke user (${JSON.stringify(r.envelope?.error)})`,
    typeof r.envelope?.error === "string",
  );

  const role = psql("SELECT kpi_role FROM users WHERE id='u-staff-002';");
  check(`role tidak berubah (${role})`, role === "head");

  // Role lain boleh tanpa divisi.
  const ok = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({
      id: "u-staff-002",
      kpiRole: "tim",
      managedDepartments: [],
    }),
  });
  check("role tim tanpa divisi diterima (200)", ok.status === 200, `status ${ok.status}`);
}

console.log("\n=== 4. Hanya HR/Executive yang boleh mengubah role ===");
{
  const before = psql("SELECT kpi_role FROM users WHERE id='u-staff-002';");

  const staff = await api("u-staff-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id: "u-staff-002", kpiRole: "hr" }),
  });
  check("staf biasa ditolak (403)", staff.status === 403, `status ${staff.status}`);

  const head = await api("u-head-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id: "u-staff-002", kpiRole: "hr" }),
  });
  check("Head ditolak (403)", head.status === 403, `status ${head.status}`);

  const hr = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id: "u-staff-002", kpiRole: "head", managedDepartments: [hype] }),
  });
  check("HR boleh (200)", hr.status === 200, `status ${hr.status}`);

  const back = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id: "u-staff-002", kpiRole: "tim", managedDepartments: [] }),
  });
  check("dikembalikan ke tim (200)", back.status === 200, `status ${back.status}`);
  check(
    `role kembali seperti semula (${before})`,
    psql("SELECT kpi_role FROM users WHERE id='u-staff-002';") === before,
  );

  const noId = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ kpiRole: "hr" }),
  });
  check("tanpa id ditolak (400)", noId.status === 400, `status ${noId.status}`);

  const badRole = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id: "u-staff-002", kpiRole: "superadmin" }),
  });
  check("role tidak dikenal ditolak (400)", badRole.status === 400, `status ${badRole.status}`);

  const empty = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id: "u-staff-002" }),
  });
  check("tidak ada perubahan ditolak (400)", empty.status === 400, `status ${empty.status}`);
}

console.log("\n=== 5. Role developer hanya oleh developer ===");
{
  // `developer` punya akses ke semua data. Kalau HR bisa memberikannya,
  // setiap orang bisa naik ke role tertinggi.
  const byHr = await api("u-hr-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id: "u-staff-002", kpiRole: "developer" }),
  });
  check("HR tidak boleh memberikan developer (403)", byHr.status === 403, `status ${byHr.status}`);

  const byDev = await api("u-dev-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id: "u-staff-002", kpiRole: "developer" }),
  });
  check("developer boleh memberikan developer (200)", byDev.status === 200, `status ${byDev.status}`);

  await api("u-dev-001", "/api/users", {
    method: "PATCH",
    body: JSON.stringify({ id: "u-staff-002", kpiRole: "tim", managedDepartments: [] }),
  });
  check(
    "dikembalikan ke tim",
    psql("SELECT kpi_role FROM users WHERE id='u-staff-002';") === "tim",
  );
}

console.log("\n=== 6. GET /api/kpis?scope=managed ===");
{
  const r = await api("u-head-001", "/api/kpis?scope=managed&year=2026&month=10");
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 150));

  // formerly halaman menyaring sendiri:
  //   managedDepartments.includes(k.department)
  // managedDepartments berisi id, k.department berisi NAMA -> tidak
  // pernah cocok -> halaman selalu kosong.
  const rows = r.body.kpis ?? [];
  check(`ada KPI yang bisa diambil (${rows.length})`, rows.length > 0);

  const depts = new Set(rows.map((k) => k.department));
  console.log(`        divisi pada hasil: ${[...depts].join(", ")}`);
  check(
    "hanya divisi yang dikelola",
    [...depts].every((d) => d === "TNT"),
    JSON.stringify([...depts]),
  );

  const all = await api("u-hr-001", "/api/kpis?year=2026&month=10");
  check(
    `HR melihat semua KPI (${(all.body.kpis ?? []).length}) >= Head (${rows.length})`,
    (all.body.kpis ?? []).length >= rows.length,
  );

  const staffTry = await api("u-staff-001", "/api/kpis?scope=managed&year=2026&month=10");
  check(
    "staf biasa tetap boleh baca (200 — halaman ini tidak butuh role khusus)",
    staffTry.status === 200,
    `status ${staffTry.status}`,
  );
}

console.log("\n=== 7. PATCH /api/kpis: Head hanya boleh KPI divisinya ===");
{
  // KPI uji di divisi HYPE (dimiliki u-staff-003, bukan oleh Head).
  const kpiId = (() => {
    psql(`DELETE FROM kpi_assignments WHERE kpi_id IN (SELECT id FROM kpis WHERE title='ZZ Uji Hapus KPI'); DELETE FROM kpis WHERE title='ZZ Uji Hapus KPI';`);
    psql(
      `INSERT INTO kpis (title, type, unit, period, status, monthly_target, year, month, created_by, department_id)
       VALUES ('ZZ Uji Hapus KPI','result','number','monthly','draft', 10, 2026, 10, 'u-hr-001', '${hype}');`,
    );
    return psql("SELECT id FROM kpis WHERE title='ZZ Uji Hapus KPI';");
  })();

  const before = psql(`SELECT status FROM kpis WHERE id='${kpiId}';`);
  const r = await api("u-head-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, status: "active" }),
  });
  check("ditolak (403)", r.status === 403, `status ${r.status}`);
  check(
    `pesan sampai ke user (${JSON.stringify(r.envelope?.error)})`,
    typeof r.envelope?.error === "string",
  );
  check(
    `status tidak berubah (${before} -> ${psql(`SELECT status FROM kpis WHERE id='${kpiId}';`)})`,
    psql(`SELECT status FROM kpis WHERE id='${kpiId}';`) === before,
  );

  const hr = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, status: "active" }),
  });
  check("HR boleh (200)", hr.status === 200, `status ${hr.status}`);
  check(
    `status benar-benar berubah (${psql(`SELECT status FROM kpis WHERE id='${kpiId}';`)})`,
    psql(`SELECT status FROM kpis WHERE id='${kpiId}';`) === "active",
  );
}

console.log("\n=== 8. Soft delete KPI membatalkan penugasannya sekalian ===");
{
  // formerly dua update dari browser tanpa cek hasil: cancel assignment
  // dulu, baru set deleted_at. Kalau yang pertama gagal, KPI terhapus tapi
  // penugasannya aktif dan tidak terlihat di mana pun.
  const kpiId = psql("SELECT id FROM kpis WHERE title='ZZ Uji Hapus KPI';");

  psql(
    `INSERT INTO kpi_assignments (kpi_id, kpi_type, user_id, department_id, monthly_target,
       actual_total, expected_total, achievement_percentage, current_daily_target,
       working_days_total, working_days_elapsed, working_days_remaining, active_days,
       status, performance_category, year, month)
     SELECT id, 'result', 'u-staff-003', '${hype}', 10, 0, 0, 0, 1, 22, 0, 22, 0, 'active', 'warning', 2026, 10
     FROM kpis WHERE id='${kpiId}';`,
  );

  const activeBefore = psql(
    `SELECT count(*) FROM kpi_assignments WHERE kpi_id='${kpiId}' AND status IN ('active','hold');`,
  );
  check(`ada penugasan aktif sebelum hapus (${activeBefore})`, Number(activeBefore) > 0);

  const r = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, action: "soft-delete" }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 150));
  check(
    `jumlah penugasan yang dibatalkan dilaporkan (${r.body?.cancelledAssignments})`,
    Number(r.body?.cancelledAssignments) === Number(activeBefore),
  );

  check(
    `kpi.deleted_at terisi (${psql(`SELECT deleted_at IS NOT NULL FROM kpis WHERE id='${kpiId}';`)})`,
    psql(`SELECT deleted_at IS NOT NULL FROM kpis WHERE id='${kpiId}';`) === "t",
  );

  const activeAfter = psql(
    `SELECT count(*) FROM kpi_assignments WHERE kpi_id='${kpiId}' AND status IN ('active','hold');`,
  );
  check(`tidak ada penugasan aktif tersisa (${activeAfter})`, Number(activeAfter) === 0);

  const cancelled = psql(
    `SELECT count(*) FROM kpi_assignments WHERE kpi_id='${kpiId}' AND status='cancelled';`,
  );
  check(`penugasan tercatat cancelled, bukan dihapus (${cancelled})`, Number(cancelled) > 0);

  const hist = psql(
    `SELECT count(*) FROM kpi_histories WHERE assignment_id IN
       (SELECT id FROM kpi_assignments WHERE kpi_id='${kpiId}');`,
  );
  check(`audit trail tercatat (${hist})`, Number(hist) > 0);
}

console.log("\n=== 9. Hitungan penugasan untuk dialog konfirmasi ===");
{
  const kpiId = psql("SELECT id FROM kpis WHERE title='ZZ Uji Hapus KPI';");
  const r = await api("u-hr-001", `/api/assignments?kpiId=${kpiId}`);
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 150));
  check(
    `count mengembalikan angka (${r.body?.count})`,
    typeof r.body?.count === "number" && r.body.count >= 0,
  );
  check("count = 0 setelah semua dibatalkan", r.body?.count === 0, `dapat ${r.body?.count}`);
}

console.log("\n=== 10. Id sampah: 400 untuk kolom uuid, 404 untuk id yang tidak ada ===");
{
  // `eq(kpis.id, "apa saja")` membuat Postgres melempar
  // `invalid input syntax for type uuid`. Tanpa penjaga format, itu
  // sampai ke user sebagai 500 "Terjadi kesalahan di server" — bukan
  // pesan yang bisa dibaca.
  //
  // CATATAN: hanya berlaku untuk kolom uuid. `users.id` bertipe TEXT,
  // jadi id user tidak boleh diperiksa dengan `isUuid` — data uji lokal
  // memakai `u-hr-001`, bukan UUID.
  for (const [label, url] of [
    ["kpiId", "/api/assignments?kpiId=bukan-uuid"],
    ["assignment id", "/api/assignments?id=bukan-uuid"],
  ]) {
    const r = await api("u-hr-001", url);
    check(`${label} → 400 (dapat ${r.status})`, r.status === 400, JSON.stringify(r.envelope).slice(0, 120));
    check(
      `  ${label}: pesan terbaca`,
      typeof r.envelope?.error === "string" && !r.envelope.error.includes("Terjadi kesalahan"),
      JSON.stringify(r.envelope?.error),
    );
  }

  // Id user yang formatnya bebas tapi tidak ada harus 404, bukan 200
  // dengan `user: null` — klien yang tidak memeriksa isi akan
  // menganggap pemanggilan berhasil.
  for (const [label, url] of [
    ["user", "/api/users?id=tidak-ada-user-ini"],
    ["bobot", "/api/kpi-settings?userId=tidak-ada-user-ini"],
  ]) {
    const r = await api("u-hr-001", url);
    check(`${label} tidak ada → 404 (dapat ${r.status})`, r.status === 404, JSON.stringify(r.envelope).slice(0, 120));
  }

  // Id user berformat slug WAJIL tetap bisa dipakai — kalau guard-nya
  // salah, semua user uji lokal akan ditolak.
  const slug = await api("u-hr-001", "/api/users?id=u-head-001");
  check("id user berformat slug tetap diterima", slug.status === 200, `status ${slug.status}`);
  check(
    `user yang benar dikembalikan (${slug.body?.user?.name})`,
    slug.body?.user?.id === "u-head-001",
  );
}

console.log("\n=== 11. Bobot KPI: validasi di server, bukan hanya di form ===");
{
  // formerly `kpi_settings.upsert(...)` dari browser. Validasi total 100
  // hanya ada di form, jadi bisa dilewati dengan request langsung —
  // bobot tersimpan tidak seimbang dan skor KPI jadi sia-sia.
  const before = psql(
    "SELECT result_weight||'/'||activity_weight||'/'||quality_weight||'/'||lead_tim_weight||'/'||hr_weight FROM kpi_settings WHERE user_id='u-staff-002';",
  );
  console.log(`        bobot awal: ${before}`);

  const bad = await api("u-hr-001", "/api/kpi-settings", {
    method: "PUT",
    body: JSON.stringify({
      userId: "u-staff-002",
      resultWeight: 40, activityWeight: 30, qualityWeight: 20,
      leadTimWeight: 50, hrWeight: 50,
    }),
  });
  check("total 90 ditolak (400)", bad.status === 400, `status ${bad.status}`);
  check(
    `pesan menyebut totalnya (${JSON.stringify(bad.envelope?.error)})`,
    typeof bad.envelope?.error === "string" && bad.envelope.error.includes("100"),
  );

  const badP = await api("u-hr-001", "/api/kpi-settings", {
    method: "PUT",
    body: JSON.stringify({
      userId: "u-staff-002",
      resultWeight: 50, activityWeight: 30, qualityWeight: 20,
      leadTimWeight: 30, hrWeight: 40,
    }),
  });
  check("total Personality 70 ditolak (400)", badP.status === 400, `status ${badP.status}`);

  const negatif = await api("u-hr-001", "/api/kpi-settings", {
    method: "PUT",
    body: JSON.stringify({
      userId: "u-staff-002",
      resultWeight: -10, activityWeight: 60, qualityWeight: 50,
      leadTimWeight: 50, hrWeight: 50,
    }),
  });
  check("bobot negatif ditolak (400)", negatif.status === 400, `status ${negatif.status}`);

  // formerly ini LULUS: totalnya tetap 100, jadi cek total tidak
  // menangkapnya. Bobot negatif membuat skor KPI orang itu tidak
  // bermakna — dan tidak ada yang melihat kesalahannya.
  check(
    `pesan menyebut rentang (${JSON.stringify(negatif.envelope?.error)})`,
    typeof negatif.envelope?.error === "string" && negatif.envelope.error.includes("0 dan 100"),
  );

  const desimal = await api("u-hr-001", "/api/kpi-settings", {
    method: "PUT",
    body: JSON.stringify({
      userId: "u-staff-002",
      resultWeight: 50.5, activityWeight: 29.5, qualityWeight: 20,
      leadTimWeight: 50, hrWeight: 50,
    }),
  });
  check("bobot desimal ditolak (400)", desimal.status === 400, `status ${desimal.status}`);

  const kurang = await api("u-hr-001", "/api/kpi-settings", {
    method: "PUT",
    body: JSON.stringify({
      userId: "u-staff-002",
      resultWeight: 50, activityWeight: 30, leadTimWeight: 50, hrWeight: 50,
    }),
  });
  check("bobot tidak lengkap ditolak (400)", kurang.status === 400, `status ${kurang.status}`);
  check(
    `pesan menjelaskan kenapa (${JSON.stringify(kurang.envelope?.error)})`,
    typeof kurang.envelope?.error === "string" && kurang.envelope.error.includes("wajib diisi"),
  );

  const after = psql(
    "SELECT result_weight||'/'||activity_weight||'/'||quality_weight||'/'||lead_tim_weight||'/'||hr_weight FROM kpi_settings WHERE user_id='u-staff-002';",
  );
  check(`tidak ada yang tersimpan (tetap ${after})`, after === before);

  // Nilai valid harus benar-benar tersimpan.
  const ok = await api("u-hr-001", "/api/kpi-settings", {
    method: "PUT",
    body: JSON.stringify({
      userId: "u-staff-002",
      resultWeight: 60, activityWeight: 25, qualityWeight: 15,
      leadTimWeight: 40, hrWeight: 60,
    }),
  });
  check("nilai valid diterima (200)", ok.status === 200, JSON.stringify(ok.envelope).slice(0, 120));

  const saved = psql(
    "SELECT result_weight||'/'||activity_weight||'/'||quality_weight||'/'||lead_tim_weight||'/'||hr_weight FROM kpi_settings WHERE user_id='u-staff-002';",
  );
  check(`benar-benar tersimpan (${saved})`, saved === "60/25/15/40/60");

  // Kembalikan ke semula supaya seed tidak berubah diam-diam.
  const [r0, a0, q0, l0, h0] = before.split("/");
  await api("u-hr-001", "/api/kpi-settings", {
    method: "PUT",
    body: JSON.stringify({
      userId: "u-staff-002",
      resultWeight: Number(r0), activityWeight: Number(a0), qualityWeight: Number(q0),
      leadTimWeight: Number(l0), hrWeight: Number(h0),
    }),
  });
  check(
    "dikembalikan ke semula",
    psql("SELECT result_weight||'/'||activity_weight||'/'||quality_weight||'/'||lead_tim_weight||'/'||hr_weight FROM kpi_settings WHERE user_id='u-staff-002';") === before,
  );
}

// Bersihkan.
psql(`
  UPDATE users SET kpi_role='tim', managed_departments='[]'::jsonb WHERE id='u-staff-002';
  DELETE FROM kpi_assignments WHERE kpi_id IN (SELECT id FROM kpis WHERE title='ZZ Uji Hapus KPI');
  DELETE FROM kpis WHERE title='ZZ Uji Hapus KPI';
`);
check("sisa uji dibersihkan", psql("SELECT count(*) FROM kpis WHERE title='ZZ Uji Hapus KPI';") === "0");

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
