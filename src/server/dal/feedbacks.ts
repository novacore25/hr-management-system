import "server-only";
import { db } from "@/db";
import { desc, eq } from "drizzle-orm";
import { feedbacks } from "@/db/schema";
import { ValidationError } from "./guards";
import type { Feedback } from "@/types";

/**
 * Laporan bug / usulan fitur.
 *
 * formerly halaman developer dan FeedbackModal menulis langsung ke tabel
 * `feedbacks` dari browser. Dua masalahnya:
 *
 * 1. `user_name`, `department`, `role`, dan `type` TIDAK PERNAH ADA di
 *    schema Drizzle — kolomnya baru dibuat di migrasi 0012. Jadi insert
 *    dari FeedbackModal selalu gagal. Tidak terlihat, karena stub
 *    `createClient()` membalas `error: null` sehingga modal menampilkan
 *    "Laporan berhasil dikirim!". Fitur ini tidak pernah menyimpan satu
 *    laporan pun sejak migrasi.
 *
 * 2. `user_name`, `department`, dan `role` diambil dari AuthContext, jadi
 *    bisa dipalsukan. Sekarang DAL yang mengambilnya dari baris `users`.
 */

export const FEEDBACK_TYPES = ["bug", "feature", "other"] as const;
export const FEEDBACK_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "rejected",
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/**
 * Bentuk ke UI.
 *
 * `createdAt` / `updatedAt` adalah ISO string. formerly UI memakai bentuk
 * Supabase `{ seconds, nanoseconds, toDate() }` — yang tidak bisa melewati
 * JSON: fungsi `toDate` hilang saat serialisasi, jadi
 * `f.createdAt?.toDate()` meledak sebagai "not a function" di browser.
 * Halaman ini sudah memformat ISO string langsung.
 */
function toFeedback(row: typeof feedbacks.$inferSelect): Feedback {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    department: row.department ?? "",
    role: row.role ?? "",
    type: row.type as FeedbackType,
    message: row.message,
    status: row.status as FeedbackStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listFeedbacks(): Promise<Feedback[]> {
  const rows = await db.select().from(feedbacks).orderBy(desc(feedbacks.createdAt));
  return rows.map(toFeedback);
}

/**
 * Simpan laporan baru.
 *
 * `userName`, `department`, dan `role` SELALU dari baris `users`, bukan dari
 * request — jadi tidak bisa dipalsukan.
 */
export async function createFeedback(
  actor: { id: string; name: string; kpiRole: string; departmentName: string | null },
  input: { type: string; message: string },
): Promise<Feedback> {
  const type = (FEEDBACK_TYPES as readonly string[]).includes(input.type)
    ? (input.type as FeedbackType)
    : null;

  if (!type) {
    throw new ValidationError(
      `Tipe laporan harus salah satu dari: ${FEEDBACK_TYPES.join(", ")}.`,
    );
  }

  const message = input.message.trim();
  if (!message) {
    throw new ValidationError("Isi deskripsi laporan.");
  }
  if (message.length > 5000) {
    throw new ValidationError("Deskripsi laporan terlalu panjang (maks 5000 karakter).");
  }

  const [row] = await db
    .insert(feedbacks)
    .values({
      userId: actor.id,
      // Dari baris `users`, bukan dari request — jadi tidak bisa dipalsukan
      // dan tidak usang kalau user ganti nama atau pindah divisi.
      userName: actor.name,
      department: actor.departmentName ?? "",
      role: actor.kpiRole,
      type,
      message,
      status: "open",
    })
    .returning();

  if (!row) {
    throw new ValidationError("Gagal menyimpan laporan.");
  }

  return toFeedback(row);
}

export async function setFeedbackStatus(
  id: string,
  status: string,
): Promise<Feedback> {
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError(
      `Status tidak valid: ${status}. Harus salah satu dari: ${FEEDBACK_STATUSES.join(", ")}.`,
    );
  }

  const [row] = await db
    .update(feedbacks)
    .set({ status, updatedAt: new Date() })
    .where(eq(feedbacks.id, id))
    .returning();

  if (!row) {
    throw new ValidationError("Laporan tidak ditemukan.");
  }

  return toFeedback(row);
}
