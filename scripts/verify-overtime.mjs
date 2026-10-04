/**
 * Verifikasi alur lembur (/api/overtime) — empat tahap: pengajuan →
 * persetujuan → laporan → finalisasi.
 *
 * Fokus pada apa yang dulu ditulis dari browser tanpa cek apa pun:
 *
 *  1. **Transisi tahap.** `update({ status }).eq("id", id)` tanpa cek
 *     status lama — approve bisa dijalankan ulang pada pengajuan yang
 *     sudah `finalized`, dan menimpa gaji yang sudah dibayar.
 *  2. **KPemilikan laporan.** `update({ status: "reported" }).eq("id", id)`
 *     tanpa cek siapa pemiliknya — cukup menebak id.
 *  3. **Perhitungan gaji di client.** `total_overtime_pay` dikirim dari
 *     browser apa adanya; server tidak pernah menghitung ulang.
 *  4. **Validasi form yang bisa dilewati.** Durasi maksimum, tanggal
 *     lampau, jam terbalik.
 *
 * Jalankan: node scripts/verify-overtime.mjs
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
for (const u of ["u-staff-001", "u-staff-002", "u-head-001", "u-hr-001"]) {
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

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Hari kerja yang PASTI bukan akhir pekan.
 *
 * Versi lama memakai `TODAY` langsung. Itu asumsi yang salah: begitu
 * tanggal berganti ke Sabtu atau Minggu, `isWeekend()` mengembalikan
 * true, plafon durasi berubah dari 4 jam ke 12 jam, dan EMPAT assert
 * gagal sekaligus -- padahal kodenya benar. Terlihat seperti
 * regresi padahal cuma jamnya beda.
 *
 * Test yang hanya lulus di hari tertentu sama buruknya dengan tidak
 * ada test: ia melaporkan bug yang tidak ada dan menyembunyikan bug
 * yang ada. Lihat AGENTS.md 2.1.
 */
function workdayAhead() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

const today = new Date();
const TODAY = fmt(today);
const HARI_KERJA = fmt(workdayAhead());
// KEMARIN tetap relatif ke HARI INI, bukan ke HARI_KERJA. Ia dipakai
// untuk dua hal: "tanggal lampau" (cukup asal sudah lewat) dan
// "rentang terbalik" (butuh from > to). Kalau diturunkan dari
// HARI_KERJA, pada hari Sabtu hasilnya bisa jadi AFTERNING, dan
// rentangnya tidak lagi terbalik.
const KEMARIN = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return fmt(d);
})();

/** Bersihkan semua pengajuan uji. */
function cleanup() {
  psql(`
    DELETE FROM overtime_requests WHERE user_id IN ('u-staff-001','u-staff-003')
      AND (staff_notes = 'uji' OR staff_notes IS NULL);
    DELETE FROM overtime_requests WHERE staff_notes = 'uji';
  `);
}
cleanup();

async function createRequest(overrides = {}) {
  const r = await api("u-staff-001", "/api/overtime", {
    method: "POST",
    body: JSON.stringify({
      overtimeDate: HARI_KERJA,
      startTime: "18:00",
      endTime: "21:00",
      tasks: [{ name: "rekap" }],
      staffNotes: "uji",
      ...overrides,
    }),
  });
  return r;
}

console.log("\n=== 1. POST: validasi yang dulu hanya ada di form ===");
{
  const ok = await createRequest();
  check("pengajuan valid diterima (200)", ok.status === 200, JSON.stringify(ok.envelope).slice(0, 180));

  const row = psql(
    "SELECT status, requested_duration_minutes, user_id, day_type, is_holiday FROM overtime_requests WHERE staff_notes='uji' ORDER BY created_at DESC LIMIT 1;",
  );
  console.log(`        ${row}`);
  check(`status pending (${row.split("|")[0]})`, row.split("|")[0] === "pending");
  check("durasi 180 menit dihitung server", row.split("|")[1] === "180", row);
  check("user_id dari SESI, bukan dari payload",
    row.split("|")[2] === "u-staff-001", row);

  for (const [label, overrides, expected] of [
    ["tanggal lampau", { overtimeDate: KEMARIN }, 400],
    ["format tanggal salah", { overtimeDate: "besok" }, 400],
    ["jam terbalik", { startTime: "21:00", endTime: "18:00" }, 400],
    ["jam melintasi tengah malam", { startTime: "22:00", endTime: "02:00" }, 400],
    ["format jam salah", { startTime: "25:00", endTime: "26:00" }, 400],
    ["durasi 10 jam di hari kerja", { startTime: "08:00", endTime: "18:00" }, 400],
  ]) {
    const r = await createRequest(overrides);
    check(`${label} → ${expected} (dapat ${r.status})`, r.status === expected, JSON.stringify(r.envelope).slice(0, 130));
    check(`  ${label}: pesan terbaca`,
      typeof r.envelope?.error === "string" && !r.envelope.error.includes("Terjadi kesalahan"),
      JSON.stringify(r.envelope?.error));
  }

  check("hanya satu baris uji yang lolos",
    psql("SELECT count(*) FROM overtime_requests WHERE staff_notes='uji' AND status='pending';") === "1");
}

console.log("\n=== 2. Tahap: pending → approved → reported → finalized ===");
{
  const id = psql("SELECT id FROM overtime_requests WHERE staff_notes='uji' AND status='pending' LIMIT 1;");

  const reportTooEarly = await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "report",
      actualStartTime: "18:00", actualEndTime: "21:00",
    }),
  });
  check(`laporan sebelum disetujui ditolak (${reportTooEarly.status})`,
    reportTooEarly.status === 400, `status ${reportTooEarly.status}`);
  check(`pesan menyebut tahapnya (${JSON.stringify(reportTooEarly.envelope?.error)})`,
    typeof reportTooEarly.envelope?.error === "string" && reportTooEarly.envelope.error.includes("tidak bisa diubah"));

  const finalizeTooEarly = await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "finalize" }),
  });
  check(`finalisasi sebelum dilaporkan ditolak (${finalizeTooEarly.status})`,
    finalizeTooEarly.status === 400, `status ${finalizeTooEarly.status}`);

  const approve = await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "approve",
      approvedStartTime: "18:00", approvedEndTime: "21:00",
      approvalNotes: "setuju",
    }),
  });
  check("approve berhasil (200)", approve.status === 200, JSON.stringify(approve.envelope).slice(0, 150));

  const setelahApprove = psql(
    "SELECT status, approved_duration_minutes, approved_by IS NOT NULL, approval_date IS NOT NULL FROM overtime_requests WHERE id='" + id + "';",
  );
  console.log(`        ${setelahApprove}`);
  check("status jadi approved", setelahApprove.split("|")[0] === "approved");
  check("durasi approved 180 menit", setelahApprove.split("|")[1] === "180", setelahApprove);
  check("approved_by terisi", setelahApprove.split("|")[2] === "t");
  check("approval_date terisi", setelahApprove.split("|")[3] === "t");

  // Approve ulang harus ditolak — inilah yang dulu bisa menimpa gaji final.
  const approveLagi = await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "approve",
      approvedStartTime: "18:00", approvedEndTime: "23:00",
    }),
  });
  check(`approve ulang ditolak (${approveLagi.status})`, approveLagi.status === 400, `status ${approveLagi.status}`);

  const report = await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "report",
      actualStartTime: "18:10", actualEndTime: "20:40",
      taskReports: [{ name: "rekap", detail: "selesai" }],
      staffReportNotes: "ok",
    }),
  });
  check("laporan diterima (200)", report.status === 200, JSON.stringify(report.envelope).slice(0, 150));

  const setelahReport = psql(
    "SELECT status, actual_duration_minutes FROM overtime_requests WHERE id='" + id + "';",
  );
  check(`status jadi reported, durasi 150 menit (${setelahReport})`,
    setelahReport === "reported|150", setelahReport);
}

console.log("\n=== 3. Durasi aktual tidak boleh melebihi yang disetujui ===");
{
  // Kalau tidak dicek, angka yang dikirim HR jadi tidak ada artinya dan
  // gaji lembur dihitung dari angka yang tidak pernah disetujui.
  const r = await createRequest({ startTime: "18:00", endTime: "20:00" });
  const id = r.body?.overtime?.id;

  await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "approve",
      approvedStartTime: "18:00", approvedEndTime: "20:00",
    }),
  });

  const lebih = await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "report",
      actualStartTime: "18:00", actualEndTime: "22:00",
    }),
  });
  check(`lebih lama dari disetujui ditolak (${lebih.status})`, lebih.status === 400, `status ${lebih.status}`);
  check(`pesan menyebut angkanya (${JSON.stringify(lebih.envelope?.error)})`,
    typeof lebih.envelope?.error === "string" && lebih.envelope.error.includes("melebihi"));

  check("status tidak berubah",
    psql(`SELECT status FROM overtime_requests WHERE id='${id}';`) === "approved");
}

console.log("\n=== 4. Laporan hanya boleh untuk pemiliknya ===");
{
  // formerly `update({ status: "reported" }).eq("id", id)` — tanpa cek
  // pemilik. Cukup menebak id, staf bisa menulis laporan atas nama
  // orang lain.
  const r = await createRequest({ startTime: "09:00", endTime: "11:00" });
  const id = r.body?.overtime?.id;

  await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "approve",
      approvedStartTime: "09:00", approvedEndTime: "11:00",
    }),
  });

  const pencuri = await api("u-staff-002", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "report",
      actualStartTime: "09:00", actualEndTime: "11:00",
    }),
  });
  check(`staf lain ditolak (${pencuri.status})`, pencuri.status === 403, `status ${pencuri.status}`);

  check("status tidak berubah",
    psql(`SELECT status FROM overtime_requests WHERE id='${id}';`) === "approved");

  // Batalkan juga hanya untuk pemilik.
  const batalPalsu = await api("u-staff-002", `/api/overtime?id=${id}&cancel=1`, {
    method: "DELETE",
  });
  check(`batalkan milik orang lain ditolak (${batalPalsu.status})`,
    batalPalsu.status === 403, `status ${batalPalsu.status}`);
}

console.log("\n=== 5. Gaji lembur dihitung SERVER ===");
{
  const r = await createRequest({ startTime: "18:00", endTime: "21:00" });
  const id = r.body?.overtime?.id;

  // Beri gaji dasar supaya tarifnya bukan 0.
  psql(`
    INSERT INTO payroll_staff_settings (user_id, default_base_salary)
    VALUES ('u-staff-001', 5000000)
    ON CONFLICT (user_id) DO UPDATE SET default_base_salary = 5000000;`);

  await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "approve",
      approvedStartTime: "18:00", approvedEndTime: "21:00",
    }),
  });
  await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "report",
      actualStartTime: "18:00", actualEndTime: "21:00",
    }),
  });

  // Klien mencoba mengirim angkanya sendiri lewat nama kolom yang tidak
  // dikenal DAL. Kalau tidak diabaikan, angka itu dipakai.
  const curang = await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "finalize",
      totalOvertimePay: 99999999,
      hourly_base_rate: 1,
      is_holiday: true,
    }),
  });
  check(`finalisasi biasa diterima (${curang.status})`, curang.status === 200, JSON.stringify(curang.envelope).slice(0, 150));

  const tersimpan = psql(
    "SELECT total_overtime_pay, hourly_base_rate, is_holiday FROM overtime_requests WHERE id='" + id + "';",
  );
  const [pay, rate, holiday] = tersimpan.split("|");
  console.log(`        total_overtime_pay=${pay} hourly_base_rate=${rate} is_holiday=${holiday}`);

  // 5.000.000 / 173 = 28901.73 -> dibulatkan 28902. 3 jam weekday:
  // 1 jam pertama 1.5x, sisanya 2x -> 1*1.5 + 2*2 = 5.5.
  // 28902 * 5.5 = 158961.
  check("gaji bukan 99999999", Number(pay) !== 99999999, `dapat ${pay}`);
  check("gaji hasil perhitungan server (158961)", Number(pay) === 158961, `dapat ${pay}`);
  check("tarif jam = gaji/173 (28902)", Number(rate) === 28902, `dapat ${rate}`);
  check("field tak dikenal diabaikan (is_holiday tetap f)", holiday === "f", holiday);

  const breakdown = psql(
    "SELECT calculation_breakdown::text FROM overtime_requests WHERE id='" + id + "';",
  );
  check("breakdown mencatat angka sebelum & sesudah plafon",
    breakdown.includes("uncappedTotalPay") && breakdown.includes("isCapped"), breakdown.slice(0, 140));
}

console.log("\n=== 5b. Override gaji wajib disertai alasan ===");
{
  const r = await createRequest({ startTime: "18:00", endTime: "21:00" });
  const id = r.body?.overtime?.id;

  await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "approve", approvedStartTime: "18:00", approvedEndTime: "21:00" }),
  });
  await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "report", actualStartTime: "18:00", actualEndTime: "21:00" }),
  });

  const tanpaAlasan = await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "finalize", totalPayOverride: 50000 }),
  });
  check(`override tanpa alasan ditolak (${tanpaAlasan.status})`,
    tanpaAlasan.status === 400, `status ${tanpaAlasan.status}`);
  check(`pesan menjelaskan (${JSON.stringify(tanpaAlasan.envelope?.error)})`,
    typeof tanpaAlasan.envelope?.error === "string" && tanpaAlasan.envelope.error.includes("alasan"));
  check("tidak jadi final",
    psql(`SELECT status FROM overtime_requests WHERE id='${id}';`) === "reported");

  const denganAlasan = await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id, action: "finalize",
      totalPayOverride: 50000,
      overrideReason: "sudah dibayar sebagian di luar sistem",
    }),
  });
  check(`override dengan alasan diterima (${denganAlasan.status})`,
    denganAlasan.status === 200, JSON.stringify(denganAlasan.envelope).slice(0, 150));
  check("gaji mengikuti override",
    // Dibandingkan sebagai angka, bukan teks -- lihat catatan di
    // verify-daily-reports.mjs: bentuk teks numeric mengikuti scale kolom.
    Number(psql(`SELECT total_overtime_pay FROM overtime_requests WHERE id='${id}';`)) === 50000);

  const bd = psql(`SELECT calculation_breakdown::text FROM overtime_requests WHERE id='${id}';`);
  check("override tercatat di breakdown (isOverride true)",
    /"isOverride":\s*true/.test(bd), bd.slice(0, 160));
  check("alasannya ikut tercatat",
    bd.includes("sudah dibayar sebagian"), bd.slice(0, 200));
}

console.log("\n=== 6. Pengajuan yang sudah final tidak bisa diubah ===");
{
  const r = await createRequest({ startTime: "18:00", endTime: "21:00" });
  const id = r.body?.overtime?.id;

  await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "approve", approvedStartTime: "18:00", approvedEndTime: "21:00" }),
  });
  await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "report", actualStartTime: "18:00", actualEndTime: "21:00" }),
  });
  await api("u-hr-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "finalize" }),
  });

  const sudahFinal = psql(`SELECT status FROM overtime_requests WHERE id='${id}';`);
  check(`sudah finalized (${sudahFinal})`, sudahFinal === "finalized");

  for (const [label, actor, body] of [
    ["approve", "u-hr-001", { id, action: "approve", approvedStartTime: "18:00", approvedEndTime: "22:00" }],
    ["reject", "u-hr-001", { id, action: "reject", reason: "mengubah pikiran" }],
    // Pelapor harus pemiliknya. HR bukan pemilik, jadi yang diuji di sini
    // adalah transisi tahapnya — dengan aktor yang memang berhak.
    ["report", "u-staff-001", { id, action: "report", actualStartTime: "18:00", actualEndTime: "22:00" }],
    ["finalize", "u-hr-001", { id, action: "finalize", totalPayOverride: 1, overrideReason: "x" }],
  ]) {
    const res = await api(actor, "/api/overtime", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    check(`${label} setelah final ditolak (${res.status})`, res.status === 400, `status ${res.status}`);
  }

  const bayarAwal = psql(`SELECT total_overtime_pay FROM overtime_requests WHERE id='${id}';`);
  check("gaji final tidak berubah",
    psql(`SELECT total_overtime_pay FROM overtime_requests WHERE id='${id}';`) === bayarAwal,
    bayarAwal);

  const hapus = await api("u-hr-001", `/api/overtime?id=${id}`, { method: "DELETE" });
  check(`hapus permanen yang sudah final ditolak (${hapus.status})`,
    hapus.status === 400, `status ${hapus.status}`);
}

console.log("\n=== 7. Batalkan hanya bisa dari pending ===");
{
  const r = await createRequest({ startTime: "18:00", endTime: "20:00" });
  const id = r.body?.overtime?.id;

  const batal = await api("u-staff-001", `/api/overtime?id=${id}&cancel=1`, { method: "DELETE" });
  check("batal dari pending berhasil (200)", batal.status === 200, JSON.stringify(batal.envelope).slice(0, 130));
  check("status jadi cancelled",
    psql(`SELECT status FROM overtime_requests WHERE id='${id}';`) === "cancelled");

  const batalLagi = await api("u-staff-001", `/api/overtime?id=${id}&cancel=1`, { method: "DELETE" });
  check(`batal dua kali ditolak (${batalLagi.status})`, batalLagi.status === 400, `status ${batalLagi.status}`);
}

console.log("\n=== 8. Otorisasi ===");
{
  const r = await createRequest({ startTime: "18:00", endTime: "20:00" });
  const id = r.body?.overtime?.id;

  const stafApprove = await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "approve", approvedStartTime: "18:00", approvedEndTime: "20:00" }),
  });
  check(`staf tidak boleh approve (${stafApprove.status})`, stafApprove.status === 403, `status ${stafApprove.status}`);

  const stafFinalize = await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "finalize" }),
  });
  check(`staf tidak boleh finalisasi (${stafFinalize.status})`, stafFinalize.status === 403, `status ${stafFinalize.status}`);

  const stafHapus = await api("u-staff-001", `/api/overtime?id=${id}`, { method: "DELETE" });
  check(`staf tidak boleh hapus permanen (${stafHapus.status})`, stafHapus.status === 403, `status ${stafHapus.status}`);

  const stafListSemua = await api("u-staff-001", `/api/overtime?from=${HARI_KERJA}&to=${HARI_KERJA}`);
  check(`staf tidak boleh melihat semua pengajuan (${stafListSemua.status})`,
    stafListSemua.status === 403, `status ${stafListSemua.status}`);

  const stafMilik = await api("u-staff-001", "/api/overtime?scope=mine");
  check(`staf boleh melihat miliknya (${stafMilik.status})`, stafMilik.status === 200, `status ${stafMilik.status}`);
  check("idget-nya milik dia sendiri",
    (stafMilik.body?.requests ?? []).every((x) => x.userId === "u-staff-001"));

  const hrList = await api("u-hr-001", `/api/overtime?from=${HARI_KERJA}&to=${HARI_KERJA}`);
  check(`HR boleh melihat semua (${hrList.status})`, hrList.status === 200, `status ${hrList.status}`);
  check("mengembalikan pengaturan gaji dasar",
    Array.isArray(hrList.body?.settings));

  const headList = await api("u-head-001", `/api/overtime?from=${HARI_KERJA}&to=${HARI_KERJA}`);
  check(`Head tidak boleh melihat semua pengajuan (${headList.status})`,
    headList.status === 403, `status ${headList.status}`);
}

console.log("\n=== 9. Validasi masukan endpoint ===");
{
  for (const [label, path, init, expected] of [
    ["GET id bukan uuid", "/api/overtime?id=bukan-uuid", {}, 400],
    ["PATCH tanpa id", "/api/overtime", { method: "PATCH", body: JSON.stringify({ action: "approve" }) }, 400],
    ["PATCH id bukan uuid", "/api/overtime", { method: "PATCH", body: JSON.stringify({ id: "x", action: "approve" }) }, 400],
    ["PATCH aksi ngawur", "/api/overtime", { method: "PATCH", body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000000", action: "ngawur" }) }, 400],
    ["DELETE tanpa id", "/api/overtime", { method: "DELETE" }, 400],
    ["DELETE id bukan uuid", "/api/overtime?id=x", { method: "DELETE" }, 400],
    ["GET rentang terbalik", `/api/overtime?from=${TODAY}&to=${KEMARIN}`, {}, 400],
    ["GET format tanggal", "/api/overtime?from=besok", {}, 400],
  ]) {
    const r = await api("u-hr-001", path, init);
    check(`${label} → ${expected} (dapat ${r.status})`, r.status === expected, JSON.stringify(r.envelope).slice(0, 110));
  }

  const tanpaSession = await fetch(`${BASE}/api/overtime?scope=mine`);
  check(`tanpa session ditolak (${tanpaSession.status})`, tanpaSession.status === 401);
}

cleanup();
check("sisa uji dibersihkan",
  psql("SELECT count(*) FROM overtime_requests WHERE staff_notes='uji';") === "0");

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);