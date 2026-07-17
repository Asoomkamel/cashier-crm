/**
 * lib/modules/reports/service.ts
 *
 * Reports computation layer — Phase 5.
 *
 * All functions are pure: input data → output metrics.
 * No localStorage, no React, no Supabase calls.
 *
 * Currently reads from the local-first data model.
 * When server reports are enabled, the calling page can swap the data source
 * transparently — these functions stay the same.
 */

import {
  Order,
  OrderItem,
  PurchaseInvoice,
  Expense,
  CatalogItem,
  TechInventoryItem,
  TechInventoryLog,
  TechFinancialLog,
  CustomerPayment,
  Customer,
  StaffUser,
  ServiceOrder,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export interface DateRange {
  from?: number; // ms timestamp
  to?: number;
}

export interface ReportFilters {
  dateRange?: DateRange;
  branchName?: string;
  technicianName?: string;
  customerId?: string;
  paymentMethod?: string;
  category?: string;
}

function inRange(ts: number, range?: DateRange): boolean {
  if (!range) return true;
  if (range.from && ts < range.from) return false;
  if (range.to && ts > range.to) return false;
  return true;
}

function filterOrders(orders: Order[], f: ReportFilters): Order[] {
  return orders.filter((o) => {
    if (!inRange(o.date, f.dateRange)) return false;
    if (f.branchName && o.branchName !== f.branchName) return false;
    if (f.technicianName && o.technicianName !== f.technicianName) return false;
    if (f.customerId && o.customerId !== f.customerId) return false;
    if (f.paymentMethod && o.paymentMethod !== f.paymentMethod) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Sales report
// ---------------------------------------------------------------------------

export interface SalesReportResult {
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  totalCost: number;
  grossProfit: number;
  grossProfitMargin: number;
  invoiceCount: number;
  returnCount: number;
  returnTotal: number;
  netRevenue: number;
  byPaymentMethod: Record<string, { count: number; total: number }>;
  byCategory: Record<string, { count: number; total: number }>;
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  dailySales: Array<{ date: string; total: number; count: number }>;
}

export function computeSalesReport(
  orders: Order[],
  catalog: CatalogItem[],
  filters: ReportFilters = {}
): SalesReportResult {
  const filtered = filterOrders(
    orders.filter((o) => o.status !== "deleted"),
    filters
  );
  const sales = filtered.filter((o) => o.type === "tax_invoice");
  const returns_ = filtered.filter((o) => o.type === "return_invoice");

  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  const byPaymentMethod: Record<string, { count: number; total: number }> = {};
  const byCategory: Record<string, { count: number; total: number }> = {};
  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  const dailyMap: Record<string, { total: number; count: number }> = {};

  let totalRevenue = 0;
  let totalTax = 0;
  let totalDiscount = 0;
  let totalCost = 0;

  for (const order of sales) {
    totalRevenue += order.grandTotal;
    totalTax += order.totalTax;
    totalDiscount += order.totalDiscount + (order.cartDiscount || 0);

    // Payment method
    const pm = order.paymentMethod || "cash";
    if (!byPaymentMethod[pm]) byPaymentMethod[pm] = { count: 0, total: 0 };
    byPaymentMethod[pm].count++;
    byPaymentMethod[pm].total += order.grandTotal;

    // Daily
    const day = new Date(order.date).toISOString().slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { total: 0, count: 0 };
    dailyMap[day].total += order.grandTotal;
    dailyMap[day].count++;

    // Products
    for (const item of order.items) {
      const cat = catalogById.get(item.catalogId);
      const category = cat?.category || "Other";

      if (!byCategory[category]) byCategory[category] = { count: 0, total: 0 };
      const lineTotal = item.price * item.qty - item.discount;
      byCategory[category].count += item.qty;
      byCategory[category].total += lineTotal;

      totalCost += (cat?.costPrice || 0) * item.qty;

      const key = item.catalogId || item.name;
      if (!productMap[key]) productMap[key] = { name: item.name, qty: 0, revenue: 0 };
      productMap[key].qty += item.qty;
      productMap[key].revenue += lineTotal;
    }
  }

  const returnTotal = returns_.reduce((s, o) => s + o.grandTotal, 0);
  const netRevenue = totalRevenue - returnTotal;
  const grossProfit = netRevenue - totalCost;

  const topProducts = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const dailySales = Object.entries(dailyMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalRevenue,
    totalTax,
    totalDiscount,
    totalCost,
    grossProfit,
    grossProfitMargin: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
    invoiceCount: sales.length,
    returnCount: returns_.length,
    returnTotal,
    netRevenue,
    byPaymentMethod,
    byCategory,
    topProducts,
    dailySales,
  };
}

// ---------------------------------------------------------------------------
// Tax report (VAT / ZATCA)
// ---------------------------------------------------------------------------

export interface TaxReportResult {
  totalSalesBeforeTax: number;
  totalSalesTax: number;
  totalPurchasesTax: number;
  netTaxOwed: number;
  invoiceCount: number;
}

export function computeTaxReport(
  orders: Order[],
  purchases: PurchaseInvoice[],
  filters: ReportFilters = {}
): TaxReportResult {
  const filteredOrders = filterOrders(
    orders.filter((o) => o.status !== "deleted" && o.type === "tax_invoice"),
    filters
  );
  const filteredPurchases = purchases.filter((p) =>
    inRange(p.date, filters.dateRange)
  );

  const totalSalesBeforeTax = filteredOrders.reduce(
    (s, o) => s + o.totalBeforeTax,
    0
  );
  const totalSalesTax = filteredOrders.reduce((s, o) => s + o.totalTax, 0);
  const totalPurchasesTax = filteredPurchases.reduce(
    (s, p) => s + p.totalTax,
    0
  );

  return {
    totalSalesBeforeTax,
    totalSalesTax,
    totalPurchasesTax,
    netTaxOwed: totalSalesTax - totalPurchasesTax,
    invoiceCount: filteredOrders.length,
  };
}

// ---------------------------------------------------------------------------
// Expenses report
// ---------------------------------------------------------------------------

export interface ExpensesReportResult {
  total: number;
  byCategory: Record<string, number>;
  items: Expense[];
}

export function computeExpensesReport(
  expenses: Expense[],
  filters: ReportFilters = {}
): ExpensesReportResult {
  const filtered = expenses.filter((e) => {
    if (!inRange(e.date, filters.dateRange)) return false;
    if (filters.category && e.category !== filters.category) return false;
    if (filters.technicianName && e.technicianName !== filters.technicianName) return false;
    return true;
  });

  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of filtered) {
    total += e.amount;
    byCategory[e.category || "Other"] =
      (byCategory[e.category || "Other"] || 0) + e.amount;
  }

  return { total, byCategory, items: filtered };
}

// ---------------------------------------------------------------------------
// Technician report
// ---------------------------------------------------------------------------

export interface TechnicianReportResult {
  technicianName: string;
  invoiceCount: number;
  totalRevenue: number;
  totalCommission: number;
  totalMarketingCommission: number;
  cashCollected: number;
  cashOwed: number;
  inventoryValue: number;
  tasksCompleted: number;
  tasksPending: number;
}

export function computeTechnicianReport(
  technicianName: string,
  orders: Order[],
  techInventory: TechInventoryItem[],
  techFinancialLogs: TechFinancialLog[],
  serviceOrders: ServiceOrder[],
  catalog: CatalogItem[],
  filters: ReportFilters = {}
): TechnicianReportResult {
  const techOrders = filterOrders(
    orders.filter(
      (o) =>
        o.status !== "deleted" &&
        o.type !== "quotation" &&
        o.technicianName === technicianName
    ),
    filters
  );

  const totalRevenue = techOrders.reduce((s, o) => s + o.grandTotal, 0);
  const totalCommission = techOrders.reduce(
    (s, o) => s + (o.technicianCommission || 0),
    0
  );
  const totalMarketingCommission = techOrders.reduce(
    (s, o) => s + (o.marketingCommission || 0),
    0
  );

  const finLogs = techFinancialLogs.filter(
    (l) =>
      l.technicianName === technicianName &&
      inRange(l.date, filters.dateRange)
  );
  const cashCollected = finLogs
    .filter((l) => l.type === "cash_collection")
    .reduce((s, l) => s + l.amount, 0);
  const cashOwed = finLogs
    .filter((l) => l.type === "deposit")
    .reduce((s, l) => s + l.amount, 0);

  const techItems = techInventory.filter(
    (i) => i.technicianName === technicianName
  );
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const inventoryValue = techItems.reduce((s, i) => {
    const cat = catalogById.get(i.catalogId);
    return s + (cat?.costPrice || cat?.price || 0) * i.qty;
  }, 0);

  const techTasks = serviceOrders.filter(
    (o) => o.technicianName === technicianName
  );
  const tasksCompleted = techTasks.filter((o) => o.status === "completed").length;
  const tasksPending = techTasks.filter(
    (o) => o.status !== "completed" && o.status !== "canceled"
  ).length;

  return {
    technicianName,
    invoiceCount: techOrders.length,
    totalRevenue,
    totalCommission,
    totalMarketingCommission,
    cashCollected,
    cashOwed: cashOwed - cashCollected,
    inventoryValue,
    tasksCompleted,
    tasksPending,
  };
}

// ---------------------------------------------------------------------------
// Customer balance report
// ---------------------------------------------------------------------------

export interface CustomerBalanceRow {
  customerId: string;
  customerName: string;
  phone: string;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  lastPurchase?: number;
}

export function computeCustomerBalances(
  customers: Customer[],
  orders: Order[],
  payments: CustomerPayment[]
): CustomerBalanceRow[] {
  const byCustomer = new Map<string, CustomerBalanceRow>();

  for (const order of orders.filter(
    (o) => o.status !== "deleted" && o.type !== "quotation" && o.customerId
  )) {
    const cid = order.customerId!;
    if (!byCustomer.has(cid)) {
      const cust = customers.find((c) => c.id === cid);
      byCustomer.set(cid, {
        customerId: cid,
        customerName: order.customerName,
        phone: cust?.phone || "",
        totalInvoiced: 0,
        totalPaid: 0,
        outstanding: 0,
      });
    }
    const row = byCustomer.get(cid)!;
    row.totalInvoiced += order.grandTotal;
    row.totalPaid += order.paidAmount;
    if (!row.lastPurchase || order.date > row.lastPurchase) {
      row.lastPurchase = order.date;
    }
  }

  // Apply standalone customer payments
  for (const p of payments) {
    if (!byCustomer.has(p.customerId)) {
      byCustomer.set(p.customerId, {
        customerId: p.customerId,
        customerName: p.customerName,
        phone: p.customerPhone || "",
        totalInvoiced: 0,
        totalPaid: 0,
        outstanding: 0,
      });
    }
    byCustomer.get(p.customerId)!.totalPaid += p.amount;
  }

  const rows = Array.from(byCustomer.values());
  rows.forEach((r) => (r.outstanding = r.totalInvoiced - r.totalPaid));
  return rows.sort((a, b) => b.outstanding - a.outstanding);
}

// ---------------------------------------------------------------------------
// Inventory report
// ---------------------------------------------------------------------------

export interface InventoryReportRow {
  catalogId: string;
  name: string;
  category: string;
  sku?: string;
  currentStock: number;
  costPrice: number;
  salePrice: number;
  stockValue: number;
  lowStockThreshold: number;
  isLowStock: boolean;
}

export function computeInventoryReport(
  catalog: CatalogItem[],
  filters: ReportFilters = {}
): InventoryReportRow[] {
  return catalog
    .filter((c) => {
      if (c.type !== "product") return false;
      if (filters.category && c.category !== filters.category) return false;
      return true;
    })
    .map((c) => ({
      catalogId: c.id,
      name: c.name,
      category: c.category || "General",
      sku: c.sku,
      currentStock: c.stock || 0,
      costPrice: c.costPrice || 0,
      salePrice: c.price || 0,
      stockValue: (c.costPrice || 0) * (c.stock || 0),
      lowStockThreshold: c.lowStockThreshold || 5,
      isLowStock: (c.stock || 0) <= (c.lowStockThreshold || 5),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}
