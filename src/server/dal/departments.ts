import "server-only";
import { db } from "@/db";
import { asc, eq } from "drizzle-orm";
import { departments } from "@/db/schema";

/**
 * Divisi/departemen.
 * Read: semua user login boleh (dipakai filter di mana-mana).
 * Write: hanya HR/Executive (dicek di Route Handler).
 */
export async function listDepartments(): Promise<{ id: string; name: string }[]> {
  return await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .orderBy(asc(departments.name));
}

export async function listDepartmentNames(): Promise<string[]> {
  const rows = await listDepartments();
  return rows.map((r) => r.name);
}

export async function createDepartment(name: string) {
  const [row] = await db
    .insert(departments)
    .values({ name })
    .returning({ id: departments.id, name: departments.name });
  return row;
}

export async function updateDepartment(id: string, name: string) {
  const [row] = await db
    .update(departments)
    .set({ name })
    .where(eq(departments.id, id))
    .returning({ id: departments.id, name: departments.name });
  return row;
}

export async function deleteDepartment(id: string) {
  await db.delete(departments).where(eq(departments.id, id));
}
