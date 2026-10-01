import "server-only";
import { db } from "@/db";
import { and, eq, gte, lte, asc, inArray } from "drizzle-orm";
import { attendance, users, departments, leaveRequests } from "@/db/schema";
import { getSettings, verifyCheckInLocation, writeLog } from "./absensi";
import type { Attendance, AttendanceStatus, AttendanceType } from "@/types/absensi";

type Row = typeof attendance.$inferSelect & {
  userName: string | null;
  userPhoto: string | null;
  departmentName: string | null;
};

const select = {
  id: attendance.id,
  userId: attendance.userId,
  date: attendance.date,
  checkIn: attendance.checkIn,
  checkOut: attendance.checkOut,
  status: attendance.status,
  type: attendance.type,
  locationIn: attendance.locationIn,
  locationStatus: attendance.locationStatus,
  lateFine: attendance.lateFine,
  lateReason: attendance.lateReason,
  lateReasonStatus: attendance.lateReasonStatus,
  radiusPenalty: attendance.radiusPenalty,
  earlyCheckout: attendance.earlyCheckout,
  earlyReason: attendance.earlyReason,
  notes: attendance.notes,
  createdAt: attendance.createdAt,
  updatedAt: attendance.updatedAt,
  userName: users.name,
  userPhoto: users.photoUrl,
  departmentName: departments.name,
};

function toAttendance(row: Row): Attendance {
  return {
    id: row.id,
    userId: row.userId,
    date: String(row.date),
    // Kolom `time` dari Drizzle bisa string atau Date
    checkIn: row.checkIn ? String(row.checkIn).slice(0, 5) : null,
    checkOut: row.checkOut ? String(row.checkOut).slice(0, 5) : null,
    status: row.status,
    type: row.type,
    locationIn: row.locationIn ?? null,
    locationStatus: row.locationStatus,
    lateFine: row.lateFine,
    lateReason: row.lateReason,
    lateReasonStatus: row.lateReasonStatus,
    radiusPenalty: row.radiusPenalty,
    earlyCheckout: row.earlyCheckout,
    earlyReason: row.earlyReason,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function attach<T extends Row>(r: T): Attendance {
  return toAttendance(r);
}

export async function findByUserDate(
  userId: string,
  date: string,
): Promise<Attendance | null> {
  const [row] = await db
    .select(select)
    .from(attendance)
    .innerJoin(users, eq(attendance.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(and(eq(attendance.userId, userId), eq(attendance.date, date)))
    .limit(1);
  return row ? attach(row) : null;
}

export async function listByDate(date: string): Promise<Attendance[]> {
  const rows = await db
    .select(select)
    .from(attendance)
    .innerJoin(users, eq(attendance.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(attendance.date, date))
    .orderBy(asc(users.name));

  return rows.map(attach);
}

export async function listByUserRange(
  userId: string,
  from: string,
  to: string,
): Promise<Attendance[]> {
  const rows = await db
    .select(select)
    .from(attendance)
    .innerJoin(users, eq(attendance.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(
      and(
        eq(attendance.userId, userId),
        gte(attendance.date, from),
        lte(attendance.date, to),
      ),
    )
    .orderBy(asc(attendance.date));

  return rows.map(attach);
}

/** Rekap absensi satu hari untuk seluruh perusahaan (admin). */
export type DailyRecap = {
  date: string;
  present: number;
  late: number;
  veryLate: number;
  wfa: number;
  onLeave: number;
  sick: number;
  totalStaff: number;
  rows: Attendance[];
};

export async function dailyRecap(date: string): Promise<DailyRecap> {
  const [rows, staffCount, leaves] = await Promise.all([
    listByDate(date),
    db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.absensiStatus, "active"),
          eq(users.absensiRole, "staff"),
        ),
      ),
    db
      .select()
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.status, "approved"),
          inArray(leaveRequests.type, ["leave", "sick", "wfa"]),
        ),
      ),
  ]);

  const onLeaveToday = leaves.filter((l) =>
    l.dates.includes(date as unknown as never),
  );

  return {
    date,
    present: rows.filter((r) => r.status === "on_time").length,
    late: rows.filter((r) => r.status === "late").length,
    veryLate: rows.filter((r) => r.status === "very_late").length,
    wfa: rows.filter((r) => r.type === "WFA").length,
    onLeave: onLeaveToday.filter((l) => l.type === "leave").length,
    sick: onLeaveToday.filter((l) => l.type === "sick").length,
    totalStaff: staffCount.length,
    rows,
  };
}

// ═══════════════════════════════════════════════════════════════
// VALIDASI WAKTU (dipindah dari client ke server)
// ═══════════════════════════════════════════════════════════════

/** Ubah "HH:MM" menjadi menit sejak tengah malam. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Hitung status keterlambatan. Dipanggil server. */
export function computeLateState(params: {
  checkIn: string;
  maxLate: string;
  veryLateAt?: string;
}): {
  status: AttendanceStatus;
  lateMinutes: number;
  reasonRequired: boolean;
} {
  const ci = timeToMinutes(params.checkIn);
  const max = timeToMinutes(params.maxLate);
  // Batas "sangat terlambat" = 1 jam 45 menit setelah batas telat
  const very = timeToMinutes(params.veryLateAt ?? "10:00");

  if (ci <= max) {
    return { status: "on_time", lateMinutes: 0, reasonRequired: false };
  }
  if (ci < very) {
    return {
      status: "late",
      lateMinutes: ci - max,
      reasonRequired: true,
    };
  }
  return {
    status: "very_late",
    lateMinutes: ci - max,
    reasonRequired: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// CHECK-IN
// ═══════════════════════════════════════════════════════════════

/** Titik lokasi yang disimpan di kolom `location_in`. */
export type GeoPoint = {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt?: string;
  locationName?: string;
};

export type CheckInInput = {
  userId: string;
  departmentId: string | null;
  date: string;
  checkIn: string;
  type: AttendanceType;
  lateReason?: string | null;
  /** null = GPS tidak diizinkan / ditolak user. */
  location?: GeoPoint | null;
  notes?: string | null;
};

export type CheckInResult =
  | { ok: true; attendance: Attendance }
  | { ok: false; reason: string; code: string };

export async function checkIn(input: CheckInInput): Promise<CheckInResult> {
  const existing = await findByUserDate(input.userId, input.date);
  if (existing) {
    return {
      ok: false,
      reason: "Anda sudah check-in hari ini.",
      code: "already_checked_in",
    };
  }

  const settings = await getSettings();
  const late = computeLateState({
    checkIn: input.checkIn,
    maxLate: settings.maxLate,
  });

  if (late.reasonRequired && !input.lateReason?.trim()) {
    return {
      ok: false,
      reason: "Keterlambatan wajib disertai alasan.",
      code: "late_reason_required",
    };
  }

  // Verifikasi geofence DI SERVER
  let locationIn: GeoPoint | null = null;
  let locationStatus = "Lokasi Keblokir";
  let radiusPenalty = 0;

  if (input.location) {
    const verdict = await verifyCheckInLocation({
      departmentId: input.departmentId,
      lat: input.location.lat,
      lng: input.location.lng,
    });
    locationStatus = `${verdict.locationStatus} (${verdict.distanceMeters} m)`;
    radiusPenalty = verdict.radiusPenalty;
    locationIn = {
      lat: input.location.lat,
      lng: input.location.lng,
      accuracy: input.location.accuracy,
      capturedAt: new Date().toISOString(),
      locationName: verdict.officeName ?? undefined,
    };
  }

  const now = new Date();

  const [row] = await db
    .insert(attendance)
    .values({
      userId: input.userId,
      date: input.date,
      checkIn: input.checkIn,
      status: late.status,
      type: input.type,
      locationIn: locationIn as never,
      locationStatus,
      lateFine: late.lateMinutes,
      lateReason: input.lateReason ?? "",
      lateReasonStatus: late.reasonRequired ? "pending" : null,
      radiusPenalty,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = await findByUserDate(input.userId, input.date);

  await writeLog({
    actorId: input.userId,
    action: "check_in",
    targetUserId: input.userId,
    details: `${input.date} ${input.checkIn} · ${late.status}`,
  });

  return { ok: true, attendance: created! };
}

// ═══════════════════════════════════════════════════════════════
// CHECK-OUT
// ═══════════════════════════════════════════════════════════════

export async function checkOut(params: {
  userId: string;
  date: string;
  checkOut: string;
  earlyReason?: string | null;
}): Promise<CheckInResult> {
  const existing = await findByUserDate(params.userId, params.date);
  if (!existing) {
    return {
      ok: false,
      reason: "Anda belum check-in hari ini.",
      code: "not_checked_in",
    };
  }
  if (existing.checkOut) {
    return {
      ok: false,
      reason: "Anda sudah check-out hari ini.",
      code: "already_checked_out",
    };
  }

  const settings = await getSettings();
  const workEnd = timeToMinutes(settings.workEnd);
  const co = timeToMinutes(params.checkOut);
  const isEarly = co < workEnd;

  if (isEarly && !params.earlyReason?.trim()) {
    return {
      ok: false,
      reason: "Pulang sebelum jam kerja wajib disertai alasan.",
      code: "early_reason_required",
    };
  }

  await db
    .update(attendance)
    .set({
      checkOut: params.checkOut,
      earlyCheckout: isEarly,
      earlyReason: params.earlyReason ?? "",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(attendance.userId, params.userId),
        eq(attendance.date, params.date),
      ),
    );

  await writeLog({
    actorId: params.userId,
    action: "check_out",
    targetUserId: params.userId,
    details: `${params.date} ${params.checkOut}${isEarly ? " (pulang awal)" : ""}`,
  });

  return {
    ok: true,
    attendance: (await findByUserDate(params.userId, params.date))!,
  };
}

// ═══════════════════════════════════════════════════════════════
// ADMIN: approve/reject alasan terlambat, koreksi manual
// ═══════════════════════════════════════════════════════════════

export async function reviewLateReason(
  id: string,
  accept: boolean,
  actorId: string,
): Promise<void> {
  const values: Record<string, unknown> = {
    lateReasonStatus: accept ? "accepted" : "rejected",
    updatedAt: new Date(),
  };

  // Alasan diterima -> penalties dibatalkan dan status jadi tepat waktu.
  // Dulu ini dilakukan dari browser; sekarang server yang memutuskan.
  if (accept) {
    values.lateFine = 0;
    values.status = "on_time";
  }

  await db.update(attendance).set(values).where(eq(attendance.id, id));

  await writeLog({
    actorId,
    action: accept ? "late_reason_accepted" : "late_reason_rejected",
    details: id,
  });
}

/** Koreksi manual oleh admin (mis. salah check-in). */
export async function adminUpdateAttendance(
  id: string,
  patch: Partial<{
    checkIn: string;
    checkOut: string;
    status: AttendanceStatus;
    type: AttendanceType;
    lateFine: number;
    radiusPenalty: number;
    notes: string;
  }>,
  actorId: string,
): Promise<Attendance | null> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.checkIn !== undefined) values.checkIn = patch.checkIn;
  if (patch.checkOut !== undefined) values.checkOut = patch.checkOut;
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.lateFine !== undefined) values.lateFine = patch.lateFine;
  if (patch.radiusPenalty !== undefined)
    values.radiusPenalty = patch.radiusPenalty;
  if (patch.notes !== undefined) values.notes = patch.notes;

  await db.update(attendance).set(values).where(eq(attendance.id, id));

  await writeLog({
    actorId,
    action: "attendance_corrected",
    details: `${id} ${JSON.stringify(patch)}`,
  });

  const [row] = await db
    .select(select)
    .from(attendance)
    .innerJoin(users, eq(attendance.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(attendance.id, id))
    .limit(1);

  return row ? attach(row) : null;
}

export async function deleteAttendance(
  id: string,
  actorId: string,
): Promise<void> {
  const [row] = await db
    .select({ userId: attendance.userId })
    .from(attendance)
    .where(eq(attendance.id, id))
    .limit(1);

  await db.delete(attendance).where(eq(attendance.id, id));
  await writeLog({
    actorId,
    action: "attendance_deleted",
    targetUserId: row?.userId ?? null,
    details: id,
  });
}
