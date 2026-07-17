import { CatalogItem, Order, StaffUser, TechFinancialLog, TechInventoryItem } from "./types";

export function technicianMatches(user: StaffUser | undefined, item: { technicianId?: string; technicianName?: string }) {
  if (!user) return false;
  return Boolean((item.technicianId && item.technicianId === user.id) || item.technicianName === user.name);
}

export function findTechnicianByNameOrId(users: StaffUser[], idOrName: string) {
  return users.find((u) => u.id === idOrName || u.name === idOrName);
}

export function itemUnitCostWithTax(item?: CatalogItem): number {
  if (!item) return 0;
  const cost = Number(item.costPrice ?? 0);
  const tax = Number(item.tax ?? 0);
  return cost * (1 + tax / 100);
}

export function inventoryItemValue(item: TechInventoryItem, catalog: CatalogItem[]) {
  const catalogItem = catalog.find((c) => c.id === item.catalogId);
  return item.qty * itemUnitCostWithTax(catalogItem);
}

export function isCashDebtLog(type: TechFinancialLog["type"]) {
  return type === "advance" || type === "cash_collection";
}

export function isCashSettlementLog(type: TechFinancialLog["type"]) {
  return type === "settlement" || type === "deposit";
}

export function isCashWithdrawalLog(type: TechFinancialLog["type"]) {
  return type === "withdrawal";
}

export function isExpenseLog(type: TechFinancialLog["type"]) {
  return type === "expense";
}

export function isCommissionLog(type: TechFinancialLog["type"]) {
  return type === "completion_commission" || type === "marketing_commission";
}

export function techFinancialSummary(logs: TechFinancialLog[]) {
  const cashDebt = logs.reduce((sum, log) => {
    if (isCashDebtLog(log.type)) return sum + log.amount;
    if (isCashSettlementLog(log.type)) return sum - log.amount;
    return sum;
  }, 0);
  const deposits = logs.filter((log) => isCashDebtLog(log.type)).reduce((sum, log) => sum + log.amount, 0);
  const settlements = logs.filter((log) => isCashSettlementLog(log.type)).reduce((sum, log) => sum + log.amount, 0);
  const withdrawals = logs.filter((log) => isCashWithdrawalLog(log.type)).reduce((sum, log) => sum + log.amount, 0);
  const expenses = logs.filter((log) => isExpenseLog(log.type)).reduce((sum, log) => sum + log.amount, 0);
  const completionCommission = logs.filter((log) => log.type === "completion_commission").reduce((sum, log) => sum + log.amount, 0);
  const marketingCommission = logs.filter((log) => log.type === "marketing_commission").reduce((sum, log) => sum + log.amount, 0);
  return { cashDebt, deposits, settlements, withdrawals, expenses, completionCommission, marketingCommission };
}

export function startOfDay(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfMonth(ts = Date.now()) {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function activeInvoice(order: Order) {
  return order.status === "active" && order.type !== "quotation";
}

export function technicianOrderMatches(order: Order, tech: StaffUser) {
  return Boolean(order.technicianName === tech.name);
}
