// ─── Enums ────────────────────────────────────────────────────────────────────

export type KpiRole = "executive" | "hr" | "head" | "tim" | "developer";

export type AbsensiRole = "admin" | "staff";

export type KpiType = "result" | "activity" | "quality" | "lead_tim" | "hr";
export type KpiUnit = "number" | "currency" | "percentage";
export type KpiPeriod = "daily" | "weekly" | "monthly";
export type KpiStatus =
  | "draft"
  | "active"
  | "adjusted"
  | "hold"
  | "cancelled"
  | "completed"
  | "archived";

export type AssignmentStatus = "active" | "hold" | "cancelled" | "completed";

export type PerformanceCategory =
  | "excellent"
  | "good"
  | "warning"
  | "critical";

export type NoteType = "general" | "kpi" | "performance" | "warning";

// ─── Timestamp compat shim ────────────────────────────────────────────────────
// Quality pages build KpiAssignment objects with createdAt/updatedAt as strings.
// This shim lets `string` satisfy the Timestamp interface at runtime.
export interface Timestamp {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
}

// ─── User (maps to public.users table in Supabase) ───────────────────────────

export type AbsensiStatus =
  | "active"
  | "pending"
  | "rejected"
  | "resigned"
  | "deleted";

export interface User {
  id: string;
  name: string;
  email: string;
  kpiRole: KpiRole;
  departmentId: string | null;
  departmentName: string | null;
  department: string | null;
  position: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  managedDepartments?: string[];
  // Absensi fields
  absensiRole: AbsensiRole;
  absensiStatus: AbsensiStatus;
  leaveQuota: number;
  sickQuota: number;
  isHidden: boolean;
}

export function getKpiRole(user: User): KpiRole {
  return user.kpiRole;
}

export function getManagedDepartments(user: User): string[] {
  if (user.kpiRole === "head") {
    if (user.managedDepartments && user.managedDepartments.length > 0) {
      return user.managedDepartments;
    }
    if (user.department) return [user.department];
  }
  return user.department ? [user.department] : [];
}

export function canAccessKpi(_user: User): boolean {
  return true;
}

// ─── KPI ──────────────────────────────────────────────────────────────────────

export interface KPI {
  id: string;
  title: string;
  description: string;
  type: KpiType;
  unit: KpiUnit;
  period: KpiPeriod;
  status: KpiStatus;
  department: string;
  brand?: string;
  createdBy: string;
  monthlyTarget: number;
  year: number;
  month: number;
  hideActual?: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── KPI Assignment ───────────────────────────────────────────────────────────

export interface QualityMonthScore {
  actualTotal: number;
  achievementPercentage: number;
  performanceCategory: PerformanceCategory;
  qualityNotes?: string;
  updatedAt?: string;
}

export interface KpiAssignment {
  id: string;
  kpiId: string;
  userId: string;
  department: string;
  kpiType?: KpiType;
  status: AssignmentStatus;
  weight?: number;
  monthlyTarget: number;
  currentDailyTarget: number;
  actualTotal: number;
  expectedTotal: number;
  achievementPercentage: number;
  performanceCategory: PerformanceCategory;
  workingDaysTotal: number;
  workingDaysElapsed: number;
  workingDaysRemaining: number;
  activeDays: number;
  year: number;
  month: number;
  heldAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  qualityNotes?: string;
  monthlyScores?: Record<string, QualityMonthScore>;
}

// ─── Daily Report ─────────────────────────────────────────────────────────────

export interface DailyReport {
  id: string;
  assignmentId: string;
  kpiId: string;
  userId: string;
  department?: string;
  date: string;
  actualValue: number;
  notes: string;
  isHolidayRollover?: boolean;
  originalDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── KPI History ──────────────────────────────────────────────────────────────

export interface KpiHistory {
  id: string;
  assignmentId: string;
  kpiId: string;
  userId: string;
  eventType:
    | "target_recalculated"
    | "status_changed"
    | "monthly_summary"
    | "assignment_created"
    | "daily_report_submitted";
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown>;
  triggeredBy: string;
  notes: string;
  createdAt: string;
}

// ─── Note ─────────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  type: NoteType;
  title: string;
  content: string;
  authorId: string;
  targetUserId: string | null;
  targetAssignmentId: string | null;
  department: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Performance Summary ──────────────────────────────────────────────────────

export interface PerformanceSummary {
  id: string;
  userId: string;
  department: string;
  year: number;
  month: number;
  assignmentIds: string[];
  averageAchievement: number;
  overallCategory: PerformanceCategory;
  excellentCount: number;
  goodCount: number;
  warningCount: number;
  criticalCount: number;
  consecutiveCriticalMonths: number;
  isFlaggedForReview: boolean;
  resultWeight?: number;
  activityWeight?: number;
  qualityWeight?: number;
  resultAvg?: number;
  activityAvg?: number;
  qualityAvg?: number;
  generatedAt: string;
  createdAt: string;
}

// ─── KPI User Settings (weighted scores) ─────────────────────────────────────

export const DEFAULT_KPI_WEIGHTS = { 
  result: 50, 
  activity: 30, 
  quality: 20,
  leadTim: 50,
  hr: 50
};

export interface KpiUserSettings {
  id: string;
  resultWeight: number;
  activityWeight: number;
  qualityWeight: number;
  leadTimWeight: number;
  hrWeight: number;
  updatedAt: string;
  updatedBy: string;
}

export interface WeightedScore {
  resultAvg: number;
  activityAvg: number;
  qualityAvg: number;
  leadTimAvg: number;
  hrAvg: number;
  resultWeight: number;
  activityWeight: number;
  qualityWeight: number;
  leadTimWeight: number;
  hrWeight: number;
  resultCount: number;
  activityCount: number;
  qualityCount: number;
  leadTimCount: number;
  hrCount: number;
  performanceTotal: number;
  personalityTotal: number;
  total: number;
  category: PerformanceCategory;
}

// ─── UI / Composite Types ─────────────────────────────────────────────────────

export interface KpiAssignmentWithDetails extends KpiAssignment {
  kpi: KPI;
  user: User;
}

export interface DailyReportWithAssignment extends DailyReport {
  assignment: KpiAssignment;
  kpi: KPI;
}

// ─── Form Types ───────────────────────────────────────────────────────────────

export interface DailyReportInput {
  assignmentId: string;
  actualValue: number;
  notes?: string;
  date?: string;
}

export interface KpiCreateInput {
  title: string;
  description: string;
  type: KpiType;
  unit: KpiUnit;
  period: KpiPeriod;
  brand?: string;
  department: string;
  monthlyTarget: number;
  year: number;
  month: number;
  hideActual?: boolean;
}

export interface KpiAssignInput {
  kpiId: string;
  userId: string;
  monthlyTarget: number;
}

// ─── Feedback (laporan bug / usulan fitur) ────────────────────────────────────

export interface Feedback {
  id: string;
  userId: string;
  userName: string;
  department: string;
  role: string;
  type: "bug" | "feature" | "other";
  message: string;
  status: "open" | "in_progress" | "resolved" | "rejected";
  /**
   * ISO string, bukan objek Timestamp.
   *
   * formerly `createdAt` adalah `{ seconds, nanoseconds, toDate() }` —
   * bentuk Supabase. Shape itu TIDAK bisa melewati JSON: fungsi `toDate`
   * hilang saat serialisasi, jadi `f.createdAt?.toDate()` jadi
   * `TypeError: not a function` di browser. Halaman ini sekarang
   * memformat ISO string langsung.
   */
  createdAt: string;
  updatedAt: string;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ==========================================
// SURAT MENYURAT & SLIP GAJI TYPES
// ==========================================

/**
 * Tipe surat (surat menyurat, slipsalary, dsb).
 *
 * Field sudah camelCase mengikuti respons Route Handler, bukan
 * snake_case Supabase.
 */
export interface LetterType {
  id: string;
  name: string;
  code: string;
  templateUrl?: string | null;
  createdAt?: string;
}

/**
 * Surat yang sudah diterbitkan.
 *
 * `letterTypeName` / `letterTypeCode` sudah di-join oleh server, jadi
 * halaman tidak perlu select nested.
 */
export interface CompanyLetter {
  id: string;
  company: 'TNT' | 'HYPE' | 'GOAT' | 'NOVA';
  letterTypeId: string;
  letterTypeName: string;
  letterTypeCode: string;
  runningNumber: number;
  month: string;
  year: number;
  fullNumber: string;
  issuedTo?: string | null;
  issuedToName?: string | null;
  fileUrl?: string | null;
  createdAt: string;
}

export type PayrollCompany = 'TNT' | 'Hype' | 'Nova';

export interface PayrollStaffSetting {
  id: string;
  user_id: string;
  contract_position: string;
  company: PayrollCompany;
  default_base_salary: number;
  default_mobility_allowance: number;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface Payroll {
  id: string;
  user_id: string;
  month: number;
  year: number;
  base_salary: number;
  mobility_allowance: number;
  performance_bonus: number;
  overtime_pay: number;
  deductions: number;
  deduction_notes: string;
  notes?: string | null;
  status: 'draft' | 'published';
  created_at?: string;
  updated_at?: string;
  users?: Partial<User>;
  snapshot_name?: string | null;
  snapshot_position?: string | null;
  snapshot_company?: string | null;
  deductions_detail?: Array<{name: string, amount: number, note?: string}> | null;
  additions_detail?: Array<{name: string, amount: number, note?: string}> | null;
  overtime_notes?: string | null;
  overtime_detail?: PayrollOvertimeDetailItem[] | null;
  system_overtime_minutes?: number | null;
  payroll_overtime_minutes?: number | null;
  overtime_rate?: number | null;
  system_overtime_days?: number | null;
}

export interface PayrollOvertimeDetailItem {
  id?: string;
  date: string; // YYYY-MM-DD
  durationMinutes: number;
  hoursFormatted?: string;
  pay: number;
  dayType?: "weekday" | "weekend" | "holiday";
  maxPayCap?: number | null;
  isCapped?: boolean;
  tasks?: Array<{ id: string; task: string; target?: string }>;
  note?: string;
}

export interface DeductionType {
  id: string;
  name: string;
  created_at?: string;
}

export interface AdditionType {
  id: string;
  name: string;
  created_at?: string;
}

