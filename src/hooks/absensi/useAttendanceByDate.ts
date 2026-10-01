"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { rowToAttendance, type Attendance } from "@/types/absensi";

export function useAttendanceByDate(date: string) {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!date) return;
    const supabase = createClient();

    const fetch = async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("date", date)
        .order("check_in", { ascending: true });
      setRecords((data ?? []).map((r) => rowToAttendance(r as Record<string, unknown>)));
      setIsLoading(false);
    };

    fetch();

    const channel = supabase
      .channel(`attendance_date_${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, fetch)
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [date]);

  return { records, isLoading };
}

export function useAttendanceRange(userId: string | null, startDate: string, endDate: string) {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId || !startDate || !endDate) { setIsLoading(false); return; }
    const supabase = createClient();

    (async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", userId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });
      setRecords((data ?? []).map((r) => rowToAttendance(r)));
      setIsLoading(false);
    })();
  }, [userId, startDate, endDate]);

  return { records, isLoading };
}
