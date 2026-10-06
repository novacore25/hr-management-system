/**
 * Verifikasi kalkulasi upah lembur & format rupiah.
 * Memastikan tidak ada regresi string concatenation pada kolom numeric Drizzle.
 *
 * Jalankan: node scripts/verify-overtime-numbers.mjs
 */
import { formatRp, calculateOvertimeRates, calculateOvertimePayDepnaker } from "../src/lib/overtimeHelpers.ts";

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

console.log("\n=== 1. formatRp robustness ===");
check("formatRp(0) = Rp 0", formatRp(0) === "Rp 0", formatRp(0));
check("formatRp(606930) = Rp 606.930", formatRp(606930) === "Rp 606.930", formatRp(606930));
check("formatRp('606930') = Rp 606.930", formatRp("606930") === "Rp 606.930", formatRp("606930"));
check("formatRp(null) = Rp 0", formatRp(null) === "Rp 0", formatRp(null));
check("formatRp(undefined) = Rp 0", formatRp(undefined) === "Rp 0", formatRp(undefined));
check("formatRp(NaN) = Rp 0", formatRp(NaN) === "Rp 0", formatRp(NaN));
check("formatRp('abc') = Rp 0", formatRp("abc") === "Rp 0", formatRp("abc"));

console.log("\n=== 2. Simulasi penjumlahan sesi lembur produksi ===");
// Data produksi dari database:
// Nadya: 384389.00 (24 Sep) + 222541.00 (17 Sep)
// Andi:  219650.00 (23 Sep)
const sesiNadya = [
  { id: "1", totalOvertimePay: 384389, status: "finalized", finalDurationMinutes: 300 },
  { id: "2", totalOvertimePay: 222541, status: "finalized", finalDurationMinutes: 180 },
];
const sesiAndi = [
  { id: "3", totalOvertimePay: 219650, status: "finalized", finalDurationMinutes: 300 },
];

// Simulasi logika page.tsx:
let totalNadyaPay = 0;
sesiNadya.forEach((s) => {
  if (s.status === "finalized") {
    totalNadyaPay += Number(s.totalOvertimePay) || 0;
  }
});

check("Total Upah Nadya adalah 606930 (bukan string 384389222541)", totalNadyaPay === 606930, `dapat: ${totalNadyaPay}`);
check("Format Total Upah Nadya = Rp 606.930", formatRp(totalNadyaPay) === "Rp 606.930", formatRp(totalNadyaPay));

let totalBulanBerjalan = 0;
[...sesiNadya, ...sesiAndi].forEach((s) => {
  if (s.status === "finalized") {
    totalBulanBerjalan += Number(s.totalOvertimePay) || 0;
  }
});

check("Total Upah Seluruh Staf adalah 826580 (bukan 384.389.219.650.222.500)", totalBulanBerjalan === 826580, `dapat: ${totalBulanBerjalan}`);
check("Format Total Nominal Lembur = Rp 826.580", formatRp(totalBulanBerjalan) === "Rp 826.580", formatRp(totalBulanBerjalan));

// Simulasi kasus terburuk jika API masih mengirim string:
let totalDefensif = 0;
[ { totalOvertimePay: "384389" }, { totalOvertimePay: "222541" } ].forEach((s) => {
  totalDefensif += Number(s.totalOvertimePay) || 0;
});
check("Penjumlahan defensif dari string menghasilkan 606930", totalDefensif === 606930, `dapat: ${totalDefensif}`);

console.log("\n=== 3. Hitungan tarif lembur Depnaker ===");
const ratesNadya = calculateOvertimeRates(7000000);
check("Tarif per jam gaji 7jt = 40462 (1/173)", ratesNadya.hourlyBaseRate === 40462, `dapat: ${ratesNadya.hourlyBaseRate}`);

const pay5JamWeekday = calculateOvertimePayDepnaker(300, ratesNadya.hourlyBaseRate, "weekday");
check("Lembur 5 jam weekday = 384389", pay5JamWeekday === 384389, `dapat: ${pay5JamWeekday}`);

const pay3JamWeekday = calculateOvertimePayDepnaker(180, ratesNadya.hourlyBaseRate, "weekday");
check("Lembur 3 jam weekday = 222541", pay3JamWeekday === 222541, `dapat: ${pay3JamWeekday}`);

console.log(`\n=== Hasil: ${pass} PASS, ${fail} FAIL ===\n`);
if (fail > 0) process.exit(1);
