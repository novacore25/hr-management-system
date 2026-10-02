"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * formerly redirect ke `/dashboard/developer/import` — halaman Import KPI
 * CSV yang sudah dihapus.
 *
 * Sekarang diarahkan ke Laporan Bug & Fitur, satu-satunya halaman
 * developer yang tersisa.
 */
export default function DeveloperPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/developer/feedbacks");
  }, [router]);

  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
