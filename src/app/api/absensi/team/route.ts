import { withAuth, requireUser } from "@/server/dal/guards";
import { teamCalendar, listLateReasonReviews, myKpiSummary } from "@/server/dal/staff";
import { monthBounds } from "@/server/dal/staff";
import { listDepartments } from "@/server/dal/departments";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/team
 *
 *   view=calendar&month=2026-10[&departmentId=..]  → kalender tim
 *   view=late-reasons&from=&to=                    → alasan terlambat pending
 *   view=my-kpi&year=&month=                      → KPI saya
 *   view=departments                              → daftar divisi
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "calendar";

    if (view === "departments") {
      return { departments: await listDepartments() };
    }

    if (view === "my-kpi") {
      const me = await requireUser();
      const now = new Date();
      const year = Number(searchParams.get("year")) || now.getFullYear();
      const month = Number(searchParams.get("month")) || now.getMonth() + 1;
      return { kpis: await myKpiSummary(year, month, me.id) };
    }

    if (view === "late-reasons") {
      const now = new Date();
      const monthParam = searchParams.get("month");
      const [from, to] = monthParam
        ? monthBounds(monthParam)
        : [
            new Date(now.getFullYear(), now.getMonth(), 1)
              .toISOString()
              .slice(0, 10),
            new Date(now.getFullYear(), now.getMonth() + 1, 0)
              .toISOString()
              .slice(0, 10),
          ];

      // Hanya admin absensi yang boleh melihat alasan orang lain.
      const { getProfile } = await import("@/server/dal/guards");
      const p = await getProfile();
      if (p?.absensiRole !== "admin") {
        return { pending: [] };
      }

      return { pending: await listLateReasonReviews(from, to) };
    }

    const month =
      searchParams.get("month") ??
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    return {
      calendar: await teamCalendar({
        month,
        departmentId: searchParams.get("departmentId"),
      }),
    };
  });
}