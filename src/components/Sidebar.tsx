/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  History,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  EyeOff,
  Calendar,
  Truck,
  ClipboardList,
  Wrench,
  Sun,
  Moon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AppSettings } from "../types";
import { t } from "../lib/i18n";
import React, { useState } from "react";
import { logout } from "../lib/supabase";

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  settings: AppSettings;
  urgentOrders?: any[];
  activeUser?: any;
  onToggleTheme: () => void;
  mobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({
  activeView,
  onNavigate,
  settings,
  urgentOrders,
  activeUser,
  onToggleTheme,
  mobile = false,
  onClose,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(
    {},
  );

  const displayCollapsed = mobile ? false : collapsed;

  const navigateTo = (id: string) => {
    onNavigate(id);
    if (mobile) onClose?.();
  };

  const toggleMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedMenus((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isFullAdmin =
    activeUser?.role === "admin" || activeUser?.permissions?.isFullAdmin;
  const canManageInventory =
    isFullAdmin || activeUser?.permissions?.canManageInventory;
  const canManageUsers = isFullAdmin || activeUser?.permissions?.canManageUsers;
  const canManageSettings =
    isFullAdmin || activeUser?.permissions?.canManageSettings;
  const canManageTechnicians =
    isFullAdmin || activeUser?.permissions?.canManageTechnicians;

  const menuItems = [
    { id: "pos", label: t("pos", settings), icon: ShoppingCart },
    {
      id: "urgent_orders",
      label: t("urgent_orders", settings),
      icon: ClipboardList,
    },
    { id: "appointments", label: t("appointments", settings), icon: Calendar },
    ...(canManageTechnicians
      ? [{ id: "technician_inventory", label: "مخزون الفنيين", icon: Wrench }]
      : []),
    { id: "crm", label: t("crm", settings), icon: Users },
    ...(canManageInventory
      ? [{ id: "catalog", label: t("catalog", settings), icon: Package }]
      : []),
    { id: "history", label: t("history", settings), icon: History },
    {
      id: "dashboard",
      label: t("dashboard", settings) || "لوحة التحكم",
      icon: LayoutDashboard,
    },
    {
      id: "reports",
      label: t("reports", settings),
      icon: LayoutDashboard,
      subItems: [
        { id: "reports_customers", label: "تقارير العملاء" },
        { id: "reports_sales", label: "تقارير المبيعات" },
        { id: "reports_purchases", label: "تقارير المشتريات" },
        { id: "reports_products", label: "تقارير المنتجات" },
        { id: "reports_stock", label: "تقارير حركة المنتجات" },
        { id: "reports_technicians", label: "مبيعات الفنيين" },
        { id: "reports_expenses", label: "تقارير المصروفات" },
        { id: "reports_all", label: "جميع التقارير" },
      ],
    },
    ...(canManageInventory
      ? [
          {
            id: "purchases",
            label: t("purchases", settings),
            icon: Truck,
            subItems: [
              { id: "purchases_invoices", label: "فواتير المشتريات" },
              { id: "purchases_vendors", label: "إضافة مورد" },
              { id: "purchases_returns", label: "مرتجع مورد" },
              { id: "purchases_reports", label: "تقارير الموردين" },
            ],
          },
        ]
      : []),
    { id: "expenses", label: "المصروفات", icon: ClipboardList },
    ...(canManageUsers ? [{ id: "users", label: "إدارة المستخدمين", icon: Users }] : []),
    ...(canManageSettings
      ? [{ id: "settings", label: t("settings", settings), icon: Settings }]
      : []),
  ];

  return (
    <aside
      className={cn(
        "h-full glass border-l border-white/5 transition-all duration-300 flex flex-col relative z-20 overflow-hidden",
        mobile
          ? "w-[min(20rem,88vw)] max-w-[88vw] rounded-l-3xl shadow-2xl"
          : displayCollapsed
            ? "w-20"
            : "w-64",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 overflow-hidden shrink-0",
          mobile ? "p-4 border-b border-white/5" : "p-6",
        )}
      >
        <div className="h-10 w-10 flex items-center justify-center shrink-0 perspective-[1000px]">
          <img
            src="https://cdn.files.salla.network/theme/1039310232/2c7c4cdf-3bf0-495d-9e73-10c392f20c1c.webp"
            alt="Logo"
            className="w-full h-full object-contain drop-shadow-[0_10px_15px_rgba(0,0,0,0.5)] transition-all duration-500 hover:scale-110 transform-gpu"
            style={{
              transform:
                "perspective(500px) rotateY(15deg) rotateX(5deg) scale3d(1, 1, 1)",
            }}
          />
        </div>
        {!displayCollapsed && (
          <span className="font-bold text-xl tracking-tight whitespace-nowrap flex-1">
            كاشير برو
          </span>
        )}
        {mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-white/70 hover:text-white hover:bg-white/10"
            onClick={onClose}
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>

      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto overscroll-contain">
        {menuItems.map((item) => {
          const isHidden = settings.hiddenMenus.includes(item.id);
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const isExpanded = expandedMenus[item.id];
          const isActive =
            activeView === item.id ||
            (hasSubItems &&
              item.subItems!.some((sub) => sub.id === activeView));

          if (isHidden) return null;

          return (
            <div
              key={item.id}
              onMouseEnter={() => {
                if (!mobile && hasSubItems) {
                  setExpandedMenus((prev) => ({ ...prev, [item.id]: true }));
                }
              }}
              onMouseLeave={() => {
                if (!mobile && hasSubItems) {
                  setExpandedMenus((prev) => ({ ...prev, [item.id]: false }));
                }
              }}
            >
              <button
                onClick={(e) =>
                  hasSubItems ? toggleMenu(item.id, e) : navigateTo(item.id)
                }
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative hover:scale-[1.02] hover:shadow-md min-h-11",
                  isActive && !hasSubItems
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                    : isActive && hasSubItems
                      ? "bg-white/10 text-white"
                      : "hover:bg-white/5 text-white/60 hover:text-white",
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive
                      ? "text-white"
                      : "text-white/60 group-hover:text-white",
                  )}
                />
                {!displayCollapsed && (
                  <span className="font-medium whitespace-nowrap overflow-hidden flex-1 text-right">
                    {item.label}
                    {isHidden && (
                      <EyeOff className="inline-block mr-2 h-3 w-3 opacity-50" />
                    )}
                  </span>
                )}
                {!displayCollapsed &&
                  hasSubItems &&
                  (isExpanded ? (
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  ) : (
                    <ChevronLeft className="h-4 w-4 opacity-50" />
                  ))}
                {displayCollapsed && (
                  <div className="absolute right-full mr-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </button>

              {!displayCollapsed && hasSubItems && isExpanded && (
                <div className="mt-1 flex flex-col gap-1 pr-6 pl-2">
                  {item.subItems!.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => navigateTo(sub.id)}
                      className={cn(
                        "w-full text-right px-3 py-2.5 text-sm rounded-lg transition-colors min-h-10",
                        activeView === sub.id
                          ? "bg-blue-600 text-white"
                          : "text-white/60 hover:text-white hover:bg-white/5",
                      )}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5 shrink-0">
        <Button
          variant="ghost"
          className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10 px-3 mb-2 min-h-11"
          onClick={onToggleTheme}
          title={
            settings.theme === "light"
              ? "التبديل إلى الوضع الداكن"
              : "التبديل إلى الوضع الفاتح"
          }
        >
          {settings.theme === "light" ? (
            <Moon className="h-5 w-5 shrink-0 ml-3" />
          ) : (
            <Sun className="h-5 w-5 shrink-0 ml-3" />
          )}
          {!displayCollapsed && (
            <span>
              {settings.theme === "light" ? "الوضع الداكن" : "الوضع الفاتح"}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-900/10 px-3 min-h-11"
          onClick={async () => {
            if (confirm("هل تريد الخروج؟")) {
              await logout();
              localStorage.removeItem("crm_active_user");
              window.location.reload();
            }
          }}
        >
          <LogOut className="h-5 w-5 shrink-0 ml-3" />
          {!displayCollapsed && <span>تسجيل الخروج</span>}
        </Button>
      </div>

      {!mobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -left-3 top-20 h-6 w-6 bg-blue-600 rounded-full border-2 border-[#0c101b] flex items-center justify-center text-white"
          aria-label={displayCollapsed ? "توسيع القائمة" : "تصغير القائمة"}
        >
          {displayCollapsed ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      )}
    </aside>
  );
}
