import {
  withAuth,
  requireUser,
  requireKpiRole,
  isUuid,
} from "@/server/dal/guards";
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

    // CATATAN: `users.id` bertipe TEXT, bukan uuid. Jadi id user tidak boleh
    // diperiksa dengan `isUuid` — data uji lokal memakai `u-hr-001`, dan
    // kolom text tidak pernah melempar cast error seperti kolom uuid.
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

    // formerly `getUserWeights()` mengembalikan DEFAULT_WEIGHTS untuk user
    // yang tidak ada. Klien yang tidak memeriksa hasilnya akan menyimpan
    // 50/30/20 sebagai "bobot asli" padahal tidak ada barisnya sama
    // sekali. Lebih baik 404 daripada jawaban yang terlihat benar.
    const { exists } = await import("@/server/dal/users");
    if (!(await exists(userId))) {
      return Response.json(
        { ok: false, error: "User tidak ditemukan." },
        { status: 404 },
      );
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

    const raw = {
      result: body.resultWeight ?? body.result,
      activity: body.activityWeight ?? body.activity,
      quality: body.qualityWeight ?? body.quality,
      leadTim: body.leadTimWeight ?? body.leadTim,
      hr: body.hrWeight ?? body.hr,
    };

    // formerly halaman /dashboard/hr/employees menulis `kpi_settings`
    // langsung dari browser dengan `upsert()`. Satu-satunya penjaga ada di
    // form, yang bisa dilewati dengan request biasa. Akibatnya bobot bisa
    // tersimpan tidak seimbang — atau Worse, BERBEDA DARI DEFAULT tanpa
    // sengaja — dan seluruh skor KPI orang itu jadi tidak bermakna.
    //
    // Jadi di sini: lima field wajib ada, harus bilangan bulat 0-100.
    const LABEL: Record<keyof typeof raw, string> = {
      result: "Result",
      activity: "Activity",
      quality: "Quality",
      leadTim: "Lead Tim",
      hr: "HR",
    };

    const weights: Record<keyof typeof raw, number> = {
      result: 0, activity: 0, quality: 0, leadTim: 0, hr: 0,
    };

    for (const key of Object.keys(raw) as (keyof typeof raw)[]) {
      const v = raw[key];

      if (v === undefined || v === null || v === "") {
        return Response.json(
          {
            ok: false,
            error: `Bobot ${LABEL[key]} wajib diisi. Lima bobot harus dikirim lengkap agar tidak ada yang diam-diam memakai nilai default.`,
          },
          { status: 400 },
        );
      }

      const n = Number(v);
      if (!Number.isInteger(n)) {
        return Response.json(
          {
            ok: false,
            error: `Bobot ${LABEL[key]} harus bilangan bulat, bukan "${v}".`,
          },
          { status: 400 },
        );
      }
      if (n < 0 || n > 100) {
        return Response.json(
          {
            ok: false,
            error: `Bobot ${LABEL[key]} harus antara 0 dan 100 (sekarang ${n}).`,
          },
          { status: 400 },
        );
      }

      weights[key] = n;
    }

    const perf = weights.result + weights.activity + weights.quality;
    const pers = weights.leadTim + weights.hr;

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
      const affected = await applyWeightsToActiveStaff(weights, actor.id);
      return { affected, weights };
    }

    const userId = body.userId ?? actor.id;
    const { exists } = await import("@/server/dal/users");
    if (!(await exists(userId))) {
      // Tanpa cek ini, `insert` menabrak foreign key ke `users` dan
      // menjadi 500 "Terjadi kesalahan di server".
      return Response.json(
        { ok: false, error: "User tidak ditemukan." },
        { status: 404 },
      );
    }
    return { weights: await setUserWeights(userId, weights, actor.id) };
  });
}