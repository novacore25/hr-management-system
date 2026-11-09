"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

const ROLE_HOME: Record<string, string> = {
  tim: "/dashboard/tim",
  head: "/dashboard/head",
  hr: "/dashboard/hr",
  executive: "/dashboard/executive",
  developer: "/dashboard/developer",
};

// Which roles are allowed per URL segment (/dashboard/[segment]/...)
const SEGMENT_ROLES: Record<string, string[]> = {
  tim: ["tim", "head", "hr", "executive", "developer"],
  head: ["head", "developer"],
  hr: ["hr", "executive", "developer"],
  executive: ["executive", "hr", "developer"],
  developer: ["developer"],
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, supabaseUser, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!supabaseUser) {
      router.replace("/login");
      return;
    }
    if (!user) {
      // Login Google berhasil tapi belum terdaftar di sistem
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
    const segment = pathname?.split("/")[2];
    const allowed = segment ? SEGMENT_ROLES[segment] : undefined;
    if (allowed && !allowed.includes(user.kpiRole) && user.kpiRole !== "developer") {
      router.replace(ROLE_HOME[user.kpiRole] ?? "/dashboard/tim");
    }
  }, [user, supabaseUser, isLoading, pathname, router]);

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
