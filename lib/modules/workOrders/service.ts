/**
 * lib/modules/workOrders/service.ts
 *
 * Work Orders (Urgent Orders + Appointments) business logic — Phase 5.
 * Pure functions: no React, no side effects.
 */

import {
  ServiceOrder,
  ServiceOrderStatus,
  StaffUser,
  ActivityLogEntry,
  uid,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  pending:     ["started", "deferred", "canceled"],
  started:     ["in_progress", "deferred", "canceled"],
  in_progress: ["completed", "deferred", "canceled"],
  completed:   [],
  canceled:    [],
  deferred:    ["pending", "canceled"],
};

export function canTransition(
  from: ServiceOrderStatus,
  to: ServiceOrderStatus
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface UpdateStatusCommand {
  order: ServiceOrder;
  newStatus: ServiceOrderStatus;
  actor: Pick<StaffUser, "id" | "name" | "role">;
  note?: string;
}

export type UpdateStatusResult =
  | { ok: true; order: ServiceOrder; log: ActivityLogEntry }
  | { ok: false; reason: string };

export function updateWorkOrderStatus(
  command: UpdateStatusCommand
): UpdateStatusResult {
  const { order, newStatus, actor, note } = command;

  if (!canTransition(order.status, newStatus)) {
    return {
      ok: false,
      reason: `لا يمكن الانتقال من "${order.status}" إلى "${newStatus}".`,
    };
  }

  const log: ActivityLogEntry = {
    date: Date.now(),
    text:
      note ||
      `تغييرت الحالة إلى "${newStatus}" بواسطة ${actor.name} (${actor.role})`,
  };

  const updated: ServiceOrder = {
    ...order,
    status: newStatus,
    updatedAt: Date.now(),
    activityLogs: [...(order.activityLogs || []), log],
  };

  return { ok: true, order: updated, log };
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export function assignTechnicianToOrder(
  order: ServiceOrder,
  technician: Pick<StaffUser, "id" | "name">,
  actor: Pick<StaffUser, "id" | "name">
): ServiceOrder {
  const log: ActivityLogEntry = {
    date: Date.now(),
    text: `تم إسناد الطلب إلى ${technician.name} بواسطة ${actor.name}`,
  };
  return {
    ...order,
    technicianName: technician.name,
    technicianId: technician.id,
    updatedAt: Date.now(),
    activityLogs: [...(order.activityLogs || []), log],
  };
}

export function unassignTechnician(
  order: ServiceOrder,
  actor: Pick<StaffUser, "id" | "name">
): ServiceOrder {
  const log: ActivityLogEntry = {
    date: Date.now(),
    text: `تم إلغاء إسناد الطلب بواسطة ${actor.name}`,
  };
  return {
    ...order,
    technicianName: undefined,
    technicianId: undefined,
    updatedAt: Date.now(),
    activityLogs: [...(order.activityLogs || []), log],
  };
}

// ---------------------------------------------------------------------------
// Postpone
// ---------------------------------------------------------------------------

export function postponeOrder(
  order: ServiceOrder,
  daysToPostpone: number,
  note: string,
  actor: Pick<StaffUser, "id" | "name">
): ServiceOrder {
  const newDate = order.date + daysToPostpone * 24 * 60 * 60 * 1000;
  const log: ActivityLogEntry = {
    date: Date.now(),
    text: `تأجيل الطلب ${daysToPostpone} أيام بواسطة ${actor.name}. السبب: ${note || "—"}`,
  };
  return {
    ...order,
    date: newDate,
    postponedUntil: newDate,
    postponedDays: (order.postponedDays || 0) + daysToPostpone,
    postponementNote: note,
    status: "deferred",
    updatedAt: Date.now(),
    activityLogs: [...(order.activityLogs || []), log],
  };
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

export function getOrdersForTechnician(
  orders: ServiceOrder[],
  technician: Pick<StaffUser, "id" | "name">
): ServiceOrder[] {
  return orders.filter(
    (o) =>
      o.technicianId === technician.id ||
      o.technicianName === technician.name ||
      (o.assignedTechnicianIds || []).includes(technician.id) ||
      (o.assignedTechnicianNames || []).includes(technician.name)
  );
}

export function getOpenOrders(orders: ServiceOrder[]): ServiceOrder[] {
  return orders.filter(
    (o) => o.status !== "completed" && o.status !== "canceled"
  );
}

export function getOrdersDueToday(orders: ServiceOrder[]): ServiceOrder[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return orders.filter(
    (o) => o.date >= start.getTime() && o.date <= end.getTime()
  );
}

// ---------------------------------------------------------------------------
// Request number generation
// ---------------------------------------------------------------------------

export function nextRequestNumber(existingOrders: ServiceOrder[]): number {
  if (existingOrders.length === 0) return 5001;
  return Math.max(...existingOrders.map((o) => o.requestNumber || 0)) + 1;
}

// ---------------------------------------------------------------------------
// Add activity log entry
// ---------------------------------------------------------------------------

export function addActivityLog(
  order: ServiceOrder,
  text: string
): ServiceOrder {
  return {
    ...order,
    updatedAt: Date.now(),
    activityLogs: [
      ...(order.activityLogs || []),
      { date: Date.now(), text },
    ],
  };
}
