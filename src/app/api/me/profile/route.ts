import { withAuth, requireUser } from "@/server/dal/guards";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { writeLog } from "@/server/dal/absensi";

export const dynamic = "force-dynamic";

/**
 * GET /api/me — profil user yang login.
 * (Handler GET-nya ada di route.ts yang sama; file ini untuk PATCH.)
 */

/** Fields yang boleh diubah user untuk dirinya sendiri. */
const EDITABLE = [
  "position",
  "phone",
  "nik",
  "birthPlace",
  "birthDate",
  "gender",
  "maritalStatus",
  "address",
  "city",
  "province",
  "postalCode",
  "emergencyName",
  "emergencyPhone",
  "npwp",
  "bankName",
  "bankAccountNumber",
  "bankAccountName",
  "photoUrl",
] as const;

type Editable = (typeof EDITABLE)[number];

/**
 * PATCH /api/me — update profil sendiri.
 *
 * PENTING: hanya field di daftar EDITABLE yang boleh diubah.
 * `kpiRole`, `absensiRole`, `absensiStatus`, `leaveQuota`,
 * `sickQuota`, dan `id` TIDAK bisa disentuh dari sini — itu
 * wewenang admin.
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const body = await request.json();

    const values: Record<string, unknown> = { updatedAt: new Date() };
    let changed = false;

    for (const key of EDITABLE) {
      if (body[key] !== undefined) {
        values[key] = body[key] === "" ? null : body[key];
        changed = true;
      }
    }

    if (!changed) {
      return Response.json(
        { ok: false, error: "Tidak ada field yang diubah." },
        { status: 400 },
      );
    }

    await db.update(users).set(values).where(eq(users.id, me.id));

    await writeLog({
      actorId: me.id,
      action: "profile_updated",
      targetUserId: me.id,
      details: Object.keys(values).filter((k) => k !== "updatedAt").join(","),
    });

    const [row] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);

    // Buang kolom sensitif dari response
    const { id, name, email, image, ...rest } = row!;
    return { user: { id, name, email, image, ...rest } };
  });
}