import { describe, expect, it } from "vitest";
import { buildAutoMaintenanceReminders } from "@/lib/modules/reminders/service";
import { hasVisitAppointment } from "@/lib/serviceOrderLabels";
import { ServiceOrder } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-21T08:00:00Z").getTime();

function task(patch: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: "task-1",
    requestNumber: 1,
    customerId: "customer-1",
    customerName: "عميل تجريبي",
    customerPhone: "0500000000",
    issue: "زيارة فنية",
    status: "pending",
    date: NOW + 6 * DAY,
    visitScheduled: true,
    activityLogs: [],
    createdAt: NOW,
    ...patch,
  };
}

describe("visit appointment reminders", () => {
  it("adds an active visit to reminders when it is within seven days", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [],
      urgentOrders: [task()],
      customers: [],
      now: NOW,
    });

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
      customers: [],
      now: NOW,
    });

    expect(reminders.some((reminder) => reminder.sourceId === "visit_task-1")).toBe(false);
  });

  it("does not add completed visits", () => {
    const reminders = buildAutoMaintenanceReminders({
      orders: [],
      appointments: [task({ status: "completed" })],
      urgentOrders: [],
      customers: [],
      now: NOW,
    });

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
      customers: [],
      now: NOW,
    });

    expect(reminders.some((reminder) => reminder.sourceId === "task-1")).toBe(true);
    expect(reminders.some((reminder) => reminder.sourceId === "visit_task-1")).toBe(true);
  });
});
