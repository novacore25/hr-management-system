import { withAuth, requireUser, requireAbsensiAdmin } from "@/server/dal/guards";
import {
  findByUserDate,
  listByDate,
  listByUserRange,
  dailyRecap,
  checkIn,
  checkOut,
  reviewLateReason,
  adminUpdateAttendance,
  deleteAttendance,
} from "@/server/dal/attendance";
import type { AttendanceType } from "@/types/absensi";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/attendance
 *
 *   date=YYYY-MM-DD          → absensi satu hari (semua user)
 *   mine=1                   → absensi user yang login
 *   from=&to=                → rentang untuk user yang login
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (from && to) {
      return { attendance: await listByUserRange(me.id, from, to) };
    }

    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    if (searchParams.get("mine") === "1") {
      const mine = await findByUserDate(me.id, targetDate);
      return { attendance: mine, date: targetDate };
    }

    // Melihat absensi orang lain butuh role
    await requireAbsensiAdmin();

    if (searchParams.get("recap") === "1") {
      return { recap: await dailyRecap(targetDate) };
    }

    return { attendance: await listByDate(targetDate), date: targetDate };
  });
}

/**
 * POST /api/absensi/attendance — check-in.
 *
 * Validasi (lateness + geofence) dilakukan DI SERVER.
 * Nilai `checkIn`, `status`, dan `lateFine` dari client DIABAIKAN.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { getProfile } = await import("@/server/dal/guards");
    const profile = await getProfile();
    if (!profile) {
      return Response.json(
        { ok: false, error: "Profil tidak ditemukan." },
        { status: 401 },
      );
    }
    if (profile.absensiStatus !== "active") {
      return Response.json(
        {
          ok: false,
          error: "Akun absensi Anda belum aktif. Hubungi admin absensi.",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const action = body.action ?? "check-in";
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    if (action === "check-out") {
      const result = await checkOut({
        userId: me.id,
        date: body.date ?? today,
        checkOut: hhmm,
        earlyReason: body.earlyReason ?? null,
      });
      if (!result.ok) {
        return Response.json(
          { ok: false, error: result.reason, code: result.code },
          { status: 400 },
        );
      }
      return { attendance: result.attendance };
    }

    // Tanggal hanya boleh hari ini
    const date = body.date ?? today;
    if (date !== today) {
      return Response.json(
        { ok: false, error: "Check-in hanya bisa untuk hari ini." },
        { status: 400 },
      );
    }

    const result = await checkIn({
      userId: me.id,
      departmentId: profile.departmentId,
      date,
      checkIn: hhmm,
      type: (body.type as AttendanceType) ?? "WFO",
      lateReason: body.lateReason ?? null,
      location: body.location ?? null,
      notes: body.notes ?? null,
    });

    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.reason, code: result.code },
        { status: 400 },
      );
    }

    return { attendance: result.attendance };
  });
}

/** PATCH /api/absensi/attendance — admin: koreksi / review alasan. */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const admin = await requireAbsensiAdmin();
    const body = await request.json();

    if (!body.id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    if (body.action === "review-late-reason") {
      await reviewLateReason(body.id, Boolean(body.accept), admin.id);
      return { ok: true };
    }

    const updated = await adminUpdateAttendance(
      body.id,
      body.patch ?? {},
      admin.id,
    );
    return { attendance: updated };
  });
}

/** DELETE /api/absensi/attendance — admin only. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    const admin = await requireAbsensiAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }
    await deleteAttendance(id, admin.id);
    return { deleted: id };
  });
}