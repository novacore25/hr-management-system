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

    const userId = searchParams.get("userId") ?? me.id;
    if (userId !== me.id) {
      await requireKpiRole("hr", "executive");
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