-- =============================================================================
-- Fix kpi_settings: samakan dengan calcWeightedScore() di src/lib/utils.ts
--
-- Schema lama pakai (quantity_weight, quality_weight, lead_tim_weight, hr_weight).
-- Tapi UI menghitung skor dengan LIMA bobot:
--   result, activity, quality  -> 70% bobot performa
--   leadTim, hr                -> 30% bobot kepribadian
--
-- CATATAN KEAMANAN:
-- Versi pertama file ini melakukan DROP COLUMN lalu ADD COLUMN, dengan
-- asumsi "tabel masih kosong di produksi". Asumsi itu rapuh: begitu
-- tabel berisi, bobot yang tersimpan hilang permanen.
--
-- File ini sekarang ADD-ONLY. Kolom `quantity_weight` sengaja dibiarkan
-- (nullable, tidak dipakai kode mana pun) daripada di-drop, supaya
-- tidak ada data yang hilang. Kalau memang perlu bersih-bersih,
-- jalankan DROP COLUMN secara manual setelah backup.
--
-- Idempotent: aman dijalankan berulang kali.
-- =============================================================================

-- 1) Tambah kolom bobot yang dipakai aplikasi. Kolom lama dibiarkan.
ALTER TABLE "kpi_settings"
  ADD COLUMN IF NOT EXISTS "result_weight"   integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "activity_weight" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "quality_weight"  integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "lead_tim_weight" integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "hr_weight"       integer NOT NULL DEFAULT 50;

-- 2) Kolomvenance: siapa yang mengubah bobot ini.
ALTER TABLE "kpi_settings"
  ADD COLUMN IF NOT EXISTS "updated_by" text REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- 3) quantity_weight dilepas dari kolom NOT NULL supaya tidak jadi
--    wajib diisi saat insert baru. Datanya tetap utuh.
--    Dibungkus DO block karena ALTER COLUMN tidak bisa pakai IF EXISTS,
--    dan kolomnya belum tentu ada di database yang lebih lama.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kpi_settings' AND column_name = 'quantity_weight'
  ) THEN
    ALTER TABLE "kpi_settings" ALTER COLUMN "quantity_weight" DROP NOT NULL;
  END IF;
END $$;

-- Verifikasi: hasil harus memuat kelima bobot.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'kpi_settings'
ORDER BY ordinal_position;