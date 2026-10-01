import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Healthcheck untuk Docker HEALTHCHECK + Coolify.
 * Ringan: SELECT 1 ke database.
 */
export async function GET() {
  try {
    const result = await db.execute(sql`select 1`);
    return NextResponse.json(
      { status: "ok", db: "connected", ts: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        db: "disconnected",
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
