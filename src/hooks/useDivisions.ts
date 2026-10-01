"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";

/**
 * Daftar divisi.
 * Data dari server (src/server/dal/departments.ts).
 */
export function useDepartments() {
  const [departments, setDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await apiFetch<{ names: string[] }>("/api/departments?names=1");
      setDepartments(res.names ?? []);
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Gagal memuat daftar divisi.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  usePolling(refetch, 60_000);

  return { departments, isLoading, error };
}

/** Daftar divisi dengan id — untuk form yang butuh department_id. */
export function useDepartmentsWithId() {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await apiFetch<{ departments: { id: string; name: string }[] }>(
        "/api/departments",
      );
      setItems(res.departments ?? []);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  usePolling(refetch, 60_000);

  return { departments: items, isLoading };
}
