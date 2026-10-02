/**
 * Guard dokumentasi: cek bahwa STATUS.md tidak berbohong tentang
 * dirinya sendiri.
 *
 * Kenapa perlu?
 *
 * Sejarah: STATUS.md sempat menulis "component pendukung yang juga masih
 * pakai stub: DailyInputForm, DailyReportsViewer, KpiFormPage,
 * FeedbackModal" — padahal semuanya sudah selesai. Pembaca (atau AI
 * berikutnya) yang percaya akan mengerjakan pekerjaan yang sudah beres,
 * atau_fraction menganggap fitur belum ada.
 *
 * Tiga kelas yang dicek:
 *
 *  1. **Klaim basi.** Kalimat "masih pakai stub" / "belum selesai" yang
 *     ada di dokumen padahal sudah tidak benar.
 *  2. **Angka yang basi.** Jumlah assert yang tidak sama dengan
 *     `npm run verify:*`.
 *  3. **Judul yang tertimpa.** Dua bagian berbeda dengan nama yang
 *     sama atau salah, karena blok di tengah pernah diganti tanpa
 *     melihat baris di bawahnya.
 *
 * Selain itu dicek juga karakter non-Latin yang nyasar — beberapa kali
 * karakter CJK masuk ke komentar Indonesia lewat tool edit, dan hasilnya
 * terlihat seperti "`该` ada di" — membingungkan, dan tidak pernah
 * dikompilasi sehingga tidak ketahuan.
 *
 * Jalankan: npm run verify:docs
 */
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = "docs";

const FILES = [
  "docs/STATUS.md",
  "docs/DEPLOY.md",
  "docs/DECISIONS.md",
  "docs/LOCAL-TESTING.md",
  "AGENTS.md",
  "README.md",
].filter((f) => {
  try {
    readFileSync(f);
    return true;
  } catch {
    return false;
  }
});

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

const status = readFileSync("docs/STATUS.md", "utf8");

console.log("\n=== 1. Klaim basi: tidak boleh ada yang bilang masih pakai stub ===");
{
  const pola = /Component pendukung yang juga masih pakai stub/gi;
  const cocok = status.match(pola);
  check(
    "tidak ada daftar komponen 'masih pakai stub'",
    cocok === null,
    cocok ? `ditemukan: ${cocok[0]}` : "",
  );

  // Kalau daftarnya muncul, pastikan setiap nama di dalamnya memang
  // sudah selesai -- kalau belum, allowlist-nya yang salah, bukan
  // dokumennya.
  const allow = readFileSync("scripts/verify-no-stub.ts", "utf8");
  const masihAda = allow.match(/const ALLOWLIST: string\[\] = \[([\s\S]*?)\]/);
  const isiAllowlist =
    masihAda && masihAda[1].trim() ? masihAda[1] : "";
  check(
    "ALLOWLIST di verify-no-stub.ts kosong (konsisten dengan STATUS.md)",
    isiAllowlist.trim() === "",
    `isi: ${isiAllowlist.trim().slice(0, 80)}`,
  );
}

console.log("\n=== 2. Angka verify harus sama dengan yang benar-benar jalan ===");
{
  // Ambil blok "## Verifikasi" dan cocokkan jumlah yang ditulis di
  // komentar tiap baris perintah dengan hasil skrip yang sebenarnya.
  //
  // Formatnya: `npm run verify:endpoints    # 24  amplop, status, isi data`
  const blok = status.split("## Verifikasi")[1] ?? "";
  const klaim = [...blok.matchAll(/verify:(\w+)\s+#\s*(\d+)/g)];

  check(
    `blok Verifikasi memuat klaim jumlah assert (${klaim.length} ditemukan)`,
    klaim.length >= 8,
    klaim.length < 8 ? "pola `verify:x   # N` tidak cocok" : "",
  );

  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const [, nama, angka] of klaim) {
    // Skrip ini memanggil skrip verify yang lain untuk mengecek angka
    // yang tertulis di dokumen. Kalau dia memanggil dirinya sendiri,
    // prosesnya bercabang terus sampai kehabisan memori.
    if (nama === "docs") {
      check("verify:docs tidak memanggil dirinya sendiri", true);
      continue;
    }

    const script = pkg.scripts?.[`verify:${nama}`];
    if (!script) {
      check(`verify:${nama} ada di package.json`, false, script || "tidak ada");
      continue;
    }

    let output = "";
    try {
      output = execFileSync("node", [script.split(" ").pop()], {
        encoding: "utf8",
        timeout: 300_000,
      });
    } catch (e) {
      output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }

    const hasil = output.match(/(\d+) pass/);
    check(
      `verify:${nama} benar-benar ${hasil?.[1]} pass (dokumen bilang ${angka})`,
      hasil?.[1] === angka,
      hasil ? `dapat ${hasil[1]}` : "tidak bisa dijalankan",
    );
  }
}

console.log("\n=== 3. Judul bagian harus unik dan tidak tertimpa ===");
{
  const judul = [...status.matchAll(/^#{2,4} (.+)$/gm)].map((m) => m[1].trim());
  const duplikat = judul.filter((h, i) => judul.indexOf(h) !== i);
  check(
    `tidak ada judul duplikat (${judul.length} judul)`,
    duplikat.length === 0,
    duplikat.length ? JSON.stringify([...new Set(duplikat)]) : "",
  );

  // Setiap fase yang dipesan di tabel navigasi harus punya bagiannya.
  //
  // Catatan: heading boleh menggabungkan dua fase ("Fase 4c-a & 4c-b"),
  // jadi yang dicek adalah token fase-nya ADA di salah satu heading --
  // bukan harus diawali kata "Fase".
  const headings = [...status.matchAll(/^#{2,4} (.+)$/gm)].map((m) => m[1]);
  const faseTabel = [...status.matchAll(/^\| (\d+[a-z]?(?:-[a-z])?) \|/gm)].map(
    (m) => m[1],
  );
  const hilang = faseTabel.filter((f) => {
    // Fase 0-3 punya baris infrastruktur, bukan bagian bug terpisah.
    if (["0", "1", "2", "3"].includes(f)) return false;
    return !headings.some((h) => h.includes(f));
  });
  check(
    "semua fase di tabel navigasi punya bagian",
    hilang.length === 0,
    JSON.stringify(hilang),
  );
}

console.log("\n=== 4. Rujukan ke file lain harus benar ===");
{
  const semuaMd = [
    ...FILES,
    ...readdirSync("scripts").filter((f) => f.endsWith(".md")),
  ];
  const ada = new Set(
    semuaMd.flatMap((f) => {
      const isi = readFileSync(f, "utf8");
      return [...isi.matchAll(/`((?:docs|scripts|src|drizzle)\/[a-zA-Z0-9_\-./()]+)`/g)].map(
        (m) => m[1],
      );
    }),
  );

  const hilangRef = [];
  const cekRef = [...ada]
    .sort()
    // Wildcard bukan path yang bisa di-stat, dan path yang berakhiran
    // "/" adalah folder (bukan file) -- keduanya bukan rujukan rusak.
    .filter((r) => !r.includes("*") && !r.endsWith("/"));
  for (const ref of cekRef) {
    try {
      readFileSync(ref);
    } catch {
      hilangRef.push(ref);
    }
  }
  check(
    `${cekRef.length} rujukan file di dokumentasi semuanya ada`,
    hilangRef.length === 0,
    JSON.stringify(hilangRef),
  );
}

console.log("\n=== 5. Tidak boleh ada karakter non-Latin ===");
{
  for (const f of FILES) {
    const isi = readFileSync(f, "utf8");
    const baris = isi.split("\n");
    const buruk = [];
    for (let i = 0; i < baris.length; i++) {
      // CJK, Hangul, Kana, fullwidth, Latin-Extended.
      if (/[\u2E80-\u9FFF\uAC00-\uD7AF\u3040-\u30FF\uFF00-\uFFEF\u0100-\u017F]/u.test(baris[i])) {
        buruk.push(`${i + 1}: ${baris[i].trim().slice(0, 70)}`);
      }
    }
    check(`${f} bersih (${isi.split("\n").length} baris)`, buruk.length === 0, buruk.join(" | "));
  }
}

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);