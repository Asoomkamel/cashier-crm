import { RequestType, ServiceOrder, ServiceOrderStatus } from "@/lib/types";

export const SERVICE_ORDER_STATUSES: ServiceOrderStatus[] = [
  "pending",
  "started",
  "in_progress",
  "completed",
  "canceled",
  "deferred",
];

export function serviceOrderStatusLabel(
  status: ServiceOrderStatus | string | undefined,
  language: "ar" | "en" = "ar",
): string {
  const ar = language === "ar";
  const labels: Record<string, string> = {
    pending: ar ? "قيد الانتظار" : "Pending",
    started: ar ? "تم القبول" : "Accepted",
    in_progress: ar ? "قيد التنفيذ" : "In progress",
    completed: ar ? "مكتمل" : "Completed",
    canceled: ar ? "ملغي" : "Canceled",
    deferred: ar ? "مؤجل" : "Deferred",
  };

  return labels[String(status || "pending")] || String(status || "");
}

export function requestTypeLabel(
  type: RequestType | string | undefined,
  language: "ar" | "en" = "ar",
): string {
  const ar = language === "ar";
  const labels: Record<string, string> = {
    new_installation: ar ? "تركيب جديد" : "New installation",
    maintenance: ar ? "صيانة دورية" : "Periodic maintenance",
    inspection: ar ? "فحص وحل مشكلة" : "Inspection and troubleshooting",
    urgent_visit: ar ? "زيارة عاجلة" : "Urgent visit",
  };

  return labels[String(type || "")] || String(type || "");
}

export function serviceOrderStatusTone(
  status: ServiceOrderStatus | string | undefined,
): "amber" | "blue" | "green" | "red" | "slate" {
  const tones: Record<string, "amber" | "blue" | "green" | "red" | "slate"> = {
    pending: "amber",
    started: "blue",
    in_progress: "blue",
    completed: "green",
    canceled: "red",
    deferred: "slate",
  };

  return tones[String(status || "pending")] || "slate";
}

/**
<<<<<<< HEAD
 * Determines whether a service order has a real visit appointment.
 *
 * Older builds stored Date.now() in `date` even when no visit was selected.
 * For backward compatibility, an order whose date is almost identical to its
 * creation time and has no scheduling metadata is treated as unscheduled.
 */
export function hasVisitAppointment(order: ServiceOrder): boolean {
=======
 * Determines whether the current request has a scheduled execution time.
 *
 * `date` represents when the current request should be carried out. It is not
 * the future maintenance visit. The future maintenance visit is stored in
 * `nextMaintenanceDate`.
 *
 * Older builds stored Date.now() in `date` even when no execution time was
 * selected. For backward compatibility, a record whose date is almost
 * identical to its creation time and has no scheduling metadata is treated as
 * unscheduled.
 */
export function hasExecutionAppointment(order: ServiceOrder): boolean {
>>>>>>> first-project-before-orders
  if (order.visitScheduled === false) return false;

  const timestamp = Number(order.date);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  if (order.visitScheduled === true) return true;

  if (order.scheduledHour || order.scheduledPeriod || order.postponedUntil) {
    return true;
  }

  const createdAt = Number(order.createdAt || 0);
  if (createdAt > 0 && Math.abs(timestamp - createdAt) <= 2 * 60 * 1000) {
    return false;
  }

  return true;
}

<<<<<<< HEAD
=======
/**
 * @deprecated Use `hasExecutionAppointment`. Kept for imported backups and
 * older modules that still use the previous name.
 */
export function hasVisitAppointment(order: ServiceOrder): boolean {
  return hasExecutionAppointment(order);
}

>>>>>>> first-project-before-orders
export function toDateTimeLocal(value?: number): string {
  const timestamp = Number(value || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";

  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
