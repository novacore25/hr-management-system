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
  countStaffByStatus,
  attendanceSlip,
  type StaffPatch,
} from "@/server/dal/staff";
import { setKpiRole } from "@/server/dal/users";
import type { AbsensiRole, AbsensiStatus } from "@/types/index";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/staff
 *
 *   status=active            → filter status absensi
 *   departmentId=<uuid>      → filter divisi
 *   search=<teks>            → cari nama / email
 *   slip=1&userId=&month=    → rekap absensi untuk slip Excel
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get("userId");
    const month = searchParams.get("month");

    // Rekap absensi untuk slip bulanan.
    if (searchParams.get("slip") === "1") {
      if (!userId || !month) {
        return Response.json(
          { ok: false, error: "Parameter 'userId' dan 'month' wajib diisi." },
          { status: 400 },
        );
      }
      return {
        slip: await attendanceSlip({ userId, month }),
        userId,
        month,
      };
    }

    // Ringkasan absensi + cuti untuk satu staf.
    if (userId && month) {
      const { staffAttendanceSummary } = await import("@/server/dal/staff");
      return { summary: await staffAttendanceSummary({ userId, month }) };
    }

    const [staff, counts] = await Promise.all([
      listStaff({
        departmentId: searchParams.get("departmentId") ?? undefined,
        status: (searchParams.get("status") as AbsensiStatus) ?? undefined,
        search: searchParams.get("search") ?? undefined,
      }),
      // Badge jumlah per tab. Kalau sedang filter status, angka tab
      // lain tidak berubah — jadi tetap perlu seluruh tabel.
      searchParams.get("withCounts") === "1"
        ? countStaffByStatus()
        : Promise.resolve(null),
    ]);

    return { staff, counts };
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

/**
 * PATCH /api/absensi/staff — ubah data staf.
 *
 * Pemisahan wewenang:
 *   - Profil + absensi role/status/kuota  → admin absensi
 *   - kpiRole                             → hanya HR / Executive
 */
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

    // Role KPI punya aturan sendiri, terpisah dari absensi admin.
    if (body.kpiRole !== undefined) {
      await requireKpiRole("hr", "executive");
      await setKpiRole(body.id, body.kpiRole);
    }

    const patch: StaffPatch = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === "id" || key === "kpiRole") continue;
      if (value === undefined) continue;
      (patch as Record<string, unknown>)[key] = value;
    }

    if (Object.keys(patch).length === 0) {
      return { ok: true };
    }

    const result = await updateStaff(body.id, patch, admin.id);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
    return { staff: result.staff };
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

    const result = await updateStaff(id, { absensiStatus: "deleted" }, admin.id);
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
    return { staff: result.staff };
  });
}