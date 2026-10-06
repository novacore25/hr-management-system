import { withAuth, requireActiveAbsensiStaff } from "@/server/dal/guards";
import { presenceSummary, myAttendanceMonth } from "@/server/dal/dashboard";

export const dynamic = "force-dynamic";

/**
 * GET /api/absensi/summary
 *
 *   date=YYYY-MM-DD → ringkasan kehadiran tim (default hari ini)
 *   mine=1          → tambahkan statistik pribadi pemanggil
 *   month=YYYY-MM   → bulan untuk statistik pribadi (default bulan ini)
 *
 * Untuk widget check-in di /dashboard/tim, jadi BUKAN admin-only.
 * Isinya nama + kategori kehadiran per hari, sama persis dengan yang
 * sudah ditampilkan widget versi lama — tidak ada data baru yang
 * dibuka ke user.
 *
 * `mine` hanya mengembalikan angka pemanggil sendiri. Server mengambil
 * userId dari session, tidak pernah dari query string — kalau
 * `mine=<id orang lain>` diterima, siapa pun bisa membaca kehadiran
 * siapa saja.
 */
export async function GET(request: Request) {
  return withAuth(async () => {
    const me = await requireActiveAbsensiStaff();

    const { searchParams } = new URL(request.url);

    // Default tanggal dari zona waktu server (ENV TZ = Asia/Jakarta).
    // toISOString() memakai UTC, jadi tanpa konversi eksplisit tanggalnya
    // akan mundur sehari setelah pukul 17:00 WIB.
    const nowWib = new Date();
    const hariIniWib =
      `${nowWib.getFullYear()}-${String(nowWib.getMonth() + 1).padStart(2, "0")}-` +
      `${String(nowWib.getDate()).padStart(2, "0")}`;

    const date = searchParams.get("date") ?? hariIniWib;

    // `mine` dikirim terpisah dari `summary` karena sifatnya berbeda:
    // summary adalah agregasi tim yang boleh dilihat semua staf,
    // sedangkan `mine` hanya untuk pemanggil. Kalau digabung, statistik
    // pribadi ikut terkirim ke semua orang tanpa disadari.
    //
    // Dipasang di balik query `mine=1` supaya polling 30 detik tidak
    // menarik statistik pribadi di setiap siklus.
    const wantsMine = searchParams.get("mine") === "1";

    // `month=YYYY-MM` memilih bulan untuk statistik pribadi.
    //
    // Tanpa ini, myAttendanceMonth() hanya bisa diuji terhadap bulan
    // berjalan -- dan hasilnya berubah setiap tanggal dijalankan, jadi
    // test lulus atau gagal tergantung tanggal, bukan tergantung kode.
    //
    // Formatnya divalidasi di sini, bukan diteruskan mentah ke SQL.
    // Nilai yang tidak cocok pola TIDAK di-parse: kalau dipaksakan,
    // tanggal yang tidak valid akan jadi query ke database.
    const bulan = searchParams.get("month");
    let targetMonth: { year: number; month: number } | undefined;

    if (bulan) {
      const cocok = /^(\d{4})-(\d{2})$/.exec(bulan);
      const year = cocok ? Number(cocok[1]) : 0;
      const month = cocok ? Number(cocok[2]) : 0;
      if (year >= 1970 && year <= 2999 && month >= 1 && month <= 12) {
        targetMonth = { year, month };
      }
    }

    return {
      date,
      summary: await presenceSummary(date),
      ...(wantsMine
        ? { mine: await myAttendanceMonth(me.id, targetMonth) }
        : {}),
    };
  });
}