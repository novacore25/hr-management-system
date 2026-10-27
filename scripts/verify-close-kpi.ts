import { readFileSync } from "node:fs";
import { pesanKpiReadonly, calcWeightedScore } from "../src/lib/utils";

console.log("=== VERIFIKASI FITUR CLOSE KPI & CLOSE ALL ===");
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

// 1. Test pesanKpiReadonly logic
console.log("\n1. pesanKpiReadonly logic");
assert(
  "KPI closed menghasilkan 'KPI Ditutup oleh HR'",
  pesanKpiReadonly({ status: "closed" }) === "KPI Ditutup oleh HR",
);
assert(
  "KPI hold menghasilkan 'KPI Sedang Di-Hold'",
  pesanKpiReadonly({ status: "hold" }) === "KPI Sedang Di-Hold",
);
assert(
  "KPI active result menghasilkan null (boleh input)",
  pesanKpiReadonly({ status: "active", type: "result" }) === null,
);
assert(
  "KPI active activity menghasilkan null (boleh input)",
  pesanKpiReadonly({ status: "active", type: "activity" }) === null,
);
assert(
  "KPI active quality tetap readonly",
  pesanKpiReadonly({ status: "active", type: "quality" }) !== null,
);

// 2. Verifikasi DAL kpi.ts
console.log("\n2. Server DAL kpi.ts");
const kpiDal = readFileSync("src/server/dal/kpi.ts", "utf8");
assert(
  "DAL kpi.ts mengekspor closeAllKpis",
  kpiDal.includes("export async function closeAllKpis"),
);
assert(
  "DAL kpi.ts mengekspor openAllKpis",
  kpiDal.includes("export async function openAllKpis"),
);
assert(
  "DAL kpi.ts mengekspor bulkSetKpiStatus",
  kpiDal.includes("export async function bulkSetKpiStatus"),
);

// 3. Verifikasi Route PATCH /api/kpis
console.log("\n3. Route PATCH /api/kpis");
const kpisRoute = readFileSync("src/app/api/kpis/route.ts", "utf8");
assert(
  "PATCH /api/kpis menangani action close-all",
  kpisRoute.includes('action === "close-all"'),
);
assert(
  "PATCH /api/kpis menangani action open-all",
  kpisRoute.includes('action === "open-all"'),
);
assert(
  "PATCH /api/kpis menangani bulk-status",
  kpisRoute.includes('action === "bulk-status"'),
);

// 4. Verifikasi Daily Reports Guard
console.log("\n4. Daily Reports Guard (POST/PATCH/DELETE)");
const reportsRoute = readFileSync("src/app/api/daily-reports/route.ts", "utf8");
assert(
  "POST /api/daily-reports memblokir input jika kpi closed",
  reportsRoute.includes('assignment.kpi?.status === "closed"'),
);
assert(
  "DELETE /api/daily-reports memblokir hapus jika kpi closed",
  reportsRoute.includes('assignment.kpi?.status === "closed"'),
);
assert(
  "PATCH /api/daily-reports memblokir edit jika kpi closed",
  reportsRoute.includes('assignment?.kpi?.status === "closed"'),
);

// 5. Verifikasi UI DailyInputForm
console.log("\n5. DailyInputForm.tsx UI Guard");
const inputForm = readFileSync("src/components/kpi/DailyInputForm.tsx", "utf8");
assert(
  "DailyInputForm memeriksa isKpiClosed",
  inputForm.includes('isKpiClosed = kpi?.status === "closed"'),
);
assert(
  "DailyInputForm menampilkan banner KPI Ditutup oleh HR",
  inputForm.includes("KPI Ditutup oleh HR"),
);
assert(
  "DailyInputForm menonaktifkan submit button saat blocked",
  inputForm.includes("disabled={submitting || isBlocked}"),
);

// 6. Verifikasi UI HR KPI Management
console.log("\n6. HR KPI Management (/dashboard/hr/kpi)");
const hrKpiPage = readFileSync("src/app/dashboard/hr/kpi/page.tsx", "utf8");
assert(
  "HR KPI Page memiliki tombol Close All",
  hrKpiPage.includes("Close All") && hrKpiPage.includes("confirmCloseAll"),
);
assert(
  "HR KPI Page memiliki tombol Buka Semua",
  hrKpiPage.includes("Buka Semua") && hrKpiPage.includes("confirmOpenAll"),
);
assert(
  "HR KPI Page memiliki aksi Close per baris",
  hrKpiPage.includes('setStatus(k.id, "closed")'),
);
assert(
  "HR KPI Page memiliki aksi Buka Kembali per baris",
  hrKpiPage.includes('setStatus(k.id, "active")'),
);
assert(
  "HR KPI Page memiliki opsi filter closed",
  hrKpiPage.includes('<SelectItem value="closed">Ditutup</SelectItem>'),
);

// 7. Verifikasi UI Head KPI Setup
console.log("\n7. Head KPI Setup (/dashboard/head/kpi-setup)");
const headKpiPage = readFileSync("src/app/dashboard/head/kpi-setup/page.tsx", "utf8");
assert(
  "Head KPI Page memiliki tombol Close All",
  headKpiPage.includes("Close All") && headKpiPage.includes("confirmCloseAll"),
);
assert(
  "Head KPI Page memiliki aksi Close per baris",
  headKpiPage.includes('setStatus(k.id, "closed")'),
);
assert(
  "Head KPI Page memiliki opsi filter closed",
  headKpiPage.includes('<SelectItem value="closed">Ditutup</SelectItem>'),
);

// 8. Verifikasi Per-Person & Multi-User Assignment Closing
console.log("\n8. Per-Person & Multi-User Assignment Closing");
assert(
  "pesanKpiReadonly mendukung assignment status hold",
  pesanKpiReadonly({ status: "active", type: "result" }, "HR", { status: "hold" }) === "KPI Ditutup / Di-Hold untuk Anda",
);

const assignDal = readFileSync("src/server/dal/assignments.ts", "utf8");
assert(
  "DAL assignments.ts mengekspor bulkSetAssignmentStatus",
  assignDal.includes("export async function bulkSetAssignmentStatus"),
);
assert(
  "DAL assignments.ts mengekspor setUserAssignmentsStatus",
  assignDal.includes("export async function setUserAssignmentsStatus"),
);
assert(
  "DAL assignments.ts mengekspor setUsersAssignmentsStatus",
  assignDal.includes("export async function setUsersAssignmentsStatus"),
);

const assignRoute = readFileSync("src/app/api/assignments/route.ts", "utf8");
assert(
  "PATCH /api/assignments menangani bulk-status",
  assignRoute.includes('action === "bulk-status"'),
);
assert(
  "PATCH /api/assignments menangani set-user-status",
  assignRoute.includes('action === "set-user-status"'),
);
assert(
  "PATCH /api/assignments menangani set-users-status",
  assignRoute.includes('action === "set-users-status"'),
);

const hrAssignPage = readFileSync("src/app/dashboard/hr/assignments/page.tsx", "utf8");
assert(
  "HR Assignments Page memiliki tombol Tutup Semua per user",
  hrAssignPage.includes("Tutup Semua") && hrAssignPage.includes("handleUserStatusChange"),
);
assert(
  "HR Assignments Page memiliki tombol Buka Semua per user",
  hrAssignPage.includes("Buka Semua") && hrAssignPage.includes("handleUserStatusChange"),
);
assert(
  "HR Assignments Page memiliki checklist multi-user dan tombol massal",
  hrAssignPage.includes("handleBulkUsersStatusChange") && hrAssignPage.includes("toggleSelectAllUsers"),
);

const headAssignPage = readFileSync("src/app/dashboard/head/penugasan/page.tsx", "utf8");
assert(
  "Head Penugasan Page memiliki tombol Tutup Semua per user",
  headAssignPage.includes("Tutup Semua") && headAssignPage.includes("handleUserStatusChange"),
);
assert(
  "Head Penugasan Page memiliki tombol Buka Semua per user",
  headAssignPage.includes("Buka Semua") && headAssignPage.includes("handleUserStatusChange"),
);
assert(
  "Head Penugasan Page memiliki checklist multi-user dan tombol massal",
  headAssignPage.includes("handleBulkUsersStatusChange") && headAssignPage.includes("toggleSelectAllUsers"),
);

// 9. Verifikasi Pesan & Popup Keterlambatan saat KPI Ditutup
console.log("\n9. Pesan & Popup Keterlambatan saat KPI Ditutup");
const kpiCard = readFileSync("src/components/kpi/KpiCard.tsx", "utf8");
assert(
  "DailyInputForm menampilkan pesan keterlambatan saat blocked",
  inputForm.includes("KPI ini sudah di tutup anda terlambat silahkan hubungi HR jika ini kesalahan"),
);
assert(
  "KpiCard menampilkan pesan keterlambatan saat KPI ditutup",
  kpiCard.includes("KPI ini sudah di tutup anda terlambat silahkan hubungi HR jika ini kesalahan"),
);
assert(
  "POST /api/daily-reports menolak dengan pesan keterlambatan",
  reportsRoute.includes("KPI ini sudah di tutup anda terlambat silahkan hubungi HR jika ini kesalahan"),
);

// 10. Verifikasi Retensi KPI Closed/Hold di Dashboard Staf & Menu Penugasan HR/Head
console.log("\n10. Retensi KPI Closed/Hold di Dashboard Staf & Penugasan HR/Head");
const hooksAssignments = readFileSync("src/hooks/useAssignments.ts", "utf8");
assert(
  "useMyAssignments meminta status active,hold,completed",
  hooksAssignments.includes('status = "active,hold,completed"'),
);
assert(
  "useAllAssignments menyertakan status hold secara default",
  hooksAssignments.includes('"active,hold,cancelled,completed"'),
);

assert(
  "HR Assignments Page memuat penugasan hold dan completed",
  hrAssignPage.includes('"hold"') && hrAssignPage.includes('"completed"'),
);

assert(
  "Head Penugasan Page memuat penugasan hold dan completed",
  headAssignPage.includes('"hold"') && headAssignPage.includes('"completed"'),
);

const mockWeights = { result: 50, activity: 50, quality: 0, leadTim: 0, hr: 0 };
const mockHoldAssign = [{
  id: "test-1",
  userId: "u1",
  kpiId: "k1",
  kpiType: "result",
  status: "hold" as const,
  monthlyTarget: 100,
  currentDailyTarget: 4,
  actualTotal: 80,
  expectedTotal: 80,
  achievementPercentage: 80,
  performanceCategory: "good" as const,
  workingDaysTotal: 25,
  year: 2026,
  month: 10,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}];
const calculatedScore = calcWeightedScore(
  mockHoldAssign as unknown as Parameters<typeof calcWeightedScore>[0],
  mockWeights,
);
assert(
  "calcWeightedScore menghitung assignment berstatus hold",
  calculatedScore.resultCount === 1 && calculatedScore.resultAvg === 80,
  `resultCount: ${calculatedScore.resultCount}, resultAvg: ${calculatedScore.resultAvg}`,
);

// 11. Verifikasi Kebal Batal: Penugasan Batal (Cancelled) Tidak Boleh Muncul Lagi Saat KPI Ditutup/Dibuka
console.log("\n11. Kebal Batal: Penugasan Cancelled Tidak Boleh Tersentuh Buka/Tutup");
const assignDalUpdated = readFileSync("src/server/dal/assignments.ts", "utf8");
assert(
  "DAL assignments.ts melindungi status cancelled saat tutup/buka massal",
  assignDalUpdated.includes('r.status !== "cancelled"') &&
  assignDalUpdated.includes('if (status === "hold") return r.status === "active";'),
);

assert(
  "pesanKpiReadonly memprioritaskan cancelled di atas kpi closed",
  pesanKpiReadonly({ status: "closed", type: "result" }, "HR", { status: "cancelled" }) === "Penugasan Dibatalkan",
);

const timDashboardCode = readFileSync("src/app/dashboard/tim/page.tsx", "utf8");
assert(
  "Dashboard Tim memfilter penugasan cancelled",
  timDashboardCode.includes('a.status !== "cancelled"'),
);

const timInputCode = readFileSync("src/app/dashboard/tim/input/page.tsx", "utf8");
assert(
  "Input Tim memfilter penugasan cancelled",
  timInputCode.includes('a.status !== "cancelled"'),
);

const hrAssignUpdated = readFileSync("src/app/dashboard/hr/assignments/page.tsx", "utf8");
assert(
  "HR Assignments page allHold hanya aktif bila ada penugasan hold",
  hrAssignUpdated.includes("allHold = holdCount > 0 && activeCount === 0"),
);

const headAssignUpdated = readFileSync("src/app/dashboard/head/penugasan/page.tsx", "utf8");
assert(
  "Head Penugasan page allHold hanya aktif bila ada penugasan hold",
  headAssignUpdated.includes("allHold = holdCount > 0 && activeCount === 0"),
);

console.log(`\n=== HASIL: ${pass} pass, ${fail} fail ===`);
if (fail > 0) process.exit(1);
