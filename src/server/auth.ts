/**
 * Konfigurasi Auth.js v5
 *
 * Hanya boleh di-import dari server (Route Handler / Server Action).
 * Browser NEVER melihat instance ini.
 *
 * Pola ini IDENTIK dengan app existing di VPS Anda
 * (hc3zkfmz4 = crm-sales, lfzgaeod = hype-project-tracking)
 * sehingga AUTH_SECRET / AUTH_GOOGLE_ID bisa memakai format yang sama.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import type { NextAuthConfig } from "next-auth";

/**
 * WAJIB ada agar bisa dipakai di edge middleware.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  /**
   * Sengaja kosong — provider asli hanya di instance NextAuth() di bawah.
   */
  providers: [],
  callbacks: {
    /**
     * Dipakai middleware untuk melindungi route.
     * Sengaja ringan — JANGA query database di sini.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      if (isOnLogin) {
        // Sudah login tidak perlu lihat halaman login lagi
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      // Modul yang butuh login
      const protectedArea =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/absensi") ||
        nextUrl.pathname.startsWith("/api");

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

/**
 * Instance lengkap dengan adapter database.
 * Hanya dipakai di server (Route Handler / Server Action / DAL).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    // ─────────────────────────────────────────────────────────
    // CAST DIBUTUHKAN — bukan sekadar males typing.
    //
    // Penyebab: @auth/drizzle-adapter@1.11 mendefinisikan tabelnya
    // sebagai PgColumn<{...}> (2 generic param), sedangkan
    // drizzle-orm@0.45 menambah generic param ke-3 (dialect).
    // Secara runtime keduanya identik — hanya tipologi yang beda.
    //
    // BUKAN bug logika kita, dan TIDAKberrympah. Nama tabel & kolom
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
    // ─────────────────────────────────────────────────────────
    usersTable: users as never,
    accountsTable: accounts as never,
    sessionsTable: sessions as never,
    verificationTokensTable: verificationTokens as never,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    // Pakai database session (bukan JWT) supaya role bisa diceat
    // di server tanpa decode token.
    strategy: "database",
    maxAge: 60 * 60 * 12, // 12 jam
    updateAge: 60 * 30, // refresh tiap 30 menit
  },
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Masukkan id user ke session.
     * Dipakai DAL untuk tahu "siapa yang sedang login".
     */
    session({ session, user }) {
      if (session.user && user?.id) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
