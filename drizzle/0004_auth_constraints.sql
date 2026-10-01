-- Constraint khusus tabel Auth.js.
--
-- Tabel Auth.js (users/accounts/sessions/verification_tokens) TIDAK bisa
-- memakai index callback di src/db/schema.ts karena typing `PgColumn`
-- miliknya bentrok dengan @auth/drizzle-adapter. Jadi constraint-nya
-- ditulis manual di sini.
--
-- Jalankan file ini SETELAH drizzle/0000_init.sql

-- 1. Akun unik per provider (misal: 1 user Google = 1 baris accounts)
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_pk"
  ON "accounts" ("provider", "provider_account_id");

-- 2. Composite primary key untuk verification token
ALTER TABLE "verification_tokens"
  ADD CONSTRAINT "verification_tokens_pk"
  PRIMARY KEY ("identifier", "token");

-- 3. Index untuk lookup session per user
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" ("user_id");

-- 4. Bersihkan sisa unique constraint yang mungkin bentrok
--    (drizzle mungkin sudah generate PK untuk sessions.sessionToken)
