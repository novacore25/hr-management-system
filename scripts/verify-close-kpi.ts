import { readFileSync } from "node:fs";
import { pesanKpiReadonly } from "../src/lib/utils";

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

console.log(`\n=== HASIL: ${pass} pass, ${fail} fail ===`);
if (fail > 0) process.exit(1);
