-- =============================================================================
-- Fix kpi_settings: samakan dengan calcWeightedScore() di src/lib/utils.ts
--
-- Schema lama pakai (quantity_weight, quality_weight, lead_tim_weight, hr_weight).
-- Tapi UI menghitung skor dengan LIMA bobot:
--   result, activity, quality  -> 70% bobot performa
--   leadTim, hr                -> 30% bobot kepribadian
--
-- Tabel masih kosong di produksi, jadi aman untuk di-drop & buat ulang.
-- Kalau nanti sudah ada data, jalankan script migrasi data terpisah.
-- =============================================================================

ALTER TABLE "kpi_settings" DROP COLUMN IF EXISTS "quantity_weight";
ALTER TABLE "kpi_settings" DROP COLUMN IF EXISTS "result_weight";
ALTER TABLE "kpi_settings" DROP COLUMN IF EXISTS "activity_weight";
ALTER TABLE "kpi_settings" DROP COLUMN IF EXISTS "quality_weight";
ALTER TABLE "kpi_settings" DROP COLUMN IF EXISTS "lead_tim_weight";
ALTER TABLE "kpi_settings" DROP COLUMN IF EXISTS "hr_weight";
ALTER TABLE "kpi_settings" DROP COLUMN IF EXISTS "updated_by";

ALTER TABLE "kpi_settings"
  ADD COLUMN IF NOT EXISTS "result_weight"   integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "activity_weight" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "quality_weight"  integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "lead_tim_weight" integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "hr_weight"       integer NOT NULL DEFAULT 50;

ALTER TABLE "kpi_settings"
  ADD COLUMN IF NOT EXISTS "updated_by" text REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- Verifikasi
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'kpi_settings'
ORDER BY ordinal_position;