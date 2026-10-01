-- ═══════════════════════════════════════════════════════════════
-- Seed data minimal
-- Jalankan SETELAH 0000_init.sql + 0004_auth_constraints.sql
-- ═══════════════════════════════════════════════════════════════

-- ── Divisi ────────────────────────────────────────────────────
-- GANTI dengan daftar divisi asli perusahaan Anda.
-- Baris di bawah hanya placeholder agar dropdown tidak kosong.
INSERT INTO departments (name) VALUES
  ('TNT'),
  ('HYPE'),
  ('NOVA')
ON CONFLICT DO NOTHING;

-- ── Tipe surat ────────────────────────────────────────────────
INSERT INTO letter_types (name, code) VALUES
  ('Surat Paklaring', 'PKL'),
  ('Surat NDA Karyawan', 'SP.KMKP'),
  ('Surat Keputusan Cuti', 'SK.PCK')
ON CONFLICT DO NOTHING;

-- ── Tipe potongan & tambahan gaji ─────────────────────────────
INSERT INTO payroll_deduction_types (name, is_default) VALUES
  ('Potongan BPJS', true),
  ('Potongan withholding tax PPh 21', true),
  ('Kasbon', false),
  ('Sewa mobil', false)
ON CONFLICT DO NOTHING;

INSERT INTO payroll_addition_types (name, is_default) VALUES
  ('Lembur', true),
  ('Bonus performa', true),
  ('Tunjangan transport', false),
  ('Tunjangan pulsa', false)
ON CONFLICT DO NOTHING;

-- ── Setting absensi (baris tunggal) ───────────────────────────
-- Kolom koordinat = fallback Jakarta. NANTI wajib diganti dengan
-- koordinat kantor asli lewat UI /absensi/admin/settings
INSERT INTO absensi_settings (id) VALUES (1)
ON CONFLICT DO NOTHING;

-- ── Verifikasi ────────────────────────────────────────────────
SELECT 'departments' AS tabel, count(*) AS jumlah FROM departments
UNION ALL SELECT 'letter_types',      count(*) FROM letter_types
UNION ALL SELECT 'deduction_types',   count(*) FROM payroll_deduction_types
UNION ALL SELECT 'addition_types',    count(*) FROM payroll_addition_types
UNION ALL SELECT 'absensi_settings',  count(*) FROM absensi_settings;
