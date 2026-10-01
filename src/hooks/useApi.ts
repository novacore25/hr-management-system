"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, withQuery, ApiError } from "@/lib/api-client";
import { usePolling } from "@/lib/use-polling";

type Result<T> = {
  data: T;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/**
 * Hook generik untuk query read-only via Route Handler.
 *
 * Signed-in user punya session Auth.js sehingga `credentials: include`
 * otomatis mengirim cookie.
 *
 * PENTING: hook ini HANYA untuk data yang sudah diotorisasi di server.
 * Jangan pernah kirim id user dari client untuk "membaca data orang lain"
 * tanpa guard server-side yang sesuai.
 */
export function useApiQuery<T>(
  buildPath: () => string | null,
  deps: unknown[],
  pollMs = 30_000,
): Result<T | null> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const path = buildPath();
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
      setError(e instanceof ApiError ? e.message : "Gagal memuat data.");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setIsLoading(true);
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  usePolling(refetch, pollMs);

  return { data, isLoading, error, refetch };
}

/**
 * Hook untuk mutasi (POST/PATCH/PUT/DELETE).
 * Menyediakan status loading + error supaya UI bisa menampilkan feedback.
 */
export function useApiMutation<TBody, TResult>(
  endpoint: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (body?: TBody, query?: Record<string, string>) => {
      setIsPending(true);
      setError(null);
      try {
        const path = query ? withQuery(endpoint, query) : endpoint;
        const res = await apiFetch<TResult>(path, {
          method,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        return { ok: true as const, data: res };
      } catch (e) {
        const message =
          e instanceof ApiError ? e.message : "Terjadi kesalahan.";
        setError(message);
        return { ok: false as const, error: message };
      } finally {
        setIsPending(false);
      }
    },
    [endpoint, method],
  );

  return { mutate, isPending, error };
}