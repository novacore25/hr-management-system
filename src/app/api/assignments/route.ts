import { withAuth, requireUser, requireKpiRole } from "@/server/dal/guards";
import {
  listUserAssignments,
  listAllAssignments,
  listDepartmentAssignments,
  listUserAssignmentsInRange,
  findAssignmentById,
  createAssignments,
  setAssignmentStatus,
  setAssignmentTarget,
  deleteAssignment,
} from "@/server/dal/assignments";
import { getWorkingDaysInMonth, getWorkingDaysElapsed } from "@/lib/performance";
import type { AssignmentStatus } from "@/types";

export const dynamic = "force-dynamic";

const VALID_STATUS: AssignmentStatus[] = [
  "active",
  "hold",
  "cancelled",
  "completed",
];

function num(v: string | null, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseStatuses(raw: string | null): AssignmentStatus[] {
  if (!raw) return ["active"];
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AssignmentStatus =>
      (VALID_STATUS as string[]).includes(s),
    );
  return list.length > 0 ? list : ["active"];
}

/**
 * GET /api/assignments
 *
 * Query param:
 *   scope=me          → assignment user yang login (default)
 *   scope=all         → semua (HR/Executive)
 *   scope=department  → satu divisi
 *   from=&to=YYYY-MM  → mode rentang (untuk user yang login)
 *   status=a,b        → filter status
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "me";
    const year = num(searchParams.get("year"), new Date().getFullYear());
    const month = num(searchParams.get("month"), new Date().getMonth() + 1);
    const statuses = parseStatuses(searchParams.get("status"));

    // Mode rentang (dipakai halaman dengan PeriodPicker)
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from && to) {
      const [fy, fm] = from.split("-").map(Number);
      const [ty, tm] = to.split("-").map(Number);
      const assignments = await listUserAssignmentsInRange(
        me.id,
        fy || year,
        fm || month,
        ty || year,
        tm || month,
      );
      return { assignments };
    }

    const id = searchParams.get("id");
    if (id) return { assignment: await findAssignmentById(id) };

    if (scope === "all") {
      await requireKpiRole("hr", "executive");
      return { assignments: await listAllAssignments(year, month, statuses) };
    }

    if (scope === "department") {
      await requireKpiRole("head", "hr", "executive");
      const deptId = searchParams.get("departmentId");
      if (!deptId) {
        return Response.json(
          { ok: false, error: "Parameter 'departmentId' wajib diisi." },
          { status: 400 },
        );
      }
      return {
        assignments: await listDepartmentAssignments(
          deptId,
          year,
          month,
          statuses,
        ),
      };
    }

    // Default: milik sendiri
    return {
      assignments: await listUserAssignments(me.id, year, month, statuses),
    };
  });
}

/** POST /api/assignments — buat assignment baru. HR/Executive/Developer. */
export async function POST(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("hr", "executive");
    const body = await request.json();
    const rows: unknown[] = Array.isArray(body) ? body : [body];

    const year = num(String(body?.year), new Date().getFullYear());
    const month = num(String(body?.month), new Date().getMonth() + 1);

    const workingDaysTotal = getWorkingDaysInMonth(year, month);
    const workingDaysElapsed = getWorkingDaysElapsed(
      year,
      month,
      new Date().getDate(),
    );

    const inputs = rows
      .filter((r): r is Record<string, unknown> => !!r)
      .filter((r) => r.kpiId && r.userId)
      .map((r) => ({
        kpiId: String(r.kpiId),
        userId: String(r.userId),
        departmentId: r.departmentId ? String(r.departmentId) : null,
        monthlyTarget: Number(r.monthlyTarget ?? 0),
        year,
        month,
        workingDaysTotal,
        assignedBy: actor.id,
      }));

    if (inputs.length === 0) {
      return Response.json(
        { ok: false, error: "Data assignment tidak valid." },
        { status: 400 },
      );
    }

    return createAssignments(inputs);
  });
}

/** PATCH /api/assignments — ubah status / target. */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("hr", "executive");
    const { id, action, status, monthlyTarget } = await request.json();

    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    if (action === "set-status") {
      if (!VALID_STATUS.includes(status)) {
        return Response.json(
          { ok: false, error: `Status tidak valid: ${status}` },
          { status: 400 },
        );
      }
      await setAssignmentStatus(id, status, actor.id);
      return { assignment: await findAssignmentById(id) };
    }

    if (action === "set-target") {
      await setAssignmentTarget(id, Number(monthlyTarget ?? 0), actor.id);
      return { assignment: await findAssignmentById(id) };
    }

    return Response.json(
      { ok: false, error: "Action tidak dikenal." },
      { status: 400 },
    );
  });
}

/** DELETE /api/assignments — Executive only. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("executive");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }
    await deleteAssignment(id);
    return { deleted: id };
  });
}