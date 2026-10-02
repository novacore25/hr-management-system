import { withAuth, requireUser, requireKpiRole } from "@/server/dal/guards";
import {
  listDepartments,
  listDepartmentNames,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "@/server/dal/departments";

export const dynamic = "force-dynamic";

/** GET /api/departments */
export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");

    // `scope=managed` — hanya divisi yang dikelola aktornya.
    //
    // formerly /dashboard/head/kpi-setup/{new,edit} mengambil daftar ini
    // dari `AuthContext.user.managedDepartments` dan mengirimkannya
    // sebagai `allowedDepartments`. Head tinggal mengubah nilainya di
    // browser lalu membuat KPI untuk divisi mana pun. Divisi yang
    // dikelola sekarang dibaca dari `users.managed_departments` di
    // database.
    if (scope === "managed") {
      const profile = await requireKpiRole("head", "hr", "executive");

      const isSuperRole = ["hr", "executive", "developer"].includes(
        profile.kpiRole,
      );
      const managed = Array.isArray(profile.managedDepartments)
        ? profile.managedDepartments
        : [];

      return { departments: await listDepartments(isSuperRole ? null : managed) };
    }

    await requireUser();
    const namesOnly = searchParams.get("names") === "1";
    return {
      departments: namesOnly ? undefined : await listDepartments(),
      names: namesOnly ? await listDepartmentNames() : undefined,
    };
  });
}

/** POST /api/departments — buat divisi baru. HR/Executive only. */
export async function POST(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("hr", "executive");
    const { name } = await request.json();
    if (!name?.trim()) {
      return Response.json(
        { ok: false, error: "Nama divisi wajib diisi." },
        { status: 400 },
      );
    }
    return { department: await createDepartment(name.trim()) };
  });
}

/** PATCH /api/departments — ubah nama. HR/Executive only. */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("hr", "executive");
    const { id, name } = await request.json();
    if (!id || !name?.trim()) {
      return Response.json(
        { ok: false, error: "Parameter 'id' dan 'name' wajib diisi." },
        { status: 400 },
      );
    }
    return { department: await updateDepartment(id, name.trim()) };
  });
}

/** DELETE /api/departments — hapus divisi. HR/Executive only. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("hr", "executive");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }
    await deleteDepartment(id);
    return { deleted: id };
  });
}
