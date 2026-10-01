-- Tabel master untuk tipe upah tambahan
CREATE TABLE IF NOT EXISTS payroll_addition_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tambah kebijakan RLS
ALTER TABLE payroll_addition_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access to payroll_addition_types" ON payroll_addition_types FOR ALL TO authenticated USING (true);

-- Tambah kolom
ALTER TABLE payrolls 
ADD COLUMN IF NOT EXISTS additions_detail JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS overtime_notes TEXT;
