/**
 * Middleware HANYA untuk cek session (ringan, tanpa database).
 * Otorisasi per-role dilakukan di DAL (src/server/dal/guards.ts).
 *
 * ⚠️ Import dari `@/server/auth-config`, BUKAN `@/server/auth`.
 * `auth.ts` meng-import `@/db` yang memakai `import "server-only"`.
 * Middleware adalah edge bundle; menarik `server-only` membuatnya gagal
 * dibuild, dan Next.js TIDAK melaporkan error — dia hanya menulis
 * `middleware: {}` ke manifest, jadi proteksi route hilang tanpa jejak.
 */
import { authConfig } from "@/server/auth-config";
import NextAuth from "next-auth";

export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

export const config = {
  /**
   * Hanya halaman. `api` dikecualikan dengan sengaja:
   *
   * - `/api/auth/*` ditangani `src/app/api/auth/[...nextauth]/route.ts`
   * - endpoint lain punya guard sendiri (`withAuth`) yang balas 401 JSON
   * - `/api/health` harus publik untuk Docker HEALTHCHECK
   *
   * Kalau `api` ikut di matcher, pemanggil API dapat 302 ke halaman
   * login HTML, bukan 401 — dan `fetch` di browser akan transparan
   * mengikuti redirect itu sehingga 401-nya hilang tanpa jejak.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
