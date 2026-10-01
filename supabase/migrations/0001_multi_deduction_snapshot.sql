-- 1. Create table for Payroll Deduction Types
CREATE TABLE IF NOT EXISTS public.payroll_deduction_types (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(name)
);

-- Enable RLS for the new table
ALTER TABLE public.payroll_deduction_types ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and insert
CREATE POLICY "Allow authenticated read access for payroll_deduction_types" ON public.payroll_deduction_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert access for payroll_deduction_types" ON public.payroll_deduction_types FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Add columns to payrolls table
ALTER TABLE public.payrolls 
ADD COLUMN IF NOT EXISTS snapshot_name TEXT,
ADD COLUMN IF NOT EXISTS snapshot_position TEXT,
ADD COLUMN IF NOT EXISTS snapshot_company TEXT,
ADD COLUMN IF NOT EXISTS deductions_detail JSONB;
