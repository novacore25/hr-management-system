"use client";

import { useEffect, useRef } from "react";

/**
 * Polling interval untuk "live update" — pengganti Supabase Realtime.
 *
 * Perilaku:
 * - Tick setiap `intervalMs` (default 30 detik)
 * - Tick langsung saat tab kembali fokus
 * - PAUSE saat tab disembunyikan → hemat query & CPU (VPS cuma 2 vCPU)
 * - Cegah request overlap kalau server lambat
 *
 * Catatan: `callback` sebaiknya dibungkus useCallback oleh pemanggil
 * supaya referensinya stabil (rebuild interval setiap render = sia-sia).
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs = 30_000,
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let running = false;

    const tick = async () => {
      if (running) return;
      if (typeof document !== "undefined" && document.hidden) return;
      running = true;
      try {
        await cbRef.current();
      } catch {
        // Sengaja diamkan — error ditangani state `error` di tiap hook.
      } finally {
        running = false;
      }
    };

    timer = setInterval(tick, intervalMs);

    const onFocus = () => void tick();
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) void tick();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
