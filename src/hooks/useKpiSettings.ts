"use client";

import { useCallback } from "react";
import { useApiQuery } from "./useApi";
import { withQuery } from "@/lib/api-client";
import { DEFAULT_KPI_WEIGHTS } from "@/types";

type Weights = {
  result: number;
  activity: number;
  quality: number;
  leadTim: number;
  hr: number;
};

/**
 * Bobot skor dari server (src/server/dal/assignments.ts).
 *
 * formerly: query langsung ke kpi_settings dari browser.
 * Sekarang: Route Handler dengan guard server-side.
 *
 * `getWeights` selalu mengembalikan objek stabil (identity sama)
 * supaya useMemo di halaman tidak invalid setiap render.
 */

function toSettingsShape(uid: string, w: Weights) {
  return {
    id: uid,
    resultWeight: w.result,
    activityWeight: w.activity,
    qualityWeight: w.quality,
    leadTimWeight: w.leadTim,
    hrWeight: w.hr,
    updatedAt: "",
    updatedBy: "",
  };
}

/** Bobot milik user yang login. */
export function useKpiSettings(userId?: string) {
  const build = useCallback(
    () => (userId ? withQuery("/api/kpi-settings", { userId }) : null),
    [userId],
  );

  const { data, isLoading, error, refetch } = useApiQuery<{
    weights: Weights;
    defaults: Weights;
  }>(build, [userId]);

  const weights: Weights = data?.weights ?? DEFAULT_KPI_WEIGHTS;
  const settings = data ? toSettingsShape(userId ?? "", weights) : null;

  // Stabil: objek baru dibuat hanya kalau isi bobot berubah
  const getWeights = useCallback(() => weights, [weights]);

  return {
    settings,
    weights,
    getWeights,
    isLoading,
    error,
    refresh: refetch,
  };
}

/**
 * Bobot semua user — untuk dashboard HR/Head/Executive.
 *
 * `getWeights(userId)` mengembalikan objek stabil per user sehingga
 * `useMemo` di halaman tidak invalid setiap render.
 */
export function useAllKpiSettings() {
  const build = useCallback(() => "/api/kpi-settings?scope=all", []);

  const { data, isLoading, error, refetch } = useApiQuery<{
    weights: Record<string, Weights>;
    defaults: Weights;
  }>(build, []);

  const map = data?.weights ?? {};
  const defaults = data?.defaults ?? DEFAULT_KPI_WEIGHTS;

  const getWeights = useCallback(
    (uid: string): Weights => map[uid] ?? defaults,
    [map, defaults],
  );

  return {
    settingsByUser: map,
    defaults,
    getWeights,
    isLoading,
    error,
    refresh: refetch,
  };
}