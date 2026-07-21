import { describe, expect, it } from "vitest";
import {
  buildAutoMaintenanceReminders,
  isWithinVisitReminderWindow,
} from "@/lib/modules/reminders/service";
import { hasExecutionAppointment } from "@/lib/serviceOrderLabels";
import { Order, ServiceOrder } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-21T08:00:00Z").getTime();

function task(patch: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: "task-1",
    requestNumber: 1,
    customerId: "customer-1",
    customerName: "عميل تجريبي",
    customerPhone: "0500000000",
    issue: "تنفيذ طلب حالي",
    status: "pending",
    date: NOW + DAY,
    visitScheduled: true,
    activityLogs: [],
    createdAt: NOW,
    ...patch,
  };
}

function invoice(patch: Partial<Order> = {}): Order {
  return {
    id: "invoice-1",
    invoiceNumber: "101",
    customerId: "customer-1",
    customerName: "عميل تجريبي",
    items: [],
    totalBeforeTax: 0,
    totalTax: 0,
    totalDiscount: 0,
    cartDiscount: 0,
    grandTotal: 0,
    paymentMethod: "cash",
    type: "tax_invoice",
    status: "active",
    date: NOW,
    ...patch,
  } as Order;
}

describe("future maintenance visit reminders", () => {
  it("does not treat the current order execution date as a maintenance visit", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task({ date: NOW + 2 * DAY, nextMaintenanceDate: undefined })],
      customers: [],
      now: NOW,
    });

    expect(reminders).toHaveLength(0);
  });

  it("adds a future maintenance visit when it is within seven days", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task({ status: "completed", nextMaintenanceDate: NOW + 6 * DAY })],
      customers: [],
      now: NOW,
    });

    const reminder = reminders.find((item) => item.sourceId === "task-1");
    expect(reminder).toBeDefined();
    expect(reminder?.source).toBe("urgent_order");
    expect(reminder?.dueDate).toBe(NOW + 6 * DAY);
  });

  it("does not add a future maintenance visit more than seven days away", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task({ status: "completed", nextMaintenanceDate: NOW + 8 * DAY })],
      customers: [],
      now: NOW,
    });

    expect(reminders).toHaveLength(0);
  });

  it("keeps an overdue maintenance visit visible", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [task({ status: "completed", nextMaintenanceDate: NOW - DAY })],
      urgentOrders: [],
      customers: [],
      now: NOW,
    });

    expect(reminders[0]?.dueDate).toBe(NOW - DAY);
  });

  it("does not add canceled service orders", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task({ status: "canceled", nextMaintenanceDate: NOW + DAY })],
      customers: [],
      now: NOW,
    });

    expect(reminders).toHaveLength(0);
  });

  it("applies the same seven-day rule to invoice maintenance visits", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [
        invoice({ id: "near", invoiceNumber: "201", nextMaintenanceDate: NOW + 7 * DAY }),
        invoice({ id: "far", invoiceNumber: "202", nextMaintenanceDate: NOW + 10 * DAY }),
      ],
      appointments: [],
      urgentOrders: [],
      customers: [],
      now: NOW,
    });

    expect(reminders.some((item) => item.sourceId === "near")).toBe(true);
    expect(reminders.some((item) => item.sourceId === "far")).toBe(false);
  });

  it("distinguishes execution scheduling from the future maintenance visit", () => {
    expect(hasExecutionAppointment(task())).toBe(true);
    expect(hasExecutionAppointment(task({ date: NOW, createdAt: NOW, visitScheduled: undefined }))).toBe(false);
    expect(isWithinVisitReminderWindow(NOW + 7 * DAY, NOW)).toBe(true);
    expect(isWithinVisitReminderWindow(NOW + 8 * DAY, NOW)).toBe(false);
  });
});
