/**
 * Verifikasi laporan bug / usulan fitur.
 *
 * Fokus: laporan benar-benar tersimpan di database, dan nama/divisi/role
 * diambil server (tidak bisa dipalsukan dari request).
 *
 * Jalankan: node scripts/verify-feedbacks.mjs
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
for (const u of ["u-dev-001", "u-hr-001", "u-staff-001", "u-head-001"]) {
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

// Bersihkan sisa uji sebelumnya.
psql("DELETE FROM feedbacks;");
console.log("Sisa laporan dari uji sebelumnya: dihapus.");

console.log("\n=== 1. POST: laporan benar-benar tersimpan ===");
{
  const r = await api("u-staff-001", "/api/feedbacks", {
    method: "POST",
    body: JSON.stringify({ type: "bug", message: "Tombol Simpan diam-diam tidak menyimpan" }),
  });
  check("status 200", r.status === 200, JSON.stringify(r.envelope).slice(0, 200));

  const row = psql(
    `SELECT user_id, user_name, department, role, type, message, status
     FROM feedbacks ORDER BY created_at DESC LIMIT 1;`,
  );
  console.log(`        baris: ${row}`);
  const [userId, userName, dept, role, type, message, status] = row.split("|");

  check(`user_id dari session (${userId})`, userId === "u-staff-001");
  check(`user_name terisi dari tabel users (${userName})`, userName === "Rizky Ramadhan");
  check(`department terisi (${dept})`, dept === "TNT");
  check(`role terisi (${role})`, role === "tim");
  check(`type = bug (${type})`, type === "bug");
  check(`message tersimpan (${message})`, message.includes("tidak menyimpan"));
  check(`status awal = open (${status})`, status === "open");

  // formerly kolom-kolom ini tidak ada di schema, jadi insert selalu gagal
  // dan stub membalas error: null -> modal tetap menampilkan "berhasil".
  check("user_name TIDAK kosong (kolom ini dulu tidak ada)", userName.length > 0);
}

console.log("\n=== 2. Nama/divisi/role tidak bisa dipalsukan dari request ===");
{
  await api("u-staff-001", "/api/feedbacks", {
    method: "POST",
    body: JSON.stringify({
      type: "feature",
      message: "Minta fitur baru",
      // formerly modal mengirim ini dari AuthContext
      userName: "Nama Palsu",
      department: "Divisi Palsu",
      role: "executive",
      userId: "u-hr-001",
    }),
  });

  const row = psql(
    `SELECT user_id, user_name, department, role FROM feedbacks
     ORDER BY created_at DESC LIMIT 1;`,
  );
  const [userId, userName, dept, role] = row.split("|");
  console.log(`        baris: ${row}`);

  check(`user_id tetap milik session (${userId})`, userId === "u-staff-001");
  check(`user_name bukan "Nama Palsu" (${userName})`, userName === "Rizky Ramadhan");
  check(`department bukan "Divisi Palsu" (${dept})`, dept === "TNT");
  check(`role bukan "executive" (${role})`, role === "tim");
}

console.log("\n=== 3. Validasi input ===");
{
  const empty = await api("u-staff-001", "/api/feedbacks", {
    method: "POST",
    body: JSON.stringify({ type: "bug", message: "   " }),
  });
  check("message kosong ditolak", empty.status === 400, `status ${empty.status}`);
  check(`pesan sampai ke user (${JSON.stringify(empty.envelope?.error)})`, typeof empty.envelope?.error === "string");

  const badType = await api("u-staff-001", "/api/feedbacks", {
    method: "POST",
    body: JSON.stringify({ type: "ngawur", message: "tes" }),
  });
  check("tipe tak dikenal ditolak", badType.status === 400, `status ${badType.status}`);

  const noType = await api("u-staff-001", "/api/feedbacks", {
    method: "POST",
    body: JSON.stringify({ message: "tes tanpa tipe" }),
  });
  check("tipe kosong ditolak", noType.status === 400, `status ${noType.status}`);

  const long = await api("u-staff-001", "/api/feedbacks", {
    method: "POST",
    body: JSON.stringify({ type: "bug", message: "x".repeat(5001) }),
  });
  check("pesan kepanjangan ditolak", long.status === 400, `status ${long.status}`);

  const noAuth = await fetch(`${BASE}/api/feedbacks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "bug", message: "tanpa session" }),
  });
  check("tanpa session ditolak (401)", noAuth.status === 401, `status ${noAuth.status}`);
}

console.log("\n=== 4. GET: hanya developer boleh membaca ===");
{
  const dev = await api("u-dev-001", "/api/feedbacks");
  check("developer boleh (200)", dev.status === 200, JSON.stringify(dev.body).slice(0, 150));
  check(`daftar tidak kosong (${dev.body?.feedbacks?.length} laporan)`, (dev.body?.feedbacks?.length ?? 0) > 0);

  const first = dev.body.feedbacks[0];
  check(
    "createdAt adalah ISO string yang bisa diformat (bukan objek Timestamp)",
    typeof first?.createdAt === "string" && !Number.isNaN(Date.parse(first.createdAt)),
    JSON.stringify(first?.createdAt),
  );
  check(
    "createdAt bisa diformat jadi tanggal Indonesia",
    new Date(first.createdAt).toLocaleDateString("id-ID").length > 0,
    new Date(first.createdAt).toLocaleDateString("id-ID"),
  );

  for (const role of ["u-hr-001", "u-staff-001", "u-head-001"]) {
    const r = await api(role, "/api/feedbacks");
    check(`${role} ditolak (403)`, r.status === 403, `status ${r.status}`);
  }

  const noAuth = await fetch(`${BASE}/api/feedbacks`);
  check("tanpa session ditolak (401)", noAuth.status === 401, `status ${noAuth.status}`);
}

console.log("\n=== 5. Urutan: terbaru dulu ===");
{
  await api("u-staff-001", "/api/feedbacks", {
    method: "POST",
    body: JSON.stringify({ type: "other", message: "Laporan paling lama" }),
  });
  const newest = psql("SELECT message FROM feedbacks ORDER BY created_at DESC LIMIT 1;");
  check(`yang terbaru = "Laporan paling lama" (${newest})`, newest === "Laporan paling lama");

  const r = await api("u-dev-001", "/api/feedbacks");
  check(
    "API mengembalikan urutan yang sama dengan query",
    r.body.feedbacks[0].message === "Laporan paling lama",
    r.body.feedbacks[0].message,
  );
}

console.log("\n=== 6. PATCH status: hanya developer, dan benar-benar tersimpan ===");
{
  const id = psql("SELECT id FROM feedbacks ORDER BY created_at LIMIT 1;");
  const before = psql(`SELECT status FROM feedbacks WHERE id='${id}';`);

  const dev = await api("u-dev-001", "/api/feedbacks", {
    method: "PATCH",
    body: JSON.stringify({ id, status: "in_progress" }),
  });
  check("developer boleh mengubah (200)", dev.status === 200, JSON.stringify(dev.envelope).slice(0, 150));

  const after = psql(`SELECT status FROM feedbacks WHERE id='${id}';`);
  check(`status tersimpan: ${before} -> ${after}`, after === "in_progress");

  const bad = await api("u-dev-001", "/api/feedbacks", {
    method: "PATCH",
    body: JSON.stringify({ id, status: "ngawur" }),
  });
  check("status tak dikenal ditolak", bad.status === 400, `status ${bad.status}`);

  const ghost = await api("u-dev-001", "/api/feedbacks", {
    method: "PATCH",
    body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000", status: "resolved" }),
  });
  check("id tidak ada ditolak dengan jelas", ghost.status === 400, `status ${ghost.status}`);

  for (const role of ["u-hr-001", "u-staff-001"]) {
    const r = await api(role, "/api/feedbacks", {
      method: "PATCH",
      body: JSON.stringify({ id, status: "rejected" }),
    });
    check(`${role} tidak boleh mengubah status (403)`, r.status === 403, `status ${r.status}`);
  }

  const untouched = psql(`SELECT status FROM feedbacks WHERE id='${id}';`);
  check(`status tidak berubah oleh percobaan yang ditolak (${untouched})`, untouched === "in_progress");
}

console.log("\n=== 7. Constraint database ikut menutup jalur lain ===");
{
  // Validasi di DAL sudah menolak, tapi CHECK menutup psql manual / impor.
  const before = psql("SELECT count(*) FROM feedbacks;");
  let ditolak = false;
  try {
    psql(
      `INSERT INTO feedbacks (user_id, user_name, type, message, status)
       VALUES ('u-staff-001','Tes','ngawur','tes','open');`,
    );
  } catch {
    // PostgreSQL menulis "ERROR: violates check constraint" ke stderr —
    // itu justru yang kita hopes here. Ditelan supaya tidak mengira gagal.
    ditolak = true;
  }
  check("type di luar daftar ditolak oleh CHECK", ditolak);
  check(
    `jumlah baris tidak bertambah (${before})`,
    psql("SELECT count(*) FROM feedbacks;") === before,
  );
}

// Bersihkan.
psql("DELETE FROM feedbacks;");
check("sisa uji dibersihkan", psql("SELECT count(*) FROM feedbacks;") === "0");

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
