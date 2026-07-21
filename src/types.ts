/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CustomerType = "lead" | "customer";

export interface Location {
  id: string;
  address: string;
  type: string; // e.g. "Work", "Home"
  mapLink?: string;
  city?: string;
  district?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  type: CustomerType;
  locations: Location[];
  createdAt: number;
  taxNumber?: string;
  companyName?: string;
  address?: string;
  interests?: string[];
  reminderLevel?: number; // 0 to 6 tracking the 7 stages of reminders
  nextReminderDate?: number; // specific timestamp for custom reminder extensions
}

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  priceBeforeDiscount?: number;
  costPrice?: number;
  tax: number; // Will use as legacy or individual override, otherwise AppSettings default
  image?: string; // Base64 or URL
  type: "product" | "service";
  category?: string;
  sku?: string;
  stock?: number;
  isBundle: boolean;
  subProducts?: { id: string; qty: number }[];
  vendor?: string;
}

export interface OrderItem {
  catalogId: string;
  name: string;
  price: number;
  costPrice?: number;
  tax: number;
  qty: number;
  discount: number; // Fixed amount per item
}

export type OrderType = "tax_invoice" | "quotation" | "return_invoice";

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  paymentMethod?: string; // "cash" | "network" | "partial" | "tabby" | "tamara" | ...
  paidAmount?: number;
  remainingAmount?: number;
  items: OrderItem[];
  type: OrderType;
  date: number;
  technicianCommission: number;
  technicianCommissionPct?: number;
  technicianName?: string;
  totalBeforeTax: number;
  totalCost?: number;
  totalTax: number;
  totalDiscount: number;
  grandTotal: number;
  status: "active" | "deleted" | "returned";
  notes?: string;
  branchId?: string;
  invoiceNumber?: string;
}

export interface UserAccount {
  id: string;
  name: string;
  phone: string;
  email: string;
  password?: string;
  role: "admin" | "supervisor" | "technician" | "pos";
  pointOfSaleId?: string; // For POS users
  specializations?: string[];
  assignedProducts?: string[];
  inventoryCategories?: string[];
  permissions?: {
    canLogin: boolean;
    canAcceptTask?: boolean;
    canCompleteTask?: boolean;
    canInvoice?: boolean;
    isFullAdmin?: boolean;
    canManageTechnicians?: boolean;
    canManageInventory?: boolean;
    canManageSettings?: boolean;
    canManageUsers?: boolean;
  };
}

export interface PointOfSale {
  id: string;
  name: string;
  branchId?: string;
  isActive: boolean;
}

export interface AppSettings {
  adminPassword: string;
  hiddenMenus: string[];
  theme: "system" | "dark" | "light";
  defaultTaxRate?: number;
  showSignatures?: boolean;
  categories?: string[];
  branches?: { id: string; name: string }[];
  companyHeader: {
    name: string;
    address: string;
    phone: string;
    logoUrl?: string; // Base64 or URL
    taxNumber: string;
  };
  warrantyTerms: string;
  whatsappTemplates?: { id: string; name: string; content: string }[];
  whatsappTemplateTechnician?: string;
  whatsappTemplateCustomer?: string;
  savedInterests?: string[];
  expenseCategories?: string[];
  language?: "ar" | "en";
  footerSignatures?: {
    client: string;
    company: string;
  };
  currentTechnician?: string;
  currency?: string;
  users?: UserAccount[];
  pointsOfSale?: PointOfSale[];
  technicians?: { id: string; name: string; phone: string; balance?: number; username?: string; password?: string; permissions?: { canLogin: boolean; canAcceptTask: boolean; canCompleteTask: boolean; canInvoice: boolean; } }[];
  invoiceOffsets?: {
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    fontSizeBase?: number;
    fontSizeHeader?: number;

    logoX?: number;
    logoY?: number;
    logoSize?: number;
    companyX?: number;
    companyY?: number;
    customerX?: number;
    customerY?: number;
    qrX?: number;
    qrY?: number;
    qrSize?: number;
    footerX?: number;
    footerY?: number;
  };
  nextInvoiceNumber?: number;
  invoicePrefix?: string;
  nextRequestNumber?: number;
  requestPrefix?: string;
  nextQuotationNumber?: number;
  quotationPrefix?: string;
  offsets?: any;
  googleClientId?: string;
  googleBackupSettings?: {
    enabled: boolean;
    lastBackupTime?: string;
  };
}

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  taxNumber?: string;
  address?: string;
  companyName?: string;
  createdAt: number;
}

export interface Expense {
  id: string;
  date: number;
  amount: number;
  category: string;
  description: string;
  taxAmount?: number;
  isTaxDeductible?: boolean;
  technicianName?: string;
  expenseType?: "internal" | "external";
}

export interface PurchaseInvoiceItem {
  catalogId: string;
  name: string;
  costPrice: number;
  qty: number;
  tax: number;
}

export interface PurchaseInvoice {
  id: string;
  vendorId: string;
  vendorName: string;
  items: PurchaseInvoiceItem[];
  date: number;
  totalBeforeTax: number;
  totalTax: number;
  grandTotal: number;
  type: "purchase" | "return";
  referenceNumber?: string; // Invoice number from the vendor
  notes?: string;
  paymentMethod?: "transfer" | "cash" | "partial";
  paidAmount?: number;
  remainingAmount?: number;
}

export interface ServiceOrder {
  id: string;
  requestNumber?: number;
  customerId: string;
  customerName: string;
  locationId: string;
  technicianName?: string;
  issue: string;
  date: number;
  nextMaintenanceDate?: number;
  contactStatus?: "attempted" | "success";
  activityLogs?: { date: number; text: string }[];
  status:
    | "pending"
    | "completed"
    | "canceled"
    | "prospect"
    | "did_not_buy"
    | "bargaining"
    | "started"
    | "in_progress";
  requestType?: string;
  productInterest?: string;
  additionalNotes?: string;
  expectedPaymentMethod?: string;
  expectedAmount?: number;
  selectedProducts?: { id: string; name: string }[];
  createdAt?: number;
}
