/**
 * Koneksi database — HANYA untuk server-side.
 *
 * ⚠️ ATURAN KERAS:
 * File ini WAJIB di-import dari `serverExternalPackages` atau ditandai
 * `import "server-only"` agar build GAGAL kalau ada yang import dari
 * komponen client.
 *
 * PENTING (lazy connection):
 * Pool TIDAK dibuat saat module di-load, tapi saat request pertama.
 * Kalau eager, `next build` gagal karena page data collection
 * meng-import modul ini tanpa DATABASE_URL.
 *
 * Kalau proses Next.js = 1, pool cukup max 10 koneksi.
 */

import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __db: NodePgDatabase<typeof schema> | undefined;
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
    // Coolify standalone Postgres di internal network -> TLS tidak perlu.
    // Kalau nanti pindah ke managed DB, set DATABASE_SSL=require.
    ssl:
      process.env.DATABASE_SSL === "require"
        ? { rejectUnauthorized: false }
        : undefined,
  });
}

/**
 * Lazy getter. Aman dipanggil saat build (tidak throw) —
 * baru throw kalau benar-benar dipakai tanpa DATABASE_URL.
 */
export function getDb(): NodePgDatabase<typeof schema> {
  if (globalThis.__db) return globalThis.__db;

  const pool = (globalThis.__dbPool ??= createPool());
  const instance = drizzle(pool, { schema });
  globalThis.__db = instance;
  return instance;
}

/**
 * Alias statis supaya kode lama (`db.select()`) tetap jalan.
 * Proxy ke getDb() sehingga tidak ada koneksi yang dibuat sampai dipakai.
 */
export const db: NodePgDatabase<typeof schema> = new Proxy({} as never, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
export type Db = NodePgDatabase<typeof schema>;
