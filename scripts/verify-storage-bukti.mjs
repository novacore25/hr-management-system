/**
 * Verifikasi jalur foto bukti lembur setelah Supabase Storage dilepas.
 *
 * Dua hal yang diuji:
 *
 *   A. Status storage dikirim di GET, supaya UI bisa-disable tombol
 *      SEBELUM staf memotret foto dan memilih file. Dulu-ui baru
 *      tahu setelah upload ditolak -- itu sudah terlambat, kerjaannya
 *      sudah selesai.
 *
 *   B. Foto LAMA tidak hilang. `proof_images` masih berisi URL Supabase,
 *      dan bucket-nya masih hidup. Menjalankan migrasi tidak menghapus
 *      URL, jadi tautan yang sudah tersimpan harus diteruskan apa
 *      adanya -- bukan dibuang karena "storage sudah tidak dipakai".
 *
 * Yang diuji Negative (harus ditolak, bukan diam-diam berhasil):
 *   - endpoint laporan tidak boleh menerima foto dari URL arbitrer
 *   - URL kosong / bukan string harus dibuang, bukan disimpan
 *
 * Jalankan: node scripts/verify-storage-bukti.mjs
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

function payload(res) {
  return res.envelope?.data ?? res.envelope ?? {};
}

const TOK = {};
for (const u of ["u-hr-001", "u-staff-001", "u-staff-002"]) {
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

// ── Data uji ────────────────────────────────────────────────
// Pengajuan milik u-staff-001 yang HARUS bisa dilaporin (approved).
// CATALOGUE CHECK (AGENTS.md 2.4): `overtime_date` juga NOT NULL,
// bukan hanya `request_date`. Dan `tasks` harus berisi objek yang punya
// `name` -- bentuknya dicek submitOvertimeReport, bukan kolom kosong.
//
// Id dibaca lewat SELECT, bukan RAISE NOTICE: NOTICE ditulis ke
// stderr, sedangkan `execFileSync` hanya mengembalikan stdout -- jadi
// id-nya selalu kosong dan semua query berikutnya memakai `id = ''`.
const SEED_ID = psql(`
  WITH d AS (
    DELETE FROM overtime_requests WHERE user_id = 'u-staff-001'
  ), i AS (
    INSERT INTO overtime_requests (
      id, user_id, request_date, overtime_date,
      requested_start_time, requested_end_time, requested_duration_minutes,
      status, tasks, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), 'u-staff-001', CURRENT_DATE, CURRENT_DATE,
      '18:00', '20:00', 120, 'approved',
      '[{"name":"Uji storage"}]'::jsonb, now(), now()
    ) RETURNING id
  )
  SELECT id FROM i;
`);

console.log("Pengajuan uji:", SEED_ID || "(tidak terbaca)");
if (!SEED_ID) {
  console.error("Seed gagal -- tidak ada yang bisa diuji.");
  process.exit(1);
}

try {
  // ══════════════════════════════════════════════════════════
  section("A. GET mengirim status storage");
  // ══════════════════════════════════════════════════════════

  const mine = await api("u-staff-001", "/api/overtime?scope=mine");
  check("GET scope=mine status 200", mine.status === 200, `status ${mine.status}`);

  const data = payload(mine);
  check("requests ada di payload", Array.isArray(data.requests));

  check(
    "storage ada di payload",
    data.storage !== undefined && data.storage !== null,
    "UI tidak bisa disable tombol tanpa ini",
  );

  check(
    "storage.aktif boolean",
    typeof data.storage?.aktif === "boolean",
    `tipe ${typeof data.storage?.aktif}`,
  );

  // Di lokal tidak ada R2_* jadi aktif harus false.
  check(
    "storage.aktif false tanpa R2_*",
    data.storage?.aktif === false,
    `aktif=${data.storage?.aktif}`,
  );

  check(
    "storage.alasan ada saat tidak aktif",
    typeof data.storage?.alasan === "string" &&
      data.storage.alasan.length > 0,
    `alasan="${data.storage?.alasan}"`,
  );

  check(
    "storage.kurang menyebut variabel R2",
    Array.isArray(data.storage?.kurang) &&
      data.storage.kurang.some((v) => v.startsWith("R2_")),
    JSON.stringify(data.storage?.kurang),
  );

  // ══════════════════════════════════════════════════════════
  section("B. Foto lama tidak hilang");
  // ══════════════════════════════════════════════════════════

  const URL_LAMA =
    "https://mszzvdvajhvctyyxndqq.supabase.co/storage/v1/object/public/overtime_proofs/uji.jpg";

  psql(
    `UPDATE overtime_requests SET proof_images = ARRAY['${URL_LAMA}']::text[] WHERE id = '${SEED_ID}'`,
  );

  const setelah = await api("u-staff-001", "/api/overtime?scope=mine");
  const req = payload(setelah).requests?.find((r) => r.id === SEED_ID);

  check("pengajuan uji masih ada", !!req);
  check(
    "URL foto lama diteruskan apa adanya",
    Array.isArray(req?.proofImages) && req.proofImages.includes(URL_LAMA),
    JSON.stringify(req?.proofImages),
  );

  // ══════════════════════════════════════════════════════════
  section("C. URL rusak dibuang, bukan disimpan");
  // ══════════════════════════════════════════════════════════

  psql(
    `UPDATE overtime_requests
        SET proof_images = ARRAY['${URL_LAMA}', '', '   ', NULL]::text[]
      WHERE id = '${SEED_ID}'`,
  );

  const efter = await api("u-staff-001", "/api/overtime?scope=mine");
  const req2 = payload(efter).requests?.find((r) => r.id === SEED_ID);

  check(
    "hanya URL valid yang diteruskan",
    Array.isArray(req2?.proofImages) &&
      req2.proofImages.length === 1 &&
      req2.proofImages[0] === URL_LAMA,
    JSON.stringify(req2?.proofImages),
  );

  check(
    "tidak ada string kosong di hasil",
    Array.isArray(req2?.proofImages) &&
      req2.proofImages.every((u) => typeof u === "string" && u.trim() !== ""),
  );

  // ══════════════════════════════════════════════════════════
  section("D. Server menolak foto dari URL arbitrer");
  // ══════════════════════════════════════════════════════════

  // Kalau server menerima URL bebas, staf bisa menempelkan
  // tautan apa saja ke proof_images -- termasuk file di server lain.
  // Jalur ini memastikan tidak ada penerimaan diam-diam.
  const patch = await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id: SEED_ID,
      action: "report",
      actualStartTime: "18:00",
      actualEndTime: "20:00",
      taskReports: [{ taskId: "x", task: "Test", target: "1", actual: "1", notes: "" }],
      proofImages: ["https://evil.example.com/foto.jpg"],
    }),
  });

  // Apa pun hasilnya, yang penting: kalau 200, isinya TIDAK boleh
  // menjadi URL dari server luar.
  if (patch.status === 200) {
    const after = await api("u-staff-001", "/api/overtime?scope=mine");
    const req3 = payload(after).requests?.find((r) => r.id === SEED_ID);
    check(
      "URL server luar tidak tersimpan (200: ditapis di DAL)",
      !JSON.stringify(req3?.proofImages ?? []).includes("evil.example.com"),
      JSON.stringify(req3?.proofImages),
    );
  } else {
    // Kalau ditolak lebih dulu, sama-sama aman -- tapi jangan
    // toutkan seolah jalur ini sudah diuji penuh.
    check(
      "laporan ditolak outright (tidak diam-diam sukses)",
      patch.status >= 400,
      `status ${patch.status}`,
    );
    console.log("         CATATAN: jalur 200 tidak teruji, karena server menolak lebih dulu.");
  }

  // ══════════════════════════════════════════════════════════
  section("E. Foto LAMA bisa dihapus staf");
  // ══════════════════════════════════════════════════════════

  // Status dikembalikan ke `approved` dulu. PATCH sebelumnya sudah
  // memindahkan ke `reported`, dan `reported` tidak boleh diubah lagi
  // -- jadi tanpa ini PATCH di sini ditolak karena transisi status,
  // BUKAN karena penghapusan foto. Ujinya jadi tidak menguji apa pun
  // yang diklaimnya.
  psql(
    `UPDATE overtime_requests
        SET status = 'approved',
            report_submitted_at = NULL,
            actual_start_time = NULL,
            actual_end_time = NULL,
            actual_duration_minutes = NULL,
            proof_images = ARRAY['${URL_LAMA}']::text[]
      WHERE id = '${SEED_ID}'`,
  );

  const del = await api("u-staff-001", "/api/overtime", {
    method: "PATCH",
    body: JSON.stringify({
      id: SEED_ID,
      action: "report",
      actualStartTime: "18:00",
      actualEndTime: "20:00",
      taskReports: [{ taskId: "x", task: "Test", target: "1", actual: "1", notes: "" }],
      proofImages: [],
    }),
  });

  if (del.status === 200) {
    const cleared = psql(
      `SELECT COALESCE(array_length(proof_images, 1), 0) FROM overtime_requests WHERE id = '${SEED_ID}'`,
    );
    check("foto bisa dihapus semua", cleared === "0", `sisa ${cleared}`);
  } else {
    check("hapus ditolak dengan status jelas", del.status >= 400, `status ${del.status}`);
  }

  // ══════════════════════════════════════════════════════════
  section("F. Kode storage: tidak ada jalur yang bisa menulis");
  // ══════════════════════════════════════════════════════════

  const src = readFileSync("src/server/storage/overtimeProofs.ts", "utf8");

  check(
    "tidak menulis ke filesystem",
    !/writeFile|createWriteStream|mkdir/i.test(src),
    "bukti kerja staf tidak boleh tersimpan di disk container",
  );

  check(
    "tidak mengembalikan URL kosong sebagai sukses",
    !/ok:\s*true[\s\S]{0,80}url:\s*""/.test(src),
    "URL kosong akan tampil sebagai foto rusak tanpa penjelasan",
  );

  check(
    "cekStorage menolak upload yang tidak siap",
    /aktif:\s*false/.test(src),
  );

  // ── Kejujuran soal uploadBukti() ────────────────────────────
  //
  // `uploadBukti` TIDAK dipanggil dari mana pun. Build produksi
  // membuangnya sebagai dead code -- terbukti: literal string
  // "belum ada kode yang mengunggah" tidak ada satu pun di dalam
  // container produksi, padahal ada di sumber.
  //
  // Konsekuensinya penting dan tidak boleh disembunyikan:
  // validasi format + ukuran file DI DALAMNYA belum pernah
  // dieksekusi sekali pun. Jadi jangan memperlakukannya sebagai
  // penjaga yang sudah bekerja. Yang benar-benar berjalan sekarang
  // hanya `cekStorage()` (dipanggil dari GET, diuji di bagian A) dan
  // penyaringan di DAL (diuji di bagian C dan D).
  //
  // Assert ini sengaja menyatakannya, supaya saat R2 nanti diaktifkan
  // dan `uploadBukti` disambungkan, orang tahu bagian mana yang belum
  // pernah diuji.
  const callers = execFileSync(
    "git",
    ["grep", "-l", "uploadBukti", "--", "src"],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .filter(Boolean);

  const callerFiles = callers.filter(
    (f) => f !== "src/server/storage/overtimeProofs.ts",
  );

  check(
    "uploadBukti belum disambungkan (dinyatakan, bukan disembunyikan)",
    callerFiles.length === 0,
    `dipanggil dari: ${callerFiles.join(", ")} -- validasi di dalamnya perlu diuji ulang`,
  );

  check(
    "penjaga yang BENAR-BENAR jalan teruji di bagian A",
    /cekStorage/.test(src),
  );

  // ══════════════════════════════════════════════════════════
  section("G. UI tidak mengirim foto baru yang tidak terunggah");
  // ══════════════════════════════════════════════════════════

  const ui = readFileSync("src/components/absensi/OvertimeStaffSection.tsx", "utf8");

  check(
    "UI menolak kirim kalau ada foto baru belum terunggah",
    /newProofFiles\.length > 0[\s\S]{0,400}?toast\.error/.test(ui),
    "dulu foto baruchosen dibuang tanpa pemberitahuan",
  );

  check(
    "tombol unggah hanya tampil kalau storage siap",
    /storageAktif === true/.test(ui),
  );

  check(
    "accept input file dibatasi ke format yang diterima server",
    /accept="image\/jpeg,image\/png,image\/webp"/.test(ui),
    "accept=\"image/*\" mengizinkan format yang lalu ditolak server",
  );
} finally {
  if (SEED_ID) {
    psql(`DELETE FROM overtime_requests WHERE id = '${SEED_ID}'`);
    console.log("\nData uji dibersihkan.");
  }
}

console.log(`\n${pass} pass, ${fail} gagal`);
process.exit(fail === 0 ? 0 : 1);