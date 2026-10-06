/**
 * Verifikasi: KPI read-only di halaman staf + tipe `hr` di penugasan Head.
 *
 * Dua hal yang diuji, keduanya soal yang TIDAK terlihat dari `tsc`:
 *
 * A. `pesanKpiReadonly` — satu aturan untuk tiga halaman.
 *    Dulu tiap halaman menulis string sendiri ("Akan diinput oleh HR"
 *    di satu tempat, "Diinput HR" di tempat lain). Sekarang satu fungsi.
 *
 *    Yang paling penting: **deskripsi kosong harus jatuh ke kalimat
 *    pendek, bukan jadi badge kosong.** Di produksi `lead_tim` cuma
 *    3 dari 38 yang punya deskripsi -- jadi 35 dari 38 akan kosong kalau
 *    tidak ada fallback, dan kotak kosong selalu terlihat normal.
 *
 * B. Tipe `hr` tampil di halaman penugasan Head.
 *    Dulu `byType` dan daftar yang diiterasi tidak memuat `hr`, jadi
 *    assignment `hr` yang sudah ada di database tidak pernah tampil --
 *    bukan disembunyikan, tapi tidak pernah dirender sama sekali.
 *
 * Jalankan: node scripts/verify-kpi-tampil.mjs
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
 * Fungsi diuji dipanggil langsung lewat tsx, bukan ditiru di sini.
 * Menyalin logikanya ke skrip pengujian persis jebakan yang paling
 * sering bikin test hijau padahal produknya salah (AGENTS.md 3.11):
 * test menguji salinan, bukan yang benar-benar jalan.
 */
function panggil(args) {
  return execFileSync(
    "node",
    ["node_modules/tsx/dist/cli.mjs", "scripts/_cek-pesan-kpi.ts", ...args],
    { encoding: "utf8" },
  ).trim();
}

try {
  // ══════════════════════════════════════════════════════════
  section("A. KPI yang boleh diinput staf");
  // ══════════════════════════════════════════════════════════

  check(
    "type result -> null (boleh input)",
    panggil(["result", "Kresidentasi"]) === "NULL",
    panggil(["result", "Kresidentasi"]),
  );
  check(
    "type activity -> null (boleh input)",
    panggil(["activity", "Follow up"]) === "NULL",
  );

  // ══════════════════════════════════════════════════════════
  section("B. Deskripsi ikut ditampilkan");
  // ══════════════════════════════════════════════════════════

  const dB = panggil(["hr", "Ketepatan masuk di jam 08.00 WIB", "HR"]);
  check(
    "hr + deskripsi menampilkan deskripsi",
    dB.includes("Ketepatan masuk di jam 08.00 WIB"),
    dB,
  );
  check("hr + deskripsi menyebut penilai", dB.includes("HR"), dB);

  const dH = panggil(["quality", "Tata kelola tim", "Head"]);
  check(
    "quality + deskripsi menyebut Head",
    dH.includes("Head") && dH.includes("Tata kelola tim"),
    dH,
  );

  // ══════════════════════════════════════════════════════════
  section("C. Deskripsi kosong TIDAP jadi badge kosong");
  // ══════════════════════════════════════════════════════════

  // Ini kasus 35 dari 38 KPI `lead_tim` di produksi.
  const kosong = panggil(["lead_tim", "", "HR"]);
  check(
    "deskripsi kosong tetap dapat kalimat",
    kosong === "Akan diinput oleh HR",
    `"${kosong}"`,
  );
  check("tidak ada string kosong", kosong.trim() !== "", "badge kosong terlihat normal");

  const kosongSpasi = panggil(["lead_tim", "   ", "HR"]);
  check(
    "deskripsi berisi spasi dianggap kosong",
    kosongSpasi === "Akan diinput oleh HR",
    `"${kosongSpasi}"`,
  );

  const tanpaField = panggil(["hr", undefined, "HR"]);
  check(
    "deskripsi undefined dianggap kosong",
    tanpaField === "Akan diinput oleh HR",
    `"${tanpaField}"`,
  );

  // ══════════════════════════════════════════════════════════
  section("D. Semua tipe read-only ditangani");
  // ══════════════════════════════════════════════════════════

  for (const t of ["quality", "lead_tim", "hr"]) {
    const r = panggil([t, "", t === "quality" ? "Head" : "HR"]);
    check(
      `tipe ${t} read-only`,
      r !== "NULL" && r.trim() !== "",
      `"${r}"`,
    );
  }

  // ══════════════════════════════════════════════════════════
  section("E. Kpi tidak ada");
  // ══════════════════════════════════════════════════════════

  check("kpi null -> null", panggil(["null", "", "HR"]) === "NULL");
  check("kpi undefined -> null", panggil(["undefined", "", "HR"]) === "NULL");

  // ══════════════════════════════════════════════════════════
  section("F. Halaman staf: satu aturan, bukan tiga");
  // ══════════════════════════════════════════════════════════

  const HALAMAN = [
    "src/app/dashboard/tim/page.tsx",
    "src/app/dashboard/tim/input/page.tsx",
    "src/app/dashboard/tim/kpi/page.tsx",
  ];

  for (const f of HALAMAN) {
    const src = readFileSync(f, "utf8");
    check(`${f} pakai pesanKpiReadonly`, src.includes("pesanKpiReadonly"));

    // formerly tiap halaman punya kalimatnya sendiri.
    check(
      `${f} tidak lagi punya string sendiri`,
      !/Akan diinput oleh|Diinput HR|Diinput Head/.test(src),
      "kalimat hard-coded masih ada -- aturan jadi dua lagi",
    );
  }

  // ══════════════════════════════════════════════════════════
  section("G. Halaman penugasan Head menampilkan tipe hr");
  // ══════════════════════════════════════════════════════════

  const penugasan = readFileSync("src/app/dashboard/head/penugasan/page.tsx", "utf8");

  /**
   * formerly regex `typeLabel[^=]*=\{[^}]*hr:` gagal padahal kodenya benar.
   * benar -- `Record<string, string>` ruins whatever the pattern
   * assumed about the shape of the line. Regex yang rapi di sini
   * hanya menguji tebakan tentang format.
   *
   * Sekarang yang diuji isi barisnya secara langsung, satu-
   * satu. Kalau formatnya berubah, test gagal dengan pesan yang
   * menunjuk baris mana -- bukan "regex tidak cocok".
   */
  function baris(memuat) {
    return (
      penugasan
        .split("\n")
        .find((l) => l.includes(memuat)) ?? ""
    );
  }

  /**
   *
   * `typeColor` ditulis multi-baris sementara `typeLabel` satu
   * baris. formerly keduanya diasumsikan satu baris, jadi `typeColor`
   * "tidak punya hr" padahal punya -- test yang salah menunjuk kode
   * yang benar.
   */
  function blok(memuat, maks = 20) {
    const semua = penugasan.split("\n");
    const mulai = semua.findIndex((l) => l.includes(memuat));
    if (mulai === -1) return "";
    const bagian = semua.slice(mulai, mulai + maks);
    const tutup = bagian.findIndex((l) => l.trim() === "};");
    return (tutup === -1 ? bagian : bagian.slice(0, tutup + 1)).join("\n");
  }

  const bTypeLabel = blok("const typeLabel");
  const bTypeColor = blok("const typeColor");
  const bByType = blok("const byType");

  check("typeLabel punya hr", /\bhr:/.test(bTypeLabel), bTypeLabel.trim().slice(0, 90));
  check("typeColor punya hr", /\bhr:/.test(bTypeColor), bTypeColor.trim().slice(0, 90));
  check(
    "byType memuat hr",
    /\bhr:\s*\[\]/.test(bByType),
    bByType.trim().slice(0, 110),
  );

  check(
    "daftar yang diiterasi memuat hr",
    /\["result",\s*"activity",\s*"quality",\s*"lead_tim",\s*"hr"\]/.test(penugasan),
    "hr tidak diiterasi, jadi tidak pernah dirender",
  );

  // ══════════════════════════════════════════════════════════
  section("H. Data uji: assignment hr benar-benar dirender");
  // ══════════════════════════════════════════════════════════

  // Kalau tidak ada satupun assignment hr di data uji, bagian G
  // hanya membuktikan kodenya, bukan hasilnya.
  const jmlHr = psql(
    `SELECT count(*) FROM kpi_assignments a
       JOIN kpis k ON k.id = a.kpi_id
      WHERE k.type = 'hr'`,
  );
  check("ada assignment hr di data uji", Number(jmlHr) > 0, `jumlah ${jmlHr}`);

  const jmlLeadTim = psql(
    `SELECT count(*) FROM kpi_assignments a
       JOIN kpis k ON k.id = a.kpi_id
      WHERE k.type = 'lead_tim'`,
  );
  check("ada assignment lead_tim di data uji", Number(jmlLeadTim) > 0, `jumlah ${jmlLeadTim}`);
} finally {
  console.log("");
}

console.log(`\n${pass} pass, ${fail} gagal`);
process.exit(fail === 0 ? 0 : 1);