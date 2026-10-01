-- Kolom agama untuk halaman profil staf.
--
-- Kolom profil lain (birth_place, address, phone, emergency_name,
-- emergency_phone) sudah ada di 0000_init.sql dengan bentuk ternormalisasi,
-- jadi tidak perlu migrasi lagi untuk bagian itu.
--
-- Idempotent: aman dijalankan ulang.
ALTER TABLE users ADD COLUMN IF NOT EXISTS religion varchar(32);