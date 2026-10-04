#!/bin/sh
# Generate SQL migrasi data dari _staging ke tabel tujuan.
#
# SQL-nya DIGENERATE dari katalog PostgreSQL, bukan ditulis tangan.
# Ada 297 kolom di 23 tabel; menulis 297 referensi kolom dengan tangan
# hampir pasti menyisakan satu kesalahan ketik, dan kesalahan ketik
# begitu tidak selalu gagal -- kadang ia mengisi kolom dengan nilai
# kolom lain tanpa suara.
#
# Setiap kolom diberi cast eksplisit ke tipe tujuan. Casting diam-diam
# bisa menutupi pemotongan data, jadi kalau ada nilai yang tidak bisa
# masuk, INSERT harus gagal dan seluruh transaksi dibatalkan.
#
# Dua kolom tidak bisa disalin apa adanya dan dihitung lewat fungsi
# sementara supaya ekspresinya pendek. Ekspresi panjang yang disisipkan
# langsung ke SQL dengan sed hampir selalu bermasalah: tanda kutip,
# baris baru, dan '&' pada replacement semuanya punya arti khusus
# bagi sed.
set -u
DB=vlu8rdt1abda7g69vbiwsk4p
LOCAL=db_hr_system
KELUARAN=/root/migrations/0015_data_migration.sql

# Urutan muat mengikuti ketergantungan foreign key.
URUTAN="departments office_locations letter_types users absensi_settings holidays kpis kpi_assignments kpi_settings kpi_histories daily_reports monthly_scores attendance leave_requests overtime_requests payroll_addition_types payroll_deduction_types payroll_staff_settings payrolls feedbacks absensi_logs company_letters department_locations"

cat > "$KELUARAN" <<'HEADER'
-- 0015_data_migration.sql
--
-- Memindahkan seluruh data dari Supabase ke tabel aplikasi.
--
-- Sumbernya schema _staging, yang isinya sudah diverifikasi identik
-- dengan Supabase pada 23 dari 23 tabel dan 14854 baris, dibandingkan
-- dengan md5 dari seluruh baris yang sudah diurutkan.
--
-- Yang berubah hanya TIPE, bukan isi:
--   uuid -> text/varchar(255)   : kunci asing users
--   text -> enum                 : 12 kolom
--   numeric -> integer           :  9 kolom, dipastikan bulat lebih dulu
--   double precision -> numeric  :  4 kolom koordinat
--   bigint -> numeric            :  7 kolom nominal
--   timestamptz -> date          :  1 kolom
--
-- Dua kolom dihitung, bukan disalin:
--
--   users.managed_departments
--     Di Supabase text[] berisi NAMA divisi, misalnya {HYPE} dan
--     {"MCN & TAP","Project Campaign"}. Di aplikasi kita jsonb berisi
--     UUID. Dikonversi oleh fungsi pg_temp.md_to_uuidjson.
--
--   kpi_assignments.kpi_type
--     Tidak ada di Supabase tapi NOT NULL di aplikasi kita. Diambil
--     dari kpis.type lewat kpi_id, sama seperti cara aplikasi membuat
--     assignment (src/server/dal/assignments.ts: r.kpiType = kpi.type).
--
-- Satu kolom nullable di Supabase tapi NOT NULL di aplikasi:
--
--   payrolls.payroll_overtime_minutes
--     36 dari 71 baris payrolls punya NULL di sini, sedangkan kolom di
--     aplikasi NOT NULL DEFAULT 0. NULL eksplisit yang disalin apa
--     adanya akan melanggar constraint, dan untuk menghindari itu
--     nilainya dibungkus COALESCE dengan default milik aplikasi.
--     Jadi "tidak tercatat" menjadi 0 -- persis yang akan terjadi kalau
--     kolomnya tidak ikut di INSERT sama sekali.
--
--     Sembilan kolom lain punya bentuk yang sama (nullable di staging,
--     NOT NULL di tujuan) tapi tidak punya satu pun baris NULL, jadi
--     COALESCE di situ tidak mengubah apa pun dan hanya ditulis untuk
--     menjaga migrasi tidak gagal kalau nanti muncul NULL.
--
-- Tabel tujuan dikosongkan lebih dulu supaya hasilnya persis sama
-- dengan Supabase tanpa sisa data lama. Data lama di produksi hanya
-- bootstrap (1 user, 3 divisi, 3 letter_types), dan backup sudah dibuat
-- sebelum migrasi ini.
--
-- Satu transaksi. Kalau satu INSERT gagal, tidak ada yang tersimpan.

BEGIN;

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

-- Berhenti lebih awal kalau ada nama divisi yang tidak dikenal, supaya
-- kegagalan terjadi sebelum tabel users terisi separuh.
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

-- text[] berisi nama divisi -> jsonb berisi UUID divisi, urutannya dijaga.
CREATE FUNCTION pg_temp.md_to_uuidjson(nama text[])
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_agg(
           (SELECT d.id::text FROM _staging.departments d WHERE d.name = e.nama)
           ORDER BY e.ord), '[]'::jsonb)
    FROM unnest(nama) WITH ORDINALITY AS e(nama, ord)
   WHERE EXISTS (SELECT 1 FROM _staging.departments d WHERE d.name = e.nama);
$$;
HEADER

for t in $URUTAN; do
  # Kolom yang akan diisi. Selain kolom yang ada di kedua sisi,
  # kpi_assignments.kpi_type ikut karena memang harus diisi walau tidak
  # ada di staging.
  # Cara ini membuat daftar kolom dan daftar nilai dibangun dari satu
  # query yang sama, jadi keduanya tidak mungkin beda panjang.
  KOLOM=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc "
    SELECT string_agg(a.attname, ',' ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = '$t' AND a.attnum > 0
       AND a.attname NOT LIKE 'pg_%'
       AND (a.attname IN (SELECT attname FROM pg_attribute
                           WHERE attrelid = '_staging.$t'::regclass
                             AND attnum > 0 AND attname NOT LIKE 'pg_%')
            OR ('$t' = 'kpi_assignments' AND a.attname = 'kpi_type'));")

  SELEKSI=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc "
    SELECT string_agg(
             CASE
               WHEN '$t' = 'kpi_assignments' AND a.attname = 'kpi_type'
                 THEN 'k.type::kpi_type'
               WHEN '$t' = 'users' AND a.attname = 'managed_departments'
                 THEN 'pg_temp.md_to_uuidjson(s.managed_departments)'
               WHEN a.attnotnull
                AND sa.attnotnull = false
                AND ad.oid IS NOT NULL
                 THEN 'COALESCE(s.' || quote_ident(a.attname) || '::' ||
                      format_type(a.atttypid, a.atttypmod) || ', ' ||
                      pg_get_expr(ad.adbin, ad.adrelid) || ')'
               ELSE 's.' || quote_ident(a.attname) || '::' ||
                    format_type(a.atttypid, a.atttypmod)
             END, ',' ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attribute sa
             ON sa.attrelid = '_staging.$t'::regclass
            AND sa.attname = a.attname
      LEFT JOIN pg_attrdef ad
             ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     WHERE n.nspname = 'public' AND c.relname = '$t' AND a.attnum > 0
       AND a.attname NOT LIKE 'pg_%'
       AND (a.attname IN (SELECT attname FROM pg_attribute
                           WHERE attrelid = '_staging.$t'::regclass
                             AND attnum > 0 AND attname NOT LIKE 'pg_%')
            OR ('$t' = 'kpi_assignments' AND a.attname = 'kpi_type'));")

  # Kolom yang perlu COALESCE dicatat, supaya keputusan ini terlihat
  # dan bukan sekadar muncul di dalam SQL.
  COALESCE_YANG=$(docker exec "$DB" psql -U postgres -d "$LOCAL" -Atc "
    SELECT string_agg(a.attname || ' -> ' || pg_get_expr(ad.adbin, ad.adrelid), '; ')
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attribute sa
             ON sa.attrelid = '_staging.$t'::regclass AND sa.attname = a.attname
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     WHERE n.nspname = 'public' AND c.relname = '$t' AND a.attnum > 0
       AND a.attname NOT LIKE 'pg_%'
       AND a.attnotnull AND sa.attnotnull = false AND ad.oid IS NOT NULL;")
  if [ -n "$COALESCE_YANG" ]; then
    echo "  COALESCE di $t: $COALESCE_YANG"
  fi

  FROM_SQL="FROM _staging.$t s"
  if [ "$t" = "kpi_assignments" ]; then
    FROM_SQL="FROM _staging.kpi_assignments s
  JOIN _staging.kpis k ON k.id = s.kpi_id"
  fi

  {
    echo ""
    echo "-- $t"
    echo "INSERT INTO public.$t ($KOLOM)"
    echo "SELECT $SELEKSI"
    echo "$FROM_SQL;"
  } >> "$KELUARAN"
done

cat >> "$KELUARAN" <<'AKHIR'

COMMIT;
AKHIR

echo "=== 1. Berkas SQL ==="
echo "  INSERT : $(grep -c '^INSERT INTO' "$KELUARAN")"
echo "  baris  : $(wc -l < "$KELUARAN")"

echo ""
echo "=== 2. managed_departments, pastikan bukan casting lagi ==="
sed -n '/^INSERT INTO public.users/,/^FROM _staging.users s;/p' "$KELUARAN" \
  | grep -o 'pg_temp.md_to_uuidjson(s.managed_departments)' | sed 's/^/  ditemukan: /' || true
grep -c 'managed_departments::jsonb' "$KELUARAN" | sed 's/^/  casting langsung tersisa: /'

echo ""
echo "=== 3. kpi_assignments, pastikan kpi_type ada di kolom DAN nilai ==="
sed -n '/^INSERT INTO public.kpi_assignments/,/^FROM _staging.kpi_assignments s/p' "$KELUARAN" \
  | fold -w 106 | sed 's/^/  /'

echo ""
echo "=== 4. Contoh tabel biasa (attendance) ==="
sed -n '/^INSERT INTO public.attendance/,/^FROM _staging.attendance s;/p' "$KELUARAN" \
  | fold -w 106 | sed 's/^/  /'