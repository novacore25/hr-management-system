import {
  withAuth,
  requireProfile,
  requireKpiRole,
} from "@/server/dal/guards";
import { listQualityRows, setQualityScore } from "@/server/dal/quality";

export const dynamic = "force-dynamic";

type QualityRow = Awaited<ReturnType<typeof listQualityRows>>[number];

/**
 * GET /api/kpi/quality
 *
 * Parameter:
 *   year=&month=        → default bulan berjalan
 *   scope=self          → hanya assignment miliknya (default)
 *   scope=managed       → seluruh divisi yang dikelola aktornya di database
 *   scope=all           → semua divisi (khusus hr / executive / developer)
 *   departmentId=<uuid> → persempit ke satu divisi
 *   userId=<id>         → persempit ke satu user
 *
 * DIVISI SELALU DITENTUKAN DI SERVER. Halaman /dashboard/head/quality
 * sebelumnya mengambil `user.managedDepartments` dari AuthContext di
 * browser lalu mengirimkannya sebagai filter. Head cukup mengubah nilai
 * itu di browser untuk membaca — dan menilai — divisi yang bukan
 * miliknya. Sekarang `scope=managed` membaca `users.managed_departments`
 * langsung dari database.
 *
 * Nilai selalu dihitung ulang dari `monthly_scores` kalau baris itu ada,
 * bukan dari kolom denormalisasi di kpi_assignments yang bisa basi.
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const profile = await requireProfile();
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

    // Staf biasa tidak punya halaman ini sama sekali, jadi tolak di server.
    // Sebelumnya pengecekan role hanya ada di komponen React — yang bisa
    // dilewati dengan memanggil endpoint langsung.
    await requireKpiRole("head", "hr", "executive", "developer");

    const scope = searchParams.get("scope") ?? "self";
    const requestedDepartmentId = searchParams.get("departmentId");
    const requestedUserId = searchParams.get("userId");

    const managedDepartments = Array.isArray(profile.managedDepartments)
      ? profile.managedDepartments
      : [];
    const isSuperRole = ["hr", "executive", "developer"].includes(
      profile.kpiRole,
    );

    const invalidScope = Response.json(
      { ok: false, error: `Parameter 'scope' tidak dikenal: ${scope}` },
      { status: 400 },
    );
    const forbidden = (msg: string) =>
      Response.json({ ok: false, error: msg }, { status: 403 });

    let departmentId: string | null = null;
    let departmentIds: string[] | null = null;
    let userId: string | null = null;
    let alsoIncludeUserIds: string[] | null = null;

    if (scope === "self") {
      // Default tersempit, supaya HR tidak tanpa sadar ikut menilai semua
      // orang. Endpoint ini yang menulis nilai, jadi default-nya konservatif.
      userId = requestedUserId ?? profile.id;
    } else if (scope === "managed") {
      if (requestedDepartmentId) {
        if (
          !isSuperRole &&
          !managedDepartments.includes(requestedDepartmentId)
        ) {
          return forbidden("Divisi itu bukan milik Anda.");
        }
        departmentId = requestedDepartmentId;
      } else {
        // Tanpa divisi eksplisit: seluruh divisi yang dikelola, PLUS
        // assignment milik aktornya sendiri. KPI Head sendiri sering tidak
        // punya department_id, jadi tanpa bagian ini dia melihat timnya
        // tapi tidak dirinya sendiri.
        if (isSuperRole) {
          departmentIds = null;
        } else {
          departmentIds = managedDepartments;
          alsoIncludeUserIds = [profile.id];
        }
      }
    } else if (scope === "all") {
      if (!isSuperRole) {
        return forbidden(
          "Scope 'all' hanya untuk HR, Executive, atau Developer.",
        );
      }
    } else {
      return invalidScope;
    }

    const kpiTypes = searchParams.get("kpiTypes");
    const rows = await listQualityRows({
      year,
      month,
      departmentId,
      departmentIds,
      alsoIncludeUserIds,
      userId: requestedUserId ?? userId,
      // Nilai sudah divalidasi DAL (harus anggota kpi_type), jadi string
      // dari query tidak bisa dipakai untuk menyaring kolom lain.
      ...(kpiTypes
        ? {
            kpiTypes: kpiTypes
              .split(",")
              .map((t) => t.trim())
              .filter((t): t is QualityRow["kpiType"] =>
                ["quality", "lead_tim", "hr", "result", "activity"].includes(
                  t,
                ),
              ),
          }
        : {}),
    });

    return { year, month, rows };
  });
}

/**
 * PUT /api/kpi/quality — simpan nilai KPI kualitas.
 *
 * `achievementPercentage` TIDAK diterima dari client; dihitung dari
 * `actualTotal / monthlyTarget` di server. Otorisasi per-assignment juga
 * dicek di server (`assertCanScore` di DAL), bukan hanya tingkat role.
 */
export async function PUT(request: Request) {
  return withAuth(async () => {
    await requireKpiRole("head", "hr", "executive", "developer");
    const profile = await requireProfile();
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
      {
        id: profile.id,
        kpiRole: profile.kpiRole,
        managedDepartments: Array.isArray(profile.managedDepartments)
          ? profile.managedDepartments
          : [],
      },
    );

    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }

    return { row: result.row };
  });
}
