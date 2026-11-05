ALTER TABLE "overtime_requests" 
  ADD COLUMN IF NOT EXISTS "payout_month" integer,
  ADD COLUMN IF NOT EXISTS "payout_year" integer,
  ADD COLUMN IF NOT EXISTS "payout_status" varchar(32) NOT NULL DEFAULT 'pending_payout',
  ADD COLUMN IF NOT EXISTS "payout_scheduled_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "payout_scheduled_by" varchar(255) REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "overtime_requests_payout_idx" 
  ON "overtime_requests" ("payout_year", "payout_month", "payout_status");

-- Backfill data historis: September 2026 dan sebelumnya yang sudah finalized di-set sebagai 'paid' pada bulan aslinya
UPDATE "overtime_requests"
SET 
  "payout_month" = EXTRACT(MONTH FROM "overtime_date")::integer,
  "payout_year" = EXTRACT(YEAR FROM "overtime_date")::integer,
  "payout_status" = 'paid',
  "payout_scheduled_at" = "updated_at"
WHERE "status" = 'finalized' 
  AND "overtime_date" < '2026-10-01';

-- Data yang belum finalized atau lembur Oktober ke depan default 'pending_payout'
UPDATE "overtime_requests"
SET "payout_status" = 'pending_payout'
WHERE "status" != 'finalized'
   OR ("status" = 'finalized' AND "overtime_date" >= '2026-10-01' AND "payout_month" IS NULL);
