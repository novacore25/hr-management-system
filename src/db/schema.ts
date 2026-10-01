/**
 * NovaCore HR Management System — Drizzle Schema
 *
 * Sumber: supabase/schema.sql + absensi-schema.sql + payroll-schema.sql
 *        + supabase/migrations/*.sql
 *
 * CATATAN PENTING SOAL AUTENTIKASI:
 * Schema ini TIDAK memakai `auth.users` Supabase. Autentikasi ditangani
 * Auth.js v5, tabelnya ada di bawah (`users`, `accounts`, `sessions`,
 * `verificationTokens`). `users.id` = Auth.js user id (text UUID).
 *
 * ATURAN KERAS:
 * - File ini hanya boleh di-import dari `src/db/` dan `src/server/`.
 * - DILARANG di-import dari `src/app/` atau `src/components/`.
 *   Browser TIDAK BOLEH menyentuh database. Semua lewat DAL.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  date,
  time,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════

/** Sistem KPI: hierarki developer > executive > hr > head > tim */
export const kpiRoleEnum = pgEnum("kpi_role", [
  "tim",
  "head",
  "hr",
  "executive",
  "developer",
]);

/** Sistem absensi: sumbu INDEPENDEN dari kpi_role (lihat catatan Phase 0) */
export const absensiRoleEnum = pgEnum("absensi_role", ["staff", "admin"]);

export const absensiStatusEnum = pgEnum("absensi_status", [
  "active",
  "pending",
  "rejected",
  "resigned",
  "deleted",
]);

export const kpiTypeEnum = pgEnum("kpi_type", [
  "result",
  "activity",
  "quality",
  "lead_tim",
  "hr",
]);

export const kpiUnitEnum = pgEnum("kpi_unit", [
  "number",
  "currency",
  "percentage",
]);

export const kpiPeriodEnum = pgEnum("kpi_period", [
  "daily",
  "weekly",
  "monthly",
]);

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "active",
  "hold",
  "cancelled",
  "completed",
]);

export const performanceCategoryEnum = pgEnum("performance_category", [
  "excellent",
  "good",
  "warning",
  "critical",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "on_time",
  "late",
  "very_late",
  "auto_checkout",
]);

export const attendanceTypeEnum = pgEnum("attendance_type", ["WFO", "WFA"]);

export const lateReasonStatusEnum = pgEnum("late_reason_status", [
  "pending",
  "accepted",
  "rejected",
]);

export const leaveTypeEnum = pgEnum("leave_type", ["leave", "sick", "wfa"]);

export const leaveStatusEnum = pgEnum("leave_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const payrollStatusEnum = pgEnum("payroll_status", ["draft", "published"]);

export const companyEnum = pgEnum("company", ["TNT", "Hype", "Nova"]);

export const letterTypeCategoryEnum = pgEnum("letter_type_category", [
  "PKL",
  "SP.KMKP",
  "SK.PCK",
]);

// ═══════════════════════════════════════════════════════════════
// AUTH.JS v5 TABLES
// Di-generate otomatis oleh Auth.js. JANGAN ubah struktur kolomnya.
// ═══════════════════════════════════════════════════════════════

export const users = pgTable("users", {
  // Sama dengan Auth.js user id
  // CATATAN: kolom Auth.js WAJIB tipe `text`, bukan `varchar`,
  // supaya cocok dengan DefaultPostgresUsersTable.
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  name: text("name").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  // ── Profil ──────────────────────────────────────────────────
  kpiRole: kpiRoleEnum("kpi_role").notNull().default("tim"),
  absensiRole: absensiRoleEnum("absensi_role").notNull().default("staff"),
  absensiStatus: absensiStatusEnum("absensi_status").notNull().default("pending"),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  position: text("position"),
  photoUrl: text("photo_url"),
  managedDepartments: jsonb("managed_departments").$type<string[]>().default([]),

  // ── Absensi ─────────────────────────────────────────────────
  leaveQuota: integer("leave_quota").notNull().default(12),
  sickQuota: integer("sick_quota").notNull().default(14),
  isHidden: boolean("is_hidden").notNull().default(false),

  // ── Profil HR (dipakai halaman /absensi/profile) ───────────
  nik: varchar("nik", { length: 32 }),
  birthPlace: text("birth_place"),
  birthDate: date("birth_date"),
  gender: varchar("gender", { length: 16 }),
  religion: varchar("religion", { length: 32 }),
  maritalStatus: varchar("marital_status", { length: 32 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  province: varchar("province", { length: 100 }),
  postalCode: varchar("postal_code", { length: 10 }),
  phone: varchar("phone", { length: 32 }),
  emergencyName: text("emergency_name"),
  emergencyPhone: varchar("emergency_phone", { length: 32 }),
  npwp: varchar("npwp", { length: 32 }),
  bankName: varchar("bank_name", { length: 100 }),
  bankAccountNumber: varchar("bank_account_number", { length: 64 }),
  bankAccountName: varchar("bank_account_name", { length: 255 }),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
);
// CATATAN: composite unique (provider, provider_account_id) dibuat lewat
// SQL di drizzle/0004_auth_constraints.sql — Auth.js mensyaratkan tabelnya
// tanpa index callback demi kompatibilitas tipe adapter.

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
);
// Index sessions_user_idx dibuat di drizzle/0004_auth_constraints.sql

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
);
// Composite PK (identifier, token) dibuat di drizzle/0004_auth_constraints.sql

// ═══════════════════════════════════════════════════════════════
// ORGANISASI
// ═══════════════════════════════════════════════════════════════

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// MODUL KPI
// ═══════════════════════════════════════════════════════════════

export const kpis = pgTable(
  "kpis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    type: kpiTypeEnum("type").notNull().default("result"),
    unit: kpiUnitEnum("unit").notNull().default("number"),
    period: kpiPeriodEnum("period").notNull().default("monthly"),

    /**
     * INVARIAN KRITIS:
     * kpis.monthlyTarget = TOTAL target untuk KPI ini (jumlah semua assignee)
     * kpi_assignments.monthlyTarget = target PER ORANG
     * Jangan pernah konversi keduanya.
     */
    monthlyTarget: numeric("monthly_target", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),

    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    createdBy: varchar("created_by", { length: 255 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),

    // Soft delete: null = aktif
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    hideActual: boolean("hide_actual").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    periodIdx: index("kpis_period_idx").on(t.year, t.month),
    deptIdx: index("kpis_dept_idx").on(t.departmentId),
    deletedIdx: index("kpis_deleted_idx").on(t.deletedAt),
  }),
);

export const kpiAssignments = pgTable(
  "kpi_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kpiId: uuid("kpi_id")
      .notNull()
      .references(() => kpis.id, { onDelete: "cascade" }),
    /** Denormalisasi dari KPI —/history tidak berubah */
    kpiType: kpiTypeEnum("kpi_type").notNull(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),

    /** Target PER ORANG */
    monthlyTarget: numeric("monthly_target", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),

    actualTotal: numeric("actual_total", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),

    /**
     * ⚠️ INI PACE RATE, BUKAN COMPLETION RATE!
     * = (actual_total / expectedTotal) * 100
     * expectedTotal = monthlyTarget / workingDaysTotal * workingDaysElapsed
     *
     * UI harus menampilkan COMPLETION = actual_total / monthly_target * 100
     * (dihitung client-side), bukan kolom ini.
     */
    achievementPercentage: numeric("achievement_percentage", {
      precision: 7,
      scale: 2,
    })
      .notNull()
      .default("0"),

    expectedTotal: numeric("expected_total", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    currentDailyTarget: numeric("current_daily_target", {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default("0"),

    workingDaysTotal: integer("working_days_total").notNull().default(0),
    workingDaysElapsed: integer("working_days_elapsed").notNull().default(0),
    workingDaysRemaining: integer("working_days_remaining").notNull().default(0),
    activeDays: integer("active_days").notNull().default(0),

    status: assignmentStatusEnum("status").notNull().default("active"),
    performanceCategory: performanceCategoryEnum("performance_category")
      .notNull()
      .default("warning"),

    qualityNotes: text("quality_notes"),

    year: integer("year").notNull(),
    month: integer("month").notNull(),

    heldAt: timestamp("held_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    assignedBy: varchar("assigned_by", { length: 255 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /** Mencegah assignment duplikat untuk KPI+user+periode yang sama */
    uniquePeriod: uniqueIndex("kpi_assignments_unique").on(
      t.userId,
      t.kpiId,
      t.year,
      t.month,
    ),
    userPeriodIdx: index("kpi_assignments_user_period_idx").on(
      t.userId,
      t.year,
      t.month,
    ),
    deptPeriodIdx: index("kpi_assignments_dept_period_idx").on(
      t.departmentId,
      t.year,
      t.month,
    ),
  }),
);

export const dailyReports = pgTable(
  "daily_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => kpiAssignments.id, { onDelete: "cascade" }),
    kpiId: uuid("kpi_id")
      .notNull()
      .references(() => kpis.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    value: numeric("value", { precision: 15, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    isHolidayRollover: boolean("is_holiday_rollover").notNull().default(false),
    originalDate: date("original_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /** Cegah double input per assignment per tanggal */
    uniquePerDay: uniqueIndex("daily_reports_unique").on(t.assignmentId, t.date),
    userDateIdx: index("daily_reports_user_date_idx").on(t.userId, t.date),
  }),
);

export const monthlyScores = pgTable(
  "monthly_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => kpiAssignments.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    actualTotal: numeric("actual_total", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    monthlyTarget: numeric("monthly_target", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    /** Untuk KPI quality: completion rate (bukan pace) */
    achievementPercentage: numeric("achievement_percentage", {
      precision: 7,
      scale: 2,
    })
      .notNull()
      .default("0"),
    notes: text("notes"),
    inputtedBy: varchar("inputted_by", { length: 255 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniquePeriod: uniqueIndex("monthly_scores_unique").on(
      t.assignmentId,
      t.year,
      t.month,
    ),
  }),
);

/**
 * Bobot skor per user.
 *
 * Lima kolom ini HARUS sama persis dengan yang dipakai
 * calcWeightedScore() di src/lib/utils.ts:
 *   result, activity, quality  -> 70% bobot performa
 *   leadTim, hr                -> 30% bobot kepribadian
 */
export const kpiSettings = pgTable("kpi_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  resultWeight: integer("result_weight").notNull().default(50),
  activityWeight: integer("activity_weight").notNull().default(30),
  qualityWeight: integer("quality_weight").notNull().default(20),
  leadTimWeight: integer("lead_tim_weight").notNull().default(50),
  hrWeight: integer("hr_weight").notNull().default(50),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const kpiHistories = pgTable(
  "kpi_histories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").references(
      () => kpiAssignments.id,
      { onDelete: "cascade" },
    ),
    userId: varchar("user_id", { length: 255 }).references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    triggeredBy: varchar("triggered_by", { length: 255 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    assignmentIdx: index("kpi_histories_assignment_idx").on(t.assignmentId),
  }),
);

export const feedbacks = pgTable(
  "feedbacks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => kpiAssignments.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    assignmentIdx: index("feedbacks_assignment_idx").on(t.assignmentId),
  }),
);

// ═══════════════════════════════════════════════════════════════
// MODUL ABSENSI
// ═══════════════════════════════════════════════════════════════

export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    checkIn: time("check_in"),
    checkOut: time("check_out"),
    status: attendanceStatusEnum("status").notNull().default("on_time"),
    type: attendanceTypeEnum("type").notNull().default("WFO"),
    locationIn: jsonb("location_in").$type<{
      lat: number;
      lng: number;
      accuracy?: number;
      capturedAt?: string;
      locationName?: string;
    }>(),
    locationStatus: text("location_status"),
    /** Disimpan sebagai MENIT KETERLAMBATAN, bukan nominal rupiah */
    lateFine: integer("late_fine").notNull().default(0),
    lateReason: text("late_reason").notNull().default(""),
    lateReasonStatus: lateReasonStatusEnum("late_reason_status"),
    radiusPenalty: integer("radius_penalty").notNull().default(0),
    earlyCheckout: boolean("early_checkout").notNull().default(false),
    earlyReason: text("early_reason").notNull().default(""),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /** Cegah absen ganda per hari */
    uniquePerDay: uniqueIndex("attendance_unique").on(t.userId, t.date),
    dateIdx: index("attendance_date_idx").on(t.date),
  }),
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: leaveTypeEnum("type").notNull(),
    dates: text("dates").array().notNull().default(sql`'{}'::text[]`),
    reason: text("reason").notNull().default(""),
    status: leaveStatusEnum("status").notNull().default("pending"),
    processedBy: text("processed_by"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    deductedSick: integer("deducted_sick").notNull().default(0),
    deductedLeave: integer("deducted_leave").notNull().default(0),
    cancellationRequested: boolean("cancellation_requested")
      .notNull()
      .default(false),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userStatusIdx: index("leave_requests_user_status_idx").on(
      t.userId,
      t.status,
    ),
  }),
);

export const holidays = pgTable("holidays", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const absensiSettings = pgTable("absensi_settings", {
  id: integer("id").primaryKey().default(1),
  workStart: varchar("work_start", { length: 8 }).notNull().default("08:00"),
  workEnd: varchar("work_end", { length: 8 }).notNull().default("18:00"),
  maxLate: varchar("max_late", { length: 8 }).notNull().default("08:15"),
  maxTimeSick: varchar("max_time_sick", { length: 8 }).notNull().default("12:00"),
  maxTimeLeave: varchar("max_time_leave", { length: 8 }).notNull().default("23:59"),
  maxTimeWfa: varchar("max_time_wfa", { length: 8 }).notNull().default("12:00"),
  officeLat: numeric("office_lat", { precision: 12, scale: 8 })
    .notNull()
    .default("-6.241586"),
  officeLng: numeric("office_lng", { precision: 12, scale: 8 })
    .notNull()
    .default("106.628055"),
  officeRadius: integer("office_radius").notNull().default(100),
  lastSyncDate: date("last_sync_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const absensiLogs = pgTable(
  "absensi_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**actor = auth.uid() — bukan input dari client (anti-palsu audit log) */
    actor: varchar("actor", { length: 255 }).notNull().default("SYSTEM"),
    action: varchar("action", { length: 64 }).notNull(),
    targetUserId: varchar("target_user_id", { length: 255 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    createdIdx: index("absensi_logs_created_idx").on(t.createdAt),
  }),
);

export const officeLocations = pgTable("office_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  lat: numeric("lat", { precision: 12, scale: 8 }).notNull(),
  lng: numeric("lng", { precision: 12, scale: 8 }).notNull(),
  radius: integer("radius").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const departmentLocations = pgTable(
  "department_locations",
  {
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    officeLocationId: uuid("office_location_id")
      .notNull()
      .references(() => officeLocations.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: uniqueIndex("department_locations_pk").on(
      t.departmentId,
      t.officeLocationId,
    ),
  }),
);

// ═══════════════════════════════════════════════════════════════
// MODUL LEMBUR
// ═══════════════════════════════════════════════════════════════

export const overtimeRequests = pgTable(
  "overtime_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // ── Tahap 1: Pengajuan ────────────────────────────────────
    requestDate: date("request_date").notNull(),
    overtimeDate: date("overtime_date").notNull(),
    requestedStartTime: time("requested_start_time").notNull(),
    requestedEndTime: time("requested_end_time").notNull(),
    requestedDurationMinutes: integer("requested_duration_minutes")
      .notNull()
      .default(0),
    tasks: jsonb("tasks").$type<Array<{ name: string; detail?: string }>>(),
    staffNotes: text("staff_notes"),

    // ── Tahap 2: Persetujuan jadwal ───────────────────────────
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    approvedStartTime: time("approved_start_time"),
    approvedEndTime: time("approved_end_time"),
    approvedDurationMinutes: integer("approved_duration_minutes"),
    approvedBy: varchar("approved_by", { length: 255 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    approvalDate: timestamp("approval_date", { withTimezone: true }),
    approvalNotes: text("approval_notes"),
    rejectionReason: text("rejection_reason"),

    // ── Tahap 3: Laporan hasil kerja ──────────────────────────
    actualStartTime: time("actual_start_time"),
    actualEndTime: time("actual_end_time"),
    actualDurationMinutes: integer("actual_duration_minutes"),
    reportSubmittedAt: timestamp("report_submitted_at", { withTimezone: true }),
    taskReports: jsonb("task_reports").$type<
      Array<{ name: string; detail?: string }>
    >(),
    staffReportNotes: text("staff_report_notes"),
    /** URL foto bukti — nanti pindah ke Cloudflare R2 */
    proofImages: text("proof_images").array().default(sql`'{}'::text[]`),

    // ── Tahap 4: Finalisasi & hitung gaji ─────────────────────
    finalDurationMinutes: integer("final_duration_minutes"),
    finalizedBy: varchar("finalized_by", { length: 255 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    finalizedDate: date("finalized_date"),
    finalNotes: text("final_notes"),

    isHoliday: boolean("is_holiday").notNull().default(false),
    dayType: varchar("day_type", { length: 16 }).notNull().default("weekday"),
    hourlyBaseRate: numeric("hourly_base_rate", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    totalOvertimePay: numeric("total_overtime_pay", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    calculationBreakdown: jsonb("calculation_breakdown").$type<{
      baseSalary?: number;
      hourlyBaseRate?: number;
      multiplier?: number;
      isOverride?: boolean;
      maxPayCap?: number;
      budgetSaved?: number;
      depnFormula?: string;
    }>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userDateIdx: index("overtime_requests_user_date_idx").on(
      t.userId,
      t.overtimeDate,
    ),
    statusIdx: index("overtime_requests_status_idx").on(t.status),
    dateIdx: index("overtime_requests_date_idx").on(t.overtimeDate),
  }),
);

// ═══════════════════════════════════════════════════════════════
// MODUL PAYROLL
// ═══════════════════════════════════════════════════════════════

export const payrollStaffSettings = pgTable("payroll_staff_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  contractPosition: text("contract_position").notNull().default(""),
  company: companyEnum("company").notNull().default("Nova"),
  defaultBaseSalary: numeric("default_base_salary", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  defaultMobilityAllowance: numeric("default_mobility_allowance", {
    precision: 15,
    scale: 2,
  })
    .notNull()
    .default("0"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const payrolls = pgTable(
  "payrolls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),

    baseSalary: numeric("base_salary", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    mobilityAllowance: numeric("mobility_allowance", {
      precision: 15,
      scale: 2,
    })
      .notNull()
      .default("0"),
    performanceBonus: numeric("performance_bonus", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    overtimePay: numeric("overtime_pay", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),

    deductions: numeric("deductions", { precision: 15, scale: 2 })
      .notNull()
      .default("0"),
    deductionsDetail: jsonb("deductions_detail").$type<
      Array<{ type: string; name: string; amount: number }>
    >(),
    additionsDetail: jsonb("additions_detail").$type<
      Array<{ type: string; name: string; amount: number }>
    >(),

    systemOvertimeMinutes: integer("system_overtime_minutes").notNull().default(0),
    payrollOvertimeMinutes: integer("payroll_overtime_minutes")
      .notNull()
      .default(0),
    overtimeRate: numeric("overtime_rate", { precision: 15, scale: 2 }),
    overtimeDetail: jsonb("overtime_detail").$type<
      Array<{
        overtimeId: string;
        date: string;
        dayType: string;
        minutes: number;
        amount: number;
      }>
    >(),
    overtimeNotes: text("overtime_notes"),

    // Snapshot —agar slip gaji tidak berubah消 jika data karyawan berubah
    snapshotName: varchar("snapshot_name", { length: 255 }),
    snapshotPosition: text("snapshot_position"),
    snapshotCompany: companyEnum("snapshot_company"),

    notes: text("notes"),
    status: payrollStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniquePeriod: uniqueIndex("payrolls_unique").on(t.userId, t.month, t.year),
  }),
);

export const payrollDeductionTypes = pgTable("payroll_deduction_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const payrollAdditionTypes = pgTable("payroll_addition_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// MODUL SURAT
// ═══════════════════════════════════════════════════════════════

export const letterTypes = pgTable("letter_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const companyLetters = pgTable(
  "company_letters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    company: text("company").notNull(),
    letterTypeId: uuid("letter_type_id")
      .notNull()
      .references(() => letterTypes.id, { onDelete: "cascade" }),
    runningNumber: integer("running_number").notNull(),
    month: text("month").notNull(),
    year: integer("year").notNull(),
    fullNumber: text("full_number").notNull(),
    issuedTo: varchar("issued_to", { length: 255 }).references(() => users.id, {
      onDelete: "set null",
    }),
    fileUrl: text("file_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueNumber: uniqueIndex("company_letters_number_unique").on(
      t.company,
      t.year,
      t.month,
      t.runningNumber,
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type Kpi = typeof kpis.$inferSelect;
export type KpiAssignment = typeof kpiAssignments.$inferSelect;
export type Attendance = typeof attendance.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type OvertimeRequest = typeof overtimeRequests.$inferSelect;
export type Payroll = typeof payrolls.$inferSelect;
export type KpiRole = (typeof kpiRoleEnum.enumValues)[number];
export type AbsensiRole = (typeof absensiRoleEnum.enumValues)[number];
