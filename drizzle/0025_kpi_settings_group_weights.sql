-- Migration 0025: Tambah kolom bobot rasio grup (performance_weight & personality_weight) ke kpi_settings
-- Memungkinkan rasio pilar Performance vs Personality di-custom bebas (default 70% dan 30%).

ALTER TABLE "kpi_settings"
  ADD COLUMN IF NOT EXISTS "performance_weight" integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS "personality_weight" integer NOT NULL DEFAULT 30;

COMMENT ON COLUMN "kpi_settings"."performance_weight" IS 'Bobot pilar grup Performance (0-100, default 70). Bersama personality_weight harus berjumlah 100.';
COMMENT ON COLUMN "kpi_settings"."personality_weight" IS 'Bobot pilar grup Personality (0-100, default 30). Bersama performance_weight harus berjumlah 100.';
