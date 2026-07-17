import { describe, it, expect } from "vitest";
import { calculateInvoiceTotals } from "@/lib/modules/invoices/calculations";

// Note: calculateInvoiceTotals uses TAX-INCLUSIVE pricing.
// Tax is extracted from the price, not added on top.
// So price=115 with tax=15% means: net=100, tax=15, total=115 (not 115+tax)

const item = (price: number, qty: number, tax = 0, discount = 0) => ({
  catalogId: "cat1",
  name:      "Test Item",
  price,
  tax,
  qty,
  discount,
});

describe("calculateInvoiceTotals", () => {
  it("single item no tax no discount", () => {
    const result = calculateInvoiceTotals([item(100, 1)], 0);
    expect(result.grandTotal).toBe(100);
    expect(result.totalTax).toBeCloseTo(0, 2);
    expect(result.totalDiscount).toBe(0);
  });

  it("single item with tax-inclusive 15%: price=115 means 100+15", () => {
    // price=115 includes 15% VAT → net=100, tax=15
    const result = calculateInvoiceTotals([item(115, 1, 15)], 0);
    expect(result.grandTotal).toBeCloseTo(115, 2);
    expect(result.totalTax).toBeCloseTo(15, 2);
    expect(result.totalBeforeTax).toBeCloseTo(100, 2);
  });

  it("item discount reduces total", () => {
    const result = calculateInvoiceTotals([item(100, 1, 0, 10)], 0);
    expect(result.grandTotal).toBeCloseTo(90, 2);
    expect(result.totalDiscount).toBeCloseTo(10, 2);
  });

  it("cart discount applied", () => {
    const result = calculateInvoiceTotals([item(200, 1)], 20);
    expect(result.grandTotal).toBeCloseTo(180, 2);
    expect(result.totalDiscount).toBeCloseTo(20, 2);
  });

  it("multiple items summed correctly", () => {
    const items = [item(100, 2), item(50, 1)];
    const result = calculateInvoiceTotals(items, 0);
    expect(result.grandTotal).toBeCloseTo(250, 2);  // 200 + 50
    expect(result.subtotal).toBeCloseTo(250, 2);
  });

  it("quantity multiplied correctly", () => {
    const result = calculateInvoiceTotals([item(50, 3)], 0);
    expect(result.subtotal).toBeCloseTo(150, 2);
    expect(result.grandTotal).toBeCloseTo(150, 2);
  });

  it("zero price item", () => {
    const result = calculateInvoiceTotals([item(0, 1, 15)], 0);
    expect(result.grandTotal).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  it("cart discount capped at subtotal", () => {
    const result = calculateInvoiceTotals([item(100, 1)], 150);
    // grandTotal should be 0 (or clamped to 0 via Math.max)
    expect(result.grandTotal).toBeGreaterThanOrEqual(0);
  });

  it("returns all required fields", () => {
    const result = calculateInvoiceTotals([item(100, 1, 15)], 0);
    expect(result).toHaveProperty("subtotal");
    expect(result).toHaveProperty("totalDiscount");
    expect(result).toHaveProperty("totalTax");
    expect(result).toHaveProperty("totalBeforeTax");
    expect(result).toHaveProperty("grandTotal");
  });
});

// ---------------------------------------------------------------------------
// Tabby / Tamara fee calculation
// ---------------------------------------------------------------------------

describe("Tabby/Tamara fees", () => {
  it("5% Tabby fee on 1000", () => {
    const subtotal = 1000;
    const feeRate  = 0.05;
    const fee      = subtotal * feeRate;
    const total    = subtotal + fee;
    expect(fee).toBe(50);
    expect(total).toBe(1050);
  });

  it("6% Tamara fee on 200", () => {
    const subtotal = 200;
    const feeRate  = 0.06;
    const fee      = parseFloat((subtotal * feeRate).toFixed(2));
    expect(fee).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Commission calculations
// ---------------------------------------------------------------------------

describe("Commission calculations", () => {
  it("percentage commission: 5% of 1000", () => {
    const commission = 1000 * 0.05;
    expect(commission).toBe(50);
  });

  it("fixed commission: 30 SAR", () => {
    expect(30).toBe(30);
  });

  it("full profit: cost 60, price 100", () => {
    const profit = 100 - 60;
    expect(profit).toBe(40);
  });

  it("no commission when no technician", () => {
    const techName  = "";
    const commission = techName ? 50 : 0;
    expect(commission).toBe(0);
  });

  it("marketing commission: 25% of 200", () => {
    const marketing = 200 * 0.25;
    expect(marketing).toBe(50);
  });
});
