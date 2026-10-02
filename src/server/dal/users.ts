import "server-only";
import { db } from "@/db";
import { eq, and, or, ne, inArray, sql } from "drizzle-orm";
import { users, departments } from "@/db/schema";
import type { User } from "@/types";

/** Bentuk baris hasil join user + department. */
type UserRow = {
  id: string;
  name: string;
  email: string;
  kpiRole: User["kpiRole"];
  departmentId: string | null;
  position: string | null;
  photoUrl: string | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  managedDepartments: string[] | null;
  absensiRole: User["absensiRole"];
  absensiStatus: User["absensiStatus"];
  leaveQuota: number;
  sickQuota: number;
  isHidden: boolean;
  departmentName: string | null;
};

/**
 * Mapper: baris DB → object `User` yang dipakai seluruh UI.
 *
 * PENTING: shape-nya HARUS sama persis dengan versi Supabase lama,
 * supaya 60 halaman tidak perlu diubah.
 */
function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    kpiRole: row.kpiRole,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    department: row.departmentName, // duplikat — dipertahankan demi kompatibilitas
    position: row.position,
    photoUrl: row.photoUrl ?? row.image,
    createdAt: row.createdAt?.toISOString() ?? "",
    updatedAt: row.updatedAt?.toISOString() ?? "",
    managedDepartments: row.managedDepartments ?? [],
    absensiRole: row.absensiRole,
    absensiStatus: row.absensiStatus,
    leaveQuota: row.leaveQuota,
    sickQuota: row.sickQuota,
    isHidden: row.isHidden,
  };
}

/** Query dasar: user + nama departemen. */
const userWithDept = {
  id: users.id,
  name: users.name,
  email: users.email,
  kpiRole: users.kpiRole,
  departmentId: users.departmentId,
  position: users.position,
  photoUrl: users.photoUrl,
  image: users.image,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  managedDepartments: users.managedDepartments,
  absensiRole: users.absensiRole,
  absensiStatus: users.absensiStatus,
  leaveQuota: users.leaveQuota,
  sickQuota: users.sickQuota,
  isHidden: users.isHidden,
  departmentName: departments.name,
};

/** Ambil 1 user berdasarkan id. */
export async function findUserById(id: string): Promise<User | null> {
  const [row] = await db
    .select(userWithDept)
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.id, id))
    .limit(1);

  return row ? toUser(row as UserRow) : null;
}

/**
 * Apakah user ini ada.
 *
 * Dipakai Route Handler yang harus membedakan "user tidak ada" dari
 * "user ini belum punya setelan" — yang kedua diam-diam mengembalikan
 * nilai default dan terlihat seperti jawaban yang benar.
 */
export async function exists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return !!row;
}

/**
 * Semua user yang aktif (untuk dropdown assignable).
 * Sama seperti versi lama: hanya active + pending, exclude rejected/resigned.
 */
export async function listActiveUsers(): Promise<User[]> {
  const rows = await db
    .select(userWithDept)
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(
      and(
        ne(users.absensiStatus, "deleted"),
        or(
          eq(users.absensiStatus, "active"),
          eq(users.absensiStatus, "pending"),
        ),
      ),
    )
    .orderBy(users.name);

  return rows.map((r) => toUser(r as UserRow));
}

/** Member sebuah divisi. */
export async function listUsersByDepartment(
  deptId: string,
): Promise<User[]> {
  const rows = await db
    .select(userWithDept)
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(
      and(
        eq(users.departmentId, deptId),
        or(
          eq(users.absensiStatus, "active"),
          eq(users.absensiStatus, "pending"),
        ),
      ),
    )
    .orderBy(users.name);

  return rows.map((r) => toUser(r as UserRow));
}

/**
 * Member divisi yang dikelola Head, plus Head-nya sendiri.
 *
 * `managedDepartmentIds` SELALU berasal dari `users.managed_departments`
 * di server. Halaman head/* sebelumnya mengambil daftar itu dari
 * `AuthContext` di browser lalu mengirimkannya sebagai filter — jadi
 * Head tinggal mengubah nilai itu untuk melihat siapa saja di tim lain.
 *
 * Head sendiri sering tidak punya `department_id` (dia undivided), jadi
 * tanpa `OR id = aktornya` dia tidak akan bisa menugaskan KPI ke dirinya
 * sendiri dari halaman penugasan.
 *
 * `null` berarti semua divisi (untuk HR/Executive/Developer).
 */
export async function listManagedMembers(
  managedDepartmentIds: string[] | null,
  selfUserId: string,
): Promise<User[]> {
  const conds = [
    or(
      eq(users.absensiStatus, "active"),
      eq(users.absensiStatus, "pending"),
    ),
  ];

  if (managedDepartmentIds) {
    if (managedDepartmentIds.length === 0) {
      conds.push(eq(users.id, selfUserId));
    } else {
      conds.push(
        or(
          inArray(users.departmentId, managedDepartmentIds),
          eq(users.id, selfUserId),
        )!,
      );
    }
  }

  const rows = await db
    .select(userWithDept)
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(and(...conds))
    .orderBy(users.name);

  return rows.map((r) => toUser(r as UserRow));
}

/** Semua user tanpa filter — untuk halaman admin/HR. */
export async function listAllUsers(): Promise<User[]> {
  const rows = await db
    .select(userWithDept)
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .orderBy(users.name);

  return rows.map((r) => toUser(r as UserRow));
}

/**
 * Update role KPI. HANYA boleh dipanggil dari DAL dengan guard sudah dicek.
 * Sengaja TIDAK menerima parameter userId dari client.
 */
export async function setKpiRole(
  targetUserId: string,
  kpiRole: User["kpiRole"],
): Promise<void> {
  await db
    .update(users)
    .set({ kpiRole, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));
}

export async function setAbsensiRole(
  targetUserId: string,
  absensiRole: User["absensiRole"],
  absensiStatus: User["absensiStatus"],
): Promise<void> {
  await db
    .update(users)
    .set({ absensiRole, absensiStatus, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));
}

/**
 * Pastikan user punya profil HR yang lengkap.
 * User yang baru login pertama kali punya absensi_status='pending'
 * (default di schema) sampai di-approve admin.
 */
export async function getOrCreateProfile(userId: string) {
  return await findUserById(userId);
}
