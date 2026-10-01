-- Fix indeks unik nomor surat + kolom template_url.
--
-- MASALAH: indeks lama ada di (company, year, month, running_number),
-- padahal urutan nomor surat dihitung per (company, letter_type_id, year).
-- Dua tipe surat berbeda di bulan yang sama bisa sama-sama punya
-- running_number = 1 dan bentrok, sehingga surat kedua gagal tersimpan.
--
-- Idempotent: aman dijalankan ulang.

-- 1. Kolom template untuk file DOCX (dipakai Fase 4d / Cloudflare R2).
ALTER TABLE letter_types
  ADD COLUMN IF NOT EXISTS template_url text;

-- 2. Ganti indeks unik ke cakup yang benar.
--   vez lebih dulu dilepas supaya ada existing duplikat tidak memblokir.
DROP INDEX IF EXISTS company_letters_number_unique;

CREATE UNIQUE INDEX IF NOT EXISTS company_letters_number_unique
  ON company_letters USING btree (company, year, letter_type_id, running_number);

-- 3. Index pendukung untuk lookup MAX(running_number).
CREATE INDEX IF NOT EXISTS company_letters_number_lookup_idx
  ON company_letters USING btree (company, year, letter_type_id);