export type SheetKey =
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
  | "reminders"
  | "reports";

export const XLSX_SHEET_COLUMNS: Record<string, string[]> = {
  customers: ["id", "name", "phone", "type", "companyName", "taxNumber", "locations", "interests", "createdAt", "reminderLevel", "nextReminderDate"],
  catalog: ["id", "name", "type", "sku", "barcode", "category", "unit", "vendorName", "price", "priceBeforeDiscount", "costPrice", "tax", "stock", "lowStockThreshold", "isBundle", "subProducts", "imageUrl"],
  orders: ["id", "invoiceNumber", "customerId", "customerName", "type", "paymentMethod", "paidAmount", "remainingAmount", "totalBeforeTax", "totalTax", "totalDiscount", "cartDiscount", "grandTotal", "branchName", "invoiceCustomerName", "invoiceCompanyName", "invoiceTaxNumber", "invoiceContactPhone", "invoiceAddress", "technicianName", "technicianCommission", "technicianCommissionType", "referralName", "referralPhone", "referralCommission", "scheduledMaintenanceDate", "nextMaintenanceDate", "items", "inventorySource", "inventoryMovements", "status", "notes", "date"],
  vendors: ["id", "name", "phone", "companyName", "taxNumber", "address", "createdAt"],
  purchases: ["id", "vendorId", "vendorName", "referenceNumber", "type", "items", "totalBeforeTax", "totalTax", "grandTotal", "paidAmount", "remainingAmount", "date"],
  expenses: ["id", "amount", "category", "description", "technicianName", "isTaxDeductible", "date"],
  settings: ["companyHeader", "defaultTaxRate", "currency", "language", "theme", "invoicePrefix", "nextInvoiceNumber", "requestPrefix", "nextRequestNumber", "categories", "productCategories", "expenseCategories", "branches", "technicianSpecialties", "hiddenModules", "warrantyTerms", "adminPassword", "whatsappTemplates", "invoiceWhatsAppTemplate", "whatsappTemplateLibrary", "printSettings", "archiveSettings", "backupSettings", "maintenanceReminderOptions", "technicianCompletionCommissionPercent", "technicianMarketingCommissionPercent", "allowMainStockFallbackForTechnicianSales"],
  users: ["id", "name", "phone", "role", "pin", "specialties", "permissions"],
  urgentOrders: ["id", "requestNumber", "customerId", "customerName", "customerPhone", "locationId", "locationLabel", "customerGoogleMapsUrl", "requestType", "technicianId", "technicianName", "requiredSpecialty", "requiredSpecialties", "assignedTechnicianIds", "assignedTechnicianNames", "acceptedByTechnicianId", "acceptedByTechnicianName", "acceptedAt", "rejectedByTechnicianIds", "issue", "serviceDescription", "requestedItems", "expectedPaymentMethod", "expectedAmount", "expectedPaidAmount", "status", "date", "scheduledPeriod", "scheduledHour", "nextMaintenanceDate", "postponedUntil", "postponedDays", "postponementNote", "taskInvoiceOrderId", "invoicePrintedAt", "marketerName", "marketerPhone", "notes", "activityLogs", "createdAt", "updatedAt"],
  appointments: ["id", "requestNumber", "customerId", "customerName", "customerPhone", "locationId", "locationLabel", "customerGoogleMapsUrl", "requestType", "technicianId", "technicianName", "requiredSpecialty", "requiredSpecialties", "assignedTechnicianIds", "assignedTechnicianNames", "issue", "serviceDescription", "requestedItems", "expectedPaymentMethod", "expectedAmount", "expectedPaidAmount", "status", "date", "scheduledPeriod", "scheduledHour", "nextMaintenanceDate", "postponedUntil", "postponedDays", "postponementNote", "taskInvoiceOrderId", "invoicePrintedAt", "marketerName", "marketerPhone", "notes", "activityLogs", "createdAt", "updatedAt"],
  techInventory: ["id", "technicianId", "technicianName", "catalogId", "itemName", "sku", "unit", "qty", "createdAt", "updatedAt"],
  techInventoryLogs: ["id", "technicianId", "technicianName", "catalogId", "itemName", "type", "qty", "beforeQty", "afterQty", "counterpartTechnicianId", "counterpartTechnician", "transferId", "customerId", "customerName", "orderId", "invoiceNumber", "reference", "notes", "performedByUserId", "performedByName", "date"],
  techFinancialLogs: ["id", "technicianId", "technicianName", "type", "amount", "category", "method", "reference", "orderId", "invoiceNumber", "customerId", "customerName", "performedByUserId", "performedByName", "notes", "date"],
  customerPayments: ["id", "customerId", "customerName", "customerPhone", "amount", "method", "notes", "recordedByUserId", "recordedByName", "date"],
  techLocations: ["technicianId", "lat", "lng", "lastUpdate"],
  reminders: ["id", "title", "description", "source", "sourceId", "customerId", "customerName", "customerPhone", "dueDate", "status", "priority", "assignedToRole", "assignedToUserId", "completedAt", "completedByUserId", "completedByName", "snoozedUntil", "notes", "createdByUserId", "createdByName", "createdAt", "updatedAt"],
  reports: ["label", "value", "sublabel", "date", "amount", "total", "count", "notes"],
  salesReport: ["Date", "Sales", "Expenses", "Profit", "PaymentMethod", "Category"],
  expensesReport: ["Date", "Category", "Description", "Amount", "Technician"],
  techniciansReport: ["name", "salesCount", "serviceCount", "revenue", "cost", "commission", "grossProfit", "expenses", "net"],
  customersReport: ["Customer", "Phone", "Invoices", "ServiceOrders", "TotalPurchases", "LastTechnician", "LastInteraction"],
  purchasesReport: ["Vendor", "Date", "Type", "Total"],
  productsReport: ["Product", "Qty", "Revenue", "Cost", "Category"],
  stockReport: ["Product", "Stock", "Category"],
  auditLogs: ["date", "dateText", "userName", "userRole", "action", "details"],
  journal: ["date", "dateText", "ref", "memo", "account", "debit", "credit"],
  trialBalance: ["account", "type", "debit", "credit", "balance"],
  incomeStatement: ["label", "value"],
  supplierAging: ["vendorName", "current", "days31to60", "days61to90", "over90", "total"],
  chartOfAccounts: ["code", "name", "type"],
};

export const XLSX_ARABIC_SHEET_NAMES: Record<string, string> = {
  customers: "العملاء",
  catalog: "الكتالوج",
  orders: "الفواتير",
  vendors: "الموردون",
  purchases: "المشتريات",
  expenses: "المصروفات",
  settings: "الإعدادات",
  users: "المستخدمون",
  urgentOrders: "الطلبات العاجلة",
  appointments: "المواعيد",
  techInventory: "مخزون الفنيين",
  techInventoryLogs: "حركات مخزون الفنيين",
  techFinancialLogs: "الحركات المالية للفنيين",
  customerPayments: "دفعات العملاء",
  techLocations: "مواقع الفنيين",
  reminders: "التذكيرات",
  reports: "التقارير",
  salesReport: "تقرير المبيعات",
  expensesReport: "تقرير المصروفات",
  techniciansReport: "تقرير الفنيين",
  customersReport: "تقرير العملاء",
  purchasesReport: "تقرير المشتريات",
  productsReport: "تقرير المنتجات",
  stockReport: "تقرير المخزون",
  auditLogs: "سجل التدقيق",
  journal: "القيود اليومية",
  trialBalance: "ميزان المراجعة",
  incomeStatement: "قائمة الدخل",
  supplierAging: "أعمار ديون الموردين",
  chartOfAccounts: "دليل الحسابات",
};

export const XLSX_ARABIC_COLUMN_LABELS: Record<string, string> = {
  index: "م",
  id: "المعرف",
  name: "الاسم",
  phone: "رقم التواصل",
  type: "النوع",
  companyName: "اسم الشركة/المؤسسة",
  taxNumber: "الرقم الضريبي",
  locations: "المواقع",
  interests: "الاهتمامات",
  createdAt: "تاريخ الإنشاء",
  reminderLevel: "مرحلة التذكير",
  nextReminderDate: "موعد التذكير القادم",
  title: "العنوان",
  source: "المصدر",
  sourceId: "معرف المصدر",
  dueDate: "تاريخ الاستحقاق",
  priority: "الأولوية",
  assignedToRole: "الدور المسند له",
  assignedToUserId: "المستخدم المسند له",
  completedAt: "تاريخ الإنجاز",
  completedByUserId: "معرف منجز التذكير",
  completedByName: "اسم منجز التذكير",
  snoozedUntil: "مؤجل حتى",
  createdByUserId: "معرف منشئ التذكير",
  createdByName: "اسم منشئ التذكير",
  sku: "SKU",
  barcode: "الباركود",
  category: "التصنيف",
  unit: "وحدة القياس",
  vendorName: "اسم المورد",
  price: "سعر البيع",
  priceBeforeDiscount: "السعر قبل الخصم",
  costPrice: "سعر التكلفة",
  tax: "الضريبة",
  stock: "المخزون",
  lowStockThreshold: "حد النقص",
  isBundle: "تجميعة",
  subProducts: "المنتجات الفرعية",
  imageUrl: "رابط الصورة",
  invoiceNumber: "رقم الفاتورة",
  customerId: "معرف العميل",
  customerName: "اسم العميل",
  customerPhone: "رقم العميل",
  paymentMethod: "طريقة الدفع",
  paidAmount: "المبلغ المدفوع",
  remainingAmount: "المبلغ المتبقي",
  totalBeforeTax: "الإجمالي قبل الضريبة",
  totalTax: "إجمالي الضريبة",
  totalDiscount: "إجمالي الخصم",
  cartDiscount: "خصم الفاتورة",
  grandTotal: "الإجمالي النهائي",
  branchName: "الفرع",
  invoiceCustomerName: "اسم العميل في الفاتورة",
  invoiceCompanyName: "اسم الشركة في الفاتورة",
  invoiceTaxNumber: "الرقم الضريبي في الفاتورة",
  invoiceContactPhone: "رقم التواصل في الفاتورة",
  invoiceAddress: "العنوان في الفاتورة",
  technicianId: "معرف الفني",
  technicianName: "اسم الفني",
  technicianCommission: "عمولة الفني",
  technicianCommissionType: "نوع عمولة الفني",
  referralName: "اسم المسوق",
  referralPhone: "رقم المسوق",
  referralCommission: "عمولة التسويق",
  marketingCommission: "عمولة التسويق",
  requiredSpecialty: "التخصص المطلوب",
  requiredSpecialties: "التخصصات المطلوبة",
  scheduledMaintenanceDate: "موعد الزيارة المجدول",
  nextMaintenanceDate: "موعد الزيارة القادم",
  items: "العناصر",
  inventorySource: "مصدر المخزون",
  inventoryMovements: "حركات المخزون",
  status: "الحالة",
  notes: "الملاحظات",
  date: "التاريخ",
  vendorId: "معرف المورد",
  referenceNumber: "رقم المرجع",
  amount: "المبلغ",
  description: "الوصف",
  isTaxDeductible: "قابل لخصم الضريبة",
  role: "الدور",
  pin: "رمز الدخول",
  specialties: "التخصصات",
  permissions: "الصلاحيات",
  requestNumber: "رقم الطلب",
  locationId: "معرف الموقع",
  locationLabel: "الموقع",
  customerGoogleMapsUrl: "رابط خرائط العميل",
  customerAddress: "عنوان العميل",
  customerCity: "مدينة العميل",
  customerDistrict: "حي العميل",
  requestType: "نوع الطلب",
  assignedTechnicianIds: "معرفات الفنيين المسندين",
  assignedTechnicianNames: "أسماء الفنيين المسندين",
  acceptedByTechnicianId: "معرف الفني القابل",
  acceptedByTechnicianName: "تم القبول بواسطة",
  acceptedAt: "تاريخ القبول",
  rejectedByTechnicianIds: "معرفات الفنيين الرافضين",
  issue: "تفاصيل الطلب/المشكلة",
  serviceDescription: "وصف الخدمة",
  requestedItems: "المنتجات/الخدمات المطلوبة",
  expectedPaymentMethod: "طريقة الدفع المتوقعة",
  expectedAmount: "المبلغ المتوقع",
  expectedPaidAmount: "المبلغ المدفوع المتوقع",
  scheduledPeriod: "الفترة المجدولة",
  scheduledHour: "الساعة المجدولة",
  postponedUntil: "مؤجل حتى",
  postponedDays: "أيام التأجيل",
  postponementNote: "ملاحظة التأجيل",
  taskInvoiceOrderId: "معرف فاتورة المهمة",
  invoicePrintedAt: "تاريخ طباعة الفاتورة",
  marketerName: "اسم المسوق",
  marketerPhone: "رقم المسوق",
  activityLogs: "سجل النشاط",
  updatedAt: "آخر تحديث",
  catalogId: "معرف الصنف",
  itemName: "اسم الصنف",
  qty: "الكمية",
  beforeQty: "الكمية قبل الحركة",
  afterQty: "الكمية بعد الحركة",
  counterpartTechnicianId: "معرف الفني الآخر",
  counterpartTechnician: "الفني الآخر",
  transferId: "معرف التحويل",
  orderId: "معرف الفاتورة",
  reference: "المرجع",
  performedByUserId: "معرف المستخدم المنفذ",
  performedByName: "المستخدم المنفذ",
  method: "طريقة الدفع",
  recordedByUserId: "معرف مسجل الدفعة",
  recordedByName: "مسجل الدفعة",
  lat: "خط العرض",
  lng: "خط الطول",
  lastUpdate: "آخر تحديث",
  label: "البند",
  value: "القيمة",
  sublabel: "وصف فرعي",
  total: "الإجمالي",
  count: "العدد",
  Date: "التاريخ",
  Sales: "المبيعات",
  Expenses: "المصروفات",
  Profit: "الربح",
  PaymentMethod: "طريقة الدفع",
  Category: "التصنيف",
  Description: "الوصف",
  Amount: "المبلغ",
  Technician: "الفني",
  Customer: "العميل",
  Phone: "رقم التواصل",
  Invoices: "عدد الفواتير",
  ServiceOrders: "طلبات الصيانة",
  TotalPurchases: "إجمالي المشتريات",
  LastTechnician: "آخر فني",
  LastInteraction: "آخر تفاعل",
  Vendor: "المورد",
  Type: "النوع",
  Product: "المنتج",
  Qty: "الكمية",
  Revenue: "الإيراد",
  Cost: "التكلفة",
  Stock: "المخزون",
  salesCount: "عدد المبيعات",
  serviceCount: "عدد طلبات الصيانة",
  revenue: "الإيرادات",
  cost: "التكلفة",
  commission: "العمولات",
  grossProfit: "إجمالي الربح",
  expenses: "المصروفات",
  net: "الصافي",
  dateText: "التاريخ نصًا",
  userName: "اسم المستخدم",
  userRole: "دور المستخدم",
  action: "الإجراء",
  details: "التفاصيل",
  ref: "المرجع",
  memo: "البيان",
  account: "الحساب",
  debit: "مدين",
  credit: "دائن",
  balance: "الرصيد",
  code: "الكود",
  current: "حالي",
  days31to60: "31 إلى 60 يوم",
  days61to90: "61 إلى 90 يوم",
  over90: "أكثر من 90 يوم",
};

export const XLSX_VALUE_TRANSLATIONS: Record<string, Record<string, string>> = {
  type: {
    product: "منتج",
    service: "خدمة",
    customer: "عميل",
    lead: "عميل محتمل",
    tax_invoice: "فاتورة ضريبية",
    quotation: "عرض سعر",
    return_invoice: "فاتورة مرتجع",
    purchase: "مشتريات",
    return: "مرتجع",
  },
  paymentMethod: {
    cash: "كاش",
    card: "شبكة",
    network: "شبكة",
    transfer: "تحويل",
    partial: "دفع جزئي",
    credit: "آجل",
    tabby: "تابي",
    tamara: "تمارا",
  },
  method: {
    cash: "كاش",
    card: "شبكة",
    network: "شبكة",
    transfer: "تحويل",
    partial: "دفع جزئي",
    credit: "آجل",
    tabby: "تابي",
    tamara: "تمارا",
  },
  expectedPaymentMethod: {
    cash: "كاش",
    card: "شبكة",
    network: "شبكة",
    transfer: "تحويل",
    partial: "دفع جزئي",
    credit: "آجل",
    tabby: "تابي",
    tamara: "تمارا",
    not_agreed: "غير متفق",
  },
  requestType: {
    new_installation: "تركيب جديد",
    maintenance: "صيانة",
    inspection: "معاينة",
    urgent_visit: "زيارة عاجلة",
  },
  status: {
    active: "نشط",
    returned: "مرتجع",
    deleted: "محذوف",
    pending: "قيد الانتظار",
    started: "تم القبول",
    in_progress: "قيد التنفيذ",
    completed: "تم",
    canceled: "ملغي",
    deferred: "مؤجل",
    done: "تم",
    snoozed: "مؤجل",
  },
  role: {
    admin: "مدير",
    supervisor: "مشرف",
    technician: "فني",
    pos: "كاشير",
  },
  technicianCommissionType: {
    percentage: "نسبة",
    fixed: "مبلغ ثابت",
    full_profit: "كامل الربح",
  },
  scheduledPeriod: {
    morning: "صباحًا",
    evening: "مساءً",
  },
  inventorySource: {
    main: "المستودع الرئيسي",
    technician: "عهدة الفني",
    mixed: "مختلط",
  },
  isBundle: { true: "نعم", false: "لا" },
  isTaxDeductible: { true: "نعم", false: "لا" },
  source: { manual: "يدوي", invoice: "فاتورة", appointment: "موعد", urgent_order: "طلب عاجل", customer: "عميل" },
  priority: { low: "منخفض", normal: "عادي", high: "مهم" },
  assignedToRole: { admin: "مدير", supervisor: "مشرف", technician: "فني", pos: "كاشير", all: "الكل" },
};

export const XLSX_TECH_INVENTORY_LOG_TRANSLATIONS: Record<string, string> = {
  assign: "إدراج صنف",
  add: "صرف للفني",
  pull: "سحب من الفني",
  return: "مرتجع للمستودع",
  sale: "بيع",
  damage: "تالف",
  lost: "فقد",
  adjustment: "تسوية جرد",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
};

export const XLSX_TECH_FINANCIAL_TRANSLATIONS: Record<string, string> = {
  advance: "عهدة مالية",
  deposit: "إيداع",
  withdrawal: "سحب مالي",
  settlement: "تسديد",
  cash_collection: "تحصيل كاش",
  completion_commission: "عمولة إنجاز",
  marketing_commission: "عمولة تسويق",
  expense: "مصروف",
};

const REVERSE_COLUMN_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(XLSX_ARABIC_COLUMN_LABELS).map(([key, label]) => [label, key])),
  "الاسم": "name",
  "النوع": "type",
  "التاريخ": "date",
  "المبلغ": "amount",
  "الكمية": "qty",
  "التكلفة": "costPrice",
  "التصنيف": "category",
  "المخزون": "stock",
  "الوصف": "description",
  "الملاحظات": "notes",
};

function reverseMap(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key]));
}

const REVERSE_VALUE_TRANSLATIONS: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(XLSX_VALUE_TRANSLATIONS).map(([key, map]) => [key, reverseMap(map)])
);

export function getSheetColumns(sheetName: string, rows: Record<string, unknown>[] = []): string[] {
  const base = XLSX_SHEET_COLUMNS[sheetName] || [];
  const extras = rows.flatMap((row) => Object.keys(row || {})).filter((key) => !base.includes(key));
  return Array.from(new Set([...base, ...extras]));
}

export function emptyRowForColumns(columns: string[]): Record<string, string> {
  return Object.fromEntries(columns.map((column) => [column, ""]));
}

export function getArabicSheetName(sheetName: string): string {
  return XLSX_ARABIC_SHEET_NAMES[sheetName] || sheetName;
}

export function getArabicColumnLabel(column: string): string {
  return XLSX_ARABIC_COLUMN_LABELS[column] || column;
}

export function getInternalColumnKey(label: string): string | undefined {
  return REVERSE_COLUMN_LABELS[String(label || "").trim()];
}

export function translateValueForExport(column: string, value: unknown): unknown {
  if (value === undefined || value === null || value === "") return value ?? "";
  if (typeof value === "boolean") {
    if (column === "isBundle" || column === "isTaxDeductible") return value ? "نعم" : "لا";
    return value;
  }
  if (column === "type" && typeof value === "string") return XLSX_TECH_INVENTORY_LOG_TRANSLATIONS[value] || XLSX_TECH_FINANCIAL_TRANSLATIONS[value] || XLSX_VALUE_TRANSLATIONS.type[value] || value;
  const map = XLSX_VALUE_TRANSLATIONS[column];
  if (!map) return value;
  return map[String(value)] || value;
}

export function translateValueForImport(column: string, value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if ((column === "isBundle" || column === "isTaxDeductible") && ["نعم", "لا"].includes(trimmed)) return trimmed === "نعم";
  if (column === "type") {
    return reverseMap(XLSX_TECH_INVENTORY_LOG_TRANSLATIONS)[trimmed]
      || reverseMap(XLSX_TECH_FINANCIAL_TRANSLATIONS)[trimmed]
      || REVERSE_VALUE_TRANSLATIONS.type?.[trimmed]
      || value;
  }
  return REVERSE_VALUE_TRANSLATIONS[column]?.[trimmed] || value;
}
