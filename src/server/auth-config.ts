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
 * Catatan session: `session.strategy` di file ini WAJIB "jwt" dan
 * WAJIB sama dengan yang dipakai instance utama di `auth.ts`. Jangan
 * declares ulang di salah satu sisi — config ini sengaja di-share
 * justru supaya tidak bisa berbeda. Lihat komentar pada blok `session`.
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

  /**
   * ⚠️ WAJIB ADA DI CONFIG YANG BERSAMA — jangan declares ulang di
   * `src/server/auth.ts`.
   *
   * Middleware dan instance utama menulis ke cookie dengan nama sama
   * (`authjs.session-token`). Kalau strateginya berbeda, isinya beda
   * format dan middleware akan gagal membacanya:
   *
   *   app = "database"  → cookie berisi token acak opaque
   *   middleware = JWT  → mencoba JWE-decode token itu
   *   hasil: JWTSessionError "Invalid Compact JWE" → auth = null
   *          → middleware thinks you're logged out → bounce ke /login
   *
   * Gejalanya persis seperti "klik Masuk, loading sebentar, balik lagi
   * ke halaman login" padahal OAuth-nya sukses.
   *
   * Dan tidak bisa pakai "database": middleware jalan di edge runtime
   * tanpa adapter maupun koneksi Postgres, jadi mustahil me-resolve
   * token opaque itu. Satu-satunya opsi yang konsisten adalah JWT untuk
   * keduanya.
   *
   * Konsekuensi JWT: sesi tidak bisa dicabut dari sisi server
   * (tidak ada "logout semua perangkat" instan). efetivo dikompensasi
   * dengan maxAge 8 jam, bukan 12.
   */
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8 jam
  },

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