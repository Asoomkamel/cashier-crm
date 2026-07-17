import { storage } from "./storage";
import { DEFAULT_SETTINGS, PaymentMethod, RequestType, ServiceOrderStatus, uid } from "./types";

// Merge two arrays of records by their best available identity key,
// so re-importing the same backup (or a partial one) doesn't duplicate rows.
export function mergeById<T extends Record<string, any>>(existing: T[], incoming: T[], keyField: string = "id"): T[] {
  const byKey = new Map(existing.filter(Boolean).map((item) => [item[keyField], item]));
  incoming.filter(Boolean).forEach((item) => byKey.set(item[keyField], { ...byKey.get(item[keyField]), ...item }));
  return Array.from(byKey.values());
}

export interface ApplyBackupResult {
  imported: string[];
  empty: boolean;
}

type UnknownRecord = Record<string, any>;

const asArray = (value: unknown): UnknownRecord[] => (Array.isArray(value) ? (value as UnknownRecord[]) : []);
const n = (value: unknown, fallback = 0): number => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};
const s = (value: unknown): string => String(value ?? "").trim();

const mapPaymentMethod = (value: unknown): PaymentMethod => {
  const raw = s(value).toLowerCase();
  if (raw === "network" || raw === "mada" || raw === "card" || raw === "شبكة") return "card";
  if (raw === "bank" || raw === "transfer" || raw === "تحويل") return "transfer";
  if (raw === "partial" || raw === "دفع جزئي") return "partial";
  if (raw === "credit" || raw === "آجل" || raw === "اجل") return "credit";
  if (raw === "tabby") return "tabby";
  if (raw === "tamara") return "tamara";
  return "cash";
};

const mapRequestType = (value: unknown): RequestType | undefined => {
  const raw = s(value).toLowerCase();
  if (!raw) return undefined;
  if (["new_installation", "new", "جديد", "تركيب", "installation"].includes(raw)) return "new_installation";
  if (["maintenance", "صيانة", "صيانه"].includes(raw)) return "maintenance";
  if (["inspection", "معاينة", "معاينه", "فحص"].includes(raw)) return "inspection";
  if (["urgent_visit", "urgent", "زيارة عاجلة", "زياره عاجله", "عاجل"].includes(raw)) return "urgent_visit";
  return "new_installation";
};

const mapStatus = (value: unknown): ServiceOrderStatus => {
  const raw = s(value).toLowerCase();
  if (["started", "accepted", "تم القبول"].includes(raw)) return "started";
  if (["in_progress", "progress", "قيد التنفيذ"].includes(raw)) return "in_progress";
  if (["completed", "complete", "done", "تم", "مكتمل"].includes(raw)) return "completed";
  if (["canceled", "cancelled", "ملغي", "ملغى"].includes(raw)) return "canceled";
  if (["deferred", "مؤجل"].includes(raw)) return "deferred";
  return "pending";
};

function normalizeOrder(input: UnknownRecord): UnknownRecord {
  const invoiceNumber = s(input.invoiceNumber || input.number || input.id || uid("INV"));
  return {
    ...input,
    id: s(input.id) || uid("order"),
    invoiceNumber,
    customerId: s(input.customerId) || undefined,
    customerName: s(input.customerName) || s(input.clientName) || "عميل نقدي",
    type: input.type === "quotation" || input.type === "return_invoice" ? input.type : "tax_invoice",
    paymentMethod: mapPaymentMethod(input.paymentMethod),
    paidAmount: n(input.paidAmount, n(input.grandTotal)),
    remainingAmount: n(input.remainingAmount),
    totalBeforeTax: n(input.totalBeforeTax),
    totalTax: n(input.totalTax),
    totalDiscount: n(input.totalDiscount),
    grandTotal: n(input.grandTotal, n(input.paidAmount)),
    status: input.status === "deleted" || input.status === "returned" ? input.status : "active",
    date: n(input.date, Date.now()),
    items: asArray(input.items).map((item) => ({
      catalogId: s(item.catalogId || item.id) || uid("line"),
      name: s(item.name) || "Unnamed item",
      price: n(item.price),
      priceBeforeDiscount: item.priceBeforeDiscount !== undefined ? n(item.priceBeforeDiscount) : undefined,
      costPrice: item.costPrice !== undefined ? n(item.costPrice) : undefined,
      tax: n(item.tax),
      qty: n(item.qty, 1),
      discount: n(item.discount),
      isManualItem: Boolean(item.isManualItem),
    })),
  };
}

function normalizeCatalogItem(input: UnknownRecord): UnknownRecord {
  return {
    ...input,
    id: s(input.id) || uid("cat"),
    name: s(input.name) || "Unnamed item",
    type: input.type === "service" ? "service" : "product",
    price: n(input.price),
    priceBeforeDiscount: input.priceBeforeDiscount !== undefined ? n(input.priceBeforeDiscount) : undefined,
    costPrice: input.costPrice !== undefined ? n(input.costPrice) : undefined,
    tax: n(input.tax, DEFAULT_SETTINGS.defaultTaxRate),
    sku: s(input.sku) || undefined,
    barcode: s(input.barcode) || undefined,
    category: s(input.category) || "غير مصنف",
    unit: s(input.unit) || undefined,
    vendorName: s(input.vendorName || input.vendor) || undefined,
    imageUrl: s(input.imageUrl || input.image) || undefined,
    stock: input.stock !== undefined ? n(input.stock) : undefined,
    lowStockThreshold: input.lowStockThreshold !== undefined ? n(input.lowStockThreshold) : undefined,
    isBundle: Boolean(input.isBundle),
    subProducts: Array.isArray(input.subProducts) ? input.subProducts : [],
  };
}

function normalizeServiceOrder(input: UnknownRecord, fallbackNumber: number): UnknownRecord {
  const selectedProducts = asArray(input.selectedProducts || input.requestedItems);
  const requestedItems = selectedProducts.map((item) => ({
    catalogId: s(item.catalogId || item.id) || uid("line"),
    name: s(item.name) || "Unnamed item",
    qty: n(item.qty, 1),
    price: n(item.price),
  }));
  const requestType = mapRequestType(input.requestType);
  const issue = s(input.issue) || [s(input.productInterest), s(input.serviceDescription)].filter(Boolean).join(" - ") || "—";
  return {
    ...input,
    id: s(input.id) || uid("srv"),
    requestNumber: n(input.requestNumber, n(String(input.id).replace(/\D/g, ""), fallbackNumber)),
    customerId: s(input.customerId) || undefined,
    customerName: s(input.customerName) || "Unknown",
    customerPhone: s(input.customerPhone || input.customerId),
    locationId: s(input.locationId) || undefined,
    technicianName: s(input.technicianName) || undefined,
    technicianId: s(input.technicianId) || undefined,
    requestType,
    issue,
    serviceDescription: s(input.serviceDescription || input.productInterest) || undefined,
    requestedItems,
    expectedPaymentMethod: input.expectedPaymentMethod ? mapPaymentMethod(input.expectedPaymentMethod) : undefined,
    expectedAmount: input.expectedAmount !== undefined ? n(input.expectedAmount) : input.paymentAmount !== undefined ? n(input.paymentAmount) : undefined,
    status: mapStatus(input.status),
    date: n(input.date, Date.now()),
    nextMaintenanceDate: input.nextMaintenanceDate !== undefined ? n(input.nextMaintenanceDate) : undefined,
    notes: s(input.notes || input.additionalNotes) || undefined,
    activityLogs: Array.isArray(input.activityLogs) ? input.activityLogs : [],
    createdAt: n(input.createdAt, Date.now()),
    updatedAt: input.updatedAt !== undefined ? n(input.updatedAt) : undefined,
    taskInvoiceOrderId: s(input.taskInvoiceOrderId || input.invoiceId) || undefined,
  };
}

function normalizeTechInventory(data: UnknownRecord, catalog: UnknownRecord[]): UnknownRecord[] {
  const catalogById = new Map(catalog.map((item) => [s(item.id), item]));
  return asArray(data.crm_tech_inventory || data.techInventory).flatMap((entry) => {
    if (Array.isArray(entry.items)) {
      const technicianName = s(entry.technicianName) || "Unknown technician";
      const technicianId = s(entry.technicianId) || undefined;
      return entry.items.map((item: UnknownRecord) => {
        const cat = catalogById.get(s(item.catalogId));
        return {
          id: s(item.id) || `tech_${technicianId || technicianName}_${s(item.catalogId) || uid("cat")}`,
          technicianId,
          technicianName,
          catalogId: s(item.catalogId),
          itemName: s(item.itemName || item.catalogName || cat?.name) || "Unnamed item",
          sku: s(item.sku || cat?.sku) || undefined,
          unit: s(item.unit || cat?.unit) || undefined,
          qty: n(item.qty),
          createdAt: n(item.createdAt, Date.now()),
          updatedAt: n(item.updatedAt, Date.now()),
        };
      });
    }
    return [{
      ...entry,
      id: s(entry.id) || uid("techinv"),
      technicianName: s(entry.technicianName) || "Unknown technician",
      catalogId: s(entry.catalogId),
      itemName: s(entry.itemName || entry.catalogName) || "Unnamed item",
      qty: n(entry.qty),
    }];
  });
}

/** Exported for testing only — use applyBackupPayload in production code */
export function normalizeLegacyBackup(raw: unknown): UnknownRecord {
  const source = raw && typeof raw === "object" ? (raw as UnknownRecord) : {};
  const hasLegacyCrmKeys = Object.keys(source).some((key) => key.startsWith("crm_") || key === "pos_expenses");

  // Always run full normalization — even on "modern" files — to ensure
  // missing/optional fields are filled in and old format variations are handled.
  const catalog = asArray(source.crm_catalog || source.catalog).map(normalizeCatalogItem);
  const catalogCategories = Array.from(new Set(catalog.map((item) => s(item.category)).filter(Boolean)));

  const settings = (source.crm_settings || source.settings) && typeof (source.crm_settings || source.settings) === "object"
    ? (() => {
        const raw = (source.crm_settings || source.settings) as UnknownRecord;
        return {
          ...raw,
          hiddenModules: Array.isArray(raw.hiddenModules)
            ? raw.hiddenModules
            : Array.isArray(raw.hiddenMenus)
              ? raw.hiddenMenus
              : [],
          productCategories: Array.from(new Set([
            ...(Array.isArray(raw.productCategories) ? raw.productCategories : []),
            ...(Array.isArray(raw.categories) ? raw.categories : []),
            ...catalogCategories,
          ].filter(Boolean))),
        };
      })()
    : undefined;

  const nextReqNum = n((source.crm_settings || source.settings as UnknownRecord)?.nextRequestNumber, 5001);

  return {
    customers:         asArray(source.crm_customers || source.customers),
    catalog,
    orders:            asArray(source.crm_orders || source.orders).map(normalizeOrder),
    vendors:           asArray(source.crm_vendors || source.vendors),
    purchases:         asArray(source.crm_purchases || source.purchases),
    expenses:          asArray(source.pos_expenses || source.crm_expenses || source.expenses).map((expense) => ({
      ...expense,
      id:          s(expense.id) || uid("exp"),
      amount:      n(expense.amount),
      category:    s(expense.category) || "Other",
      description: s(expense.description || expense.note),
      date:        n(expense.date, Date.now()),
    })),
    urgentOrders:      asArray(source.crm_urgent_orders || source.urgentOrders)
                         .map((order, i) => normalizeServiceOrder(order, n(order.requestNumber, nextReqNum + i))),
    appointments:      asArray(source.crm_service_orders || source.appointments)
                         .map((order, i) => normalizeServiceOrder(order, n(order.requestNumber, nextReqNum + i))),
    techInventory:     normalizeTechInventory(source, catalog),
    techInventoryLogs: asArray(source.crm_tech_inventory_logs || source.techInventoryLogs).map((log) => ({
      ...log,
      id:            s(log.id) || uid("tlog"),
      technicianName: s(log.technicianName) || "Unknown technician",
      catalogId:     s(log.catalogId) || undefined,
      itemName:      s(log.itemName || log.catalogName) || "—",
      type:          s(log.type) || "add",
      qty:           n(log.qty),
      notes:         s(log.notes || log.note) || undefined,
      date:          n(log.date, Date.now()),
    })),
    techFinancialLogs: asArray(source.crm_tech_financial_logs || source.techFinancialLogs).map((log) => ({
      ...log,
      id:            s(log.id) || uid("tfin"),
      technicianName: s(log.technicianName) || "Unknown technician",
      type:          s(log.type) || "cash_collection",
      amount:        n(log.amount),
      notes:         s(log.notes || log.note) || undefined,
      date:          n(log.date, Date.now()),
    })),
    customerPayments:  asArray(source.crm_customer_payments || source.customerPayments),
    reminders: asArray(source.crm_system_reminders || source.reminders || source.systemReminders).map((rem) => ({
      ...rem,
      id: s(rem.id) || uid("rem"),
      title: s(rem.title || rem.name) || "Reminder",
      description: s(rem.description) || undefined,
      source: s(rem.source) || "manual",
      sourceId: s(rem.sourceId) || undefined,
      customerId: s(rem.customerId) || undefined,
      customerName: s(rem.customerName) || undefined,
      customerPhone: s(rem.customerPhone) || undefined,
      dueDate: n(rem.dueDate || rem.date, Date.now()),
      status: s(rem.status) || "pending",
      priority: s(rem.priority) || "normal",
      assignedToRole: s(rem.assignedToRole) || "all",
      assignedToUserId: s(rem.assignedToUserId) || undefined,
      notes: s(rem.notes) || undefined,
      createdByUserId: s(rem.createdByUserId) || undefined,
      createdByName: s(rem.createdByName) || undefined,
      createdAt: n(rem.createdAt, Date.now()),
      updatedAt: rem.updatedAt ? n(rem.updatedAt) : undefined,
    })),
    settings,
    techLocations:     source.crm_tech_locations || source.techLocations,
    users:             asArray(source.users),
  };
}

/**
 * Applies a backup payload (from a JSON file import, Google Drive restore,
 * Supabase load, or an older cc_/crm_ localStorage-style export) to storage.
 */
export function applyBackupPayload(raw: any, mode: "merge" | "replace"): ApplyBackupResult {
  const unwrapped = raw && typeof raw.payload === "object" && raw.payload !== null ? raw.payload : raw;
  const data = normalizeLegacyBackup(unwrapped);
  const imported: string[] = [];

  const setIfPresent = (key: string, getExisting: () => any[], save: (v: any[]) => void) => {
    if (!Array.isArray(data?.[key])) return;
    if (mode === "replace") {
      save(data[key]);
    } else {
      save(mergeById(getExisting(), data[key]));
    }
    imported.push(`${key} (${data[key].length})`);
  };

  setIfPresent("customers", storage.getCustomers, storage.saveCustomers);
  setIfPresent("catalog", storage.getCatalog, storage.saveCatalog);
  setIfPresent("orders", storage.getOrders, storage.saveOrders);
  setIfPresent("vendors", storage.getVendors, storage.saveVendors);
  setIfPresent("purchases", storage.getPurchases, storage.savePurchases);
  setIfPresent("expenses", storage.getExpenses, storage.saveExpenses);
  setIfPresent("users", storage.getUsers, storage.saveUsers);
  setIfPresent("urgentOrders", storage.getUrgentOrders, storage.saveUrgentOrders);
  setIfPresent("appointments", storage.getAppointments, storage.saveAppointments);
  setIfPresent("techInventory", storage.getTechInventory, storage.saveTechInventory);
  setIfPresent("techInventoryLogs", storage.getTechInventoryLogs, storage.saveTechInventoryLogs);
  setIfPresent("techFinancialLogs", storage.getTechFinancialLogs, storage.saveTechFinancialLogs);
  setIfPresent("customerPayments", storage.getCustomerPayments, storage.saveCustomerPayments);
  setIfPresent("reminders", storage.getReminders, storage.saveReminders);

  if (data?.settings && typeof data.settings === "object") {
    const current = storage.getSettings();
    // Always keep the current device's language/theme — a backup should
    // never silently flip your UI language.
    storage.saveSettings({ ...current, ...data.settings, language: current.language, theme: current.theme });
    imported.push("settings");
  }
  if (data?.techLocations && typeof data.techLocations === "object") {
    storage.saveTechLocations({ ...storage.getTechLocations(), ...data.techLocations });
    imported.push("techLocations");
  }

  return { imported, empty: imported.length === 0 };
}

/** True if this device/browser has no real business data yet (fresh install/first login). */
export function isLocalDataFresh(): boolean {
  return (
    storage.getCustomers().length === 0 &&
    storage.getCatalog().length === 0 &&
    storage.getOrders().length === 0 &&
    storage.getUrgentOrders().length === 0 &&
    storage.getAppointments().length === 0 &&
    storage.getVendors().length === 0 &&
    storage.getPurchases().length === 0 &&
    storage.getExpenses().length === 0 &&
    storage.getReminders().length === 0
  );
}
