/**
 * __tests__/workOrders/service.test.ts
 * Phase 9 — Work Orders business logic tests
 */

import { describe, it, expect } from "vitest";
import {
  canTransition,
  updateWorkOrderStatus,
  assignTechnicianToOrder,
  postponeOrder,
  getOrdersForTechnician,
  getOpenOrders,
  nextRequestNumber,
} from "@/lib/modules/workOrders/service";
import type { ServiceOrder, StaffUser } from "@/lib/types";

const admin: Pick<StaffUser, "id" | "name" | "role"> = { id: "admin1", name: "Admin", role: "admin" };
const tech:  Pick<StaffUser, "id" | "name" | "role"> = { id: "tech1",  name: "Ahmed", role: "technician" };

const makeOrder = (overrides: Partial<ServiceOrder> = {}): ServiceOrder => ({
  id: "o1",
  requestNumber: 5001,
  customerId: "c1",
  customerName: "Test Customer",
  customerPhone: "0501234567",
  issue: "Water filter change",
  status: "pending",
  date: Date.now(),
  createdAt: Date.now(),
  activityLogs: [],
  ...overrides,
});

describe("canTransition", () => {
  it("pending → started is allowed",      () => expect(canTransition("pending",     "started")).toBe(true));
  it("pending → canceled is allowed",     () => expect(canTransition("pending",     "canceled")).toBe(true));
  it("pending → completed is NOT allowed",() => expect(canTransition("pending",     "completed")).toBe(false));
  it("started → in_progress is allowed",  () => expect(canTransition("started",     "in_progress")).toBe(true));
  it("in_progress → completed is allowed",() => expect(canTransition("in_progress", "completed")).toBe(true));
  it("completed → pending is NOT allowed",() => expect(canTransition("completed",   "pending")).toBe(false));
  it("canceled → started is NOT allowed", () => expect(canTransition("canceled",    "started")).toBe(false));
  it("deferred → pending is allowed",     () => expect(canTransition("deferred",    "pending")).toBe(true));
});

describe("updateWorkOrderStatus", () => {
  it("valid transition succeeds", () => {
    const result = updateWorkOrderStatus({
      order: makeOrder({ status: "pending" }),
      newStatus: "started",
      actor: admin,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe("started");
    expect(result.order.activityLogs.length).toBeGreaterThan(0);
  });

  it("invalid transition fails with reason", () => {
    const result = updateWorkOrderStatus({
      order: makeOrder({ status: "completed" }),
      newStatus: "pending",
      actor: admin,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("لا يمكن الانتقال");
  });

  it("adds activity log entry on success", () => {
    const result = updateWorkOrderStatus({
      order: makeOrder({ status: "pending", activityLogs: [] }),
      newStatus: "started",
      actor: tech,
      note: "بدأت العمل",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.activityLogs[0].text).toBe("بدأت العمل");
  });
});

describe("assignTechnicianToOrder", () => {
  it("assigns technician correctly", () => {
    const order = assignTechnicianToOrder(makeOrder(), tech, admin);
    expect(order.technicianName).toBe("Ahmed");
    expect(order.technicianId).toBe("tech1");
    expect(order.activityLogs.length).toBeGreaterThan(0);
  });

  it("adds log entry on assignment", () => {
    const order = assignTechnicianToOrder(makeOrder(), tech, admin);
    expect(order.activityLogs[0].text).toContain("Ahmed");
  });
});

describe("postponeOrder", () => {
  it("postpones order correctly", () => {
    const original = makeOrder({ status: "pending" });
    const postponed = postponeOrder(original, 3, "عميل مشغول", admin);
    expect(postponed.status).toBe("deferred");
    expect(postponed.postponedDays).toBe(3);
    expect(postponed.date).toBeGreaterThan(original.date);
  });
});

describe("getOrdersForTechnician", () => {
  const orders = [
    makeOrder({ id: "o1", technicianId: "tech1", technicianName: "Ahmed" }),
    makeOrder({ id: "o2", technicianId: "tech2", technicianName: "Khalid" }),
    makeOrder({ id: "o3", assignedTechnicianIds: ["tech1"] }),
  ];

  it("returns only assigned orders", () => {
    const result = getOrdersForTechnician(orders, tech);
    expect(result.map(o => o.id)).toEqual(expect.arrayContaining(["o1", "o3"]));
    expect(result.find(o => o.id === "o2")).toBeUndefined();
  });
});

describe("getOpenOrders", () => {
  const orders = [
    makeOrder({ id: "o1", status: "pending" }),
    makeOrder({ id: "o2", status: "completed" }),
    makeOrder({ id: "o3", status: "canceled" }),
    makeOrder({ id: "o4", status: "in_progress" }),
  ];

  it("excludes completed and canceled", () => {
    const open = getOpenOrders(orders);
    expect(open.map(o => o.id)).toEqual(expect.arrayContaining(["o1", "o4"]));
    expect(open.find(o => o.id === "o2")).toBeUndefined();
    expect(open.find(o => o.id === "o3")).toBeUndefined();
  });
});

describe("nextRequestNumber", () => {
  it("returns 5001 for empty list", () => {
    expect(nextRequestNumber([])).toBe(5001);
  });

  it("returns max + 1", () => {
    const orders = [
      makeOrder({ requestNumber: 5001 }),
      makeOrder({ requestNumber: 5005 }),
      makeOrder({ requestNumber: 5003 }),
    ];
    expect(nextRequestNumber(orders)).toBe(5006);
  });
});
