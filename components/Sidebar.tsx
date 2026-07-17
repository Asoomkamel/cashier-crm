"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useApp, useT } from "@/lib/store";
import { buildAutoMaintenanceReminders, dueReminderCount, mergeManualAndAutoReminders } from "@/lib/modules/reminders/service";
import { TranslationKey } from "@/lib/i18n";
import {
  IconDashboard, IconPos, IconUrgent, IconAppointments, IconTechInventory, IconCrm, IconCatalog,
  IconPurchases, IconExpenses, IconReports, IconUsers, IconSettings,
  IconAccounting, IconAuditLog, IconReminders,
} from "./icons";

const NAV: {
  href: string; key: TranslationKey; icon: React.ComponentType<{ className?: string }>;
  perm?: "canManageTechnicians" | "canManageInventory" | "canManageUsers" | "canManageSettings" | "canManageReminders";
}[] = [
  { href: "/", key: "nav_dashboard", icon: IconDashboard },
  { href: "/pos", key: "nav_pos", icon: IconPos },
  { href: "/urgent-orders", key: "nav_urgent", icon: IconUrgent },
  { href: "/appointments", key: "nav_appointments", icon: IconAppointments },
  { href: "/technician-inventory", key: "nav_tech_inventory", icon: IconTechInventory, perm: "canManageTechnicians" },
  { href: "/crm", key: "nav_crm", icon: IconCrm },
  { href: "/catalog", key: "nav_catalog", icon: IconCatalog, perm: "canManageInventory" },
  { href: "/stock-movements", key: "nav_stock_movements", icon: IconCatalog, perm: "canManageInventory" },
  { href: "/purchases", key: "nav_purchases", icon: IconPurchases, perm: "canManageInventory" },
  { href: "/expenses", key: "nav_expenses", icon: IconExpenses },
  { href: "/reports", key: "nav_reports", icon: IconReports },
  { href: "/reminders", key: "nav_reminders", icon: IconReminders, perm: "canManageReminders" },
  { href: "/accounting", key: "nav_accounting", icon: IconAccounting, perm: "canManageSettings" },
  { href: "/audit-log", key: "nav_audit_log", icon: IconAuditLog, perm: "canManageSettings" },
  { href: "/system-health", key: "nav_system_health", icon: IconSettings, perm: "canManageSettings" },
  { href: "/users", key: "nav_users", icon: IconUsers, perm: "canManageUsers" },
  { href: "/settings", key: "nav_settings", icon: IconSettings, perm: "canManageSettings" },
];

// Technicians have a narrow field-work menu. POS is intentionally excluded;
// invoices are created only from completed tasks in My Tasks.
export const TECH_NAV: {
  href: string; key: TranslationKey; icon: React.ComponentType<{ className?: string }>;
}[] = [
  { href: "/urgent-orders", key: "nav_urgent", icon: IconUrgent },
  { href: "/my-tasks", key: "nav_my_tasks", icon: IconUrgent },
  { href: "/my-inventory", key: "nav_tech_inventory", icon: IconTechInventory },
];

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { activeUser, logout, settings, urgentOrders, appointments, orders, customers, reminders, activeBranch, setActiveBranch } = useApp();
  const t = useT();

  const isFullAdmin = activeUser?.role === "admin";
  const isSupervisor = activeUser?.role === "supervisor";
  const isTechnician = activeUser?.role === "technician";
  const initials = (activeUser?.name || "?").trim().slice(0, 1).toUpperCase();

  // Branch selector (admin/supervisor only)
  const branches = settings.branches || [];
  const showBranchSelector = (isFullAdmin || isSupervisor) && branches.length > 1;

  const visibleNav = isTechnician
    ? TECH_NAV
    : NAV.filter((item) => item.href !== "/crm" || isFullAdmin || isSupervisor)
        .filter((item) => item.href !== "/audit-log" || isFullAdmin)
        .filter((item) => item.href !== "/system-health" || isFullAdmin)
        .filter((item) => !item.perm || isFullAdmin || activeUser?.permissions?.[item.perm])
        .filter((item) => isFullAdmin || !(settings.hiddenModules || []).includes(item.href));

  const techSpecialties = new Set((activeUser?.specialties || []).map((s) => s.trim().toLowerCase()));
  const pendingTaskCount = isTechnician
    ? urgentOrders.filter((task) => {
        if (task.status !== "pending") return false;
        if ((task.rejectedByTechnicianIds || []).includes(activeUser?.id || "")) return false;
        const assignedIds = task.assignedTechnicianIds || (task.technicianId ? [task.technicianId] : []);
        const assignedNames = task.assignedTechnicianNames || (task.technicianName ? [task.technicianName] : []);
        if (assignedIds.length || assignedNames.length) {
          return assignedIds.includes(activeUser?.id || "") || assignedNames.includes(activeUser?.name || "");
        }
        const required = task.requiredSpecialties || (task.requiredSpecialty ? [task.requiredSpecialty] : []);
        return required.length > 0 && required.every((s) => techSpecialties.has(String(s).trim().toLowerCase()));
      }).length
    : 0;


  const visibleReminderCount = !isTechnician
    ? dueReminderCount(mergeManualAndAutoReminders(reminders, buildAutoMaintenanceReminders({ orders, appointments, urgentOrders, customers })))
    : 0;

  return (
    <>
      {mobileOpen && <div className="absolute inset-0 z-40 bg-black/40" onClick={onClose} />}

      <aside
        className={`absolute inset-y-0 start-0 z-50 flex h-full w-64 shrink-0 flex-col bg-brand-900 text-white shadow-2xl
          transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <Image src="/logo-sidebar.png" alt="Peurma" width={36} height={36} className="rounded" priority />
            <div className="leading-tight">
              <div className="text-base font-bold tracking-wide">PEURMA</div>
              <div className="text-[10px] text-brand-200">Cashier CRM</div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white" aria-label="Close menu">✕</button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {visibleNav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-gradient-to-r from-brand-400 to-brand-600 text-white shadow-md shadow-brand-900/40"
                    : "text-white/65 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-brand-300 group-hover:text-white"}`} />
                <span className="truncate">{t(item.key)}</span>
                {item.href === "/my-tasks" && pendingTaskCount > 0 && (
                  <span className="ms-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingTaskCount}</span>
                )}
                {item.href === "/reminders" && visibleReminderCount > 0 && (
                  <span className="ms-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{visibleReminderCount}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          {/* Branch selector — admin/supervisor only, when >1 branch */}
          {showBranchSelector && (
            <div className="mb-2">
              <label className="mb-0.5 block text-xs text-white/50">
                {settings.language === "ar" ? "الفرع" : "Branch"}
              </label>
              <select
                value={activeBranch || branches[0]}
                onChange={e => setActiveBranch(e.target.value)}
                className="w-full rounded-md bg-white/10 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                {branches.map(b => (
                  <option key={b} value={b} className="text-slate-900">{b}</option>
                ))}
              </select>
            </div>
          )}
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 p-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 to-brand-600 text-sm font-bold">
              {initials}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">{activeUser?.name}</div>
              <div className="truncate text-xs capitalize text-white/50">
                {activeUser?.role}
                {!showBranchSelector && (activeBranch || branches[0]) ? ` • ${activeBranch || branches[0]}` : ""}
              </div>
            </div>
          </div>
          <button onClick={logout} className="w-full rounded-lg bg-white/10 py-1.5 text-sm hover:bg-white/20">
            {t("logout")}
          </button>
        </div>
      </aside>
    </>
  );
}
