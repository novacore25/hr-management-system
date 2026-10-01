import "server-only";
import { db } from "@/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  absensiSettings,
  holidays,
  officeLocations,
  departmentLocations,
  absensiLogs,
  departments,
  users,
} from "@/db/schema";
import type { AbsensiSettings, Holiday, AbsensiLog } from "@/types/absensi";

// ═══════════════════════════════════════════════════════════════
// SETTINGS (baris tunggal id = 1)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS: AbsensiSettings = {
  workStart: "08:00",
  workEnd: "18:00",
  maxLate: "08:15",
  maxTimeSick: "12:00",
  maxTimeLeave: "23:59",
  maxTimeWfa: "12:00",
  officeLat: -6.241586,
  officeLng: 106.628055,
  officeRadius: 100,
  lastSyncDate: null,
};

export async function getSettings(): Promise<AbsensiSettings> {
  const [row] = await db
    .select()
    .from(absensiSettings)
    .where(eq(absensiSettings.id, 1))
    .limit(1);

  if (!row) return DEFAULT_SETTINGS;

  return {
    workStart: row.workStart,
    workEnd: row.workEnd,
    maxLate: row.maxLate,
    maxTimeSick: row.maxTimeSick,
    maxTimeLeave: row.maxTimeLeave,
    maxTimeWfa: row.maxTimeWfa,
    officeLat: Number(row.officeLat),
    officeLng: Number(row.officeLng),
    officeRadius: row.officeRadius,
    lastSyncDate: row.lastSyncDate ? String(row.lastSyncDate) : null,
  };
}

export type SettingsPatch = Partial<
  Omit<AbsensiSettings, "lastSyncDate">
>;

export async function updateSettings(
  patch: SettingsPatch,
): Promise<AbsensiSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };

  await db
    .insert(absensiSettings)
    .values({
      id: 1,
      workStart: next.workStart,
      workEnd: next.workEnd,
      maxLate: next.maxLate,
      maxTimeSick: next.maxTimeSick,
      maxTimeLeave: next.maxTimeLeave,
      maxTimeWfa: next.maxTimeWfa,
      officeLat: String(next.officeLat),
      officeLng: String(next.officeLng),
      officeRadius: next.officeRadius,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: absensiSettings.id,
      set: {
        workStart: next.workStart,
        workEnd: next.workEnd,
        maxLate: next.maxLate,
        maxTimeSick: next.maxTimeSick,
        maxTimeLeave: next.maxTimeLeave,
        maxTimeWfa: next.maxTimeWfa,
        officeLat: String(next.officeLat),
        officeLng: String(next.officeLng),
        officeRadius: next.officeRadius,
        updatedAt: new Date(),
      },
    });

  return getSettings();
}

// ═══════════════════════════════════════════════════════════════
// HOLIDAY
// ═══════════════════════════════════════════════════════════════

export async function listHolidays(): Promise<Holiday[]> {
  const rows = await db
    .select()
    .from(holidays)
    .orderBy(asc(holidays.date));
  return rows.map((r) => ({
    id: r.id,
    date: String(r.date),
    description: r.description,
  }));
}

export async function listHolidaysInRange(
  from: string,
  to: string,
): Promise<Holiday[]> {
  const rows = await db
    .select()
    .from(holidays)
    .orderBy(asc(holidays.date));
  return rows
    .filter((r) => {
      const d = String(r.date);
      return d >= from && d <= to;
    })
    .map((r) => ({
      id: r.id,
      date: String(r.date),
      description: r.description,
    }));
}

export async function createHoliday(
  date: string,
  description: string,
): Promise<Holiday> {
  const [row] = await db
    .insert(holidays)
    .values({ date, description })
    .onConflictDoUpdate({
      target: holidays.date,
      set: { description },
    })
    .returning();
  return {
    id: row.id,
    date: String(row.date),
    description: row.description,
  };
}

export async function deleteHoliday(id: string): Promise<void> {
  await db.delete(holidays).where(eq(holidays.id, id));
}

// ═══════════════════════════════════════════════════════════════
// KANTOR + RELASI DIVISI
// ═══════════════════════════════════════════════════════════════

export type Office = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  departmentIds: string[];
  departmentNames: string[];
};

export async function listOffices(): Promise<Office[]> {
  const [rows, links] = await Promise.all([
    db
      .select()
      .from(officeLocations)
      .orderBy(asc(officeLocations.name)),
    db
      .select({
        officeId: departmentLocations.officeLocationId,
        deptId: departmentLocations.departmentId,
        deptName: departments.name,
      })
      .from(departmentLocations)
      .innerJoin(
        departments,
        eq(departmentLocations.departmentId, departments.id),
      ),
  ]);

  return rows.map((o) => {
    const mine = links.filter((l) => l.officeId === o.id);
    return {
      id: o.id,
      name: o.name,
      lat: Number(o.lat),
      lng: Number(o.lng),
      radius: o.radius,
      departmentIds: mine.map((l) => l.deptId),
      departmentNames: mine.map((l) => l.deptName),
    };
  });
}

export async function createOffice(input: {
  name: string;
  lat: number;
  lng: number;
  radius: number;
}): Promise<Office> {
  const [row] = await db
    .insert(officeLocations)
    .values({
      name: input.name,
      lat: String(input.lat),
      lng: String(input.lng),
      radius: input.radius,
    })
    .returning();
  return {
    id: row.id,
    name: row.name,
    lat: Number(row.lat),
    lng: Number(row.lng),
    radius: row.radius,
    departmentIds: [],
    departmentNames: [],
  };
}

export async function updateOffice(
  id: string,
  patch: Partial<{ name: string; lat: number; lng: number; radius: number }>,
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.lat !== undefined) values.lat = String(patch.lat);
  if (patch.lng !== undefined) values.lng = String(patch.lng);
  if (patch.radius !== undefined) values.radius = patch.radius;

  if (Object.keys(values).length > 0) {
    await db.update(officeLocations).set(values).where(eq(officeLocations.id, id));
  }
}

export async function deleteOffice(id: string): Promise<void> {
  await db.delete(officeLocations).where(eq(officeLocations.id, id));
}

/** Hubungkan divisi ke kantor (menggantikan relasi many-to-many manual). */
export async function linkOfficeToDepartment(
  officeId: string,
  deptId: string,
): Promise<void> {
  await db
    .insert(departmentLocations)
    .values({ officeLocationId: officeId, departmentId: deptId })
    .onConflictDoNothing();
}

export async function unlinkOfficeFromDepartment(
  officeId: string,
  deptId: string,
): Promise<void> {
  await db
    .delete(departmentLocations)
    .where(
      and(eq(departmentLocations.officeLocationId, officeId), eq(departmentLocations.departmentId, deptId)),
    );
}

/** Kantor yang boleh dipakai oleh user berdasarkan divisinya. */
export async function officesForDepartment(
  deptId: string | null,
): Promise<Office[]> {
  const all = await listOffices();
  if (!deptId) return all;
  const filtered = all.filter((o) => o.departmentIds.includes(deptId));
  // Kalau divisi belum dipetakan, tetap izinkan semua kantor
  // supaya check-in tidak terkunci total.
  return filtered.length > 0 ? filtered : all;
}

// ═══════════════════════════════════════════════════════════════
// GEO — Haversine (dipindah dari client ke server!)
// ═══════════════════════════════════════════════════════════════

const EARTH_RADIUS_M = 6_371_000;

/** Jarak meter antara dua titik koordinat. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeoVerdict = {
  officeId: string | null;
  officeName: string | null;
  distanceMeters: number | null;
  withinRadius: boolean;
  /** Di luar radius > 500m (penalty tambahan). */
  radiusPenalty: number;
  locationStatus: string;
};

/**
 * Verifikasi lokasi check-in DI SERVER.
 *
 * Dulu seluruh validasi hanya di browser, jadi user bisa mengiri
 * request langsung dengan koordinat palsu / di luar radius.
 * Sekarang server menghitung ulang jarak dan不下 trusting client.
 */
export async function verifyCheckInLocation(params: {
  departmentId: string | null;
  lat: number;
  lng: number;
}): Promise<GeoVerdict> {
  const offices = await officesForDepartment(params.departmentId);

  if (offices.length === 0) {
    return {
      officeId: null,
      officeName: null,
      distanceMeters: null,
      withinRadius: false,
      radiusPenalty: 0,
      locationStatus: "Kantor belum dikonfigurasi",
    };
  }

  let nearest = offices[0];
  let nearestDist = distanceMeters(params, {
    lat: nearest.lat,
    lng: nearest.lng,
  });

  for (const o of offices) {
    const d = distanceMeters(params, { lat: o.lat, lng: o.lng });
    if (d < nearestDist) {
      nearest = o;
      nearestDist = d;
    }
  }

  const withinRadius = nearestDist <= nearest.radius;
  // Dulu: penalty hanya kalau jarak > 500m. Legacy, tapi dipertahankan
  // supaya angka pada slip gaji tidak berubah drastis.
  const radiusPenalty = !withinRadius && nearestDist > 500 ? 2 : 0;

  return {
    officeId: nearest.id,
    officeName: nearest.name,
    distanceMeters: Math.round(nearestDist),
    withinRadius,
    radiusPenalty,
    locationStatus: withinRadius
      ? `Dalam radius ${nearest.name}`
      : `Di luar radius ${nearest.name}`,
  };
}

// ═══════════════════════════════════════════════════════════════
// LOG AUDIT
// ═══════════════════════════════════════════════════════════════

/**
 * Tulis audit log.
 *
 * `actor` diisi dari session server, BUKAN dari input client,
 * supaya log tidak bisa dipalsukan.
 */
export async function writeLog(params: {
  actorId: string;
  action: string;
  targetUserId?: string | null;
  details?: string | null;
}): Promise<void> {
  await db.insert(absensiLogs).values({
    actor: params.actorId,
    action: params.action,
    targetUserId: params.targetUserId ?? null,
    details: params.details ?? null,
    createdAt: new Date(),
  });
}

export async function listLogs(limit = 200): Promise<AbsensiLog[]> {
  const rows = await db
    .select()
    .from(absensiLogs)
    .orderBy(desc(absensiLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    action: r.action,
    targetUserId: r.targetUserId,
    details: r.details,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Nama user untuk ditampilkan di halaman log. */
export async function logActorNames(
  actorIds: string[],
): Promise<Record<string, string>> {
  if (actorIds.length === 0) return {};
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, actorIds));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}