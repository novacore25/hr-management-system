import "server-only";
import { db } from "@/db";
import {
  and,
  eq,
  desc,
  sql,
  gte,
  lte,
  arrayContains,
  asc,
} from "drizzle-orm";
import {
  attendance,
  users,
  departments,
  leaveRequests,
  officeLocations,
} from "@/db/schema";
import { writeLog } from "./absensi";
import type { AbsensiRole } from "@/types/index";

/**
 * Baris absensi yang sudah di-join dengan nama & divisi.
 *
 * Dulu halaman dashboard melakukan query dari browser lalu mencocokkan
 * `users` di sisi client dengan `Map`. Sekarang join-nya di server,
 * jadi browser tidak perlu menarik daftar user hanya untuk melengkapi
 * nama.
 */
export type DashboardLog = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  dept: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  type: string;
  lateFine: number;
  radiusPenalty: number;
  locationStatus: string | null;
  locationIn: { lat: number; lng: number } | null;
  lateReason: string;
  lateReasonStatus: string | null;
  notes: string | null;
};

export type DashboardUser = {
  id: string;
  name: string;
  email: string;
  dept: string;
};

export type ExcusedRow = {
  id: string;
  type: string;
  reason: string;
  createdAt: string;
  dates: string[];
};

export type OfficeRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
};

/** Kolom `date` datang sebagai YYYY-MM-DD. */
function isoDay(value: unknown): string {
  return String(value).slice(0, 10);
}

/**
 * Semua data halaman dashboard admin untuk satu tanggal.
 *
 * formerly 4 query paralel dari browser (attendance + users + leave_requests
 * + count pending) plus 1 query office_locations. Sekarang semuanya satu
 *bolic call server, dan `isHidden` difilter di SQL — bukan setelah
 * penarikan seluruh tabel users.
 */
export async function dashboardForDate(date: string): Promise<{
  logs: DashboardLog[];
  activeUsers: DashboardUser[];
  excused: ExcusedRow[];
  pendingStaff: number;
  offices: OfficeRow[];
}> {
  const [logRows, userRows, excusedRows, pendingRow, officeRows] =
    await Promise.all([
      db
        .select({
          id: attendance.id,
          userId: attendance.userId,
          userName: users.name,
          userEmail: users.email,
          dept: departments.name,
          date: attendance.date,
          checkIn: attendance.checkIn,
          checkOut: attendance.checkOut,
          status: attendance.status,
          type: attendance.type,
          lateFine: attendance.lateFine,
          radiusPenalty: attendance.radiusPenalty,
          locationStatus: attendance.locationStatus,
          locationIn: attendance.locationIn,
          lateReason: attendance.lateReason,
          lateReasonStatus: attendance.lateReasonStatus,
          notes: attendance.notes,
        })
        .from(attendance)
        .innerJoin(users, eq(attendance.userId, users.id))
        .leftJoin(departments, eq(users.departmentId, departments.id))
        .where(eq(attendance.date, date))
        .orderBy(asc(users.name)),

      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          dept: departments.name,
        })
        .from(users)
        .leftJoin(departments, eq(users.departmentId, departments.id))
        .where(
          and(
            eq(users.absensiStatus, "active"),
            eq(users.isHidden, false),
          ),
        )
        .orderBy(asc(users.name)),

      // `dates` bertipe text[], jadioperator Containment-nya array overlap.
      db
        .select({
          userId: leaveRequests.userId,
          type: leaveRequests.type,
          reason: leaveRequests.reason,
          createdAt: leaveRequests.createdAt,
          dates: leaveRequests.dates,
        })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.status, "approved"),
            arrayContains(leaveRequests.dates, [date]),
          ),
        ),

      db
        .select({ total: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.absensiStatus, "pending")),

      db
        .select({
          id: officeLocations.id,
          name: officeLocations.name,
          lat: officeLocations.lat,
          lng: officeLocations.lng,
          radius: officeLocations.radius,
        })
        .from(officeLocations)
        .orderBy(asc(officeLocations.name)),
    ]);

  return {
    logs: logRows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName ?? "Unknown",
      userEmail: r.userEmail,
      dept: r.dept ?? "Umum",
      date: isoDay(r.date),
      checkIn: r.checkIn ? String(r.checkIn).slice(0, 5) : null,
      checkOut: r.checkOut ? String(r.checkOut).slice(0, 5) : null,
      status: r.status,
      type: r.type,
      lateFine: Number(r.lateFine ?? 0),
      radiusPenalty: Number(r.radiusPenalty ?? 0),
      locationStatus: r.locationStatus,
      locationIn: r.locationIn ?? null,
      lateReason: r.lateReason ?? "",
      lateReasonStatus: r.lateReasonStatus,
      notes: r.notes,
    })),

    activeUsers: userRows.map((u) => ({
      id: u.id,
      name: u.name ?? "Unknown",
      email: u.email,
      dept: u.dept ?? "Umum",
    })),

    excused: excusedRows.map((r) => ({
      id: r.userId,
      type: r.type,
      reason: r.reason ?? "",
      createdAt: r.createdAt.toISOString(),
      dates: r.dates ?? [],
    })),

    pendingStaff: Number(pendingRow[0]?.total ?? 0),

    offices: officeRows.map((o) => ({
      id: o.id,
      name: o.name,
      lat: Number(o.lat),
      lng: Number(o.lng),
      radius: o.radius,
    })),
  };
}

/** Batas bulan "YYYY-MM" -> [tanggal pertama, tanggal terakhir]. */
export function monthBounds(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return [
    `${y}-${String(m).padStart(2, "0")}-01`,
    `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  ];
}

/**
 * Absensi dengan denda keterlambatan dalam satu bulan.
 *
 * Dipakai tab "Denda".formerly batas bawah/atas dihitung manual dengan
 * `new Date(y, m, 0)` di browser; sekarang server yang menghitung
 * supaya tidak pernah meleset di bulan dengan jumlah hari berbeda.
 */
export async function monthlyLateRows(month: string): Promise<
  Array<{
    userId: string;
    date: string;
    lateFine: number;
    lateReason: string;
    checkIn: string | null;
  }>
> {
  const [from, to] = monthBounds(month);

  const rows = await db
    .select({
      userId: attendance.userId,
      date: attendance.date,
      lateFine: attendance.lateFine,
      lateReason: attendance.lateReason,
      checkIn: attendance.checkIn,
    })
    .from(attendance)
    .where(
      and(
        gte(attendance.date, from),
        lte(attendance.date, to),
        sql`${attendance.lateFine} > 0`,
      ),
    )
    .orderBy(desc(attendance.date));

  return rows.map((r) => ({
    userId: r.userId,
    date: isoDay(r.date),
    lateFine: Number(r.lateFine ?? 0),
    lateReason: r.lateReason ?? "",
    checkIn: r.checkIn ? String(r.checkIn).slice(0, 5) : null,
  }));
}

/** Baris mentah untuk laporan Excel (rentang tanggal). */
export async function exportRows(from: string, to: string): Promise<{
  attendance: Array<{
    userId: string;
    userName: string;
    dept: string;
    date: string;
    type: string;
    status: string;
    checkIn: string | null;
    checkOut: string | null;
    lateFine: number;
    radiusPenalty: number;
    lateReason: string;
  }>;
  leave: Array<{
    userId: string;
    userName: string;
    dept: string;
    type: string;
    dates: string[];
    reason: string;
  }>;
  users: Array<{ id: string; name: string; dept: string }>;
}> {
  const [attRows, leaveRows, userRows] = await Promise.all([
    db
      .select({
        userId: attendance.userId,
        userName: users.name,
        dept: departments.name,
        date: attendance.date,
        type: attendance.type,
        status: attendance.status,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        lateFine: attendance.lateFine,
        radiusPenalty: attendance.radiusPenalty,
        lateReason: attendance.lateReason,
      })
      .from(attendance)
      .innerJoin(users, eq(attendance.userId, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(and(gte(attendance.date, from), lte(attendance.date, to)))
      .orderBy(asc(users.name)),

    db
      .select({
        userId: leaveRequests.userId,
        userName: users.name,
        dept: departments.name,
        type: leaveRequests.type,
        dates: leaveRequests.dates,
        reason: leaveRequests.reason,
      })
      .from(leaveRequests)
      .innerJoin(users, eq(leaveRequests.userId, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(eq(leaveRequests.status, "approved")),

    db
      .select({
        id: users.id,
        name: users.name,
        dept: departments.name,
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(eq(users.absensiStatus, "active"))
      .orderBy(asc(users.name)),
  ]);

  return {
    attendance: attRows.map((r) => ({
      userId: r.userId,
      userName: r.userName ?? "Unknown",
      dept: r.dept ?? "Umum",
      date: isoDay(r.date),
      type: r.type,
      status: r.status,
      checkIn: r.checkIn ? String(r.checkIn).slice(0, 5) : null,
      checkOut: r.checkOut ? String(r.checkOut).slice(0, 5) : null,
      lateFine: Number(r.lateFine ?? 0),
      radiusPenalty: Number(r.radiusPenalty ?? 0),
      lateReason: r.lateReason ?? "",
    })),
    leave: leaveRows.map((r) => ({
      userId: r.userId,
      userName: r.userName ?? "Unknown",
      dept: r.dept ?? "Umum",
      type: r.type,
      dates: r.dates ?? [],
      reason: r.reason ?? "",
    })),
    users: userRows.map((u) => ({
      id: u.id,
      name: u.name ?? "Unknown",
      dept: u.dept ?? "Umum",
    })),
  };
}

/**
 * Override absensi oleh admin.
 *
 * formerly upsert dilakukan dari browser, termasuk menulis `absensi_logs`
 * dengan `actor` diambil dari state AuthContext — jadi nama aktornya bisa
 * dipalsukan. Sekarang nama aktornya dari session server.
 *
 * Upsert di (userId, date) karena ada unique index `attendance_unique`.
 */
export async function adminOverrideAttendance(
  input: {
    userId: string;
    date: string;
    type: "WFO" | "WFA";
    checkIn: string;
    checkOut: string;
  },
  actorId: string,
  actorName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [staff] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!staff) return { ok: false, error: "Staf tidak ditemukan." };

  const values = {
    userId: input.userId,
    date: input.date,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    type: input.type,
    status: "on_time" as const,
    locationStatus: "ADMIN_OVERRIDE",
    lateFine: 0,
    radiusPenalty: 0,
    lateReason: "",
    earlyReason: "",
    earlyCheckout: false,
    updatedAt: new Date(),
  };

  await db
    .insert(attendance)
    .values(values)
    .onConflictDoUpdate({
      target: [attendance.userId, attendance.date],
      set: values,
    });

  await writeLog({
    actorId,
    action: "admin_override_attendance",
    targetUserId: input.userId,
    details: `Override absensi ${staff.name} tgl ${input.date} (${input.checkIn}-${input.checkOut}, ${input.type}) oleh ${actorName}`,
  });

  return { ok: true };
}

/**
 * Override cuti/sakit/WFA oleh admin — langsung approved.
 *
 * Ini SENGAJA melewati aturan konflik divisi yang berlaku untuk pengajuan
 * staf (lihat createLeaveRequest): override admin adalah keputusan
 * manual, bukan pengajuan.
 *
 * Pengurangan kuota tetap dihitung di server supaya tidak bisa
 *Shanghai dari browser.
 */
export async function adminOverrideLeave(
  input: {
    userId: string;
    type: "leave" | "sick" | "wfa";
    dates: string[];
    reason: string;
  },
  actorId: string,
  actorName: string,
): Promise<{ ok: true; days: number } | { ok: false; error: string }> {
  if (input.dates.length === 0) {
    return { ok: false, error: "Tidak ada tanggal yang valid." };
  }

  const [staff] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!staff) return { ok: false, error: "Staf tidak ditemukan." };

  const dates = [...new Set(input.dates)].sort();
  const now = new Date();

  // Kuota hanya relevan untuk cuti & sakit, dan hanya dikurangi saat
  // jumlahnya masih positif.
  let deductedSick = 0;
  let deductedLeave = 0;

  if (input.type !== "wfa") {
    const [quota] = await db
      .select({
        leaveQuota: users.leaveQuota,
        sickQuota: users.sickQuota,
      })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    const days = dates.length;

    if (input.type === "sick") {
      const fromSick = Math.min(days, quota?.sickQuota ?? 0);
      const fromLeave = days - fromSick;
      deductedSick = fromSick;
      deductedLeave = fromLeave;

      await db
        .update(users)
        .set({
          sickQuota: (quota?.sickQuota ?? 0) - fromSick,
          leaveQuota: (quota?.leaveQuota ?? 0) - fromLeave,
          updatedAt: now,
        })
        .where(eq(users.id, input.userId));
    } else {
      deductedLeave = days;
      await db
        .update(users)
        .set({
          leaveQuota: (quota?.leaveQuota ?? 0) - days,
          updatedAt: now,
        })
        .where(eq(users.id, input.userId));
    }
  }

  await db.insert(leaveRequests).values({
    userId: input.userId,
    type: input.type,
    dates,
    reason: input.reason || "Admin Override",
    status: "approved",
    processedBy: actorName,
    processedAt: now,
    deductedSick,
    deductedLeave,
    createdAt: now,
    updatedAt: now,
  });

  await writeLog({
    actorId,
    action: "admin_override_leave",
    targetUserId: input.userId,
    details: `Override ${input.type} ${staff.name} (${dates.join(", ")}) oleh ${actorName}`,
  });

  return { ok: true, days: dates.length };
}

/** Hanya untuk typing; dipakai route untuk narrowing role. */
export type DashboardRole = AbsensiRole;

/**
 * Ringkasan kehadiran tim untuk widget check-in staf.
 *
 * BEDA dari `dashboardForDate`: yang ini untuk SEMUA staf aktif, bukan
 * admin saja, karena widget-nya dipakai di /dashboard/tim. Isinya tetap
 * aman dip everybody: nama + kategori (WFO/WFA/cuti/alpha) per hari —
 * persis informasi yang sudah ditampilkan widget versi lama.
 *
 * formerly: 3 query dari browser (users + attendance + leave_requests)
 * plus 3 realtime channel yang semuanya menarik ulang daftar user
 * penuh setiap ada perubahan.
 */
export async function presenceSummary(date: string): Promise<{
  wfo: { count: number; names: string[] };
  wfa: { count: number; names: string[] };
  leave: { count: number; names: string[] };
  missed: { count: number; names: string[] };
}> {
  const [staffRows, attRows, leaveRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.absensiStatus, "active"), eq(users.isHidden, false)))
      .orderBy(asc(users.name)),

    db
      .select({ userId: attendance.userId, type: attendance.type })
      .from(attendance)
      .where(eq(attendance.date, date)),

    db
      .select({ userId: leaveRequests.userId })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.status, "approved"),
          arrayContains(leaveRequests.dates, [date]),
        ),
      ),
  ]);

  const nameById = new Map(staffRows.map((u) => [u.id, u.name ?? "Unknown"]));
  const activeIds = new Set(staffRows.map((u) => u.id));

  const presentIds = new Set<string>();
  const wfoIds: string[] = [];
  const wfaIds: string[] = [];

  for (const a of attRows) {
    if (!activeIds.has(a.userId)) continue;
    presentIds.add(a.userId);
    if (a.type === "WFA") wfaIds.push(a.userId);
    else wfoIds.push(a.userId);
  }

  const leaveIds = leaveRows.map((r) => r.userId).filter((id) => activeIds.has(id));

  const missedIds = staffRows
    .map((u) => u.id)
    .filter((id) => !presentIds.has(id) && !leaveIds.includes(id));

  const names = (ids: string[]) => ids.map((id) => nameById.get(id) ?? "Unknown");

  return {
    wfo: { count: wfoIds.length, names: names(wfoIds) },
    wfa: { count: wfaIds.length, names: names(wfaIds) },
    leave: { count: leaveIds.length, names: names(leaveIds) },
    missed: { count: missedIds.length, names: names(missedIds) },
  };
}