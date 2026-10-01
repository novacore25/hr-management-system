/**
 * DATA ACCESS LAYER — Gerbang otorisasi server-side.
 *
 * INI PENGGANTI RLS. Setiap Route Handler WAJIB memanggil salah satu guard
 * di bawah SEBELUM menyentuh database.
 *
 * Prinsip:
 * 1. Fail-CLOSED — kalau session tidak ada, lempar. Bukan return null.
 * 2. Cek role di server, bukan di client. UI guard hanya kosmetik.
 * 3. Semua query wajib lewat DAL. Tidak ada `db.` di luar folder ini.
 */

import "server-only";
import { getAuth } from "@/server/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";

export class UnauthorizedError extends Error {
  status = 401;
  constructor() {
    super("Sesi tidak valid. Silakan login kembali.");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(msg = "Anda tidak punya akses ke sumber daya ini.") {
    super(msg);
    this.name = "ForbiddenError";
  }
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

/**
 * Pastikan ada user yang login. Return profil minimal.
 * TIDAK melempar — dipakai halaman yang hanya butuh tahu "sudah login".
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getAuth().auth();
  const u = session?.user;
  if (!u?.id || !u.email) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? "",
    image: u.image ?? null,
  };
}

/** Pastikan sudah login. Melempar 401 kalau belum. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new UnauthorizedError();
  return u;
}

/** Profil lengkap dari tabel `users` (termasuk role). */
export async function getProfile() {
  const u = await getSessionUser();
  if (!u) return null;
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, u.id))
    .limit(1);
  return row ?? null;
}

/** Profil lengkap. Melempar 401 kalau belum login. */
export async function requireProfile() {
  const p = await getProfile();
  if (!p) throw new UnauthorizedError();
  return p;
}

const PRIORITY = {
  tim: 1,
  head: 2,
  hr: 3,
  executive: 4,
  developer: 5,
} as const;

export type KpiRole = keyof typeof PRIORITY;

/**
 * Pastikan user punya salah satu role KPI yang diizinkan.
 *
 * developer implicitly punya akses semua (highest priority).
 *
 * Contoh:
 *   await requireKpiRole("hr", "executive")   → hanya HR/Exec/Developer
 *   await requireKpiRoleAtLeast("head")        → Head ke atas
 */
export async function requireKpiRole(...allowed: KpiRole[]) {
  const p = await requireProfile();

  if (p.kpiRole === "developer") return p;

  if (!allowed.includes(p.kpiRole as KpiRole)) {
    throw new ForbiddenError(
      `Halaman ini butuh role: ${allowed.join(" / ")}. Role Anda: ${p.kpiRole}`,
    );
  }
  return p;
}

/** Minimal seluruh role di bawah ambang. */
export async function requireKpiRoleAtLeast(minimum: KpiRole) {
  const p = await requireProfile();
  const floor = PRIORITY[minimum];

  if (PRIORITY[p.kpiRole as KpiRole] >= floor) return p;

  throw new ForbiddenError(
    `Minimal role yang dibutuhkan: ${minimum}. Role Anda: ${p.kpiRole}`,
  );
}

/**
 * Absensi punya sumbu role TERPISAH dari KPI (`absensi_role`).
 * Guard terpisah supaya tidak tercampur.
 */
export async function requireAbsensiAdmin() {
  const p = await requireProfile();
  if (p.absensiRole !== "admin") {
    throw new ForbiddenError("Halaman ini khusus admin absensi.");
  }
  return p;
}

/**
 * Absensi staff = absensiRole staff DAN status active.
 * Menolak user pending/rejected/resigned/deleted.
 */
export async function requireActiveAbsensiStaff() {
  const p = await requireProfile();
  if (p.absensiStatus !== "active") {
    throw new ForbiddenError(
      "Akun absensi Anda belum aktif. Hubungi admin absensi.",
    );
  }
  return p;
}

/**
 * Pembungkus Route Handler: tangkap error auth → response JSON.
 *
 * PENTING: kalau handler sudah mengembalikan `Response` sendiri (misal
 * `return Response.json({ ok: false, error: "..." }, { status: 400 })`),
 * `Response` itu/langsung dikembalikan apa adanya.
 *
 * formerly `withAuth` selalu membungkus hasil handler dengan
 * `Response.json({ ok: true, data })`. Karena `Response` yang dikembalikan
 * handler tidak bisa di-serialize, hasilnya jadi `{ ok: true, data: {} }`
 * dengan status **200** — termasuk untuk penolakan validasi.
 *
 * Akibatnya: "Nilai harus angka", "Bulan harus 1-12", "Dividerlu bukan
 * milik Anda" — semuanya sampai ke browser sebagai sukses dengan data
 * kosong. Client `apiFetch` bahkan melempar error karena `data` bukan
 * bentuk yang diharapkan. Bug ini tidak terlihat di log maupun di typecheck.
 */
export async function withAuth<T>(
  handler: () => Promise<T>,
): Promise<Response> {
  try {
    const data = await handler();
    if (data instanceof Response) return data;
    return Response.json({ ok: true, data });
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
      return Response.json(
        { ok: false, error: e.message },
        { status: e.status },
      );
    }
    console.error("[DAL] unexpected error:", e);
    return Response.json(
      { ok: false, error: "Terjadi kesalahan di server." },
      { status: 500 },
    );
  }
}
