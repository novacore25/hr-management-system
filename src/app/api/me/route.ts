import { withAuth, requireUser } from "@/server/dal/guards";
import { findUserById } from "@/server/dal/users";

export const dynamic = "force-dynamic";

/**
 * GET /api/me — profil user yang sedang login.
 *
 * Dipakai AuthContext setelah session Auth.js tervalidasi.
 * Kalau user tidak ada di tabel `users` (belum didaftarkan admin),
 * return `{ user: null }` dengan 200 supaya UI bisa arahkan ke
 * "not registered" tanpa menganggapnya error.
 */
export async function GET() {
  return withAuth(async () => {
    const sessionUser = await requireUser();
    const profile = await findUserById(sessionUser.id);
    return { user: profile };
  });
}
