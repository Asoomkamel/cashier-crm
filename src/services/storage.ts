/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings, CatalogItem, Customer, Order } from "../types";

const KEYS = {
  CUSTOMERS: "crm_customers",
  CATALOG: "crm_catalog",
  ORDERS: "crm_orders",
  SETTINGS: "crm_settings",
  SERVICE_ORDERS: "crm_service_orders",
  VENDORS: "crm_vendors",
  PURCHASES: "crm_purchases",
  URGENT_ORDERS: "crm_urgent_orders",
  FAST_ORDERS: "crm_fast_orders",
  USERS: "crm_users",
  ACTIVE_USER: "crm_active_user",
};

const DEFAULT_SETTINGS: AppSettings = {
  adminPassword: "1234",
  hiddenMenus: [],
  theme: "light",
  companyHeader: {
    name: "شركتك هنا",
    address: "العنوان بالتفصيل",
    phone: "05xxxxxxxx",
    taxNumber: "123456789",
  },
  warrantyTerms: "ضمان لمدة سنة على المنتجات و3 أشهر على الخدمات.",
  whatsappTemplates: [],
};

export const storage = {
  getCustomers: (): Customer[] =>
    JSON.parse(localStorage.getItem(KEYS.CUSTOMERS) || "[]"),
  saveCustomers: (data: Customer[]) =>
    localStorage.setItem(KEYS.CUSTOMERS, JSON.stringify(data)),

  getCatalog: (): CatalogItem[] =>
    JSON.parse(localStorage.getItem(KEYS.CATALOG) || "[]"),
  saveCatalog: (data: CatalogItem[]) =>
    localStorage.setItem(KEYS.CATALOG, JSON.stringify(data)),

  getOrders: (): Order[] =>
    JSON.parse(localStorage.getItem(KEYS.ORDERS) || "[]"),
  saveOrders: (data: Order[]) =>
    localStorage.setItem(KEYS.ORDERS, JSON.stringify(data)),

  getSettings: (): AppSettings => {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      hiddenMenus: parsed.hiddenMenus || DEFAULT_SETTINGS.hiddenMenus || [],
      companyHeader: {
        ...DEFAULT_SETTINGS.companyHeader,
        ...(parsed.companyHeader || {}),
      },
      whatsappTemplates: parsed.whatsappTemplates || [],
      invoiceOffsets: parsed.invoiceOffsets || {},
      footerSignatures: parsed.footerSignatures || {
        client: "",
        company: "",
      },
    };
  },
  saveSettings: (data: AppSettings) =>
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data)),

  getServiceOrders: (): any[] =>
    JSON.parse(localStorage.getItem(KEYS.SERVICE_ORDERS) || "[]"),
  saveServiceOrders: (data: any[]) =>
    localStorage.setItem(KEYS.SERVICE_ORDERS, JSON.stringify(data)),

  getUrgentOrders: (): any[] =>
    JSON.parse(localStorage.getItem(KEYS.URGENT_ORDERS) || "[]"),
  saveUrgentOrders: (data: any[]) =>
    localStorage.setItem(KEYS.URGENT_ORDERS, JSON.stringify(data)),

  getFastOrders: (): any[] =>
    JSON.parse(localStorage.getItem(KEYS.FAST_ORDERS) || "[]"),
  saveFastOrders: (data: any[]) =>
    localStorage.setItem(KEYS.FAST_ORDERS, JSON.stringify(data)),

  getVendors: (): any[] =>
    JSON.parse(localStorage.getItem(KEYS.VENDORS) || "[]"),
  saveVendors: (data: any[]) =>
    localStorage.setItem(KEYS.VENDORS, JSON.stringify(data)),

  getPurchases: (): any[] =>
    JSON.parse(localStorage.getItem(KEYS.PURCHASES) || "[]"),
  savePurchases: (data: any[]) =>
    localStorage.setItem(KEYS.PURCHASES, JSON.stringify(data)),

  getExpenses: (): any[] =>
    JSON.parse(localStorage.getItem("pos_expenses") || "[]"),
  saveExpenses: (data: any[]) =>
    localStorage.setItem("pos_expenses", JSON.stringify(data)),

  getUsers: (): any[] => JSON.parse(localStorage.getItem(KEYS.USERS) || "[]"),
  saveUsers: (data: any[]) =>
    localStorage.setItem(KEYS.USERS, JSON.stringify(data)),

  getActiveUser: (): any =>
    JSON.parse(localStorage.getItem(KEYS.ACTIVE_USER) || "null"),
  saveActiveUser: (data: any) =>
    localStorage.setItem(KEYS.ACTIVE_USER, JSON.stringify(data)),
  clearActiveUser: () => localStorage.removeItem(KEYS.ACTIVE_USER),

  getTechInventory: (): any[] =>
    JSON.parse(localStorage.getItem("crm_tech_inventory") || "[]"),
  saveTechInventory: (data: any[]) =>
    localStorage.setItem("crm_tech_inventory", JSON.stringify(data)),

  getTechInventoryLogs: (): any[] =>
    JSON.parse(localStorage.getItem("crm_tech_inventory_logs") || "[]"),
  saveTechInventoryLogs: (data: any[]) =>
    localStorage.setItem("crm_tech_inventory_logs", JSON.stringify(data)),

  getTechFinancialLogs: (): any[] =>
    JSON.parse(localStorage.getItem("crm_tech_financial_logs") || "[]"),
  saveTechFinancialLogs: (data: any[]) =>
    localStorage.setItem("crm_tech_financial_logs", JSON.stringify(data)),

  getTechLocations: (): Record<string, { lat: number; lng: number; lastUpdate: number }> =>
    JSON.parse(localStorage.getItem("crm_tech_locations") || "{}"),
  saveTechLocation: (techName: string, location: { lat: number; lng: number }) => {
    const locations = storage.getTechLocations();
    locations[techName] = { ...location, lastUpdate: Date.now() };
    localStorage.setItem("crm_tech_locations", JSON.stringify(locations));
  },

  reset: () => {
    localStorage.clear();
    window.location.reload();
  },
};
