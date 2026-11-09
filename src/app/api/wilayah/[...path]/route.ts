import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Proxy internal untuk data wilayah Indonesia (Provinsi, Kota/Kab, Kecamatan, Kelurahan).
 * 
 * Mengapa proxy?
 * 1. Menghindari mixed-content error di browser (GitHub Pages redirect ke HTTP).
 * 2. Menghindari CORS & latensi eksternal dari client.
 * 3. Menyediakan server-side cache untuk respon instan dan hemat bandwidth.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  if (!path || path.length === 0) {
    return NextResponse.json({ error: "Path wilayah diperlukan" }, { status: 400 });
  }

  const joinedPath = path.join("/");
  // Hanya izinkan karakter path aman (alfanumerik, garis bawah, strip, titik, garis miring)
  if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(joinedPath) || joinedPath.includes("..")) {
    return NextResponse.json({ error: "Format path tidak valid" }, { status: 400 });
  }

  const upstreamUrl = `https://www.emsifa.com/api-wilayah-indonesia/api/${joinedPath}`;

  try {
    const res = await fetch(upstreamUrl, {
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Gagal mengambil data wilayah dari upstream" },
        { status: res.status },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
