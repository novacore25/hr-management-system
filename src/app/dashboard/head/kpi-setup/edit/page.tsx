"use client";

/**
 * formerly halaman ini mengirim `allowedDepartments` dari
 * `AuthContext.user.managedDepartments` ke `KpiFormPage`.
 *
 * Dua masalah sekaligus:
 *
 *   1. **Bocor.** Daftar divisi datang dari state browser. Head tinggal
 *      mengubah nilainya di DevTools lalu membuat KPI untuk divisi mana
 *      pun.
 *   2. **Salah format.** `managedDepartments` berisi **id**, sedangkan
 *      `KpiFormPage` mencocokkannya dengan daftar **nama**. Dua format
 *      berbeda, jadi tidak pernah cocok dan dropdown-nya selalu kosong.
 *
 * Sekarang `KpiFormPage` meminta `GET /api/departments?scope=managed`,
 * dan server yang membaca `users.managed_departments`.
 */
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { KpiFormPage } from "@/components/hr/KpiFormPage";

function EditContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? undefined;

  return <KpiFormPage kpiId={id} backHref="/dashboard/head/kpi-setup" />;
}

export default function HeadEditKpiPage() {
  return (
    <Suspense>
      <EditContent />
    </Suspense>
  );
}