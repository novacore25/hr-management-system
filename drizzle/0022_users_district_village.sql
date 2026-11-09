-- Migration 0022: Menambahkan kolom district (kecamatan) dan village (desa/kelurahan) pada tabel users
ALTER TABLE users ADD COLUMN IF NOT EXISTS district character varying(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS village character varying(100);
