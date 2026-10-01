"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, withQuery, ApiError } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";
import type { User } from "@/types";

/**
 * Data user sekarang datang dari Route Handler (server),
 * bukan langsung dari database. Lihat src/server/dal/users.ts
 * untuk aturan aksesnya.
 */

function useUsersQuery<T>(
  path: string | null,
  deps: unknown[],
): { data: T | null; isLoading: boolean; error: string | null; refetch: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!path) {
      setData(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await apiFetch<T>(path);
      setData(res);
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Gagal memuat data dari server.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setIsLoading(true);
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  usePolling(refetch);

  return { data, isLoading, error, refetch };
}

/**
 * Member divisi yang dikelola Head, plus Head-nya sendiri.
 *
 * Tidak menerima daftar divisi dari pemanggil — server yang membacanya dari
 * `users.managed_departments`. Halaman lama mengirim daftar itu dari
 * AuthContext, jadi bisa dimanipulasi di browser.
 */
export function useManagedMembers() {
  const { data, isLoading, error } = useUsersQuery<{ users: User[] }>(
    "/api/users?scope=managed",
    [],
  );

  return { members: data?.users ?? [], isLoading, error };
}

/** Member sebuah atau beberapa divisi. */
export function useDivisionMembers(department: string | string[] | undefined) {
  const deptNames = Array.isArray(department) ? department : department ? [department] : [];
  const key = deptNames.join(",");

  const path =
    deptNames.length > 0
      ? withQuery("/api/users", { department: key })
      : null;

  const { data, isLoading, error } = useUsersQuery<{ users: User[] }>(
    path,
    [key],
  );

  return {
    members: data?.users ?? [],
    isLoading,
    error,
  };
}

/** Semua user aktif. */
export function useAllUsers() {
  const { data, isLoading, error, refetch } = useUsersQuery<{ users: User[] }>(
    "/api/users?scope=active",
    [],
  );

  return { users: data?.users ?? [], isLoading, error, refetch };
}

/** Semua user tanpa filter — butuh role HR/Executive. */
export function useAllUsersAdmin() {
  const { data, isLoading, error } = useUsersQuery<{ users: User[] }>(
    "/api/users?scope=all",
    [],
  );

  return { users: data?.users ?? [], isLoading, error };
}
