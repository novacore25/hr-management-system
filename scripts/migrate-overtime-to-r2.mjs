import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import pg from "pg";

const endpoint = process.env.R2_ENDPOINT || "https://d110b5c3b985834992d4958b8250270d.r2.cloudflarestorage.com";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "b47c386638d549d16669130537d7bc29";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "f6769f43627d8c2ee63256a5bb8016f82b585b5abbc8a96d769e75dfad3a47d0";
const bucket = process.env.R2_BUCKET || "novacore-overtime-proofs";
const publicUrl = (process.env.R2_PUBLIC_URL || "https://penyimpanan.novacorex.tech").replace(/\/+$/, "");

const s3 = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

async function main() {
  console.log("=== MIGRASI FOTO BUKTI LEMBUR KE CLOUDFLARE R2 ===");
  console.log(`Bucket: ${bucket}`);
  console.log(`Public URL: ${publicUrl}`);

  const possiblePaths = [
    "/app/data/uploads/overtime",
    "/var/lib/docker/volumes/rredcbao7tqz34pkqeelf8xx-overtime-uploads/_data/overtime",
    path.join(process.cwd(), "data", "uploads", "overtime"),
  ];

  let sourceDir = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      sourceDir = p;
      break;
    }
  }

  if (!sourceDir) {
    console.error("Direktori file upload lokal tidak ditemukan di path:", possiblePaths);
    process.exit(1);
  }

  console.log(`Membaca file dari: ${sourceDir}`);
  const files = fs.readdirSync(sourceDir).filter(f => !f.startsWith("."));
  console.log(`Ditemukan ${files.length} file lokal.`);

  let uploaded = 0;
  let skipped = 0;

  for (const filename of files) {
    const fullPath = path.join(sourceDir, filename);
    const key = `overtime/${filename}`;

    let exists = false;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      skipped++;
      continue;
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const contentType = mimeMap[ext] || "image/jpeg";
    const fileBuffer = fs.readFileSync(fullPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    uploaded++;
    if (uploaded % 10 === 0 || uploaded === files.length) {
      console.log(`Progress upload: ${uploaded} / ${files.length}`);
    }
  }

  console.log(`\nSelesai Upload: ${uploaded} diunggah, ${skipped} sudah ada di R2.`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("DATABASE_URL tidak diset, lewati update database.");
    return;
  }

  console.log("\nMemperbarui URL foto di PostgreSQL...");
  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    const res = await pool.query(`
      UPDATE overtime_requests
      SET proof_images = (
        SELECT array_agg(
          CASE 
            WHEN item LIKE '/api/uploads/overtime/%' THEN '${publicUrl}/overtime/' || substring(item from '/api/uploads/overtime/(.*)')
            ELSE item
          END
        )
        FROM unnest(proof_images) AS item
      )
      WHERE proof_images::text LIKE '%/api/uploads/overtime/%'
      RETURNING id;
    `);

    console.log(`Berhasil memperbarui ${res.rowCount} baris pengajuan lembur di database.`);
  } finally {
    await pool.end();
  }

  console.log("\n=== MIGRASI SELESAI DENGAN SUKSES! ===");
}

main().catch(err => {
  console.error("Migrasi gagal:", err);
  process.exit(1);
});
