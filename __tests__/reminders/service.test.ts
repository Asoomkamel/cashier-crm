import { describe, expect, it } from "vitest";
<<<<<<< HEAD
import { buildAutoMaintenanceReminders } from "@/lib/modules/reminders/service";
import { hasVisitAppointment } from "@/lib/serviceOrderLabels";
import { ServiceOrder } from "@/lib/types";
=======
import {
  buildAutoMaintenanceReminders,
  isWithinVisitReminderWindow,
} from "@/lib/modules/reminders/service";
import { hasExecutionAppointment } from "@/lib/serviceOrderLabels";
import { Order, ServiceOrder } from "@/lib/types";
>>>>>>> first-project-before-orders

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-21T08:00:00Z").getTime();

function task(patch: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: "task-1",
    requestNumber: 1,
    customerId: "customer-1",
    customerName: "عميل تجريبي",
    customerPhone: "0500000000",
<<<<<<< HEAD
    issue: "زيارة فنية",
    status: "pending",
    date: NOW + 6 * DAY,
=======
    issue: "تنفيذ طلب حالي",
    status: "pending",
    date: NOW + DAY,
>>>>>>> first-project-before-orders
    visitScheduled: true,
    activityLogs: [],
    createdAt: NOW,
    ...patch,
  };
}

<<<<<<< HEAD
describe("visit appointment reminders", () => {
  it("adds an active visit to reminders when it is within seven days", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task()],
=======
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
>>>>>>> first-project-before-orders
      customers: [],
      now: NOW,
    });

<<<<<<< HEAD
    const visit = reminders.find((reminder) => reminder.sourceId === "visit_task-1");
    expect(visit).toBeDefined();
    expect(visit?.source).toBe("urgent_order");
    expect(visit?.dueDate).toBe(NOW + 6 * DAY);
  });

  it("does not add a visit more than seven days away", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task({ date: NOW + 8 * DAY })],
=======
    expect(reminders).toHaveLength(0);
  });

  it("adds a future maintenance visit when it is within seven days", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task({ status: "completed", nextMaintenanceDate: NOW + 6 * DAY })],
>>>>>>> first-project-before-orders
      customers: [],
      now: NOW,
    });

<<<<<<< HEAD
    expect(reminders.some((reminder) => reminder.sourceId === "visit_task-1")).toBe(false);
  });

  it("does not add completed visits", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [task({ status: "completed" })],
=======
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
>>>>>>> first-project-before-orders
      urgentOrders: [],
      customers: [],
      now: NOW,
    });

<<<<<<< HEAD
    expect(reminders.some((reminder) => reminder.sourceId === "visit_task-1")).toBe(false);
  });

  it("recognizes old unscheduled records whose date equals creation time", () => {
    const oldRecord = task({ date: NOW, createdAt: NOW, visitScheduled: undefined });
    expect(hasVisitAppointment(oldRecord)).toBe(false);
  });

  it("keeps the future follow-up visit reminder independently", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task({ nextMaintenanceDate: NOW + 90 * DAY })],
=======
    expect(reminders[0]?.dueDate).toBe(NOW - DAY);
  });

  it("does not add canceled service orders", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task({ status: "canceled", nextMaintenanceDate: NOW + DAY })],
>>>>>>> first-project-before-orders
      customers: [],
      now: NOW,
    });

<<<<<<< HEAD
    expect(reminders.some((reminder) => reminder.sourceId === "task-1")).toBe(true);
    expect(reminders.some((reminder) => reminder.sourceId === "visit_task-1")).toBe(true);
=======
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
>>>>>>> first-project-before-orders
  });
});
