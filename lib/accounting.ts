// Lightweight accounting layer — Phase 7 addition.
//
// This does NOT introduce a new source of truth or any new data entry
// screens. It reads the data that already exists (Orders, PurchaseInvoices,
// Expenses, CustomerPayments) and derives a simplified double-entry
// bookkeeping view on top of it: a Chart of Accounts, auto-generated
// Journal Entries, a Trial Balance, and an Income Statement (P&L).
//
// Every function here is a pure computation — nothing is written to
// storage — so this can never corrupt existing app data, and it stays in
// sync automatically as new sales/purchases/expenses are recorded.
//
// NOTE: this is intentionally simplified (single-entry-derived, cash-ish
// basis, no fixed assets/depreciation/multi-currency). It's meant to close
// the "no accounting at all" gap, not to replace a certified accounting
// system for tax filing.

import { Order, PurchaseInvoice, Expense, CustomerPayment } from "./types";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface Account {
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
}

// A minimal but coherent chart of accounts covering everything the app's
// existing entities can generate.
export const CHART_OF_ACCOUNTS: Account[] = [
  { code: "1000", nameAr: "الصندوق / النقدية", nameEn: "Cash on Hand", type: "asset" },
  { code: "1010", nameAr: "البنك", nameEn: "Bank", type: "asset" },
  { code: "1100", nameAr: "ذمم العملاء (مدينون)", nameEn: "Accounts Receivable", type: "asset" },
  { code: "1200", nameAr: "المخزون", nameEn: "Inventory", type: "asset" },
  { code: "1300", nameAr: "ضريبة القيمة المضافة - مدخلات", nameEn: "VAT Input (Purchases)", type: "asset" },
  { code: "2000", nameAr: "ذمم الموردين (دائنون)", nameEn: "Accounts Payable", type: "liability" },
  { code: "2100", nameAr: "ضريبة القيمة المضافة - مخرجات", nameEn: "VAT Output (Sales)", type: "liability" },
  { code: "3000", nameAr: "حقوق الملكية", nameEn: "Owner's Equity", type: "equity" },
  { code: "4000", nameAr: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "revenue" },
  { code: "4900", nameAr: "مردودات ومسموحات المبيعات", nameEn: "Sales Returns & Allowances", type: "revenue" },
  { code: "5000", nameAr: "تكلفة البضاعة المباعة", nameEn: "Cost of Goods Sold", type: "expense" },
  { code: "6000", nameAr: "مصروفات تشغيلية", nameEn: "Operating Expenses", type: "expense" },
  { code: "6100", nameAr: "عمولات الفنيين", nameEn: "Technician Commissions", type: "expense" },
];

export interface JournalLine {
  account: string; // account code
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: number;
  ref: string; // invoice/expense/purchase number for traceability
  memo: string;
  source: "sale" | "sale_return" | "purchase" | "purchase_return" | "expense" | "customer_payment";
  lines: JournalLine[];
}

function cashOrBankAccount(method: string): string {
  return method === "transfer" || method === "card" ? "1010" : "1000";
}

/** Builds the full derived journal from raw app data. Pure function. */
export function buildJournal(
  orders: Order[],
  purchases: PurchaseInvoice[],
  expenses: Expense[],
  customerPayments: CustomerPayment[]
): JournalEntry[] {
  const entries: JournalEntry[] = [];

  for (const o of orders) {
    if (o.status === "deleted") continue;
    const net = Math.max(0, o.totalBeforeTax - (o.totalDiscount || 0));
    const isReturn = o.type === "return_invoice";
    const paidNow = o.paidAmount || 0;
    const onCredit = Math.max(0, o.grandTotal - paidNow);
    const cashAcct = cashOrBankAccount(o.paymentMethod);

    const lines: JournalLine[] = [];
    if (paidNow > 0) lines.push({ account: cashAcct, debit: isReturn ? 0 : paidNow, credit: isReturn ? paidNow : 0 });
    if (onCredit > 0) lines.push({ account: "1100", debit: isReturn ? 0 : onCredit, credit: isReturn ? onCredit : 0 });
    if (net > 0) lines.push({ account: isReturn ? "4900" : "4000", debit: isReturn ? net : 0, credit: isReturn ? 0 : net });
    if (o.totalTax > 0) lines.push({ account: "2100", debit: isReturn ? o.totalTax : 0, credit: isReturn ? 0 : o.totalTax });

    if (lines.length) {
      entries.push({
        id: `je_order_${o.id}`,
        date: o.date,
        ref: o.invoiceNumber,
        memo: isReturn ? `مرتجع بيع - ${o.customerName || ""}` : `فاتورة بيع - ${o.customerName || ""}`,
        source: isReturn ? "sale_return" : "sale",
        lines,
      });
    }
  }

  for (const p of purchases) {
    const isReturn = p.type === "return";
    const cashAcct = "1000"; // purchases don't track a payment method field; assume cash unless remainingAmount > 0
    const paidNow = p.paidAmount || 0;
    const onCredit = Math.max(0, p.grandTotal - paidNow);

    const lines: JournalLine[] = [];
    if (p.totalBeforeTax > 0) lines.push({ account: "1200", debit: isReturn ? 0 : p.totalBeforeTax, credit: isReturn ? p.totalBeforeTax : 0 });
    if (p.totalTax > 0) lines.push({ account: "1300", debit: isReturn ? 0 : p.totalTax, credit: isReturn ? p.totalTax : 0 });
    if (paidNow > 0) lines.push({ account: cashAcct, debit: isReturn ? paidNow : 0, credit: isReturn ? 0 : paidNow });
    if (onCredit > 0) lines.push({ account: "2000", debit: isReturn ? onCredit : 0, credit: isReturn ? 0 : onCredit });

    if (lines.length) {
      entries.push({
        id: `je_purchase_${p.id}`,
        date: p.date,
        ref: p.referenceNumber || p.id,
        memo: isReturn ? `مرتجع شراء - ${p.vendorName}` : `فاتورة شراء - ${p.vendorName}`,
        source: isReturn ? "purchase_return" : "purchase",
        lines,
      });
    }
  }

  for (const e of expenses) {
    if (e.amount <= 0) continue;
    const expenseAccount = /commission|عمولة/i.test(e.category) ? "6100" : "6000";
    entries.push({
      id: `je_expense_${e.id}`,
      date: e.date,
      ref: e.id.slice(-6),
      memo: `${e.category} — ${e.description || ""}`.trim(),
      source: "expense",
      lines: [
        { account: expenseAccount, debit: e.amount, credit: 0 },
        { account: "1000", debit: 0, credit: e.amount },
      ],
    });
  }

  for (const cp of customerPayments) {
    if (cp.amount <= 0) continue;
    entries.push({
      id: `je_cpay_${cp.id}`,
      date: cp.date,
      ref: cp.id.slice(-6),
      memo: `تحصيل من العميل - ${cp.customerName}`,
      source: "customer_payment",
      lines: [
        { account: cashOrBankAccount(cp.method), debit: cp.amount, credit: 0 },
        { account: "1100", debit: 0, credit: cp.amount },
      ],
    });
  }

  return entries.sort((a, b) => a.date - b.date);
}

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
  balance: number; // debit-normal accounts positive when debit > credit, etc.
}

export function buildTrialBalance(journal: JournalEntry[]): TrialBalanceRow[] {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const entry of journal) {
    for (const line of entry.lines) {
      const t = totals.get(line.account) || { debit: 0, credit: 0 };
      t.debit += line.debit;
      t.credit += line.credit;
      totals.set(line.account, t);
    }
  }
  return CHART_OF_ACCOUNTS.filter((a) => totals.has(a.code)).map((account) => {
    const t = totals.get(account.code)!;
    const debitNormal = account.type === "asset" || account.type === "expense";
    const balance = debitNormal ? t.debit - t.credit : t.credit - t.debit;
    return { account, debit: t.debit, credit: t.credit, balance };
  });
}

export interface IncomeStatement {
  revenue: number;
  salesReturns: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
}

export function buildIncomeStatement(journal: JournalEntry[]): IncomeStatement {
  const byAccount = (code: string, side: "debit" | "credit") =>
    journal.reduce((sum, e) => sum + e.lines.filter((l) => l.account === code).reduce((s, l) => s + l[side], 0), 0);

  const revenue = byAccount("4000", "credit");
  const salesReturns = byAccount("4900", "debit");
  const netRevenue = revenue - salesReturns;
  const cogs = byAccount("5000", "debit");
  const grossProfit = netRevenue - cogs;
  const operatingExpenses = byAccount("6000", "debit") + byAccount("6100", "debit");
  const netProfit = grossProfit - operatingExpenses;

  return { revenue, salesReturns, netRevenue, cogs, grossProfit, operatingExpenses, netProfit };
}

export function filterJournalByDateRange(journal: JournalEntry[], fromTs?: number, toTs?: number): JournalEntry[] {
  return journal.filter((e) => (!fromTs || e.date >= fromTs) && (!toTs || e.date <= toTs));
}

// ─────────────────────────────────────────────────────────────────────────
// Supplier aging report (Accounts Payable aging) — flags overdue balances
// per vendor so purchases on credit don't quietly slip past 60/90 days.
// ─────────────────────────────────────────────────────────────────────────
export interface VendorAgingRow {
  vendorName: string;
  current: number; // 0-30 days
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

export function buildSupplierAging(purchases: PurchaseInvoice[], asOf: number = Date.now()): VendorAgingRow[] {
  const byVendor = new Map<string, VendorAgingRow>();
  for (const p of purchases) {
    const outstanding = p.type === "purchase" ? Math.max(0, p.grandTotal - (p.paidAmount || 0)) : 0;
    if (outstanding <= 0) continue;
    const ageDays = Math.floor((asOf - p.date) / (1000 * 60 * 60 * 24));
    const row = byVendor.get(p.vendorName) || { vendorName: p.vendorName, current: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 };
    if (ageDays <= 30) row.current += outstanding;
    else if (ageDays <= 60) row.days31to60 += outstanding;
    else if (ageDays <= 90) row.days61to90 += outstanding;
    else row.over90 += outstanding;
    row.total += outstanding;
    byVendor.set(p.vendorName, row);
  }
  return Array.from(byVendor.values()).sort((a, b) => b.total - a.total);
}
