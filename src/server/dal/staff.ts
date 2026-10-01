import "server-only";
import { db } from "@/db";
import { and, eq, desc, gte, lte, or, asc, sql } from "drizzle-orm";
import {
  users,
  departments,
  kpiSettings,
  attendance,
  leaveRequests,
  kpiAssignments,
  kpis,
  holidays,
} from "@/db/schema";
import { writeLog } from "./absensi";
import type {
  AbsensiRole,
  AbsensiStatus,
} from "@/types/index";

/** Baris users + nama departemen, untuk halaman admin staf. */
export type StaffRow = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  kpiRole: string;
  absensiRole: AbsensiRole;
  absensiStatus: AbsensiStatus;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  leaveQuota: number;
  sickQuota: number;
  isHidden: boolean;
  leaveUsed: number;
  sickUsed: number;
  createdAt: string;
};

const staffSelect = {
  id: users.id,
  name: users.name,
  email: users.email,
  photoUrl: users.photoUrl,
  image: users.image,
  kpiRole: users.kpiRole,
  absensiRole: users.absensiRole,
  absensiStatus: users.absensiStatus,
  departmentId: users.departmentId,
  position: users.position,
  leaveQuota: users.leaveQuota,
  sickQuota: users.sickQuota,
  isHidden: users.isHidden,
  createdAt: users.createdAt,
  departmentName: departments.name,
};

/**
 * Kuota terpakai bulan berjalan (hanya request approved).
 * Dihitung sekali untuk semua staf, bukan N+1 per baris.
 */
async function usedQuotaThisMonthForAll(): Promise<
  Record<string, { leave: number; sick: number }>
> {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}`;

  const rows = await db
    .select({
      userId: leaveRequests.userId,
      type: leaveRequests.type,
      dates: leaveRequests.dates,
    })
    .from(leaveRequests)
    .where(eq(leaveRequests.status, "approved"));

  const out: Record<string, { leave: number; sick: number }> = {};
  for (const r of rows) {
    const count = (r.dates ?? []).filter((d) => d.startsWith(prefix)).length;
    if (count === 0) continue;
    const bucket = (out[r.userId] ??= { leave: 0, sick: 0 });
    if (r.type === "sick") bucket.sick += count;
    else if (r.type === "leave") bucket.leave += count;
  }
  return out;
}

export async function listStaff(params?: {
  departmentId?: string;
  status?: AbsensiStatus;
  search?: string;
}): Promise<StaffRow[]> {
  const conds = [];
  if (params?.departmentId) {
    conds.push(eq(users.departmentId, params.departmentId));
  }
  if (params?.status) conds.push(eq(users.absensiStatus, params.status));
  if (params?.search) {
    const q = params.search.trim();
    conds.push(
      or(
        sql`${users.name} ILIKE ${`%${q}%`}`,
        sql`${users.email} ILIKE ${`%${q}%`}`,
      ),
    );
  }

  const [rows, used] = await Promise.all([
    db
      .select(staffSelect)
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(users.name)),
    usedQuotaThisMonthForAll(),
  ]);

  return rows.map((r) => {
    const u = used[r.id] ?? { leave: 0, sick: 0 };
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      photoUrl: r.photoUrl ?? r.image,
      kpiRole: r.kpiRole,
      absensiRole: r.absensiRole,
      absensiStatus: r.absensiStatus,
      departmentId: r.departmentId,
      departmentName: r.departmentName,
      position: r.position,
      leaveQuota: r.leaveQuota,
      sickQuota: r.sickQuota,
      isHidden: r.isHidden,
      leaveUsed: u.leave,
      sickUsed: u.sick,
      createdAt: r.createdAt.toISOString(),
    };
  });
}


export type StaffPatch = {
  name?: string;
  position?: string | null;
  departmentId?: string | null;
  absensiRole?: AbsensiRole;
  absensiStatus?: AbsensiStatus;
  kpiRole?: string;
  leaveQuota?: number;
  sickQuota?: number;
  isHidden?: boolean;
};

/**
 * Update data staf.
 *
 * Keamanan: HANYA admin absensi boleh memanggil. Role KPI hanya
 * boleh diubah oleh HR/Executive (dipanggil dari endpoint lain),
 * bukan dari form absensi.
 */
export async function updateStaff(
  id: string,
  patch: StaffPatch,
  actorId: string,
): Promise<StaffRow | null> {
  const values: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.position !== undefined) values.position = patch.position;
  if (patch.departmentId !== undefined)
    values.departmentId = patch.departmentId || null;
  if (patch.absensiRole !== undefined)
    values.absensiRole = patch.absensiRole;
  if (patch.absensiStatus !== undefined)
    values.absensiStatus = patch.absensiStatus;
  if (patch.leaveQuota !== undefined)
    values.leaveQuota = Math.max(0, Math.floor(Number(patch.leaveQuota)));
  if (patch.sickQuota !== undefined)
    values.sickQuota = Math.max(0, Math.floor(Number(patch.sickQuota)));
  if (patch.isHidden !== undefined) values.isHidden = patch.isHidden;

  await db.update(users).set(values).where(eq(users.id, id));

  await writeLog({
    actorId,
    action: "staff_updated",
    targetUserId: id,
    details: JSON.stringify(patch),
  });

  const all = await listStaff();
  return all.find((s) => s.id === id) ?? null;
}

/** Buat user baru (dipakai admin, tanpa akun Google dulu). */
export async function createStaff(
  input: {
    email: string;
    name: string;
    kpiRole: string;
    absensiRole: AbsensiRole;
    departmentId: string | null;
    position?: string | null;
  },
  actorId: string,
): Promise<{ ok: boolean; error?: string; user?: StaffRow }> {
  const email = input.email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return { ok: false, error: `Email ${email} sudah terdaftar.` };
  }

  // Id sementara supaya FK aman; akan Detector换成 string id Auth.js
  // begitu user pertama kali login dengan Google.
  const id = `pending-${email}`;

  await db.insert(users).values({
    id,
    email,
    name: input.name.trim(),
    kpiRole: input.kpiRole as never,
    absensiRole: input.absensiRole,
      absensiStatus: "pending",
    departmentId: input.departmentId,
    position: input.position ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await writeLog({
    actorId,
    action: "staff_created",
    targetUserId: id,
    details: email,
  });

  const all = await listStaff();
  return { ok: true, user: all.find((s) => s.id === id) ?? undefined };
}

/**
 * Absensi + cuti untuk satu user (dipakai form edit staf).
 */
export async function staffAttendanceSummary(params: {
  userId: string;
  month: string; // YYYY-MM
}) {
  const [from, to] = monthBounds(params.month);

  const [rows, leaves] = await Promise.all([
    db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.userId, params.userId),
          gte(attendance.date, from),
          lte(attendance.date, to),
        ),
      )
      .orderBy(desc(attendance.date)),
    db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.userId, params.userId))
      .orderBy(desc(leaveRequests.createdAt)),
  ]);

  return {
    attendance: rows.map((r) => ({
      id: r.id,
      date: String(r.date),
      checkIn: r.checkIn ? String(r.checkIn).slice(0, 5) : null,
      checkOut: r.checkOut ? String(r.checkOut).slice(0, 5) : null,
      status: r.status,
      type: r.type,
      lateFine: r.lateFine,
      locationStatus: r.locationStatus,
      notes: r.notes,
    })),
    leaves: leaves.map((l) => ({
      id: l.id,
      type: l.type,
      dates: l.dates ?? [],
      status: l.status,
      reason: l.reason,
    })),
  };
}

export function monthBounds(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return [
    `${y}-${String(m).padStart(2, "0")}-01`,
    `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  ];
}

/**
 * Data kalender tim: absensi + cuti untuk seluruh orang dalam bulan.
 * Satu query absensi + satu query cuti (bukan per user).
 */
export type TeamCalendarDay = {
  date: string;
  wfo: string[];
  wfa: string[];
  leave: string[];
  sick: string[];
  pendingLeave: string[];
  holiday: boolean;
  holidayName: string;
};

export async function teamCalendar(params: {
  month: string;
  departmentId?: string | null;
}) {
  const [from, to] = monthBounds(params.month);

  const deptCond = params.departmentId
    ? eq(users.departmentId, params.departmentId)
    : undefined;

  const [attRows, leaveRows, holidayRows, nameRows] = await Promise.all([
    db
      .select({
        date: attendance.date,
        type: attendance.type,
        userId: attendance.userId,
        userName: users.name,
      })
      .from(attendance)
      .innerJoin(users, eq(attendance.userId, users.id))
      .where(
        and(
          gte(attendance.date, from),
          lte(attendance.date, to),
          ...(deptCond ? [deptCond] : []),
        ),
      ),
    db
      .select({
        type: leaveRequests.type,
        status: leaveRequests.status,
        dates: leaveRequests.dates,
        userId: leaveRequests.userId,
        userName: users.name,
      })
      .from(leaveRequests)
      .innerJoin(users, eq(leaveRequests.userId, users.id))
      .where(
        deptCond
          ? and(deptCond)
          : undefined,
      ),
    db.select().from(holidays),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(eq(users.absensiStatus, "active"), ...(deptCond ? [deptCond] : [])),
      ),
  ]);

  const holidayMap = new Map(
    holidayRows.map((h) => [String(h.date), h.description]),
  );

  const days: TeamCalendarDay[] = [];
  for (const d of dateList(from, to)) {
    const att = attRows.filter((a) => String(a.date) === d);
    const leaves = leaveRows.filter((l) => (l.dates ?? []).includes(d));

    days.push({
      date: d,
      wfo: att
        .filter((a) => a.type === "WFO")
        .map((a) => a.userName ?? a.userId),
      wfa: att
        .filter((a) => a.type === "WFA")
        .map((a) => a.userName ?? a.userId),
      leave: leaves
        .filter((l) => l.type === "leave" && l.status === "approved")
        .map((l) => l.userName ?? l.userId),
      sick: leaves
        .filter((l) => l.type === "sick" && l.status === "approved")
        .map((l) => l.userName ?? l.userId),
      pendingLeave: leaves
        .filter((l) => l.status === "pending")
        .map((l) => l.userName ?? l.userId),
      holiday: holidayMap.has(d),
      holidayName: holidayMap.get(d) ?? "",
    });
  }

  return {
    days,
    staff: nameRows,
    holidays: [...holidayMap.entries()].map(([date, description]) => ({
      date,
      description,
    })),
  };
}

export function dateList(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`,
    );
  }
  return out;
}

/**
 * Semua pengajuan alasan keterlambatan (menunggu + sudah direview).
 *
 * formerly halaman ini mengambil SELURUH attendance dengan alasan
 * terisi. Sekarang difilter di server supaya tidak mengirim
 * seluruh tabel ke browser.
 */
export async function listLateReasonReviews(from: string, to: string) {
  const rows = await db
    .select({
      id: attendance.id,
      userId: attendance.userId,
      userName: users.name,
      departmentName: departments.name,
      date: attendance.date,
      checkIn: attendance.checkIn,
      status: attendance.status,
      lateReason: attendance.lateReason,
      lateReasonStatus: attendance.lateReasonStatus,
      lateFine: attendance.lateFine,
    })
    .from(attendance)
    .innerJoin(users, eq(attendance.userId, users.id))
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(
      and(
        sql`${attendance.lateReason} <> ''`,
        gte(attendance.date, from),
        lte(attendance.date, to),
      ),
    )
    .orderBy(desc(attendance.date))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName ?? "Unknown",
    departmentName: r.departmentName,
    date: String(r.date),
    checkIn: r.checkIn ? String(r.checkIn).slice(0, 5) : null,
    status: r.status,
    lateReason: r.lateReason,
    lateReasonStatus: r.lateReasonStatus,
    lateFine: r.lateFine,
  }));
}

/** KPI milik user yang sedang login (dipakai /absensi/(staff)/kpi). */
export async function myKpiSummary(year: number, month: number, userId: string) {
  const rows = await db
    .select({
      id: kpiAssignments.id,
      title: kpis.title,
      kpiType: kpiAssignments.kpiType,
      monthlyTarget: kpiAssignments.monthlyTarget,
      actualTotal: kpiAssignments.actualTotal,
      achievementPercentage: kpiAssignments.achievementPercentage,
      performanceCategory: kpiAssignments.performanceCategory,
      status: kpiAssignments.status,
    })
    .from(kpiAssignments)
    .innerJoin(kpis, eq(kpiAssignments.kpiId, kpis.id))
    .where(
      and(
        eq(kpiAssignments.userId, userId),
        eq(kpiAssignments.year, year),
        eq(kpiAssignments.month, month),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kpiType: r.kpiType,
    monthlyTarget: Number(r.monthlyTarget),
    actualTotal: Number(r.actualTotal),
    achievementPercentage: Number(r.achievementPercentage),
    performanceCategory: r.performanceCategory,
    status: r.status,
  }));
}
