import { withAuth, requireUser, requireKpiRole } from "@/server/dal/guards";
import {
  listReportsForAssignment,
  listReportsInRange,
  upsertDailyReport,
  deleteDailyReport,
} from "@/server/dal/assignments";

export const dynamic = "force-dynamic";

/**
 * GET /api/daily-reports
 *
 * Query param:
 *   assignmentId=&userId=  → laporan milik satu assignment
 *   from=YYYY-MM-DD&to=...  → laporan dalam rentang
 *   userId=                 → batasi ke satu user
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    const assignmentId = searchParams.get("assignmentId");
    const userId = searchParams.get("userId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (assignmentId) {
      // User biasa hanya boleh lihat laporannya sendiri
      const targetUser = userId ?? me.id;
      if (targetUser !== me.id) {
        await requireKpiRole("head", "hr", "executive");
      }
      return { reports: await listReportsForAssignment(assignmentId, targetUser) };
    }

    if (from && to) {
      const targetUser = userId ?? undefined;
      // Kalau bukan privileged, paksa hanya data sendiri
      const privileged = await isPrivileged();
      return {
        reports: await listReportsInRange(
          from,
          to,
          targetUser ?? (privileged ? undefined : me.id),
        ),
      };
    }

    return { reports: [] };
  });
}

async function isPrivileged(): Promise<boolean> {
  const { getProfile } = await import("@/server/dal/guards");
  const p = await getProfile();
  return (
    !!p &&
    ["head", "hr", "executive", "developer"].includes(p.kpiRole as string)
  );
}

/**
 * POST /api/daily-reports — input nilai harian.
 * Otorisasi: user hanya boleh lapor untuk assignment-nya sendiri.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { assignmentId, kpiId, date, value, notes } = await request.json();

    if (!assignmentId || !date || value === undefined) {
      return Response.json(
        { ok: false, error: "assignmentId, date, dan value wajib diisi." },
        { status: 400 },
      );
    }

    // Verifikasi assignment memang milik user ini (kecuali HR/Executive)
    const { findAssignmentById } = await import("@/server/dal/assignments");
    const assignment = await findAssignmentById(assignmentId);
    if (!assignment) {
      return Response.json(
        { ok: false, error: "Assignment tidak ditemukan." },
        { status: 404 },
      );
    }

    const isOwner = assignment.userId === me.id;
    if (!isOwner) {
      const { getProfile } = await import("@/server/dal/guards");
      const p = await getProfile();
      const privileged =
        p && ["hr", "executive", "developer"].includes(p.kpiRole as string);
      if (!privileged) {
        return Response.json(
          { ok: false, error: "Anda tidak berhak menginput KPI orang lain." },
          { status: 403 },
        );
      }
    }

    await upsertDailyReport({
      assignmentId,
      kpiId: kpiId ?? assignment.kpiId,
      userId: isOwner ? me.id : assignment.userId,
      date,
      value: Number(value),
      notes: notes ?? null,
    });

    return { ok: true };
  });
}

/** DELETE /api/daily-reports — hapus satu laporan. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const sp = new URL(request.url).searchParams;
    const assignmentId = sp.get("assignmentId");
    const date = sp.get("date");

    if (!assignmentId || !date) {
      return Response.json(
        { ok: false, error: "assignmentId dan date wajib diisi." },
        { status: 400 },
      );
    }

    const { findAssignmentById } = await import("@/server/dal/assignments");
    const assignment = await findAssignmentById(assignmentId);
    if (!assignment) {
      return Response.json(
        { ok: false, error: "Assignment tidak ditemukan." },
        { status: 404 },
      );
    }

    const isOwner = assignment.userId === me.id;
    if (!isOwner) {
      await requireKpiRole("hr", "executive");
    }

    await deleteDailyReport(assignmentId, date);
    return { ok: true };
  });
}