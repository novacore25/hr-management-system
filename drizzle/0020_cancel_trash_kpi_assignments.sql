-- Migration 0020: Sinkronisasi status penugasan KPI yang berada di sampah (soft-deleted)
-- Memastikan seluruh assignment dari KPI yang memiliki deleted_at IS NOT NULL
-- ditandai sebagai 'cancelled' agar tidak bocor ke antarmuka pengguna.

UPDATE kpi_assignments ka
SET status = 'cancelled',
    cancelled_at = COALESCE(ka.cancelled_at, NOW()),
    updated_at = NOW()
FROM kpis k
WHERE ka.kpi_id = k.id
  AND k.deleted_at IS NOT NULL
  AND ka.status <> 'cancelled';
