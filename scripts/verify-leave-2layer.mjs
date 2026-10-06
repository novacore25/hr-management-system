/**
 * Verifikasi persetujuan cuti 2 tahap.
 *
 * Fokus: apa yang SEHARUSNYA ditolak, bukan hanya apa yang berjalan.
 * Test yang hanya memeriksa jalur sukses akan lolos untuk sistem yang
 * persetujuan 2 tahapnya sebenarnya sudah jadi 1 tahap -- karena
 * approve langsung ke `approved` selalu "berhasil".
 *
 * Jalankan: node scripts/verify-leave-2layer.mjs
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

/**
 * Ambil isi dari amplop denganAuth.
 *
 * withAuth selalu membungkus hasil handler jadi { ok: true, data } --
 * kecuali kalau handler mengembalikan Response sendiri, yang langsung
 * dikembalikan apa adanya (AGENTS.md 3.5). Jadi test harus melepas
 * satu lapisan, atau setiap id akan jadi undefined dan setiap query
 * berikutnya gagal dengan "invalid input syntax for type uuid".
 */
function payload(res) {
  return res.envelope?.data ?? res.envelope ?? {};
}

/** Tanggal kerja di masa depan, menghindari akhir pekan. */
function workingDay(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const TOK = {};
for (const u of ["u-staff-001", "u-exec-001", "u-hr-001", "u-head-001"]) {
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
    envelope = { raw: text.slice(0, 160) };
  }
  return { status: res.status, envelope };
}

function quotaOf(userId) {
  return psql(
    `SELECT leave_quota || '|' || sick_quota FROM users WHERE id='${userId}';`,
  );
}

function rowOf(id) {
  return psql(
    `SELECT status || '|' || coalesce(deducted_leave,-1) || '|' || coalesce(executive_status,'~')
     || '|' || coalesce(hr_status,'~') || '|' || coalesce(rejection_stage,'~')
     FROM leave_requests WHERE id='${id}';`,
  );
}

async function submit(userId, date, type = "leave") {
  const r = await api(userId, "/api/absensi/leave", {
    method: "POST",
    body: JSON.stringify({ type, dates: [date], reason: "uji 2 tahap" }),
  });
  return r;
}

function bersihkan(id) {
  if (!id) return;
  psql(`DELETE FROM leave_requests WHERE id='${id}';`);
}

// ═══════════════════════════════════════════════════════════════
section("1. Pengajuan oleh staf");
// ═══════════════════════════════════════════════════════════════

const tgl = workingDay(30);
const quotaSebelum = quotaOf("u-staff-001");
console.log(`  kuota sebelum: ${quotaSebelum}`);

const submit1 = await submit("u-staff-001", tgl);
check("staf bisa mengajukan (200)", submit1.status === 200, JSON.stringify(submit1.envelope).slice(0, 140));
const id1 = payload(submit1).request?.id;
check("pengajuan dapat id", !!id1);
check("status awal pending", rowOf(id1).startsWith("pending|"), rowOf(id1));
check("belum ada potongan kuota", rowOf(id1).split("|")[1] === "0", rowOf(id1));
check("kuota staff belum berubah", quotaOf("u-staff-001") === quotaSebelum, quotaOf("u-staff-001"));

// ═══════════════════════════════════════════════════════════════
section("2. HR TIDAK boleh menyetujui tahap 1");
// ═══════════════════════════════════════════════════════════════

const hrSalah = await api("u-hr-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id1, action: "approve" }),
});
// 400, bukan 403. Route memetakan role -> tahap, jadi HR dipetakan ke
// tahap 'hr', lalu DAL menolak karena statusnya masih 'pending'. Itu
// penolakan STATE, bukan permission -- dan pesannya lebih berguna:
// 'menunggu executive', bukan 'Anda tidak berhak'. 403 tetap dipakai
// untuk orang yang role-nya tidak punya tahap sama sekali (bagian 3).
check("HR mencoba approve tahap 1 DITOLAK (400)", hrSalah.status === 400, `status ${hrSalah.status}`);
check("pesan menyebut pengajuan masih di tahap executive",
  typeof hrSalah.envelope?.error === "string" && hrSalah.envelope.error.includes("approved_executive"),
  JSON.stringify(hrSalah.envelope).slice(0, 160));
check("status tetap pending setelah percobaan HR", rowOf(id1).startsWith("pending|"), rowOf(id1));

// ═══════════════════════════════════════════════════════════════
section("3. Head (admin tapi bukan executive/hr) juga DITOLAK");
// ═══════════════════════════════════════════════════════════════

const headSalah = await api("u-head-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id1, action: "approve" }),
});
check("head mencoba approve DITOLAK (403)", headSalah.status === 403, `status ${headSalah.status}`);
check("status tetap pending", rowOf(id1).startsWith("pending|"), rowOf(id1));

// ═══════════════════════════════════════════════════════════════
section("4. Executive menyetujui tahap 1 -- kuota TIDAK boleh dipotong");
// ═══════════════════════════════════════════════════════════════

const exec1 = await api("u-exec-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id1, action: "approve", notes: "setuju tahap 1" }),
});
check("executive approve tahap 1 (200)", exec1.status === 200, JSON.stringify(exec1.envelope).slice(0, 160));

const r1 = rowOf(id1);
console.log(`  baris: ${r1}`);
check("status jadi approved_executive", r1.split("|")[0] === "approved_executive", r1);
check("executive_status = approved", r1.split("|")[2] === "approved", r1);
// DEFAULT kolom hr_status adalah 'pending' (dibuktikan dari
// information_schema), jadi baris baru memang mulai di 'pending'.
// Meng attendu NULL akan salah.
check("hr_status masih pending sesuai default kolom", r1.split("|")[3] === "pending", r1);
check("BELUM ada potongan kuota di tahap 1", r1.split("|")[1] === "0", r1);
check("kuota staff masih belum berubah", quotaOf("u-staff-001") === quotaSebelum, quotaOf("u-staff-001"));

const namaExec = psql(`SELECT coalesce(executive_approved_by_name,'~') || '|' || coalesce(executive_approved_at::text,'~') FROM leave_requests WHERE id='${id1}';`);
console.log(`  executive_approved_by_name: ${namaExec}`);
check("nama executive tersimpan (bukan UUID)", namaExec.split("|")[0] !== "~", namaExec);
check("waktu persetujuan tersimpan", namaExec.split("|")[1] !== "~", namaExec);

// ═══════════════════════════════════════════════════════════════
section("5. Executive tidak boleh advance dua kali");
// ═══════════════════════════════════════════════════════════════

const exec2 = await api("u-exec-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id1, action: "approve" }),
});
check("approve kedua ditolak (400)", exec2.status === 400, `status ${exec2.status}`);
check("pesan menyebut approved_executive",
  typeof exec2.envelope?.error === "string" && exec2.envelope.error.includes("approved_executive"),
  JSON.stringify(exec2.envelope).slice(0, 160));

// ═══════════════════════════════════════════════════════════════
section("6. Executive TIDAK boleh menyetujui tahap 2");
// ═══════════════════════════════════════════════════════════════

const execHr = await api("u-exec-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id1, action: "approve" }),
});
check("executive mencoba approve lagi di tahap HR DITOLAK", execHr.status === 400 || execHr.status === 403,
  `status ${execHr.status}`);
check("status belum jadi approved", rowOf(id1).split("|")[0] === "approved_executive", rowOf(id1));

// ═══════════════════════════════════════════════════════════════
section("7. HR menyetujui tahap 2 -- di SINI kuota dipotong");
// ═══════════════════════════════════════════════════════════════

const hr1 = await api("u-hr-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id1, action: "approve", notes: "final approve" }),
});
check("HR approve tahap 2 (200)", hr1.status === 200, JSON.stringify(hr1.envelope).slice(0, 160));

const r2 = rowOf(id1);
console.log(`  baris: ${r2}`);
console.log(`  kuota sesudah: ${quotaOf("u-staff-001")}`);
check("status jadi approved", r2.split("|")[0] === "approved", r2);
check("hr_status = approved", r2.split("|")[3] === "approved", r2);
check("potongan tercatat di tahap 2", Number(r2.split("|")[1]) === 1, r2);

const [leaveSebelum] = quotaSebelum.split("|").map(Number);
const kuotaSetelahTahap1 = quotaOf("u-staff-001");
const [leaveSesudah] = kuotaSetelahTahap1.split("|").map(Number);
check("leave_quota staff berkurang tepat 1", leaveSesudah === leaveSebelum - 1,
  `${leaveSebelum} -> ${leaveSesudah}`);

const namaHr = psql(`SELECT coalesce(hr_approved_by_name,'~') FROM leave_requests WHERE id='${id1}';`);
check("nama HR tersimpan", namaHr !== "~", namaHr);

// ═══════════════════════════════════════════════════════════════
section("8. HR tidak boleh advance dua kali -- kuota tidak boleh terpotong lagi");
// ═══════════════════════════════════════════════════════════════

const hr2 = await api("u-hr-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id1, action: "approve" }),
});
check("approve kedua oleh HR ditolak (400)", hr2.status === 400, `status ${hr2.status}`);
const [leaveSesudah2] = quotaOf("u-staff-001").split("|").map(Number);
check("kuota TIDAK terpotong dua kali", leaveSesudah2 === leaveSesudah, `${leaveSesudah} -> ${leaveSesudah2}`);

// ═══════════════════════════════════════════════════════════════
section("9. Jalur tolak di tahap 1 -- tidak ada potongan");
// ═══════════════════════════════════════════════════════════════

const tgl2 = workingDay(31);
const qBefore2 = quotaOf("u-staff-002");
const s2 = await submit("u-staff-001", tgl2);
const id2 = payload(s2).request?.id;
const rej1 = await api("u-exec-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id2, action: "reject", notes: "tidak disetujui" }),
});
check("executive reject tahap 1 (200)", rej1.status === 200, JSON.stringify(rej1.envelope).slice(0, 140));
const r3 = rowOf(id2);
console.log(`  baris: ${r3}`);
check("status jadi rejected", r3.split("|")[0] === "rejected", r3);
check("rejection_stage = executive", r3.split("|")[4] === "executive", r3);
check("TIDAK ada potongan", r3.split("|")[1] === "0", r3);
check("kuota staff tidak berubah", quotaOf("u-staff-001") === kuotaSetelahTahap1, quotaOf("u-staff-001"));

// HR tidak boleh menyetujui yang sudah ditolak
const hrAfterReject = await api("u-hr-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id2, action: "approve" }),
});
check("HR tidak bisa menyetujui yang sudah ditolak", hrAfterReject.status === 400,
  `status ${hrAfterReject.status}`);

// ═══════════════════════════════════════════════════════════════
section("10. Jalur tolak di tahap 2 -- executive sudah setuju, HR menolak");
// ═══════════════════════════════════════════════════════════════

const tgl3 = workingDay(32);
const s3 = await submit("u-staff-001", tgl3);
const id3 = payload(s3).request?.id;
await api("u-exec-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id3, action: "approve" }),
});
check("tahap 1 OK", rowOf(id3).split("|")[0] === "approved_executive", rowOf(id3));
check("masih tanpa potongan", rowOf(id3).split("|")[1] === "0", rowOf(id3));

const qBefore3 = quotaOf("u-staff-001");
const rej2 = await api("u-hr-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: id3, action: "reject", notes: "kuota tidak cukup" }),
});
check("HR reject tahap 2 (200)", rej2.status === 200, JSON.stringify(rej2.envelope).slice(0, 140));
const r4 = rowOf(id3);
console.log(`  baris: ${r4}`);
check("status jadi rejected", r4.split("|")[0] === "rejected", r4);
check("rejection_stage = hr", r4.split("|")[4] === "hr", r4);
check("TIDAK ada potongan meski executive sudah setuju", r4.split("|")[1] === "0", r4);
check("kuota staff tidak berubah", quotaOf("u-staff-001") === qBefore3, quotaOf("u-staff-001"));

// ═══════════════════════════════════════════════════════════════
section("11. Funnel di view=approvals");
// ═══════════════════════════════════════════════════════════════

// Dua pengajuan BARU khusus untuk memeriksa funnel.
//
// Versi ini memakai id2 dan id3, tapi keduanya sudah ditolak di bagian
// 9 dan 10 -- jadi tidak ada yang bisa muncul di funnel mana pun.
// Bukan karena funnel-nya salah, tapi karena yang dicek sudah tidak
// ada di sana.
// workingDay(33) dan workingDay(34) bisa menghasilkan tanggal yang SAMA
// setelah weekend dilewati: kalau 33 jatuh Sabtu dan 34 Minggu,
// keduanya melompat ke Senin. createLeaveRequest lalu menolak yang
// kedua dengan 'sudah ada pengajuan aktif', dan id-nya undefined.
// Jarak 40 dan 47 tidak pernah bertabrakan setelah lompatan itu.
const idFunnel1 = payload(await submit("u-staff-001", workingDay(40))).request?.id;
check("fixture funnel 1 dibuat", !!idFunnel1, String(idFunnel1));
const idFunnel2 = payload(await submit("u-staff-001", workingDay(47))).request?.id;
check("fixture funnel 2 dibuat", !!idFunnel2, String(idFunnel2));
await api("u-exec-001", "/api/absensi/leave", {
  method: "PATCH",
  body: JSON.stringify({ id: idFunnel2, action: "approve" }),
});
check("fixture funnel: idFunnel2 sudah di tahap HR", rowOf(idFunnel2).split("|")[0] === "approved_executive", rowOf(idFunnel2));

const approvals = await api("u-hr-001", "/api/absensi/leave?view=approvals");
check("view=approvals bisa diakses HR", approvals.status === 200, `status ${approvals.status}`);
const a = payload(approvals);
check("ada field pending (tahap 1)", Array.isArray(a.pending));
check("ada field waitingHr (tahap 2)", Array.isArray(a.waitingHr));
check("ada hrAvailable", typeof a.hrAvailable === "boolean", JSON.stringify(a).slice(0, 120));
check("hrAvailable = true karena u-hr-001 aktif", a.hrAvailable === true, `hrCount=${a.hrCount}`);
const pendingIds = new Set((a.pending ?? []).map((x) => x.id));
const waitingIds = new Set((a.waitingHr ?? []).map((x) => x.id));
check("pengajuan pending muncul di funnel tahap 1", pendingIds.has(idFunnel1));
check("pengajuan approved_executive muncul di funnel tahap 2", waitingIds.has(idFunnel2));
check("approved tidak muncul di funnel", !pendingIds.has(id1) && !waitingIds.has(id1));
check("yang ditolak tidak muncul di funnel",
  !pendingIds.has(id2) && !waitingIds.has(id2) && !pendingIds.has(id3) && !waitingIds.has(id3));

// ═══════════════════════════════════════════════════════════════
section("12. Field 2 tahap terkirim ke klien");
// ═══════════════════════════════════════════════════════════════

const one = await api("u-staff-001", "/api/absensi/leave?mine=1");
const daftar = payload(one).requests ?? [];
const c1 = daftar.find((x) => x.id === id1);
check("pengajuan yang disetujui ada di mine=1", !!c1);
if (c1) {
  console.log(`  executiveApprovedByName=${c1.executiveApprovedByName} hrApprovedByName=${c1.hrApprovedByName}`);
  check("executiveApprovedByName terkirim", !!c1.executiveApprovedByName);
  check("hrApprovedByName terkirim", !!c1.hrApprovedByName);
  check("executiveApprovedAt berupa ISO string",
    typeof c1.executiveApprovedAt === "string" && c1.executiveApprovedAt.includes("T"),
    String(c1.executiveApprovedAt));
  check("hrApprovedAt berupa ISO string",
    typeof c1.hrApprovedAt === "string" && c1.hrApprovedAt.includes("T"),
    String(c1.hrApprovedAt));
  check("deductedLeave = 1", Number(c1.deductedLeave) === 1, String(c1.deductedLeave));
}

// ═══════════════════════════════════════════════════════════════
section("13. Kebersihan");
//
// Bagian ini HARUS menghapus, bukan hanya menghitung. Versi pertama
// cuma menghitung sisa fixture dan membandingkan kuota -- jadi test
// selalu meninggalkan 5 pengajuan dan kuota staff berkurang 1, dan
// run berikutnya mulai dari kondisi yang sudah rusak.
//
// Kuota dipulihkan eksplisit karena menghapus baris leave_requests
// TIDAK mengembalikan kuota: kuota ada di tabel users, terpisah dari
// pengajuannya.
const [leaveAwal, sickAwal] = quotaSebelum.split("|").map(Number);
psql(`
  DELETE FROM leave_requests WHERE reason = 'uji 2 tahap';
  UPDATE users SET leave_quota = ${leaveAwal}, sick_quota = ${sickAwal}
   WHERE id = 'u-staff-001';
`);

const sisa = psql(`SELECT count(*) FROM leave_requests WHERE reason='uji 2 tahap';`);
check("semua fixture dibersihkan", Number(sisa) === 0, `sisa ${sisa}`);
const kuotaAkhir = quotaOf("u-staff-001");
check("kuota staff kembali seperti semula", kuotaAkhir === quotaSebelum,
  `${quotaSebelum} -> ${kuotaAkhir}`);

// ===============================================================
section("14. Halaman approvals benar-benar merender");
// ===============================================================
//
// Halaman ini 91 KB JSX, dan perubahan terakhirnya menambah seksi
// baru. "Build hijau" tidak membuktikan apa pun soal JSX yang salah
// tempat: ikon yang tidak ada, atau kondisi yang tidak pernah
// tercapai, keduanya lolos dari tsc dan next build.
//
// Yang diperiksa: server mengembalikan HTML untuk setiap role, dan
// tidak ada teks error di dalamnya. Isi funnel tidak diperiksa lewat
// HTML karena halaman ini client-side -- datanya diambil setelah
// mount, jadi tidak ada di HTML awal. Yang diprogram ulang di
// server sudah diperiksa di bagian 1-12.

async function halaman(userId) {
  const res = await fetch(`${BASE}/absensi/admin/approvals`, {
    headers: { cookie: `authjs.session-token=${TOK[userId]}` },
    redirect: "manual",
  });
  return { status: res.status, html: await res.text() };
}

const polaError = /Application error|Something went wrong|Internal Server Error/;

const hExec = await halaman("u-exec-001");
check("halaman terbuka untuk executive (200)", hExec.status === 200, `status ${hExec.status}`);
check("halaman executive tidak menampilkan error server",
  !polaError.test(hExec.html),
  hExec.html.match(polaError)?.[0] ?? "");
check("halaman executive punya CSS ter-load",
  /stylesheet|\/_next\/static\/css/.test(hExec.html));

const hHr = await halaman("u-hr-001");
check("halaman terbuka untuk HR (200)", hHr.status === 200, `status ${hHr.status}`);
check("halaman HR tidak menampilkan error server",
  !polaError.test(hHr.html),
  hHr.html.match(polaError)?.[0] ?? "");

const hHead = await halaman("u-head-001");
check("halaman terbuka untuk head (200)", hHead.status === 200, `status ${hHead.status}`);

const hAnon = await fetch(`${BASE}/absensi/admin/approvals`, { redirect: "manual" });
check("tanpa sesi tidak mendapat 200", hAnon.status !== 200, `status ${hAnon.status}`);
console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);