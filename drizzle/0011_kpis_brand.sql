-- Kolom `brand` pada tabel kpis + UNIQUE yang hilang.
--
-- migrated Idempotent: aman dijalankan berulang kali.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. kpis.brand
--
-- Halaman /dashboard/executive/quality sudah `select(..., kpis(..., brand, ...))`
-- dan merender `kpi.brand` beserta warnanya lewat getBrandColor(). Tapi kolomnya
-- tidak pernah ada di schema Drizzle, jadi select itu selalu mengembalikan
-- undefined dan badge brand tidak pernah tampil.
-- Nullable supaya KPI lama tidak perlu diisi.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE kpis
  ADD COLUMN IF NOT EXISTS brand varchar(64);

-- Verifikasi
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'kpis' AND column_name = 'brand';