/**
 * __tests__/inventory/stockService.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  checkStockAvailability,
  checkMultipleItems,
  buildSaleMovement,
  buildAdjustmentMovement,
  computeStockBalance,
  deductCatalogStock,
  addCatalogStock,
  type StockMovement,
} from "@/lib/modules/inventory/stockService";

const mockCatalog = [
  { id: "p1", name: "Water Filter", price: 100, costPrice: 60, stock: 10, tax: 15, qty: 0, discount: 0, type: "product" as const, category: "Filters", isBundle: false },
  { id: "p2", name: "Service",      price: 200, costPrice:  0, stock:  0, tax: 15, qty: 0, discount: 0, type: "service" as const, category: "Services", isBundle: false },
  { id: "p3", name: "Spare Part",   price:  50, costPrice: 20, stock:  2, tax:  0, qty: 0, discount: 0, type: "product" as const, category: "Parts", isBundle: false },
];

describe("checkStockAvailability", () => {
  it("returns available when stock >= requested", () => {
    const r = checkStockAvailability(mockCatalog, "p1", 5);
    expect(r.available).toBe(true);
    expect(r.currentQty).toBe(10);
    expect(r.shortfall).toBe(0);
  });

  it("returns unavailable when stock < requested", () => {
    const r = checkStockAvailability(mockCatalog, "p3", 5);
    expect(r.available).toBe(false);
    expect(r.shortfall).toBe(3);
  });

  it("service item with 0 stock is unavailable", () => {
    const r = checkStockAvailability(mockCatalog, "p2", 1);
    expect(r.available).toBe(false);
    expect(r.currentQty).toBe(0);
  });

  it("exact quantity available", () => {
    const r = checkStockAvailability(mockCatalog, "p3", 2);
    expect(r.available).toBe(true);
    expect(r.shortfall).toBe(0);
  });
});

describe("checkMultipleItems", () => {
  it("all available", () => {
    const results = checkMultipleItems(mockCatalog, [
      { catalogId: "p1", qty: 3, name: "Water Filter" },
      { catalogId: "p3", qty: 1, name: "Spare Part" },
    ]);
    expect(results.every(r => r.available)).toBe(true);
  });

  it("one unavailable", () => {
    const results = checkMultipleItems(mockCatalog, [
      { catalogId: "p1", qty: 3,  name: "Water Filter" },
      { catalogId: "p3", qty: 10, name: "Spare Part" },  // only 2 in stock
    ]);
    const unavail = results.filter(r => !r.available);
    expect(unavail).toHaveLength(1);
    expect(unavail[0].catalogId).toBe("p3");
  });
});

describe("buildSaleMovement", () => {
  it("creates SALE_OUT movement for main stock", () => {
    const m = buildSaleMovement({
      catalogId: "p1", productName: "Water Filter",
      qty: 2, unitCost: 60, taxRate: 15,
      invoiceId: "inv1", invoiceNumber: "INV-001",
    });
    expect(m.movementType).toBe("SALE_OUT");
    expect(m.quantity).toBe(2);
    expect(m.productId).toBe("p1");
  });

  it("creates TECHNICIAN_CONSUME for tech stock", () => {
    const m = buildSaleMovement({
      catalogId: "p1", productName: "Water Filter",
      qty: 1, unitCost: 60,
      invoiceId: "inv1", isTechStock: true,
      technicianName: "Ahmed",
    });
    expect(m.movementType).toBe("TECHNICIAN_CONSUME");
    expect(m.technicianName).toBe("Ahmed");
  });
});

describe("computeStockBalance", () => {
  const movements: StockMovement[] = [
    { id: "1", productId: "p1", productName: "X", movementType: "PURCHASE_IN", quantity: 10, unitCost: 60, taxRate: 0, createdAt: 1 },
    { id: "2", productId: "p1", productName: "X", movementType: "SALE_OUT",    quantity:  3, unitCost: 60, taxRate: 0, createdAt: 2 },
    { id: "3", productId: "p1", productName: "X", movementType: "SALE_OUT",    quantity:  2, unitCost: 60, taxRate: 0, createdAt: 3 },
  ];

  it("computes correct balance", () => {
    expect(computeStockBalance(movements, "p1")).toBe(5); // 10 - 3 - 2
  });

  it("returns 0 for unknown product", () => {
    expect(computeStockBalance(movements, "p999")).toBe(0);
  });
});

describe("deductCatalogStock / addCatalogStock", () => {
  it("deducts stock correctly", () => {
    const updated = deductCatalogStock(mockCatalog, "p1", 3);
    const item = updated.find(c => c.id === "p1");
    expect(item?.stock).toBe(7);
  });

  it("does not go below 0", () => {
    const updated = deductCatalogStock(mockCatalog, "p3", 100);
    const item = updated.find(c => c.id === "p3");
    expect(item?.stock).toBe(0);
  });

  it("adds stock correctly", () => {
    const updated = addCatalogStock(mockCatalog, "p3", 8);
    const item = updated.find(c => c.id === "p3");
    expect(item?.stock).toBe(10);
  });
});
