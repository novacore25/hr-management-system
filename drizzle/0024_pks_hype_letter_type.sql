-- Migration 0024: Registrasi Tipe Surat Resmi PKS Klien Hype (PKS-HMI)

INSERT INTO "letter_types" ("id", "name", "code", "created_at")
VALUES (gen_random_uuid(), 'PKS Klien Hype', 'PKS-HMI', now())
ON CONFLICT ("code") DO NOTHING;
