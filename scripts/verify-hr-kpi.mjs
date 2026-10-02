/**
 * Verifikasi /dashboard/hr/kpi — Manajemen KPI (list, status, sampah,
 * restore, hapus permanen, copy dari bulan lalu).
 *
 * Fokus pada hal yang paling mudah lolos tanpa terlihat:
 *
 *  1. **Restore harus menghidupkan penugasannya.** Dulu DAL hanya
 *     mengosongkan `deleted_at`, jadi KPI muncul lagi dengan nol
 *     penugasan — tidak ada yang bisa mengisinya, dan tidak ada yang
 *     bisa melihat bahwa ada yang salah.
 *  2. **Hapus permanen hanya untuk isi Sampah.** `daily_reports` dan
 *     `kpi_assignments` keduanya ON DELETE CASCADE, jadi satu klik
 *     menghancurkan riwayat yang tidak bisa dikembalikan.
 *  3. **Operasi massal harus utuh.** Dulu satu request per KPI dalam
 *     `for`; kalau yang ketujuh gagal, enam pertama tetap sudah
 *     terhapus tapi UI bilang "berhasil" untuk semuanya.
 *  4. **Copy dari bulan lalu tidak menduplikasi.**
 *
 * Jalankan: node scripts/verify-hr-kpi.mjs
 */
import { execFileSync } from "node:child_process";

const BASE = "http://localhost:3100";
const PSQL = "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";

function psql(sql) {
  return execFileSync(
    PSQL,
    [
      "-h", "127.0.0.1", "-U", "hrtest", "-d", "hr_local_test",
      "-t", "-A", "-F", "|", "-c", sql,
    ],
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
for (const u of ["u-hr-001", "u-staff-001", "u-head-001", "u-exec-001"]) {
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

// ── Bersihkan sisa uji ────────────────────────────────────────────────────
function cleanup() {
  psql(`
    DELETE FROM daily_reports WHERE kpi_id IN (SELECT id FROM kpis WHERE title LIKE 'ZZ Uji%');
    DELETE FROM kpi_assignments WHERE kpi_id IN (SELECT id FROM kpis WHERE title LIKE 'ZZ Uji%');
    DELETE FROM kpis WHERE title LIKE 'ZZ Uji%';
    UPDATE kpis SET deleted_at = NULL, status = 'draft' WHERE title = 'Output Tim TNT';
  `);
}
cleanup();

/** Buat KPI uji di sebuah divisi. */
function makeKpi(title, deptName) {
  psql(`
    INSERT INTO kpis (title, description, type, unit, period, status, monthly_target,
                      year, month, created_by, department_id)
    VALUES ('${title}', 'KPI uji', 'result', 'number', 'monthly', 'draft', 10, 2026, 10,
            'u-hr-001', (SELECT id FROM departments WHERE name='${deptName}'))
    RETURNING id;
  `);
  return psql(`SELECT id FROM kpis WHERE title='${title}';`);
}

function countAssignments(kpiId, statuses = "'active','hold'") {
  return psql(
    `SELECT count(*) FROM kpi_assignments WHERE kpi_id='${kpiId}' AND status IN (${statuses});`,
  );
}

function addAssignment(kpiId, userId, deptName, status = "active") {
  psql(`
    INSERT INTO kpi_assignments (kpi_id, kpi_type, user_id, department_id, monthly_target,
      actual_total, expected_total, achievement_percentage, current_daily_target,
      working_days_total, working_days_elapsed, working_days_remaining, active_days,
      status, performance_category, year, month, cancelled_at)
    VALUES ('${kpiId}', 'result', '${userId}',
            (SELECT id FROM departments WHERE name='${deptName}'), 10, 0, 0, 0, 1,
            22, 0, 22, 0, '${status}', 'warning', 2026, 10,
            ${status === "cancelled" ? "now()" : "NULL"})
    RETURNING id;
  `);
  return psql(`
    SELECT id FROM kpi_assignments
    WHERE kpi_id='${kpiId}' AND user_id='${userId}' AND month=10
    ORDER BY created_at DESC LIMIT 1;`);
}

/**
 * `daily_reports` TIDAK punya kolom `actual` — yang ada `value`. Dan
 * `assignment_id` NOT NULL, jadi laporan harian harus menempel ke
 * penugasannya.
 */
function addDailyReport(kpiId, userId, deptName) {
  const assignmentId = addAssignment(kpiId, userId, deptName, "active");
  psql(`
    INSERT INTO daily_reports (assignment_id, kpi_id, user_id, date, value, notes)
    VALUES ('${assignmentId}', '${kpiId}', '${userId}', '2026-10-01', 1, 'uji');
  `);
}

console.log("\n=== 1. Soft delete massal membatalkan SEMUA penugasan ===");
{
  const a = makeKpi("ZZ Uji Massal A", "TNT");
  const b = makeKpi("ZZ Uji Massal B", "HYPE");
  addAssignment(a, "u-staff-001", "TNT", "active");
  addAssignment(b, "u-staff-003", "HYPE", "hold");

  check(`2 penugasan aktif sebelum hapus`, Number(countAssignments(a)) + Number(countAssignments(b)) === 2);

  const r = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ ids: [a, b], action: "soft-delete" }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 180));

  check(`jumlah penugasan yang dibatalkan dilaporkan (${r.body?.cancelledAssignments})`,
    r.body?.cancelledAssignments === 2, `dapat ${r.body?.cancelledAssignments}`);

  // Jumlah KPI yang dilaporkan harus sama dengan yang benar-benar
  // berubah. Kalau tidak, UI menampilkan "0 dari 2 KPI dipindahkan"
  // padahal keduanya sudah di-sampah — dan user akan menekan lagi.
  check(`jumlah KPI terpengaruh dilaporkan (${r.body?.kpis})`,
    r.body?.kpis === 2, `dapat ${r.body?.kpis}`);

  for (const [label, id] of [["A", a], ["B", b]]) {
    check(`KPI ${label} deleted_at terisi`,
      psql(`SELECT deleted_at IS NOT NULL FROM kpis WHERE id='${id}';`) === "t");
    check(`tidak ada penugasan aktif tersisa di KPI ${label} (${countAssignments(id)})`,
      Number(countAssignments(id)) === 0);
    check(`penugasan KPI ${label} tercatat cancelled, bukan dihapus`,
      Number(countAssignments(id, "'cancelled'")) === 1);
  }
}

console.log("\n=== 2. Restore menghidupkan kembali penugasannya ===");
{
  // formerly DAL hanya mengosongkan deleted_at. KPI muncul kembali dengan
  // nol penugasan — tidak ada yang bisa mengisinya, dan tidak ada yang
  // bisa melihat bahwa ada yang salah.
  const ids = psql(
    "SELECT string_agg(id::text, ',') FROM kpis WHERE title LIKE 'ZZ Uji Massal%';",
  ).split(",");

  const r = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ ids, action: "restore" }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 180));

  check(`jumlah penugasan yang dihidupkan dilaporkan (${r.body?.restoredAssignments})`,
    r.body?.restoredAssignments === 2, `dapat ${r.body?.restoredAssignments}`);
  check(`jumlah KPI terpengaruh dilaporkan (${r.body?.kpis})`,
    r.body?.kpis === 2, `dapat ${r.body?.kpis}`);

  for (const [label, id] of [["A", ids[0]], ["B", ids[1]]]) {
    check(`KPI ${label} deleted_at kosong lagi`,
      psql(`SELECT deleted_at IS NULL FROM kpis WHERE id='${id}';`) === "t");
    check(`penugasan KPI ${label} kembali aktif (${countAssignments(id)})`,
      Number(countAssignments(id)) === 1, `dapat ${countAssignments(id)}`);
  }
}

console.log("\n=== 3. Restore TIDAK mengubah assignment yang sudah selesai ===");
{
  // Kalau `completed` ikut dibalik jadi active, skor KPI yang sudah
  // final ikut berubah tanpa ada yang memutuskan itu.
  const kpiId = psql("SELECT id FROM kpis WHERE title='ZZ Uji Massal A';");
  psql(`UPDATE kpi_assignments SET status='completed' WHERE kpi_id='${kpiId}';`);
  psql(`UPDATE kpis SET deleted_at=now() WHERE id='${kpiId}';`);

  await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, action: "restore" }),
  });

  const status = psql(`SELECT status FROM kpi_assignments WHERE kpi_id='${kpiId}';`);
  check(`status penugasan tetap completed (${status})`, status === "completed", `dapat ${status}`);
}

console.log("\n=== 4. Hapus permanen hanya untuk isi Sampah ===");
{
  // daily_reports + kpi_assignments keduanya ON DELETE CASCADE: satu
  // klik menghapus seluruh riwayat dan tidak ada yang bisa mengembalikan.
  const kpiId = makeKpi("ZZ Uji Permanen", "TNT");
  addDailyReport(kpiId, "u-staff-001", "TNT");

  check("ada laporan harian sebelum hapus",
    psql(`SELECT count(*) FROM daily_reports WHERE kpi_id='${kpiId}';`) === "1");

  const before = await api("u-hr-001", `/api/kpis?id=${kpiId}`, { method: "DELETE" });
  check(`KPI yang belum di-trash ditolak (${before.status})`, before.status === 409, `status ${before.status}`);
  check(`pesan menjelaskan (${JSON.stringify(before.envelope?.error)})`,
    typeof before.envelope?.error === "string" && before.envelope.error.includes("Sampah"));

  check("KPI masih ada",
    psql(`SELECT count(*) FROM kpis WHERE id='${kpiId}';`) === "1");

  // Sekarang pindahkan ke sampah dulu.
  await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, action: "soft-delete" }),
  });

  const ok = await api("u-hr-001", `/api/kpis?id=${kpiId}`, { method: "DELETE" });
  check("setelah di-trash, hapus permanen boleh (200)", ok.status === 200, JSON.stringify(ok.envelope).slice(0, 150));
  check("KPI hilang",
    psql(`SELECT count(*) FROM kpis WHERE id='${kpiId}';`) === "0");
  check("laporan harian ikut hilang (cascade)",
    psql(`SELECT count(*) FROM daily_reports WHERE kpi_id='${kpiId}';`) === "0");
  check("penugasan ikut hilang (cascade)",
    psql(`SELECT count(*) FROM kpi_assignments WHERE kpi_id='${kpiId}';`) === "0");
}

console.log("\n=== 5. Hapus permanen massal melaporkan yang dilewati ===");
{
  const a = makeKpi("ZZ Uji Trash A", "TNT");
  const b = makeKpi("ZZ Uji Trash B", "TNT");

  await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ ids: [a, b], action: "soft-delete" }),
  });

  const r = await api("u-hr-001", `/api/kpis?ids=${a},${b}`, { method: "DELETE" });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 150));
  check(`kedua KPI dihapus (${r.body?.deleted?.length})`, r.body?.deleted?.length === 2);
  check(`tidak ada yang dilewati (${JSON.stringify(r.body?.skipped)})`,
    (r.body?.skipped ?? []).length === 0);

  const semuaKosong = psql(`SELECT count(*) FROM kpis WHERE title LIKE 'ZZ Uji Trash%';`);
  check(`sisa di database = ${semuaKosong}`, semuaKosong === "0");

  // Yang belum di-trash harus dilaporkan, bukan dihapus diam-diam.
  const c = makeKpi("ZZ Uji Trash C", "TNT");
  const d = makeKpi("ZZ Uji Trash D", "TNT");
  await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: d, action: "soft-delete" }),
  });

  const mixed = await api("u-hr-001", `/api/kpis?ids=${c},${d}`, { method: "DELETE" });
  check(`hanya yang di-trash yang dihapus (${mixed.body?.deleted?.length})`,
    mixed.body?.deleted?.length === 1, JSON.stringify(mixed.body));
  check(`KPI tak-tertrash dilewati, bukan dihapus (${JSON.stringify(mixed.body?.skipped)})`,
    mixed.body?.skipped?.includes(c) === true, JSON.stringify(mixed.body));
  check("KPI yang tidak di-trash masih ada",
    psql(`SELECT count(*) FROM kpis WHERE id='${c}';`) === "1");
}

console.log("\n=== 6. Hitungan penugasan untuk dialog hapus massal ===");
{
  // formerly satu request per KPI, beruntun dari browser. Kalau salah
  // satu gagal, jumlahnya tetap dijumlahkan — user melihat angka yang
  // lebih kecil dari kenyataan tanpa ada yang memberitahu.
  const a = makeKpi("ZZ Uji Hitung A", "TNT");
  const b = makeKpi("ZZ Uji Hitung B", "HYPE");
  addAssignment(a, "u-staff-001", "TNT", "active");
  addAssignment(a, "u-staff-002", "TNT", "hold");
  addAssignment(b, "u-staff-003", "HYPE", "active");

  // Satu jadi completed — hanya active & hold yang ikut terhitung.
  psql(`UPDATE kpi_assignments SET status='completed'
        WHERE kpi_id='${a}' AND user_id='u-staff-002';`);

  const semua = await api("u-hr-001", `/api/assignments?kpiIds=${a},${b}`);
  check("status 200", semua.status === 200, JSON.stringify(semua.envelope).slice(0, 150));
  check(`jumlahkan semua KPI (${semua.body?.count})`, semua.body?.count === 2, `dapat ${semua.body?.count}`);
  check("assignment completed tidak ikut terhitung",
    Number(countAssignments(a, "'active','hold'")) === 1);

  const satu = await api("u-hr-001", `/api/assignments?kpiIds=${b}`);
  check(`hanya KPI kedua (${satu.body?.count})`, satu.body?.count === 1, `dapat ${satu.body?.count}`);

  const nol = await api("u-hr-001", `/api/assignments?kpiIds=${makeKpi("ZZ Uji Hitung C", "LIMA")}`);
  check("KPI tanpa penugasan = 0, bukan error", nol.body?.count === 0, `dapat ${nol.body?.count}`);

  const rusak = await api("u-hr-001", "/api/assignments?kpiIds=bukan-uuid");
  check("id sampah ditolak 400", rusak.status === 400, `status ${rusak.status}`);
}

console.log("\n=== 7. Copy dari bulan lalu tidak menduplikasi ===");
{
  // formerly kuncinya `k.title + "|" + k.department`, padahal baris itu
  // tidak punya kolom `department` — jadi kuncinya selalu
  // "judul|undefined" dan yang dibandingkan cuma judulnya.
  //
  // Bulan September sengaja dikosongkan lebih dulu supaya test ini benar-
  // benar menguji penyaringan, bukan "tidak ada apa-apa untuk disalin".
  psql(`DELETE FROM kpis WHERE year=2026 AND month=9;`);

  const kosong = await api("u-hr-001", "/api/kpis", {
    method: "POST",
    body: JSON.stringify({ action: "copy-from-month", year: 2026, month: 10 }),
  });
  check(`bulan September kosong → copied 0 (${kosong.body?.copied})`,
    kosong.body?.copied === 0, `dapat ${kosong.body?.copied}`);
  check(`dari = ${kosong.body?.from}`, kosong.body?.from === "2026-09");

  psql(`
    INSERT INTO kpis (title, description, type, unit, period, status, monthly_target,
                      year, month, created_by, department_id)
    VALUES ('ZZ Uji Copy Src', 'kopi', 'result', 'number', 'monthly', 'draft', 7, 2026, 9,
            'u-hr-001', (SELECT id FROM departments WHERE name='HYPE'));`);

  const sebelum = psql(
    "SELECT count(*) FROM kpis WHERE year=2026 AND month=10 AND deleted_at IS NULL;",
  );

  const r = await api("u-hr-001", "/api/kpis", {
    method: "POST",
    body: JSON.stringify({ action: "copy-from-month", year: 2026, month: 10 }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 180));
  check(`menyalin 1 KPI (${r.body?.copied})`, r.body?.copied === 1, `dapat ${r.body?.copied}`);

  const sesudah = psql(
    "SELECT count(*) FROM kpis WHERE year=2026 AND month=10 AND deleted_at IS NULL;",
  );
  check(`jumlah Oktober bertambah tepat 1 (${sebelum} -> ${sesudah})`,
    Number(sesudah) === Number(sebelum) + 1);

  // Jalankan dua kali: yang kedua tidak boleh menyalin apa pun.
  const kedua = await api("u-hr-001", "/api/kpis", {
    method: "POST",
    body: JSON.stringify({ action: "copy-from-month", year: 2026, month: 10 }),
  });
  check(`dijalankan dua kali, tidak menggandakan (${kedua.body?.copied})`,
    kedua.body?.copied === 0, `dapat ${kedua.body?.copied}`);
  check(`dilewati dilaporkan (${kedua.body?.skipped})`,
    (kedua.body?.skipped ?? 0) > 0, `dapat ${kedua.body?.skipped}`);

  const akhir = psql(
    "SELECT count(*) FROM kpis WHERE year=2026 AND month=10 AND deleted_at IS NULL;",
  );
  check(`jumlah tidak bertambah setelah dijalankan lagi (${akhir})`, akhir === sesudah);

  const judulGanda = psql(`
    SELECT count(*) FROM (
      SELECT lower(trim(title)), coalesce(department_id::text,'') AS d, count(*)
      FROM kpis WHERE year=2026 AND month=10 AND deleted_at IS NULL
      GROUP BY 1,2 HAVING count(*) > 1
    ) t;`);
  check("tidak ada (judul, divisi) yang ganda", judulGanda === "0", `dapat ${judulGanda}`);

  const bulanBuruk = await api("u-hr-001", "/api/kpis", {
    method: "POST",
    body: JSON.stringify({ action: "copy-from-month", year: 2026, month: 13 }),
  });
  check("bulan 13 ditolak (400)", bulanBuruk.status === 400, `status ${bulanBuruk.status}`);
  check(`pesan terbaca (${JSON.stringify(bulanBuruk.envelope?.error)})`,
    typeof bulanBuruk.envelope?.error === "string");
}

console.log("\n=== 8. Salinan membawa divisi, periode, dan status Draft ===");
{
  // formerly kolom `department_id`-nya ikut terbawa, tapi tidak ada yang
  // memastikan bulan tujuannya benar — kalau `year`/`month` kelewat,
  // KPI-nya mendarat di periode yang salah dan tidak terlihat di mana pun.
  const salinan = psql(`
    SELECT COALESCE(d.name,'(tanpa divisi)') || '|' || k.status || '|' || k.year || '|' || k.month
      || '|' || trim(trailing '.' from trim(trailing '0' from k.monthly_target::text))
    FROM kpis k LEFT JOIN departments d ON d.id = k.department_id
    WHERE k.title='ZZ Uji Copy Src' AND k.month=10 AND k.deleted_at IS NULL;`);

  check(`divisi + status + periode + target benar (${salinan})`,
    salinan === "HYPE|draft|2026|10|7", `dapat ${salinan}`);

  const takAdaAsal = psql(
    "SELECT count(*) FROM kpis WHERE title='ZZ Uji Copy Src' AND month=9;",
  );
  check("baris sumber bulan September tidak ikut terhapus", takAdaAsal === "1");
}

console.log("\n=== 9. Otorisasi ===");
{
  const kpiId = makeKpi("ZZ Uji Otorisasi", "HYPE");

  const staf = await api("u-staff-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, status: "active" }),
  });
  check("staf biasa tidak boleh ubah status (403)", staf.status === 403, `status ${staf.status}`);

  const head = await api("u-head-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, status: "active" }),
  });
  check(`Head tidak boleh sentuh KPI divisi lain (${head.status})`, head.status === 403, `status ${head.status}`);
  check("status tidak berubah",
    psql(`SELECT status FROM kpis WHERE id='${kpiId}';`) === "draft");

  const stafHapus = await api("u-staff-001", `/api/kpis?id=${kpiId}`, { method: "DELETE" });
  check("staf biasa tidak boleh hapus permanen (403)", stafHapus.status === 403, `status ${stafHapus.status}`);

  const headHapus = await api("u-head-001", `/api/kpis?id=${kpiId}`, { method: "DELETE" });
  check("Head tidak boleh hapus permanen (403)", headHapus.status === 403, `status ${headHapus.status}`);

  // formerly endpoint ini hanya boleh untuk executive, padahal halamannya
  // milik HR — fitur Hapus Permanen tidak bisa dipakai siapa pun.
  const hr = await api("u-hr-001", `/api/kpis?id=${kpiId}`, { method: "DELETE" });
  check("HR boleh (tidak 403)", hr.status !== 403, `status ${hr.status}`);

  const exec = await api("u-exec-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: makeKpi("ZZ Uji Otorisasi 2", "TNT"), status: "active" }),
  });
  check("Executive boleh ubah status", exec.status === 200, `status ${exec.status}`);
}

console.log("\n=== 10. Validasi masukan PATCH");
{
  const kpiId = makeKpi("ZZ Uji Validasi", "TNT");

  for (const [label, body, expected] of [
    ["tanpa id", { status: "active" }, 400],
    ["id bukan uuid", { id: "bukan-uuid", status: "active" }, 400],
    ["ids bukan uuid", { ids: [kpiId, "ngawur"], action: "soft-delete" }, 400],
    ["tidak ada perubahan", { id: kpiId }, 400],
    ["restore massal", { ids: [kpiId, makeKpi("ZZ Uji Validasi 2", "TNT")], action: "recalc-target" }, 400],
  ]) {
    const r = await api("u-hr-001", "/api/kpis", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    check(`${label} → ${expected} (dapat ${r.status})`, r.status === expected, JSON.stringify(r.envelope).slice(0, 110));
    check(`  ${label}: pesan terbaca`,
      typeof r.envelope?.error === "string" && !r.envelope.error.includes("Terjadi kesalahan"),
      JSON.stringify(r.envelope?.error));
  }

  const kosong = await api("u-hr-001", "/api/kpis", { method: "DELETE" });
  check("DELETE tanpa id → 400", kosong.status === 400, `status ${kosong.status}`);

  const rusak = await api("u-hr-001", "/api/kpis?ids=bukan-uuid", { method: "DELETE" });
  check("DELETE id sampah → 400", rusak.status === 400, `status ${rusak.status}`);

  const tanpaJudul = await api("u-hr-001", "/api/kpis", {
    method: "POST",
    body: JSON.stringify({ year: 2026, month: 10 }),
  });
  check("POST tanpa judul → 400", tanpaJudul.status === 400, `status ${tanpaJudul.status}`);
}

console.log("\n=== 11. Tab Sampah benar-benar berisi data ===");
{
  // formerly halaman memakai useKpis() (menyaring deleted_at di server)
  // lalu menghitung kpis.filter(k => k.deletedAt). Polanya tidak pernah
  // menghasilkan apa pun — tab Sampah selalu kosong.
  const kpiId = makeKpi("ZZ Uji Sampah", "TNT");
  await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, action: "soft-delete" }),
  });

  const denganSampah = await api("u-hr-001", "/api/kpis?year=2026&month=10&includeTrash=1");
  const isiSampah = (denganSampah.body?.kpis ?? []).filter((k) => k.deletedAt);
  check(`includeTrash mengembalikan isi sampah (${isiSampah.length})`, isiSampah.length > 0);

  const tanpaSampah = await api("u-hr-001", "/api/kpis?year=2026&month=10");
  const salahHitung = (tanpaSampah.body?.kpis ?? []).filter((k) => k.deletedAt);
  check(`tanpa includeTrash tidak ada yang ter-trash (${salahHitung.length})`, salahHitung.length === 0);

  const staf = await api("u-staff-001", "/api/kpis?year=2026&month=10&includeTrash=1");
  check(`staf biasa tidak boleh melihat sampah (${staf.status})`, staf.status === 403, `status ${staf.status}`);
}

console.log("\n=== 12. Jalur SATU id juga melaporkan jumlah yang sebenarnya ===");
{
  // formerly `softDeleteKpi` hanya mengembalikan jumlah penugasan yang
  // dibatalkan. UI menghitung "berapa KPI terpengaruh" dari `?? 0`, jadi
  // aksi yang sukses dilaporkan sebagai "0 dari 1 KPI dipindahkan" —
  // dan user akan menekan tombolnya lagi.
  const kpiId = makeKpi("ZZ Uji Tunggal", "TNT");
  addAssignment(kpiId, "u-staff-001", "TNT", "active");

  const hapus = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, action: "soft-delete" }),
  });
  check(`soft-delete id tunggal melaporkan kpis=1 (dapat ${hapus.body?.kpis})`,
    hapus.body?.kpis === 1, `dapat ${hapus.body?.kpis}`);
  check(`penugasan dibatalkan (${hapus.body?.cancelledAssignments})`,
    hapus.body?.cancelledAssignments === 1);

  const ulang = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, action: "soft-delete" }),
  });
  check(`dijalankan dua kali → kpis=0, bukan 1 lagi (${ulang.body?.kpis})`,
    ulang.body?.kpis === 0, `dapat ${ulang.body?.kpis}`);
  check(`tidak ada penugasan ekstra yang dibatalkan (${ulang.body?.cancelledAssignments})`,
    ulang.body?.cancelledAssignments === 0, `dapat ${ulang.body?.cancelledAssignments}`);

  const pulih = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, action: "restore" }),
  });
  check(`restore id tunggal melaporkan kpis=1 (dapat ${pulih.body?.kpis})`,
    pulih.body?.kpis === 1, `dapat ${pulih.body?.kpis}`);
  check(`penugasan dihidupkan (${pulih.body?.restoredAssignments})`,
    pulih.body?.restoredAssignments === 1, `dapat ${pulih.body?.restoredAssignments}`);

  const pulihLagi = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, action: "restore" }),
  });
  check(`restore kedua → kpis=0 (${pulihLagi.body?.kpis})`,
    pulihLagi.body?.kpis === 0, `dapat ${pulihLagi.body?.kpis}`);

  // operatedanya tetap idempoten: tidak merusak apa pun
  check("KPI tetap ada setelah semua itu",
    psql(`SELECT count(*) FROM kpis WHERE id='${kpiId}';`) === "1");
  check("penugasan tetap ada",
    psql(`SELECT count(*) FROM kpi_assignments WHERE kpi_id='${kpiId}';`) === "1");
}

console.log("\n=== 13. hide_actual bisa diubah lewat patch yang sama ===");
{
  const kpiId = makeKpi("ZZ Uji Hide Actual", "TNT");

  const lewatAksesoris = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, hide_actual: true }),
  });
  check("nama snake_case tidak diterima", lewatAksesoris.status === 400, `status ${lewatAksesoris.status}`);

  const show = await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, hideActual: true }),
  });
  check("hideActual=true diterima (200)", show.status === 200, JSON.stringify(show.envelope).slice(0, 120));
  check(`benar-benar tersimpan (${psql(`SELECT hide_actual FROM kpis WHERE id='${kpiId}';`)})`,
    psql(`SELECT hide_actual FROM kpis WHERE id='${kpiId}';`) === "t");

  await api("u-hr-001", "/api/kpis", {
    method: "PATCH",
    body: JSON.stringify({ id: kpiId, hideActual: false }),
  });
  check("kembali false",
    psql(`SELECT hide_actual FROM kpis WHERE id='${kpiId}';`) === "f");
}

cleanup();
const sisa = psql("SELECT count(*) FROM kpis WHERE title LIKE 'ZZ Uji%';");
check(`sisa uji dibersihkan (${sisa})`, sisa === "0");
check("seed KPI tidak berubah statusnya",
  psql("SELECT status FROM kpis WHERE title='Output Tim TNT';") === "draft",
  psql("SELECT status FROM kpis WHERE title='Output Tim TNT';"));

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);