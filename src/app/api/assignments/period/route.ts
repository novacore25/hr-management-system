import { withAuth, requireUser, requireKpiRole } from "@/server/dal/guards";
import { getAssignmentsForPeriod } from "@/server/dal/period";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/assignments/period
 *
 * Query param:
 *   type=month&year=2026&month=10
 *   type=range&from=2026-01&to=2026-03
 *   departments=Nama Divisi A,Nama Divisi B   (opsional, perlu role head+)
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type") ?? "month";
    const deptParam = searchParams.get("departments");

    // Filter divisi hanya boleh untuk role head ke atas.
    // Staff biasa: server selalu batasi ke miliknya sendiri lewat
    // pemanggil (scope=me), jadi di sini datanya tetap perlu difilter.
    let departmentIds: string[] | undefined;
    let onlyMe = false;

    if (deptParam) {
      await requireKpiRole("head", "hr", "executive");
      const names = deptParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length > 0) {
        const rows = await db
          .select({ id: departments.id })
          .from(departments)
          .where(inArray(departments.name, names));
        departmentIds = rows.map((r) => r.id);
        if (departmentIds.length === 0) {
          return { assignments: [], kpisMap: {} };
        }
      }
    } else {
      // Tanpa filter divisi: staff biasa hanya melihat data sendiri
      const { getProfile } = await import("@/server/dal/guards");
      const p = await getProfile();
      const privileged =
        p && ["head", "hr", "executive", "developer"].includes(p.kpiRole as string);
      if (!privileged) onlyMe = true;
    }

    const now = new Date();

    const result = await getAssignmentsForPeriod({
      period:
        type === "range"
          ? {
              type: "range",
              from: searchParams.get("from") ?? "",
              to: searchParams.get("to") ?? "",
            }
          : {
              type: "month",
              year: Number(searchParams.get("year")) || now.getFullYear(),
              month: Number(searchParams.get("month")) || now.getMonth() + 1,
            },
      departmentIds,
    });

    const assignments = onlyMe
      ? result.assignments.filter((a) => a.userId === me.id)
      : result.assignments;

    const kpisMap =
      onlyMe && assignments.length !== result.assignments.length
        ? {}
        : result.kpisMap;

    return { assignments, kpisMap };
  });
}
