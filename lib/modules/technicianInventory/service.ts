/**
 * lib/modules/technicianInventory/service.ts
 *
 * Technician Inventory business logic — Phase 5.
 * Pure functions: no React, no localStorage, no side effects.
 */

import {
  CatalogItem,
  TechInventoryItem,
  TechInventoryLog,
  TechInventoryLogType,
  StaffUser,
  uid,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Balance helpers
// ---------------------------------------------------------------------------

/** Returns the total qty of a catalog item held by a specific technician. */
export function getTechnicianItemQty(
  inventory: TechInventoryItem[],
  technicianId: string | undefined,
  technicianName: string,
  catalogId: string
): number {
  return inventory
    .filter(
      (item) =>
        item.catalogId === catalogId &&
        (item.technicianId === technicianId || item.technicianName === technicianName)
    )
    .reduce((sum, item) => sum + item.qty, 0);
}

/** Returns all inventory items belonging to a technician. */
export function getTechnicianInventory(
  inventory: TechInventoryItem[],
  technicianId: string | undefined,
  technicianName: string
): TechInventoryItem[] {
  return inventory.filter(
    (item) =>
      item.technicianId === technicianId || item.technicianName === technicianName
  );
}

// ---------------------------------------------------------------------------
// Assign / adjust
// ---------------------------------------------------------------------------

export interface AssignItemsCommand {
  technician: StaffUser;
  catalogId: string;
  itemName: string;
  qty: number;
  performedBy?: StaffUser;
  notes?: string;
}

export interface AssignItemsResult {
  inventory: TechInventoryItem[];
  log: TechInventoryLog;
}

export function assignItemsToTechnician(
  currentInventory: TechInventoryItem[],
  command: AssignItemsCommand
): AssignItemsResult {
  const { technician, catalogId, itemName, qty, performedBy, notes } = command;

  const existing = currentInventory.find(
    (item) =>
      item.catalogId === catalogId &&
      (item.technicianId === technician.id ||
        item.technicianName === technician.name)
  );

  const beforeQty = existing?.qty ?? 0;
  const afterQty = beforeQty + qty;

  let nextInventory: TechInventoryItem[];
  if (existing) {
    nextInventory = currentInventory.map((item) =>
      item.id === existing.id
        ? { ...item, qty: afterQty, updatedAt: Date.now() }
        : item
    );
  } else {
    const newItem: TechInventoryItem = {
      id: uid("tinv"),
      technicianId: technician.id,
      technicianName: technician.name,
      catalogId,
      itemName,
      qty: afterQty,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    nextInventory = [...currentInventory, newItem];
  }

  const log: TechInventoryLog = {
    id: uid("tlog"),
    technicianId: technician.id,
    technicianName: technician.name,
    catalogId,
    itemName,
    type: "assign",
    qty,
    beforeQty,
    afterQty,
    notes: notes || undefined,
    performedByUserId: performedBy?.id,
    performedByName: performedBy?.name,
    date: Date.now(),
  };

  return { inventory: nextInventory, log };
}

// ---------------------------------------------------------------------------
// Deduct (sale / consume / damage / loss)
// ---------------------------------------------------------------------------

export interface DeductItemCommand {
  technician: Pick<StaffUser, "id" | "name">;
  catalogId: string;
  itemName: string;
  qty: number;
  type: TechInventoryLogType;
  orderId?: string;
  invoiceNumber?: string;
  customerId?: string;
  customerName?: string;
  performedBy?: Pick<StaffUser, "id" | "name">;
  notes?: string;
}

export type DeductItemResult =
  | { ok: true; inventory: TechInventoryItem[]; log: TechInventoryLog }
  | { ok: false; reason: string };

export function deductTechnicianItem(
  currentInventory: TechInventoryItem[],
  command: DeductItemCommand
): DeductItemResult {
  const { technician, catalogId, qty } = command;

  const existing = currentInventory.find(
    (item) =>
      item.catalogId === catalogId &&
      (item.technicianId === technician.id ||
        item.technicianName === technician.name)
  );

  if (!existing || existing.qty < qty) {
    return {
      ok: false,
      reason: `مخزون الفني غير كافٍ. المتوفر: ${existing?.qty ?? 0}، المطلوب: ${qty}`,
    };
  }

  const beforeQty = existing.qty;
  const afterQty = beforeQty - qty;

  const nextInventory = currentInventory.map((item) =>
    item.id === existing.id
      ? { ...item, qty: afterQty, updatedAt: Date.now() }
      : item
  );

  const log: TechInventoryLog = {
    id: uid("tlog"),
    technicianId: technician.id,
    technicianName: technician.name,
    catalogId: command.catalogId,
    itemName: command.itemName,
    type: command.type,
    qty,
    beforeQty,
    afterQty,
    orderId: command.orderId,
    invoiceNumber: command.invoiceNumber,
    customerId: command.customerId,
    customerName: command.customerName,
    notes: command.notes,
    performedByUserId: command.performedBy?.id,
    performedByName: command.performedBy?.name,
    date: Date.now(),
  };

  return { ok: true, inventory: nextInventory, log };
}

// ---------------------------------------------------------------------------
// Transfer between technicians
// ---------------------------------------------------------------------------

export interface TransferItemCommand {
  fromTech: Pick<StaffUser, "id" | "name">;
  toTech: Pick<StaffUser, "id" | "name">;
  catalogId: string;
  itemName: string;
  qty: number;
  performedBy?: Pick<StaffUser, "id" | "name">;
  notes?: string;
}

export type TransferItemResult =
  | { ok: true; inventory: TechInventoryItem[]; logs: TechInventoryLog[] }
  | { ok: false; reason: string };

export function transferBetweenTechnicians(
  currentInventory: TechInventoryItem[],
  command: TransferItemCommand
): TransferItemResult {
  const transferId = uid("xfer");

  // Deduct from source
  const deductResult = deductTechnicianItem(currentInventory, {
    ...command,
    technician: command.fromTech,
    type: "transfer_out",
    notes: command.notes,
  });

  if (!deductResult.ok) return deductResult;

  const { inventory: afterDeduct, log: deductLog } = deductResult;
  deductLog.counterpartTechnicianId = command.toTech.id;
  deductLog.counterpartTechnician = command.toTech.name;
  deductLog.transferId = transferId;

  // Assign to destination
  const assignResult = assignItemsToTechnician(afterDeduct, {
    technician: command.toTech as StaffUser,
    catalogId: command.catalogId,
    itemName: command.itemName,
    qty: command.qty,
    performedBy: command.performedBy as StaffUser | undefined,
    notes: command.notes,
  });

  const assignLog = assignResult.log;
  assignLog.type = "transfer_in";
  assignLog.counterpartTechnicianId = command.fromTech.id;
  assignLog.counterpartTechnician = command.fromTech.name;
  assignLog.transferId = transferId;

  return {
    ok: true,
    inventory: assignResult.inventory,
    logs: [deductLog, assignLog],
  };
}

// ---------------------------------------------------------------------------
// Adjustment
// ---------------------------------------------------------------------------

export function adjustTechnicianQty(
  currentInventory: TechInventoryItem[],
  technicianId: string | undefined,
  technicianName: string,
  catalogId: string,
  itemName: string,
  newQty: number,
  performedBy?: Pick<StaffUser, "id" | "name">
): { inventory: TechInventoryItem[]; log: TechInventoryLog } {
  const existing = currentInventory.find(
    (item) =>
      item.catalogId === catalogId &&
      (item.technicianId === technicianId ||
        item.technicianName === technicianName)
  );
  const beforeQty = existing?.qty ?? 0;
  const diff = newQty - beforeQty;

  let nextInventory: TechInventoryItem[];
  if (existing) {
    nextInventory = currentInventory.map((item) =>
      item.id === existing.id
        ? { ...item, qty: newQty, updatedAt: Date.now() }
        : item
    );
  } else {
    nextInventory = [
      ...currentInventory,
      {
        id: uid("tinv"),
        technicianId,
        technicianName,
        catalogId,
        itemName,
        qty: newQty,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
  }

  const log: TechInventoryLog = {
    id: uid("tlog"),
    technicianId,
    technicianName,
    catalogId,
    itemName,
    type: diff >= 0 ? "adjustment" : "adjustment",
    qty: Math.abs(diff),
    beforeQty,
    afterQty: newQty,
    performedByUserId: performedBy?.id,
    performedByName: performedBy?.name,
    date: Date.now(),
  };

  return { inventory: nextInventory, log };
}

// ---------------------------------------------------------------------------
// Read balances from catalog
// ---------------------------------------------------------------------------

export interface TechnicianStockSummary {
  technicianId?: string;
  technicianName: string;
  items: Array<{
    catalogId: string;
    itemName: string;
    qty: number;
    catalogItem?: CatalogItem;
  }>;
  totalValue: number;
}

export function buildTechnicianStockSummary(
  inventory: TechInventoryItem[],
  catalog: CatalogItem[],
  technicianId: string | undefined,
  technicianName: string
): TechnicianStockSummary {
  const techItems = getTechnicianInventory(
    inventory,
    technicianId,
    technicianName
  );

  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  const items = techItems.map((item) => {
    const catalogItem = catalogById.get(item.catalogId);
    return {
      catalogId: item.catalogId,
      itemName: item.itemName,
      qty: item.qty,
      catalogItem,
    };
  });

  const totalValue = items.reduce((sum, item) => {
    const price = item.catalogItem?.costPrice ?? item.catalogItem?.price ?? 0;
    return sum + price * item.qty;
  }, 0);

  return { technicianId, technicianName, items, totalValue };
}
