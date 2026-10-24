-- Migration 0018: Sinkronisasi managed_departments untuk user bertipe Head
-- Bila seorang Head memiliki penempatan divisi (department_id) tetapi managed_departments masih NULL atau kosong [],
-- otomatis set managed_departments = jsonb_build_array(department_id).

UPDATE users
SET managed_departments = jsonb_build_array(department_id),
    updated_at = NOW()
WHERE kpi_role = 'head'
  AND department_id IS NOT NULL
  AND (managed_departments IS NULL OR jsonb_array_length(managed_departments) = 0);
