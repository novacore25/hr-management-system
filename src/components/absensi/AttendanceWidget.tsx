"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useApiQuery } from "@/hooks/useApi";
import { apiFetch, withQuery, ApiError } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceToday } from "@/hooks/absensi/useAttendanceToday";
import { useAbsensiSettings } from "@/hooks/absensi/useAbsensiSettings";
import { useHolidays } from "@/hooks/absensi/useHolidays";
import ConfirmDialog from "@/components/absensi/ConfirmDialog";
import PromptDialog from "@/components/absensi/PromptDialog";
import CountUp from "@/components/absensi/CountUp";
import {
  Fingerprint, Laptop, Umbrella, Stethoscope,
  Clock, CheckCircle2, AlertCircle, MapPin,
  Lock, Info, X,
} from "lucide-react";
import { toast } from "sonner";

// ─ Haversine ──────────────────────────────────────────────────────────────────
function calcDist(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371e3;
  const f1 = (la1 * Math.PI) / 180, f2 = (la2 * Math.PI) / 180;
  const df = ((la2 - la1) * Math.PI) / 180, dl = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface AllowedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
}

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getNowTime() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

function fmtTime(t: string | null) {
  if (!t) return "--:--";
  return t.substring(0, 5); // "08:30:00" → "08:30"
}

// ─ Types ──────────────────────────────────────────────────────────────────────
type LocationPerm = "granted" | "denied" | "prompt";
type SummaryView = { type: string; names: string[]; color: string } | null;
type SummaryEntry = { count: number; names: string[] };
type Summary = { wfo: SummaryEntry; wfa: SummaryEntry; leave: SummaryEntry; missed: SummaryEntry };

type CheckInResult =
  | { requireLateReason: true; location: { lat: number; lng: number } | null; arrStat: string; lateFine: number }
  | { success: true; status: string; time: string; locationStatus: string; lateFine: number; radiusPenalty: number }
  | { success: false; error: string };

type CheckOutResult =
  | { success: true; time: string }
  | { success: false; error: string };

// ─ Main component ─────────────────────────────────────────────────────────────
export function AttendanceWidget() {
  const { user } = useAuth();
  const router = useRouter();
  const { attendance, isLoading } = useAttendanceToday(user?.id ?? null);
  const { settings } = useAbsensiSettings();
  const { holidayDates } = useHolidays();

  const [isProcessing, setIsProcessing] = useState(false);
  const [locationPerm, setLocationPerm] = useState<LocationPerm>("prompt");
  const [showLocationGuide, setShowLocationGuide] = useState(false);

  // Kantor yang boleh dipakai untuk check-in.
  //
  // formerly: query `department_locations` + nested select dari browser.
  // Karena stub mengembalikan data kosong, `allowedLocations` selalu
  // kosong — artinya check-in GPS SELALU ditolak dengan pesan "Lokasi
  // absen divisi Anda belum diatur oleh Admin", padahal sudah diatur.
  //
  // Divisi sekarang dibaca server dari session, bukan dikirim client.
  const { data: locationsData } = useApiQuery<{
    offices: AllowedLocation[];
  }>(() => "/api/absensi/locations", [], 300_000);

  const allowedLocations = locationsData?.offices ?? [];

  const getNearestLocation = useCallback((loc: { lat: number; lng: number }) => {
    if (allowedLocations.length > 0) {
      let minDist = Infinity;
      let minRadius = 100;
      let bestOffice = null;
      for (const al of allowedLocations) {
        if (!al) continue;
        const dist = calcDist(loc.lat, loc.lng, al.lat, al.lng);
        if (dist < minDist) {
          minDist = dist;
          minRadius = al.radius;
          bestOffice = { lat: al.lat, lng: al.lng, name: al.name };
        }
      }
      return { dist: minDist, radius: minRadius, office: bestOffice, noLocationError: false };
    } else {
      return { dist: Infinity, radius: 0, office: null, noLocationError: true };
    }
  }, [allowedLocations]);

  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [showEarlyPrompt, setShowEarlyPrompt] = useState(false);
  const [showRadiusWarning, setShowRadiusWarning] = useState(false);
  const [showLateReasonPrompt, setShowLateReasonPrompt] = useState(false);
  const [showGpsPrePrompt, setShowGpsPrePrompt] = useState(false);
  const [showGpsErrorDialog, setShowGpsErrorDialog] = useState(false);
  const [gpsErrorReason, setGpsErrorReason] = useState("");
  const [syncRetryCount, setSyncRetryCount] = useState(0);
  const [pendingDistance, setPendingDistance] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedView, setSelectedView] = useState<SummaryView>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [summary, setSummary] = useState<Summary>({
    wfo: { count: 0, names: [] },
    wfa: { count: 0, names: [] },
    leave: { count: 0, names: [] },
    missed: { count: 0, names: [] },
  });

  const [isIOS] = useState(() =>
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  );

  const today = getToday();
  const isHoliday = holidayDates.includes(today);

  // ─ Location permission ───────────────────────────────────────────────────────
  const checkPerm = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    try {
      const res = await navigator.permissions.query({ name: "geolocation" });
      setLocationPerm(res.state as LocationPerm);
      res.onchange = () => setLocationPerm(res.state as LocationPerm);
    } catch {}
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => checkPerm());
    window.addEventListener("focus", checkPerm);
    return () => window.removeEventListener("focus", checkPerm);
  }, [checkPerm]);

  // ─ Summary kehadiran tim ─────────────────────────────────────────────────────
  //
  // formerly: 3 query dari browser (users + attendance + leave_requests)
  // plus 3 realtime channel. Setiap perubahan di tabel mana pun menarik
  // ulang DUA dari tiga query itu, termasuk seluruh daftar user aktif.
  //
  // sekarang: satu request, agregasi di server, polling 30 detik
  // (setelahnya juga saat tab/browser regain focus).
  const { data: summaryData } = useApiQuery<{
    summary: Summary;
    mine?: {
      daysRecorded: number;
      daysOnTime: number;
      onTimePercent: number | null;
      streak: number;
      lastRecordedOn: string | null;
    };
  }>(() => withQuery("/api/absensi/summary", { date: today, mine: "1" }), [today], 30_000);

  useEffect(() => {
    if (summaryData?.summary) setSummary(summaryData.summary);
  }, [summaryData]);

  // Statistik pribadi. Nilai null berarti belum ada absensi bulan ini --
  // itu BUKAN 0, dan menampilkan 0 akan menuduh orang yang belum absen
  // sebagai tidak disiplin.
  const mine = summaryData?.mine ?? null;

  // ─ Check-in ─────────────────────────────────────────────────────────────────
  const doCheckIn = useCallback(async (
    location: { lat: number; lng: number } | null,
    lateReason = ""
  ): Promise<CheckInResult> => {
    if (!user) return { success: false, error: "User tidak ditemukan." };

    const now = new Date();

    // Penentuan "telat" di sini HANYA untuk UX: menentukan apakah dialog
    // alasan perlu dibuka sebelum request dikirim. Nilai yang tersimpan
    // tetap dihitung ulang di server (computeLateState), jadi client
    // tidak bisa mengarang status keterlambatan.
    const [lH, lM] = (settings.maxLate || "08:15").split(":").map(Number);
    const lateLim = new Date();
    lateLim.setHours(lH, lM, 0, 0);

    let arrStat: "on_time" | "late" | "very_late" = "on_time";
    let lateFine = 0;

    if (now > lateLim) {
      const vLim = new Date();
      vLim.setHours(10, 0, 0, 0);
      arrStat = now > vLim ? "very_late" : "late";
      lateFine = Math.floor((now.getTime() - lateLim.getTime()) / 60000);

      if (!lateReason) {
        return { requireLateReason: true, location, arrStat, lateFine };
      }
    }

    // formerly: insert langsung ke tabel attendance dari browser, dengan
    // `status` dan `late_fine` dikirim dari client — jadi bisa dikirimi
    // nilai apa saja. Dan karena stub membalas `error: null`, UI
    // menampilkan "Berhasil Check-In" padahal tidak ada yang tersimpan.
    //
    // sekarang: POST ke Route Handler. checkIn, lateFine, radiusPenalty
    // dan locationStatus semuanya dihitung server dari jam server dan
    // jarak GPS yang dihitung ulang di server (verifyCheckInLocation).
    try {
      const res = await apiFetch<{
        attendance?: {
          checkIn: string | null;
          status: string;
          lateFine: number;
          radiusPenalty: number;
          locationStatus: string | null;
        };
      }>("/api/absensi/attendance", {
        method: "POST",
        body: JSON.stringify({
          action: "check-in",
          date: getToday(),
          type: "WFO",
          lateReason: lateReason || null,
          location,
        }),
      });

      const saved = res.attendance;

      return {
        success: true,
        status: saved?.status ?? arrStat,
        time: saved?.checkIn?.slice(0, 5) ?? getNowTime(),
        locationStatus: saved?.locationStatus ?? "Tersimpan",
        lateFine: saved?.lateFine ?? lateFine,
        radiusPenalty: saved?.radiusPenalty ?? 0,
      };
    } catch (e) {
      // ApiError sudah membawa pesan dari server (bahasa Indonesia).
      return {
        success: false,
        error:
          e instanceof ApiError ? e.message : "Gagal menyimpan data ke sistem.",
      };
    }
  }, [user, settings]);

  // ─ Check-out ────────────────────────────────────────────────────────────────
  const doCheckOut = useCallback(
    async (earlyReason = ""): Promise<CheckOutResult> => {
      if (!user) return { success: false, error: "User tidak ditemukan." };

      try {
        const res = await apiFetch<{
          attendance?: { checkOut: string | null };
        }>("/api/absensi/attendance", {
          method: "POST",
          body: JSON.stringify({
            action: "check-out",
            date: getToday(),
            earlyReason: earlyReason || null,
          }),
        });

        return {
          success: true,
          time: res.attendance?.checkOut?.slice(0, 5) ?? getNowTime(),
        };
      } catch (e) {
        return {
          success: false,
          error:
            e instanceof ApiError ? e.message : "Gagal melakukan check-out.",
        };
      }
    },
    [user],
  );

  // ─ UI handlers ────────────────────────────────────────────────────────────────
  const finalizeCheckIn = (result: CheckInResult) => {
    if ("requireLateReason" in result) {
      setShowLateReasonPrompt(true);
      setIsProcessing(false);
      return;
    }
    if (result.success) {
      if (result.radiusPenalty > 0) {
        toast.error("Presensi di luar radius kantor. Status: Kedisiplinan Terpengaruh.", { duration: 6000 });
      } else if (result.lateFine > 0) {
        toast.error(`Anda telat ${result.lateFine} Menit! (Menunggu review HR)`, { duration: 5000 });
      } else {
        toast.success(`Berhasil Check-In pukul ${result.time}!`);
      }
    } else {
      toast.error(result.error || "Gagal Check-In");
    }
    setIsProcessing(false);
    setPendingLocation(null);
    setShowRadiusWarning(false);
    setShowLateReasonPrompt(false);
  };

  const processCheckIn = async (
    confirmedLocation: { lat: number; lng: number } | null = null,
    lateReason = ""
  ) => {
    if (isProcessing && !confirmedLocation && !lateReason) return;
    if (!("geolocation" in navigator) && !confirmedLocation) {
      toast.error("Browser Anda tidak mendukung GPS.");
      return;
    }

    if (confirmedLocation || lateReason) {
      setIsProcessing(true);
      const result = await doCheckIn(confirmedLocation ?? pendingLocation, lateReason);
      finalizeCheckIn(result);
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading("Mendeteksi Lokasi...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        toast.dismiss(toastId);
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const nearest = getNearestLocation(loc);
        if (!nearest.noLocationError && nearest.dist > nearest.radius) {
          setPendingLocation(loc);
          setPendingDistance(Math.round(nearest.dist));
          setSyncRetryCount(0);
          setShowRadiusWarning(true);
          setIsProcessing(false);
          return;
        }
        const result = await doCheckIn(loc);
        if ("requireLateReason" in result) setPendingLocation(loc);
        finalizeCheckIn(result);
      },
      async (err) => {
        toast.dismiss(toastId);
        if (err.code === 1) {
          // Permission denied
          setLocationPerm("denied");
          const result = await doCheckIn(null);
          if ("requireLateReason" in result) setPendingLocation(null);
          finalizeCheckIn(result);
          if (!("requireLateReason" in result)) setShowLocationGuide(true);
        } else {
          // Sinyal GPS lemah / timeout / GPS mati di perangkat
          setGpsErrorReason(
            err.code === 2
              ? "GPS tidak aktif atau perangkat tidak dapat mendeteksi posisi."
              : err.code === 3
              ? "Sinyal GPS lemah atau waktu deteksi habis (timeout)."
              : "Gagal mendeteksi koordinat GPS perangkat."
          );
          setShowGpsErrorDialog(true);
          setIsProcessing(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
  };

  const processCheckOut = async (reason = "") => {
    setIsProcessing(true);
    try {
      const result = await doCheckOut(reason);
      if (result.success) {
        toast.success("Berhasil Check-Out! Sampai besok.");
      } else {
        toast.error(result.error || "Gagal Check-Out");
      }
    } finally {
      setIsProcessing(false);
      setShowCheckoutConfirm(false);
      setShowEarlyPrompt(false);
    }
  };

  const onAbsenClick = () => {
    // formerly ada `console.log` di sini yang mencetak seluruh objek
    // attendance setiap kali tombol ditekan -- termasuk email staf dan
    // koordinat check-in mereka, ke console browser. Dihapus.
    if (isProcessing) return;

    // formerly jeda pengaman 15 detik lewat setTimeout di dalam event
    // handler.
    //
    // Masalahnya bukan jeda-nya, tapi timer-nya tidak pernah dibatalkan.
    // Kalau check-in berhasil dalam 3 detik, timer tetap hidup dan 15
    // detik kemudian ia set isProcessing(false) -- membatalkan check-in
    // yang sedang berjalan di request berikutnya, dan membuat tombol
    // bisa diklik dua kali.
    //
    // Sekarang isProcessing hanya dibersihkan oleh jalur yang memang
    // selesai (finalizeCheckIn, dan cabang error di bawah), jadi tidak
    // ada timer liar yang bisa menabrak request yang sedang jalan.
    if (!attendance) {
      // Tampilkan prompt izin lebih dulu, baru panggil GPS.
      //
      // Penting: kalau izin sebelumnya sudah DITOLAK, browser tidak
      // akan menampilkan popup lagi dari sini -- getCurrentPosition
      // langsung memberi error code 1. Jadi prompt yang memutar ulang
      // perintahnya ada di onGpsPrePromptConfirm, bukan di sini.
      setShowGpsPrePrompt(true);
    } else if (!attendance.checkOut) {
      const [eH, eM] = (settings.workEnd || "18:00").split(":").map(Number);
      const endLim = new Date(); endLim.setHours(eH, eM, 0, 0);
      if (new Date() < endLim) {
        setShowEarlyPrompt(true);
      } else {
        setShowCheckoutConfirm(true);
      }
    }
  };

  const onGpsPrePromptConfirm = (withGps: boolean) => {
    setShowGpsPrePrompt(false);
    if (withGps) {
      // Minta izin dari dalam gerakan pengguna (klik), bukan dari
      // useEffect.
      //
      // Browser hanya menampilkan popup izin kalau diminta dari dalam
      // event yang dipicu pengguna. Kalau dipanggil dari timer atau
      // setelah await, Chrome menolaknya dengan error "geolocation
      // request must be triggered by user action" -- dan tidak ada
      // popup yang muncul sama sekali, tanpa alasan yang terlihat.
      //
      // Karena itu prosesnya LANGSUNG dipanggil di sini, bukan
      // ditunda dengan setTimeout.
      processCheckIn();
    } else {
      // Check-in tanpa GPS. Tetap dihitung server, hanya tanpa
      // verifikasi radius.
      setIsProcessing(true);
      doCheckIn(null).then((result) => {
        finalizeCheckIn(result);
      });
    }
  };

  /**
   * Minta ulang izin lokasi setelah popup-nya tertutup.
   *
   * Yang terjadi sebelumnya: user menekan "Tolak" atau menutup popup
   * (kebetulan, mis. dengan menekan Escape atau klik di luar). Browser
   * lalu memblokir permintaan berikutnya dan langsung membalas error
   * code 1 tanpa popup lagi. User yang tidak tahu harus
   * membuka pengaturan browser akan bingung -- dan tidak ada jalan
   * keluar dari halaman.
   *
   * Fungsi ini adalah jalan keluarnya: tombol yang jelas meminta izin
   * lagi, plus langkah manual kalau browser masih menolak.
   */
  const mintaIzinLokasiLagi = useCallback(() => {
    setShowLocationGuide(false);
    setShowGpsPrePrompt(false);

    // Pastikan browser mengIzinkanwerco untuk origin ini dulu, kalau
    // bisa diperiksa. Kalau state-nya "denied", mustahil diubah dari
    // kode -- hanya bisa dari pengaturan browser.
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((res) => {
          setLocationPerm(res.state as LocationPerm);
          if (res.state === "denied") {
            toast.error(
              "Izin lokasi masih diblokir. Buka pengaturan situs di browser lalu pilih Izinkan.",
              { duration: 7000 },
            );
            setShowLocationGuide(true);
            return;
          }
          // State "prompt" atau "granted": langsung minta, dan
          // watchPosition policy-nya longgar supaya tidak
          // diblokir hanya karena satu permintaan gagal.
          applyWatchPositionPolicy();
          processCheckIn();
        })
        .catch(() => {
          // Beberapa browser tidak mendukung Permissions API untuk
          // geolocation. Tetap coba: mungkin popup-nya masih muncul.
          applyWatchPositionPolicy();
          processCheckIn();
        });
      return;
    }

    applyWatchPositionPolicy();
    processCheckIn();
  }, [processCheckIn]);

  /**
   * Longgarkan policies agar permintaan lokasi tidak diblokir hanya
   * karena satu kegagalan.
   *
   * formerly tidak ada. Tanpa ini, kalau satu permintaan GPS gagal,
   * browser bisa otomatis memblokir permintaan berikutnya dan popup
   * izin tidak akan muncul lagi sama sekali.
   */
  const applyWatchPositionPolicy = useCallback(() => {
    if (typeof navigator === "undefined") return;
    const Geoloc = (navigator as Navigator & {
      permissions?: Permissions;
    }) as Navigator & {
      permissions?: {
        setFeaturePolicy?: (p: string, v: string) => void;
        policy?: { controlledFeatures?: string[] };
      };
    };

    try {
      // Izinkan policy ini untuk Geolocation.
      const policies = Geoloc.permissions?.policy?.controlledFeatures ?? [];
      if (policies.length > 0 && !policies.includes("geolocation")) {
        Geoloc.permissions?.setFeaturePolicy?.(
          "geolocation",
          "self",
        );
      }
    } catch {
      // Feature Policy API tidak tersedia di semua browser. Tidak
      // masalah -- permintaan tetap dikirim, hanya tanpa jaminan
      // policy.
    }
  }, []);

  // ─ Loading skeleton ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="flex justify-between items-center h-12">
          <div className="w-1/2 h-8 bg-[var(--ab-bg-surface)] rounded-xl"></div>
          <div className="w-12 h-12 bg-[var(--ab-bg-surface)] rounded-full"></div>
        </div>
        <div className="h-16 bg-[var(--ab-bg-surface)] rounded-3xl"></div>
        <div className="h-52 bg-[var(--ab-bg-surface)] rounded-[40px]"></div>
        <div className="h-40 bg-[var(--ab-bg-surface)] rounded-[40px]"></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-[var(--ab-bg-surface)] rounded-3xl"></div>
          <div className="h-24 bg-[var(--ab-bg-surface)] rounded-3xl"></div>
        </div>
      </div>
    );
  }

  // ─ Render ─────────────────────────────────────────────────────────────────────
  const btnBg = "var(--ab-primary)";
  const btnShadow = "0 20px 40px -12px var(--ab-primary-glow)";

  return (
    <div className="space-y-6 pb-4 ab-animate-fadeIn">
      {/* Clock Widget */}
      <div className="bg-white/10 dark:bg-slate-800/40 p-6 rounded-[35px] backdrop-blur-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative z-10 w-full mb-2">
        <div className="flex flex-col items-center">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 mb-2 text-center text-slate-500 dark:text-slate-400">
            {currentTime.toLocaleDateString("id-ID", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
          <h1 className="text-7xl md:text-8xl font-black tracking-tight font-mono text-slate-800 dark:text-white drop-shadow-md">
            {currentTime
              .toLocaleTimeString("id-ID", { hour12: false, hour: "2-digit", minute: "2-digit" })
              .replace(/\./g, ":")}
          </h1>
          <p className="text-sm font-black font-mono text-[var(--ab-primary)] mt-1 animate-pulse">
            {currentTime.toLocaleTimeString("id-ID", { hour12: false, second: "2-digit" })} SEC
          </p>
          <div className="mt-5 w-full max-w-sm flex items-center justify-center gap-4 bg-slate-100 dark:bg-slate-900/50 py-3 px-5 rounded-[22px] border border-slate-200 dark:border-slate-800">
            <Clock size={18} className="text-primary animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] leading-none opacity-50 mb-0.5 text-slate-500 dark:text-slate-400">
                Official Work Hours
              </span>
              <span className="text-[13px] font-black tracking-tight text-slate-800 dark:text-slate-200">
                {settings?.workStart ?? "08:00"} — {settings?.workEnd ?? "18:00"}
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden ab-nm-button shrink-0">
            <img src="/logos/logo-nova-core-app-512px.webp" alt="NovaCore" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[var(--ab-text-main)] tracking-tight leading-none">
              NovaCore Portal
            </h1>
            <p className="text-[9px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest mt-1">
              Employee Experience
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest leading-none mb-1">Halo,</p>
          <p className="text-xs font-black truncate max-w-[120px]" style={{ color: "var(--ab-primary)" }}>
            {user?.name?.split(" ")[0]}
          </p>
        </div>
      </div>

      {/* Shift Banner */}
      <div className="rounded-3xl p-1 shadow-lg overflow-hidden mb-6" style={{ background: "var(--ab-primary)" }}>
        <div className="bg-white/10 backdrop-blur-sm p-4 rounded-[22px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2.5 rounded-xl text-white">
              <Clock size={14} className="animate-pulse" />
            </div>
            <div>
              <p className="text-[9px] font-black text-white/60 uppercase tracking-widest leading-none mb-1">
                Shift Operational
              </p>
              <p className="text-sm font-black text-white">
                {settings?.workStart ?? "08:00"} — {settings?.workEnd ?? "18:00"}
              </p>
            </div>
          </div>
          {isHoliday ? (
            <span className="bg-rose-500 text-white text-[9px] font-black px-3 py-1.5 rounded-full uppercase border border-white/20 animate-pulse">
              Hari Libur
            </span>
          ) : (
            <div className="text-right">
              <p className="text-[9px] font-black text-white/60 uppercase tracking-widest leading-none mb-1">Status</p>
              <p className="text-[10px] font-black text-white uppercase bg-white/10 px-3 py-1 rounded-lg border border-white/20">
                Hari Kerja
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Attendance Card */}
      <div className="ab-card-tactile relative overflow-hidden">
        {/* Top indicator strip */}
        <div
          className="absolute top-0 right-10 w-24 h-1.5 rounded-b-full shadow-lg transition-colors"
          style={{
            background: !attendance
              ? "var(--ab-border)"
              : attendance.checkOut
                ? "#22c55e"
                : "var(--ab-primary)",
          }}
        />

        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xs font-black text-[var(--ab-text-dim)] uppercase tracking-[0.15em]">
            Laporan Presensi
          </h3>
          <div className="flex gap-2 flex-wrap justify-end">
            {attendance && (
              <span className={`text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest border ${
                attendance.status === "on_time"
                  ? "bg-green-50 text-green-600 border-green-100 dark:bg-green-900/30 dark:border-green-800/50 dark:text-green-400"
                  : "bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/30 dark:border-orange-800/50 dark:text-orange-400"
              }`}>
                {attendance.status.replace("_", " ")}
              </span>
            )}
            {attendance?.locationStatus && (
              <span className={`text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest border ${
                attendance.locationStatus === "Dalam Area"
                  ? "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:border-blue-800/50 dark:text-blue-400"
                  : attendance.locationStatus === "Lokasi Keblokir"
                    ? "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/30 dark:border-amber-800/50 dark:text-amber-400"
                    : "bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/30 dark:border-rose-800/50 dark:text-rose-400"
              }`}>
                {attendance.locationStatus}
              </span>
            )}
          </div>
        </div>

        {attendance?.type === "WFA" && (
          <div className="mb-5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border border-purple-100 dark:border-purple-800">
            <Laptop size={20} />
            <div>
              <p className="font-black uppercase tracking-widest text-[9px] mb-0.5">Mode WFA Aktif</p>
              <p className="opacity-80">Pastikan koneksi internet stabil.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-[var(--ab-bg-main)] p-4 rounded-3xl text-center border border-[var(--ab-border)]">
            <div className="flex flex-col items-center">
              <CheckCircle2 size={10} className="text-blue-400 mb-1.5" />
              <p className="text-[8px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-0.5 leading-none">
                Check In
              </p>
              <p className="font-black text-[var(--ab-text-main)] text-2xl font-mono tracking-tighter">
                {fmtTime(attendance?.checkIn ?? null)}
              </p>
            </div>
          </div>
          <div className="bg-[var(--ab-bg-main)] p-4 rounded-3xl text-center border border-[var(--ab-border)]">
            <div className="flex flex-col items-center">
              <AlertCircle size={10} className="text-orange-400 mb-1.5" />
              <p className="text-[8px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-0.5 leading-none">
                Check Out
              </p>
              <p className="font-black text-[var(--ab-text-main)] text-2xl font-mono tracking-tighter">
                {fmtTime(attendance?.checkOut ?? null)}
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex justify-center py-6 px-2">
          <button
            onClick={onAbsenClick}
            disabled={isProcessing || (attendance ? !!attendance.checkOut : false)}
            className="group relative w-full h-16 md:h-20 rounded-[24px] shadow-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:grayscale overflow-hidden flex items-center justify-center gap-4 text-white"
            style={{ 
              background: btnBg, 
              boxShadow: "0 15px 40px -10px var(--ab-primary-glow)",
              border: "2px solid rgba(255,255,255,0.1)"
            }}
          >
            <Fingerprint
              size={32}
              className="group-hover:scale-110 group-active:scale-90 transition-transform duration-300"
            />
            <div className="text-left flex flex-col justify-center">
              <p className="text-[10px] opacity-80 font-black tracking-[0.2em] mb-1 leading-none uppercase">
                Presensi Digital
              </p>
              <p className="text-sm md:text-base font-black uppercase tracking-tight leading-none">
                {!attendance
                  ? "Mulai Shift Sekarang"
                  : attendance.checkOut
                    ? "Shift Selesai"
                    : "Akhiri Shift (Tap Pulang)"}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Real-time Summary */}
      <div className="ab-card-tactile">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[10px] font-black text-[var(--ab-text-dim)] uppercase tracking-[0.2em]">
            Real-time Overview
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-bold text-green-500 uppercase tracking-widest">Live Sync</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([
            { key: "wfo",    label: "WFO",   col: "var(--ab-primary)", icon: <MapPin size={12} />,      data: summary.wfo,    view: "emerald" },
            { key: "wfa",    label: "WFA",   col: "#a855f7",           icon: <Laptop size={12} />,      data: summary.wfa,    view: "purple"  },
            { key: "leave",  label: "Cuti",  col: "#f97316",           icon: <Umbrella size={12} />,    data: summary.leave,  view: "orange"  },
            { key: "missed", label: "Alpha", col: "#f43f5e",           icon: <AlertCircle size={12} />, data: summary.missed, view: "rose"    },
          ] as const).map(({ key, label, col, icon, data, view }) => (
            <button
              key={key}
              onClick={() => setSelectedView({ type: label, names: data.names, color: view })}
              className="bg-[var(--ab-bg-main)] p-3 rounded-[24px] border border-[var(--ab-border)] flex items-center gap-3 active:scale-95 transition-transform text-left"
            >
              <div
                className="text-white p-1.5 rounded-lg text-xs shrink-0"
                style={{ background: col, boxShadow: `0 4px 12px -3px ${col}55` }}
              >
                {icon}
              </div>
              <div>
                <p className="text-[7px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-0.5 leading-none">
                  {label}
                </p>
                <p className="text-lg font-black text-[var(--ab-text-main)] font-mono leading-none">
                  <CountUp end={data.count} />
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Quota Cards removed from widget to be placed globally */}

      {/* Statistik kehadiran pribadi.

          Angkanya dari myAttendanceMonth() di server. Sebelumnya kartu
          ini menulis "100%" dan "Great Consistency!" sebagai TEKS
          LITERAL tanpa query apa pun -- sementara di produksi hanya 10
          dari 31 staf aktif yang benar-benar 100% bulan ini, 9 orang
          belum absen sama sekali, dan 6 orang persentasenya 0%.

          Tiga keadaan yang dibedakan di sini: belum absen (null),
          hadir tapi terlambat (0), dan tepat waktu (100). Kalau
          ketiganya diratakan, kartu akan menampilkan angka yang benar
          hanya untuk orang yang kebetulan kondisinya, dan salah untuk
          semua orang lain. */}
      {mine && (
        <div className="ab-card-tactile">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-[var(--ab-text-dim)] uppercase tracking-[0.2em]">
              Kehadiran Bulan Ini
            </h3>
            {mine.lastRecordedOn && (
              <span className="text-[8px] font-bold text-[var(--ab-text-dim)] uppercase tracking-widest">
                Terakhir {mine.lastRecordedOn}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--ab-bg-main)] p-3 rounded-[24px] border border-[var(--ab-border)]">
              <p className="text-[7px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1">
                Tepat Waktu
              </p>
              <p className="text-2xl font-black text-[var(--ab-text-main)] font-mono leading-none">
                {mine.onTimePercent === null ? "--" : `${mine.onTimePercent}%`}
              </p>
              <p className="text-[9px] text-[var(--ab-text-dim)] mt-1">
                {mine.daysRecorded === 0
                  ? "Belum ada absensi"
                  : `${mine.daysOnTime} dari ${mine.daysRecorded} hari`}
              </p>
            </div>
            <div className="bg-[var(--ab-bg-main)] p-3 rounded-[24px] border border-[var(--ab-border)]">
              <p className="text-[7px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest mb-1">
                Beruntun
              </p>
              <p className="text-2xl font-black text-[var(--ab-text-main)] font-mono leading-none">
                {mine.daysRecorded === 0 ? "--" : mine.streak}
                {mine.daysRecorded > 0 && mine.streak > 0 && (
                  <span className="text-[10px] text-[var(--ab-text-dim)] ml-0.5">hari</span>
                )}
              </p>
              <p className="text-[9px] text-[var(--ab-text-dim)] mt-1">
                {mine.daysRecorded === 0
                  ? "Belum ada absensi"
                  : mine.streak === 0
                    ? "Belum tepat waktu"
                    : "Hari berturut-turut"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* GPS Pre-Permission Modal */}
      {showGpsPrePrompt && (
          <div className="ab-confirm-overlay fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999, background: "rgba(2, 8, 23, 0.65)", backdropFilter: "blur(8px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowGpsPrePrompt(false); }}>
            <div className="w-full max-w-md rounded-[50px] shadow-2xl overflow-hidden ab-animate-scaleIn border border-[var(--ab-border)]" style={{ background: "var(--ab-bg-surface)" }}>
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-blue-50 dark:border-blue-800">
                  <MapPin size={32} className="text-blue-600 animate-bounce" />
                </div>
                <h3 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight mb-3">
                  Izin Lokasi GPS
                </h3>
                {locationPerm === "denied" ? (
                  <>
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-3xl p-5 mb-6">
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-300 leading-relaxed mb-4">
                        ⚠️ Izin lokasi sudah pernah diblokir di browser Anda. Browser tidak bisa menampilkan pop-up izin lagi secara otomatis.
                      </p>
                      <div className="space-y-3 text-left">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">
                          Cara Mengaktifkan Ulang:
                        </p>
                        {[
                          { icon: <Lock size={14} className="text-blue-500" />, text: `Klik ikon ${isIOS ? '"AA"' : 'Gembok 🔒'} di sebelah alamat URL browser.` },
                          { icon: <Info size={14} className="text-green-500" />, text: `Pilih ${isIOS ? '"Website Settings"' : '"Permissions" atau "Site Settings"'}.` },
                          { icon: <MapPin size={14} className="text-orange-500" />, text: 'Ubah status "Location" menjadi "Allow / Izinkan".' },
                        ].map((step, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-[var(--ab-border)] shrink-0">
                              {step.icon}
                            </div>
                            <p className="text-xs font-bold text-[var(--ab-text-main)]">{step.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => mintaIzinLokasiLagi()}
                        className="flex-1 bg-blue-600 text-white py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-blue-700 transition-all active:scale-95"
                      >
                        Izinkan Lokasi Lagi
                      </button>
                      <button
                        onClick={() => window.location.reload()}
                        className="mt-2 w-full bg-[var(--ab-bg-main)] text-[var(--ab-text-main)] py-3 rounded-[20px] font-black uppercase tracking-widest text-[10px] border border-[var(--ab-border)] hover:bg-[var(--ab-bg-surface)] transition-all active:scale-95"
                      >
                        Muat Ulang Halaman
                      </button>
                      <button
                        onClick={() => onGpsPrePromptConfirm(false)}
                        className="flex-1 bg-[var(--ab-bg-main)] text-[var(--ab-text-main)] py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] border border-[var(--ab-border)] hover:bg-[var(--ab-bg-surface)] transition-all active:scale-95"
                      >
                        Absen Tanpa GPS
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[var(--ab-text-dim)] font-medium leading-relaxed mb-3">
                      Sistem membutuhkan akses lokasi GPS untuk memvalidasi area kantor Anda.
                    </p>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-3xl p-5 mb-6">
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-300 leading-relaxed">
                        💡 Setelah klik tombol di bawah, browser akan menampilkan pop-up izin lokasi. <strong>Pastikan klik &quot;Izinkan&quot; / &quot;Allow&quot;</strong> agar lokasi Anda terdeteksi.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => onGpsPrePromptConfirm(true)}
                        className="flex-1 text-white py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-lg transition-all active:scale-95"
                        style={{ background: "var(--ab-primary)" }}
                      >
                        ✅ Izinkan & Check-In
                      </button>
                      <button
                        onClick={() => onGpsPrePromptConfirm(false)}
                        className="flex-1 bg-[var(--ab-bg-main)] text-[var(--ab-text-main)] py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] border border-[var(--ab-border)] hover:bg-[var(--ab-bg-surface)] transition-all active:scale-95"
                      >
                        Tanpa GPS
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Location Guide Modal */}
      {showLocationGuide && (
          <div className="ab-confirm-overlay fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999, background: "rgba(2, 8, 23, 0.65)", backdropFilter: "blur(8px)" }} onClick={(e) => { if (e.target === e.currentTarget) setShowLocationGuide(false); }}>
            <div className="w-full max-w-md rounded-[50px] shadow-2xl overflow-hidden ab-animate-scaleIn border border-[var(--ab-border)]" style={{ background: "var(--ab-bg-surface)" }}>
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-orange-50 dark:border-orange-800 animate-bounce">
                  <Lock size={32} className="text-orange-600" />
                </div>
                <h3 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight mb-3">
                  Akses Lokasi Diblokir
                </h3>
                <p className="text-sm text-[var(--ab-text-dim)] font-medium leading-relaxed mb-8">
                  Browser Anda memblokir izin lokasi. Presensi wajib menggunakan GPS untuk validasi area kantor.
                </p>
                <div className="space-y-4 text-left bg-[var(--ab-bg-main)] p-6 rounded-[35px] border border-[var(--ab-border)] mb-8">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-2">
                    Cara Mengaktifkan Kembali:
                  </p>
                  {[
                    {
                      icon: isIOS ? (
                        <span className="text-blue-600 font-black text-xs px-1">AA</span>
                      ) : (
                        <Lock size={14} className="text-blue-500" />
                      ),
                      text: `Klik ikon ${isIOS ? '"AA"' : "Gembok (Lock)"} di sebelah alamat URL.`,
                    },
                    {
                      icon: <Info size={14} className="text-green-500" />,
                      text: `Pilih ${isIOS ? "Website Settings" : "Permissions / Site Settings"}.`,
                    },
                    {
                      icon: <MapPin size={14} className="text-orange-500" />,
                      text: "Ubah status Location menjadi Allow / Izinkan.",
                    },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="bg-[var(--ab-bg-surface)] p-2.5 rounded-2xl border border-[var(--ab-border)] shrink-0">
                        {step.icon}
                      </div>
                      <p className="text-xs font-bold text-[var(--ab-text-main)]">{step.text}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => mintaIzinLokasiLagi()}
                  className="w-full bg-blue-600 text-white py-5 rounded-[25px] font-black uppercase tracking-widest text-xs shadow-xl hover:bg-blue-700 transition-all active:scale-95 mb-3"
                >
                  Izinkan Lokasi Lagi
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full bg-[var(--ab-bg-main)] text-[var(--ab-text-main)] py-4 rounded-[25px] font-black uppercase tracking-widest text-xs border border-[var(--ab-border)] hover:bg-[var(--ab-bg-surface)] transition-all active:scale-95 mb-6"
                >
                  Muat Ulang Halaman
                </button>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-3xl border border-blue-100 dark:border-blue-800">
                  <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 leading-relaxed italic">
                    💡 Masih bingung? Silakan hubungi Admin HR atau tanyakan ke rekan tim.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Summary Detail Modal */}
      {selectedView && (
          <div className="ab-confirm-overlay fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999, background: "rgba(2, 8, 23, 0.65)", backdropFilter: "blur(8px)" }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedView(null); }}>
            <div className="w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden ab-animate-scaleIn border border-[var(--ab-border)]" style={{ background: "var(--ab-bg-surface)" }}>
              <div className="p-6 border-b border-[var(--ab-border)] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div
                    className="text-white p-2 rounded-xl"
                    style={{
                      background:
                        selectedView.color === "emerald" ? "var(--ab-primary)"
                          : selectedView.color === "purple" ? "#a855f7"
                            : selectedView.color === "orange" ? "#f97316"
                              : "#f43f5e",
                    }}
                  >
                    {selectedView.type === "WFO"   && <MapPin size={14} />}
                    {selectedView.type === "WFA"   && <Laptop size={14} />}
                    {selectedView.type === "Cuti"  && <Umbrella size={14} />}
                    {selectedView.type === "Alpha" && <AlertCircle size={14} />}
                  </div>
                  <h3 className="text-sm font-black text-[var(--ab-text-main)] uppercase tracking-tight">
                    {selectedView.type}
                  </h3>
                </div>
                <button onClick={() => setSelectedView(null)} className="text-[var(--ab-text-dim)] hover:text-red-500 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto ab-scrollbar bg-[var(--ab-bg-main)]">
                {selectedView.names.length === 0 ? (
                  <p className="text-center py-10 text-[10px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest italic">
                    Tidak ada data untuk kategori ini.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {selectedView.names.map((name, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 bg-[var(--ab-bg-surface)] p-3 rounded-2xl border border-[var(--ab-border)]"
                      >
                        <div className="w-8 h-8 bg-[var(--ab-bg-main)] text-[var(--ab-text-main)] rounded-lg flex items-center justify-center font-black text-xs">
                          {name.substring(0, 1)}
                        </div>
                        <span className="text-[11px] font-bold text-[var(--ab-text-main)] opacity-80">{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-[var(--ab-border)] text-center">
                <p className="text-[9px] font-black text-[var(--ab-text-dim)] uppercase tracking-widest">
                  Total: {selectedView.names.length} Orang
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showCheckoutConfirm}
        title="Konfirmasi Pulang"
        message="Pastikan pekerjaan hari ini sudah selesai. Ingin melakukan Check-Out sekarang?"
        onConfirm={() => processCheckOut()}
        onCancel={() => setShowCheckoutConfirm(false)}
      />
      <PromptDialog
        isOpen={showEarlyPrompt}
        title="Pulang Lebih Awal"
        message="Waktu kerja belum selesai. Silakan isi alasan mengapa Anda harus pulang lebih awal:"
        placeholder="Misal: Urusan keluarga mendesak, sakit, dll..."
        onConfirm={(reason) => processCheckOut(reason)}
        onCancel={() => setShowEarlyPrompt(false)}
      />
      {/* Radius Warning Modal with Sync */}
      {showRadiusWarning && (
          <div className="ab-confirm-overlay fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999, background: "rgba(2, 8, 23, 0.65)", backdropFilter: "blur(8px)" }} onClick={(e) => { if (e.target === e.currentTarget) { setShowRadiusWarning(false); setPendingLocation(null); setSyncRetryCount(0); } }}>
            <div className="w-full max-w-md rounded-[50px] shadow-2xl overflow-hidden ab-animate-scaleIn border border-[var(--ab-border)]" style={{ background: "var(--ab-bg-surface)" }}>
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-orange-50 dark:border-orange-800">
                  <MapPin size={32} className="text-orange-600" />
                </div>
                <h3 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight mb-3">
                  Di Luar Area Kantor
                </h3>
                <p className="text-sm text-[var(--ab-text-dim)] font-medium leading-relaxed mb-2">
                  Lokasi Anda terdeteksi <strong className="text-orange-600">{pendingDistance} meter</strong> dari kantor.
                </p>
                <p className="text-xs text-[var(--ab-text-dim)] mb-6">
                  Radius kantor: {settings.officeRadius || 100} meter
                </p>

                {/* Sync button - max 2 retries */}
                {syncRetryCount < 2 ? (
                  <>
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-3xl p-4 mb-5">
                      <p className="text-xs font-bold text-blue-700 dark:text-blue-300 leading-relaxed">
                        💡 Jika Anda yakin sudah di area kantor, coba sinkronkan ulang lokasi GPS. Sinyal GPS kadang meleset.
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        setIsSyncing(true);
                        const toastId = toast.loading("Sinkronisasi GPS...");
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            toast.dismiss(toastId);
                            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                            const nearest = getNearestLocation(loc);
                            if (!nearest.noLocationError && nearest.dist <= nearest.radius) {
                              toast.success("Lokasi terdeteksi dalam area kantor!");
                              setShowRadiusWarning(false);
                              setSyncRetryCount(0);
                              setIsProcessing(true);
                              doCheckIn(loc).then(finalizeCheckIn);
                            } else {
                              const newCount = syncRetryCount + 1;
                              setSyncRetryCount(newCount);
                              setPendingLocation(loc);
                              const distVal = nearest.noLocationError ? 0 : Math.round(nearest.dist);
                              setPendingDistance(distVal);
                              toast.error(`Masih di luar area (${distVal}m). Sisa percobaan: ${2 - newCount}x`);
                            }
                            setIsSyncing(false);
                          },
                          () => {
                            toast.dismiss(toastId);
                            toast.error("Gagal mendapatkan lokasi GPS.");
                            setIsSyncing(false);
                          },
                          { enableHighAccuracy: true }
                        );
                      }}
                      disabled={isSyncing}
                      className="w-full text-white py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-lg transition-all active:scale-95 mb-3 flex items-center justify-center gap-3 disabled:opacity-60"
                      style={{ background: "#3b82f6" }}
                    >
                      <MapPin size={16} className={isSyncing ? "animate-spin" : ""} />
                      {isSyncing ? "Menyinkronkan..." : `🔄 Sinkron Lokasi (${2 - syncRetryCount}x tersisa)`}
                    </button>
                  </>
                ) : (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-3xl p-4 mb-5">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                      ⚠️ Sudah 2x sinkronisasi tetapi masih di luar area. Anda tetap bisa absen dengan status <strong>&quot;Di Luar Area&quot;</strong>.
                    </p>
                  </div>
                )}

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => {
                      setShowRadiusWarning(false);
                      setSyncRetryCount(0);
                      setIsProcessing(true);
                      processCheckIn(pendingLocation);
                    }}
                    className="flex-1 text-white py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-lg transition-all active:scale-95"
                    style={{ background: syncRetryCount >= 2 ? "var(--ab-primary)" : "#f97316" }}
                  >
                    {syncRetryCount >= 2 ? "✅ Absen Sekarang" : "⚡ Tetap Absen"}
                  </button>
                  <button
                    onClick={() => {
                      setShowRadiusWarning(false);
                      setPendingLocation(null);
                      setSyncRetryCount(0);
                      router.push("/absensi/requests");
                    }}
                    className="flex-1 bg-[var(--ab-bg-main)] text-[var(--ab-text-main)] py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] border border-[var(--ab-border)] hover:bg-[var(--ab-bg-surface)] transition-all active:scale-95"
                  >
                    📝 Ajukan WFA
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      {/* Modal Penyelamat Kendala Sinyal GPS / Timeout */}
      {showGpsErrorDialog && (
        <div
          className="ab-confirm-overlay fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999, background: "rgba(2, 8, 23, 0.65)", backdropFilter: "blur(8px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowGpsErrorDialog(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-[50px] shadow-2xl overflow-hidden ab-animate-scaleIn border border-[var(--ab-border)]"
            style={{ background: "var(--ab-bg-surface)" }}
          >
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-50 dark:border-amber-800">
                <AlertCircle size={32} className="text-amber-600" />
              </div>
              <h3 className="text-2xl font-black text-[var(--ab-text-main)] uppercase tracking-tight mb-3">
                Kendala Sinyal GPS
              </h3>
              <p className="text-sm text-[var(--ab-text-dim)] font-medium leading-relaxed mb-4">
                {gpsErrorReason}
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-3xl p-4 mb-6 text-left">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-300 leading-relaxed">
                  💡 Pastikan GPS di HP aktif. Jika sinyal terhalang atau mendesak, Anda tetap dapat melakukan check-in tanpa data GPS.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowGpsErrorDialog(false);
                    processCheckIn();
                  }}
                  className="flex-1 text-white py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] shadow-lg transition-all active:scale-95"
                  style={{ background: "var(--ab-primary)" }}
                >
                  🔄 Coba Lagi
                </button>
                <button
                  onClick={() => {
                    setShowGpsErrorDialog(false);
                    setIsProcessing(true);
                    doCheckIn(null).then(finalizeCheckIn);
                  }}
                  className="flex-1 bg-[var(--ab-bg-main)] text-[var(--ab-text-main)] py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] border border-[var(--ab-border)] hover:bg-[var(--ab-bg-surface)] transition-all active:scale-95"
                >
                  ⚡ Tetap Absen Tanpa GPS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <PromptDialog
        isOpen={showLateReasonPrompt}
        title="Konfirmasi Telat"
        message="Anda terlambat masuk kerja. Silakan isi alasan keterlambatan Anda agar bisa di-review oleh HR:"
        placeholder="Misal: Ban bocor, macet parah, dll..."
        onConfirm={(reason) => processCheckIn(null, reason)}
        onCancel={() => {
          setShowLateReasonPrompt(false);
          setPendingLocation(null);
          setIsProcessing(false);
        }}
      />
      <div className="text-center mt-2 opacity-30 text-[8px] font-mono">
        v.2.0.1
      </div>
    </div>
  );
}
