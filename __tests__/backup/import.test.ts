/**
 * __tests__/backup/import.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeLegacyBackup } from "@/lib/backupPayload";

// Mock storage to avoid localStorage access in tests
vi.mock("@/lib/storage", () => ({
  storage: {
    saveCustomers:         vi.fn(),
    saveCatalog:           vi.fn(),
    saveOrders:            vi.fn(),
    saveVendors:           vi.fn(),
    savePurchases:         vi.fn(),
    saveExpenses:          vi.fn(),
    saveSettings:          vi.fn(),
    saveUsers:             vi.fn(),
    saveUrgentOrders:      vi.fn(),
    saveAppointments:      vi.fn(),
    saveTechInventory:     vi.fn(),
    saveTechInventoryLogs: vi.fn(),
    saveTechFinancialLogs: vi.fn(),
    saveTechLocations:     vi.fn(),
    saveCustomerPayments:  vi.fn(),
    saveReminders:         vi.fn(),
  },
}));

// Expose the normalizer (it's not exported, so we test via applyBackupPayload)
// We use a helper that mimics what applyBackupPayload does internally
function testNormalize(raw: unknown): Record<string, unknown> {
  // We re-export normalizeLegacyBackup for testing purposes
  return (normalizeLegacyBackup as (r: unknown) => Record<string, unknown>)(raw);
}

describe("normalizeLegacyBackup — modern format", () => {
  const modern = {
    customers:   [{ id: "c1", name: "Ahmed", phone: "0501234567", type: "customer", locations: [], createdAt: 1 }],
    catalog:     [{ id: "p1", name: "Filter", price: 100, tax: 15, type: "product", stock: 10, costPrice: 60, category: "Filters", isBundle: false }],
    orders:      [],
    vendors:     [],
    purchases:   [],
    expenses:    [],
    urgentOrders: [],
    appointments: [],
    settings:    { language: "ar", currency: "SAR" },
    users:       [{ id: "u1", name: "Admin", phone: "0500000000", role: "admin", pin: "1234" }],
    techInventory: [],
    techInventoryLogs: [],
    techFinancialLogs: [],
    customerPayments: [],
    techLocations: {},
  };

  it("preserves customers", () => {
    const result = testNormalize(modern);
    expect(Array.isArray(result.customers)).toBe(true);
    expect((result.customers as unknown[]).length).toBe(1);
  });

  it("preserves catalog", () => {
    const result = testNormalize(modern);
    expect(Array.isArray(result.catalog)).toBe(true);
    expect((result.catalog as unknown[]).length).toBe(1);
  });

  it("preserves settings", () => {
    const result = testNormalize(modern);
    expect((result.settings as Record<string, unknown>)?.language).toBe("ar");
  });
});

describe("normalizeLegacyBackup — legacy format", () => {
  const legacy = {
    crm_customers: [{ id: "c1", name: "Old Customer", phone: "0501234567", type: "customer", locations: [], createdAt: 1 }],
    crm_catalog:   [{ id: "p1", name: "Old Product",  price: 50,  tax: 0, type: "product", stock: 5, costPrice: 30, category: "Old", isBundle: false }],
    crm_orders:    [],
    crm_settings:  { language: "en", currency: "SAR", adminPassword: "1234" },
    pos_expenses:  [],
    crm_urgent_orders: [],
    crm_service_orders: [],
  };

  it("maps crm_customers to customers", () => {
    const result = testNormalize(legacy);
    expect(Array.isArray(result.customers)).toBe(true);
    expect((result.customers as unknown[]).length).toBe(1);
  });

  it("maps crm_catalog to catalog", () => {
    const result = testNormalize(legacy);
    expect(Array.isArray(result.catalog)).toBe(true);
  });

  it("maps crm_settings to settings", () => {
    const result = testNormalize(legacy);
    const s = result.settings as Record<string, unknown>;
    expect(s?.language).toBe("en");
  });

  it("maps pos_expenses to expenses", () => {
    const result = testNormalize(legacy);
    expect(Array.isArray(result.expenses)).toBe(true);
  });
});

describe("normalizeLegacyBackup — edge cases", () => {
  it("handles empty payload", () => {
    const result = testNormalize({});
    expect(Array.isArray(result.customers)).toBe(true);
    expect((result.customers as unknown[]).length).toBe(0);
  });

  it("handles null input", () => {
    const result = testNormalize(null);
    expect(Array.isArray(result.customers)).toBe(true);
  });

  it("handles missing notes gracefully", () => {
    const payload = {
      expenses: [{ id: "e1", amount: 100, category: "Office", date: Date.now() }],
    };
    const result = testNormalize(payload);
    expect(Array.isArray(result.expenses)).toBe(true);
  });
});
