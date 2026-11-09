"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import "./absensi.css";

export default function AbsensiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, supabaseUser, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!supabaseUser) {
      router.replace("/login");
      return;
    }
    if (!user) {
      router.replace("/login?error=not_registered");
      return;
    }
    if (
      user.absensiStatus === "resigned" ||
      user.absensiStatus === "deleted" ||
      user.absensiStatus === "rejected"
    ) {
      router.replace("/login?error=AccountDeactivated");
      return;
    }
    if (user.absensiStatus === "pending") {
      router.replace("/login?error=AccountPending");
      return;
    }
  }, [user, supabaseUser, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--ab-bg-main)] text-[var(--ab-text-main)] transition-colors duration-300">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 md:pb-6 pb-24">{children}</main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
