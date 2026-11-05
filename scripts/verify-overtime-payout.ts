import { readFileSync, existsSync } from "node:fs";

console.log("=== VERIFIKASI KEBIJAKAN PENJADWALAN PENCAIRAN LEMBUR (PAYOUT SCHEDULE) ===");
let pass = 0;
let fail = 0;

function assert(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  PASS  ${name}`);
    pass++;
  } else {
    console.error(`  FAIL  ${name} — ${detail}`);
    fail++;
  }
}

// 1. Verifikasi Migration File 0021
console.log("\n1. File Migrasi SQL 0021");
assert(
  "File drizzle/0021_overtime_payout_schedule.sql harus ada",
  existsSync("drizzle/0021_overtime_payout_schedule.sql")
);

const migrationSql = readFileSync("drizzle/0021_overtime_payout_schedule.sql", "utf8");
assert(
  "Migration menambahkan kolom payout_month",
  migrationSql.includes('"payout_month" integer')
);
assert(
  "Migration menambahkan kolom payout_year",
  migrationSql.includes('"payout_year" integer')
);
assert(
  "Migration menambahkan kolom payout_status default pending_payout",
  migrationSql.includes('"payout_status" varchar(32) NOT NULL DEFAULT \'pending_payout\'')
);
assert(
  "Migration menambahkan kolom payout_scheduled_at & payout_scheduled_by",
  migrationSql.includes('"payout_scheduled_at"') && migrationSql.includes('"payout_scheduled_by"')
);
assert(
  "Migration menambahkan indeks payout",
  migrationSql.includes('"overtime_requests_payout_idx"')
);
assert(
  "Backfill data historis sebelum Oktober 2026 otomatis di-set paid",
  migrationSql.includes("WHERE \"status\" = 'finalized'") &&
  migrationSql.includes("\"overtime_date\" < '2026-10-01'") &&
  migrationSql.includes("\"payout_status\" = 'paid'")
);
assert(
  "Backfill data Oktober 2026 ke depan di-set pending_payout",
  migrationSql.includes("\"overtime_date\" >= '2026-10-01'") &&
  migrationSql.includes("\"payout_status\" = 'pending_payout'")
);

// 2. Verifikasi Schema Drizzle
console.log("\n2. Schema Drizzle (src/db/schema.ts)");
const schemaCode = readFileSync("src/db/schema.ts", "utf8");
assert(
  "overtimeRequests schema memiliki payoutMonth",
  schemaCode.includes('payoutMonth: integer("payout_month")')
);
assert(
  "overtimeRequests schema memiliki payoutYear",
  schemaCode.includes('payoutYear: integer("payout_year")')
);
assert(
  "overtimeRequests schema memiliki payoutStatus",
  schemaCode.includes('payoutStatus: varchar("payout_status", { length: 32 })')
);
assert(
  "overtimeRequests schema memiliki indeks overtime_requests_payout_idx",
  schemaCode.includes('payoutIdx: index("overtime_requests_payout_idx")')
);

// 3. Verifikasi Types
console.log("\n3. Tipe Data Absensi (src/types/absensi.ts)");
const typesCode = readFileSync("src/types/absensi.ts", "utf8");
assert(
  "OvertimeRequest memiliki tipe payoutMonth & payoutYear",
  typesCode.includes("payoutMonth?: number | null") && typesCode.includes("payoutYear?: number | null")
);
assert(
  "OvertimeRequest memiliki tipe payoutStatus",
  typesCode.includes('payoutStatus?: "pending_payout" | "scheduled" | "paid"')
);
assert(
  "rowToOvertimeRequest memetakan payoutMonth & payoutYear secara aman",
  typesCode.includes("payoutMonth:              row.payout_month != null ? Number(row.payout_month) : null") &&
  typesCode.includes("payoutYear:               row.payout_year != null ? Number(row.payout_year) : null")
);

// 4. DAL Overtime
console.log("\n4. DAL Overtime (src/server/dal/overtime.ts)");
const dalOtCode = readFileSync("src/server/dal/overtime.ts", "utf8");
assert(
  "overtimeSelect memilih kolom-kolom payout",
  dalOtCode.includes("payoutMonth: overtimeRequests.payoutMonth") &&
  dalOtCode.includes("payoutYear: overtimeRequests.payoutYear") &&
  dalOtCode.includes("payoutStatus: overtimeRequests.payoutStatus")
);
assert(
  "toOvertime memetakan payout fields",
  dalOtCode.includes("payoutMonth: row.payoutMonth") &&
  dalOtCode.includes('payoutStatus: (row.payoutStatus as "pending_payout" | "scheduled" | "paid")')
);
assert(
  "finalizeOvertime menerapkan pemisahan kebijakan lama vs baru (2026-10-01)",
  dalOtCode.includes('current.overtimeDate < "2026-10-01"')
);
assert(
  "finalizeOvertime: lembur Oktober 2026 ke depan tidak langsung paid",
  dalOtCode.includes('payoutStatus = "pending_payout"')
);
assert(
  "scheduleOvertimePayout mengecek ot.status === 'finalized'",
  dalOtCode.includes('current.status !== "finalized"') &&
  dalOtCode.includes("Hanya lembur yang sudah SAH")
);
assert(
  "scheduleOvertimePayout mendukung pembatalan/penahanan jadwal (payoutYear=null)",
  dalOtCode.includes('payoutStatus: "pending_payout"')
);
assert(
  "bulkScheduleOvertimePayout tersedia untuk penjadwalan massal",
  dalOtCode.includes("export async function bulkScheduleOvertimePayout")
);

// 5. Verifikasi DAL Payroll
console.log("\n5. DAL Payroll (src/server/dal/payroll.ts)");
const dalPayrollCode = readFileSync("src/server/dal/payroll.ts", "utf8");
assert(
  "listFinalizedOvertime memfilter lembur berdasarkan payout_year dan payout_month",
  dalPayrollCode.includes("payoutYear, year") &&
  dalPayrollCode.includes("payoutMonth, month")
);
assert(
  "listFinalizedOvertime mendukung fallback legacy untuk lembur sebelum Oktober 2026",
  dalPayrollCode.includes('overtimeRequests.overtimeDate, "2026-10-01"')
);
assert(
  "publishPayrolls otomatis menandai lembur yang terjadwal menjadi status 'paid'",
  dalPayrollCode.includes('payoutStatus: "paid"')
);

// 6. Verifikasi Route Handlers
console.log("\n6. Route Handlers (src/app/api/overtime/route.ts)");
const apiOtCode = readFileSync("src/app/api/overtime/route.ts", "utf8");
assert(
  "API Overtime menangani action schedule-payout",
  apiOtCode.includes('case "schedule-payout":')
);
assert(
  "API Overtime menangani action bulk-schedule-payout",
  apiOtCode.includes('b.action === "bulk-schedule-payout"')
);

// 7. Verifikasi UI & Keamanan Privasi Nominal
console.log("\n7. UI Admin & Privasi Nominal");
const adminOtPage = readFileSync("src/app/absensi/admin/overtime/page.tsx", "utf8");
assert(
  "Modal OvertimePayoutScheduleModal di-render di halaman admin",
  adminOtPage.includes("<OvertimePayoutScheduleModal")
);
assert(
  "Tombol jadwal cair / ubah jadwal tersedia untuk status finalized",
  adminOtPage.includes("setSchedulingReq(session)") &&
  adminOtPage.includes('session.payoutStatus === "scheduled" ? "Ubah Jadwal" : "Cairkan di Payroll"')
);
assert(
  "Nominal terbuka tidak dipamerkan sembarangan pada badge status (cukup status SAH)",
  adminOtPage.includes("Final Sah") &&
  adminOtPage.includes("Belum Dijadwalkan Cair")
);

const staffSectionCode = readFileSync("src/components/absensi/OvertimeStaffSection.tsx", "utf8");
assert(
  "Riwayat staf menampilkan status sah dan bulan slip pencairan tanpa nominal vulgar",
  staffSectionCode.includes("Status: Upah Sah") &&
  staffSectionCode.includes("req.payoutStatus === \"scheduled\"")
);

console.log(`\n=== Hasil: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
