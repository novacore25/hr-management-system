CREATE TYPE "public"."absensi_role" AS ENUM('staff', 'admin');--> statement-breakpoint
CREATE TYPE "public"."absensi_status" AS ENUM('active', 'pending', 'rejected', 'resigned', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('active', 'hold', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('on_time', 'late', 'very_late', 'auto_checkout');--> statement-breakpoint
CREATE TYPE "public"."attendance_type" AS ENUM('WFO', 'WFA');--> statement-breakpoint
CREATE TYPE "public"."company" AS ENUM('TNT', 'Hype', 'Nova');--> statement-breakpoint
CREATE TYPE "public"."kpi_period" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."kpi_role" AS ENUM('tim', 'head', 'hr', 'executive', 'developer');--> statement-breakpoint
CREATE TYPE "public"."kpi_type" AS ENUM('result', 'activity', 'quality', 'lead_tim', 'hr');--> statement-breakpoint
CREATE TYPE "public"."kpi_unit" AS ENUM('number', 'currency', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."late_reason_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('leave', 'sick', 'wfa');--> statement-breakpoint
CREATE TYPE "public"."letter_type_category" AS ENUM('PKL', 'SP.KMKP', 'SK.PCK');--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."performance_category" AS ENUM('excellent', 'good', 'warning', 'critical');--> statement-breakpoint
CREATE TABLE "absensi_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" varchar(255) DEFAULT 'SYSTEM' NOT NULL,
	"action" varchar(64) NOT NULL,
	"target_user_id" varchar(255),
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "absensi_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"work_start" varchar(8) DEFAULT '08:00' NOT NULL,
	"work_end" varchar(8) DEFAULT '18:00' NOT NULL,
	"max_late" varchar(8) DEFAULT '08:15' NOT NULL,
	"max_time_sick" varchar(8) DEFAULT '12:00' NOT NULL,
	"max_time_leave" varchar(8) DEFAULT '23:59' NOT NULL,
	"max_time_wfa" varchar(8) DEFAULT '12:00' NOT NULL,
	"office_lat" numeric(12, 8) DEFAULT '-6.241586' NOT NULL,
	"office_lng" numeric(12, 8) DEFAULT '106.628055' NOT NULL,
	"office_radius" integer DEFAULT 100 NOT NULL,
	"last_sync_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"date" date NOT NULL,
	"check_in" time,
	"check_out" time,
	"status" "attendance_status" DEFAULT 'on_time' NOT NULL,
	"type" "attendance_type" DEFAULT 'WFO' NOT NULL,
	"location_in" jsonb,
	"location_status" text,
	"late_fine" integer DEFAULT 0 NOT NULL,
	"late_reason" text DEFAULT '' NOT NULL,
	"late_reason_status" "late_reason_status",
	"radius_penalty" integer DEFAULT 0 NOT NULL,
	"early_checkout" boolean DEFAULT false NOT NULL,
	"early_reason" text DEFAULT '' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company" text NOT NULL,
	"letter_type_id" uuid NOT NULL,
	"running_number" integer NOT NULL,
	"month" text NOT NULL,
	"year" integer NOT NULL,
	"full_number" text NOT NULL,
	"issued_to" varchar(255),
	"file_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"kpi_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"date" date NOT NULL,
	"value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"is_holiday_rollover" boolean DEFAULT false NOT NULL,
	"original_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_locations" (
	"department_id" uuid NOT NULL,
	"office_location_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "kpi_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kpi_id" uuid NOT NULL,
	"kpi_type" "kpi_type" NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"department_id" uuid,
	"monthly_target" numeric(15, 2) DEFAULT '0' NOT NULL,
	"actual_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"achievement_percentage" numeric(7, 2) DEFAULT '0' NOT NULL,
	"expected_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"current_daily_target" numeric(15, 2) DEFAULT '0' NOT NULL,
	"working_days_total" integer DEFAULT 0 NOT NULL,
	"working_days_elapsed" integer DEFAULT 0 NOT NULL,
	"working_days_remaining" integer DEFAULT 0 NOT NULL,
	"active_days" integer DEFAULT 0 NOT NULL,
	"status" "assignment_status" DEFAULT 'active' NOT NULL,
	"performance_category" "performance_category" DEFAULT 'warning' NOT NULL,
	"quality_notes" text,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"held_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"assigned_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_histories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid,
	"user_id" varchar(255),
	"action" varchar(64) NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"triggered_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_settings" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"quantity_weight" integer DEFAULT 60 NOT NULL,
	"quality_weight" integer DEFAULT 40 NOT NULL,
	"lead_tim_weight" integer DEFAULT 0 NOT NULL,
	"hr_weight" integer DEFAULT 0 NOT NULL,
	"updated_by" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "kpi_type" DEFAULT 'result' NOT NULL,
	"unit" "kpi_unit" DEFAULT 'number' NOT NULL,
	"period" "kpi_period" DEFAULT 'monthly' NOT NULL,
	"monthly_target" numeric(15, 2) DEFAULT '0' NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(255),
	"department_id" uuid,
	"deleted_at" timestamp with time zone,
	"hide_actual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"type" "leave_type" NOT NULL,
	"dates" text[] DEFAULT '{}'::text[] NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"processed_by" text,
	"processed_at" timestamp with time zone,
	"deducted_sick" integer DEFAULT 0 NOT NULL,
	"deducted_leave" integer DEFAULT 0 NOT NULL,
	"cancellation_requested" boolean DEFAULT false NOT NULL,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letter_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"actual_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"monthly_target" numeric(15, 2) DEFAULT '0' NOT NULL,
	"achievement_percentage" numeric(7, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"inputted_by" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"lat" numeric(12, 8) NOT NULL,
	"lng" numeric(12, 8) NOT NULL,
	"radius" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"request_date" date NOT NULL,
	"overtime_date" date NOT NULL,
	"requested_start_time" time NOT NULL,
	"requested_end_time" time NOT NULL,
	"requested_duration_minutes" integer DEFAULT 0 NOT NULL,
	"tasks" jsonb,
	"staff_notes" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"approved_start_time" time,
	"approved_end_time" time,
	"approved_duration_minutes" integer,
	"approved_by" varchar(255),
	"approval_date" timestamp with time zone,
	"approval_notes" text,
	"rejection_reason" text,
	"actual_start_time" time,
	"actual_end_time" time,
	"actual_duration_minutes" integer,
	"report_submitted_at" timestamp with time zone,
	"task_reports" jsonb,
	"staff_report_notes" text,
	"proof_images" text[] DEFAULT '{}'::text[],
	"final_duration_minutes" integer,
	"finalized_by" varchar(255),
	"finalized_date" date,
	"final_notes" text,
	"is_holiday" boolean DEFAULT false NOT NULL,
	"day_type" varchar(16) DEFAULT 'weekday' NOT NULL,
	"hourly_base_rate" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_overtime_pay" numeric(15, 2) DEFAULT '0' NOT NULL,
	"calculation_breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_addition_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_deduction_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_staff_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"contract_position" text DEFAULT '' NOT NULL,
	"company" "company" DEFAULT 'Nova' NOT NULL,
	"default_base_salary" numeric(15, 2) DEFAULT '0' NOT NULL,
	"default_mobility_allowance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"notes" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_staff_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "payrolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"base_salary" numeric(15, 2) DEFAULT '0' NOT NULL,
	"mobility_allowance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"performance_bonus" numeric(15, 2) DEFAULT '0' NOT NULL,
	"overtime_pay" numeric(15, 2) DEFAULT '0' NOT NULL,
	"deductions" numeric(15, 2) DEFAULT '0' NOT NULL,
	"deductions_detail" jsonb,
	"additions_detail" jsonb,
	"system_overtime_minutes" integer DEFAULT 0 NOT NULL,
	"payroll_overtime_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_rate" numeric(15, 2),
	"overtime_detail" jsonb,
	"overtime_notes" text,
	"snapshot_name" varchar(255),
	"snapshot_position" text,
	"snapshot_company" "company",
	"notes" text,
	"status" "payroll_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"name" text NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kpi_role" "kpi_role" DEFAULT 'tim' NOT NULL,
	"absensi_role" "absensi_role" DEFAULT 'staff' NOT NULL,
	"absensi_status" "absensi_status" DEFAULT 'pending' NOT NULL,
	"department_id" uuid,
	"position" text,
	"photo_url" text,
	"managed_departments" jsonb DEFAULT '[]'::jsonb,
	"leave_quota" integer DEFAULT 12 NOT NULL,
	"sick_quota" integer DEFAULT 14 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"nik" varchar(32),
	"birth_place" text,
	"birth_date" date,
	"gender" varchar(16),
	"marital_status" varchar(32),
	"address" text,
	"city" varchar(100),
	"province" varchar(100),
	"postal_code" varchar(10),
	"phone" varchar(32),
	"emergency_name" text,
	"emergency_phone" varchar(32),
	"npwp" varchar(32),
	"bank_name" varchar(100),
	"bank_account_number" varchar(64),
	"bank_account_name" varchar(255),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "absensi_logs" ADD CONSTRAINT "absensi_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_letters" ADD CONSTRAINT "company_letters_letter_type_id_letter_types_id_fk" FOREIGN KEY ("letter_type_id") REFERENCES "public"."letter_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_letters" ADD CONSTRAINT "company_letters_issued_to_users_id_fk" FOREIGN KEY ("issued_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_assignment_id_kpi_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."kpi_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_kpi_id_kpis_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_locations" ADD CONSTRAINT "department_locations_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_locations" ADD CONSTRAINT "department_locations_office_location_id_office_locations_id_fk" FOREIGN KEY ("office_location_id") REFERENCES "public"."office_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_assignment_id_kpi_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."kpi_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_kpi_id_kpis_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_assignments" ADD CONSTRAINT "kpi_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_histories" ADD CONSTRAINT "kpi_histories_assignment_id_kpi_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."kpi_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_histories" ADD CONSTRAINT "kpi_histories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_histories" ADD CONSTRAINT "kpi_histories_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_settings" ADD CONSTRAINT "kpi_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_settings" ADD CONSTRAINT "kpi_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_scores" ADD CONSTRAINT "monthly_scores_assignment_id_kpi_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."kpi_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_scores" ADD CONSTRAINT "monthly_scores_inputted_by_users_id_fk" FOREIGN KEY ("inputted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_staff_settings" ADD CONSTRAINT "payroll_staff_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absensi_logs_created_idx" ON "absensi_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_unique" ON "attendance" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "company_letters_number_unique" ON "company_letters" USING btree ("company","year","month","running_number");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_reports_unique" ON "daily_reports" USING btree ("assignment_id","date");--> statement-breakpoint
CREATE INDEX "daily_reports_user_date_idx" ON "daily_reports" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "department_locations_pk" ON "department_locations" USING btree ("department_id","office_location_id");--> statement-breakpoint
CREATE INDEX "feedbacks_assignment_idx" ON "feedbacks" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_assignments_unique" ON "kpi_assignments" USING btree ("user_id","kpi_id","year","month");--> statement-breakpoint
CREATE INDEX "kpi_assignments_user_period_idx" ON "kpi_assignments" USING btree ("user_id","year","month");--> statement-breakpoint
CREATE INDEX "kpi_assignments_dept_period_idx" ON "kpi_assignments" USING btree ("department_id","year","month");--> statement-breakpoint
CREATE INDEX "kpi_histories_assignment_idx" ON "kpi_histories" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "kpis_period_idx" ON "kpis" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "kpis_dept_idx" ON "kpis" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "kpis_deleted_idx" ON "kpis" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "leave_requests_user_status_idx" ON "leave_requests" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_scores_unique" ON "monthly_scores" USING btree ("assignment_id","year","month");--> statement-breakpoint
CREATE INDEX "overtime_requests_user_date_idx" ON "overtime_requests" USING btree ("user_id","overtime_date");--> statement-breakpoint
CREATE INDEX "overtime_requests_status_idx" ON "overtime_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "overtime_requests_date_idx" ON "overtime_requests" USING btree ("overtime_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payrolls_unique" ON "payrolls" USING btree ("user_id","month","year");