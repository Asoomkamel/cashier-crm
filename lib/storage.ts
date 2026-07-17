import { AppSettings, Customer, CatalogItem, Order, Vendor, PurchaseInvoice, Expense, StaffUser, ServiceOrder, TechInventoryItem, TechInventoryLog, TechFinancialLog, TechLocation, CustomerPayment, SystemReminder, Permissions, Role, DEFAULT_SETTINGS, AuditLogEntry } from "./types";


const LEGACY_EN_WHATSAPP_CUSTOMER_TEMPLATE =
  "Hello {customer_name}, this is a reminder about your appointment on {date} regarding: {issue}. Amount due: {amount} {currency}.";

const LEGACY_EN_WHATSAPP_TECHNICIAN_TEMPLATE =
  "New task assigned: {customer_name} ({customer_phone}). Issue: {issue}. Scheduled: {date}.";

const LEGACY_AR_EN_WHATSAPP_CUSTOMER_TEMPLATE =
  "مرحباً {customer_name}، نذكركم بموعدكم بتاريخ {date} بخصوص: {issue}. المبلغ المستحق: {amount} {currency}.";

const LEGACY_AR_EN_WHATSAPP_TECHNICIAN_TEMPLATE =
  "تم إسناد مهمة جديدة لك: العميل {customer_name} ({customer_phone}). التفاصيل: {issue}. الموعد: {date}.";

const LEGACY_TEMPLATE_LIBRARY_BODIES: Record<string, string> = {
  "مرحباً {customer_name}، تم تسجيل طلبكم رقم {request_number}. الموعد: {date}. التفاصيل: {issue}.":
    "مرحباً {اسم_العميل}، تم تسجيل طلبكم رقم {رقم_الطلب}. الموعد: {التاريخ}. التفاصيل: {تفاصيل_الطلب}.",
  "مرحباً {customer_name}، قيمة الخدمة المتوقعة لطلبكم رقم {request_number}: {amount} {currency}. التفاصيل: {issue}.":
    "مرحباً {اسم_العميل}، قيمة الخدمة المتوقعة لطلبكم رقم {رقم_الطلب}: {المبلغ} {العملة}. التفاصيل: {تفاصيل_الطلب}.",
  "مهمة جديدة رقم {request_number}: العميل {customer_name} - {customer_phone}. الموعد: {date}. المطلوب: {issue}.":
    "مهمة جديدة رقم {رقم_الطلب}: العميل {اسم_العميل} - {رقم_العميل}. الموعد: {التاريخ}. المطلوب: {تفاصيل_الطلب}.",
};

function normalizeDefaultWhatsappTemplates(settings: AppSettings): AppSettings {
  const customerTemplate = settings.whatsappTemplates?.customer;
  const technicianTemplate = settings.whatsappTemplates?.technician;
  const shouldUseDefaultCustomer =
    !customerTemplate ||
    customerTemplate === LEGACY_EN_WHATSAPP_CUSTOMER_TEMPLATE ||
    customerTemplate === LEGACY_AR_EN_WHATSAPP_CUSTOMER_TEMPLATE;
  const shouldUseDefaultTechnician =
    !technicianTemplate ||
    technicianTemplate === LEGACY_EN_WHATSAPP_TECHNICIAN_TEMPLATE ||
    technicianTemplate === LEGACY_AR_EN_WHATSAPP_TECHNICIAN_TEMPLATE;

  return {
    ...settings,
    whatsappTemplates: {
      ...settings.whatsappTemplates,
      customer: shouldUseDefaultCustomer ? DEFAULT_SETTINGS.whatsappTemplates.customer : customerTemplate,
      technician: shouldUseDefaultTechnician ? DEFAULT_SETTINGS.whatsappTemplates.technician : technicianTemplate,
    },
    whatsappTemplateLibrary: (settings.whatsappTemplateLibrary || DEFAULT_SETTINGS.whatsappTemplateLibrary).map((tpl) => ({
      ...tpl,
      body: LEGACY_TEMPLATE_LIBRARY_BODIES[tpl.body] || tpl.body,
    })),
  };
}

const KEYS = {
  CUSTOMERS: "cc_customers",
  CATALOG: "cc_catalog",
  ORDERS: "cc_orders",
  VENDORS: "cc_vendors",
  PURCHASES: "cc_purchases",
  EXPENSES: "cc_expenses",
  SETTINGS: "cc_settings",
  USERS: "cc_users",
  ACTIVE_USER: "cc_active_user",
  URGENT_ORDERS: "cc_urgent_orders",
  APPOINTMENTS: "cc_appointments",
  TECH_INVENTORY: "cc_tech_inventory",
  TECH_INVENTORY_LOGS: "cc_tech_inventory_logs",
  TECH_FINANCIAL_LOGS: "cc_tech_financial_logs",
  TECH_LOCATIONS: "cc_tech_locations",
  CUSTOMER_PAYMENTS: "cc_customer_payments",
  REMINDERS: "cc_system_reminders",
  AUDIT_LOG: "cc_audit_log",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Like read(), but guarantees an array is returned even if the stored value
// got corrupted into a non-array (e.g. a bad import). Prevents `.map is not
// a function` crashes on app boot.
function readArray<T>(key: string, fallback: T[]): T[] {
  const value = read<T[]>(key, fallback);
  return Array.isArray(value) ? value : fallback;
}

function num(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function mergeMaintenanceOptions(loaded?: AppSettings["maintenanceReminderOptions"]): AppSettings["maintenanceReminderOptions"] {
  const source = Array.isArray(loaded) ? loaded : [];
  const map = new Map<number, string>();
  DEFAULT_SETTINGS.maintenanceReminderOptions.forEach((option) => map.set(option.months, option.label));
  source.forEach((option) => {
    const months = num(option?.months, 0);
    const label = String(option?.label || "").trim();
    if (months > 0 && label) map.set(months, label);
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([months, label]) => ({ label, months }));
}

// Backfills missing string fields that the UI assumes are always present
// (e.g. after importing an older/partial JSON backup) so pages never crash
// calling .toLowerCase()/.replace() on undefined. This runs on every read.
// Backfills missing/mistyped fields that the UI assumes are always present
// and correctly typed (e.g. after importing an older/partial/mistyped JSON
// backup) so pages never crash calling .toLowerCase()/.replace()/.toFixed()
// on undefined or a string. This runs on every read.
function sanitizeOrders(list: Order[]): Order[] {
  return list.map((o) => ({
    ...o,
    invoiceNumber: o.invoiceNumber || "—",
    customerName: o.customerName || "Unknown",
    invoiceCustomerName: o.invoiceCustomerName || undefined,
    invoiceCompanyName: o.invoiceCompanyName || undefined,
    invoiceTaxNumber: o.invoiceTaxNumber || undefined,
    invoiceContactPhone: o.invoiceContactPhone || undefined,
    invoiceAddress: o.invoiceAddress || undefined,
    type: o.type || "tax_invoice",
    status: o.status || "active",
    items: (Array.isArray(o.items) ? o.items : []).map((it) => ({
      ...it,
      name: it?.name || "Unnamed item",
      price: num(it?.price),
      tax: num(it?.tax),
      qty: num(it?.qty, 1),
      discount: num(it?.discount),
    })),
    paidAmount: num(o.paidAmount),
    remainingAmount: num(o.remainingAmount),
    totalBeforeTax: num(o.totalBeforeTax),
    totalTax: num(o.totalTax),
    totalDiscount: num(o.totalDiscount),
    grandTotal: num(o.grandTotal),
    technicianCommission: o.technicianCommission !== undefined ? num(o.technicianCommission) : undefined,
    requiredSpecialty: o.requiredSpecialty || "",
    scheduledMaintenanceDate: o.scheduledMaintenanceDate ? num(o.scheduledMaintenanceDate) : undefined,
    nextMaintenanceDate: o.nextMaintenanceDate ? num(o.nextMaintenanceDate) : undefined,
    sourceServiceOrderId: o.sourceServiceOrderId || undefined,
    inventorySource: o.inventorySource || undefined,
    inventoryMovements: Array.isArray(o.inventoryMovements) ? o.inventoryMovements.map((m) => ({ ...m, qty: num(m?.qty) })) : [],
    marketingCommission: o.marketingCommission !== undefined ? num(o.marketingCommission) : undefined,
    referralName: o.referralName || "",
    referralPhone: o.referralPhone || "",
    notes: o.notes || "",
  }));
}

function sanitizeLocations(locs: any[]): import("./types").Location[] {
  return locs.map((l) => ({
    ...l,
    id: l.id || `loc_${Math.random().toString(36).slice(2)}`,
    address: l.address || "",
    type: l.type || "main",
    label: l.label || undefined,
    city: l.city || undefined,
    district: l.district || undefined,
    // normalize: prefer googleMapsUrl, fall back to mapLink
    googleMapsUrl: l.googleMapsUrl || l.mapLink || undefined,
    mapLink: l.mapLink || l.googleMapsUrl || undefined,
    notes: l.notes || undefined,
    createdAt: l.createdAt || Date.now(),
    updatedAt: l.updatedAt || l.createdAt || Date.now(),
  }));
}

function sanitizeCustomers(list: Customer[]): Customer[] {
  return list.map((c) => ({
    ...c,
    name: c.name || "Unknown",
    phone: (c.phone || "").replace(/[\u200e\u200f\u200b\u200c\u200d\ufeff\u00a0]/g, "").trim(),
    locations: sanitizeLocations(Array.isArray(c.locations) ? c.locations : []),
  }));
}

function sanitizeCatalog(list: CatalogItem[]): CatalogItem[] {
  return list.map((c) => ({
    ...c,
    name: c.name || "Unnamed item",
    price: num(c.price),
    costPrice: c.costPrice !== undefined ? num(c.costPrice) : undefined,
    tax: num(c.tax),
    stock: c.stock !== undefined ? num(c.stock) : undefined,
    category: c.category || "غير مصنف",
    unit: c.unit || undefined,
  }));
}

function sanitizeServiceOrders(list: ServiceOrder[]): ServiceOrder[] {
  return list.map((o) => {
    const legacySpecialty = (o.requiredSpecialty || "").trim();
    const requiredSpecialties = Array.isArray(o.requiredSpecialties)
      ? o.requiredSpecialties.map((x) => String(x || "").trim()).filter(Boolean)
      : legacySpecialty ? [legacySpecialty] : [];
    const assignedTechnicianIds = Array.isArray(o.assignedTechnicianIds)
      ? o.assignedTechnicianIds.map((x) => String(x || "").trim()).filter(Boolean)
      : o.technicianId ? [o.technicianId] : [];
    const assignedTechnicianNames = Array.isArray(o.assignedTechnicianNames)
      ? o.assignedTechnicianNames.map((x) => String(x || "").trim()).filter(Boolean)
      : o.technicianName ? [o.technicianName] : [];
    return ({
    ...o,
    customerName: o.customerName || "Unknown",
    customerPhone: o.customerPhone || "",
    status: o.status || "pending",
    activityLogs: Array.isArray(o.activityLogs) ? o.activityLogs : [],
    expectedAmount: o.expectedAmount !== undefined ? num(o.expectedAmount) : undefined,
    expectedPaidAmount: o.expectedPaidAmount !== undefined ? num(o.expectedPaidAmount) : undefined,
    requestedItems: Array.isArray(o.requestedItems)
      ? o.requestedItems.map((it) => ({
          catalogId: it?.catalogId || "",
          name: it?.name || "Unnamed item",
          qty: num(it?.qty, 1),
          price: num(it?.price),
        }))
      : [],
    requiredSpecialty: o.requiredSpecialty || "",
    marketerName: o.marketerName || "",
    marketerPhone: o.marketerPhone || "",
    notes: o.notes || "",
    requestType: o.requestType || undefined,
    locationLabel: o.locationLabel || undefined,
    technicianId: o.technicianId || undefined,
    serviceDescription: o.serviceDescription || undefined,
    expectedPaymentMethod: o.expectedPaymentMethod || undefined,
    scheduledPeriod: o.scheduledPeriod || undefined,
    scheduledHour: o.scheduledHour || undefined,
    updatedAt: o.updatedAt || undefined,
    // location fields — backward compatible
    customerGoogleMapsUrl: o.customerGoogleMapsUrl || undefined,
    customerAddress: o.customerAddress || undefined,
    customerCity: o.customerCity || undefined,
    customerDistrict: o.customerDistrict || undefined,
    requiredSpecialties,
    assignedTechnicianIds,
    assignedTechnicianNames,
    acceptedByTechnicianId: o.acceptedByTechnicianId || undefined,
    acceptedByTechnicianName: o.acceptedByTechnicianName || undefined,
    acceptedAt: o.acceptedAt ? num(o.acceptedAt) : undefined,
    rejectedByTechnicianIds: Array.isArray(o.rejectedByTechnicianIds) ? o.rejectedByTechnicianIds.filter(Boolean) : [],
    postponedUntil: o.postponedUntil ? num(o.postponedUntil) : undefined,
    postponedDays: o.postponedDays ? num(o.postponedDays) : undefined,
    postponementNote: o.postponementNote || undefined,
    taskInvoiceOrderId: o.taskInvoiceOrderId || undefined,
    invoicePrintedAt: o.invoicePrintedAt ? num(o.invoicePrintedAt) : undefined,
  });
  });
}

function sanitizeVendors(list: Vendor[]): Vendor[] {
  return list.map((v) => ({ ...v, name: v.name || "Unknown vendor", phone: v.phone || "" }));
}

function sanitizePurchases(list: PurchaseInvoice[]): PurchaseInvoice[] {
  return list.map((p) => ({
    ...p,
    vendorName: p.vendorName || "Unknown vendor",
    items: (Array.isArray(p.items) ? p.items : []).map((it) => ({
      ...it,
      name: it?.name || "Unnamed item",
      costPrice: num(it?.costPrice),
      salePrice: it?.salePrice !== undefined ? num(it?.salePrice) : undefined,
      barcode: it?.barcode || "",
      qty: num(it?.qty, 1),
      tax: num(it?.tax),
    })),
    totalBeforeTax: num(p.totalBeforeTax),
    totalTax: num(p.totalTax),
    grandTotal: num(p.grandTotal),
    paidAmount: num(p.paidAmount),
    remainingAmount: num(p.remainingAmount),
    type: p.type || "purchase",
  }));
}

function sanitizeExpenses(list: Expense[]): Expense[] {
  return list.map((e) => ({ ...e, amount: num(e.amount), category: e.category || "Other", description: e.description || "" }));
}

function sanitizeTechInventory(list: TechInventoryItem[]): TechInventoryItem[] {
  return list.map((i) => ({
    ...i,
    technicianId: i.technicianId || undefined,
    technicianName: i.technicianName || "Unknown technician",
    itemName: i.itemName || "Unnamed item",
    sku: i.sku || undefined,
    unit: i.unit || undefined,
    qty: num(i.qty),
    createdAt: i.createdAt ? num(i.createdAt) : undefined,
    updatedAt: i.updatedAt ? num(i.updatedAt) : undefined,
  }));
}

function sanitizeTechInventoryLogs(list: TechInventoryLog[]): TechInventoryLog[] {
  return list.map((l) => ({
    ...l,
    technicianId: l.technicianId || undefined,
    technicianName: l.technicianName || "Unknown technician",
    catalogId: l.catalogId || undefined,
    itemName: l.itemName || l.notes || "—",
    type: l.type || "add",
    qty: num(l.qty),
    beforeQty: l.beforeQty !== undefined ? num(l.beforeQty) : undefined,
    afterQty: l.afterQty !== undefined ? num(l.afterQty) : undefined,
    amount: undefined,
    date: num(l.date, Date.now()),
  }));
}

function sanitizeTechFinancialLogs(list: TechFinancialLog[]): TechFinancialLog[] {
  return list.map((l) => ({
    ...l,
    technicianId: l.technicianId || undefined,
    technicianName: l.technicianName || "Unknown technician",
    type: l.type || "cash_collection",
    amount: num(l.amount),
    category: l.category || undefined,
    method: l.method || undefined,
    reference: l.reference || undefined,
    notes: l.notes || undefined,
    date: num(l.date, Date.now()),
  }));
}

function defaultPermissions(role: Role): Permissions {
  return {
    canManageInventory: role === "admin" || role === "supervisor",
    canManageUsers: role === "admin",
    canManageSettings: role === "admin",
    canManageTechnicians: role === "admin" || role === "supervisor",
    canInvoice: role === "admin" || role === "supervisor" || role === "pos",
    canAcceptTask: role === "technician",
    canCompleteTask: role === "technician",
    canCreateRequests: role === "admin" || role === "supervisor",
    canViewCRM: role === "admin" || role === "supervisor",
    canUpdateCustomerLocation: role === "admin" || role === "supervisor",
    canRecordPayments: role === "admin" || role === "supervisor",
    canManageReminders: role === "admin" || role === "supervisor",
  };
}

function sanitizePermissions(role: Role, permissions?: Partial<Permissions>): Permissions {
  return { ...defaultPermissions(role), ...(permissions || {}) };
}

function sanitizeUsers(list: StaffUser[]): StaffUser[] {
  return list.map((u) => ({
    ...u,
    name: u.name || "User",
    // تنظيف الحروف الخفية من رقم الهاتف عند كل حفظ/قراءة
    phone: (u.phone || "").replace(/[\u200e\u200f\u200b\u200c\u200d\ufeff\u00a0]/g, "").trim(),
    role: (u.role || "pos") as Role,
    pin: u.pin || "1234",
    specialties: Array.isArray(u.specialties) ? u.specialties.filter(Boolean) : [],
    permissions: sanitizePermissions((u.role || "pos") as Role, u.permissions),
  }));
}

function sanitizeCustomerPayments(list: CustomerPayment[]): CustomerPayment[] {
  return list.map((p) => ({
    ...p,
    customerId: p.customerId || "",
    customerName: p.customerName || "Unknown",
    customerPhone: p.customerPhone || "",
    amount: num(p.amount),
    method: p.method || "cash",
    date: num(p.date, Date.now()),
  }));
}

function sanitizeReminders(list: SystemReminder[]): SystemReminder[] {
  return list.map((r) => ({
    ...r,
    id: r.id || `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: r.title || "Reminder",
    description: r.description || undefined,
    source: r.source || "manual",
    sourceId: r.sourceId || undefined,
    customerId: r.customerId || undefined,
    customerName: r.customerName || undefined,
    customerPhone: r.customerPhone || undefined,
    dueDate: num(r.dueDate, Date.now()),
    status: r.status || "pending",
    priority: r.priority || "normal",
    assignedToRole: r.assignedToRole || "all",
    assignedToUserId: r.assignedToUserId || undefined,
    completedAt: r.completedAt ? num(r.completedAt) : undefined,
    completedByUserId: r.completedByUserId || undefined,
    completedByName: r.completedByName || undefined,
    snoozedUntil: r.snoozedUntil ? num(r.snoozedUntil) : undefined,
    notes: r.notes || undefined,
    createdByUserId: r.createdByUserId || undefined,
    createdByName: r.createdByName || undefined,
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: r.updatedAt ? num(r.updatedAt) : undefined,
  }));
}

const SEED_USERS: StaffUser[] = [
  {
    id: "u_admin",
    name: "Admin",
    phone: "0500000000",
    role: "admin",
    pin: "1234",
    specialties: [],
    permissions: {
      canManageInventory: true,
      canManageUsers: true,
      canManageSettings: true,
      canManageTechnicians: true,
      canInvoice: true,
      canAcceptTask: true,
      canCompleteTask: true,
      canCreateRequests: true,
      canViewCRM: true,
      canUpdateCustomerLocation: true,
      canRecordPayments: true,
      canManageReminders: true,
    },
  },
];

export const storage = {
  getCustomers: (): Customer[] => sanitizeCustomers(readArray(KEYS.CUSTOMERS, [])),
  saveCustomers: (v: Customer[]) => write(KEYS.CUSTOMERS, v),

  getCatalog: (): CatalogItem[] => sanitizeCatalog(readArray(KEYS.CATALOG, [])),
  saveCatalog: (v: CatalogItem[]) => write(KEYS.CATALOG, v),

  getOrders: (): Order[] => sanitizeOrders(readArray(KEYS.ORDERS, [])),
  saveOrders: (v: Order[]) => write(KEYS.ORDERS, v),

  getVendors: (): Vendor[] => sanitizeVendors(readArray(KEYS.VENDORS, [])),
  saveVendors: (v: Vendor[]) => write(KEYS.VENDORS, v),

  getPurchases: (): PurchaseInvoice[] => sanitizePurchases(readArray(KEYS.PURCHASES, [])),
  savePurchases: (v: PurchaseInvoice[]) => write(KEYS.PURCHASES, v),

  getExpenses: (): Expense[] => sanitizeExpenses(readArray(KEYS.EXPENSES, [])),
  saveExpenses: (v: Expense[]) => write(KEYS.EXPENSES, v),

  getSettings: (): AppSettings => {
    const loaded = read<Partial<AppSettings>>(KEYS.SETTINGS, DEFAULT_SETTINGS);
    // Deep-merge nested settings so old backups/localStorage continue to work
    // after new Settings tabs/options are added.
    return normalizeDefaultWhatsappTemplates({
      ...DEFAULT_SETTINGS,
      ...loaded,
      companyHeader: { ...DEFAULT_SETTINGS.companyHeader, ...loaded?.companyHeader },
      whatsappTemplates: { ...DEFAULT_SETTINGS.whatsappTemplates, ...loaded?.whatsappTemplates },
      invoiceWhatsAppTemplate: String(loaded?.invoiceWhatsAppTemplate || DEFAULT_SETTINGS.invoiceWhatsAppTemplate),
      printSettings: { ...DEFAULT_SETTINGS.printSettings, ...loaded?.printSettings },
      archiveSettings: { ...DEFAULT_SETTINGS.archiveSettings, ...loaded?.archiveSettings },
      backupSettings: { ...DEFAULT_SETTINGS.backupSettings, ...loaded?.backupSettings },
      categories: Array.isArray(loaded?.categories) ? loaded.categories : DEFAULT_SETTINGS.categories,
      productCategories: uniqueStrings([
        ...DEFAULT_SETTINGS.productCategories,
        ...(Array.isArray(loaded?.productCategories) ? loaded.productCategories : []),
        ...(Array.isArray(loaded?.categories) ? loaded.categories : []),
      ]),
      expenseCategories: Array.isArray(loaded?.expenseCategories) ? loaded.expenseCategories : DEFAULT_SETTINGS.expenseCategories,
      branches: Array.isArray(loaded?.branches) ? loaded.branches : DEFAULT_SETTINGS.branches,
      technicianSpecialties: Array.isArray(loaded?.technicianSpecialties) ? loaded.technicianSpecialties : DEFAULT_SETTINGS.technicianSpecialties,
      maintenanceReminderOptions: mergeMaintenanceOptions(loaded?.maintenanceReminderOptions),
      whatsappTemplateLibrary: Array.isArray(loaded?.whatsappTemplateLibrary) ? loaded.whatsappTemplateLibrary : DEFAULT_SETTINGS.whatsappTemplateLibrary,
      hiddenModules: Array.isArray(loaded?.hiddenModules) ? loaded.hiddenModules : DEFAULT_SETTINGS.hiddenModules,
      technicianCompletionCommissionPercent: num(loaded?.technicianCompletionCommissionPercent, DEFAULT_SETTINGS.technicianCompletionCommissionPercent),
      technicianMarketingCommissionPercent: num(loaded?.technicianMarketingCommissionPercent, DEFAULT_SETTINGS.technicianMarketingCommissionPercent),
      allowMainStockFallbackForTechnicianSales: Boolean(loaded?.allowMainStockFallbackForTechnicianSales ?? DEFAULT_SETTINGS.allowMainStockFallbackForTechnicianSales),
    });
  },
  saveSettings: (v: AppSettings) => write(KEYS.SETTINGS, v),

  getUsers: (): StaffUser[] => sanitizeUsers(readArray(KEYS.USERS, SEED_USERS)),
  saveUsers: (v: StaffUser[]) => write(KEYS.USERS, sanitizeUsers(v)),

  getActiveUser: (): StaffUser | null => read(KEYS.ACTIVE_USER, null),
  saveActiveUser: (v: StaffUser | null) => write(KEYS.ACTIVE_USER, v),

  getUrgentOrders: (): ServiceOrder[] => sanitizeServiceOrders(readArray(KEYS.URGENT_ORDERS, [])),
  saveUrgentOrders: (v: ServiceOrder[]) => write(KEYS.URGENT_ORDERS, v),

  getAppointments: (): ServiceOrder[] => sanitizeServiceOrders(readArray(KEYS.APPOINTMENTS, [])),
  saveAppointments: (v: ServiceOrder[]) => write(KEYS.APPOINTMENTS, v),

  getTechInventory: (): TechInventoryItem[] => sanitizeTechInventory(readArray(KEYS.TECH_INVENTORY, [])),
  saveTechInventory: (v: TechInventoryItem[]) => write(KEYS.TECH_INVENTORY, v),

  getTechInventoryLogs: (): TechInventoryLog[] => sanitizeTechInventoryLogs(readArray(KEYS.TECH_INVENTORY_LOGS, [])),
  saveTechInventoryLogs: (v: TechInventoryLog[]) => write(KEYS.TECH_INVENTORY_LOGS, sanitizeTechInventoryLogs(v)),

  getTechFinancialLogs: (): TechFinancialLog[] => sanitizeTechFinancialLogs(readArray(KEYS.TECH_FINANCIAL_LOGS, [])),
  saveTechFinancialLogs: (v: TechFinancialLog[]) => write(KEYS.TECH_FINANCIAL_LOGS, v),

  getCustomerPayments: (): CustomerPayment[] => sanitizeCustomerPayments(readArray(KEYS.CUSTOMER_PAYMENTS, [])),
  saveCustomerPayments: (v: CustomerPayment[]) => write(KEYS.CUSTOMER_PAYMENTS, sanitizeCustomerPayments(v)),

  getReminders: (): SystemReminder[] => sanitizeReminders(readArray(KEYS.REMINDERS, [])),
  saveReminders: (v: SystemReminder[]) => write(KEYS.REMINDERS, sanitizeReminders(v)),

  getTechLocations: (): Record<string, TechLocation> => read(KEYS.TECH_LOCATIONS, {}),
  saveTechLocations: (v: Record<string, TechLocation>) => write(KEYS.TECH_LOCATIONS, v),
  saveTechLocation: (techName: string, loc: { lat: number; lng: number }) => {
    const all = read<Record<string, TechLocation>>(KEYS.TECH_LOCATIONS, {});
    all[techName] = { ...loc, lastUpdate: Date.now() };
    write(KEYS.TECH_LOCATIONS, all);
  },

  getAuditLog: (): AuditLogEntry[] => readArray<AuditLogEntry>(KEYS.AUDIT_LOG, []),
  addAuditLog: (entry: Omit<AuditLogEntry, "id" | "date"> & { date?: number }) => {
    if (typeof window === "undefined") return;
    const current = readArray<AuditLogEntry>(KEYS.AUDIT_LOG, []);
    const next: AuditLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: entry.date ?? Date.now(),
      userName: entry.userName,
      userRole: entry.userRole,
      action: entry.action,
      details: entry.details,
    };
    // Keep only the most recent 500 entries so localStorage never bloats.
    const trimmed = [...current, next].slice(-500);
    write(KEYS.AUDIT_LOG, trimmed);
  },

  resetAll: () => {
    if (typeof window === "undefined") return;
    Object.values(KEYS).forEach((k) => window.localStorage.removeItem(k));
  },
};
