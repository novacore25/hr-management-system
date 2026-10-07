-- 0018_delta_migration_oct7.sql
-- Memindahkan seluruh delta data produksi terkini dari Supabase (_staging) ke public
-- dengan preservasi tabel accounts (Auth.js Google OAuth) dan test users.

BEGIN;

-- 1. Cadangkan accounts & local test users
CREATE TEMP TABLE IF NOT EXISTS accounts_backup AS
  SELECT * FROM public.accounts;

CREATE TEMP TABLE IF NOT EXISTS users_backup AS
  SELECT * FROM public.users
   WHERE email NOT IN (SELECT email FROM _staging.users);

-- 2. Truncate semua 23 tabel aplikasi (CASCADE menghapus FK sementara)
TRUNCATE TABLE
  public.department_locations, public.company_letters, public.absensi_logs,
  public.feedbacks, public.payrolls, public.payroll_staff_settings,
  public.payroll_deduction_types, public.payroll_addition_types,
  public.overtime_requests, public.leave_requests, public.attendance,
  public.monthly_scores, public.daily_reports, public.kpi_histories,
  public.kpi_settings, public.kpi_assignments, public.kpis, public.holidays,
  public.absensi_settings, public.users, public.letter_types,
  public.office_locations, public.departments
  RESTART IDENTITY CASCADE;

-- 3. Validasi nama divisi di managed_departments
DO $$
DECLARE
  tidak_dikenal text;
BEGIN
  SELECT string_agg(DISTINCT e.nama, ', ') INTO tidak_dikenal
    FROM _staging.users u, unnest(u.managed_departments) AS e(nama)
   WHERE NOT EXISTS (SELECT 1 FROM _staging.departments d WHERE d.name = e.nama);
  IF tidak_dikenal IS NOT NULL THEN
    RAISE EXCEPTION
      'managed_departments memuat nama divisi yang tidak dikenal: %', tidak_dikenal;
  END IF;
END $$;

-- 4. Fungsi konversi text[] -> jsonb UUID divisi
CREATE FUNCTION pg_temp.md_to_uuidjson(nama text[])
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_agg(
           (SELECT d.id::text FROM _staging.departments d WHERE d.name = e.nama)
           ORDER BY e.ord), '[]'::jsonb)
    FROM unnest(nama) WITH ORDINALITY AS e(nama, ord)
   WHERE EXISTS (SELECT 1 FROM _staging.departments d WHERE d.name = e.nama);
$$;

-- 5. Insert data 23 tabel

-- departments
INSERT INTO public.departments (id,name,created_at)
SELECT s.id::uuid,s.name::text,s.created_at::timestamp with time zone
FROM _staging.departments s;

-- office_locations
INSERT INTO public.office_locations (id,name,lat,lng,radius,created_at)
SELECT s.id::uuid,s.name::text,s.lat::numeric(12,8),s.lng::numeric(12,8),s.radius::integer,COALESCE(s.created_at::timestamp with time zone, now())
FROM _staging.office_locations s;

-- letter_types
INSERT INTO public.letter_types (id,name,code,created_at,template_url)
SELECT s.id::uuid,s.name::text,s.code::text,s.created_at::timestamp with time zone,s.template_url::text
FROM _staging.letter_types s;

-- users
INSERT INTO public.users (id,email,name,created_at,updated_at,kpi_role,absensi_role,absensi_status,department_id,position,photo_url,managed_departments,leave_quota,sick_quota,is_hidden,nik,npwp,religion,join_date,employment_status,contract_end_date,address_ktp,department,emergency_contact,phone_wa,status,ttl,urgent_balance,urgent_quota)
SELECT s.id::text,s.email::text,s.name::text,s.created_at::timestamp with time zone,s.updated_at::timestamp with time zone,s.kpi_role::kpi_role,s.absensi_role::absensi_role,s.absensi_status::absensi_status,s.department_id::uuid,s."position"::text,s.photo_url::text,pg_temp.md_to_uuidjson(s.managed_departments),s.leave_quota::integer,s.sick_quota::integer,s.is_hidden::boolean,s.nik::character varying(32),s.npwp::character varying(32),s.religion::character varying(32),s.join_date::date,s.employment_status::character varying(32),s.contract_end_date::date,s.address_ktp::text,s.department::text,s.emergency_contact::text,s.phone_wa::text,s.status::text,s.ttl::text,s.urgent_balance::integer,s.urgent_quota::integer
FROM _staging.users s;

-- Pulihkan user test lokal jika ada
INSERT INTO public.users
SELECT * FROM users_backup
ON CONFLICT (id) DO NOTHING;

-- Pulihkan akun OAuth Google
INSERT INTO public.accounts
SELECT * FROM accounts_backup
ON CONFLICT (provider, provider_account_id) DO NOTHING;

-- absensi_settings
INSERT INTO public.absensi_settings (id,work_start,work_end,max_late,max_time_sick,max_time_leave,max_time_wfa,office_lat,office_lng,office_radius,last_sync_date,updated_at,default_urgent_quota,last_urgent_reset_month)
SELECT s.id::integer,s.work_start::character varying(8),s.work_end::character varying(8),s.max_late::character varying(8),s.max_time_sick::character varying(8),s.max_time_leave::character varying(8),s.max_time_wfa::character varying(8),s.office_lat::numeric(12,8),s.office_lng::numeric(12,8),s.office_radius::integer,s.last_sync_date::date,s.updated_at::timestamp with time zone,s.default_urgent_quota::integer,s.last_urgent_reset_month::text
FROM _staging.absensi_settings s;

-- holidays
INSERT INTO public.holidays (id,date,description,created_at)
SELECT s.id::uuid,s.date::date,s.description::text,s.created_at::timestamp with time zone
FROM _staging.holidays s;

-- kpis
INSERT INTO public.kpis (id,title,description,type,unit,period,monthly_target,year,month,status,created_by,department_id,deleted_at,hide_actual,created_at,updated_at,brand,category,department)
SELECT s.id::uuid,s.title::text,s.description::text,s.type::kpi_type,s.unit::kpi_unit,s.period::kpi_period,s.monthly_target::numeric(15,2),s.year::integer,s.month::integer,s.status::character varying(32),s.created_by::character varying(255),s.department_id::uuid,s.deleted_at::timestamp with time zone,COALESCE(s.hide_actual::boolean, false),s.created_at::timestamp with time zone,s.updated_at::timestamp with time zone,s.brand::character varying(64),s.category::character varying(32),s.department::text
FROM _staging.kpis s;

-- kpi_assignments
INSERT INTO public.kpi_assignments (id,kpi_id,kpi_type,user_id,department_id,monthly_target,actual_total,achievement_percentage,expected_total,current_daily_target,working_days_total,working_days_elapsed,working_days_remaining,active_days,status,performance_category,quality_notes,year,month,held_at,cancelled_at,completed_at,assigned_by,created_at,updated_at,notes,weight)
SELECT s.id::uuid,s.kpi_id::uuid,k.type::kpi_type,s.user_id::character varying(255),s.department_id::uuid,s.monthly_target::numeric(15,2),s.actual_total::numeric(20,6),s.achievement_percentage::numeric(15,2),COALESCE(s.expected_total::numeric(15,2), '0'::numeric),COALESCE(s.current_daily_target::numeric(15,2), '0'::numeric),COALESCE(s.working_days_total::integer, 0),COALESCE(s.working_days_elapsed::integer, 0),COALESCE(s.working_days_remaining::integer, 0),COALESCE(s.active_days::integer, 0),s.status::assignment_status,COALESCE(s.performance_category::performance_category, 'warning'::performance_category),s.quality_notes::text,s.year::integer,s.month::integer,s.held_at::timestamp with time zone,s.cancelled_at::timestamp with time zone,s.completed_at::timestamp with time zone,s.assigned_by::character varying(255),s.created_at::timestamp with time zone,s.updated_at::timestamp with time zone,s.notes::text,s.weight::numeric
FROM _staging.kpi_assignments s
  JOIN _staging.kpis k ON k.id = s.kpi_id;

-- kpi_settings
INSERT INTO public.kpi_settings (user_id,updated_at,result_weight,activity_weight,quality_weight,lead_tim_weight,hr_weight,updated_by,id,quantity_weight)
SELECT s.user_id::character varying(255),s.updated_at::timestamp with time zone,s.result_weight::integer,s.activity_weight::integer,s.quality_weight::integer,s.lead_tim_weight::integer,s.hr_weight::integer,s.updated_by::text,s.id::uuid,s.quantity_weight::numeric
FROM _staging.kpi_settings s;

-- kpi_histories
INSERT INTO public.kpi_histories (id,assignment_id,user_id,action,old_value,new_value,created_at)
SELECT s.id::uuid,s.assignment_id::uuid,s.user_id::character varying(255),s.action::character varying(64),s.old_value::jsonb,s.new_value::jsonb,s.created_at::timestamp with time zone
FROM _staging.kpi_histories s;

-- daily_reports
INSERT INTO public.daily_reports (id,assignment_id,kpi_id,user_id,date,value,notes,created_at,updated_at)
SELECT s.id::uuid,s.assignment_id::uuid,s.kpi_id::uuid,s.user_id::character varying(255),s.date::date,s.value::numeric(20,6),s.notes::text,s.created_at::timestamp with time zone,s.updated_at::timestamp with time zone
FROM _staging.daily_reports s;

-- monthly_scores
INSERT INTO public.monthly_scores (id,assignment_id,year,month,actual_total,monthly_target,achievement_percentage,inputted_by,created_at,updated_at,quality_notes)
SELECT s.id::uuid,s.assignment_id::uuid,s.year::integer,s.month::integer,s.actual_total::numeric(15,2),s.monthly_target::numeric(15,2),s.achievement_percentage::numeric(7,2),s.inputted_by::character varying(255),s.created_at::timestamp with time zone,s.updated_at::timestamp with time zone,s.quality_notes::text
FROM _staging.monthly_scores s;

-- attendance
INSERT INTO public.attendance (id,user_id,date,check_in,check_out,status,type,location_in,location_status,late_fine,late_reason,late_reason_status,radius_penalty,early_checkout,early_reason,notes,created_at,updated_at)
SELECT s.id::uuid,s.user_id::character varying(255),s.date::date,s.check_in::time without time zone,s.check_out::time without time zone,s.status::attendance_status,s.type::attendance_type,s.location_in::jsonb,s.location_status::text,s.late_fine::integer,s.late_reason::text,s.late_reason_status::late_reason_status,s.radius_penalty::integer,s.early_checkout::boolean,s.early_reason::text,s.notes::text,s.created_at::timestamp with time zone,s.updated_at::timestamp with time zone
FROM _staging.attendance s;

-- leave_requests
INSERT INTO public.leave_requests (id,user_id,type,dates,reason,status,processed_by,processed_at,deducted_sick,deducted_leave,cancellation_requested,cancellation_reason,created_at,updated_at,deducted_urgent,executive_status,executive_approved_by,executive_approved_by_name,executive_approved_at,executive_notes,hr_status,hr_approved_by,hr_approved_by_name,hr_approved_at,hr_notes,rejection_stage,rejection_reason,rejected_by,rejected_at)
SELECT s.id::uuid,s.user_id::character varying(255),s.type::leave_type,s.dates::text[],s.reason::text,s.status::leave_status,s.processed_by::text,s.processed_at::timestamp with time zone,s.deducted_sick::integer,s.deducted_leave::integer,s.cancellation_requested::boolean,s.cancellation_reason::text,s.created_at::timestamp with time zone,s.updated_at::timestamp with time zone,s.deducted_urgent::integer,s.executive_status::text,s.executive_approved_by::character varying(255),s.executive_approved_by_name::text,s.executive_approved_at::timestamp with time zone,s.executive_notes::text,s.hr_status::text,s.hr_approved_by::character varying(255),s.hr_approved_by_name::text,s.hr_approved_at::timestamp with time zone,s.hr_notes::text,s.rejection_stage::text,s.rejection_reason::text,s.rejected_by::text,s.rejected_at::timestamp with time zone
FROM _staging.leave_requests s;

-- overtime_requests
INSERT INTO public.overtime_requests (id,user_id,request_date,overtime_date,requested_start_time,requested_end_time,requested_duration_minutes,tasks,staff_notes,status,approved_start_time,approved_end_time,approved_duration_minutes,approved_by,approval_date,approval_notes,rejection_reason,actual_start_time,actual_end_time,actual_duration_minutes,report_submitted_at,task_reports,staff_report_notes,proof_images,final_duration_minutes,finalized_by,finalized_date,final_notes,is_holiday,day_type,hourly_base_rate,total_overtime_pay,calculation_breakdown,created_at,updated_at,first_hour_rate,first_hour_pay,subsequent_hour_rate,subsequent_hour_pay)
SELECT s.id::uuid,s.user_id::character varying(255),s.request_date::date,s.overtime_date::date,s.requested_start_time::time without time zone,s.requested_end_time::time without time zone,s.requested_duration_minutes::integer,s.tasks::jsonb,s.staff_notes::text,s.status::character varying(32),s.approved_start_time::time without time zone,s.approved_end_time::time without time zone,s.approved_duration_minutes::integer,s.approved_by::character varying(255),s.approval_date::timestamp with time zone,s.approval_notes::text,s.rejection_reason::text,s.actual_start_time::time without time zone,s.actual_end_time::time without time zone,s.actual_duration_minutes::integer,s.report_submitted_at::timestamp with time zone,s.task_reports::jsonb,s.staff_report_notes::text,s.proof_images::text[],s.final_duration_minutes::integer,s.finalized_by::character varying(255),s.finalized_date::date,s.final_notes::text,COALESCE(s.is_holiday::boolean, false),COALESCE(s.day_type::character varying(16), 'weekday'::character varying),COALESCE(s.hourly_base_rate::numeric(15,2), '0'::numeric),COALESCE(s.total_overtime_pay::numeric(15,2), '0'::numeric),s.calculation_breakdown::jsonb,COALESCE(s.created_at::timestamp with time zone, now()),COALESCE(s.updated_at::timestamp with time zone, now()),s.first_hour_rate::numeric,s.first_hour_pay::numeric,s.subsequent_hour_rate::numeric,s.subsequent_hour_pay::numeric
FROM _staging.overtime_requests s;

-- payroll_addition_types
INSERT INTO public.payroll_addition_types (id,name,created_at)
SELECT s.id::uuid,s.name::text,COALESCE(s.created_at::timestamp with time zone, now())
FROM _staging.payroll_addition_types s;

-- payroll_deduction_types
INSERT INTO public.payroll_deduction_types (id,name,created_at)
SELECT s.id::uuid,s.name::text,s.created_at::timestamp with time zone
FROM _staging.payroll_deduction_types s;

-- payroll_staff_settings
INSERT INTO public.payroll_staff_settings (id,user_id,contract_position,company,default_base_salary,default_mobility_allowance,notes,created_at,updated_at)
SELECT s.id::uuid,s.user_id::character varying(255),s.contract_position::text,s.company::company,COALESCE(s.default_base_salary::numeric(15,2), '0'::numeric),COALESCE(s.default_mobility_allowance::numeric(15,2), '0'::numeric),s.notes::text,COALESCE(s.created_at::timestamp with time zone, now()),COALESCE(s.updated_at::timestamp with time zone, now())
FROM _staging.payroll_staff_settings s;

-- payrolls
INSERT INTO public.payrolls (id,user_id,month,year,base_salary,mobility_allowance,performance_bonus,overtime_pay,deductions,deductions_detail,additions_detail,system_overtime_minutes,payroll_overtime_minutes,overtime_rate,overtime_detail,overtime_notes,snapshot_name,snapshot_position,snapshot_company,notes,status,created_at,updated_at,deduction_notes)
SELECT s.id::uuid,s.user_id::character varying(255),s.month::integer,s.year::integer,COALESCE(s.base_salary::numeric(15,2), '0'::numeric),COALESCE(s.mobility_allowance::numeric(15,2), '0'::numeric),COALESCE(s.performance_bonus::numeric(15,2), '0'::numeric),COALESCE(s.overtime_pay::numeric(15,2), '0'::numeric),COALESCE(s.deductions::numeric(15,2), '0'::numeric),s.deductions_detail::jsonb,s.additions_detail::jsonb,COALESCE(s.system_overtime_minutes::integer, 0),COALESCE(s.payroll_overtime_minutes::integer, 0),s.overtime_rate::numeric(15,2),s.overtime_detail::jsonb,s.overtime_notes::text,s.snapshot_name::character varying(255),s.snapshot_position::text,s.snapshot_company::company,s.notes::text,COALESCE(s.status::payroll_status, 'draft'::payroll_status),COALESCE(s.created_at::timestamp with time zone, now()),COALESCE(s.updated_at::timestamp with time zone, now()),s.deduction_notes::text
FROM _staging.payrolls s;

-- feedbacks
INSERT INTO public.feedbacks (id,user_id,message,status,created_at,updated_at,user_name,department,role,type)
SELECT s.id::uuid,s.user_id::character varying(255),s.message::text,s.status::character varying(32),s.created_at::timestamp with time zone,s.updated_at::timestamp with time zone,s.user_name::text,s.department::text,s.role::character varying(32),s.type::character varying(16)
FROM _staging.feedbacks s;

-- absensi_logs
INSERT INTO public.absensi_logs (id,actor,action,target_user_id,details,created_at)
SELECT s.id::uuid,s.actor::character varying(255),s.action::character varying(64),s.target_user_id::character varying(255),s.details::text,s.created_at::timestamp with time zone
FROM _staging.absensi_logs s;

-- company_letters
INSERT INTO public.company_letters (id,company,letter_type_id,running_number,month,year,full_number,issued_to,file_url,created_at)
SELECT s.id::uuid,s.company::text,s.letter_type_id::uuid,s.running_number::integer,s.month::text,s.year::integer,s.full_number::text,s.issued_to::character varying(255),s.file_url::text,s.created_at::timestamp with time zone
FROM _staging.company_letters s;

-- department_locations
INSERT INTO public.department_locations (department_id,office_location_id,created_at)
SELECT s.department_id::uuid,s.office_location_id::uuid,s.created_at::timestamp with time zone
FROM _staging.department_locations s;

COMMIT;
