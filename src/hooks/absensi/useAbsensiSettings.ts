"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { rowToSettings, type AbsensiSettings } from "@/types/absensi";

const DEFAULT: AbsensiSettings = {
  workStart: "08:00",
  workEnd: "18:00",
  maxLate: "08:15",
  maxTimeSick: "12:00",
  maxTimeLeave: "23:59",
  maxTimeWfa: "12:00",
  officeLat: -6.241586,
  officeLng: 106.628055,
  officeRadius: 100,
  lastSyncDate: null,
};

export function useAbsensiSettings() {
  const [settings, setSettings] = useState<AbsensiSettings>(DEFAULT);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data } = await supabase
        .from("absensi_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (data) setSettings(rowToSettings(data as Record<string, unknown>));
      setIsLoading(false);
    })();

    const channel = supabase
      .channel("absensi_settings_watch")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "absensi_settings" }, (payload: any) => {
        setSettings(rowToSettings(payload.new as Record<string, unknown>));
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  return { settings, isLoading };
}
