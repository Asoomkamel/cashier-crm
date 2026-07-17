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
    const r = user.role as string;
    return r === "admin" || r === "supervisor";
  }
  return reminder.assignedToRole === user.role;
}

export function isReminderActionAllowed(user: StaffUser | null): boolean {
  return Boolean(user && (user.role === "admin" || user.role === "supervisor" || user.permissions?.canManageReminders));
}

export function buildAutoMaintenanceReminders(params: {
  orders: Order[];
  appointments: ServiceOrder[];
  urgentOrders: ServiceOrder[];
  customers: Customer[];
}): SystemReminder[] {
  const { orders, appointments, urgentOrders, customers } = params;
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));

  const invoiceReminders = orders
    .filter((order) => order.status === "active" && order.type !== "quotation" && (order.nextMaintenanceDate || order.scheduledMaintenanceDate))
    .map((order): SystemReminder => {
      const customer = order.customerId ? customersById.get(order.customerId) : undefined;
      return {
        id: `auto_invoice_${order.id}`,
        title: `موعد صيانة فاتورة ${order.invoiceNumber}`,
        description: order.items.map((item) => `${item.name} × ${item.qty}`).join("، "),
        source: "invoice",
        sourceId: order.id,
        customerId: order.customerId,
        customerName: order.customerName || customer?.name,
        customerPhone: customer?.phone,
        dueDate: order.nextMaintenanceDate || order.scheduledMaintenanceDate || Date.now(),
        status: "pending",
        priority: "normal",
        assignedToRole: "supervisor",
        createdAt: order.date,
      };
    });

  const serviceReminders = [...appointments, ...urgentOrders]
    .filter((task) => task.nextMaintenanceDate)
    .map((task): SystemReminder => ({
      id: `auto_task_${task.id}`,
      title: `موعد صيانة للعميل ${task.customerName}`,
      description: task.issue || task.notes || undefined,
      source: task.acceptedAt ? "urgent_order" : "appointment",
      sourceId: task.id,
      customerId: task.customerId,
      customerName: task.customerName,
      customerPhone: task.customerPhone,
      dueDate: task.nextMaintenanceDate || Date.now(),
      status: "pending",
      priority: "normal",
      assignedToRole: "supervisor",
      createdAt: task.createdAt || task.date,
    }));

  return [...invoiceReminders, ...serviceReminders];
}

export function mergeManualAndAutoReminders(manual: SystemReminder[], auto: SystemReminder[]): SystemReminder[] {
  const manualByAutoId = new Map(manual.filter((reminder) => reminder.source !== "manual" && reminder.sourceId).map((reminder) => [`auto_${reminder.source}_${reminder.sourceId}`, reminder]));

  const normalizedAuto = auto.map((reminder) => {
    const override = manualByAutoId.get(`auto_${reminder.source}_${reminder.sourceId}`);
    return override ? { ...reminder, ...override, title: override.title || reminder.title, dueDate: override.dueDate || reminder.dueDate } : reminder;
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
}): SystemReminder {
  return {
    id: uid("rem"),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    source: "manual",
    customerId: input.customerId || undefined,
    customerName: input.customerName || undefined,
    customerPhone: input.customerPhone || undefined,
    dueDate: startOfDay(input.dueDate),
    status: "pending",
    priority: input.priority || "normal",
    assignedToRole: input.assignedToRole || "supervisor",
    createdByUserId: input.createdBy?.id,
    createdByName: input.createdBy?.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
