"use client";

import { useState, useMemo } from "react";
import { useApiQuery } from "@/hooks/useApi";
import { ClockIcon, Search, Smile } from "lucide-react";

/**
 * Bentuk baris yang dikirim /api/absensi/logs.
 *
 * `actor` adalah id (atau "SYSTEM"), `actorName` adalah nama aslinya
 * yang sudah di-resolve di server — jadi halaman tidak perlu menarik
 * daftar user untuk menampilkan kolom Aktor.
 */
interface LogEntry {
  id: string;
  actor: string;
  actorName: string | null;
  action: string;
  details: string | null;
  createdAt: string;
}

export default function AdminLogsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  // formerly: SELECT 300 baris terakhir dari absensi_logs di browser
  // plus 1 realtime channel.
  const { data, isLoading } = useApiQuery<{ logs: LogEntry[] }>(
    () => "/api/absensi/logs",
    [],
    60_000,
  );

  const logs = useMemo(() => data?.logs ?? [], [data]);

  const filtered = useMemo(() => {
    if (!searchTerm) return logs;
    const q = searchTerm.toLowerCase();
    return logs.filter(
      (l) =>
        l.actor.toLowerCase().includes(q) ||
        l.actorName?.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.details ?? "").toLowerCase().includes(q),
    );
  }, [logs, searchTerm]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
      day: "2-digit", month: "short", hour: "2-digit",
      minute: "2-digit", second: "2-digit", hour12: false,
    }).replace(",", "");

  const getBadgeCls = (action: string) => {
    if (action.includes("leave") || action.includes("cancell"))
      return "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800";
    if (action.includes("approve") || action.includes("accept"))
      return "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800";
    if (action.includes("reject"))
      return "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800";
    return "bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] border-[var(--ab-border)]";
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight">Audit Trail</h1>
            <span className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-lg text-[8px] font-black border border-green-200 dark:border-green-800 flex items-center gap-1.5 uppercase tracking-widest">
              <ClockIcon size={10} /> Read Only
            </span>
          </div>
          <p className="text-[10px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest mt-1">
            Sistem Logging Aktivitas & Audit Panel ({logs.length} record)
          </p>
        </div>
        <div className="relative w-full md:w-64 flex items-center">
          <Search size={12} className="absolute left-3 text-[var(--ab-text-dim)]" />
          <input
            type="text"
            placeholder="Cari aktor, event, detail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ab-input pl-9 text-[10px] font-bold w-full"
          />
        </div>
      </div>

      <div className="ab-card-tactile !p-0 overflow-hidden">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-[var(--ab-bg-main)] text-[var(--ab-text-dim)] border-b border-[var(--ab-border)]">
                {["Waktu", "Aktor", "Event", "Detail Aktivitas"].map((h) => (
                  <th key={h} className="px-5 py-3 font-black uppercase tracking-widest text-[9px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="p-4">
                    <div className="animate-pulse space-y-3">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-8 bg-[var(--ab-bg-main)] rounded-xl" />
                      ))}
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-20 text-center">
                    <div className="w-16 h-16 bg-[var(--ab-bg-main)] rounded-[20px] flex items-center justify-center mx-auto mb-4 text-[var(--ab-text-dim)]">
                      <Smile size={32} />
                    </div>
                    <h4 className="text-[10px] font-black uppercase text-[var(--ab-text-dim)] tracking-widest italic">
                      Tidak ada log yang ditemukan.
                    </h4>
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  // Kalau server tidak bisa resolve nama, ini log sistem
                  // atau aktor yang akunnya sudah tidak ada.
                  const isSystem = !log.actorName || log.actorName === log.actor;
                  return (
                    <tr
                      key={log.id}
                      className="border-t border-[var(--ab-border)] hover:bg-[var(--ab-bg-main)]/50 transition-colors text-[10px]"
                    >
                      <td className="px-5 py-3 font-bold text-[var(--ab-text-dim)] font-mono text-[10px]">
                        {fmtDate(log.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`font-black text-[10px] uppercase tracking-tight ${isSystem ? "text-[var(--ab-primary)]" : "text-[var(--ab-text-main)]"}`}>
                          {log.actorName || log.actor}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${getBadgeCls(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[10px] font-medium text-[var(--ab-text-dim)] max-w-sm">
                        <div className="line-clamp-1 leading-relaxed">
                          {log.details ? `"${log.details}"` : "-"}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
