-- Migration 0023: Menambahkan kolom emergency_relation pada tabel users
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_relation character varying(50);
