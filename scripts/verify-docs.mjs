/**
 * Guard dokumentasi: cek bahwa dokumentasi tidak berbohong tentang
 * dirinya sendiri.
 *
 * Kenapa perlu?
 *
 * Sejarah: STATUS.md sempat menulis daftar komponen "yang masih pakai
 * stub" padahal semuanya sudah selesai. Pembaca (atau AI berikutnya) yang
 * percaya akan mengerjakan pekerjaan yang sudah beres.
 *
 * Yang dicek:
 *
 *  1. Klaim basi, dan konsistensi dengan ALLOWLIST di verify-no-stub.ts.
 *  2. Setiap jumlah assert yang tertulis di STATUS.md dibandingkan dengan
 *     hasil skrip yang benar-benar jalan. "65 assert" tidak bisa lagi
 *     jadi 35 tanpa ketahuan.
 *  3. Judul bagian unik; setiap fase di tabel navigasi punya bagian.
 *  4. Semua rujukan path benar-benar ada -- termasuk yang ber-backslash.
 *  5. Tidak ada karakter non-Latin di dokumen ATAU di guard ini.
 *
 * Dua jebakan yang sudah terjadi:
 *
 * - PENTING: skrip ini memanggil skrip `verify:*` yang lain, jadi skrip ini
 *   sendiri harus dikecualikan. Kalau tidak, prosesnya bercabang tanpa
 *   henti (lihat AGENTS.md 3.17).
 * - Semua suite perilaku butuh dev server di 127.0.0.1:3100. Kalau mati,
 *   mereka membalas 0 assert -- dan guard harus menyalahkan server,
 *   bukan dokumen (lihat AGENTS.md 3.12).
 *
 * Jalankan: npm run verify:docs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
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
  const tidakJalan = [];
  const nolPass = [];
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

    // PENTING: bedakan "angka di dokumen salah" dari "skripnya tidak
    // jalan sama sekali".
    //
    // Semua suite perilaku memanggil dev server di 127.0.0.1:3100.
    // Kalau server mati, mereka membalas 0 pass atau tidak menghasilkan
    // output sama sekali. Tanpa pembedaan, guard melaporkan "dokumen
    // bilang 24, dapat 0" -- yang mengarah ke dokumen. Padahal
    // dokumennya benar; server-nya yang mati.
    //
    // Sabotase yang sama sudah pernah terjadi sekali: `.next` tercemar
    // membuat semua endpoint membalas 500, jadi setiap suite dapat 0
    // pass, dan 9 assert gagal sekaligus. Semuanya satu penyebab.
    if (!hasil) {
      tidakJalan.push(nama);
      check(
        `verify:${nama} menghasilkan output yang bisa dibaca`,
        false,
        "tidak ada pola 'N pass' sama sekali",
      );
      continue;
    }

    if (Number(hasil[1]) === 0) {
      nolPass.push(nama);
      check(
        `verify:${nama} menjalankan assert (dokumen bilang ${angka} pass)`,
        false,
        "0 pass",
      );
      continue;
    }

    check(
      `verify:${nama} benar-benar ${hasil[1]} pass (dokumen bilang ${angka})`,
      hasil[1] === angka,
      `dapat ${hasil[1]}, dokumen ${angka}`,
    );
  }

  if (tidakJalan.length > 0 || nolPass.length > 0) {
    const gabungan = [...tidakJalan, ...nolPass];
    console.log(
      `\n  CATATAN: ${gabungan.length} skrip tidak menghasilkan assert\n` +
        `  sama sekali: ${gabungan.join(", ")}\n` +
        `\n` +
        `  Semua suite perilaku butuh dev server. Perbaiki dulu:\n` +
        `    Stop-Process -Name node -Force\n` +
        `    Remove-Item -Recurse -Force .next\n` +
        `    npx next dev -p 3100\n` +
        `\n` +
        `  Angka di STATUS.md belum tentu salah. Guard ini tidak bisa\n` +
        `  membandingkan kalau skripnya tidak jalan sama sekali.`,
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

  // PENTING: backslash ikut diterima.
  //
  // Dokumentasi ini ditulis di Windows, jadi penulisan path-nya bisa
  // `scripts\vps\inspect.sh`. Versi pertama dari guard ini hanya
  // mencari garis miring, sehingga SEMUA rujukan ber-backslash tidak
  // terlihat sama sekali -- dan rujukan yang benar-benar rusak
  // (nama filenya salah ketik) lolos begitu saja.
  //
  // Perbaikan ini ketemu bukan karena guard-nya, tapi karena `scp`
  // gagal saat dicoba manual. Guard hanya menemukan bug kalau
  // benar-benar ada -- bukan berarti guard sudah cukup.
  // Dua bentuk penulisan yang harus sama-sama dipindai:
  //
  //   1. di dalam backtick   `scripts/vps/vps-health.sh`
  //   2. polos di blok kode   scp scripts/vps/vps-health.sh ...
  //
  // Bentuk kedua dulu TIDAK terlihat sama sekali -- dan justru di
  // situ nama file yang salah ketik berada. `scp` yang gagal tidak
  // merusak apa pun, jadi tidak ada yang ingat sampai dibutuhkan.
  const AKAR = "(?:docs|scripts|src|drizzle)";
  const KAKS = "[a-zA-Z0-9_\\-./\\\\]+";
  const pola = [
    new RegExp("`(" + AKAR + "[\\\\/]" + KAKS + ")`", "g"),
    new RegExp("(?<=^|[ \t(])(" + AKAR + "[\\\\/]" + KAKS + ")(?=$|[ \t)'\"])", "gm"),
  ];

  const semua = [];
  for (const x of semuaMd) {
    const isi = readFileSync(x, "utf8");
    for (const re of pola) {
      for (const s of isi.matchAll(re)) {
        if (!s[1].includes("${")) semua.push([x, s[1]]);
      }
    }
  }

  const hilangRef = [];
  const cek = new Set();
  let folderDitemukan = 0;
  let placeholder = 0;
  for (const [dari, ref] of semua) {
    // Normalisasi ke garis miring supaya bisa di-stat di semua OS.
    const norm = ref.replace(/\\/g, "/");
    // `...` dan `*` adalah placeholder, bukan path.
    if (norm.includes("*")) continue;
    if (norm.includes("...")) {
      placeholder++;
      continue;
    }
    cek.add(norm);
    try {
      // File: harus bisa dibaca.
      readFileSync(norm);
    } catch {
      try {
        // Folder: sahaja ada, tapi tidak bisa di-read.
        if (statSync(norm).isDirectory()) {
          folderDitemukan++;
          continue;
        }
      } catch {
        // bukan file dan bukan folder -> benar-benar hilang.
      }
      hilangRef.push(norm + "  (disebut di " + dari + ")");
    }
  }

  const backslash = semua.filter(function (p) {
    return p[1].indexOf("\\") >= 0;
  }).length;
  console.log(
    "  (menemukan " + semua.length
      + " rujukan path; " + backslash + " memakai backslash; "
      + cek.size + " dicek, " + folderDitemukan + " folder, "
      + placeholder + " placeholder)",
  );

  check(
    cek.size + " rujukan file di dokumentasi semuanya ada",
    hilangRef.length === 0,
    hilangRef.join(" | "),
  );
}



console.log("\n=== 5. Tidak boleh ada karakter non-Latin ===");
{
  // Daftar file yang diperiksa.
  //
  // WAWARN: skrip ini sendiri ikut masuk daftar. Versi pertama hanya
  // mengecek dokumen, dan header skrip ini sendiri sempat bringing
  // karakter CJK tanpa ada yang melihat selama berminggu-minggu.
  // Guard yang tidak memeriksa dirinya sendiri punya celah persis di
  // tempat yang paling mungkin salah.
  const PERIKSA = [
    ...FILES,
    // Skrip yang disebut DEPLOY.md untuk dijalankan orang.
    ...readdirSync("scripts/vps")
      .filter((x) => x.endsWith(".sh"))
      .map((x) => "scripts/vps/" + x),
    "scripts/verify-docs.mjs",
    "scripts/show-cjk.mjs",
  ].filter((x) => {
    try {
      readFileSync(x);
      return true;
    } catch {
      return false;
    }
  });

  for (const x of PERIKSA) {
    const isi = readFileSync(x, "utf8");
    const baris = isi.split("\n");
    const buruk = [];
    for (let i = 0; i < baris.length; i++) {
      // CJK, Hangul, Kana, fullwidth, Latin-Extended.
      if (/[\u2E80-\u9FFF\uAC00-\uD7AF\u3040-\u30FF\uFF00-\uFFEF\u0100-\u017F]/u.test(baris[i])) {
        buruk.push(i + 1 + ": " + baris[i].trim().slice(0, 70));
      }
    }
    check(x + " bersih (" + baris.length + " baris)", buruk.length === 0, buruk.join(" | "));
  }
}


console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);