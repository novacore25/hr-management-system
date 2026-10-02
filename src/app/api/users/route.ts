import { withAuth, requireUser, requireKpiRole, isUuid } from "@/server/dal/guards";
import { listActiveUsers, listUsersByDepartment } from "@/server/dal/users";
import { db } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { users, departments } from "@/db/schema";
import type { KpiRole } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/users
 *
 * Query param:
 *   id=<userId>        → satu user
 *   scope=active       → user aktif (default)
 *   scope=all          → semua user (butuh role hr/executive)
 *   scope=managed      → member divisi yang dikelola aktornya + aktornya
 *                        sendiri (divisi dibaca dari `users.managed_departments`)
 *   department=<a,b>   → filter member divisi (berdasarkan NAMA divisi)
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const scope = searchParams.get("scope") ?? "active";
    const department = searchParams.get("department");

    if (id) {
      await requireUser();
      // CATATAN: `users.id` bertipe TEXT, bukan uuid. Jangan pakai
      // `isUuid` di sini — data uji lokal memakai `u-hr-001`, dan kolom
      // text tidak pernah melempar cast error.
      const { findUserById } = await import("@/server/dal/users");
      const user = await findUserById(id);
      if (!user) {
        return Response.json(
          { ok: false, error: "User tidak ditemukan." },
          { status: 404 },
        );
      }
      return { user };
    }

    if (department) {
      await requireUser();
      const names = department
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (names.length === 0) return { users: [] };

      // Nama divisi (dipakai UI) → id internal
      const { db } = await import("@/db");
      const { departments } = await import("@/db/schema");
      const { inArray } = await import("drizzle-orm");

      const deptRows = await db
        .select({ id: departments.id })
        .from(departments)
        .where(inArray(departments.name, names));

      if (deptRows.length === 0) return { users: [] };

      const lists = await Promise.all(
        deptRows.map((r) => listUsersByDepartment(r.id)),
      );

      const seen = new Set<string>();
      const flat = lists.flat().filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });
      return { users: flat };
    }

    if (scope === "all") {
      const { requireKpiRole } = await import("@/server/dal/guards");
      await requireKpiRole("hr", "executive");
      const { listAllUsers } = await import("@/server/dal/users");
      return { users: await listAllUsers() };
    }

    if (scope === "managed") {
      // Divisi dibaca dari `users.managed_departments` milik aktornya.
      // Halaman head/* sebelumnya mengambil daftar ini dari AuthContext
      // lalu mengirimkannya sebagai filter — bisa dimanipulasi di browser.
      const { requireKpiRole, requireProfile } = await import(
        "@/server/dal/guards"
      );
      await requireKpiRole("head", "hr", "executive");
      const profile = await requireProfile();

      const isSuperRole = ["hr", "executive", "developer"].includes(
        profile.kpiRole,
      );
      const managedDepartments = Array.isArray(profile.managedDepartments)
        ? profile.managedDepartments
        : [];

      const { listManagedMembers } = await import("@/server/dal/users");
      return {
        users: await listManagedMembers(
          isSuperRole ? null : managedDepartments,
          profile.id,
        ),
      };
    }

    await requireUser();
    return { users: await listActiveUsers() };
  });
}

/**
 * PATCH /api/users — ubah role KPI + divisi yang dikelola.
 *
 * formerly halaman /dashboard/hr/employees menulis `users` langsung dari
 * browser dengan `.eq("id", editUser.id)`. Dua masalahnya:
 *
 *   1. Tidak ada cek role di server. Halaman itu hanya menampilkan tombol
 *      untuk HR, jadi siapa pun yang berhasil membuka URL-nya bisa
 *      mengubah role siapa saja — termasuk mengubah dirinya sendiri
 *      menjadi `developer`, yang punya akses ke semua data.
 *
 *   2. `managed_departments` diisi dari daftar **NAMA** divisi
 *      (`useDepartments()` mengembalikan `names: string[]`), sedangkan
 *      semua kode server membandingkannya dengan **ID**. Setelah
 *      disimpan, scoping Head jadi kosong total — tidak ada error, hanya
 *      halaman yang tidak menampilkan apa pun.
 *
 * sekarang: divisi dikirim sebagai ID, divalidasi terhadap tabel
 * `departments`, dan hanya HR/Executive yang boleh.
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("hr", "executive");
    const b = await request.json();

    const userId = b.id ? String(b.id) : null;
    if (!userId) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    const VALID_ROLES = ["tim", "head", "hr", "executive", "developer"];

    if (b.kpiRole !== undefined && !VALID_ROLES.includes(String(b.kpiRole))) {
      return Response.json(
        { ok: false, error: `Role tidak valid: ${b.kpiRole}` },
        { status: 400 },
      );
    }

    // `developer` punya akses ke semua data, jadi pemberiannya harus
    // eksplisit oleh developer — bukan HR/executive.
    if (
      b.kpiRole === "developer" &&
      actor.kpiRole !== "developer"
    ) {
      return Response.json(
        {
          ok: false,
          error: "Role developer hanya bisa diberikan oleh developer.",
        },
        { status: 403 },
      );
    }

    let managedDepartments: string[] | undefined;

    if (b.managedDepartments !== undefined) {
      const raw = Array.isArray(b.managedDepartments)
        ? b.managedDepartments.map(String)
        : [];

      if (raw.length > 0) {
        // Format dicek sebelum query. `inArray(departments.id, ["TNT"])`
        // akan membuat Postgres melempar `invalid input syntax for type uuid`
        // — dan itu jadi 500 "Terjadi kesalahan di server", bukan pesan
        // yang bisa dibaca.
        const malformed = raw.filter((id: string) => !isUuid(id));
        if (malformed.length > 0) {
          return Response.json(
            {
              ok: false,
              error: `Divisi harus diisi dengan id, bukan nama. Nilai ini tidak valid: ${malformed.join(", ")}`,
            },
            { status: 400 },
          );
        }

        const rows = await db
          .select({ id: departments.id })
          .from(departments)
          .where(inArray(departments.id, raw));

        if (rows.length !== raw.length) {
          const known = new Set(rows.map((r) => r.id));
          const unknown = raw.filter((id: string) => !known.has(id));
          return Response.json(
            {
              ok: false,
              error: `Divisi tidak dikenal: ${unknown.join(", ")}`,
            },
            { status: 400 },
          );
        }
      }

      managedDepartments = raw;
    }

    const [current] = await db
      .select({
        kpiRole: users.kpiRole,
        managedDepartments: users.managedDepartments,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!current) {
      return Response.json(
        { ok: false, error: "User tidak ditemukan." },
        { status: 404 },
      );
    }

    const finalRole = b.kpiRole !== undefined ? String(b.kpiRole) : current.kpiRole;
    const finalDepts =
      managedDepartments ??
      (Array.isArray(current.managedDepartments)
        ? current.managedDepartments
        : []);

    // Head tanpa divisi = tidak punya area pengawasan, semua halamannya
    // kosong. Tolak di server, bukan hanya di form.
    if (finalRole === "head" && finalDepts.length === 0) {
      return Response.json(
        { ok: false, error: "Pilih minimal satu divisi untuk role Head." },
        { status: 400 },
      );
    }

    if (b.kpiRole === undefined && managedDepartments === undefined) {
      return Response.json(
        { ok: false, error: "Tidak ada perubahan yang dikirim." },
        { status: 400 },
      );
    }

    await db
      .update(users)
      .set({
        ...(b.kpiRole !== undefined ? { kpiRole: finalRole as KpiRole } : {}),
        ...(managedDepartments !== undefined
          ? { managedDepartments }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const { findUserById } = await import("@/server/dal/users");
    return { user: await findUserById(userId) };
  });
}
