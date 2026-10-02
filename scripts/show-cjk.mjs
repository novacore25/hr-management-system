/**
 * Sekali jalan: laporkan karakter non-Latin yang nyasar, dengan
 * escaped codepoint supaya bisa dibaca di konsol PowerShell.
 *
 * PowerShell merender CJK sebagai "?" atau kotak, jadi karakter aslinya
 * tidak terlihat di output read. Escaped codepoint membuatnya jelas.
 */
import { readFileSync } from "node:fs";

const p = process.argv[2] ?? "AGENTS.md";
const lines = readFileSync(p, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  const baris = lines[i];
  // CJK, Hangul, Kana, fullwidth, Latin-Extended.
  const m = baris.match(/[\u2E80-\u9FFF\uAC00-\uD7AF\u3040-\u30FF\uFF00-\uFFEF\u0100-\u017F]/gu);
  if (!m) continue;

  const unik = [...new Set(m)];
  const ket = unik.map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(", ");
  console.log(`\n${i + 1}: [${ket}]`);
  // Tampilkan konteks dengan karakter asing diganti penanda.
  console.log("   " + baris.replace(/[\u2E80-\u9FFF\uAC00-\uD7AF\u3040-\u30FF\uFF00-\uFFEF\u0100-\u017F]/gu, (c) => `<U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}>`));
}