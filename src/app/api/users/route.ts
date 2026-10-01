import { withAuth, requireUser } from "@/server/dal/guards";
import { listActiveUsers, listUsersByDepartment } from "@/server/dal/users";

export const dynamic = "force-dynamic";

/**
 * GET /api/users
 *
 * Query param:
 *   id=<userId>        → satu user
 *   scope=active       → user aktif (default)
 *   scope=all          → semua user (butuh role hr/executive)
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
      const { findUserById } = await import("@/server/dal/users");
      return { user: await findUserById(id) };
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

    await requireUser();
    return { users: await listActiveUsers() };
  });
}
