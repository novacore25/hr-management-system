import type { AbsensiRole, AbsensiStatus } from "./index";

// ─── Attendance ───────────────────────────────────────────────────────────────

export type AttendanceStatus = "on_time" | "late" | "very_late" | "auto_checkout";
export type AttendanceType = "WFO" | "WFA";
export type LateReasonStatus = "pending" | "accepted" | "rejected";

export interface Attendance {
  id: string;
  userId: string;
  date: string;           // YYYY-MM-DD
  checkIn: string | null; // HH:MM
  checkOut: string | null;
  status: AttendanceStatus;
  type: AttendanceType;
  locationIn: { lat: number; lng: number } | null;
  locationStatus: string | null;
  lateFine: number;
  lateReason: string;
  lateReasonStatus: LateReasonStatus | null;
  radiusPenalty: number;
  earlyCheckout: boolean;
  earlyReason: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Leave Request ────────────────────────────────────────────────────────────

/**
 * Tipe cuti.
 *
 * `urgent` (cuti mendesak) DITERIMA tapi tidak ditawarkan di form.
 * Fitur ini pernah ada lalu dihapus kebijakan HR; nilainya tetap
 * mungkin muncul pada data historis yang dimigrasi dari Supabase.
 * Tanpa dia, satu baris historis itu akan gagal dimuat.
 *
 * Bandingkan dengan aplikasi yang masih jalan di Supabase --
 * `LeaveRequestType` di sana juga TIDAK punya `urgent`, jadi bentuk
 * form kita sama persis.
 */
export type LeaveRequestType = "leave" | "sick" | "wfa" | "urgent";

/**
 * Status cuti, termasuk tahap antara persetujuan 2 tahap:
 * `pending` -> `approved_executive` -> `approved`.
 *
 * `approved_executive` berarti sudah disetujui eksekutif, menunggu
 * HR sebagai persetujuan final. Tanpa status ini, tahap 1 tidak
 * punya tempat untuk berhenti dan pengajuan akan langsung lompat ke
 * final -- persetujuan 2 tahap berubah jadi 1 tahap tanpa error.
 */
export type LeaveRequestStatus =
  | "pending"
  | "approved_executive"
  | "approved"
  | "rejected"
  | "cancelled";

export interface LeaveRequest {
  id: string;
  userId: string;
  type: LeaveRequestType;
  dates: string[];       // ['YYYY-MM-DD', ...]
  reason: string;
  status: LeaveRequestStatus;
  processedBy: string | null;
  processedAt: string | null;
  deductedSick: number;
  deductedLeave: number;
  cancellationRequested: boolean;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Nama & divisi pemohon, dari join di DAL.
   *
   * formerly `toLeaveRequest()` membuangnya — jadi semua halaman cuti
   * menampilkan "Unknown" untuk nama pemohon. Select-nya sudah mengambil
   * kedua kolom, cuma tidak diteruskan.
   */
  userName?: string | null;
  departmentName?: string | null;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AbsensiSettings {
  workStart: string;     // HH:MM
  workEnd: string;
  maxLate: string;
  maxTimeSick: string;
  maxTimeLeave: string;
  maxTimeWfa: string;
  officeLat: number;
  officeLng: number;
  officeRadius: number;
  lastSyncDate: string | null;
}

// ─── Holiday ──────────────────────────────────────────────────────────────────

export interface Holiday {
  id: string;
  date: string;          // YYYY-MM-DD
  description: string;
}

// ─── Log ─────────────────────────────────────────────────────────────────────

export interface AbsensiLog {
  id: string;
  actor: string;
  action: string;
  targetUserId: string | null;
  details: string | null;
  createdAt: string;
}

// ─── AbsensiUser (public.users with absensi columns) ─────────────────────────

export interface AbsensiUser {
  id: string;
  name: string;
  email: string;
  department: string | null;
  departmentId: string | null;
  absensiRole: AbsensiRole;
  absensiStatus: AbsensiStatus;
  leaveQuota: number;
  sickQuota: number;
  isHidden: boolean;
}

// ─── DB row helpers (snake_case → camelCase) ──────────────────────────────────

export function rowToAttendance(row: Record<string, unknown>): Attendance {
  return {
    id:               row.id as string,
    userId:           row.user_id as string,
    date:             row.date as string,
    checkIn:          row.check_in as string | null,
    checkOut:         row.check_out as string | null,
    status:           row.status as AttendanceStatus,
    type:             row.type as AttendanceType,
    locationIn:       row.location_in as { lat: number; lng: number } | null,
    locationStatus:   row.location_status as string | null,
    lateFine:         (row.late_fine as number) ?? 0,
    lateReason:       (row.late_reason as string) ?? "",
    lateReasonStatus: row.late_reason_status as LateReasonStatus | null,
    radiusPenalty:    (row.radius_penalty as number) ?? 0,
    earlyCheckout:    (row.early_checkout as boolean) ?? false,
    earlyReason:      (row.early_reason as string) ?? "",
    notes:            row.notes as string | null,
    createdAt:        row.created_at as string,
    updatedAt:        row.updated_at as string,
  };
}

export function rowToLeaveRequest(row: Record<string, unknown>): LeaveRequest {
  return {
    id:                    row.id as string,
    userId:                row.user_id as string,
    type:                  row.type as LeaveRequestType,
    dates:                 (row.dates as string[]) ?? [],
    reason:                (row.reason as string) ?? "",
    status:                row.status as LeaveRequestStatus,
    processedBy:           row.processed_by as string | null,
    processedAt:           row.processed_at as string | null,
    deductedSick:          (row.deducted_sick as number) ?? 0,
    deductedLeave:         (row.deducted_leave as number) ?? 0,
    cancellationRequested: (row.cancellation_requested as boolean) ?? false,
    cancellationReason:    row.cancellation_reason as string | null,
    createdAt:             row.created_at as string,
    updatedAt:             row.updated_at as string,
  };
}

export function rowToAbsensiUser(row: Record<string, unknown>): AbsensiUser {
  const deptName = (row.departments as { name: string } | null)?.name ?? null;
  return {
    id:            row.id as string,
    name:          row.name as string,
    email:         row.email as string,
    department:    deptName,
    departmentId:  row.department_id as string | null,
    absensiRole:   (row.absensi_role as AbsensiRole) ?? "staff",
    absensiStatus: (row.absensi_status as AbsensiStatus) ?? "pending",
    leaveQuota:    (row.leave_quota as number) ?? 12,
    sickQuota:     (row.sick_quota as number) ?? 14,
    isHidden:      (row.is_hidden as boolean) ?? false,
  };
}

export function rowToSettings(row: Record<string, unknown>): AbsensiSettings {
  return {
    workStart:     (row.work_start as string) ?? "08:00",
    workEnd:       (row.work_end as string) ?? "18:00",
    maxLate:       (row.max_late as string) ?? "08:15",
    maxTimeSick:   (row.max_time_sick as string) ?? "12:00",
    maxTimeLeave:  (row.max_time_leave as string) ?? "23:59",
    maxTimeWfa:    (row.max_time_wfa as string) ?? "12:00",
    officeLat:     (row.office_lat as number) ?? -6.241586,
    officeLng:     (row.office_lng as number) ?? 106.628055,
    officeRadius:  (row.office_radius as number) ?? 100,
    lastSyncDate:  row.last_sync_date as string | null,
  };
}

// ─── Overtime ─────────────────────────────────────────────────────────────────

export type OvertimeStatus = "pending" | "approved" | "rejected" | "reported" | "finalized" | "cancelled";

export interface OvertimeTask {
  id: string;
  task: string;
  target: string;
  note?: string;
}

export interface OvertimeTaskReport {
  id: string;
  task: string;
  target: string;
  actualResult: string;
  progress: number; // 0 - 100
  status: "completed" | "partial" | "not_completed";
  note?: string;
}

export interface OvertimeRequest {
  id: string;
  userId: string;
  requestDate: string; // YYYY-MM-DD
  overtimeDate: string; // YYYY-MM-DD
  
  // Requested
  requestedStartTime: string; // HH:MM
  requestedEndTime: string;   // HH:MM
  requestedDurationMinutes: number;
  tasks: OvertimeTask[];
  staffNotes: string | null;

  // Approval HR
  status: OvertimeStatus;
  approvedStartTime: string | null;
  approvedEndTime: string | null;
  approvedDurationMinutes: number | null;
  approvedBy: string | null;
  approvalDate: string | null;
  approvalNotes: string | null;
  rejectionReason: string | null;

  // Actual Execution & Report
  actualStartTime: string | null;
  actualEndTime: string | null;
  actualDurationMinutes: number | null;
  reportSubmittedAt: string | null;
  taskReports: OvertimeTaskReport[] | null;
  staffReportNotes: string | null;
  proofImages?: string[];

  // Final Decision HR
  finalDurationMinutes: number | null;
  finalizedBy: string | null;
  finalizedDate: string | null;
  finalNotes: string | null;

  // Pay Calculation & Rates
  isHoliday?: boolean;
  dayType?: "weekday" | "weekend" | "holiday";
  hourlyBaseRate?: number | null;
  firstHourRate?: number | null;
  firstHourPay?: number | null;
  subsequentHourRate?: number | null;
  subsequentHourPay?: number | null;
  totalOvertimePay?: number | null;
  calculationBreakdown?: Record<string, any> | null;

  createdAt: string;
  updatedAt: string;

  // Relation joins
  userName?: string;
  userDepartment?: string;
  userPosition?: string;
}

export function rowToOvertimeRequest(row: Record<string, unknown>): OvertimeRequest {
  const u = row.users as Record<string, unknown> | null;
  const dept = u?.departments as Record<string, unknown> | null;
  return {
    id:                       row.id as string,
    userId:                   row.user_id as string,
    requestDate:              row.request_date as string,
    overtimeDate:             row.overtime_date as string,
    requestedStartTime:       ((row.requested_start_time as string) ?? "").substring(0, 5),
    requestedEndTime:         ((row.requested_end_time as string) ?? "").substring(0, 5),
    requestedDurationMinutes: (row.requested_duration_minutes as number) ?? 0,
    tasks:                    (row.tasks as OvertimeTask[]) ?? [],
    staffNotes:               row.staff_notes as string | null,
    status:                   (row.status as OvertimeStatus) ?? "pending",
    approvedStartTime:        row.approved_start_time ? (row.approved_start_time as string).substring(0, 5) : null,
    approvedEndTime:          row.approved_end_time ? (row.approved_end_time as string).substring(0, 5) : null,
    approvedDurationMinutes:  row.approved_duration_minutes as number | null,
    approvedBy:               row.approved_by as string | null,
    approvalDate:             row.approval_date as string | null,
    approvalNotes:            row.approval_notes as string | null,
    rejectionReason:          row.rejection_reason as string | null,
    actualStartTime:          row.actual_start_time ? (row.actual_start_time as string).substring(0, 5) : null,
    actualEndTime:            row.actual_end_time ? (row.actual_end_time as string).substring(0, 5) : null,
    actualDurationMinutes:    row.actual_duration_minutes as number | null,
    reportSubmittedAt:        row.report_submitted_at as string | null,
    taskReports:              (row.task_reports as OvertimeTaskReport[]) ?? null,
    staffReportNotes:         row.staff_report_notes as string | null,
    proofImages:              (row.proof_images as string[]) ?? [],
    finalDurationMinutes:     row.final_duration_minutes as number | null,
    finalizedBy:              row.finalized_by as string | null,
    finalizedDate:            row.finalized_date as string | null,
    finalNotes:               row.final_notes as string | null,
    isHoliday:                (row.is_holiday as boolean) ?? false,
    dayType:                  (row.day_type as "weekday" | "weekend" | "holiday") ?? "weekday",
    hourlyBaseRate:           (row.hourly_base_rate as number) ?? null,
    firstHourRate:            (row.first_hour_rate as number) ?? null,
    firstHourPay:             (row.first_hour_pay as number) ?? null,
    subsequentHourRate:       (row.subsequent_hour_rate as number) ?? null,
    subsequentHourPay:        (row.subsequent_hour_pay as number) ?? null,
    totalOvertimePay:         (row.total_overtime_pay as number) ?? null,
    calculationBreakdown:     (row.calculation_breakdown as Record<string, any>) ?? null,
    createdAt:                row.created_at as string,
    updatedAt:                row.updated_at as string,
    userName:                 u?.name as string | undefined,
    userDepartment:           dept?.name as string | undefined,
    userPosition:             u?.position as string | undefined,
  };
}

