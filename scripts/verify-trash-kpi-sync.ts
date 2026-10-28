import { readFileSync, existsSync } from "node:fs";
import { pesanKpiReadonly } from "../src/lib/utils";

console.log("=== VERIFIKASI SINKRONISASI KPI SAMPAH & PENUGASAN STAF ===");
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

// 1. Uji pesanKpiReadonly untuk KPI di sampah
console.log("\n1. pesanKpiReadonly - Deteksi KPI Sampah");
assert(
  "KPI dengan deletedAt menghasilkan pesan 'KPI Dihapus / Masuk Sampah'",
  pesanKpiReadonly({
    status: "active",
    type: "result",
    deletedAt: "2026-10-28T04:00:00Z",
  }) === "KPI Dihapus / Masuk Sampah",
);
assert(
  "KPI normal active result tetap menghasilkan null (bisa diisi)",
  pesanKpiReadonly({
    status: "active",
    type: "result",
    deletedAt: null,
  }) === null,
);

// 2. Verifikasi DAL assignments.ts
console.log("\n2. Server DAL assignments.ts");
const assignmentsDal = readFileSync("src/server/dal/assignments.ts", "utf8");

assert(
  "assignmentSelect menyertakan kpiDeletedAt: kpis.deletedAt",
  assignmentsDal.includes("kpiDeletedAt: kpis.deletedAt"),
);
assert(
  "assignmentSelect menyertakan kpiStatus: kpis.status",
  assignmentsDal.includes("kpiStatus: kpis.status"),
);
assert(
  "toAssignment memetakan deletedAt dari kpiDeletedAt",
  assignmentsDal.includes("row.kpiDeletedAt ? row.kpiDeletedAt.toISOString() : null"),
);
assert(
  "listUserAssignments menyaring isNull(kpis.deletedAt)",
  assignmentsDal.includes("listUserAssignments") &&
    assignmentsDal.includes("isNull(kpis.deletedAt)"),
);
assert(
  "listAllAssignments menyaring isNull(kpis.deletedAt)",
  assignmentsDal.includes("listAllAssignments") &&
    assignmentsDal.includes("conds.push(isNull(kpis.deletedAt))"),
);
assert(
  "listDepartmentAssignments menyaring isNull(kpis.deletedAt)",
  assignmentsDal.includes("listDepartmentAssignments") &&
    assignmentsDal.includes("conds.push(isNull(kpis.deletedAt))"),
);
assert(
  "listManagedAssignments menyaring isNull(kpis.deletedAt)",
  assignmentsDal.includes("listManagedAssignments") &&
    assignmentsDal.includes("conds.push(isNull(kpis.deletedAt))"),
);
assert(
  "listUserAssignmentsInRange menyaring isNull(kpis.deletedAt)",
  assignmentsDal.includes("listUserAssignmentsInRange") &&
    assignmentsDal.includes("isNull(kpis.deletedAt)"),
);
assert(
  "cancelAssignmentsForKpi menangani safeActorId agar tidak melanggar FK constraint",
  assignmentsDal.includes("safeActorId") &&
    assignmentsDal.includes("triggeredBy: safeActorId"),
);
assert(
  "cancelAssignmentsForKpi membungkus audit insert dengan try-catch",
  assignmentsDal.includes("[cancelAssignmentsForKpi] Catat audit history gagal"),
);

// 3. Verifikasi DAL period.ts
console.log("\n3. Server DAL period.ts");
const periodDal = readFileSync("src/server/dal/period.ts", "utf8");

assert(
  "period.ts select menyertakan kpiDeletedAt: kpis.deletedAt",
  periodDal.includes("kpiDeletedAt: kpis.deletedAt"),
);
assert(
  "period.ts toAssignment memetakan deletedAt dari kpiDeletedAt",
  periodDal.includes("row.kpiDeletedAt ? row.kpiDeletedAt.toISOString() : null"),
);
assert(
  "getAssignmentsForPeriod menyaring isNull(kpis.deletedAt)",
  periodDal.includes("conds.push(isNull(kpis.deletedAt))"),
);

// 4. Verifikasi DAL quality.ts
console.log("\n4. Server DAL quality.ts");
const qualityDal = readFileSync("src/server/dal/quality.ts", "utf8");

assert(
  "listQualityRows menyaring isNull(kpis.deletedAt)",
  qualityDal.includes("isNull(kpis.deletedAt)"),
);

// 5. Verifikasi API Daily Reports
console.log("\n5. API /api/daily-reports Guard");
const dailyReportsApi = readFileSync("src/app/api/daily-reports/route.ts", "utf8");

assert(
  "POST menolak input bila KPI di sampah (assignment.kpi?.deletedAt)",
  dailyReportsApi.includes("if (assignment.kpi?.deletedAt)"),
);
assert(
  "PATCH menolak update bila KPI di sampah (assignment?.kpi?.deletedAt)",
  dailyReportsApi.includes("if (assignment?.kpi?.deletedAt)"),
);

// 6. Verifikasi Client-side Dashboard Filters
console.log("\n6. Client-side Dashboard Sanitasi");
const timPage = readFileSync("src/app/dashboard/tim/page.tsx", "utf8");
assert(
  "Dashboard tim menyaring !a.kpi?.deletedAt",
  timPage.includes("a.status !== \"cancelled\" && !a.kpi?.deletedAt"),
);

const timKpiPage = readFileSync("src/app/dashboard/tim/kpi/page.tsx", "utf8");
assert(
  "Halaman tim/kpi menyaring !a.kpi?.deletedAt",
  timKpiPage.includes("a.status !== \"cancelled\" && !a.kpi?.deletedAt"),
);

const timInputPage = readFileSync("src/app/dashboard/tim/input/page.tsx", "utf8");
assert(
  "Halaman tim/input menyaring !a.kpi?.deletedAt",
  timInputPage.includes("a.status !== \"cancelled\" && !a.kpi?.deletedAt"),
);

const headPage = readFileSync("src/app/dashboard/head/page.tsx", "utf8");
assert(
  "Dashboard head menyaring myActiveAssignments dengan !a.kpi?.deletedAt",
  headPage.includes("myActiveAssignments = myAssignments.filter"),
);

// 7. Verifikasi Migrasi 0020
console.log("\n7. Migrasi 0020 SQL");
assert(
  "File drizzle/0020_cancel_trash_kpi_assignments.sql ada",
  existsSync("drizzle/0020_cancel_trash_kpi_assignments.sql"),
);
const migrationSql = readFileSync("drizzle/0020_cancel_trash_kpi_assignments.sql", "utf8");
assert(
  "Migrasi 0020 meng-update ka.status = 'cancelled' bila k.deleted_at IS NOT NULL",
  migrationSql.includes("status = 'cancelled'") &&
    migrationSql.includes("k.deleted_at IS NOT NULL"),
);

console.log(`\nHASIL: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  process.exit(1);
}
