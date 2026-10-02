import { withAuth, requireProfile } from "@/server/dal/guards";
import {
  listFeedbacks,
  setFeedbackStatus,
  createFeedback,
} from "@/server/dal/feedbacks";

export const dynamic = "force-dynamic";

/**
 * GET /api/feedbacks — daftar laporan (developer only).
 *
 * formerly halaman ini query Supabase dari browser tanpa penjagaan apa pun.
 * Laporan bisa memuat informasi internal (nama file, path, isi error),
 * jadi hanya `developer` yang boleh membacanya.
 */
export async function GET() {
  return withAuth(async () => {
    const profile = await requireProfile();
    if (profile.kpiRole !== "developer") {
      return Response.json(
        { ok: false, error: "Halaman ini khusus developer." },
        { status: 403 },
      );
    }
    return { feedbacks: await listFeedbacks() };
  });
}

/** PATCH /api/feedbacks — ubah status satu laporan (developer only). */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const profile = await requireProfile();
    if (profile.kpiRole !== "developer") {
      return Response.json(
        {
          ok: false,
          error: "Hanya developer yang bisa mengubah status laporan.",
        },
        { status: 403 },
      );
    }

    const { id, status } = await request.json();
    if (!id || !status) {
      return Response.json(
        { ok: false, error: "Parameter 'id' dan 'status' wajib diisi." },
        { status: 400 },
      );
    }

    return { feedback: await setFeedbackStatus(String(id), String(status)) };
  });
}

/**
 * POST /api/feedbacks — kirim laporan baru.
 *
 * Terbuka untuk semua user yang login: menu "Lapor Bug / Fitur" ada di
 * sidebar setiap orang, dan hanya developer yang boleh MEMBACA hasilnya.
 *
 * formerly `FeedbackModal` menulis langsung ke tabel dari browser dengan
 * `user_name`, `department`, `role`, `type` — kolom yang tidak pernah ada
 * di schema, sehingga insert selalu gagal. Dan karena stub
 * `createClient()` membalas `error: null`, modal menampilkan "Laporan
 * berhasil dikirim!". Fitur ini tidak pernah menyimpan satu laporan pun
 * sejak migrasi.
 */
export async function POST(request: Request) {
  return withAuth(async () => {
    const profile = await requireProfile();
    const body = await request.json();

    // Nama, divisi, dan role diambil dari baris `users`, bukan dari
    // request — jadi tidak bisa dipalsukan dan tidak usang kalau user
    // ganti nama atau pindah divisi.
    const feedback = await createFeedback(
      {
        id: profile.id,
        name: profile.name,
        kpiRole: profile.kpiRole,
        departmentName: profile.departmentName ?? null,
      },
      {
        type: String(body?.type ?? ""),
        message: String(body?.message ?? ""),
      },
    );

    return { feedback };
  });
}
