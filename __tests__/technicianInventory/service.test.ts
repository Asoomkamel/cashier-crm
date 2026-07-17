/**
 * __tests__/technicianInventory/service.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  assignItemsToTechnician,
  deductTechnicianItem,
  transferBetweenTechnicians,
  getTechnicianItemQty,
} from "@/lib/modules/technicianInventory/service";
import type { StaffUser } from "@/lib/types";

const tech1: StaffUser = {
  id: "tech1", name: "Ahmed", phone: "0501111111",
  role: "technician", pin: "1234",
  permissions: { canManageInventory: false, canManageUsers: false, canManageSettings: false, canManageTechnicians: false, canInvoice: false, canAcceptTask: true, canCompleteTask: true, canCreateRequests: false, canViewCRM: false, canUpdateCustomerLocation: true, canRecordPayments: false, canManageReminders: false },
  specialties: [],
};

const tech2: StaffUser = {
  id: "tech2", name: "Khalid", phone: "0502222222",
  role: "technician", pin: "5678",
  permissions: { canManageInventory: false, canManageUsers: false, canManageSettings: false, canManageTechnicians: false, canInvoice: false, canAcceptTask: true, canCompleteTask: true, canCreateRequests: false, canViewCRM: false, canUpdateCustomerLocation: true, canRecordPayments: false, canManageReminders: false },
  specialties: [],
};

describe("assignItemsToTechnician", () => {
  it("creates new inventory entry", () => {
    const { inventory, log } = assignItemsToTechnician([], {
      technician: tech1, catalogId: "p1", itemName: "Filter", qty: 5,
    });
    expect(inventory).toHaveLength(1);
    expect(inventory[0].qty).toBe(5);
    expect(log.type).toBe("assign");
    expect(log.qty).toBe(5);
    expect(log.beforeQty).toBe(0);
    expect(log.afterQty).toBe(5);
  });

  it("adds to existing inventory", () => {
    const existing = [{ id: "i1", technicianId: "tech1", technicianName: "Ahmed", catalogId: "p1", itemName: "Filter", qty: 3, createdAt: 1, updatedAt: 1 }];
    const { inventory, log } = assignItemsToTechnician(existing, {
      technician: tech1, catalogId: "p1", itemName: "Filter", qty: 2,
    });
    expect(inventory[0].qty).toBe(5);
    expect(log.beforeQty).toBe(3);
    expect(log.afterQty).toBe(5);
  });
});

describe("deductTechnicianItem", () => {
  const inv = [{ id: "i1", technicianId: "tech1", technicianName: "Ahmed", catalogId: "p1", itemName: "Filter", qty: 10, createdAt: 1, updatedAt: 1 }];

  it("deducts successfully", () => {
    const result = deductTechnicianItem(inv, {
      technician: tech1, catalogId: "p1", itemName: "Filter", qty: 3, type: "sale",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inventory[0].qty).toBe(7);
    expect(result.log.beforeQty).toBe(10);
    expect(result.log.afterQty).toBe(7);
  });

  it("fails when insufficient stock", () => {
    const result = deductTechnicianItem(inv, {
      technician: tech1, catalogId: "p1", itemName: "Filter", qty: 15, type: "sale",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("غير كافٍ");
  });

  it("fails when item not in inventory", () => {
    const result = deductTechnicianItem(inv, {
      technician: tech1, catalogId: "p999", itemName: "Unknown", qty: 1, type: "sale",
    });
    expect(result.ok).toBe(false);
  });

  it("exact quantity succeeds", () => {
    const result = deductTechnicianItem(inv, {
      technician: tech1, catalogId: "p1", itemName: "Filter", qty: 10, type: "sale",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inventory[0].qty).toBe(0);
  });
});

describe("transferBetweenTechnicians", () => {
  const inv = [
    { id: "i1", technicianId: "tech1", technicianName: "Ahmed", catalogId: "p1", itemName: "Filter", qty: 5, createdAt: 1, updatedAt: 1 },
  ];

  it("transfers correctly", () => {
    const result = transferBetweenTechnicians(inv, {
      fromTech: tech1, toTech: tech2,
      catalogId: "p1", itemName: "Filter", qty: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fromItem = result.inventory.find(i => i.technicianId === "tech1");
    const toItem   = result.inventory.find(i => i.technicianId === "tech2");
    expect(fromItem?.qty).toBe(2);
    expect(toItem?.qty).toBe(3);
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0].type).toBe("transfer_out");
    expect(result.logs[1].type).toBe("transfer_in");
  });

  it("fails with insufficient stock", () => {
    const result = transferBetweenTechnicians(inv, {
      fromTech: tech1, toTech: tech2,
      catalogId: "p1", itemName: "Filter", qty: 10,
    });
    expect(result.ok).toBe(false);
  });
});

describe("getTechnicianItemQty", () => {
  const inv = [
    { id: "i1", technicianId: "tech1", technicianName: "Ahmed", catalogId: "p1", itemName: "Filter", qty: 7, createdAt: 1, updatedAt: 1 },
    { id: "i2", technicianId: "tech2", technicianName: "Khalid", catalogId: "p1", itemName: "Filter", qty: 3, createdAt: 1, updatedAt: 1 },
  ];

  it("returns correct qty for tech1", () => {
    expect(getTechnicianItemQty(inv, "tech1", "Ahmed", "p1")).toBe(7);
  });

  it("returns 0 for unknown catalogId", () => {
    expect(getTechnicianItemQty(inv, "tech1", "Ahmed", "p999")).toBe(0);
  });
});
