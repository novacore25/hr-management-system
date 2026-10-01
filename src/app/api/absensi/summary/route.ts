import { withAuth, requireActiveAbsensiStaff } from "@/server/dal/guards";
import { presenceSummary } from "@/server/dal/dashboard";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/summary
 *
 *   date=YYYY-MM-DD → ringkasan kehadiran tim (default hari ini)
 *
 * Untuk widget check-in di /dashboard/tim, jadi BUKAN admin-only.
 * Isinya nama + kategori kehadiran per hari, sama persis dengan yang
 * sudah ditampilkan widget versi lama — tidak ada data baru yang
 * dibuka ke user.
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireActiveAbsensiStaff();

    const date =
      new URL(request.url).searchParams.get("date") ??
      new Date().toISOString().slice(0, 10);

    return { date, summary: await presenceSummary(date) };
  });
}