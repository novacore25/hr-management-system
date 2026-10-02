/**
 * Verifikasi payroll (/api/payroll) —-slip gaji, pengaturan gaji dasar,
 * jenis potongan & tambahan, publish, dan slip milik staf.
 *
 * Yang diuji di sini semuanya нарушение yang dulu tidak ada penjaganya:
 *
 *  1. **Menulis slip gaji.** formerly `payrolls.insert/update(...)` dari
 *     browser tanpa cek role. Siapa pun yang punya sesi bisa menulis
 *     slip gaji siapa pun, dengan angka negatif kalau mau.
 *  2. **Slip gaji orang lain.** formerly
 *     `payrolls.select("*").eq("user_id", user.id)` dengan `user.id`
 *     dari `AuthContext`. Diubah di DevTools, slip rekan terbuka.
 *  3. **Draf HR terlihat staf.** Dulu hanya bergantung pada filter
 *     `status = "published"` dari browser.
 *  4. **Hapus slip yang sudah dipublikasikan.** Staf sudah
 *     melihatnya; menghapusnya membuat slip yang sama muncul lagi
 *     berbeda jumlah.
 *  5. **Angka negatif.** Gaji pokok, tunjangan, lembur, bonus, potongan
 *     semuanya harus >= 0.
 *
 * Jalankan: node scripts/verify-payroll.mjs
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
for (const u of ["u-hr-001", "u-exec-001", "u-staff-001", "u-staff-002"]) {
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

const YEAR = 2030;
const MONTH = 6;

/** Buang semua slip uji + jenis uji. */
function cleanup() {
  psql(`
    DELETE FROM payrolls WHERE year = ${YEAR} AND month = ${MONTH};
    DELETE FROM payroll_addition_types WHERE name LIKE 'ZZ Uji%';
    DELETE FROM payroll_deduction_types WHERE name LIKE 'ZZ Uji%';
  `);
}
cleanup();

/** Slip uji untuk satu user. Balikkan id-nya. */
function makeSlip(userId, status = "draft") {
  psql(`
    INSERT INTO payrolls (user_id, year, month, base_salary, mobility_allowance,
                          performance_bonus, overtime_pay, deductions, status,
                          snapshot_name, updated_at)
    VALUES ('${userId}', ${YEAR}, ${MONTH}, 3000000, 500000, 0, 100000, 0,
            '${status}', 'Uji', now())
    ON CONFLICT (user_id, month, year) DO UPDATE
      SET base_salary = 3000000, status = '${status}', updated_at = now();
  `);

  return psql(
    `SELECT id FROM payrolls WHERE user_id='${userId}' AND year=${YEAR} AND month=${MONTH};`,
  );
}

console.log("\n=== 1. Pengaturan gaji dasar: HR saja ===");
{
  // formerly `payroll_staff_settings.upsert(...)` dari browser tanpa cek
  // role. Staf biasa cukup membuka URL lalu mengubah gaji siapa pun.
  const staf = await api("u-staff-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({
      userId: "u-staff-002",
      defaultBaseSalary: 999999999,
      company: "Nova",
    }),
  });
  check(`staf biasa ditolak (${staf.status})`, staf.status === 403, `status ${staf.status}`);

  check("gaji dasar belum berubah",
    psql("SELECT default_base_salary::int FROM payroll_staff_settings WHERE user_id='u-staff-002';")
      !== "999999999");

  const hr = await api("u-hr-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({
      userId: "u-staff-002",
      defaultBaseSalary: 4500000,
      defaultMobilityAllowance: 400000,
      company: "TNT",
      contractPosition: "Operator",
    }),
  });
  check(`HR boleh (${hr.status})`, hr.status === 200, JSON.stringify(hr.envelope).slice(0, 150));

  const tersimpan = psql(
    "SELECT default_base_salary::int, default_mobility_allowance::int, company, contract_position FROM payroll_staff_settings WHERE user_id='u-staff-002';",
  );
  check(`benar-benar tersimpan (${tersimpan})`,
    tersimpan === "4500000|400000|TNT|Operator", `dapat ${tersimpan}`);

  for (const [label, body, expected] of [
    ["gaji negatif", { userId: "u-staff-002", defaultBaseSalary: -1 }, 400],
    ["tunjangan negatif", { userId: "u-staff-002", defaultMobilityAllowance: -1 }, 400],
    ["perusahaan ngawur", { userId: "u-staff-002", company: "PT" }, 400],
    ["user tidak ada", { userId: "tidak-ada-user", defaultBaseSalary: 1 }, 400],
    ["tanpa userId", { defaultBaseSalary: 1 }, 400],
  ]) {
    const r = await api("u-hr-001", "/api/payroll", { method: "PATCH", body: JSON.stringify(body) });
    check(`${label} → ${expected} (dapat ${r.status})`, r.status === expected, JSON.stringify(r.envelope).slice(0, 110));
    check(`  ${label}: pesan terbaca`,
      typeof r.envelope?.error === "string" && !r.envelope.error.includes("Terjadi kesalahan"),
      JSON.stringify(r.envelope?.error));
  }

  check("nilai tidak berubah setelah semua penolakan",
    psql("SELECT default_base_salary::int FROM payroll_staff_settings WHERE user_id='u-staff-002';")
      === "4500000");
}

console.log("\n=== 2. Slip gaji: hanya HR/Executive yang boleh menulis ===");
{
  const staf = await api("u-staff-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({
      action: "save",
      userId: "u-staff-001",
      year: YEAR,
      month: MONTH,
      baseSalary: 1,
    }),
  });
  check(`staf biasa tidak boleh menulis (${staf.status})`, staf.status === 403, `status ${staf.status}`);

  const eksek = await api("u-exec-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({
      action: "save",
      userId: "u-staff-001",
      year: YEAR,
      month: MONTH,
      baseSalary: 3500000,
      mobilityAllowance: 500000,
      performanceBonus: 250000,
      overtimePay: 150000,
      deductions: 100000,
      deductionNotes: "kasbon",
      systemOvertimeDays: 2,
      overtimeRate: 25000,
      systemOvertimeMinutes: 300,
      payrollOvertimeMinutes: 300,
      notes: "catatan uji",
    }),
  });
  check(`Executive boleh (${eksek.status})`, eksek.status === 200, JSON.stringify(eksek.envelope).slice(0, 150));
  check("baris benar-benar dibuat", Number(eksek.body?.payroll?.created) === 1,
    JSON.stringify(eksek.body?.payroll));

  const isi = psql(`
    SELECT base_salary::int, mobility_allowance::int, performance_bonus::int,
           overtime_pay::int, deductions::int, deduction_notes,
           system_overtime_days, overtime_rate::int, status
    FROM payrolls WHERE user_id='u-staff-001' AND year=${YEAR} AND month=${MONTH};`);
  console.log(`        ${isi}`);
  check("SEMUA kolom tersimpan, bukan hanya beberapa",
    isi === "3500000|500000|250000|150000|100000|kasbon|2|25000|draft",
    `dapat ${isi}`);
}

console.log("\n=== 3. Kolom yang dulu tidak pernah ikut tersimpan ===");
{
  // `system_overtime_days` ada di tipe TS dan dihitung di halaman, tapi
  // TIDAK PERNAH ada di payload apa pun. `deduction_notes` dikirim saat
  // publish tapi kolomnya tidak ada di tabel sama sekali.
  const isi = psql(`
    SELECT coalesce(system_overtime_days::text, 'NULL'),
           coalesce(deduction_notes, 'NULL')
    FROM payrolls WHERE user_id='u-staff-001' AND year=${YEAR} AND month=${MONTH};`);
  check(`kedua kolom benar-benar ada di database (${isi})`,
    isi === "2|kasbon", `dapat ${isi}`);
}

console.log("\n=== 4. Angka negatif ditolak ===");
{
  for (const [label, body] of [
    ["gaji pokok", { baseSalary: -1 }],
    ["tunjangan", { mobilityAllowance: -1 }],
    ["bonus", { performanceBonus: -1 }],
    ["lembur", { overtimePay: -1 }],
    ["potongan", { deductions: -1 }],
    ["tarif lembur", { overtimeRate: -1 }],
    ["menit lembur", { systemOvertimeMinutes: -1 }],
    ["hari lembur", { systemOvertimeDays: -1 }],
  ]) {
    const r = await api("u-hr-001", "/api/payroll", {
      method: "PATCH",
      body: JSON.stringify({
        action: "save",
        userId: "u-staff-001",
        year: YEAR,
        month: MONTH,
        ...body,
      }),
    });
    check(`${label} negatif ditolak (${r.status})`, r.status === 400, JSON.stringify(r.envelope).slice(0, 110));
    check(`  ${label}: pesan terbaca`,
      typeof r.envelope?.error === "string" && !r.envelope.error.includes("Terjadi kesalahan"),
      JSON.stringify(r.envelope?.error));
  }

  check("slip tidak berubah sama sekali",
    psql("SELECT base_salary::int FROM payrolls WHERE user_id='u-staff-001' AND year=" + YEAR + " AND month=" + MONTH + ";")
      === "3500000");

  for (const [label, body, expected] of [
    ["tanpa userId", { action: "save", year: YEAR, month: MONTH }, 400],
    ["bulan 13", { action: "save", userId: "u-staff-001", year: YEAR, month: 13 }, 400],
    ["tahun 1800", { action: "save", userId: "u-staff-001", year: 1800, month: 1 }, 400],
    ["aksi ngawur", { action: "ngawur", userId: "u-staff-001" }, 400],
  ]) {
    const r = await api("u-hr-001", "/api/payroll", { method: "PATCH", body: JSON.stringify(body) });
    check(`${label} → ${expected} (dapat ${r.status})`, r.status === expected, JSON.stringify(r.envelope).slice(0, 110));
  }
}

console.log("\n=== 5. Slip milik staf: tidak bisa melihat slip orang lain ===");
{
  makeSlip("u-staff-002", "draft");

  const staf = await api("u-staff-001", "/api/payroll?view=mine");
  check(`staf boleh melihat slip sendiri (${staf.status})`, staf.status === 200, `status ${staf.status}`);

  const ids = (staf.body?.payrolls ?? []).map((p) => p.userId);
  check(`hanya slip miliknya sendiri, tidak ada slip orang lain`,
    ids.every((id) => id === "u-staff-001"), JSON.stringify(ids));

  // Di titik ini slip-nya masih `draft` (publish ada di bagian 6), jadi
  // hasil yang benar justru kosong.
  check("draf HR belum terlihat (0 slip)",
    ids.length === 0, `dapat ${ids.length}: ${JSON.stringify(ids)}`);

  // formerly `.eq("user_id", user.id)` dengan `user.id` dari AuthContext.
  // Tidak ada endpoint yang menerima userId dari client -- jadi tidak
  // ada yang bisa dikirimkan.
  const paksa = await api("u-staff-001", `/api/payroll?view=mine&userId=u-staff-002`);
  check(`userId dari client diabaikan (${paksa.status})`, paksa.status === 200, `status ${paksa.status}`);
  check("masih hanya slip sendiri",
    (paksa.body?.payrolls ?? []).every((p) => p.userId === "u-staff-001"));

  // Draf HR tidak boleh terlihat.
  const draf = psql(`SELECT count(*) FROM payrolls
    WHERE user_id='u-staff-001' AND year=${YEAR} AND month=${MONTH} AND status='draft';`);
  check(`ada draf HR di database (${draf})`, draf === "1");
  check("draf TIDAK muncul untuk staf",
    (staf.body?.payrolls ?? []).every((p) => p.status === "published"),
    JSON.stringify((staf.body?.payrolls ?? []).map((p) => p.status)));
}

console.log("\n=== 6. Publish, lalu slip jadi terlihat staf ===");
{
  const publish = await api("u-hr-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({ action: "publish", year: YEAR, month: MONTH }),
  });
  check(`publish berhasil (${publish.status})`, publish.status === 200, JSON.stringify(publish.envelope).slice(0, 150));
  check(`jumlah dipublikasikan dilaporkan (${publish.body?.published})`,
    publish.body?.published === 2, `dapat ${publish.body?.published}`);

  // Snapshot dipakai supaya slip cetak tidak ikut berubah kalau data
  // karyawan berubah kemudian -- jadi saat publish nilainya diisi.
  const snap = await api("u-hr-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({
      action: "save",
      userId: "u-staff-001",
      year: YEAR,
      month: MONTH,
      baseSalary: 3500000,
      snapshotName: "Rizky Ramadhan",
      snapshotPosition: "Operator",
      snapshotCompany: "TNT",
      isPublished: true,
    }),
  });
  check(`isi snapshot saat publish (${snap.status})`, snap.status === 200, JSON.stringify(snap.envelope).slice(0, 150));

  const snapshotDb = psql(
    "SELECT snapshot_name, snapshot_position, snapshot_company FROM payrolls WHERE user_id='u-staff-001' AND year=" + YEAR + " AND month=" + MONTH + ";",
  );
  check(`snapshot tersimpan (${snapshotDb})`,
    snapshotDb === "Rizky Ramadhan|Operator|TNT", `dapat ${snapshotDb}`);

  const staf = await api("u-staff-001", "/api/payroll?view=mine");
  const slip = (staf.body?.payrolls ?? []).find((p) => p.month === MONTH && p.year === YEAR);
  check("slip sekarang terlihat", Boolean(slip), JSON.stringify((staf.body?.payrolls ?? []).map((p) => `${p.year}-${p.month}`)));
  check(`nilainya benar (${slip?.baseSalary}/${slip?.overtimePay}/${slip?.deductions})`,
    slip?.baseSalary === "3500000" && slip?.overtimePay === "150000" && slip?.deductions === "100000",
    JSON.stringify(slip)?.slice(0, 200));
  check("snapshot ikut tersimpan", slip?.snapshotName === "Rizky Ramadhan", slip?.snapshotName);
}

console.log("\n=== 7. Slip yang sudah dipublikasikan terkunci ===");
{
  // formerly `payrolls.delete().eq("id", id)` tanpa cek status, dan
  // `update(payload)` juga tanpa cek — jadi slip yang sudah dilihat staf
  // bisa hilang atau berubah tanpa jejak.
  const id = psql(`SELECT id FROM payrolls WHERE user_id='u-staff-001' AND year=${YEAR} AND month=${MONTH};`);

  const hapus = await api("u-hr-001", `/api/payroll?id=${id}`, { method: "DELETE" });
  check(`hapus slip yang sudah dipublikasikan ditolak (${hapus.status})`,
    hapus.status === 400, `status ${hapus.status}`);
  check(`pesan menjelaskan (${JSON.stringify(hapus.envelope?.error)})`,
    typeof hapus.envelope?.error === "string" && hapus.envelope.error.includes("dipublikasikan"));
  check("slip masih ada", psql(`SELECT count(*) FROM payrolls WHERE id='${id}';`) === "1");

  const ubah = await api("u-hr-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({ action: "save", userId: "u-staff-001", year: YEAR, month: MONTH, baseSalary: 1 }),
  });
  check(`ubah diam-diam ditolak (${ubah.status})`, ubah.status === 400, `status ${ubah.status}`);
  check("gaji tidak berubah",
    psql(`SELECT base_salary::int FROM payrolls WHERE id='${id}';`) === "3500000");

  // Publish ulang = perubahan sadar, dan tercatat.
  const ulang = await api("u-hr-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({
      action: "save", userId: "u-staff-001", year: YEAR, month: MONTH,
      baseSalary: 3800000, isPublished: true,
    }),
  });
  check(`publish ulang boleh (${ulang.status})`, ulang.status === 200, JSON.stringify(ulang.envelope).slice(0, 150));
  check("gaji ter-update",
    psql(`SELECT base_salary::int FROM payrolls WHERE id='${id}';`) === "3800000");

  const rusak = await api("u-hr-001", "/api/payroll?id=bukan-uuid", { method: "DELETE" });
  check(`id bukan uuid ditolak (${rusak.status})`, rusak.status === 400, `status ${rusak.status}`);

  const kosong = await api("u-hr-001", "/api/payroll", { method: "DELETE" });
  check(`tanpa id ditolak (${kosong.status})`, kosong.status === 400, `status ${kosong.status}`);
}

console.log("\n=== 8. Slip draf masih boleh dihapus ===");
{
  const id = makeSlip("u-staff-002", "draft");
  const hapus = await api("u-hr-001", `/api/payroll?id=${id}`, { method: "DELETE" });
  check(`draf boleh dihapus (${hapus.status})`, hapus.status === 200, JSON.stringify(hapus.envelope).slice(0, 130));
  check("slip hilang", psql(`SELECT count(*) FROM payrolls WHERE id='${id}';`) === "0");

  const staf = await api("u-staff-002", `/api/payroll?id=${id}`, { method: "DELETE" });
  check(`staf biasa tidak boleh hapus slip (${staf.status})`, staf.status === 403, `status ${staf.status}`);
}

console.log("\n=== 9. Otorisasi untuk baca ===");
{
  const stafSemua = await api("u-staff-001", `/api/payroll?year=${YEAR}&month=${MONTH}`);
  check(`staf tidak boleh melihat semua slip (${stafSemua.status})`,
    stafSemua.status === 403, `status ${stafSemua.status}`);

  const stafPengaturan = await api("u-staff-001", "/api/payroll?view=settings");
  check(`staf tidak boleh melihat pengaturan gaji semua orang (${stafPengaturan.status})`,
    stafPengaturan.status === 403, `status ${stafPengaturan.status}`);

  const eksek = await api("u-exec-001", `/api/payroll?year=${YEAR}&month=${MONTH}`);
  check(`Executive boleh melihat semua (${eksek.status})`, eksek.status === 200, `status ${eksek.status}`);

  const bulanBuruk = await api("u-hr-001", `/api/payroll?year=${YEAR}&month=13`);
  check(`bulan 13 ditolak (${bulanBuruk.status})`, bulanBuruk.status === 400, `status ${bulanBuruk.status}`);

  const tanpaSession = await fetch(`${BASE}/api/payroll?view=mine`);
  check(`tanpa session ditolak (${tanpaSession.status})`, tanpaSession.status === 401);
}

console.log("\n=== 10. Jenis potongan & tambahan ===");
{
  const tambah = await api("u-hr-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({ action: "addition-type", name: "ZZ Uji Bonus" }),
  });
  check(`tambah jenis tambahan (${tambah.status})`, tambah.status === 200, JSON.stringify(tambah.envelope).slice(0, 130));
  check("benar-benar tersimpan",
    psql("SELECT count(*) FROM payroll_addition_types WHERE name='ZZ Uji Bonus';") === "1");

  const potong = await api("u-hr-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({ action: "deduction-type", name: "ZZ Uji Potongan" }),
  });
  check(`tambah jenis potongan (${potong.status})`, potong.status === 200, JSON.stringify(potong.envelope).slice(0, 130));

  for (const [label, name, expected] of [
    ["nama kosong", "", 400],
    ["nama hanya spasi", "   ", 400],
    ["nama kelewat panjang", "x".repeat(200), 400],
  ]) {
    const r = await api("u-hr-001", "/api/payroll", {
      method: "PATCH",
      body: JSON.stringify({ action: "addition-type", name }),
    });
    check(`${label} → ${expected} (dapat ${r.status})`, r.status === expected, JSON.stringify(r.envelope).slice(0, 110));
  }

  const staf = await api("u-staff-001", "/api/payroll", {
    method: "PATCH",
    body: JSON.stringify({ action: "addition-type", name: "ZZ Uji Ilegal" }),
  });
  check(`staf biasa tidak boleh buat jenis baru (${staf.status})`, staf.status === 403, `status ${staf.status}`);

  const jenis = await api("u-hr-001", "/api/payroll?view=types");
  check(`daftar jenis terbaca (${jenis.status})`, jenis.status === 200, `status ${jenis.status}`);
  check("memuat tambahan uji",
    (jenis.body?.additions ?? []).some((a) => a.name === "ZZ Uji Bonus"));
  check("memuat potongan uji",
    (jenis.body?.deductions ?? []).some((d) => d.name === "ZZ Uji Potongan"));
}

cleanup();
check("semua slip uji dibersihkan",
  psql(`SELECT count(*) FROM payrolls WHERE year=${YEAR} AND month=${MONTH};`) === "0");
check("semua jenis uji dibersihkan",
  psql("SELECT (SELECT count(*) FROM payroll_addition_types WHERE name LIKE 'ZZ Uji%') + (SELECT count(*) FROM payroll_deduction_types WHERE name LIKE 'ZZ Uji%');") === "0");

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);