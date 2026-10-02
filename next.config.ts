import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Docker standalone output ──────────────────────────────────
  // Menghasilkan .next/standalone dengan node_modules minimal.
  // Crucial: image jadi ~250MB (bukan 1.4GB seperti railpack default),
  // dan runtime RAM turun dari ~400MB ke ~120MB.
  output: "standalone",

  // ── Folder output build, bukan `.next` ─────────────────────────
  //
  // `next dev` dan `next build` memakai folder yang sama kalau distDir
  // tidak diubah. Kalau `npm run verify:build` dijalankan saat dev
  // server masih hidup, build menimpa chunk yang sedang dipakai dev
  // server — gejalanyablur, Persis seperti punya banyak bug:
  //
  //   - `/_next/static/css/...` dilayani sebagai `text/plain`
  //     ("Refused to apply style ... MIME type")
  //   - Route Handler balas 500 padahal kodenya tidak berubah
  //   - overlay Next.js menampilkan `[object Event]`
  //
  // Build produksi karena itu dipindah ke folder sendiri lewat
  // `NEXT_DIST_DIR` (lihat script `verify:build` di package.json).
  // Docker build TIDAK menyetelnya, jadi tetap memakai `.next` seperti
  // biasanya.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // ── Optimasi build di VPS 2 vCPU ──────────────────────────────
  // Type-check & lint dipindah ke `npm run typecheck` terpisah.
  // Dijalankan SEBELUM docker build, bukan di dalam container.
  // Menghemat 30-90 detik CPU murni yang tidak berkontribusi ke image.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Production server tidak perlu source map (hemat ~30% ukuran image)
  productionBrowserSourceMaps: false,

  // Header keamanan
  poweredByHeader: false,

  // ── Asal dev yang diizinkan ─────────────────────────────────────
  //
  // `localhost` dan `127.0.0.1` dianggap origin BERBEDA oleh browser,
  // padahal menunjuk ke dev server yang sama. Tanpa ini Next.js
  // mencetak "Cross origin request detected from 127.0.0.1 to
  // /_next/* resource" di terminal pada setiap muat halaman — noise yang
  // menyembunyikan masalah asli.
  //
  // 127.0.0.1 dipakai karena cookie httpOnly yang tersisa di profile
  // browser tidak bisa ditimpa dari JavaScript (lihat
  // docs/LOCAL-TESTING.md).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            // Geolokasi wajib untuk fitur absensi check-in
            value: "geolocation=(self), camera=(self), microphone=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
