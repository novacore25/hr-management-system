import { withAuth, requireUser, requireAbsensiAdmin } from "@/server/dal/guards";
import {
  dashboardForDate,
  monthlyLateRows,
  exportRows,
  adminOverrideAttendance,
  adminOverrideLeave,
} from "@/server/dal/dashboard";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/dashboard
 *
 *   date=YYYY-MM-DD                → rekap kehadiran satu hari (default)
 *   view=fines&month=YYYY-MM       → rekap denda keterlambatan bulanan
 *   view=export&from=&to=          → baris mentah untuk laporan Excel
 *
 * Semua view hanya untuk admin absensi.
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    await requireAbsensiAdmin();
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");

    if (view === "fines") {
      const month =
        searchParams.get("month") ??
        new Date().toISOString().slice(0, 7);
      return { month, rows: await monthlyLateRows(month) };
    }

    if (view === "export") {
      const from = searchParams.get("from");
      const to = searchParams.get("to");

      if (!from || !to) {
        return Response.json(
          { ok: false, error: "Parameter 'from' dan 'to' wajib diisi." },
          { status: 400 },
        );
      }

      // Limitasi rentang supaya satu request tidak menarik seluruh tabel.
      const days = Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
          86_400_000,
      );
      if (days < 0 || days > 400) {
        return Response.json(
          { ok: false, error: "Rentang tanggal harus 0-400 hari." },
          { status: 400 },
        );
      }

      return await exportRows(from, to);
    }

    const date =
      searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    // Catatan: `holidays` sengaja TIDAK ikut di sini. Halaman ini sudah
    // memakainya lewat useHolidays(), jadi mengirimkannya dua kali
    // berarti dua sumber kebenaran untuk data yang sama.
    return { date, ...(await dashboardForDate(date)) };
  });
}

/**
 * POST /api/absensi/dashboard — override manual oleh admin.
 *
 *   kind=override-att    → upsert absensi (WFO/WFA) untuk satu user
 *   kind=override-leave  → insert pengajuan approved + potong kuota
 *
 * `processedBy` untuk cuti diambil dari session, BUKAN dari body —
 * sebelumnya اسم aktornya diambil dari state client dan bisa dipalsukan.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const admin = await requireAbsensiAdmin();
    const me = await requireUser();
    const body = await request.json();
    const actorName = me.email;

    if (body.kind === "override-att") {
      const { userId, date, type, checkIn, checkOut } = body;

      if (!userId || !date || !checkIn || !checkOut) {
        return Response.json(
          {
            ok: false,
            error:
              "Parameter 'userId', 'date', 'checkIn', dan 'checkOut' wajib diisi.",
          },
          { status: 400 },
        );
      }

      if (type !== "WFO" && type !== "WFA") {
        return Response.json(
          { ok: false, error: "Tipe harus WFO atau WFA." },
          { status: 400 },
        );
      }

      const result = await adminOverrideAttendance(
        {
          userId: String(userId),
          date: String(date),
          type,
          checkIn: String(checkIn),
          checkOut: String(checkOut),
        },
        admin.id,
        actorName,
      );

      if (!result.ok) {
        return Response.json(
          { ok: false, error: result.error },
          { status: 400 },
        );
      }
      return { ok: true };
    }

    if (body.kind === "override-leave") {
      const { userId, type, dates, reason } = body;

      if (!userId || !Array.isArray(dates) || dates.length === 0) {
        return Response.json(
          {
            ok: false,
            error: "Parameter 'userId' dan 'dates' (tidak kosong) wajib diisi.",
          },
          { status: 400 },
        );
      }

      if (type !== "leave" && type !== "sick" && type !== "wfa") {
        return Response.json(
          { ok: false, error: "Tipe harus leave, sick, atau wfa." },
          { status: 400 },
        );
      }

      const result = await adminOverrideLeave(
        {
          userId: String(userId),
          type,
          dates: dates.map(String).sort(),
          reason: String(reason ?? ""),
        },
        admin.id,
        actorName,
      );

      if (!result.ok) {
        return Response.json(
          { ok: false, error: result.error },
          { status: 400 },
        );
      }
      return { ok: true, days: result.days };
    }

    return Response.json(
      { ok: false, error: "kind harus 'override-att' atau 'override-leave'." },
      { status: 400 },
    );
  });
}