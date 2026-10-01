"use client";

/**
 * Client fetch helper.
 *
 * SEMUA hook yang tersisa di src/hooks/ harus pakai ini —
 * TIDAK BOLEH ada import @/db atau @supabase/supabase-js di browser.
 *
 * Fitur:
 * - Selalu kirim cookie session
 * - Error di-cast jadi ApiError supaya UI bisa bedakan
 *   "gagal" dari "kosong" (masalah lama di versi Supabase)
 * - Poll 30 detik + refresh saat tab aktif (pengganti Realtime)
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isAuthError() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
}

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    // Data harus selalu segar — polling & fokus tab Stencil
    cache: "no-store",
  });

  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // response bukan JSON (misal 502 dari Traefik)
  }

  if (!res.ok || body?.ok === false) {
    throw new ApiError(
      body?.error ?? `Request gagal (HTTP ${res.status})`,
      res.status,
    );
  }

  return (body?.data ?? {}) as T;
}

/** Tambahkan query param ke path. */
export function withQuery(
  path: string,
  params: Record<string, string | number | undefined | null>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
