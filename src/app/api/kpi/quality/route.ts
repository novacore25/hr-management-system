import {
  withAuth,
  requireUser,
  requireKpiRole,
} from "@/server/dal/guards";
import {
  listQualityRows,
  setQualityScore,
} from "@/server/dal/quality";

export const dynamic = "force-dynamic";

/**
 * GET /api/kpi/quality
 *
 *   year=&month=       → default bulan berjalan
 *   departmentId=<uuid> → batasi satu divisi (Head)
 *   userId=<id>        → batasi satu user (Evaluasi HR untuk diri sendiri)
 *
 * Nilai selalu dihitung ulang dari `monthly_scores` kalau baris itu ada,
 * bukan dari kolom denormalisasi di kpi_assignments yang bisa basi.
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const year = Number(searchParams.get("year")) || now.getFullYear();
    const month = Number(searchParams.get("month")) || now.getMonth() + 1;

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return Response.json(
        { ok: false, error: "Parameter 'month' harus 1-12." },
        { status: 400 },
      );
    }

    const departmentId = searchParams.get("departmentId");
    const userId = searchParams.get("userId");

    // Staff biasa tidak punya halaman ini sama sekali, jadi tolak di
    // server. Sebelumnya pengecekan role hanya ada di komponen React —
    // yang bisa dilewati dengan memanggil endpoint langsung.
    await requireKpiRole("head", "hr", "executive", "developer");

    // Kalau tidak ada filter eksplisit, batasi ke miliknya sendiri
    // supayaHR tidak tanpa sadar ikut menilai semua orang diam-diam
    // (endpoint ini yang menyimpan nilai, jadi scoping itu penting).
    const scopeToSelf = userId === null && departmentId === null;

    const rows = await listQualityRows({
      year,
      month,
      departmentId: departmentId ?? null,
      userId: scopeToSelf ? me.id : userId,
    });

    return { year, month, rows };
  });
}

/**
 * PUT /api/kpi/quality — simpan nilai KPI kualitas.
 *
 * `achievementPercentage` TIDAK diterima dari client; dihitung dari
 * `actualTotal / monthlyTarget` di server.
 */
export async function PUT(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("head", "hr", "executive", "developer");
    const me = await requireUser();
    const body = await request.json();

    if (!body.assignmentId) {
      return Response.json(
        { ok: false, error: "Parameter 'assignmentId' wajib diisi." },
        { status: 400 },
      );
    }

    const actualTotal = Number(body.actualTotal);
    if (!Number.isFinite(actualTotal)) {
      return Response.json(
        { ok: false, error: "Parameter 'actualTotal' harus angka." },
        { status: 400 },
      );
    }

    const now = new Date();
    const result = await setQualityScore(
      {
        assignmentId: String(body.assignmentId),
        year: Number(body.year) || now.getFullYear(),
        month: Number(body.month) || now.getMonth() + 1,
        actualTotal,
        notes: body.notes ?? null,
      },
      me.id,
    );

    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }

    return { row: result.row };
  });
}