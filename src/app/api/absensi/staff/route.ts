import {
  withAuth,
  requireUser,
  requireAbsensiAdmin,
  requireKpiRole,
} from "@/server/dal/guards";
import {
  listStaff,
  updateStaff,
  createStaff,
  staffAttendanceSummary,
  type StaffPatch,
} from "@/server/dal/staff";
import { setKpiRole } from "@/server/dal/users";
import type { AbsensiRole, AbsensiStatus } from "@/types/index";

export const dynamic = "force-dynamic";

/** GET /api/absensi/staff — daftar staf (admin absensi). */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get("userId");
    const month = searchParams.get("month");

    // Ringkasan absensi + cuti untuk satu staf
    if (userId && month) {
      return {
        summary: await staffAttendanceSummary({ userId, month }),
      };
    }

    const staff = await listStaff({
      departmentId: searchParams.get("departmentId") ?? undefined,
      status: (searchParams.get("status") as AbsensiStatus) ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    return { staff };
  });
}

/** POST /api/absensi/staff — tambah staf baru. */
export async function POST(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const admin = await requireUser();
    const body = await request.json();

    if (!body.email || !body.name) {
      return Response.json(
        { ok: false, error: "Email dan nama wajib diisi." },
        { status: 400 },
      );
    }

    const result = await createStaff(
      {
        email: String(body.email),
        name: String(body.name),
        kpiRole: String(body.kpiRole ?? "tim"),
        absensiRole: (body.absensiRole as AbsensiRole) ?? "staff",
        departmentId: body.departmentId ?? null,
        position: body.position ?? null,
      },
      admin.id,
    );

    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
    return { staff: result.user };
  });
}

/** PATCH /api/absensi/staff — ubah data staf. */
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

    // Role KPI punyaotorisasi sendiri (HR/Executive),
    // bukan ikut aturan absensi admin.
    if (body.kpiRole) {
      await requireKpiRole("hr", "executive");
      await setKpiRole(body.id, body.kpiRole);
    }

    const patch: StaffPatch = {};
    for (const key of [
      "name",
      "position",
      "departmentId",
      "absensiRole",
      "absensiStatus",
      "leaveQuota",
      "sickQuota",
      "isHidden",
    ] as const) {
      if (body[key] !== undefined) {
        (patch as Record<string, unknown>)[key] = body[key];
      }
    }

    const staff =
      Object.keys(patch).length > 0
        ? await updateStaff(body.id, patch, admin.id)
        : null;

    return { staff };
  });
}

/** DELETE /api/absensi/staff — nonaktifkan (tidak hapus data). */
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

    const staff = await updateStaff(id, { absensiStatus: "deleted" }, admin.id);
    return { staff };
  });
}