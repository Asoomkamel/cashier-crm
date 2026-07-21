import { Customer, Order, ServiceOrder, StaffUser, SystemReminder, uid } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function addDays(value: number, days: number): number {
  return startOfDay(value) + days * DAY;
}

export function reminderTone(reminder: SystemReminder, now = Date.now()): "red" | "amber" | "green" | "blue" | "slate" {
  if (reminder.status === "done") return "green";
  if (reminder.status === "canceled") return "slate";
  if (reminder.dueDate < startOfDay(now)) return "red";
  if (reminder.dueDate <= addDays(now, 2)) return "amber";
  return "blue";
}

export function isVisibleToUser(reminder: SystemReminder, user: StaffUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (reminder.assignedToUserId && reminder.assignedToUserId === user.id) return true;
  if (!reminder.assignedToRole || reminder.assignedToRole === "all") {
    const role = user.role as string;
    return role === "admin" || role === "supervisor";
  }
  return reminder.assignedToRole === user.role;
}

export function isReminderActionAllowed(user: StaffUser | null): boolean {
  return Boolean(user && (user.role === "admin" || user.role === "supervisor" || user.permissions?.canManageReminders));
}

/**
 * A future maintenance visit becomes visible in the reminders module once it
 * is seven days away or less. Overdue visits remain visible until completed or
 * canceled.
 */
export function isWithinVisitReminderWindow(dueDate: number | undefined, now = Date.now()): boolean {
  const timestamp = Number(dueDate || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;

  const endOfWindow = addDays(now, 7) + DAY - 1;
  return timestamp <= endOfWindow;
}

function maintenanceReminderFromTask(
  task: ServiceOrder,
  source: "appointment" | "urgent_order",
  now: number,
): SystemReminder | null {
  if (!isWithinVisitReminderWindow(task.nextMaintenanceDate, now)) return null;
  if (task.status === "canceled") return null;

  const dueDate = Number(task.nextMaintenanceDate);

  return {
    id: `auto_${source}_${task.id}`,
    title: `موعد زيارة صيانة قادم للعميل ${task.customerName}`,
    description: task.issue || task.serviceDescription || task.notes || undefined,
    source,
    sourceId: task.id,
    customerId: task.customerId,
    customerName: task.customerName,
    customerPhone: task.customerPhone,
    dueDate,
    status: "pending",
    priority: dueDate <= addDays(now, 2) + DAY - 1 ? "high" : "normal",
    assignedToRole: "supervisor",
    assignedToUserId: task.technicianId || task.acceptedByTechnicianId,
    createdAt: task.createdAt || now,
  };
}

export function buildAutoMaintenanceReminders(params: {
  orders: Order[];
  appointments: ServiceOrder[];
  urgentOrders: ServiceOrder[];
  customers: Customer[];
  now?: number;
}): SystemReminder[] {
  const { orders, appointments, urgentOrders, customers } = params;
  const now = params.now ?? Date.now();
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));

  const invoiceReminders = orders
    .filter((order) => {
      if (order.status !== "active" || order.type === "quotation") return false;
      const nextVisit = order.nextMaintenanceDate || order.scheduledMaintenanceDate;
      return isWithinVisitReminderWindow(nextVisit, now);
    })
    .map((order): SystemReminder => {
      const customer = order.customerId ? customersById.get(order.customerId) : undefined;
      const dueDate = Number(order.nextMaintenanceDate || order.scheduledMaintenanceDate);

      return {
        id: `auto_invoice_${order.id}`,
        title: `موعد زيارة صيانة لفاتورة ${order.invoiceNumber}`,
        description: order.items.map((item) => `${item.name} × ${item.qty}`).join("، "),
        source: "invoice",
        sourceId: order.id,
        customerId: order.customerId,
        customerName: order.customerName || customer?.name,
        customerPhone: customer?.phone,
        dueDate,
        status: "pending",
        priority: dueDate <= addDays(now, 2) + DAY - 1 ? "high" : "normal",
        assignedToRole: "supervisor",
        createdAt: order.date,
      };
    });

  const appointmentMaintenanceReminders = appointments
    .map((task) => maintenanceReminderFromTask(task, "appointment", now))
    .filter((reminder): reminder is SystemReminder => Boolean(reminder));

  const currentOrderMaintenanceReminders = urgentOrders
    .map((task) => maintenanceReminderFromTask(task, "urgent_order", now))
    .filter((reminder): reminder is SystemReminder => Boolean(reminder));

  return [
    ...invoiceReminders,
    ...appointmentMaintenanceReminders,
    ...currentOrderMaintenanceReminders,
  ];
}

export function mergeManualAndAutoReminders(manual: SystemReminder[], auto: SystemReminder[]): SystemReminder[] {
  const manualByAutoId = new Map(
    manual
      .filter((reminder) => reminder.source !== "manual" && reminder.sourceId)
      .map((reminder) => [`auto_${reminder.source}_${reminder.sourceId}`, reminder]),
  );

  const normalizedAuto = auto.map((reminder) => {
    const override = manualByAutoId.get(`auto_${reminder.source}_${reminder.sourceId}`);
    return override
      ? {
          ...reminder,
          ...override,
          title: override.title || reminder.title,
          dueDate: override.dueDate || reminder.dueDate,
        }
      : reminder;
  });

  const manualOnly = manual.filter((reminder) => reminder.source === "manual" || !reminder.sourceId);
  return [...manualOnly, ...normalizedAuto].sort((a, b) => a.dueDate - b.dueDate);
}

export function dueReminderCount(reminders: SystemReminder[], now = Date.now()): number {
  const endOfToday = startOfDay(now) + DAY - 1;
  return reminders.filter((reminder) => reminder.status === "pending" && reminder.dueDate <= endOfToday).length;
}

export function createManualReminder(input: {
  title: string;
  description?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  dueDate: number;
  priority?: SystemReminder["priority"];
  assignedToRole?: SystemReminder["assignedToRole"];
  createdBy?: StaffUser | null;
  notes?: string;
}): SystemReminder {
  return {
    id: uid("rem"),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    source: "manual",
    customerId: input.customerId || undefined,
    customerName: input.customerName || undefined,
    customerPhone: input.customerPhone || undefined,
    dueDate: input.dueDate,
    status: "pending",
    priority: input.priority || "normal",
    assignedToRole: input.assignedToRole || "supervisor",
    notes: input.notes?.trim() || undefined,
    createdByUserId: input.createdBy?.id,
    createdByName: input.createdBy?.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
