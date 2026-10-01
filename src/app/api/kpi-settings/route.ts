import { withAuth, requireUser, requireKpiRole } from "@/server/dal/guards";
import {
  getUserWeights,
  getAllWeights,
  setUserWeights,
  applyWeightsToActiveStaff,
  DEFAULT_WEIGHTS,
} from "@/server/dal/assignments";

export const dynamic = "force-dynamic";

/**
 * GET /api/kpi-settings
 *
 *   userId=<id>  → bobot satu user (default: user yang login)
 *   scope=all    → semua bobot (HR/Executive)
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    if (searchParams.get("scope") === "all") {
      await requireKpiRole("hr", "executive");
      return { weights: await getAllWeights(), defaults: DEFAULT_WEIGHTS };
    }

    if (searchParams.get("scope") === "managed") {
      // Bobot hanya untuk user di divisi yang dikelola aktornya.
      // formerly halaman /dashboard/head/penugasan memakai
      // `useAllKpiSettings` (scope=all) supaya bisa menghitung skor tim,
      // tapi endpoint itu butuh role hr/executive — jadi Head selalu dapat
      // 403 dan skor timnya diam-diam memakai DEFAULT_WEIGHTS, bukan bobot
      // asli yang disetel HR.
      const { requireProfile } = await import("@/server/dal/guards");
      await requireKpiRole("head", "hr", "executive");
      const profile = await requireProfile();

      const { listManagedMembers } = await import("@/server/dal/users");
      const { getAllWeights, getUserWeights } = await import(
        "@/server/dal/assignments"
      );

      const isSuperRole = ["hr", "executive", "developer"].includes(
        profile.kpiRole,
      );
      const managedDepartments = Array.isArray(profile.managedDepartments)
        ? profile.managedDepartments
        : [];

      const members = await listManagedMembers(
        isSuperRole ? null : managedDepartments,
        profile.id,
      );

      const all = await getAllWeights();
      const weights: Record<string, Awaited<ReturnType<typeof getUserWeights>>> =
        {};
      for (const m of members) {
        weights[m.id] = all[m.id] ?? DEFAULT_WEIGHTS;
      }

      return { weights, defaults: DEFAULT_WEIGHTS };
    }

    const userId = searchParams.get("userId") ?? me.id;
    if (userId !== me.id) {
      const profile = await requireKpiRole("head", "hr", "executive");

      // Head hanya boleh melihat bobot user di divisi yang dia kelola.
      // Divisi dibaca dari `users.department_id`, bukan dari filter client.
      if (!["hr", "executive", "developer"].includes(profile.kpiRole)) {
        const { db } = await import("@/db");
        const { users } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");

        const [target] = await db
          .select({ id: users.id, departmentId: users.departmentId })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        const managedDepartments = Array.isArray(profile.managedDepartments)
          ? profile.managedDepartments
          : [];
        const allowed =
          userId === profile.id ||
          (target &&
            target.departmentId !== null &&
            managedDepartments.includes(target.departmentId));

        if (!allowed) {
          return Response.json(
            { ok: false, error: "User itu bukan bagian dari tim Anda." },
            { status: 403 },
          );
        }
      }
    }

    return {
      weights: await getUserWeights(userId),
      defaults: DEFAULT_WEIGHTS,
    };
  });
}

/**
 * PUT /api/kpi-settings — simpan bobot.
 *
 *   userId=<id>     → bobot satu user
 *   scope=all       → terapkan ke SELURUH staf aktif sekaligus
 */
export async function PUT(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("hr", "executive");
    const body = await request.json();

    const weights = {
      result: body.resultWeight ?? body.result,
      activity: body.activityWeight ?? body.activity,
      quality: body.qualityWeight ?? body.quality,
      leadTim: body.leadTimWeight ?? body.leadTim,
      hr: body.hrWeight ?? body.hr,
    };

    // Validasi total bobot. Dulu dicek di form; kalau dicewatkan lewat
    // API, bobot bisa tersimpan tidak seimbang dan skor KPI jadi sia-sia.
    const resolved = { ...DEFAULT_WEIGHTS, ...weights };
    const perf = resolved.result + resolved.activity + resolved.quality;
    const pers = resolved.leadTim + resolved.hr;

    if (perf !== 100) {
      return Response.json(
        {
          ok: false,
          error: `Total bobot Performance harus tepat 100 (sekarang ${perf}).`,
        },
        { status: 400 },
      );
    }
    if (pers !== 100) {
      return Response.json(
        {
          ok: false,
          error: `Total bobot Personality harus tepat 100 (sekarang ${pers}).`,
        },
        { status: 400 },
      );
    }

    if (body.scope === "all") {
      const affected = await applyWeightsToActiveStaff(resolved, actor.id);
      return { affected, weights: resolved };
    }

    const userId = body.userId ?? actor.id;
    return { weights: await setUserWeights(userId, weights, actor.id) };
  });
}