import { authConfig } from "@/server/auth";
import NextAuth from "next-auth";

export { default } from "next-auth";

/**
 * Middleware HANYA untuk cek session (ringan, tanpa database).
 * Otorisasi per-role dilakukan di DAL (src/server/dal/guards.ts).
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // Semua path kecuali asset statis & API internal
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
