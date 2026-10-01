import { withAuth, requireUser } from "@/server/dal/guards";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users, departments } from "@/db/schema";
import { writeLog } from "@/server/dal/absensi";

export const dynamic = "force-dynamic";

/**
 * Fields profil HR yang boleh diubah user untuk dirinya sendiri.
 *
 * Sengaja TIDAK memuat `kpiRole`, `absensiRole`, `absensiStatus`,
 * `leaveQuota`, `sickQuota`, `isHidden`, `departmentId`, `name`,
 * `email`, dan `id` — semuanya wewenang admin.
 */
const EDITABLE = [
  "position",
  "photoUrl",
  "nik",
  "birthPlace",
  "birthDate",
  "gender",
  "religion",
  "maritalStatus",
  "phone",
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
] as const;

/** Kolom yang boleh dibaca user tentang dirinya sendiri. */
const PROFILE_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  image: users.image,
  photoUrl: users.photoUrl,
  position: users.position,
  kpiRole: users.kpiRole,
  absensiRole: users.absensiRole,
  absensiStatus: users.absensiStatus,
  departmentId: users.departmentId,
  departmentName: departments.name,
  nik: users.nik,
  birthPlace: users.birthPlace,
  birthDate: users.birthDate,
  gender: users.gender,
  religion: users.religion,
  maritalStatus: users.maritalStatus,
  phone: users.phone,
  address: users.address,
  city: users.city,
  province: users.province,
  postalCode: users.postalCode,
  emergencyName: users.emergencyName,
  emergencyPhone: users.emergencyPhone,
  npwp: users.npwp,
  bankName: users.bankName,
  bankAccountNumber: users.bankAccountNumber,
  bankAccountName: users.bankAccountName,
  leaveQuota: users.leaveQuota,
  sickQuota: users.sickQuota,
} as const;

/** GET /api/me/profile — profil lengkap user yang login. */
export async function GET() {
  return withAuth(async () => {
    const me = await requireUser();

    const [row] = await db
      .select(PROFILE_COLUMNS)
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(eq(users.id, me.id))
      .limit(1);

    if (!row) {
      return Response.json(
        { ok: false, error: "Profil tidak ditemukan." },
        { status: 404 },
      );
    }

    return {
      profile: {
        ...row,
        // date column datang sebagai string YYYY-MM-DD; form ini butuh
        // value yang bisa dipasang langsung ke <input type="date">.
        birthDate: row.birthDate ? String(row.birthDate).slice(0, 10) : null,
      },
    };
  });
}

/**
 * PATCH /api/me/profile — update profil sendiri.
 *
 * Hanya field di daftar EDITABLE yang diproses. Field lain di body
 * diabaikan diam-diam, bukan error, supaya form bisa mengirim
 * ulang objek profil utuh tanpa membocorkan hak akses.
 */
export async function PATCH(request: Request) {
  return withAuth(async () => {
    const me = await requireUser();
    const body = await request.json();

    const values: Record<string, unknown> = { updatedAt: new Date() };
    const touched: string[] = [];

    for (const key of EDITABLE) {
      if (body[key] !== undefined) {
        values[key] = body[key] === "" ? null : body[key];
        touched.push(key);
      }
    }

    if (touched.length === 0) {
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
      details: touched.join(","),
    });

    return { updated: touched };
  });
}