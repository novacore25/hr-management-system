create table public.letter_types (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  code text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.company_letters (
  id uuid default gen_random_uuid() primary key,
  company text not null,
  letter_type_id uuid references public.letter_types(id) on delete cascade not null,
  running_number integer not null,
  month text not null,
  year integer not null,
  full_number text not null,
  issued_to uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.payrolls (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  month integer not null,
  year integer not null,
  base_salary numeric default 0 not null,
  mobility_allowance numeric default 0 not null,
  performance_bonus numeric default 0 not null,
  overtime_pay numeric default 0 not null,
  status text default 'draft' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.letter_types enable row level security;
alter table public.company_letters enable row level security;
alter table public.payrolls enable row level security;

create policy "letter_types_read" on public.letter_types for select using (true);
create policy "letter_types_write" on public.letter_types for all using (public.my_kpi_role() in ('hr','executive','developer'));

create policy "company_letters_read" on public.company_letters for select using (public.my_kpi_role() in ('hr','executive','developer'));
create policy "company_letters_write" on public.company_letters for all using (public.my_kpi_role() in ('hr','executive','developer'));

create policy "payrolls_read_staff" on public.payrolls for select using (
  (public.my_kpi_role() in ('hr','executive','developer')) or 
  (user_id = auth.uid() and status = 'published')
);
create policy "payrolls_write_hr" on public.payrolls for all using (public.my_kpi_role() in ('hr','executive','developer'));

insert into public.letter_types (name, code) values 
  ('Surat Paklaring', 'PKL'),
  ('Surat NDA Karyawan', 'SP.KMKP'),
  ('Surat Keputusan Cuti', 'SK.PCK');
