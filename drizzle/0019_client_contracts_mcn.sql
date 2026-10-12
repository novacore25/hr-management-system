-- Migration 0019: Master Klien, Kontak Penandatangan, dan Arsip Kontrak PKS MCN

CREATE TABLE IF NOT EXISTS "clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "brand_name" text,
  "entity_type" text NOT NULL DEFAULT 'PT',
  "address" text,
  "phone" text,
  "email" text,
  "bank_name" text,
  "bank_account_no" text,
  "bank_account_name" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "clients_name_idx" ON "clients" ("name");
CREATE INDEX IF NOT EXISTS "clients_brand_idx" ON "clients" ("brand_name");

CREATE TABLE IF NOT EXISTS "client_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "signee_name" text NOT NULL,
  "signee_position" text NOT NULL,
  "signee_basis" text NOT NULL DEFAULT 'Direksi',
  "address" text,
  "phone" text,
  "email" text,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "client_contacts_client_id_idx" ON "client_contacts" ("client_id");

CREATE TABLE IF NOT EXISTS "client_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "letter_id" uuid REFERENCES "company_letters"("id") ON DELETE SET NULL,
  "contract_type" text NOT NULL DEFAULT 'PKS_KLIEN_MCN',
  "contract_number" text NOT NULL,
  "company" text NOT NULL,
  "sign_date" date NOT NULL,
  "start_date" date,
  "end_date" date,
  "contract_value" numeric(15, 2) NOT NULL,
  "tax_type" text NOT NULL DEFAULT 'pph_0_5',
  "tax_amount" numeric(15, 2) NOT NULL DEFAULT 0,
  "total_amount" numeric(15, 2) NOT NULL,
  "program_name" text NOT NULL DEFAULT 'Live Exclusive Creator MCN',
  "platform" text NOT NULL DEFAULT 'TikTok Live',
  "creators" jsonb,
  "total_sessions" integer NOT NULL DEFAULT 20,
  "session_duration" integer NOT NULL DEFAULT 120,
  "bank_details" jsonb,
  "signee_name" text NOT NULL,
  "signee_position" text NOT NULL,
  "client_address" text,
  "tnt_signee_name" text NOT NULL DEFAULT 'RUBEN ARIANTO',
  "tnt_signee_position" text NOT NULL DEFAULT 'DIREKTUR UTAMA',
  "court_jurisdiction" text NOT NULL DEFAULT 'Pengadilan Negeri Tangerang',
  "document_payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "notes" text,
  "created_by" varchar(255) REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "client_contracts_client_id_idx" ON "client_contracts" ("client_id");
CREATE INDEX IF NOT EXISTS "client_contracts_num_idx" ON "client_contracts" ("contract_number");

-- Tambah tipe surat PKS Klien MCN ke tabel letter_types jika belum ada
INSERT INTO "letter_types" ("id", "name", "code", "created_at")
SELECT gen_random_uuid(), 'PKS Klien MCN', 'PKS-TNT', now()
WHERE NOT EXISTS (
  SELECT 1 FROM "letter_types" WHERE "code" IN ('PKS-TNT', 'PKS-MCN')
);
