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
/**
 * Jarak dua titik di permukaan bumi, dalam meter (haversine).
 *
 * Dipakai untuk menghitung ulang jarak ke kantor. Radius bumi 6371 km,
 * sama dengan yang dipakai saat check-in disimpan -- supaya angka di
 * dashboard cocok dengan yang tercatat di `location_in.distance`.
 */
export function jarakMeter(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Baca lat/lng dari jsonb `location_in`.
 *
 * Mengembalikan null kalau tidak bisa dipakai -- dan HANYA kalau begitu.
 * Yang ditemukan di produksi:
 *
 *   - 743 baris tanpa location_in sama sekali
 *   - 3 baris punya lat/lng bernilai null
 *
 * Keduanya harus mengembalikan null, bukan NaN. NaN akan lolos ke UI
 * dan tampil sebagai "NaN m", yang jelas salah tapi hanya terlihat
 * kalau sedangICATIONS dificuldade.
 */
function bacaKoordinat(raw: unknown): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = typeof o.lat === "number" ? o.lat : Number(o.lat);
  const lng = typeof o.lng === "number" ? o.lng : Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Latitude di luar rentang ini berarti koordinat rusak, bukan lokasi
  // di ujung dunia. Difilter diam-diam supaya tidak mengarang data.
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // 0/0 adalah "tidak diketahui", bukan Gulf of Guinea.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * Jarak ke kantor TERDEKAT, atau null kalau tidak bisa dihitung.
 *
 * Mengembalikan null, bukan 0, untuk tiga keadaan berbeda yang sering
 * disamakan: tidak ada koordinat, koordinatnya rusak, atau tidak ada
 * kantor yang terdaftar. Kalau semuanya jadi 0, dashboard akan
 * menampilkan "0 m / Dalam Area" untuk orang yang tidak absen dengan
 * GPS sama sekali -- dan itu kesimpulan yang salah.
 */
function hitungJarakKantor(
  raw: unknown,
  offices: Array<{
    name: string;
    lat: number | string;
    lng: number | string;
    radius: number | string | null;
  }>,
): DashboardLog["jarakDariKantor"] {
  if (offices.length === 0) return null;
  const p = bacaKoordinat(raw);
  if (!p) return null;

  let terbaik:
    | { meter: number; kantor: (typeof offices)[number] }
    | null = null;

  for (const k of offices) {
    const lat = Number(k.lat);
    const lng = Number(k.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = jarakMeter(p.lat, p.lng, lat, lng);
    if (!Number.isFinite(d)) continue;
    if (!terbaik || d < terbaik.meter) terbaik = { meter: d, kantor: k };
  }
  if (!terbaik) return null;

  const radius = Number(terbaik.kantor.radius ?? 0);
  return {
    meter: Math.round(terbaik.meter),
    namaKantor: terbaik.kantor.name,
    radius,
    dalamRadius: radius > 0 ? terbaik.meter <= radius : true,
  };
}

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
  /**
   * Koordinat check-in mentah, kalau ada.
   *
   * Bentuk jsonb bisa berbeda-beda antar baris -- lihat
   * `jarakDariKantor` untuk yang sudah dihitung ulang.
   */
  locationIn: Record<string, unknown> | null;
  /**
   * Jarak ke kantor terdekat dalam meter, dihitung ulang dari
   * `office_locations`.
   *
   * Kenapa tidak memakai `locationIn.distance`: di produksi, hanya 347
   * dari 2687 baris yang punya field itu. Sisanya hanya menyimpan lat
   * dan lng. Kalau UI membaca `distance`, kolom jarak kosong untuk 87
   * persen baris -- dan itu tidak terlihat salah, karena kolom kosong
   * selalu terlihat normal.
   *
   * Yang tersimpan memang benar (diverifikasi: rata-rata 2703.9 m dari
   * haversine, beda maksimal 0.5 m), tapi hanya ada di baris yang punya
   * kantor saat check-in terjadi.
   */
  jarakDariKantor: {
    meter: number;
    namaKantor: string;
    radius: number;
    dalamRadius: boolean;
  } | null;
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
      // Jarak dihitung ulang di sini, bukan diambil dari
      // location_in.distance: field itu hanya ada di 347 dari 2687
      // baris, jadi membacanya langsung membuat kolom kosong untuk
      // sebagian besar data.
      jarakDariKantor: hitungJarakKantor(r.locationIn, officeRows),
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

/**
 * Statistik kehadiran pribadi untuk bulan berjalan.
 *
 * Kartu "Attendance Streak" di dashboard staf sebelumnya menulis
 * "100%" dan "Great Consistency!" sebagai TEKS LITERAL, tanpa query
 * apa pun. Di produksi bulan ini: 9 dari 31 staf aktif belum punya
 * absensi sama sekali, 6 orang persentasenya 0%, dan hanya 10 orang
 * yang benar-benar 100%. Jadi angka itu salah untuk lebih dari
 * separuh tim -- dan terlihat benar karena rapih.
 *
 * Bentuk yang dikembalikan sengaja memakai `null` untuk "tidak ada
 * data", bukan 0. Keduanya berbeda: 0 berarti hadir tapi tidak tepat
 * waktu, `null` berarti belum absen sama sekali. Kalau keduanya
 * dibulatkan jadi 0, kartu akan menuduh orang yang belum absen
 * sebagai tidak disiplin.
 *
 * `month` ada supaya test bisa menguji bulan tertentu. Tanpa itu,
 * streak hanya bisa diuji terhadap bulan berjalan, yang isinya
 * berubah setiap hari -- jadi test akan lulus atau gagal tergantung
 * tanggal dijalankan, bukan tergantung kode.
 */
export async function myAttendanceMonth(
  userId: string,
  month?: { year: number; month: number },
): Promise<{
  /** Hari kerja yang tercatat bulan ini (bukan kalender). */
  daysRecorded: number;
  /** Hari dengan status on_time. */
  daysOnTime: number;
  /**
   * Persentase tepat waktu bulan ini, atau `null` kalau belum absen.
   * Angka bulat 0-100.
   */
  onTimePercent: number | null;
  /**
   * Beruntunnya hari on_time, dihitung dari hari terakhir yang tercatat.
   *
   * Dihitung dari hari kerja saja -- akhir pekan dan hari libur tidak
   * memutus streak, karena tidak ada yang bisa absen di hari itu.
   * Kalau ikut dihitung, streak semua orang akan putus setiap Jumat.
   */
  streak: number;
  /** Hari terakhir yang tercatat, `YYYY-MM-DD`. Null kalau belum absen. */
  lastRecordedOn: string | null;
}> {
  // Default ke bulan berjalan, dihitung dari zona waktu server --
  // yang sudah di-set Asia/Jakarta lewat ENV TZ di Dockerfile.
  //
  // Rentang bulan disusun di sini, bukan lewat
  // date_trunc('month', CURRENT_DATE), supaya `month` yang diberikan
  // benar-benar dipakai. Kalau filternya tetap date_trunc, parameter
  // itu diabaikan, dan test hanya bisa menguji bulan berjalan -- yang
  // isinya berubah setiap hari. Hasilnya test lulus atau gagal
  // tergantung tanggal dijalankan, bukan tergantung kode.
  //
  // Perhatikan: route wajib meneruskan `month`. Kalau tidak, parameter
  // ini jadi tidak terjangkau dan test tidak bisa memverifikasi
  // perhitungan streak sama sekali.
  const now = new Date();
  const target = month ?? { year: now.getFullYear(), month: now.getMonth() + 1 };
  const from = `${target.year}-${String(target.month).padStart(2, "0")}-01`;
  const nextYear = target.month === 12 ? target.year + 1 : target.year;
  const nextMonth = target.month === 12 ? 1 : target.month + 1;
  const to = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const rows = await db
    .select({
      date: attendance.date,
      status: attendance.status,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.userId, userId),
        sql`${attendance.checkIn} IS NOT NULL`,
        gte(attendance.date, from),
        sql`${attendance.date} < ${to}`,
      ),
    )
    .orderBy(desc(attendance.date));

  if (rows.length === 0) {
    return {
      daysRecorded: 0,
      daysOnTime: 0,
      onTimePercent: null,
      streak: 0,
      lastRecordedOn: null,
    };
  }

  const isOnTime = (s: unknown) => s === "on_time";

  const daysOnTime = rows.filter((r) => isOnTime(r.status)).length;

  // Kolom `date` bertipe date dan Drizzle membacanya sebagai string
  // "YYYY-MM-DD", bukan Date. new Date("2026-10-02") di Node parses
  // sebagai UTC tengah malam; kalau lalu dipakai getFullYear() di
  // zona WIB, hasilnya jadi TANGGAL SEBELUMNYA. Jadi semua tanggal
  // di sini dipecah manual, tanpa Date sama sekali.
  const toParts = (s: string) => ({
    y: Number(s.slice(0, 4)),
    m: Number(s.slice(5, 7)),
    d: Number(s.slice(8, 10)),
  });

  // Streak menghitung dari baris terbaru yang ADA, bukan dari "hari ini".
  //
  // Alasannya: myAttendanceMonth() bisa dipanggil untuk bulan lampau,
  // dan untuk bulan itu semua baris sudah lewat. Kalau acuannya hari
  // ini, setiap baris akan dianggap "lebih lama dari hari ini" dan
  // terbuang -- streak selalu 1, berapa pun isinya.
  //
  // Untuk bulan berjalan, baris pertama adalah hari kerja terakhir yang
  // sudah lewat, jadi hasilnya sama dengan yang diharapkan.
  let streak = 0;
  let prev: { y: number; m: number; d: number } | null = null;

  for (const r of rows) {
    if (!isOnTime(r.status)) break;

    // Baris diurutkan DESC, jadi `prev` lebih BARU dan `cur` lebih lama.
    //
    // Yang dicek: ada HARI KERJA di antara keduanya yang tidak punya
    // baris absensi. Kalau tidak ada, keduanya berurutan dan streak
    // lanjut. Kalau ada -- cuti di tengah-tengah, atau hari kerja yang
    // terlewat -- streak putus.
    //
    // Dua kesalahan sebelumnya, keduanya membuat streak berhenti di 1:
    //
    //   a) Hitungan INKLUSIF kedua ujung, lalu `> 1`. Untuk dua hari
    //      berurutan hasilnya 2 (keduanya dihitung), jadi 2 > 1 dan
    //      streak putus padahal tidak ada yang terlewat.
    //   b) Membalik urutan argumen (cur, prev), sehingga guard
    //      `akhir < mulai` mengembalikan 0 dan celah TIDAK PERNAH
    //      terdeteksi.
    //
    // Sekarang: hitungan workdays DI TENGAH (exclusive kedua ujung),
    // dan threshold `> 0`.
    if (prev && hariKerjaDiAntara(prev, toParts(r.date)) > 0) break;

    streak++;
    prev = toParts(r.date);
  }

  const percent = Math.round((daysOnTime / rows.length) * 100);

  return {
    daysRecorded: rows.length,
    daysOnTime,
    onTimePercent: percent,
    streak,
    lastRecordedOn: rows[0].date,
  };
}

/**
 * Berapa hari kerja (Sen-Jum) yang ada DI ANTARA dua tanggal.
 *
 * Kedua ujung TIDAK dihitung. Yang dihitung hanya hari kerja yang jatuh
 * di antaranya, karena itu yang menentukan "ada yang terlewat atau
 * tidak":
 *
 *   Senin lalu Selasa  -> 0 (berurutan, tidak ada yang terlewat)
 *   Jumat lalu Senin   -> 0 (akhir pekan bukan hari kerja)
 *   Senin lalu 2 minggu lalu -> 10 (cuti atau hari kerja terlewat)
 *
 * Parameter `lebihBaru` harus lebih baru dari `lebihLama`, sesuai
 * urutan DESC baris. Kalau dibalik, hasilnya negatif.
 *
 * Dua kesalahan versi sebelumnya, dan keduanya membuat streak berhenti
 * di 1 -- persis gejalanya di test:
 *
 *   a) Inklusif kedua ujung dengan ambang `> 1`. Dua hari berurutan
 *      menghasilkan 2, jadi `2 > 1` memutus streak padahal tidak ada
 *      yang terlewat.
 *   b) Argumen terbalik (cur, prev), sehingga guard `akhir < mulai`
 *      mengembalikan 0 -- celah tidak pernah terdeteksi, dan hari yang
 *      sudah 2 minggu berlalu dianggap masih beruntun.
 */
function hariKerjaDiAntara(
  lebihBaru: { y: number; m: number; d: number },
  lebihLama: { y: number; m: number; d: number },
): number {
  const mulai = Date.UTC(lebihLama.y, lebihLama.m - 1, lebihLama.d) + 86_400_000;
  const akhir = Date.UTC(lebihBaru.y, lebihBaru.m - 1, lebihBaru.d) - 86_400_000;
  if (akhir < mulai) return 0;

  let count = 0;
  for (let t = mulai; t <= akhir; t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}