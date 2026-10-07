"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { signOut } from "next-auth/react";
import type { User } from "@/types";

export type DevMode = "management" | "employee";

interface AuthContextValue {
  /** User dari Auth.js session (null kalau belum login) */
  supabaseUser: { id: string; email?: string | null } | null;
  /** Profil lengkap dari tabel `users`. null = belum terdaftar di sistem */
  user: User | null;
  kpiRole: User["kpiRole"] | null;
  isLoading: boolean;
  devMode: DevMode;
  toggleDevMode: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_KEY = "hr:profile";
const PROFILE_TTL = 60_000; // 60 detik

type CachedProfile = { data: User; at: number };

function readCache(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfile;
    if (Date.now() - parsed.at > PROFILE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(user: User) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ data: user, at: Date.now() } satisfies CachedProfile),
    );
  } catch {
    /* quota penuh — abaikan, bukan error fatal */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabaseUser, setSupabaseUser] = useState<
    { id: string; email?: string | null } | null
  >(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [devMode, setDevMode] = useState<DevMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("devMode") as DevMode) ?? "management";
    }
    return "management";
  });

  const toggleDevMode = useCallback(() => {
    setDevMode((prev) => {
      const next: DevMode = prev === "management" ? "employee" : "management";
      if (typeof window !== "undefined") localStorage.setItem("devMode", next);
      return next;
    });
  }, []);

  /**
   * Ambil profil dari server (Route Handler), bukan langsung dari DB.
   * Cache singkat di sessionStorage supaya tidak request tiap render.
   */
  const fetchProfile = useCallback(async (force = false) => {
    if (!force) {
      const cached = readCache();
      if (cached) {
        setUser(cached);
        return cached;
      }
    }

    try {
      const res = await fetch("/api/me", {
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 401) {
        setUser(null);
        writeClearCache();
        return null;
      }

      if (!res.ok) {
        setUser(null);
        return null;
      }

      const json = (await res.json()) as {
        ok: boolean;
        data?: { user: User | null };
      };

      const profile = json.data?.user ?? null;
      setUser(profile);
      if (profile) writeCache(profile);
      return profile;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  function writeClearCache() {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(PROFILE_KEY);
      } catch {
        /* abaikan */
      }
    }
  }

  // ── Session check ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Panggil /api/auth/session dan /api/me secara paralel (bukan sekuensial)
        // untuk memangkas latency inisialisasi login di frontend hingga 50%.
        const [sessionRes, profile] = await Promise.all([
          fetch("/api/auth/session", {
            credentials: "include",
            cache: "no-store",
          }),
          fetchProfile(),
        ]);

        if (sessionRes.ok) {
          const session = (await sessionRes.json()) as {
            user?: { id?: string; email?: string | null } | null;
          } | null;

          if (session?.user?.id && !cancelled) {
            setSupabaseUser({ id: session.user.id, email: session.user.email });
          } else if (profile && !cancelled) {
            setSupabaseUser({ id: profile.id, email: profile.email });
          } else if (!cancelled) {
            setSupabaseUser(null);
            setUser(null);
          }
        } else if (profile && !cancelled) {
          setSupabaseUser({ id: profile.id, email: profile.email });
        } else if (!cancelled) {
          setSupabaseUser(null);
          setUser(null);
        }
      } catch {
        if (!cancelled) {
          setSupabaseUser(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void init();

    // Refresh saat tab kembali aktif (menggantikan Supabase Realtime)
    function onFocus() {
      void fetchProfile(true);
    }
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchProfile]);

  const signInWithGoogle = useCallback(async () => {
    const { signIn } = await import("next-auth/react");
    await signIn("google", { callbackUrl: "/dashboard" });
  }, []);

  const handleSignOut = useCallback(async () => {
    writeClearCache();
    setUser(null);
    setSupabaseUser(null);
    await signOut({ callbackUrl: "/login" });
  }, []);

  const refresh = useCallback(async () => {
    await fetchProfile(true);
  }, [fetchProfile]);

  const kpiRole = user?.kpiRole ?? null;

  return (
    <AuthContext.Provider
      value={{
        supabaseUser,
        user,
        kpiRole,
        isLoading,
        devMode,
        toggleDevMode,
        signInWithGoogle,
        signOut: handleSignOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
