/**
 * lib/modules/inventory/stockService.ts
 *
 * Stock Movements layer — Phase 6 completion.
 *
 * Provides:
 * 1. Movement recording (local) — mirrors what will go to stock_movements table
 * 2. Balance calculation from movements (ledger approach)
 * 3. Stock check helpers used by checkout
 *
 * All functions are pure (no side effects). Callers persist changes.
 */

import { CatalogItem, uid } from "@/lib/types";

// ---------------------------------------------------------------------------
// Movement types (matches stock_movements.movement_type in PostgreSQL)
// ---------------------------------------------------------------------------

export type StockMovementType =
  | "PURCHASE_IN"
  | "SALE_OUT"
  | "RETURN_IN"
  | "RETURN_OUT"
  | "TECHNICIAN_TRANSFER_OUT"
  | "TECHNICIAN_TRANSFER_IN"
  | "TECHNICIAN_CONSUME"
  | "DAMAGE_OUT"
  | "LOSS_OUT"
  | "ADJUSTMENT"
  | "ADJUSTMENT_OUT";

export type StockReferenceType =
  | "invoice"
  | "purchase"
  | "work_order"
  | "manual"
  | "transfer";

export interface StockMovement {
  id: string;
  organizationId?: string;
  branchId?: string;
  productId: string;       // catalogId (legacy) or product UUID (normalized)
  productName: string;
  locationId?: string;
  technicianId?: string;
  technicianName?: string;
  movementType: StockMovementType;
  quantity: number;        // always positive
  unitCost: number;
  taxRate: number;
  referenceType?: StockReferenceType;
  referenceId?: string;    // invoice.id / order.id etc.
  invoiceId?: string;
  workOrderId?: string;
  notes?: string;
  createdBy?: string;
  createdAt: number;       // ms timestamp
}

// ---------------------------------------------------------------------------
// In-memory movement registry (used before normalized tables are active)
// Stored in localStorage as cc_stock_movements
// ---------------------------------------------------------------------------

const LS_KEY = "cc_stock_movements";
const MAX_MOVEMENTS = 5000;

export function readLocalMovements(): StockMovement[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as StockMovement[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalMovements(movements: StockMovement[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LS_KEY,
    JSON.stringify(movements.slice(-MAX_MOVEMENTS))
  );
}

export function appendMovement(movement: StockMovement): void {
  writeLocalMovements([...readLocalMovements(), movement]);
}

// ---------------------------------------------------------------------------
// Balance computation from movements (ledger)
// ---------------------------------------------------------------------------

const INBOUND: StockMovementType[] = [
  "PURCHASE_IN",
  "RETURN_IN",
  "TECHNICIAN_TRANSFER_IN",
  "ADJUSTMENT",
];
const OUTBOUND: StockMovementType[] = [
  "SALE_OUT",
  "RETURN_OUT",
  "TECHNICIAN_TRANSFER_OUT",
  "TECHNICIAN_CONSUME",
  "DAMAGE_OUT",
  "LOSS_OUT",
  "ADJUSTMENT_OUT",
];

export function computeStockBalance(
  movements: StockMovement[],
  productId: string,
  locationId?: string
): number {
  return movements
    .filter(
      (m) =>
        m.productId === productId &&
        (locationId === undefined || m.locationId === locationId)
    )
    .reduce((balance, m) => {
      if (INBOUND.includes(m.movementType)) return balance + m.quantity;
      if (OUTBOUND.includes(m.movementType)) return balance - m.quantity;
      return balance;
    }, 0);
}

/** All balances per product */
export function computeAllBalances(
  movements: StockMovement[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const m of movements) {
    if (result[m.productId] === undefined) result[m.productId] = 0;
    if (INBOUND.includes(m.movementType)) result[m.productId] += m.quantity;
    if (OUTBOUND.includes(m.movementType)) result[m.productId] -= m.quantity;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Builders — create movement objects for common operations
// ---------------------------------------------------------------------------

export interface SaleMovementInput {
  catalogId: string;
  productName: string;
  qty: number;
  unitCost: number;
  taxRate?: number;
  invoiceId: string;
  invoiceNumber?: string;
  technicianId?: string;
  technicianName?: string;
  isTechStock?: boolean;
  createdBy?: string;
}

export function buildSaleMovement(input: SaleMovementInput): StockMovement {
  return {
    id: uid("smv"),
    productId: input.catalogId,
    productName: input.productName,
    technicianId: input.technicianId,
    technicianName: input.technicianName,
    movementType: input.isTechStock ? "TECHNICIAN_CONSUME" : "SALE_OUT",
    quantity: input.qty,
    unitCost: input.unitCost,
    taxRate: input.taxRate || 0,
    referenceType: "invoice",
    referenceId: input.invoiceId,
    invoiceId: input.invoiceId,
    notes: input.invoiceNumber ? `فاتورة ${input.invoiceNumber}` : undefined,
    createdBy: input.createdBy,
    createdAt: Date.now(),
  };
}

export function buildPurchaseMovement(
  catalogId: string,
  productName: string,
  qty: number,
  unitCost: number,
  purchaseInvoiceId: string,
  taxRate = 0,
  createdBy?: string
): StockMovement {
  return {
    id: uid("smv"),
    productId: catalogId,
    productName,
    movementType: "PURCHASE_IN",
    quantity: qty,
    unitCost,
    taxRate,
    referenceType: "purchase",
    referenceId: purchaseInvoiceId,
    createdBy,
    createdAt: Date.now(),
  };
}

export function buildAdjustmentMovement(
  catalogId: string,
  productName: string,
  qtyDiff: number, // positive = add, negative = remove
  reason: string,
  createdBy?: string
): StockMovement {
  return {
    id: uid("smv"),
    productId: catalogId,
    productName,
    movementType: qtyDiff >= 0 ? "ADJUSTMENT" : "ADJUSTMENT_OUT",
    quantity: Math.abs(qtyDiff),
    unitCost: 0,
    taxRate: 0,
    referenceType: "manual",
    notes: reason,
    createdBy,
    createdAt: Date.now(),
  };
}

export function buildDamageMovement(
  catalogId: string,
  productName: string,
  qty: number,
  notes: string,
  createdBy?: string
): StockMovement {
  return {
    id: uid("smv"),
    productId: catalogId,
    productName,
    movementType: "DAMAGE_OUT",
    quantity: qty,
    unitCost: 0,
    taxRate: 0,
    referenceType: "manual",
    notes,
    createdBy,
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Stock availability check
// ---------------------------------------------------------------------------

export interface StockCheckResult {
  available: boolean;
  currentQty: number;
  requested: number;
  shortfall: number;
}

export function checkStockAvailability(
  catalog: CatalogItem[],
  catalogId: string,
  requestedQty: number
): StockCheckResult {
  const item = catalog.find((c) => c.id === catalogId);
  const currentQty = item?.stock ?? 0;
  const shortfall = Math.max(0, requestedQty - currentQty);
  return {
    available: shortfall === 0,
    currentQty,
    requested: requestedQty,
    shortfall,
  };
}

export function checkMultipleItems(
  catalog: CatalogItem[],
  items: Array<{ catalogId: string; qty: number; name: string }>
): Array<StockCheckResult & { catalogId: string; name: string }> {
  return items.map((item) => ({
    catalogId: item.catalogId,
    name: item.name,
    ...checkStockAvailability(catalog, item.catalogId, item.qty),
  }));
}

// ---------------------------------------------------------------------------
// Catalog stock update helpers (to apply after a transaction)
// ---------------------------------------------------------------------------

export function deductCatalogStock(
  catalog: CatalogItem[],
  catalogId: string,
  qty: number
): CatalogItem[] {
  return catalog.map((c) =>
    c.id === catalogId
      ? { ...c, stock: Math.max(0, (c.stock || 0) - qty) }
      : c
  );
}

export function addCatalogStock(
  catalog: CatalogItem[],
  catalogId: string,
  qty: number
): CatalogItem[] {
  return catalog.map((c) =>
    c.id === catalogId ? { ...c, stock: (c.stock || 0) + qty } : c
  );
}
