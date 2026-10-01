import { withAuth, requireUser, requireKpiRole } from "@/server/dal/guards";
import {
  getUserWeights,
  getAllWeights,
  setUserWeights,
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

/** PUT /api/kpi-settings — simpan bobot. */
export async function PUT(request: Request) {
  return withAuth(async () => {
    const actor = await requireKpiRole("hr", "executive");
    const body = await request.json();
    const userId = body.userId ?? actor.id;

    const weights = await setUserWeights(
      userId,
      {
        result: body.resultWeight ?? body.result,
        activity: body.activityWeight ?? body.activity,
        quality: body.qualityWeight ?? body.quality,
        leadTim: body.leadTimWeight ?? body.leadTim,
        hr: body.hrWeight ?? body.hr,
      },
      actor.id,
    );

    return { weights };
  });
}