/**
 * Konfigurasi Auth.js v5
 *
 * Hanya boleh di-import dari server (Route Handler / Server Action).
 * Browser NEVER melihat instance ini.
 *
 * Pola ini IDENTIK dengan app existing di VPS Anda
 * (hc3zkfmz4 = crm-sales, lfzgaeod = hype-project-tracking)
 * sehingga AUTH_SECRET / AUTH_GOOGLE_ID bisa memakai format yang sama.
 *
 * ⚠️ PENTING — Kenapa instance dibuat LAZY:
 * `NextAuth()` menerima adapter Drizzle yang butuh instance db nyata.
 * Kalau dipanggil saat module di-load, `next build` akan gagal
 * (page data collection meng-import modul ini tanpa DATABASE_URL).
 * Karena itu instance baru dibuat saat request pertama benar-benar masuk.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { authConfig } from "@/server/auth-config";

/**
 * Config ringan diekspor ulang supaya import lama tidak breakage.
 *
 * Isinya dipindah ke `auth-config.ts` karena middleware (edge runtime)
 * ikut memakainya, sementara modul ini meng-import `@/db` yang memakai
 * `server-only`. Middleware yang menarik `server-only` akan gagal
 * dibuild dan Next.js hanya diam-diam menulis `middleware: {}`.
 */
export { authConfig };

type AuthInstance = ReturnType<typeof buildInstance>;

function buildInstance() {
  return NextAuth({
    ...authConfig,
    adapter: DrizzleAdapter(getDb(), {
      // ─────────────────────────────────────────────────────
      // CAST DIBUTUHKAN — bukan sekadar malas typing.
      //
      // Penyebab: @auth/drizzle-adapter@1.11 mendefinisikan tabelnya
      // sebagai PgColumn<{...}> (2 generic param), sedangkan
      // drizzle-orm@0.45 menambah generic param ke-3 (dialect).
      // Secara runtime keduanya identik — hanya tipologi yang beda.
      //
      // BUKAN bug logika, dan TIDAKberrympah. Nama tabel & kolom
      // sudah dicek manual terhadap dokumentasi Auth.js:
      //   users      : id, email, emailVerified, name, image, createdAt, updatedAt
      //   accounts   : userId, type, provider, providerAccountId, refreshToken,
      //                 accessToken, expiresAt, tokenType, scope, idToken, sessionState
      //   sessions   : sessionToken, userId, expires
      //   verificationTokens : identifier, token, expires
      //
      // Kolom profil tambahan (kpi_role, absensi_role, dll) TIDAK
      // disentuh adapter — itu murni milik kita.
      //
      // Hapus cast ini setelah @auth/drizzle-adapter mendukung
      // drizzle-orm 0.45+.
      // ─────────────────────────────────────────────────────
      usersTable: users as never,
      accountsTable: accounts as never,
      sessionsTable: sessions as never,
      verificationTokensTable: verificationTokens as never,
    }),
    providers: [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID ?? "",
        clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      }),
    ],
    // Sengaja TIDAK menimpa `session` di sini.
    //
    // Strategi sesi dideklarasikan di `auth-config.ts` yang dipakai BERSAMA
    // oleh middleware. Kalau instance utama memakai strategi berbeda dari
    // middleware, keduanya menulis cookie dengan nama sama tapi format
    // berbeda, dan middleware gagal membacanya -> pengguna dianggap belum
    // login setelah login berhasil -> balik ke /login.
    //
    // Lihat komentar panjang di auth-config.ts untuk detail gejalanya.
    callbacks: {
      ...authConfig.callbacks,
      /**
       * Masukkan id user ke session.
       * Dipakai DAL untuk tahu "siapa yang sedang login".
       *
       * Dengan strategy JWT, `user` TIDAK tersedia di callback ini —
       * id diambil dari `token.sub`. (Dengan strategy database, `user`
       * selalu ada dan `token` selalu undefined. Salah satu dari keduanya
       * membuat session.user.id kosong, dan DAL akan menganggap request
       * anonim padahal login-nya valid.)
       */
      session({ session, token }) {
        if (session.user && token.sub) {
          session.user.id = token.sub;
        }
        return session;
      },
    },
  });
}

// ── Lazy singleton ────────────────────────────────────────────
// Dibuat saat request pertama, BUKAN saat module di-load.
let instance: AuthInstance | null = null;

export function getAuth(): AuthInstance {
  if (!instance) instance = buildInstance();
  return instance;
}

/**
 * Route Handler untuk /api/auth/*
 * Auth.js v5 handler menerima 1 argumen (request);
 * params catch-all dibaca dari URL.
 */
export const handlers = {
  GET: (req: Request) => getAuth().handlers.GET(req as never),
  POST: (req: Request) => getAuth().handlers.POST(req as never),
};
