/**
 * Bandingkan definisi kolom & FK antara Supabase dan produksi kita.
 *
 * Hasilnya dipakai untuk menuliskan kolom yang hilang ke
 * `src/db/schema.ts` -- dengan TIPE, DEFAULT, dan NULLABILITY yang
 * diambil apa adanya dari Supabase, bukan ditebak.
 *
 * Jalankan:
 *   node scripts/plan-schema-gap.mjs < hasil-ekspor-defs.txt>
 */
import { readFileSync } from "node:fs";

// PENTING 1: file hasil redirect PowerShell (`ssh ... > file.txt`)
// ditulis sebagai UTF-16LE dengan BOM, bukan UTF-8. Kalau dibaca
// sebagai utf8, hasilnya byte dengan nol di antaranya -- semua
// perbandingan string gagal, semua section jadi kosong, dan
// kesimpulannya "0 kolom hilang" yang terlihat seperti skema kita
// sudah lengkap.
//
// PENTING 2: CRLF. Kalau dipecah hanya dengan "\n", tiap baris
// masih membawa "\r".
const buf = readFileSync(process.argv[2]);
const utf16 = buf[0] === 0xff && buf[1] === 0xfe;
const text = utf16 ? buf.toString("utf16le").replace(/^\uFEFF/, "") : buf.toString("utf8");
console.log(`(encoding: ${utf16 ? "UTF-16LE" : "UTF-8"})`);
const lines = text.split(/\r?\n/);

function section(name) {
  const start = lines.findIndex((l) => l.trim() === `@@${name}@@`);
  if (start < 0) {
    console.error(`  (section ${name} tidak ditemukan)`);
    return [];
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("@@") && l.endsWith("@@"));
  return (end < 0 ? rest : rest.slice(0, end))
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseCols(rows) {
  const m = new Map();
  for (const r of rows) {
    const p = r.split("~");
    if (p.length < 4) continue;
    m.set(`${p[0]}.${p[1]}`, {
      table: p[0],
      col: p[1],
      type: p[2],
      nullable: p[3],
      def: p[4] ?? "-",
    });
  }
  return m;
}

// Baris FK punya 4 field: table~kolom~tabel_tujuan~kolom_tujuan.
// Bentuknya BEDA dari baris kolom (yang 5 field), jadi tidak boleh
// diparse dengan fungsi yang sama -- kalau begitu, kolom tujuan FK
// akan terbaca sebagai kolom tujuan yang tidak ada.
function parseFks(rows) {
  const m = new Map();
  for (const r of rows) {
    const p = r.split("~");
    if (p.length < 4) continue;
    m.set(`${p[0]}.${p[1]}`, {
      table: p[0],
      col: p[1],
      toTable: p[2],
      toCol: p[3],
    });
  }
  return m;
}

const sbCols = parseCols(section("SUPABASE_COLS"));
const loCols = parseCols(section("LOCAL_COLS"));
const sbFks = parseFks(section("SUPABASE_FKS"));
const loFks = parseFks(section("LOCAL_FKS"));

console.log(
  `Supabase: ${sbCols.size} kolom, ${sbFks.size} FK | ` +
    `kita: ${loCols.size} kolom, ${loFks.size} FK`,
);

const missingCols = [...sbCols.keys()].filter((k) => !loCols.has(k)).sort();
const missingFks = [...sbFks.keys()].filter((k) => !loFks.has(k)).sort();

console.log(`\n=== KOLOM HANYA DI SUPABASE (${missingCols.length}) ===`);
const perTable = new Map();
for (const k of missingCols) {
  const d = sbCols.get(k);
  if (!perTable.has(d.table)) perTable.set(d.table, []);
  perTable.get(d.table).push(d);
}
for (const [tbl, list] of [...perTable.entries()].sort()) {
  console.log(`\n  ${tbl}  (${list.length})`);
  for (const d of list) {
    const nn = d.nullable === "YES" ? "NULL-ABLE" : "not null";
    console.log(
      `    ${d.col.padEnd(28)} ${d.type.padEnd(26)} ${nn.padEnd(11)} default=${d.def}`,
    );
  }
}

console.log(`\n=== FK HANYA DI SUPABASE (${missingFks.length}) ===`);
for (const k of missingFks) {
  const d = sbFks.get(k);
  console.log(`  ${d.table}.${d.col} -> ${d.toTable}.${d.toCol}`);
}

console.log(`\n=== FK HANYA DI KITA (tambahan, boleh) ===`);
const extraFks = [...loFks.keys()].filter((k) => !sbFks.has(k)).sort();
for (const k of extraFks) {
  const d = loFks.get(k);
  console.log(`  ${d.table}.${d.col} -> ${d.toTable}.${d.toCol}`);
}

// Guard: kalau tidak ada yang hilang, hampir pasti parsing-nya salah
// (bukan karena skema kita benar-benar lengkap).
if (missingCols.length === 0) {
  console.error(
    "\nABORT: 0 kolom hilang. Hampir pasti parsing-nya gagal, " +
      "bukan berarti skema kita benar-benar lengkap.",
  );
  process.exit(1);
}