import type { NextAuthConfig } from "next-auth";

/**
 * Konfigurasi Auth.js yang AMAN untuk middleware (edge runtime).
 *
 * ⚠️ JANGAN pernah meng-import modul yang menyentuh database dari sini.
 * `middleware.ts` memakai file ini, dan middleware dikompilasi sebagai
 * edge bundle. rantai import seperti:
 *
 *     middleware.ts -> src/server/auth.ts -> src/db/index.ts
 *                    -> import "server-only"   ← build middleware GAGAL
 *
 * `next build` TIDAK melaporkan error untuk ini. Dia hanya diam-diam
 * menulis `middleware: {}` ke middleware-manifest.json, sehingga
 * tidak ada sama sekali proteksi route di level halaman.
 *
 * Karena itu modul ini sengaja dibuat terpisah dari `auth.ts`:
 * - middleware-butuh: pages, trustHost, callbacks.authorized
 * - middleware-tidak boleh butuh: adapter Drizzle, provider, apa pun
 *   yang menyentuh `pg` / `server-only`
 *
 * Catatan session: instance utama memakai `strategy: "database"`,
 * sedangkan middleware di sini default JWT dan TIDAK punya adapter.
 * Artinya `auth` di middleware praktis selalu null. Itu memang
 * diterima sekarang — middleware hanya berfungsi sebagai gerbang
 * "halaman terlindungi wajib login". Otorisasi per-role tetap
 * dilakukan di DAL (`src/server/dal/guards.ts`), yang jauh lebih
 * tepercaya karena membaca session langsung dari database.
 *
 * Kalau suatu saat butuh tahu "sudah login atau belum" di middleware
 * dengan benar, jangan add adapter ke sini (middleware jadi berat).
 * Pakai route `/api/me` yang sudah ada.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },

  /** Provider asli hanya di instance NextAuth() yang lazy. */
  providers: [],

  callbacks: {
    /**
     * Dipakai middleware untuk melindungi route.
     * Sengaja ringan — JANGAN query database di sini.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      // Sudah login tidak perlu lihat halaman login lagi
      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      // Area halaman yang butuh login.
      //
      // `/api` SENGAJA TIDAK ikut di sini. Route Handler sudah punya
      // guard-nya sendiri (`withAuth`) yang mengembalikan 401 JSON —
      // itu bentuk respons yang benar untuk pemanggil API. Kalau
      // middleware yang alih-alih mengarahkan ke /login, klien API
      // akan menerima 302 ke halaman HTML, dan `fetch` di browser
      // akan transparan mengikuti redirect-nya sehingga error 401-nya
      // hilang tanpa jejak.
      //
      // `/api/health` juga harus tetap publik: Docker HEALTHCHECK
      // memanggilnya, dan redirect akan membuat healthcheck selalu
      // lolos tanpa benar-benar memeriksa apa pun.
      const protectedArea =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/absensi");

      if (protectedArea && !isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl);
        loginUrl.searchParams.set(
          "callbackUrl",
          nextUrl.pathname + nextUrl.search,
        );
        return Response.redirect(loginUrl);
      }

      return true;
    },
  },
} satisfies NextAuthConfig;