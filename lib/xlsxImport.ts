import {
  AppSettings,
  CatalogItem,
  Customer,
  CustomerPayment,
  Expense,
  Order,
  PurchaseInvoice,
  ServiceOrder,
  StaffUser,
  TechFinancialLog,
  TechInventoryItem,
  TechInventoryLog,
  uid,
} from "./types";
import { WorkbookPayload } from "./xlsxExport";
import { getInternalColumnKey, translateValueForImport } from "./xlsxSchemas";

export type ImportableEntityKey =
  | "customers"
  | "catalog"
  | "orders"
  | "vendors"
  | "purchases"
  | "expenses"
  | "settings"
  | "users"
  | "urgentOrders"
  | "appointments"
  | "techInventory"
  | "techInventoryLogs"
  | "techFinancialLogs"
  | "customerPayments"
  | "techLocations"
  | "reminders";

export interface ParsedWorkbookImport {
  payload: WorkbookPayload;
  importedKeys: string[];
  rowCount: number;
}

type PlainRow = Record<string, unknown>;

type TargetEntity = ImportableEntityKey | undefined;

const SHEET_KEY_MAP: Record<string, ImportableEntityKey> = {
  customers: "customers",
  customer: "customers",
  clients: "customers",
  العملاء: "customers",
  catalog: "catalog",
  products: "catalog",
  product: "catalog",
  inventory: "catalog",
  الكتالوج: "catalog",
  المنتجات: "catalog",
  orders: "orders",
  sales: "orders",
  invoices: "orders",
  المبيعات: "orders",
  الفواتير: "orders",
  vendors: "vendors",
  suppliers: "vendors",
  الموردين: "vendors",
  purchases: "purchases",
  purchaseinvoices: "purchases",
  المشتريات: "purchases",
  expenses: "expenses",
  المصروفات: "expenses",
  settings: "settings",
  الإعدادات: "settings",
  الاعدادات: "settings",
  users: "users",
  staff: "users",
  المستخدمين: "users",
  "المستخدمون": "users",
  urgentorders: "urgentOrders",
  urgent_orders: "urgentOrders",
  urgent: "urgentOrders",
  الطلباتالعاجلة: "urgentOrders",
  appointments: "appointments",
  المواعيد: "appointments",
  techinventory: "techInventory",
  technicianinventory: "techInventory",
  tech_inventory: "techInventory",
  techinventorylogs: "techInventoryLogs",
  tech_inventory_logs: "techInventoryLogs",
  techfinanciallogs: "techFinancialLogs",
  tech_financial_logs: "techFinancialLogs",
  customerpayments: "customerPayments",
  customer_payments: "customerPayments",
  techlocations: "techLocations",
  tech_locations: "techLocations",
  reminders: "reminders",
  systemreminders: "reminders",
  التذكيرات: "reminders",
  "سجلالمبيعات": "orders",
  "الموردون": "vendors",
  "مخزونالفنيين": "techInventory",
  "حركاتمخزونالفنيين": "techInventoryLogs",
  "الحركاتالماليةللفنيين": "techFinancialLogs",
  "دفعاتالعملاء": "customerPayments",
  "مواقعالفنيين": "techLocations",
};

const FIELD_ALIASES: Record<string, string> = {
  RequestNumber: "requestNumber",
  "رقم الطلب": "requestNumber",
  InvoiceNumber: "invoiceNumber",
  "رقم الفاتورة": "invoiceNumber",
  Customer: "customerName",
  "اسم العميل": "customerName",
  Phone: "customerPhone",
  "رقم العميل": "customerPhone",
  Product: "name",
  Item: "itemName",
  Name: "name",
  "اسم المنتج": "name",
  SKU: "sku",
  Barcode: "barcode",
  Category: "category",
  "التصنيف": "category",
  Type: "type",
  Issue: "issue",
  Details: "issue",
  Status: "status",
  Date: "date",
  Amount: "expectedAmount",
  Technician: "technicianName",
  Specialties: "requiredSpecialty",
  Location: "locationLabel",
  Qty: "qty",
  Quantity: "qty",
  Price: "price",
  Cost: "costPrice",
  Total: "grandTotal",
  "العنوان": "title",
  "المصدر": "source",
  "معرف المصدر": "sourceId",
  "تاريخ الاستحقاق": "dueDate",
  "الأولوية": "priority",
  "الدور المسند له": "assignedToRole",
};

function cleanSheetName(name: string): string {
  return String(name || "")
    .replace(/[\s\-\/\\\[\]:*?]+/g, "")
    .trim()
    .toLowerCase();
}

function resolveSheetKey(sheetName: string): ImportableEntityKey | undefined {
  const normalized = cleanSheetName(sheetName);
  return SHEET_KEY_MAP[normalized] || SHEET_KEY_MAP[String(sheetName || "").trim()] || undefined;
}

function looksLikeDateField(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("date") || lower.endsWith("at") || lower.includes("time") || lower.includes("موعد") || lower.includes("تاريخ");
}

function parseJsonMaybe(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function parseCell(key: string, value: unknown): unknown {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    const parsed = parseJsonMaybe(value);
    if (parsed !== value) return parsed;
    const trimmed = value.trim();
    if (looksLikeDateField(key) && trimmed) {
      const ts = Date.parse(trimmed);
      if (Number.isFinite(ts)) return ts;
    }
    if (/^(true|false)$/i.test(trimmed)) return /^true$/i.test(trimmed);
    return trimmed;
  }
  if (typeof value === "number" && looksLikeDateField(key) && value > 25569 && value < 60000) {
    return Math.round((value - 25569) * 86400 * 1000);
  }
  return value;
}

function normalizeFieldName(key: string): string {
  const clean = String(key || "").trim();
  return FIELD_ALIASES[clean] || getInternalColumnKey(clean) || clean;
}

function normalizeRows(rows: PlainRow[]): PlainRow[] {
  return rows
    .map((row) => {
      const next: PlainRow = {};
      Object.entries(row || {}).forEach(([rawKey, value]) => {
        const key = normalizeFieldName(rawKey);
        if (!key || key === "index" || key === "__rowNum__") return;
        if (key.startsWith("__EMPTY")) return;
        if (key === "note" && String(value || "").toLowerCase().includes("no records")) return;
        next[key] = translateValueForImport(key, parseCell(key, value));
      });
      return next;
    })
    .filter((row) => Object.values(row).some((value) => value !== "" && value !== undefined && value !== null));
}

function str(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function date(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function arr<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function maybeArrayFromPipe(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => str(x)).filter(Boolean);
  return str(value)
    .split(/[|،,]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function withId(row: PlainRow, prefix: string): string {
  return str(row.id) || uid(prefix);
}

function importRowsForKey(key: ImportableEntityKey, rows: PlainRow[]): unknown {
  if (key === "settings") {
    const row = rows[0] || {};
    return row as Partial<AppSettings>;
  }

  if (key === "reminders") {
    return rows.map((row): import("./types").SystemReminder => ({
      id: withId(row, "rem"),
      title: str(row.title, "Reminder"),
      description: str(row.description) || undefined,
      source: (str(row.source, "manual") as import("./types").SystemReminder["source"]),
      sourceId: str(row.sourceId) || undefined,
      customerId: str(row.customerId) || undefined,
      customerName: str(row.customerName) || undefined,
      customerPhone: str(row.customerPhone) || undefined,
      dueDate: date(row.dueDate || row.date),
      status: (str(row.status, "pending") as import("./types").SystemReminder["status"]),
      priority: (str(row.priority, "normal") as import("./types").SystemReminder["priority"]),
      assignedToRole: (str(row.assignedToRole, "supervisor") as import("./types").SystemReminder["assignedToRole"]),
      assignedToUserId: str(row.assignedToUserId) || undefined,
      completedAt: row.completedAt ? date(row.completedAt) : undefined,
      completedByUserId: str(row.completedByUserId) || undefined,
      completedByName: str(row.completedByName) || undefined,
      snoozedUntil: row.snoozedUntil ? date(row.snoozedUntil) : undefined,
      notes: str(row.notes) || undefined,
      createdByUserId: str(row.createdByUserId) || undefined,
      createdByName: str(row.createdByName) || undefined,
      createdAt: date(row.createdAt),
      updatedAt: row.updatedAt ? date(row.updatedAt) : undefined,
    }));
  }

  if (key === "techLocations") {
    const locations: Record<string, unknown> = {};
    rows.forEach((row) => {
      const id = str(row.technicianId || row.technicianName || row.id || row.name);
      if (id) locations[id] = row;
    });
    return locations;
  }

  if (key === "customers") {
    return rows.map((row): Customer => ({
      id: withId(row, "cust"),
      name: str(row.name || row.customerName || row.Customer, "Unknown"),
      phone: str(row.phone || row.customerPhone || row.Phone),
      type: (str(row.type, "customer") === "lead" ? "lead" : "customer"),
      locations: arr(row.locations),
      companyName: str(row.companyName) || undefined,
      taxNumber: str(row.taxNumber) || undefined,
      interests: arr<string>(row.interests),
      createdAt: date(row.createdAt || row.date),
      reminderLevel: row.reminderLevel === "" ? undefined : num(row.reminderLevel, undefined as unknown as number),
      nextReminderDate: row.nextReminderDate ? date(row.nextReminderDate) : undefined,
    }));
  }

  if (key === "catalog") {
    return rows.map((row): CatalogItem => ({
      id: withId(row, "item"),
      name: str(row.name || row.itemName, "Unnamed item"),
      type: str(row.type, "product") === "service" ? "service" : "product",
      price: num(row.price || row.salePrice),
      priceBeforeDiscount: row.priceBeforeDiscount !== "" ? num(row.priceBeforeDiscount, undefined as unknown as number) : undefined,
      costPrice: row.costPrice !== "" ? num(row.costPrice, undefined as unknown as number) : undefined,
      tax: num(row.tax, 15),
      sku: str(row.sku) || undefined,
      barcode: str(row.barcode) || undefined,
      category: str(row.category, "غير مصنف"),
      unit: str(row.unit) || undefined,
      vendorName: str(row.vendorName) || undefined,
      imageUrl: str(row.imageUrl) || undefined,
      stock: row.stock !== "" ? num(row.stock, 0) : undefined,
      lowStockThreshold: row.lowStockThreshold !== "" ? num(row.lowStockThreshold, undefined as unknown as number) : undefined,
      isBundle: Boolean(row.isBundle),
      subProducts: arr(row.subProducts),
    }));
  }

  if (key === "orders") {
    return rows.map((row): Order => ({
      id: withId(row, "order"),
      invoiceNumber: str(row.invoiceNumber, `INV-${Date.now()}`),
      customerId: str(row.customerId) || undefined,
      customerName: str(row.customerName, "Walk-in"),
      type: str(row.type, "tax_invoice") === "quotation" ? "quotation" : str(row.type) === "return_invoice" ? "return_invoice" : "tax_invoice",
      items: arr(row.items),
      paymentMethod: (str(row.paymentMethod, "cash") as Order["paymentMethod"]),
      paidAmount: num(row.paidAmount || row.grandTotal),
      remainingAmount: num(row.remainingAmount),
      totalBeforeTax: num(row.totalBeforeTax),
      totalTax: num(row.totalTax),
      totalDiscount: num(row.totalDiscount),
      cartDiscount: row.cartDiscount !== "" ? num(row.cartDiscount, 0) : undefined,
      grandTotal: num(row.grandTotal || row.expectedAmount),
      branchName: str(row.branchName) || undefined,
      technicianName: str(row.technicianName) || undefined,
      technicianCommission: row.technicianCommission !== "" ? num(row.technicianCommission, undefined as unknown as number) : undefined,
      technicianCommissionType: (str(row.technicianCommissionType) || undefined) as Order["technicianCommissionType"],
      requiredSpecialty: str(row.requiredSpecialty) || undefined,
      scheduledMaintenanceDate: row.scheduledMaintenanceDate ? date(row.scheduledMaintenanceDate) : undefined,
      referralName: str(row.referralName) || undefined,
      referralPhone: str(row.referralPhone) || undefined,
      referralCommission: row.referralCommission !== "" ? num(row.referralCommission, undefined as unknown as number) : undefined,
      notes: str(row.notes) || undefined,
      sourceServiceOrderId: str(row.sourceServiceOrderId) || undefined,
      nextMaintenanceDate: row.nextMaintenanceDate ? date(row.nextMaintenanceDate) : undefined,
      inventorySource: (str(row.inventorySource) || undefined) as Order["inventorySource"],
      inventoryMovements: arr(row.inventoryMovements),
      marketingCommission: row.marketingCommission !== "" ? num(row.marketingCommission, undefined as unknown as number) : undefined,
      status: str(row.status, "active") === "deleted" ? "deleted" : str(row.status) === "returned" ? "returned" : "active",
      date: date(row.date),
    }));
  }

  if (key === "vendors") {
    return rows.map((row) => ({
      id: withId(row, "vendor"),
      name: str(row.name || row.vendorName, "Unknown vendor"),
      phone: str(row.phone),
      companyName: str(row.companyName) || undefined,
      taxNumber: str(row.taxNumber) || undefined,
      address: str(row.address) || undefined,
      createdAt: date(row.createdAt || row.date),
    }));
  }

  if (key === "purchases") {
    return rows.map((row): PurchaseInvoice => ({
      id: withId(row, "pur"),
      vendorId: str(row.vendorId) || uid("vendor"),
      vendorName: str(row.vendorName, "Unknown vendor"),
      referenceNumber: str(row.referenceNumber) || undefined,
      items: arr(row.items),
      totalBeforeTax: num(row.totalBeforeTax),
      totalTax: num(row.totalTax),
      grandTotal: num(row.grandTotal),
      paidAmount: num(row.paidAmount),
      remainingAmount: num(row.remainingAmount),
      type: str(row.type, "purchase") === "return" ? "return" : "purchase",
      date: date(row.date),
    }));
  }

  if (key === "expenses") {
    return rows.map((row): Expense => ({
      id: withId(row, "exp"),
      amount: num(row.amount || row.expectedAmount),
      category: str(row.category, "Other"),
      description: str(row.description || row.notes),
      date: date(row.date),
      technicianName: str(row.technicianName) || undefined,
      isTaxDeductible: Boolean(row.isTaxDeductible),
    }));
  }

  if (key === "users") {
    return rows.map((row): StaffUser => ({
      id: withId(row, "user"),
      name: str(row.name, "User"),
      phone: str(row.phone),
      role: (str(row.role, "pos") as StaffUser["role"]),
      pin: str(row.pin, "1234"),
      specialties: arr<string>(row.specialties).length ? arr<string>(row.specialties) : maybeArrayFromPipe(row.specialties),
      permissions: row.permissions && typeof row.permissions === "object" ? (row.permissions as StaffUser["permissions"]) : {
        canManageInventory: false,
        canManageUsers: false,
        canManageSettings: false,
        canManageTechnicians: false,
        canInvoice: false,
        canAcceptTask: false,
        canCompleteTask: false,
        canCreateRequests: false,
        canViewCRM: false,
        canUpdateCustomerLocation: false,
        canRecordPayments: false,
        canManageReminders: false,
      },
    }));
  }

  if (key === "urgentOrders" || key === "appointments") {
    return rows.map((row): ServiceOrder => {
      const requiredSpecialties = arr<string>(row.requiredSpecialties).length ? arr<string>(row.requiredSpecialties) : maybeArrayFromPipe(row.requiredSpecialty);
      return {
        id: withId(row, key === "urgentOrders" ? "urgent" : "appt"),
        requestNumber: num(row.requestNumber, Date.now()),
        customerId: str(row.customerId) || undefined,
        customerName: str(row.customerName, "Unknown"),
        customerPhone: str(row.customerPhone || row.phone),
        locationId: str(row.locationId) || undefined,
        locationLabel: str(row.locationLabel) || undefined,
        customerGoogleMapsUrl: str(row.customerGoogleMapsUrl) || undefined,
        customerAddress: str(row.customerAddress) || undefined,
        customerCity: str(row.customerCity) || undefined,
        customerDistrict: str(row.customerDistrict) || undefined,
        requestType: (str(row.requestType) || undefined) as ServiceOrder["requestType"],
        technicianName: str(row.technicianName) || undefined,
        technicianId: str(row.technicianId) || undefined,
        requiredSpecialty: str(row.requiredSpecialty || requiredSpecialties[0]) || undefined,
        requiredSpecialties,
        assignedTechnicianIds: arr<string>(row.assignedTechnicianIds),
        assignedTechnicianNames: arr<string>(row.assignedTechnicianNames),
        acceptedByTechnicianId: str(row.acceptedByTechnicianId) || undefined,
        acceptedByTechnicianName: str(row.acceptedByTechnicianName) || undefined,
        acceptedAt: row.acceptedAt ? date(row.acceptedAt) : undefined,
        rejectedByTechnicianIds: arr<string>(row.rejectedByTechnicianIds),
        postponedUntil: row.postponedUntil ? date(row.postponedUntil) : undefined,
        postponedDays: row.postponedDays ? num(row.postponedDays) : undefined,
        postponementNote: str(row.postponementNote) || undefined,
        taskInvoiceOrderId: str(row.taskInvoiceOrderId) || undefined,
        invoicePrintedAt: row.invoicePrintedAt ? date(row.invoicePrintedAt) : undefined,
        marketerName: str(row.marketerName) || undefined,
        marketerPhone: str(row.marketerPhone) || undefined,
        issue: str(row.issue || row.description, ""),
        serviceDescription: str(row.serviceDescription) || undefined,
        requestedItems: arr(row.requestedItems),
        expectedPaymentMethod: (str(row.expectedPaymentMethod) || undefined) as ServiceOrder["expectedPaymentMethod"],
        status: (str(row.status, "pending") as ServiceOrder["status"]),
        date: date(row.date),
        scheduledPeriod: (str(row.scheduledPeriod) || undefined) as ServiceOrder["scheduledPeriod"],
        scheduledHour: str(row.scheduledHour) || undefined,
        nextMaintenanceDate: row.nextMaintenanceDate ? date(row.nextMaintenanceDate) : undefined,
        expectedAmount: row.expectedAmount !== "" ? num(row.expectedAmount) : undefined,
        expectedPaidAmount: row.expectedPaidAmount !== "" ? num(row.expectedPaidAmount) : undefined,
        notes: str(row.notes) || undefined,
        activityLogs: arr(row.activityLogs),
        createdAt: date(row.createdAt || row.date),
        updatedAt: row.updatedAt ? date(row.updatedAt) : undefined,
      };
    });
  }

  if (key === "techInventory") {
    return rows.map((row): TechInventoryItem => ({
      id: withId(row, "techitem"),
      technicianId: str(row.technicianId) || undefined,
      technicianName: str(row.technicianName, "Unknown"),
      catalogId: str(row.catalogId),
      itemName: str(row.itemName || row.name, "Unnamed item"),
      sku: str(row.sku) || undefined,
      unit: str(row.unit) || undefined,
      qty: num(row.qty),
      createdAt: row.createdAt ? date(row.createdAt) : undefined,
      updatedAt: row.updatedAt ? date(row.updatedAt) : undefined,
    }));
  }

  if (key === "techInventoryLogs") {
    return rows.map((row): TechInventoryLog => ({
      id: withId(row, "techlog"),
      technicianId: str(row.technicianId) || undefined,
      technicianName: str(row.technicianName, "Unknown"),
      catalogId: str(row.catalogId) || undefined,
      itemName: str(row.itemName || row.name),
      type: (str(row.type, "assign") as TechInventoryLog["type"]),
      qty: num(row.qty),
      beforeQty: row.beforeQty !== "" ? num(row.beforeQty, undefined as unknown as number) : undefined,
      afterQty: row.afterQty !== "" ? num(row.afterQty, undefined as unknown as number) : undefined,
      counterpartTechnicianId: str(row.counterpartTechnicianId) || undefined,
      counterpartTechnician: str(row.counterpartTechnician) || undefined,
      transferId: str(row.transferId) || undefined,
      customerId: str(row.customerId) || undefined,
      customerName: str(row.customerName) || undefined,
      orderId: str(row.orderId) || undefined,
      invoiceNumber: str(row.invoiceNumber) || undefined,
      reference: str(row.reference) || undefined,
      notes: str(row.notes) || undefined,
      performedByUserId: str(row.performedByUserId) || undefined,
      performedByName: str(row.performedByName) || undefined,
      date: date(row.date),
    }));
  }

  if (key === "techFinancialLogs") {
    return rows.map((row): TechFinancialLog => ({
      id: withId(row, "techfin"),
      technicianId: str(row.technicianId) || undefined,
      technicianName: str(row.technicianName, "Unknown"),
      type: (str(row.type, "deposit") as TechFinancialLog["type"]),
      amount: num(row.amount),
      category: str(row.category) || undefined,
      method: (str(row.method) || undefined) as TechFinancialLog["method"],
      reference: str(row.reference) || undefined,
      orderId: str(row.orderId) || undefined,
      invoiceNumber: str(row.invoiceNumber) || undefined,
      customerId: str(row.customerId) || undefined,
      customerName: str(row.customerName) || undefined,
      performedByUserId: str(row.performedByUserId) || undefined,
      performedByName: str(row.performedByName) || undefined,
      notes: str(row.notes) || undefined,
      date: date(row.date),
    }));
  }

  if (key === "customerPayments") {
    return rows.map((row): CustomerPayment => ({
      id: withId(row, "pay"),
      customerId: str(row.customerId),
      customerName: str(row.customerName, "Unknown"),
      customerPhone: str(row.customerPhone) || undefined,
      amount: num(row.amount),
      method: (str(row.method, "cash") as CustomerPayment["method"]),
      notes: str(row.notes) || undefined,
      recordedByUserId: str(row.recordedByUserId) || undefined,
      recordedByName: str(row.recordedByName) || undefined,
      date: date(row.date),
    }));
  }

  return rows;
}

export async function readWorkbookImport(file: File, targetKey?: TargetEntity): Promise<ParsedWorkbookImport> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  const payload: WorkbookPayload = {};
  let rowCount = 0;

  workbook.SheetNames.forEach((sheetName: string, index: number) => {
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as PlainRow[];
    const rows = normalizeRows(rawRows);
    if (rows.length === 0) return;
    const key = resolveSheetKey(sheetName) || (index === 0 ? targetKey : undefined);
    if (!key) return;
    payload[key] = importRowsForKey(key, rows);
    rowCount += rows.length;
  });

  return { payload, importedKeys: Object.keys(payload), rowCount };
}

export function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls");
}
