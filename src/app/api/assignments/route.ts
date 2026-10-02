import {
  withAuth,
  requireUser,
  requireProfile,
  requireKpiRole,
  isUuid,
} from "@/server/dal/guards";
import {
  listUserAssignments,
  listAllAssignments,
  listDepartmentAssignments,
  listManagedAssignments,
  listUserAssignmentsInRange,
  findAssignmentById,
  createAssignments,
  setAssignmentStatus,
  setAssignmentTarget,
  deleteAssignment,
} from "@/server/dal/assignments";
import { getWorkingDaysInMonth } from "@/lib/performance";
import { db } from "@/db";
import { eq, inArray, sql } from "drizzle-orm";
import { kpiAssignments, users } from "@/db/schema";
import type { AssignmentStatus } from "@/types";

export const dynamic = "force-dynamic";

const VALID_STATUS: AssignmentStatus[] = [
  "active",
  "hold",
  "cancelled",
  "completed",
];

function num(v: string | null, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseStatuses(raw: string | null): AssignmentStatus[] {
  if (!raw) return ["active"];
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AssignmentStatus =>
      (VALID_STATUS as string[]).includes(s),
    );
  return list.length > 0 ? list : ["active"];
}

/**
 * GET /api/assignments
 *
 * Query param:
 *   scope=me          → assignment user yang login (default)
 *   scope=all         → semua (HR/Executive)
 *   scope=department  → satu divisi
 *   from=&to=YYYY-MM  → mode rentang (untuk user yang login)
 *   status=a,b        → filter status
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "me";
    const year = num(searchParams.get("year"), new Date().getFullYear());
    const month = num(searchParams.get("month"), new Date().getMonth() + 1);
    const statuses = parseStatuses(searchParams.get("status"));

    // Mode rentang (dipakai halaman dengan PeriodPicker)
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from && to) {
      const [fy, fm] = from.split("-").map(Number);
      const [ty, tm] = to.split("-").map(Number);
      const assignments = await listUserAssignmentsInRange(
        me.id,
        fy || year,
        fm || month,
        ty || year,
        tm || month,
      );
      return { assignments };
    }

    const id = searchParams.get("id");
    if (id) {
      if (!isUuid(id)) {
        return Response.json(
          { ok: false, error: "Parameter 'id' bukan id yang valid." },
          { status: 400 },
        );
      }
      return { assignment: await findAssignmentById(id) };
    }

    // Berapa penugasan aktif sebuah KPI — dipakai dialog konfirmasi hapus
    // KPI di /dashboard/head/kpi-setup.
    const kpiId = searchParams.get("kpiId");
    if (kpiId) {
      // Format dicek sebelum query: `eq(kpis.id, "apa saja")` membuat
      // Postgres melempar `invalid input syntax for type uuid`, yang
      // menjadi 500 "Terjadi kesalahan di server" — bukan pesan yang bisa
      // dibaca pengguna.
      if (!isUuid(kpiId)) {
        return Response.json(
          { ok: false, error: "Parameter 'kpiId' bukan id yang valid." },
          { status: 400 },
        );
      }
      const { countActiveAssignments } = await import(
        "@/server/dal/assignments"
      );
      return { count: await countActiveAssignments(kpiId) };
    }

    if (scope === "all") {
      await requireKpiRole("hr", "executive");
      return { assignments: await listAllAssignments(year, month, statuses) };
    }

    if (scope === "managed") {
      // Divisi dibaca dari `users.managed_departments` milik aktornya,
      // bukan dari query string. Head tidak bisa menunjuk divisi lain.
      const profile = await requireProfile();
      const managedDepartments = Array.isArray(profile.managedDepartments)
        ? profile.managedDepartments
        : [];
      return {
        assignments: await listManagedAssignments(
          managedDepartments,
          year,
          month,
          statuses,
          profile.id,
        ),
      };
    }

    if (scope === "department") {
      const profile = await requireKpiRole("head", "hr", "executive");
      const deptId = searchParams.get("departmentId");
      if (!deptId) {
        return Response.json(
          { ok: false, error: "Parameter 'departmentId' wajib diisi." },
          { status: 400 },
        );
      }
      // Head hanya boleh membaca divisi yang dia kelola. HR/Executive/
      // Developer boleh semua.
      const isSuperRole = ["hr", "executive", "developer"].includes(
        profile.kpiRole,
      );
      if (
        !isSuperRole &&
        !(
          Array.isArray(profile.managedDepartments) &&
          profile.managedDepartments.includes(deptId)
        )
      ) {
        return Response.json(
          { ok: false, error: "Divisi itu bukan milik Anda." },
          { status: 403 },
        );
      }
      return {
        assignments: await listDepartmentAssignments(
          deptId,
          year,
          month,
          statuses,
        ),
      };
    }

    // Default: milik sendiri
    return {
      assignments: await listUserAssignments(me.id, year, month, statuses),
    };
  });
}

/**
 * POST /api/assignments — buat assignment baru.
 *
 * Head boleh, tapi hanya untuk user di divisi yang dia kelola. Dulu
 * halaman /dashboard/head/penugasan/new menulis langsung ke
 * `kpi_assignments` dari browser, jadi Head bisa menugaskan KPI ke user
 * divisi mana pun. `departmentId` dari client tidak dipercaya; divisi
 * selalu diambil dari `users.department_id`.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("head", "hr", "executive");
    const body = await request.json();

    // Dua bentuk payload yang diterima:
    //   { year, month, rows: [...] }  ← preferred
    //   [ { kpiId, userId, ... }, ... ] ← legacy
    //
    // `year` / `month` harus dibaca dari elemen pertama kalau payload-nya
    // array. formerly `body?.year` mengembalikan undefined untuk array,
    // lalu jatuh ke bulan berjalan — bulk import untuk bulan lain
    // menulis ke bulan yang salah tanpa error.
    const rows: unknown[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.rows)
        ? body.rows
        : [body];

    const meta = Array.isArray(body)
      ? (body.find((r) => r && typeof r === "object" && r.year !== undefined) ??
        {})
      : body;
    const year = num(String(meta?.year), new Date().getFullYear());
    const month = num(String(meta?.month), new Date().getMonth() + 1);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return Response.json(
        { ok: false, error: "Parameter 'month' harus 1-12." },
        { status: 400 },
      );
    }

    const workingDaysTotal = getWorkingDaysInMonth(year, month);

    const draft = rows
      .filter((r): r is Record<string, unknown> => !!r)
      .filter((r) => r.kpiId && r.userId)
      .map((r) => ({
        kpiId: String(r.kpiId),
        userId: String(r.userId),
        monthlyTarget: Number(r.monthlyTarget ?? 0),
      }));

    if (draft.length === 0) {
      return Response.json(
        { ok: false, error: "Data assignment tidak valid." },
        { status: 400 },
      );
    }

    const badTarget = draft.find((r) => !Number.isFinite(r.monthlyTarget) || r.monthlyTarget <= 0);
    if (badTarget) {
      return Response.json(
        { ok: false, error: "Target harus angka dan lebih besar dari 0." },
        { status: 400 },
      );
    }

    // Divisi SELALU dari tabel `users`, bukan dari payload.
    const targetRows = await db
      .select({ id: users.id, departmentId: users.departmentId })
      .from(users)
      .where(inArray(users.id, [...new Set(draft.map((r) => r.userId))]));
    const deptByUser = new Map(targetRows.map((r) => [r.id, r.departmentId]));

    const unknownUser = draft.find((r) => !deptByUser.has(r.userId));
    if (unknownUser) {
      return Response.json(
        { ok: false, error: `User ${unknownUser.userId} tidak ditemukan.` },
        { status: 400 },
      );
    }

    const isSuperRole = ["hr", "executive", "developer"].includes(actor.kpiRole);
    const managedDepartments = Array.isArray(actor.managedDepartments)
      ? actor.managedDepartments
      : [];

    if (!isSuperRole) {
      const outside = draft.find((r) => {
        const dept = deptByUser.get(r.userId);
        // Tanpa divisi tidak bisa dicocokkan dengan daftar yang dikelola.
        return !dept || !managedDepartments.includes(dept);
      });
      if (outside) {
        return Response.json(
          { ok: false, error: "Ada user di luar divisi yang Anda kelola." },
          { status: 403 },
        );
      }
    }

    const inputs = draft.map((r) => ({
      kpiId: r.kpiId,
      userId: r.userId,
      departmentId: deptByUser.get(r.userId) ?? null,
      monthlyTarget: r.monthlyTarget,
      year,
      month,
      workingDaysTotal,
      assignedBy: actor.id,
    }));

    return createAssignments(inputs);
  });
}

/**
 * PATCH /api/assignments — ubah status / target.
 *
 * Head boleh, tapi hanya untuk assignment milik divisi yang dia kelola
 * (atau miliknya sendiri). formerly halaman /dashboard/head/penugasan
 * menulis `kpi_assignments` langsung dari browser, jadi satu Head bisa
 * membatalkan penugasan divisi mana pun hanya dengan mengubah `id`.
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("head", "hr", "executive");
    const { id, action, status, monthlyTarget } = await request.json();

    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }

    const [target] = await db
      .select({
        userId: sql<string>`${kpiAssignments.userId}`,
        departmentId: sql<string | null>`${kpiAssignments.departmentId}`,
      })
      .from(kpiAssignments)
      .where(eq(kpiAssignments.id, String(id)))
      .limit(1);

    if (!target) {
      return Response.json(
        { ok: false, error: "Assignment tidak ditemukan." },
        { status: 404 },
      );
    }

    const isSuperRole = ["hr", "executive", "developer"].includes(actor.kpiRole);
    if (!isSuperRole) {
      const managedDepartments = Array.isArray(actor.managedDepartments)
        ? actor.managedDepartments
        : [];
      const allowed =
        target.userId === actor.id ||
        (target.departmentId !== null &&
          managedDepartments.includes(target.departmentId));

      if (!allowed) {
        return Response.json(
          { ok: false, error: "Assignment ini di luar divisi yang Anda kelola." },
          { status: 403 },
        );
      }
    }

    if (action === "set-status") {
      if (!VALID_STATUS.includes(status)) {
        return Response.json(
          { ok: false, error: `Status tidak valid: ${status}` },
          { status: 400 },
        );
      }
      await setAssignmentStatus(String(id), status, actor.id);
      return { assignment: await findAssignmentById(String(id)) };
    }

    if (action === "set-target") {
      const target_ = Number(monthlyTarget);
      if (!Number.isFinite(target_) || target_ <= 0) {
        return Response.json(
          { ok: false, error: "Target harus angka dan lebih besar dari 0." },
          { status: 400 },
        );
      }
      await setAssignmentTarget(String(id), target_, actor.id);
      return { assignment: await findAssignmentById(String(id)) };
    }

    return Response.json(
      { ok: false, error: "Action tidak dikenal." },
      { status: 400 },
    );
  });
}

/** DELETE /api/assignments — Executive only. */
export async function DELETE(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("executive");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return Response.json(
        { ok: false, error: "Parameter 'id' wajib diisi." },
        { status: 400 },
      );
    }
    await deleteAssignment(id);
    return { deleted: id };
  });
}