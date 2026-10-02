import {
  withAuth,
  requireUser,
  requireAbsensiAdmin,
  requireActiveAbsensiStaff,
} from "@/server/dal/guards";
import {
  listLeaveRequests,
  myLeaveOverview,
  teamLeaveHistory,
  createLeaveRequest,
  cancelOwnRequest,
  requestCancellation,
  decideLeave,
  decideCancellation,
  adjustQuota,
  findLeaveRequest,
} from "@/server/dal/leave";
import type { LeaveRequestStatus, LeaveRequestType } from "@/types/absensi";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/leave
 *
 *   mine=1                 → pengajuan saya + sisa kuota
 *   view=team              → riwayat pengajuan seluruh tim (staf aktif)
 *   status=pending         → filter status (butuh admin)
 *   departmentId=<uuid>    → filter divisi (butuh admin)
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    if (searchParams.get("mine") === "1") {
      return await myLeaveOverview(me.id);
    }

    // Riwayat tim: staf aktif boleh melihat siapa saja yang cuti,
    // tapi `reason` milik orang lain sengaja dikosongkan di DAL.
    if (searchParams.get("view") === "team") {
      await requireActiveAbsensiStaff();
      const rows = await teamLeaveHistory();
      return {
        requests: rows.map((r) => ({
          ...r,
          reason: r.userId === me.id ? r.reason : null,
        })),
      };
    }

    await requireAbsensiAdmin();

    /**
     * `view=approvals` — satu hasil untuk seluruh kebutuhan halaman
     * /absensi/admin/approvals.
     *
     * formerly halaman itu melakukan **empat** query dari browser dengan
     * filter berbeda (`status = pending`, `status = approved AND
     * cancellation_requested = true`, `status IN (approved, rejected)`,
     * lalu `count` user pending) plus subscription realtime di tiga
     * tabel. Sekarang satu request, dan penyaringannya di server.
     */
    if (searchParams.get("view") === "approvals") {
      const { countStaffByStatus } = await import("@/server/dal/staff");
      const { listLeaveRequests } = await import("@/server/dal/leave");

      const all = await listLeaveRequests();
      const counts = await countStaffByStatus();

      return {
        pending: all
          .filter((r) => r.status === "pending")
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
        cancellations: all.filter(
          (r) => r.status === "approved" && r.cancellationRequested === true,
        ),
        history: all.filter(
          (r) => r.status === "approved" || r.status === "rejected",
        ),
        pendingStaffCount: counts.pending,
      };
    }

    const status = searchParams.get("status") as LeaveRequestStatus | null;
    const departmentId = searchParams.get("departmentId");

    return {
      requests: await listLeaveRequests({
        status: status ?? undefined,
        departmentId: departmentId ?? undefined,
      }),
    };
  });
}

/** POST /api/absensi/leave — staff mengajukan cuti/sakit/WFA. */
export async function POST(request: Request) {
  return withAuth(async () => {
    await requireActiveAbsensiStaff();
    const me = await requireUser();
    const body = await request.json();

    if (!Array.isArray(body.dates) || body.dates.length === 0) {
      return Response.json(
        { ok: false, error: "Pilih minimal satu tanggal." },
        { status: 400 },
      );
    }

    const result = await createLeaveRequest({
      userId: me.id,
      type: (body.type as LeaveRequestType) ?? "leave",
      dates: body.dates,
      reason: body.reason ?? "",
    });

    if (!result.ok) {
      return Response.json({ ok: false, error: result.reason }, { status: 400 });
    }
    return { request: result.request };
  });
}

/**
 * PATCH /api/absensi/leave
 *
 * Staff : cancel / request-cancellation (milik sendiri)
 * Admin: approve / reject / proses pembatalan
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const body = await request.json();
    const { id, action } = body;

    if (!id || !action) {
      return Response.json(
        { ok: false, error: "Parameter 'id' dan 'action' wajib diisi." },
        { status: 400 },
      );
    }

    // ── Aksi staff (hanya milik sendiri) ──────────────────────
    if (action === "cancel" || action === "request-cancellation") {
      const result =
        action === "cancel"
          ? await cancelOwnRequest(id, me.id)
          : await requestCancellation(id, me.id, body.reason ?? "");

      if (!result.ok) {
        return Response.json({ ok: false, error: result.reason }, { status: 400 });
      }
      return { request: result.request };
    }

    // ── Aksi admin ────────────────────────────────────────────
    await requireAbsensiAdmin();

    // Nama admin diambil dari session, bukan dari body.
    const adminName = me.email;

    let result;
    if (action === "approve" || action === "reject") {
      result = await decideLeave(id, action, adminName);
    } else if (
      action === "approve-cancellation" ||
      action === "reject-cancellation"
    ) {
      result = await decideCancellation(
        id,
        action === "approve-cancellation" ? "approve" : "reject",
        adminName,
      );
    } else {
      return Response.json(
        { ok: false, error: "Action tidak dikenal." },
        { status: 400 },
      );
    }

    if (!result.ok) {
      return Response.json({ ok: false, error: result.reason }, { status: 400 });
    }
    return { request: result.request };
  });
}

/** PUT /api/absensi/leave — admin atur ulang kuota. */
export async function PUT(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const { userId, leaveQuota, sickQuota } = await request.json();

    if (!userId) {
      return Response.json(
        { ok: false, error: "Parameter 'userId' wajib diisi." },
        { status: 400 },
      );
    }

    await adjustQuota(userId, {
      leaveQuota: leaveQuota !== undefined ? Number(leaveQuota) : undefined,
      sickQuota: sickQuota !== undefined ? Number(sickQuota) : undefined,
    });

    return { request: await findLeaveRequest(userId) ?? null };
  });
}