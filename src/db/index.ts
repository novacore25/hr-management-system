/**
 * Koneksi database — HANYA untuk server-side.
 *
 * ⚠️ ATURAN KERAS:
 * File ini WAJIB di-import dari `serverExternalPackages` atau ditandai
 * `import "server-only"` agar build GAGAL kalau ada yang import dari
 * komponen client.
 *
 * Kalau proses Next.js = 1, pool cukup max 10 koneksi.
 */

import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL belum di-set. Isi di .env lokal atau Environment Variables Coolify.",
    );
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase & Coolify standalone Postgres sama-sama pakai TLS opsional.
    // Untuk Coolify standalone (internal network), TLS tidak perlu.
    ssl:
      process.env.DATABASE_SSL === "require"
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

// Reuse koneksi saat Next.js hot-reload di development
const pool = globalThis.__dbPool ?? (globalThis.__dbPool = createPool());

export const db = drizzle(pool, { schema });
export { schema };
export type Db = typeof db;
