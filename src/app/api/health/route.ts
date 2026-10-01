import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Healthcheck + diagnosa konfigurasi.
 *
 * Dipakai Docker HEALTHCHECK dan Coolify.
 * TIDAK PERNAH menampilkan nilai secret, hanya status ada/tidak.
 */
export async function GET(req: Request) {
  // -- Status database ------------------------------------------------
  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  // -- Diagnosa environment (tanpa membocorkan nilai) ----------------
  const has = (k: string) => (process.env[k] ? "set" : "MISSING");

  const authUrl = process.env.AUTH_URL ?? null;
  const expectedCallback = authUrl
    ? `${authUrl.replace(/\/+$/, "")}/api/auth/callback/google`
    : "(AUTH_URL belum di-set, Auth.js menebak dari Host header)";

  const env = {
    DATABASE_URL: has("DATABASE_URL"),
    AUTH_SECRET: has("AUTH_SECRET"),
    AUTH_URL: has("AUTH_URL"),
    AUTH_TRUST_HOST: has("AUTH_TRUST_HOST"),
    AUTH_GOOGLE_ID: has("AUTH_GOOGLE_ID"),
    AUTH_GOOGLE_SECRET: has("AUTH_GOOGLE_SECRET"),
  };

  const problems: string[] = [];

  if (!process.env.AUTH_URL) {
    problems.push(
      "AUTH_URL belum di-set. Auth.js v5 TIDAK membaca NEXTAUTH_URL, " +
        "sehingga callback URL bisa salah dan Google menolak dengan redirect_uri_mismatch.",
    );
  }
  if (authUrl && authUrl.startsWith("http://")) {
    problems.push(
      "AUTH_URL memakai http://. Google hanya mengizinkan callback https://. " +
        "Hapus trailing slash juga.",
    );
  }
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) {
    problems.push("AUTH_GOOGLE_ID atau AUTH_GOOGLE_SECRET belum di-set.");
  }

  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "?";

  const hostMatchesAuthUrl = authUrl
    ? host === authUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    : null;

  if (hostMatchesAuthUrl === false) {
    problems.push(
      `Host yang dipakai (${host}) berbeda dari AUTH_URL ` +
        `(${authUrl}). Buka aplikasi lewat domain yang sama dengan AUTH_URL.`,
    );
  }

  return NextResponse.json(
    {
      status: dbOk ? (problems.length ? "warning" : "ok") : "error",
      db: dbOk ? "connected" : "disconnected",
      ts: new Date().toISOString(),
      auth: {
        expectedCallback,
        requestHost: host,
        hostMatchesAuthUrl,
      },
      env,
      problems: problems.length ? problems : undefined,
    },
    { status: dbOk ? 200 : 503 },
  );
}