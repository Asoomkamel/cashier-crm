"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle } from "@/components/ui";
import { IconReports, IconDashboard, IconPos, IconCrm, IconExpenses, IconCatalog, IconAccounting } from "@/components/icons";
import { buildJournal, buildIncomeStatement } from "@/lib/accounting";

function SalesTrendChart({ points, currency }: { points: { label: string; value: number }[]; currency: string }) {
  const w = 560, h = 160, pad = 28;
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (p.value / max) * (h - pad * 2);
    return { x, y, ...p };
  });
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1]?.x ?? pad},${h - pad} L${pad},${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 200 }}>
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e2e8f0" strokeWidth="1" />
      {coords.length > 1 && (
        <>
          <path d={areaPath} fill="url(#salesGradient)" opacity={0.15} />
          <path d={linePath} fill="none" stroke="#0ea5a4" strokeWidth="2.5" />
        </>
      )}
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={3} fill="#0ea5a4" />
          {(i === 0 || i === coords.length - 1 || i === Math.floor(coords.length / 2)) && (
            <text x={c.x} y={h - 8} fontSize="9" textAnchor="middle" fill="#94a3b8">{c.label}</text>
          )}
        </g>
      ))}
      <defs>
        <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5a4" />
          <stop offset="100%" stopColor="#0ea5a4" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function TopProductsChart({ rows, currency }: { rows: { name: string; value: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span className="truncate">{r.name}</span>
            <span className="shrink-0 font-medium text-slate-700">{r.value.toFixed(0)} {currency}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-slate-400">لا توجد بيانات مبيعات كافية بعد.</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { orders, customers, catalog, expenses, purchases, customerPayments, appointments, settings } = useApp();
  const t = useT();

  const stats = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status === "active");
    const totalSales = activeOrders.reduce((s, o) => s + o.grandTotal, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const today = new Date().toDateString();
    const todaySales = activeOrders.filter((o) => new Date(o.date).toDateString() === today).reduce((s, o) => s + o.grandTotal, 0);
    const lowStock = catalog.filter((c) => c.type === "product" && (c.stock ?? 0) <= 3).length;
    return { totalSales, totalExpenses, todaySales, lowStock, orderCount: activeOrders.length };
  }, [orders, expenses, catalog]);

  const salesTrend = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dayStart = d.getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const value = orders
        .filter((o) => o.status === "active" && o.date >= dayStart && o.date < dayEnd)
        .reduce((s, o) => s + o.grandTotal, 0);
      days.push({ label: d.toLocaleDateString("ar-SA", { day: "numeric", month: "numeric" }), value });
    }
    return days;
  }, [orders]);

  const topProducts = useMemo(() => {
    const totals = new Map<string, number>();
    orders
      .filter((o) => o.status === "active")
      .forEach((o) => o.items.forEach((it) => {
        const revenue = it.price * it.qty - (it.discount || 0);
        totals.set(it.name, (totals.get(it.name) || 0) + revenue);
      }));
    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [orders]);

  const netProfit = useMemo(() => {
    const journal = buildJournal(orders, purchases, expenses, customerPayments);
    return buildIncomeStatement(journal).netProfit;
  }, [orders, purchases, expenses, customerPayments]);

  const alerts = useMemo(() => {
    const now = Date.now();
    const OVERDUE_DAYS = 14;

    const overdueCustomers = orders
      .filter((o) => o.status === "active" && o.remainingAmount > 0 && (now - o.date) / 86400000 >= OVERDUE_DAYS)
      .reduce((map, o) => {
        const key = o.customerName || "بدون اسم";
        const cur = map.get(key) || { name: key, amount: 0, oldestDays: 0 };
        cur.amount += o.remainingAmount;
        cur.oldestDays = Math.max(cur.oldestDays, Math.floor((now - o.date) / 86400000));
        map.set(key, cur);
        return map;
      }, new Map<string, { name: string; amount: number; oldestDays: number }>());

    const missedAppointments = appointments.filter((a) => a.status === "pending" && a.date < now);

    return {
      overdueCustomers: Array.from(overdueCustomers.values()).sort((a, b) => b.amount - a.amount).slice(0, 5),
      missedCount: missedAppointments.length,
    };
  }, [orders, appointments]);

  const cards = [
    { label: t("dashboard_total_sales"), value: `${stats.totalSales.toFixed(2)} ${settings.currency}`, icon: IconReports, tone: "from-brand-400 to-brand-600" },
    { label: t("dashboard_today_sales"), value: `${stats.todaySales.toFixed(2)} ${settings.currency}`, icon: IconPos, tone: "from-emerald-400 to-emerald-600" },
    { label: t("dashboard_orders"), value: stats.orderCount, icon: IconDashboard, tone: "from-violet-400 to-violet-600" },
    { label: t("dashboard_customers"), value: customers.length, icon: IconCrm, tone: "from-amber-400 to-amber-600" },
    { label: t("dashboard_total_expenses"), value: `${stats.totalExpenses.toFixed(2)} ${settings.currency}`, icon: IconExpenses, tone: "from-rose-400 to-rose-600" },
    { label: t("dashboard_low_stock"), value: stats.lowStock, icon: IconCatalog, tone: "from-sky-400 to-sky-600" },
    { label: "صافي الربح", value: `${netProfit.toFixed(2)} ${settings.currency}`, icon: IconAccounting, tone: netProfit >= 0 ? "from-emerald-400 to-emerald-600" : "from-red-400 to-red-600", href: "/accounting" },
  ];

  return (
    <div>
      <PageTitle title={t("nav_dashboard")} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const content = (
            <Card key={c.label} className="overflow-hidden !p-0">
              <div className="flex items-start gap-3 p-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${c.tone} text-white shadow-md`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs text-slate-500">{c.label}</div>
                  <div className="mt-0.5 truncate text-xl font-bold text-slate-800">{c.value}</div>
                </div>
              </div>
            </Card>
          );
          return c.href ? <Link key={c.label} href={c.href}>{content}</Link> : content;
        })}
      </div>

      {(alerts.overdueCustomers.length > 0 || alerts.missedCount > 0) && (
        <Card className="mt-6 border-amber-200 bg-amber-50/50">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-800">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            تنبيهات ذكية تحتاج متابعة
          </h2>
          <div className="space-y-2 text-sm">
            {alerts.missedCount > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2">
                <span className="text-slate-700">مواعيد فائتة لم تُنفَّذ بعد</span>
                <Link href="/appointments" className="font-bold text-amber-700 hover:underline">{alerts.missedCount} موعد ←</Link>
              </div>
            )}
            {alerts.overdueCustomers.map((c) => (
              <div key={c.name} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2">
                <span className="text-slate-700">{c.name} — متأخر {c.oldestDays} يومًا</span>
                <Link href="/crm" className="font-bold text-red-600 hover:underline">{c.amount.toFixed(2)} {settings.currency} ←</Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            اتجاه المبيعات (آخر 14 يوم)
          </h2>
          <SalesTrendChart points={salesTrend} currency={settings.currency} />
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            الأكثر مبيعًا
          </h2>
          <TopProductsChart rows={topProducts} currency={settings.currency} />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
          <span className="h-2 w-2 rounded-full bg-brand-500" />
          {t("dashboard_recent_orders")}
        </h2>
        <div className="divide-y divide-slate-100 text-sm">
          {orders.slice(-5).reverse().map((o) => (
            <div key={o.id} className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium text-slate-700">{o.invoiceNumber}</div>
                <div className="text-xs text-slate-400">{o.customerName}</div>
              </div>
              <span className="font-semibold text-brand-700">{o.grandTotal.toFixed(2)} {settings.currency}</span>
            </div>
          ))}
          {orders.length === 0 && <p className="py-2 text-slate-400">{t("dashboard_no_orders")}</p>}
        </div>
      </Card>
    </div>
  );
}
