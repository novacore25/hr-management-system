/**
 * Route Handler Auth.js v5.
 * Next.js memanggil ini untuk /api/auth/*
 */

import { handlers } from "@/server/auth";

export const { GET, POST } = handlers;
