import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Docker standalone output ──────────────────────────────────
  // Menghasilkan .next/standalone dengan node_modules minimal.
  // Crucial: image jadi ~250MB (bukan 1.4GB seperti railpack default),
  // dan runtime RAM turun dari ~400MB ke ~120MB.
  output: "standalone",

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
  productionServerSourceMaps: false,
  productionBrowserSourceMaps: false,

  // Header keamanan
  poweredByHeader: false,
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
