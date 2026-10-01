"use client";

/**
 * Client Auth.js — HANYA untuk interaksi browser (tombol login/logout).
 * TIDAK pernah menyentuh database.
 *
 * Catatan: di next-auth v5, fungsi signIn/signOut bisa langsung
 * di-import dari "next-auth/react" (tidak perlu createAuthClient).
 */

export { signIn, signOut, useSession, SessionProvider } from "next-auth/react";
