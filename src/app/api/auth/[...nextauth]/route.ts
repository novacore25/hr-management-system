/**
 * Route Handler Auth.js v5.
 * Next.js memanggil ini untuk /api/auth/*
 *
 * Memakai handler lazy supaya `next build` tidak perlu DATABASE_URL.
 */

import { handlers } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = handlers.GET;
export const POST = handlers.POST;
