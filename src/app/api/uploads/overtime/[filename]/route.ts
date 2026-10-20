import fs from "fs";
import path from "path";
import { getUploadDir } from "@/server/storage/overtimeProofs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;

  // Cegah directory traversal
  const safeName = path.basename(filename);
  const uploadBase = getUploadDir();
  const filePath = path.join(uploadBase, "overtime", safeName);

  if (!fs.existsSync(filePath)) {
    return new Response("Foto bukti tidak ditemukan.", { status: 404 });
  }

  const ext = path.extname(safeName).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";

  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    console.error("Gagal membaca file foto bukti:", err);
    return new Response("Gagal membaca file foto.", { status: 500 });
  }
}
