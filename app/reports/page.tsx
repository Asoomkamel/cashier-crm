"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useApp } from "@/lib/store";
import { Button, Card, Input, PageTitle, Select, Table } from "@/components/ui";
import { exportToCSV } from "@/lib/csv";
import { downloadWorkbookXlsx, makeXlsxFileName, WorkbookPayload } from "@/lib/xlsxExport";
import { readWorkbookImport } from "@/lib/xlsxImport";
import { applyBackupPayload } from "@/lib/backupPayload";
import { saveToSupabaseBackup } from "@/lib/supabaseBackup";
import { buildFullPayload } from "@/lib/fullPayload";
import PrintCustomerStatement from "@/components/PrintCustomerStatement";
import PrintTechnicianStatement from "@/components/PrintTechnicianStatement";
import { CatalogItem, Customer, Expense, Order, PurchaseInvoice, ServiceOrder } from "@/lib/types";
import { NORMALIZED_TABLES_READY, USE_SERVER_CHECKOUT } from "@/lib/featureFlags";

type ReportTab = "all" | "sales" | "expenses" | "technicians" | "customers" | "purchases" | "products" | "stock";
type DatePreset = "all" | "today" | "week" | "month" | "custom";
type ChartRow = { label: string; value: number; sublabel?: string };
type TrendRow = { label: string; sales: number; expenses: number; profit: number; purchases: number; outputVat: number; inputVat: number };
type CustomerReportRow = {
  customer: Customer;
  invoiceCount: number;
  totalPurchases: number;
  lastTechnician: string;
  lastInteraction: number;
  serviceCount: number;
  products: string[];
};
type TechnicianReportRow = {
  name: string;
  salesCount: number;
  serviceCount: number;
  revenue: number;
  cost: number;
  commission: number;
  grossProfit: number;
  expenses: number;
  net: number;
};

const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: "all", label: "جميع التقارير" },
  { key: "sales", label: "المبيعات والإيرادات" },
  { key: "expenses", label: "المصروفات" },
  { key: "technicians", label: "الفنيين" },
  { key: "customers", label: "العملاء" },
  { key: "purchases", label: "المشتريات والمخزون" },
  { key: "products", label: "المنتجات" },
  { key: "stock", label: "حركة المنتجات / النواقص" },
];

const PAYMENT_LABELS: Record<string, string> = {
  cash: "كاش",
  card: "شبكة",
  transfer: "تحويل",
  partial: "دفع جزئي",
  credit: "آجل",
  tabby: "تابي",
  tamara: "تمارا",
  not_agreed: "لم يتم الاتفاق",
};

function money(value: number, currency: string) {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateLabel(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ar-SA");
}

function signedOrderTotal(order: Order) {
  if (order.type === "quotation") return 0;
  return order.type === "return_invoice" ? -order.grandTotal : order.grandTotal;
}

function signedPurchaseTotal(purchase: PurchaseInvoice) {
  return purchase.type === "return" ? -purchase.grandTotal : purchase.grandTotal;
}

function tabbyTamaraFee(order: Order) {
  if (order.type === "quotation") return 0;
  if (order.paymentMethod !== "tabby" && order.paymentMethod !== "tamara") return 0;
  return Math.max(0, order.grandTotal) * 0.07 * 1.15;
}

function orderProductCost(order: Order, catalog: CatalogItem[]) {
  if (order.type === "quotation") return 0;
  const sign = order.type === "return_invoice" ? -1 : 1;
  return order.items.reduce((sum, item) => {
    const catalogItem = catalog.find((c) => c.id === item.catalogId);
    return sum + sign * (catalogItem?.costPrice || 0) * item.qty;
  }, 0);
}

function orderGrossProfit(order: Order, catalog: CatalogItem[]) {
  if (order.type === "quotation") return 0;
  return signedOrderTotal(order) - orderProductCost(order, catalog);
}

function asTimestamp(date: string, endOfDay = false) {
  if (!date) return endOfDay ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const d = new Date(`${date}T00:00:00`);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function printElementById(elementId: string, title: string) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(`<!doctype html><html dir="rtl"><head><title>${title}</title><meta charset="utf-8" /><style>body{font-family:Arial,Tahoma,sans-serif;margin:0;background:white;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:7px;text-align:right}.grid{display:grid}.hidden{display:block!important}@page{size:A4;margin:12mm}@media print{button{display:none}}</style></head><body>${element.innerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:shadow-none">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function BarChart({ title, rows, currency, emptyLabel = "لا توجد بيانات" }: { title: string; rows: ChartRow[]; currency?: string; emptyLabel?: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0);
  return (
    <Card className="print:break-inside-avoid">
      <h3 className="mb-3 font-semibold text-slate-800">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-slate-400">{emptyLabel}</p> : (
        <div className="space-y-3">
          {rows.map((row) => {
            const pct = max > 0 ? Math.max(4, (Math.abs(row.value) / max) * 100) : 0;
            return (
              <div key={row.label}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0"><span className="block truncate font-medium text-slate-700">{row.label}</span>{row.sublabel && <span className="block truncate text-xs text-slate-400">{row.sublabel}</span>}</div>
                  <span className="shrink-0 font-semibold text-slate-800">{currency ? money(row.value, currency) : row.value.toLocaleString()}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-brand-500 to-brand-300" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function DonutChart({ title, rows, currency, emptyLabel = "لا توجد بيانات" }: { title: string; rows: ChartRow[]; currency?: string; emptyLabel?: string }) {
  const colors = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#14b8a6", "#eab308", "#ef4444", "#64748b"];
  const positive = rows.filter((row) => row.value > 0).slice(0, 8);
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <Card className="print:break-inside-avoid">
      <h3 className="mb-3 font-semibold text-slate-800">{title}</h3>
      {positive.length === 0 || total <= 0 ? <p className="text-sm text-slate-400">{emptyLabel}</p> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[210px_1fr] md:items-center">
          <svg viewBox="0 0 180 180" className="mx-auto h-44 w-44" role="img" aria-label={title}>
            <circle cx="90" cy="90" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="24" />
            {positive.map((row, index) => {
              const dash = (row.value / total) * circumference;
              const item = (
                <circle key={row.label} cx="90" cy="90" r={radius} fill="none" stroke={colors[index % colors.length]} strokeWidth="24" strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} strokeLinecap="round" transform="rotate(-90 90 90)">
                  <title>{`${row.label}: ${currency ? money(row.value, currency) : row.value.toLocaleString()}`}</title>
                </circle>
              );
              offset += dash;
              return item;
            })}
            <text x="90" y="84" textAnchor="middle" fontSize="13" fill="#64748b">الإجمالي</text>
            <text x="90" y="104" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0f172a">{currency ? money(total, currency) : total.toLocaleString()}</text>
          </svg>
          <div className="space-y-2">
            {positive.map((row, index) => {
              const pct = total > 0 ? (row.value / total) * 100 : 0;
              return (
                <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="truncate font-medium text-slate-700">{row.label}</span></div>
                  <div className="shrink-0 text-end"><div className="font-semibold text-slate-800">{currency ? money(row.value, currency) : row.value.toLocaleString()}</div><div className="text-xs text-slate-400">{pct.toFixed(1)}%</div></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function makeSmoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const midX = (prev.x + current.x) / 2;
    path += ` C ${midX} ${prev.y}, ${midX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

function CurveChart({ title, rows, series, currency, emptyLabel = "لا توجد بيانات" }: { title: string; rows: TrendRow[]; series: { key: keyof Omit<TrendRow, "label">; label: string; color: string }[]; currency?: string; emptyLabel?: string }) {
  const chartRows = rows.filter((row) => series.some((s) => Math.abs(Number(row[s.key] || 0)) > 0));
  const values = chartRows.flatMap((row) => series.map((s) => Number(row[s.key] || 0)));
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const range = rawMax - rawMin || 1;
  const max = rawMax + range * 0.08;
  const min = rawMin - range * 0.08;
  const width = 760;
  const height = 300;
  const padX = 52;
  const padTop = 24;
  const padBottom = 54;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const xAt = (index: number) => padX + (chartRows.length <= 1 ? plotW / 2 : (index / (chartRows.length - 1)) * plotW);
  const yAt = (value: number) => padTop + ((max - value) / (max - min || 1)) * plotH;
  const yTicks = [max, min + ((max - min) * 2) / 3, min + (max - min) / 3, min];
  return (
    <Card className="print:break-inside-avoid">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />{s.label}</span>)}
        </div>
      </div>
      {chartRows.length === 0 ? <p className="text-sm text-slate-400">{emptyLabel}</p> : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="min-h-[260px] w-full min-w-[640px]" role="img" aria-label={title}>
            {yTicks.map((tick, index) => {
              const y = yAt(tick);
              return <g key={index}><line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 6" /><text x={padX - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">{currency ? money(tick, currency) : tick.toFixed(0)}</text></g>;
            })}
            {chartRows.map((row, index) => {
              const show = chartRows.length <= 12 || index === 0 || index === chartRows.length - 1 || index % Math.ceil(chartRows.length / 6) === 0;
              const x = xAt(index);
              return <g key={row.label}><line x1={x} x2={x} y1={padTop} y2={height - padBottom} stroke="#f1f5f9" />{show && <text x={x} y={height - 22} textAnchor="middle" fontSize="11" fill="#64748b">{row.label}</text>}</g>;
            })}
            {series.map((s) => {
              const points = chartRows.map((row, index) => ({ x: xAt(index), y: yAt(Number(row[s.key] || 0)), value: Number(row[s.key] || 0), label: row.label }));
              return <g key={s.key}><path d={makeSmoothPath(points)} fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{points.map((p, index) => <circle key={`${s.key}-${index}`} cx={p.x} cy={p.y} r="3.5" fill="white" stroke={s.color} strokeWidth="2"><title>{`${s.label} - ${p.label}: ${currency ? money(p.value, currency) : p.value.toLocaleString()}`}</title></circle>)}</g>;
            })}
          </svg>
        </div>
      )}
    </Card>
  );
}

export default function ReportsPage() {
  const { customers, orders, catalog, purchases, vendors, expenses, settings, urgentOrders, appointments, techInventory, techFinancialLogs } = useApp();
  const [tab, setTab] = useState<ReportTab>("all");
  const [preset, setPreset] = useState<DatePreset>("month");
  const today = new Date();
  const [fromDate, setFromDate] = useState(dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [toDate, setToDate] = useState(dateInputValue(today));
  const [branchFilter, setBranchFilter] = useState("all");
  const [expenseFrom, setExpenseFrom] = useState(dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [expenseTo, setExpenseTo] = useState(dateInputValue(today));
  const [expenseCategory, setExpenseCategory] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerReportRow | null>(null);
  const [selectedTechnician, setSelectedTechnician] = useState<TechnicianReportRow | null>(null);
  const [excelImportStatus, setExcelImportStatus] = useState("");

  // Server mode — when normalized tables are ready, allow reading from PostgreSQL
  const [serverMode, setServerMode] = useState(false);
  const [serverData, setServerData] = useState<Record<string, unknown> | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const canUseServerMode = NORMALIZED_TABLES_READY;

  const fetchServerReport = async (reportType: string) => {
    if (!serverMode || !canUseServerMode) return;
    setServerLoading(true);
    try {
      const params = new URLSearchParams({
        date_from: fromDate,
        date_to:   toDate,
      });
      const res = await fetch(`/api/reports/${reportType}?${params}`);
      const data = await res.json();
      if (data.ok) setServerData(data);
    } catch { /* use local */ } finally {
      setServerLoading(false);
    }
  };

  useEffect(() => {
    if (serverMode) {
      const typeMap: Partial<Record<ReportTab, string>> = {
        sales: "sales", customers: "customers", products: "inventory",
        technicians: "technicians", expenses: "expenses",
      };
      const apiType = typeMap[tab];
      if (apiType) fetchServerReport(apiType);
    } else {
      setServerData(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, tab, fromDate, toDate]);

  const currency = settings.currency;
  const allServiceOrders = useMemo(() => [...urgentOrders, ...appointments], [urgentOrders, appointments]);
  const branchOptions = useMemo(() => ["all", ...(settings.branches || [])], [settings.branches]);
  const expenseCategories = useMemo(() => ["all", ...Array.from(new Set([...settings.expenseCategories, ...expenses.map((e) => e.category)].filter(Boolean)))], [settings.expenseCategories, expenses]);

  const applyPreset = (nextPreset: DatePreset) => {
    setPreset(nextPreset);
    const now = new Date();
    if (nextPreset === "all") {
      const dates = [...orders.map((o) => o.date), ...purchases.map((p) => p.date), ...expenses.map((e) => e.date), ...allServiceOrders.map((o) => o.date || o.createdAt)].filter(Number.isFinite);
      if (dates.length > 0) {
        setFromDate(dateInputValue(new Date(Math.min(...dates))));
        setToDate(dateInputValue(new Date(Math.max(...dates, now.getTime()))));
      }
      return;
    }
    if (nextPreset === "today") {
      setFromDate(dateInputValue(now));
      setToDate(dateInputValue(now));
      return;
    }
    if (nextPreset === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      setFromDate(dateInputValue(start));
      setToDate(dateInputValue(now));
      return;
    }
    if (nextPreset === "month") {
      setFromDate(dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
      setToDate(dateInputValue(now));
    }
  };

  const fromMs = asTimestamp(fromDate);
  const toMs = asTimestamp(toDate, true);
  const expenseFromMs = asTimestamp(expenseFrom);
  const expenseToMs = asTimestamp(expenseTo, true);
  const inRange = (date: number) => date >= fromMs && date <= toMs;
  const expenseInRange = (date: number) => date >= expenseFromMs && date <= expenseToMs;

  const filteredOrders = useMemo(() => orders.filter((order) => order.status === "active" && order.type !== "quotation" && inRange(order.date) && (branchFilter === "all" || order.branchName === branchFilter)), [orders, fromMs, toMs, branchFilter]);
  const filteredPurchases = useMemo(() => purchases.filter((purchase) => inRange(purchase.date)), [purchases, fromMs, toMs]);
  const filteredExpensesGlobal = useMemo(() => expenses.filter((expense) => inRange(expense.date)), [expenses, fromMs, toMs]);
  const filteredExpenses = useMemo(() => expenses.filter((expense) => expenseInRange(expense.date) && (expenseCategory === "all" || expense.category === expenseCategory)), [expenses, expenseFromMs, expenseToMs, expenseCategory]);
  const filteredServiceOrders = useMemo(() => allServiceOrders.filter((order) => inRange(order.date || order.createdAt)), [allServiceOrders, fromMs, toMs]);

  const costByOrderId = useMemo(() => new Map(filteredOrders.map((order) => [order.id, orderProductCost(order, catalog)])), [filteredOrders, catalog]);
  const salesTotal = filteredOrders.reduce((sum, order) => sum + signedOrderTotal(order), 0);
  const tabbyTamaraFees = filteredOrders.reduce((sum, order) => sum + tabbyTamaraFee(order), 0);
  const netRevenue = salesTotal - tabbyTamaraFees;
  const productCost = filteredOrders.reduce((sum, order) => sum + (costByOrderId.get(order.id) || 0), 0);
  const commissions = filteredOrders.reduce((sum, order) => sum + (order.technicianCommission || 0) + (order.referralCommission || 0), 0);
  const technicianExpenses = filteredExpensesGlobal.filter((expense) => expense.technicianName).reduce((sum, expense) => sum + expense.amount, 0) + techFinancialLogs.filter((log) => inRange(log.date) && (log.type === "expense" || log.type === "advance")).reduce((sum, log) => sum + log.amount, 0);
  const operatingExpenses = filteredExpensesGlobal.filter((expense) => !expense.technicianName).reduce((sum, expense) => sum + expense.amount, 0);
  const outputVat = filteredOrders.reduce((sum, order) => sum + (order.type === "return_invoice" ? -order.totalTax : order.totalTax), 0);
  const inputVat = filteredPurchases.reduce((sum, purchase) => sum + (purchase.type === "return" ? -purchase.totalTax : purchase.totalTax), 0);
  const netVat = outputVat - inputVat;
  const netProfit = netRevenue - productCost - commissions - technicianExpenses - operatingExpenses;

  const trendRows = useMemo(() => {
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [] as TrendRow[];
    const useMonthly = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000) > 62;
    const keyFor = (dateMs: number) => {
      const d = new Date(dateMs);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return useMonthly ? `${yyyy}-${mm}` : `${yyyy}-${mm}-${dd}`;
    };
    const labelFor = (d: Date) => useMonthly ? d.toLocaleDateString("ar-SA", { month: "short", year: "numeric" }) : d.toLocaleDateString("ar-SA", { day: "2-digit", month: "short" });
    const rows: TrendRow[] = [];
    const byKey = new Map<string, TrendRow>();
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    if (useMonthly) cursor.setDate(1);
    while (cursor <= end) {
      const row: TrendRow = { label: labelFor(cursor), sales: 0, expenses: 0, profit: 0, purchases: 0, outputVat: 0, inputVat: 0 };
      rows.push(row);
      byKey.set(keyFor(cursor.getTime()), row);
      if (useMonthly) cursor.setMonth(cursor.getMonth() + 1); else cursor.setDate(cursor.getDate() + 1);
    }
    filteredOrders.forEach((order) => {
      const row = byKey.get(keyFor(order.date));
      if (!row) return;
      const revenue = signedOrderTotal(order);
      row.sales += revenue;
      row.outputVat += order.type === "return_invoice" ? -order.totalTax : order.totalTax;
      row.profit += revenue - orderProductCost(order, catalog) - (order.technicianCommission || 0) - (order.referralCommission || 0) - tabbyTamaraFee(order);
    });
    filteredExpensesGlobal.forEach((expense) => {
      const row = byKey.get(keyFor(expense.date));
      if (row) {
        row.expenses += expense.amount;
        row.profit -= expense.amount;
      }
    });
    filteredPurchases.forEach((purchase) => {
      const row = byKey.get(keyFor(purchase.date));
      if (!row) return;
      row.purchases += signedPurchaseTotal(purchase);
      row.inputVat += purchase.type === "return" ? -purchase.totalTax : purchase.totalTax;
    });
    return rows;
  }, [filteredOrders, filteredExpensesGlobal, filteredPurchases, catalog, fromDate, toDate]);

  const salesByPayment = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((order) => map.set(PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod, (map.get(PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod) || 0) + signedOrderTotal(order)));
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [filteredOrders]);

  const productSales = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; category: string; cost: number }>();
    filteredOrders.forEach((order) => {
      const sign = order.type === "return_invoice" ? -1 : 1;
      order.items.forEach((item) => {
        const catalogItem = catalog.find((c) => c.id === item.catalogId);
        const entry = map.get(item.catalogId) || { name: item.name, qty: 0, revenue: 0, category: catalogItem?.category || "غير مصنف", cost: 0 };
        entry.qty += sign * item.qty;
        entry.revenue += sign * (item.price * item.qty - item.discount);
        entry.cost += sign * (catalogItem?.costPrice || 0) * item.qty;
        map.set(item.catalogId, entry);
      });
    });
    return Array.from(map.values()).sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty));
  }, [filteredOrders, catalog]);

  const salesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    productSales.forEach((item) => map.set(item.category, (map.get(item.category) || 0) + item.revenue));
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [productSales]);

  const dailySalesRows = useMemo(() => trendRows.filter((row) => row.sales || row.expenses || row.profit), [trendRows]);

  const expenseCategoryRows = useMemo(() => {
    const map = new Map<string, number>();
    filteredExpenses.forEach((expense) => map.set(expense.category, (map.get(expense.category) || 0) + expense.amount));
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filteredExpenses]);

  const technicianExpenseRows = useMemo(() => filteredExpenses.filter((expense) => expense.technicianName), [filteredExpenses]);
  const publicExpenseRows = useMemo(() => filteredExpenses.filter((expense) => !expense.technicianName), [filteredExpenses]);

  const technicianRows = useMemo<TechnicianReportRow[]>(() => {
    const map = new Map<string, TechnicianReportRow>();
    const ensure = (name: string) => {
      const key = name || "غير معين";
      const found = map.get(key) || { name: key, salesCount: 0, serviceCount: 0, revenue: 0, cost: 0, commission: 0, grossProfit: 0, expenses: 0, net: 0 };
      map.set(key, found);
      return found;
    };
    filteredOrders.forEach((order) => {
      const name = order.technicianName || "غير معين";
      const row = ensure(name);
      row.salesCount += 1;
      const revenue = signedOrderTotal(order);
      const cost = costByOrderId.get(order.id) || 0;
      row.revenue += revenue;
      row.cost += cost;
      row.commission += order.technicianCommission || 0;
      row.grossProfit += revenue - cost;
    });
    filteredServiceOrders.forEach((order) => {
      const name = order.acceptedByTechnicianName || order.technicianName || "غير معين";
      ensure(name).serviceCount += 1;
    });
    filteredExpensesGlobal.filter((expense) => expense.technicianName).forEach((expense) => ensure(expense.technicianName || "غير معين").expenses += expense.amount);
    techFinancialLogs.filter((log) => inRange(log.date)).forEach((log) => {
      const row = ensure(log.technicianName);
      if (log.type === "settlement") row.expenses -= log.amount;
      else row.expenses += log.amount;
    });
    map.forEach((row) => { row.net = row.grossProfit - row.commission - row.expenses; });
    return Array.from(map.values()).filter((row) => row.salesCount || row.serviceCount || row.expenses).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [filteredOrders, filteredServiceOrders, filteredExpensesGlobal, techFinancialLogs, costByOrderId]);

  const customerRows = useMemo<CustomerReportRow[]>(() => {
    return customers.map((customer) => {
      const customerOrders = filteredOrders.filter((order) => order.customerId === customer.id || order.customerName === customer.name);
      const customerServices = filteredServiceOrders.filter((order) => order.customerId === customer.id || order.customerPhone === customer.phone || order.customerName === customer.name);
      const lastOrder = [...customerOrders].sort((a, b) => b.date - a.date)[0];
      const lastService = [...customerServices].sort((a, b) => (b.date || b.createdAt) - (a.date || a.createdAt))[0];
      const lastInteraction = Math.max(lastOrder?.date || 0, lastService?.date || lastService?.createdAt || customer.createdAt || 0);
      const products = new Set<string>();
      customerOrders.forEach((order) => order.items.forEach((item) => products.add(item.name)));
      customerServices.forEach((order) => (order.requestedItems || []).forEach((item) => products.add(item.name)));
      return {
        customer,
        invoiceCount: customerOrders.length,
        totalPurchases: customerOrders.reduce((sum, order) => sum + signedOrderTotal(order), 0),
        lastTechnician: lastOrder?.technicianName || lastService?.acceptedByTechnicianName || lastService?.technicianName || "-",
        lastInteraction,
        serviceCount: customerServices.length,
        products: Array.from(products),
      };
    }).filter((row) => row.invoiceCount || row.serviceCount || (row.customer.createdAt && inRange(row.customer.createdAt))).sort((a, b) => b.totalPurchases - a.totalPurchases);
  }, [customers, filteredOrders, filteredServiceOrders, fromMs, toMs]);

  const customerTypeRows = useMemo(() => {
    const leads = customers.filter((c) => c.type === "lead").length;
    const actual = customers.filter((c) => c.type === "customer").length;
    return [{ label: "عملاء فعليون", value: actual }, { label: "عملاء محتملون", value: leads }];
  }, [customers]);

  const customerCityRows = useMemo(() => {
    const map = new Map<string, number>();
    customers.forEach((customer) => {
      const city = customer.locations?.[0]?.city || "غير محدد";
      map.set(city, (map.get(city) || 0) + 1);
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [customers]);

  const purchaseRows = useMemo(() => filteredPurchases.sort((a, b) => b.date - a.date), [filteredPurchases]);
  const inventoryValue = catalog.filter((item) => item.type === "product").reduce((sum, item) => sum + (item.stock || 0) * (item.costPrice || 0), 0);
  const lowStockRows = catalog.filter((item) => item.type === "product" && (item.stock || 0) <= 5).map((item) => ({ label: item.name, value: item.stock || 0, sublabel: item.category || item.barcode || "" })).sort((a, b) => a.value - b.value);

  const printCustomer = (row: CustomerReportRow) => {
    setSelectedCustomer(row);
    setTimeout(() => printElementById("print-customer-statement", `كشف حساب ${row.customer.name}`), 50);
  };

  const printTechnician = (row: TechnicianReportRow) => {
    setSelectedTechnician(row);
    setTimeout(() => printElementById("print-technician-statement", `كشف حساب ${row.name}`), 50);
  };

  const currentReportRows = (): { prefix: string; sheetName: string; rows: Record<string, unknown>[] } => {
    const suffix = `${tab}-${fromDate}-to-${toDate}`;
    if (tab === "sales" || tab === "all") {
      return { prefix: `sales-report-${suffix}`, sheetName: "salesReport", rows: dailySalesRows.map((row) => ({ Day: row.label, Sales: row.sales.toFixed(2), Expenses: row.expenses.toFixed(2), Profit: row.profit.toFixed(2) })) };
    }
    if (tab === "expenses") {
      return { prefix: `expenses-report-${expenseFrom}-to-${expenseTo}`, sheetName: "expensesReport", rows: filteredExpenses.map((expense) => ({ Date: dateLabel(expense.date), Category: expense.category, Description: expense.description, Amount: expense.amount, Technician: expense.technicianName || "" })) };
    }
    if (tab === "technicians") {
      return { prefix: `technicians-report-${suffix}`, sheetName: "techniciansReport", rows: technicianRows as unknown as Record<string, unknown>[] };
    }
    if (tab === "customers") {
      return { prefix: `customers-report-${suffix}`, sheetName: "customersReport", rows: customerRows.map((row) => ({ Customer: row.customer.name, Phone: row.customer.phone, Invoices: row.invoiceCount, ServiceOrders: row.serviceCount, TotalPurchases: row.totalPurchases, LastTechnician: row.lastTechnician, LastInteraction: dateLabel(row.lastInteraction) })) };
    }
    if (tab === "purchases") {
      return { prefix: `purchases-report-${suffix}`, sheetName: "purchasesReport", rows: purchaseRows.map((purchase) => ({ Vendor: purchase.vendorName, Date: dateLabel(purchase.date), Type: purchase.type, Total: purchase.grandTotal })) };
    }
    if (tab === "products") {
      return { prefix: `products-report-${suffix}`, sheetName: "productsReport", rows: productSales.map((product) => ({ Product: product.name, Qty: product.qty, Revenue: product.revenue, Cost: product.cost, Category: product.category })) };
    }
    return { prefix: `stock-report-${suffix}`, sheetName: "stockReport", rows: lowStockRows.map((row) => ({ Product: row.label, Stock: row.value, Category: row.sublabel || "" })) };
  };

  const exportCurrent = () => {
    const { prefix, rows } = currentReportRows();
    exportToCSV(`${prefix}.csv`, rows);
  };

  const exportCurrentXlsx = async () => {
    const { prefix, sheetName, rows } = currentReportRows();
    await downloadWorkbookXlsx(makeXlsxFileName(prefix), { [sheetName]: rows } as WorkbookPayload);
  };

  const importXlsxToData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setExcelImportStatus("جارٍ استيراد ملف Excel إلى بيانات النظام…");
      const parsed = await readWorkbookImport(file);
      const { imported, empty } = applyBackupPayload(parsed.payload, "merge");
      if (empty) {
        setExcelImportStatus("لم يتم العثور على شيتات بيانات قابلة للاستيراد. استخدم ملف Excel مُصدّر من النظام أو شيت باسم customers/catalog/orders/expenses…");
        return;
      }
      const cloud = await saveToSupabaseBackup(buildFullPayload());
      setExcelImportStatus(`تم الاستيراد: ${imported.join(", ")}. ${cloud.message} جارٍ إعادة التحميل…`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      setExcelImportStatus(`❌ ${err?.message || "تعذر استيراد Excel."}`);
    } finally {
      e.target.value = "";
    }
  };

  const renderSalesReport = () => {
    // Server mode: show server data in a dedicated table
    const serverInvoices = serverMode && Array.isArray(serverData?.invoices)
      ? (serverData!.invoices as Record<string, unknown>[])
      : null;
    const serverSummary = serverMode && serverData?.summary
      ? serverData.summary as Record<string, unknown>
      : null;

    return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">تقارير المبيعات والإيرادات</h2>

      {/* Server mode: show PostgreSQL data */}
      {serverSummary && (
        <Card className="border-brand-200 bg-brand-50">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-brand-700">🗄️ بيانات Supabase</span>
            <span className="ms-auto text-xs text-slate-400">Server Mode</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(serverSummary)
              .filter(([, v]) => typeof v === "number")
              .map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white p-2 text-center shadow-sm">
                  <div className="text-base font-bold text-brand-700">{money(Number(v), currency)}</div>
                  <div className="text-xs text-slate-500">{k}</div>
                </div>
              ))}
          </div>
          {serverInvoices && (
            <div className="mt-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">آخر الفواتير (من Supabase)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="px-2 py-1 text-start">رقم الفاتورة</th>
                    <th className="px-2 py-1 text-start">العميل</th>
                    <th className="px-2 py-1 text-start">طريقة الدفع</th>
                    <th className="px-2 py-1 text-start">الإجمالي</th>
                    <th className="px-2 py-1 text-start">التاريخ</th>
                  </tr></thead>
                  <tbody>
                    {serverInvoices.slice(0, 20).map((inv, i) => (
                      <tr key={String(inv.id ?? i)} className="border-b border-slate-100">
                        <td className="px-2 py-1 font-mono text-xs">{String(inv.invoice_number ?? "—")}</td>
                        <td className="px-2 py-1">{String(inv.customer_name ?? "—")}</td>
                        <td className="px-2 py-1">{String(inv.payment_method ?? "—")}</td>
                        <td className="px-2 py-1 font-medium">{money(Number(inv.grand_total ?? 0), currency)}</td>
                        <td className="px-2 py-1 text-xs text-slate-500">
                          {inv.issued_at ? new Date(String(inv.issued_at)).toLocaleDateString("ar-SA") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {serverInvoices.length > 20 && (
                  <p className="mt-1 text-xs text-slate-400">عرض أول 20 فاتورة من أصل {serverInvoices.length}</p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="إجمالي المبيعات" value={money(salesTotal, currency)} />
        <SummaryCard label="صافي الإيرادات بعد تابي/تمارا" value={money(netRevenue, currency)} hint={`رسوم تابي/تمارا: ${money(tabbyTamaraFees, currency)}`} />
        <SummaryCard label="صافي الأرباح" value={money(netProfit, currency)} />
        <SummaryCard label="المصروفات التشغيلية" value={money(operatingExpenses, currency)} />
        <SummaryCard label="مصروفات الفنيين" value={money(technicianExpenses, currency)} />
        <SummaryCard label="الضرائب المستحقة" value={money(netVat, currency)} />
      </div>
      <CurveChart title="أداء المبيعات حسب الأيام" rows={trendRows} currency={currency} series={[{ key: "sales", label: "المبيعات", color: "#0ea5e9" }, { key: "expenses", label: "المصروفات", color: "#f97316" }, { key: "profit", label: "الربح", color: "#22c55e" }]} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DonutChart title="توزيع المبيعات حسب طريقة الدفع" rows={salesByPayment} currency={currency} />
        <DonutChart title="توزيع المبيعات حسب فئة المنتج" rows={salesByCategory} currency={currency} />
      </div>
      <Card>
        <h3 className="mb-3 font-semibold">جدول تفاصيل مبيعات الأيام</h3>
        <Table headers={["اليوم", "المبيعات", "المصروفات", "الربح"]}>
          {dailySalesRows.map((row) => <tr key={row.label} className="border-b border-slate-100"><td className="px-2 py-2">{row.label}</td><td className="px-2 py-2">{money(row.sales, currency)}</td><td className="px-2 py-2">{money(row.expenses, currency)}</td><td className="px-2 py-2 font-medium">{money(row.profit, currency)}</td></tr>)}
        </Table>
        {dailySalesRows.length === 0 && <p className="mt-2 text-sm text-slate-400">لا توجد بيانات.</p>}
      </Card>
    </section>
  );
  };

  const renderExpensesReport = () => (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">تقارير المصروفات</h2>
      <Card className="no-print">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div><label className="mb-1 block text-xs font-medium">من تاريخ</label><Input type="date" value={expenseFrom} onChange={(e) => setExpenseFrom(e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium">إلى تاريخ</label><Input type="date" value={expenseTo} onChange={(e) => setExpenseTo(e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium">تصنيف المصروف</label><Select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>{expenseCategories.map((cat) => <option key={cat} value={cat}>{cat === "all" ? "كل التصنيفات" : cat}</option>)}</Select></div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="إجمالي المصروفات" value={money(filteredExpenses.reduce((s, e) => s + e.amount, 0), currency)} />
        <SummaryCard label="مصروفات الفنيين" value={money(technicianExpenseRows.reduce((s, e) => s + e.amount, 0), currency)} />
        <SummaryCard label="المصروفات الخارجية / العامة" value={money(publicExpenseRows.reduce((s, e) => s + e.amount, 0), currency)} />
      </div>
      <DonutChart title="توزيع المصروفات حسب التصنيف" rows={expenseCategoryRows} currency={currency} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">تفصيل مصروفات الفنيين</h3>
          <Table headers={["التاريخ", "الفني", "التصنيف", "البيان", "المبلغ"]}>{technicianExpenseRows.map((expense) => <tr key={expense.id} className="border-b border-slate-100"><td className="px-2 py-2">{dateLabel(expense.date)}</td><td className="px-2 py-2">{expense.technicianName}</td><td className="px-2 py-2">{expense.category}</td><td className="px-2 py-2">{expense.description}</td><td className="px-2 py-2">{money(expense.amount, currency)}</td></tr>)}</Table>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">تفصيل المصروفات حسب الفئة</h3>
          <Table headers={["التصنيف", "الإجمالي"]}>{expenseCategoryRows.map((row) => <tr key={row.label} className="border-b border-slate-100"><td className="px-2 py-2">{row.label}</td><td className="px-2 py-2">{money(row.value, currency)}</td></tr>)}</Table>
        </Card>
      </div>
    </section>
  );

  const renderTechniciansReport = () => (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">تقارير الفنيين</h2>
      <BarChart title="أداء الفنيين حسب صافي الربح" rows={technicianRows.slice(0, 10).map((row) => ({ label: row.name, value: row.net, sublabel: `مبيعات: ${row.salesCount} | صيانة: ${row.serviceCount}` }))} currency={currency} />
      <Card>
        <Table headers={["الفني", "المبيعات", "طلبات الصيانة", "الإيرادات", "التكلفة", "العمولة", "صافي الأرباح", "المصروفات", "صافي الفني", ""]}>{technicianRows.map((row) => <tr key={row.name} className="border-b border-slate-100"><td className="px-2 py-2 font-medium">{row.name}</td><td className="px-2 py-2">{row.salesCount}</td><td className="px-2 py-2">{row.serviceCount}</td><td className="px-2 py-2">{money(row.revenue, currency)}</td><td className="px-2 py-2">{money(row.cost, currency)}</td><td className="px-2 py-2">{money(row.commission, currency)}</td><td className="px-2 py-2">{money(row.grossProfit, currency)}</td><td className="px-2 py-2">{money(row.expenses, currency)}</td><td className="px-2 py-2 font-bold">{money(row.net, currency)}</td><td className="px-2 py-2 no-print"><Button variant="secondary" onClick={() => printTechnician(row)}>طباعة كشف</Button></td></tr>)}</Table>
        {technicianRows.length === 0 && <p className="mt-2 text-sm text-slate-400">لا توجد بيانات فنيين.</p>}
      </Card>
    </section>
  );

  const renderCustomersReport = () => {
    const serverCustomers = serverMode && Array.isArray(serverData?.customers)
      ? (serverData!.customers as Record<string, unknown>[])
      : null;
    return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">تقارير العملاء</h2>
      {serverCustomers && serverCustomers.length > 0 && (
        <Card className="border-brand-200 bg-brand-50">
          <p className="mb-2 text-xs font-semibold text-brand-700">🗄️ أرصدة العملاء من Supabase ({serverCustomers.length} عميل)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="px-2 py-1 text-start">العميل</th>
                <th className="px-2 py-1 text-start">الفواتير</th>
                <th className="px-2 py-1 text-start">الإجمالي</th>
                <th className="px-2 py-1 text-start">المدفوع</th>
                <th className="px-2 py-1 text-start">المتبقي</th>
              </tr></thead>
              <tbody>
                {serverCustomers.slice(0, 15).map((c, i) => (
                  <tr key={String(c.customer_id ?? i)} className="border-b border-slate-100">
                    <td className="px-2 py-1 font-medium">{String(c.customer_name ?? "—")}</td>
                    <td className="px-2 py-1">{String(c.invoice_count ?? 0)}</td>
                    <td className="px-2 py-1">{money(Number(c.total_invoiced ?? 0), currency)}</td>
                    <td className="px-2 py-1 text-green-700">{money(Number(c.total_paid ?? 0), currency)}</td>
                    <td className={`px-2 py-1 font-semibold ${Number(c.outstanding ?? 0) > 0 ? "text-red-600" : "text-slate-400"}`}>
                      {money(Number(c.outstanding ?? 0), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DonutChart title="توزيع العملاء الفعليين والعملاء المحتملين" rows={customerTypeRows} />
        <BarChart title="توزيع العملاء حسب المدن" rows={customerCityRows} />
      </div>
      <Card>
        <Table headers={["العميل", "الجوال", "عدد الفواتير", "إجمالي المشتريات", "آخر فني/مندوب", "آخر تفاعل", ""]}>{customerRows.map((row) => <tr key={row.customer.id} className="border-b border-slate-100"><td className="px-2 py-2 font-medium">{row.customer.name}</td><td className="px-2 py-2">{row.customer.phone}</td><td className="px-2 py-2">{row.invoiceCount}</td><td className="px-2 py-2">{money(row.totalPurchases, currency)}</td><td className="px-2 py-2">{row.lastTechnician}</td><td className="px-2 py-2">{dateLabel(row.lastInteraction)}</td><td className="px-2 py-2 no-print"><div className="flex gap-2"><Button variant="secondary" onClick={() => setSelectedCustomer(row)}>تفاصيل</Button><Button onClick={() => printCustomer(row)}>طباعة</Button></div></td></tr>)}</Table>
        {customerRows.length === 0 && <p className="mt-2 text-sm text-slate-400">لا توجد بيانات عملاء ضمن الفترة.</p>}
      </Card>
      {selectedCustomer && (
        <Card className="border-brand-200 bg-brand-50/40 no-print">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">تفاصيل العميل: {selectedCustomer.customer.name}</h3><Button variant="secondary" onClick={() => setSelectedCustomer(null)}>إغلاق</Button></div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4"><SummaryCard label="عدد الفواتير" value={String(selectedCustomer.invoiceCount)} /><SummaryCard label="عدد طلبات الصيانة" value={String(selectedCustomer.serviceCount)} /><SummaryCard label="إجمالي المشتريات" value={money(selectedCustomer.totalPurchases, currency)} /><SummaryCard label="تاريخ آخر طلب" value={dateLabel(selectedCustomer.lastInteraction)} /></div>
          <div className="mt-3 text-sm"><span className="font-medium">المنتجات المطلوبة سابقًا: </span>{selectedCustomer.products.length ? selectedCustomer.products.join("، ") : "لا توجد"}</div>
          <Button className="mt-3" onClick={() => printCustomer(selectedCustomer)}>طباعة تقرير / كشف حساب العميل</Button>
        </Card>
      )}
    </section>
  );
  };

  const renderPurchasesReport = () => (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">تقارير المشتريات والمخزون</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><SummaryCard label="إجمالي قيمة المخزون بالتكلفة" value={money(inventoryValue, currency)} /><SummaryCard label="إجمالي المشتريات" value={money(purchaseRows.reduce((s, p) => s + signedPurchaseTotal(p), 0), currency)} /><SummaryCard label="ضريبة المدخلات" value={money(inputVat, currency)} /></div>
      <CurveChart title="منحنى المشتريات" rows={trendRows} currency={currency} series={[{ key: "purchases", label: "المشتريات", color: "#0ea5e9" }, { key: "inputVat", label: "ضريبة المدخلات", color: "#f97316" }]} />
      <Card>
        <h3 className="mb-3 font-semibold">فواتير المشتريات والمرتجعات</h3>
        <Table headers={["المورد", "التاريخ", "النوع", "الإجمالي"]}>{purchaseRows.map((purchase) => <tr key={purchase.id} className="border-b border-slate-100"><td className="px-2 py-2">{purchase.vendorName || vendors.find((v) => v.id === purchase.vendorId)?.name || "-"}</td><td className="px-2 py-2">{dateLabel(purchase.date)}</td><td className="px-2 py-2">{purchase.type === "return" ? "مرتجع" : "شراء"}</td><td className="px-2 py-2">{money(purchase.grandTotal, currency)}</td></tr>)}</Table>
      </Card>
    </section>
  );

  const renderProductsReport = () => (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">تقارير المنتجات</h2>
      <BarChart title="أكثر المنتجات مبيعًا حسب الكمية" rows={productSales.slice(0, 12).map((item) => ({ label: item.name, value: item.qty, sublabel: item.category }))} />
      <BarChart title="مبيعات المنتجات حسب الإيراد" rows={productSales.slice(0, 12).map((item) => ({ label: item.name, value: item.revenue, sublabel: `كمية: ${item.qty}` }))} currency={currency} />
      <Card>
        <Table headers={["المنتج", "الفئة", "الكمية المباعة", "الإيراد", "التكلفة", "الربح التقريبي"]}>{productSales.map((item) => <tr key={item.name} className="border-b border-slate-100"><td className="px-2 py-2">{item.name}</td><td className="px-2 py-2">{item.category}</td><td className="px-2 py-2">{item.qty}</td><td className="px-2 py-2">{money(item.revenue, currency)}</td><td className="px-2 py-2">{money(item.cost, currency)}</td><td className="px-2 py-2">{money(item.revenue - item.cost, currency)}</td></tr>)}</Table>
      </Card>
    </section>
  );

  const renderStockReport = () => (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-slate-800">تقارير حركة المنتجات / نواقص المخزون</h2>
      {lowStockRows.length === 0 ? <Card><p className="text-green-700">المخزون بوضع جيد، لا توجد منتجات منخفضة المخزون.</p></Card> : <BarChart title="المنتجات منخفضة المخزون (5 أو أقل)" rows={lowStockRows} />}
      <Card>
        <Table headers={["المنتج", "المخزون الحالي", "الفئة / ملاحظة"]}>{lowStockRows.map((row) => <tr key={row.label} className="border-b border-slate-100"><td className="px-2 py-2">{row.label}</td><td className="px-2 py-2">{row.value}</td><td className="px-2 py-2">{row.sublabel}</td></tr>)}</Table>
      </Card>
    </section>
  );

  const renderSelectedReport = () => {
    // Drop old serverSummaryBlock (now integrated in each render function)
    if (tab === "all") return <div className="space-y-8">{renderSalesReport()}{renderExpensesReport()}{renderTechniciansReport()}{renderCustomersReport()}{renderPurchasesReport()}{renderProductsReport()}{renderStockReport()}</div>;
    if (tab === "sales")       return <div className="space-y-4">{renderSalesReport()}</div>;
    if (tab === "expenses")    return <div className="space-y-4">{renderExpensesReport()}</div>;
    if (tab === "technicians") return <div className="space-y-4">{renderTechniciansReport()}</div>;
    if (tab === "customers")   return <div className="space-y-4">{renderCustomersReport()}</div>;
    if (tab === "purchases")   return <div className="space-y-4">{renderPurchasesReport()}</div>;
    if (tab === "products")    return <div className="space-y-4">{renderProductsReport()}</div>;
    return <div className="space-y-4">{renderStockReport()}</div>;
  };

  const selectedCustomerOrders = selectedCustomer ? orders.filter((order) => order.customerId === selectedCustomer.customer.id || order.customerName === selectedCustomer.customer.name) : [];
  const selectedCustomerServices = selectedCustomer ? allServiceOrders.filter((order) => order.customerId === selectedCustomer.customer.id || order.customerPhone === selectedCustomer.customer.phone || order.customerName === selectedCustomer.customer.name) : [];
  const selectedTechnicianOrders = selectedTechnician ? orders.filter((order) => order.technicianName === selectedTechnician.name) : [];
  const selectedTechnicianServices = selectedTechnician ? allServiceOrders.filter((order) => order.acceptedByTechnicianName === selectedTechnician.name || order.technicianName === selectedTechnician.name) : [];
  const selectedTechnicianExpenses = selectedTechnician ? expenses.filter((expense) => expense.technicianName === selectedTechnician.name) : [];
  const selectedTechnicianFinancial = selectedTechnician ? techFinancialLogs.filter((log) => log.technicianName === selectedTechnician.name) : [];
  const selectedTechnicianInventory = selectedTechnician ? techInventory.filter((item) => item.technicianName === selectedTechnician.name) : [];

  return (
    <div className="space-y-5" dir="rtl">
      <PageTitle title="التقارير" action={<div className="flex flex-wrap items-center gap-2 no-print">
        {/* Server/Local mode toggle */}
        {canUseServerMode && (
          <button
            onClick={() => setServerMode(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              serverMode
                ? "bg-brand-100 text-brand-700 border border-brand-300"
                : "bg-slate-100 text-slate-600 border border-slate-200"
            }`}
          >
            {serverMode
              ? (serverLoading ? "⏳ من Supabase…" : "🗄️ Supabase")
              : "💾 محلي"}
          </button>
        )}
        <Button variant="secondary" onClick={exportCurrent}>تصدير التقرير الحالي CSV</Button>
        <Button variant="secondary" onClick={exportCurrentXlsx}>تصدير التقرير Excel</Button>
        <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">استيراد Excel للبيانات<input type="file" accept=".xlsx,.xls" className="hidden" onChange={importXlsxToData} /></label>
        <Button onClick={() => window.print()}>طباعة التقرير الحالي</Button>
      </div>} />

      {excelImportStatus && <Card className="no-print text-sm text-slate-600">{excelImportStatus}</Card>}

      {/* Server mode data notice */}
      {serverMode && serverData && (
        <Card className="no-print flex items-center gap-2 text-sm text-brand-700 border border-brand-200 bg-brand-50">
          <span>🗄️</span>
          <span>البيانات أدناه من Supabase PostgreSQL (Server Mode)</span>
          {serverData.summary ? (
            <pre className="ms-auto text-xs text-slate-500">{JSON.stringify(serverData.summary as Record<string, unknown>, null, 2)}</pre>
          ) : null}
        </Card>
      )}

      <Card className="no-print">
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-6">
          <div><label className="mb-1 block text-xs font-medium">الفترة</label><Select value={preset} onChange={(e) => applyPreset(e.target.value as DatePreset)}><option value="all">الكل</option><option value="today">اليوم</option><option value="week">هذا الأسبوع</option><option value="month">هذا الشهر</option><option value="custom">تاريخ مخصص</option></Select></div>
          <div><label className="mb-1 block text-xs font-medium">من تاريخ</label><Input type="date" value={fromDate} onChange={(e) => { setPreset("custom"); setFromDate(e.target.value); }} /></div>
          <div><label className="mb-1 block text-xs font-medium">إلى تاريخ</label><Input type="date" value={toDate} onChange={(e) => { setPreset("custom"); setToDate(e.target.value); }} /></div>
          {branchOptions.length > 2 && <div><label className="mb-1 block text-xs font-medium">الفرع</label><Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>{branchOptions.map((branch) => <option key={branch} value={branch}>{branch === "all" ? "كل الفروع" : branch}</option>)}</Select></div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {REPORT_TABS.map((item) => <button key={item.key} onClick={() => setTab(item.key)} className={`rounded-full px-3 py-1.5 text-sm ${tab === item.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item.label}</button>)}
        </div>
      </Card>

      <div className="print-root space-y-6 rounded-2xl bg-white/50 p-0 print:bg-white">
        <Card className="print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-xs text-slate-400">{settings.companyHeader?.name || "الشركة"}</div><h2 className="text-2xl font-bold text-slate-900">{REPORT_TABS.find((item) => item.key === tab)?.label || "التقارير"}</h2></div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"><div>الفترة: {fromDate} → {toDate}</div><div>تاريخ الإصدار: {new Date().toLocaleString("ar-SA")}</div></div>
          </div>
        </Card>
        {renderSelectedReport()}
      </div>

      <div className="hidden">
        {selectedCustomer && <div id="print-customer-statement"><PrintCustomerStatement customer={selectedCustomer.customer} orders={selectedCustomerOrders} serviceOrders={selectedCustomerServices} settings={settings} /></div>}
        {selectedTechnician && <div id="print-technician-statement"><PrintTechnicianStatement technicianName={selectedTechnician.name} orders={selectedTechnicianOrders} serviceOrders={selectedTechnicianServices} expenses={selectedTechnicianExpenses} financialLogs={selectedTechnicianFinancial} inventoryItems={selectedTechnicianInventory} settings={settings} /></div>}
      </div>
    </div>
  );
}
