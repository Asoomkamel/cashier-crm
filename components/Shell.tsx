"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { startSyncWorker, stopSyncWorker, pendingSyncCount } from "@/lib/modules/sync/syncWorker";
import { mutationQueue } from "@/lib/modules/sync/mutationQueue";
import { useApp, useT } from "@/lib/store";
import { buildAutoMaintenanceReminders, dueReminderCount, mergeManualAndAutoReminders } from "@/lib/modules/reminders/service";
import Sidebar, { TECH_NAV } from "./Sidebar";
import LoginScreen from "./LoginScreen";
import AIAssistant from "./AIAssistant";
import GlobalActions from "./GlobalActions";
import PWAInstallPrompt from "./PWAInstallPrompt";

export default function Shell({ children }: { children: React.ReactNode }) {
  const { ready, activeUser, settings, cloudSyncMessage, isSyncing, reminders, orders, appointments, urgentOrders, customers, activeBranch, setActiveBranch } = useApp();
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  // Update pending/failed mutations count every 5s
  useEffect(() => {
    const update = () => {
      setPendingCount(pendingSyncCount());
      setFailedCount(mutationQueue.list().filter(m => m.status === "failed").length);
    };
    update();
    const timer = setInterval(update, 5000);
    return () => clearInterval(timer);
  }, []);

  const dueMaintenanceReminderCount = useMemo(() => {
    if (!activeUser || (activeUser.role !== "admin" && activeUser.role !== "supervisor")) return 0;
    const all = mergeManualAndAutoReminders(
      reminders,
      buildAutoMaintenanceReminders({ orders, appointments, urgentOrders, customers })
    );
    return dueReminderCount(all);
  }, [activeUser, reminders, orders, appointments, urgentOrders, customers]);

  // Default the nav open on a wide window, closed on a narrow one — based
  // on the actual measured width in JS, not a CSS breakpoint. This avoids
  // any mismatch between browser zoom level and which "mode" the layout
  // thinks it's in: the hamburger button below is always visible and
  // always works, on every screen size and zoom level, full stop.
  useEffect(() => {
    setNavOpen(window.innerWidth >= 1024);
  }, []);

  // Start background sync worker
  useEffect(() => {
    startSyncWorker();
    return () => stopSyncWorker();
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dir = settings.language === "ar" ? "rtl" : "ltr";
  }, [settings.language]);

  // Technicians get a fixed, permission-gated subset of pages (see
  // TECH_NAV in Sidebar.tsx). This guard blocks direct URL access to any
  // other page too — not just hiding it from the nav — matching "hidden
  // completely" for Settings/Reports/Purchases/Expenses/Users.
  useEffect(() => {
    if (!ready || !activeUser) return;

    if (pathname === "/crm" && activeUser.role !== "admin" && activeUser.role !== "supervisor") {
      router.replace(activeUser.role === "technician" ? "/my-tasks" : "/");
      return;
    }

    if (activeUser.role !== "technician") return;
    const allowedPaths = TECH_NAV.map((item) => item.href);
    if (!allowedPaths.includes(pathname)) {
      router.replace(allowedPaths[0] || "/my-inventory");
    }
  }, [ready, activeUser, pathname, router]);

  if (!ready) {
    return <div className="flex h-screen items-center justify-center text-slate-500">{t("loading")}</div>;
  }

  if (!activeUser) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
      {/* Top bar — always visible, on every screen size and zoom level */}
      <div className="flex items-center justify-between bg-brand-900 p-3 text-white shadow-md">
        <button onClick={() => setNavOpen((v) => !v)} className="rounded p-1 hover:bg-white/10" aria-label="Toggle menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <Image src="/logo-sidebar.png" alt="Peurma" width={24} height={24} />
          <span className="font-bold tracking-wide">PEURMA</span>
        </div>
        <div className="w-6" />
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />

        <main className="relative flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {/* مؤشر المزامنة اللحظية */}
          {dueMaintenanceReminderCount > 0 && pathname !== "/reminders" && (
            <button
              onClick={() => router.push("/reminders")}
              className="mb-3 flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-start text-sm text-amber-800 hover:bg-amber-100"
            >
              <span>{settings.language === "ar" ? `لديك ${dueMaintenanceReminderCount} تذكير صيانة مستحق.` : `You have ${dueMaintenanceReminderCount} due maintenance reminder(s).`}</span>
              <span className="font-semibold">{settings.language === "ar" ? "عرض" : "View"}</span>
            </button>
          )}

          {/* Pending mutations badge */}
          {pendingCount > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-amber-500" />
              <span>{pendingCount} {settings.language === "ar" ? "عملية في انتظار التزامن" : "operations pending sync"}</span>
            </div>
          )}

          {/* Failed mutations — show retry option */}
          {failedCount > 0 && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
                <span>{failedCount} {settings.language === "ar" ? "عملية فشل تزامنها" : "operations failed to sync"}</span>
              </div>
              <button
                onClick={() => {
                  // Retry: reset failed mutations to pending so syncWorker retries
                  const q = mutationQueue.list();
                  q.filter(m => m.status === "failed").forEach(m => {
                    mutationQueue.markSyncing(m.id);
                    setTimeout(() => mutationQueue.markFailed(m.id, m.lastError || ""), 0);
                  });
                  // Reset to pending
                  q.filter(m => m.status === "failed").forEach(m => {
                    const q2 = mutationQueue.list();
                    const found = q2.find(x => x.id === m.id);
                    if (found) {
                      mutationQueue.remove(m.id);
                      mutationQueue.enqueue(found.type, found.payload, { entityType: found.entityType, entityId: found.entityId });
                    }
                  });
                }}
                className="rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
              >
                {settings.language === "ar" ? "إعادة المحاولة" : "Retry"}
              </button>
            </div>
          )}

          {(isSyncing || cloudSyncMessage) && (
            <div
              className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
                isSyncing
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : cloudSyncMessage.startsWith("🔄")
                  ? "border-purple-200 bg-purple-50 text-purple-700"
                  : cloudSyncMessage.startsWith("⚠")
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-green-200 bg-green-50 text-green-700"
              }`}
            >
              {isSyncing ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  <span>جاري المزامنة مع السحابة…</span>
                </>
              ) : (
                <span>{cloudSyncMessage}</span>
              )}
            </div>
          )}
          {children}
        </main>
        <AIAssistant />
        <GlobalActions />
        <PWAInstallPrompt />
      </div>
    </div>
  );
}
