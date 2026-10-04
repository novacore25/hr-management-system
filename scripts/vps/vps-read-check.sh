#!/bin/sh
# Buktikan aplikasi di produksi bisa MEMBACA data yang sudah dimigrasikan.
#
# "%1 Health ok" dan "7 endpoint membalas 401" tidak membuktikan apa pun
# soal data: guard menolak sebelum menyentuh database, dan tidak ada
# trafik yang lewat. AGENTS.md §2.1 -- tidak crash bukan bukti
# berfungsi.
#
# Query di bawah meniru bentuk yang dipakai DAL, termasuk kolom yang
# hasil transformasinya paling rawan:
#   users.managed_departments      text[] -> jsonb
#   kpi_assignments.kpi_type       kolom hasil hitungan
#   leave_requests.status/type     text -> enum
#   attendance.*                   beberapa text -> enum
#   absensi_logs.actor             varchar, berisi nama
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system

jalan() {
  echo ""
  echo "--- $1"
  docker exec "$DB" psql -U postgres -d "$LOCAL" -c "$2" 2>&1 | sed 's/^/    /'
}

echo "=== Query yang dijalankan di dalam database produksi ==="

jalan "1. users: managed_departments(jsonb) + email" \
  "SELECT email, managed_departments FROM public.users
    ORDER BY email LIMIT 3;"

jalan "2. Dua orang yang punya divisi dikelola" \
  "SELECT u.name, u.managed_departments,
          (SELECT count(*) FROM jsonb_array_elements_text(u.managed_departments) e) AS jumlah_divisi
     FROM public.users u
    WHERE u.managed_departments IS NOT NULL AND u.managed_departments <> '[]'::jsonb
    ORDER BY u.name;"

jalan "3. KPI + assignment, termasuk kpi_type hasil hitungan" \
  "SELECT k.title, k.type, a.kpi_type, a.monthly_target, a.achievement_percentage
     FROM public.kpi_assignments a
     JOIN public.kpis k ON k.id = a.kpi_id
    ORDER BY a.year DESC, a.month DESC LIMIT 4;"

jalan "4. leave_requests: enum status dan type" \
  "SELECT status, type, count(*) FROM public.leave_requests
    GROUP BY 1,2 ORDER BY 3 DESC;"

jalan "5. attendance: enum status dan type" \
  "SELECT status, type, count(*) FROM public.attendance
    GROUP BY 1,2 ORDER BY 3 DESC;"

jalan "6. absensi_logs: varchar yang berisi nama" \
  "SELECT actor, count(*) FROM public.absensi_logs GROUP BY 1 ORDER BY 2 DESC LIMIT 4;"

jalan "7. monthly_scores: agregat per bulan" \
  "SELECT year, month, count(*) AS skor,
          round(sum(achievement_percentage)::numeric, 2) AS total_persen
     FROM public.monthly_scores
    GROUP BY 1,2 ORDER BY 1 DESC, 2 DESC LIMIT 4;"

jalan "8. payrolls: komponen gaji terbaca" \
  "SELECT count(*) AS slip, round(sum(base_salary)::numeric,2) AS total_gaji_dasar,
          round(sum(base_salary + mobility_allowance + performance_bonus
                    + overtime_pay - deductions)::numeric,2) AS total_bersih
     FROM public.payrolls;"

jalan "9. Ringkasan akhir semua tabel" \
  "SELECT (SELECT count(*) FROM public.users) AS users,
          (SELECT count(*) FROM public.departments) AS departments,
          (SELECT count(*) FROM public.kpis) AS kpis,
          (SELECT count(*) FROM public.kpi_assignments) AS assignments,
          (SELECT count(*) FROM public.daily_reports) AS laporan,
          (SELECT count(*) FROM public.attendance) AS absensi,
          (SELECT count(*) FROM public.leave_requests) AS cuti,
          (SELECT count(*) FROM public.payrolls) AS gaji;"