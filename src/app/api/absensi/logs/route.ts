import { withAuth, requireAbsensiAdmin } from "@/server/dal/guards";
import { listLogs, logActorNames } from "@/server/dal/absensi";

export const dynamic = "force-dynamic";

/** GET /api/absensi/logs — audit log absensi. Admin only. */
export async function GET() {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const logs = await listLogs(200);

    const actors = await logActorNames(
      [...new Set(logs.map((l) => l.actor))].filter(Boolean),
    );

    return {
      logs: logs.map((l) => ({ ...l, actorName: actors[l.actor] ?? l.actor })),
    };
  });
}
