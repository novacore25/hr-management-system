import {
  withAuth,
  requireUser,
  requireProfile,
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
  decideLeaveStage,
  decideCancellation,
  adjustQuota,
  findLeaveRequest,
  hrRoleAvailability,
} from "@/server/dal/leave";
import type {
  LeaveRequestStatus,
  LeaveRequestType,
  LeaveStage,
} from "@/types/absensi";
import { nextStageFor } from "@/types/absensi";

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
      const [counts, hr] = await Promise.all([
        countStaffByStatus(),
        hrRoleAvailability(),
      ]);

      const pending = all
        .filter((r) => r.status === "pending")
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

      // Tahap 2: sudah disetujui executive, menunggu HR.
      const waitingHr = all
        .filter((r) => r.status === "approved_executive")
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

      return {
        pending,
        waitingHr,
        cancellations: all.filter(
          (r) => r.status === "approved" && r.cancellationRequested === true,
        ),
        history: all.filter(
          (r) =>
            r.status === "approved" ||
            r.status === "rejected" ||
            r.status === "approved_executive",
        ),
        pendingStaffCount: counts.pending,
        // Dikirim ke UI supaya halaman bisa memperingatkan bahwa
        // pengajuan menumpuk karena tidak ada HR yang bisa menyetujui.
        hrAvailable: hr.count > 0,
        hrCount: hr.count,
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
    // requireProfile, bukan requireUser: tahap persetujuan ditentukan
    // dari kpi_role, yang hanya ada di tabel users. SessionUser dari
    // Auth.js tidak memuatnya.
    const me = await requireProfile();
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
      // Tahap ditentukan dari role, bukan dari kiriman klien:
      // executive menyetujui tahap 1, HR menyetujui tahap 2.
      // DAL akan menolak kalau tahap dan status tidak cocok, jadi
      // executive tidak bisa menyetujui di tahap 2 dan sebaliknya.
      const stage: LeaveStage | null =
        me.kpiRole === "executive"
          ? "executive"
          : me.kpiRole === "hr"
            ? "hr"
            : null;

      if (!stage) {
        return Response.json(
          {
            ok: false,
            error:
              "Persetujuan cuti 2 tahap hanya untuk role kpi_role='executive' (tahap 1) atau 'hr' (tahap 2). Role Anda: " +
              me.kpiRole,
          },
          { status: 403 },
        );
      }

      result = await decideLeaveStage(
        id,
        stage,
        action,
        { id: me.id, name: me.name, kpiRole: me.kpiRole },
        body.notes,
      );
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