"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

function LoginInner({
  searchParams,
}: {
  searchParams: { error?: string; callbackUrl?: string };
}) {
  const [submitting, setSubmitting] = useState(false);

  const errorMessages: Record<string, string> = {
    OAuthAccountNotLinked:
      "Email ini sudah terdaftar dengan metode login lain. Hubungi admin.",
    AccessDenied: "Akses ditolak. Pastikan email Anda terdaftar.",
    Configuration: "Konfigurasi login belum lengkap. Hubungi admin.",
    OAuthCallback: "Gagal terhubung ke Google. Coba lagi.",
    default: "Terjadi kesalahan saat login. Silakan coba lagi.",
  };

  const errorMessage = searchParams.error
    ? (errorMessages[searchParams.error] ?? errorMessages.default)
    : null;

  async function handleLogin() {
    setSubmitting(true);
    try {
      await signIn("google", {
        callbackUrl: searchParams.callbackUrl ?? "/dashboard",
      });
      // Kalau sukses, browser akan redirect ke Google.
      // Kalau gagal, Auth.js mengarahkan balik ke /login?error=...
    } catch {
      toast.error(errorMessages.default);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <Image
              src="/logos/logo-nova-core-app-512px.webp"
              alt="NovaCore"
              width={72}
              height={72}
              className="rounded-2xl"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            NovaCore HR
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Sistem Manajemen SDM Terpadu
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {errorMessage && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={submitting}
            aria-busy={submitting}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.86-3c-1.08.72-2.45 1.16-4.08 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75z"
              />
            </svg>
            {submitting ? "Menghubungkan..." : "Masuk dengan Google"}
          </button>

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Hanya akun Google yang terdaftar resmi yang bisa masuk.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} NovaCore · Sistem HR Terpadu
        </p>
      </div>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div
        role="status"
        aria-label="Memuat"
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-transparent"
      />
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginInner searchParams={sp} />
    </Suspense>
  );
}
