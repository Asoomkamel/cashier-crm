// Core data model for the Cashier CRM system.
// Mirrors the entities defined in the requirements specification (Section 5).

export type CustomerType = "lead" | "customer";

export interface Location {
  id: string;
  address: string;
  type: string;
  label?: string;
  city?: string;
  district?: string;
  mapLink?: string;       // legacy field — kept for backward compat
  googleMapsUrl?: string; // preferred field going forward
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Resolves the best available Google Maps URL from a Location object */
export function getLocationMapUrl(loc?: Location | null): string {
  return loc?.googleMapsUrl || loc?.mapLink || "";
}

/** Resolves a human-readable location label */
export function getLocationLabel(loc?: Location | null): string {
  if (!loc) return "";
  if (loc.label) return loc.label;
  return [loc.city, loc.district, loc.address].filter(Boolean).join(" - ");
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  type: CustomerType;
  locations: Location[];
  companyName?: string;
  taxNumber?: string;
  interests?: string[];
  createdAt: number;
  reminderLevel?: number; // 0..6, the 7-stage reminder cycle
  nextReminderDate?: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  type: "product" | "service";
  price: number;
  priceBeforeDiscount?: number;
  costPrice?: number;
  tax: number; // percentage, e.g. 15
  sku?: string;
  barcode?: string;
  category?: string;
  unit?: string;
  vendorName?: string;
  imageUrl?: string;
  stock?: number;
  lowStockThreshold?: number;
  isBundle?: boolean;
  subProducts?: { id: string; qty: number }[];
}

export interface OrderItem {
  catalogId: string;
  name: string;
  price: number;
  priceBeforeDiscount?: number;
  tax: number;
  qty: number;
  discount: number; // fixed amount per line
  isManualItem?: boolean; // added ad-hoc in POS, not from the catalog
}

export type OrderType = "tax_invoice" | "quotation" | "return_invoice";
export type PaymentMethod = "cash" | "card" | "transfer" | "partial" | "credit" | "tabby" | "tamara";

export type CommissionType = "percentage" | "fixed" | "full_profit";

export interface Order {
  id: string;
  invoiceNumber: string;
  customerId?: string;
  customerName: string;
  type: OrderType;
  items: OrderItem[];
  paymentMethod: PaymentMethod;
  paidAmount: number;
  remainingAmount: number;
  totalBeforeTax: number;
  totalTax: number;
  totalDiscount: number;
  cartDiscount?: number;
  grandTotal: number;
  branchName?: string;
  invoiceCustomerName?: string;
  invoiceCompanyName?: string;
  invoiceTaxNumber?: string;
  invoiceContactPhone?: string;
  invoiceAddress?: string;
  technicianName?: string;
  technicianCommission?: number;
  technicianCommissionType?: CommissionType;
  requiredSpecialty?: string;
  scheduledMaintenanceDate?: number;
  referralName?: string;
  referralPhone?: string;
  referralCommission?: number;
  notes?: string;
  sourceServiceOrderId?: string;
  nextMaintenanceDate?: number;
  inventorySource?: "main" | "technician" | "mixed";
  inventoryMovements?: { catalogId: string; source: "main" | "technician"; technicianId?: string; technicianName?: string; qty: number }[];
  marketingCommission?: number;
  status: "active" | "returned" | "deleted";
  date: number;
}

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  companyName?: string;
  taxNumber?: string;
  address?: string;
  createdAt: number;
}

export interface PurchaseItem {
  catalogId: string;
  name: string;
  costPrice: number;
  salePrice?: number;
  barcode?: string;
  qty: number;
  tax: number;
}

export interface PurchaseInvoice {
  id: string;
  vendorId: string;
  vendorName: string;
  referenceNumber?: string;
  items: PurchaseItem[];
  totalBeforeTax: number;
  totalTax: number;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  type: "purchase" | "return";
  date: number;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: number;
  technicianName?: string;
  isTaxDeductible?: boolean;
}

export type ServiceOrderStatus =
  | "pending"
  | "started"
  | "in_progress"
  | "completed"
  | "canceled"
  | "deferred";

export type RequestType =
  | "new_installation"
  | "maintenance"
  | "inspection"
  | "urgent_visit";

export type ExpectedPaymentMethod =
  | "cash"
  | "card"
  | "transfer"
  | "credit"
  | "partial"
  | "not_agreed";

export interface ActivityLogEntry {
  date: number;
  text: string;
}

export interface ServiceOrderItem {
  catalogId: string;
  name: string;
  qty: number;
  price: number;
}

// Used for both Urgent Orders and Appointments (kept as two separate lists).
export interface ServiceOrder {
  id: string;
  requestNumber: number;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  locationId?: string;
  locationLabel?: string;
  customerGoogleMapsUrl?: string;
  customerAddress?: string;
  customerCity?: string;
  customerDistrict?: string;
  requestType?: RequestType;
  technicianName?: string;
  technicianId?: string;
  requiredSpecialty?: string; // legacy single specialty
  requiredSpecialties?: string[];
  assignedTechnicianIds?: string[];
  assignedTechnicianNames?: string[];
  acceptedByTechnicianId?: string;
  acceptedByTechnicianName?: string;
  acceptedAt?: number;
  rejectedByTechnicianIds?: string[];
  postponedUntil?: number;
  postponedDays?: number;
  postponementNote?: string;
  taskInvoiceOrderId?: string;
  invoicePrintedAt?: number;
  marketerName?: string;
  marketerPhone?: string;
  issue: string;
  serviceDescription?: string;
  requestedItems?: ServiceOrderItem[];
  expectedPaymentMethod?: ExpectedPaymentMethod;
  status: ServiceOrderStatus;
<<<<<<< HEAD
  date: number; // scheduled/requested visit date-time; 0 means no visit appointment
  visitScheduled?: boolean; // explicit marker used by the order system
  completedAt?: number;
=======
  date: number; // scheduled execution time for the current request; 0 means no execution appointment
  visitScheduled?: boolean; // legacy field: marks whether the current request execution was scheduled
  completedAt?: number; // actual time when the current request was completed
>>>>>>> first-project-before-orders
  scheduledPeriod?: "morning" | "evening";
  scheduledHour?: string;
  nextMaintenanceDate?: number; // future maintenance visit planned after completing the current request
  expectedAmount?: number;
  expectedPaidAmount?: number;
  notes?: string;
  activityLogs: ActivityLogEntry[];
  createdAt: number;
  updatedAt?: number;
}

export type Role = "admin" | "supervisor" | "technician" | "pos";

export interface Permissions {
  canManageInventory: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canManageTechnicians: boolean;
  canInvoice: boolean;
  canAcceptTask: boolean;
  canCompleteTask: boolean;
  canCreateRequests: boolean;
  canViewCRM: boolean;
  canUpdateCustomerLocation: boolean;
  canRecordPayments: boolean;
  canManageReminders: boolean;
}

export interface StaffUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  pin: string; // local login code/password set by the admin; users can change it later.
  specialties?: string[];
  permissions: Permissions;
}


export type SystemReminderStatus = "pending" | "done" | "snoozed" | "canceled";
export type SystemReminderSource = "manual" | "invoice" | "appointment" | "urgent_order" | "customer";
export type SystemReminderPriority = "low" | "normal" | "high";

export interface SystemReminder {
  id: string;
  title: string;
  description?: string;
  source: SystemReminderSource;
  sourceId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  dueDate: number;
  status: SystemReminderStatus;
  priority: SystemReminderPriority;
  assignedToRole?: "admin" | "supervisor" | "technician" | "pos" | "all";
  assignedToUserId?: string;
  completedAt?: number;
  completedByUserId?: string;
  completedByName?: string;
  snoozedUntil?: number;
  notes?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  method: PaymentMethod;
  notes?: string;
  recordedByUserId?: string;
  recordedByName?: string;
  date: number;
}

// ---- Technician Inventory (Section 3.10 / 3.11 of the spec) ----

export interface TechInventoryItem {
  id: string;
  technicianId?: string;
  technicianName: string;
  catalogId: string;
  itemName: string;
  sku?: string;
  unit?: string;
  qty: number;
  createdAt?: number;
  updatedAt?: number;
}

export type TechInventoryLogType =
  | "assign"
  | "add"
  | "pull"
  | "return"
  | "sale"
  | "damage"
  | "lost"
  | "adjustment"
  | "transfer_in"
  | "transfer_out";

export interface TechInventoryLog {
  id: string;
  technicianId?: string;
  technicianName: string;
  catalogId?: string;
  itemName: string;
  type: TechInventoryLogType;
  qty: number;
  beforeQty?: number;
  afterQty?: number;
  counterpartTechnicianId?: string;
  counterpartTechnician?: string; // for transfers
  transferId?: string;
  customerId?: string;
  customerName?: string;
  orderId?: string;
  invoiceNumber?: string;
  reference?: string;
  notes?: string;
  performedByUserId?: string;
  performedByName?: string;
  date: number;
}

export type TechFinancialType =
  | "advance"
  | "deposit"
  | "withdrawal"
  | "settlement"
  | "cash_collection"
  | "completion_commission"
  | "marketing_commission"
  | "expense";

export interface TechFinancialLog {
  id: string;
  technicianId?: string;
  technicianName: string;
  type: TechFinancialType;
  amount: number;
  category?: string;
  method?: PaymentMethod;
  reference?: string;
  orderId?: string;
  invoiceNumber?: string;
  customerId?: string;
  customerName?: string;
  performedByUserId?: string;
  performedByName?: string;
  notes?: string;
  date: number;
}

export interface TechLocation {
  lat: number;
  lng: number;
  lastUpdate: number;
}

export interface CompanyHeader {
  name: string;
  address: string;
  phone: string;
  taxNumber: string;
  logoUrl?: string;
}

export type PrintPosition = "start" | "center" | "end";

export interface PrintSettings {
  showLogo: boolean;
  showStamp: boolean;
  showCustomerSignature: boolean;
  showCompanySignature: boolean;
  logoPosition: PrintPosition;
  companyInfoPosition: PrintPosition;
  customerInfoPosition: PrintPosition;
  qrPosition: PrintPosition;
  logoSize: number;
  qrSize: number;
  fontSize: number;
  marginMm: number;
  stampImageUrl?: string;
  companySignatureUrl?: string;
}

export interface ArchiveSettings {
  enabled: boolean;
  archiveOlderThanMonths: number;
}

export interface BackupSettings {
  googleDriveAutoBackupDays: number;
  saveDatedGoogleDriveCopies: boolean;
}

export interface MaintenanceReminderOption {
  label: string;
  months: number;
}

export type WhatsAppTemplateAudience = "customer" | "technician" | "both";

export interface WhatsAppTemplateEntry {
  id: string;
  name: string;
  audience: WhatsAppTemplateAudience;
  body: string;
}

export interface WhatsAppTemplates {
  customer: string;
  technician: string;
}

export interface AppSettings {
  companyHeader: CompanyHeader;
  defaultTaxRate: number;
  currency: string;
  language: "ar" | "en";
  theme: "light" | "dark";
  invoicePrefix: string;
  nextInvoiceNumber: number;
  requestPrefix: string;
  nextRequestNumber: number;
  categories: string[]; // legacy/general categories
  productCategories: string[];
  expenseCategories: string[];
  branches: string[];
  technicianSpecialties: string[];
  hiddenModules: string[];
  warrantyTerms: string;
  adminPassword: string;
  whatsappTemplates: WhatsAppTemplates;
  invoiceWhatsAppTemplate: string;
  whatsappTemplateLibrary: WhatsAppTemplateEntry[];
  printSettings: PrintSettings;
  archiveSettings: ArchiveSettings;
  backupSettings: BackupSettings;
  maintenanceReminderOptions: MaintenanceReminderOption[];
  technicianCompletionCommissionPercent: number;
  technicianMarketingCommissionPercent: number;
  allowMainStockFallbackForTechnicianSales: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  companyHeader: {
    name: "Peurma",
    address: "Saudi Arabia",
    phone: "05xxxxxxxx",
    taxNumber: "000000000",
    logoUrl: "/logo.png",
  },
  defaultTaxRate: 15,
  currency: "SAR",
  language: "ar",
  theme: "light",
  invoicePrefix: "INV-",
  nextInvoiceNumber: 1001,
  requestPrefix: "REQ-",
  nextRequestNumber: 5001,
  categories: ["General"],
  productCategories: ["فلاتر", "رذاذ", "قطع غيار", "مواد استهلاكية", "خدمات", "أجهزة"],
  expenseCategories: ["Rent", "Utilities", "Supplies", "Other"],
  branches: ["Main Branch"],
  technicianSpecialties: ["رذاذ", "صيانة فلاتر", "تركيب فلاتر"],
  hiddenModules: [],
  warrantyTerms: "1 year warranty on products, 3 months on services.",
  adminPassword: "1234",
  printSettings: {
    showLogo: true,
    showStamp: false,
    showCustomerSignature: false,
    showCompanySignature: false,
    logoPosition: "center",
    companyInfoPosition: "start",
    customerInfoPosition: "end",
    qrPosition: "start",
    logoSize: 64,
    qrSize: 160,
    fontSize: 14,
    marginMm: 12,
    stampImageUrl: "",
    companySignatureUrl: "",
  },
  archiveSettings: {
    enabled: true,
    archiveOlderThanMonths: 12,
  },
  backupSettings: {
    googleDriveAutoBackupDays: 14,
    saveDatedGoogleDriveCopies: true,
  },
  technicianCompletionCommissionPercent: 5,
  technicianMarketingCommissionPercent: 25,
  allowMainStockFallbackForTechnicianSales: false,
  maintenanceReminderOptions: [
    { label: "شهر", months: 1 },
    { label: "شهران", months: 2 },
    { label: "3 أشهر", months: 3 },
    { label: "4 أشهر", months: 4 },
    { label: "5 أشهر", months: 5 },
    { label: "6 أشهر", months: 6 },
    { label: "7 أشهر", months: 7 },
    { label: "8 أشهر", months: 8 },
    { label: "9 أشهر", months: 9 },
    { label: "10 أشهر", months: 10 },
    { label: "11 شهر", months: 11 },
    { label: "سنة", months: 12 },
  ],
  whatsappTemplates: {
    customer:
      "مرحباً {اسم_العميل}، نذكركم بموعدكم بتاريخ {التاريخ} بخصوص: {تفاصيل_الطلب}. المبلغ المستحق: {المبلغ} {العملة}.",
    technician:
      "تم إسناد مهمة جديدة لك: العميل {اسم_العميل} ({رقم_العميل}). التفاصيل: {تفاصيل_الطلب}. الموعد: {التاريخ}.",
  },
  invoiceWhatsAppTemplate:
    "مرحبًا {اسم_العميل}\nتم إصدار فاتورتكم رقم {رقم_الفاتورة}\nالإجمالي: {الإجمالي} {العملة}\n{موعد_الصيانة_القادم}\nشكرًا لكم.",
  whatsappTemplateLibrary: [
    {
      id: "tpl_customer_confirmation",
      name: "تأكيد موعد العميل",
      audience: "customer",
      body: "مرحباً {اسم_العميل}، تم تسجيل طلبكم رقم {رقم_الطلب}. الموعد: {التاريخ}. التفاصيل: {تفاصيل_الطلب}.",
    },
    {
      id: "tpl_customer_price",
      name: "إرسال التسعير للعميل",
      audience: "customer",
      body: "مرحباً {اسم_العميل}، قيمة الخدمة المتوقعة لطلبكم رقم {رقم_الطلب}: {المبلغ} {العملة}. التفاصيل: {تفاصيل_الطلب}.",
    },
    {
      id: "tpl_technician_assignment",
      name: "إسناد مهمة للفني",
      audience: "technician",
      body: "مهمة جديدة رقم {رقم_الطلب}: العميل {اسم_العميل} - {رقم_العميل}. الموعد: {التاريخ}. المطلوب: {تفاصيل_الطلب}.",
    },
  ],
};

// ---- Audit trail (new) ----
export interface AuditLogEntry {
  id: string;
  date: number;
  userName: string;
  userRole: string;
  action: string; // short machine-ish label, e.g. "delete_customer", "login"
  details?: string; // human-readable extra context, e.g. the customer's name
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
