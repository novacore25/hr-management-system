import { withAuth, requireUser, requireAbsensiAdmin } from "@/server/dal/guards";
import {
  getSettings,
  updateSettings,
  listHolidays,
  createHoliday,
  deleteHoliday,
  listOffices,
  createOffice,
  deleteOffice,
  linkOfficeToDepartment,
  unlinkOfficeFromDepartment,
  type SettingsPatch,
} from "@/server/dal/absensi";

export const dynamic = "force-dynamic";

/** GET /api/absensi/settings */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireUser();
    const { searchParams } = new URL(request.url);

    if (searchParams.get("include") === "holidays") {
      return { settings: await getSettings(), holidays: await listHolidays() };
    }
    if (searchParams.get("include") === "offices") {
      return { offices: await listOffices() };
    }

    return { settings: await getSettings() };
  });
}

/** PATCH /api/absensi/settings — admin absensi only. */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const body = await request.json();

    // Sabotase setting yang menentukan perhitungan.
    for (const key of ["__proto__", "constructor", "prototype"]) {
      delete body[key];
    }

    const allowed: SettingsPatch = {
      workStart: body.workStart,
      workEnd: body.workEnd,
      maxLate: body.maxLate,
      maxTimeSick: body.maxTimeSick,
      maxTimeLeave: body.maxTimeLeave,
      maxTimeWfa: body.maxTimeWfa,
      officeLat:
        body.officeLat !== undefined ? Number(body.officeLat) : undefined,
      officeLng:
        body.officeLng !== undefined ? Number(body.officeLng) : undefined,
      officeRadius:
        body.officeRadius !== undefined ? Number(body.officeRadius) : undefined,
    };

    for (const key of Object.keys(allowed) as (keyof SettingsPatch)[]) {
      if (allowed[key] === undefined) delete allowed[key];
    }

    return { settings: await updateSettings(allowed) };
  });
}

/** POST /api/absensi/settings — buat hari libur / kantor baru. */
export async function POST(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const body = await request.json();

    if (body.kind === "holiday") {
      if (!body.date) {
        return Response.json(
          { ok: false, error: "Tanggal wajib diisi." },
          { status: 400 },
        );
      }
      return {
        holiday: await createHoliday(body.date, body.description ?? ""),
      };
    }

    if (body.kind === "office") {
      if (!body.name || body.lat === undefined || body.lng === undefined) {
        return Response.json(
          { ok: false, error: "Nama, latitude, longitude wajib diisi." },
          { status: 400 },
        );
      }
      return {
        office: await createOffice({
          name: String(body.name),
          lat: Number(body.lat),
          lng: Number(body.lng),
          radius: Number(body.radius ?? 100),
        }),
      };
    }

    return Response.json(
      { ok: false, error: "kind harus 'holiday' atau 'office'." },
      { status: 400 },
    );
  });
}

/** DELETE /api/absensi/settings — hapus hari libur / kantor. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const sp = new URL(request.url).searchParams;
    const kind = sp.get("kind");
    const id = sp.get("id");

    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    if (kind === "holiday") {
      await deleteHoliday(id);
      return { deleted: id };
    }
    if (kind === "office") {
      await deleteOffice(id);
      return { deleted: id };
    }

    return Response.json(
      { ok: false, error: "kind harus 'holiday' atau 'office'." },
      { status: 400 },
    );
  });
}

/** PUT /api/absensi/settings — relasi kantor <-> divisi. */
export async function PUT(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const { officeId, departmentId, link } = await request.json();

    if (!officeId || !departmentId) {
      return Response.json(
        { ok: false, error: "officeId dan departmentId wajib diisi." },
        { status: 400 },
      );
    }

    if (link) {
      await linkOfficeToDepartment(officeId, departmentId);
    } else {
      await unlinkOfficeFromDepartment(officeId, departmentId);
    }

    return { offices: await listOffices() };
  });
}
