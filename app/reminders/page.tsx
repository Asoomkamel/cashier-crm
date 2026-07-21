"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { Badge, Button, Card, Input, Modal, PageTitle, Select, Table, Textarea } from "@/components/ui";
import { SystemReminder } from "@/lib/types";
import {
  addDays,
  buildAutoMaintenanceReminders,
  createManualReminder,
  dueReminderCount,
  isReminderActionAllowed,
  isVisibleToUser,
  mergeManualAndAutoReminders,
  reminderTone,
  startOfDay,
} from "@/lib/modules/reminders/service";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/serviceOrderLabels";

const DAY = 24 * 60 * 60 * 1000;

type Filter = "all" | "week" | "due" | "today" | "upcoming" | "done";

type ReminderForm = {
  title: string;
  customerId: string;
  dueDate: string;
  priority: SystemReminder["priority"];
  status: SystemReminder["status"];
  assignedToRole: NonNullable<SystemReminder["assignedToRole"]>;
  description: string;
  notes: string;
};

function emptyReminderForm(): ReminderForm {
  return {
    title: "",
    customerId: "",
    dueDate: toDateTimeLocal(Date.now()),
    priority: "normal",
    status: "pending",
    assignedToRole: "supervisor",
    description: "",
    notes: "",
  };
}

function statusLabel(status: SystemReminder["status"], ar: boolean) {
  return {
    pending: ar ? "معلق" : "Pending",
    done: ar ? "تم" : "Done",
    snoozed: ar ? "مؤجل" : "Snoozed",
    canceled: ar ? "ملغي" : "Canceled",
  }[status];
}

function sourceLabel(source: SystemReminder["source"], ar: boolean) {
  return {
    manual: ar ? "يدوي" : "Manual",
    invoice: ar ? "فاتورة" : "Invoice",
    appointment: ar ? "موعد زيارة" : "Visit appointment",
    urgent_order: ar ? "نظام الطلبات" : "Order system",
    customer: ar ? "عميل" : "Customer",
  }[source];
}

function roleLabel(role: NonNullable<SystemReminder["assignedToRole"]>, ar: boolean) {
  return {
    admin: ar ? "المدير" : "Admin",
    supervisor: ar ? "المشرف" : "Supervisor",
    technician: ar ? "الفني" : "Technician",
    pos: ar ? "نقطة البيع" : "POS",
    all: ar ? "الجميع" : "All",
  }[role];
}

export default function RemindersPage() {
  const {
    activeUser,
    settings,
    reminders,
    setReminders,
    orders,
    appointments,
    urgentOrders,
    customers,
  } = useApp();

  const ar = settings.language === "ar";
  const canManage = isReminderActionAllowed(activeUser);

  const [filter, setFilter] = useState<Filter>("week");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<SystemReminder | null>(null);
  const [form, setForm] = useState<ReminderForm>(emptyReminderForm);

  const autoReminders = useMemo(
    () => buildAutoMaintenanceReminders({ orders, appointments, urgentOrders, customers }),
    [orders, appointments, urgentOrders, customers],
  );

  const allReminders = useMemo(
    () => mergeManualAndAutoReminders(reminders, autoReminders).filter((reminder) => isVisibleToUser(reminder, activeUser)),
    [reminders, autoReminders, activeUser],
  );

  const today = startOfDay(Date.now());
  const tomorrow = today + DAY;
  const dueCount = dueReminderCount(allReminders);
  const weekCount = allReminders.filter(
    (reminder) => reminder.status === "pending" && reminder.dueDate >= today && reminder.dueDate <= addDays(today, 7) + DAY - 1,
  ).length;
  const doneCount = allReminders.filter((reminder) => reminder.status === "done").length;

  const filtered = allReminders.filter((reminder) => {
    const haystack = [reminder.title, reminder.description, reminder.customerName, reminder.customerPhone, reminder.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;
    if (filter === "week") return reminder.status === "pending" && reminder.dueDate <= addDays(today, 7) + DAY - 1;
    if (filter === "due") return reminder.status === "pending" && reminder.dueDate < tomorrow;
    if (filter === "today") return reminder.dueDate >= today && reminder.dueDate < tomorrow;
    if (filter === "upcoming") return reminder.status === "pending" && reminder.dueDate >= tomorrow;
    if (filter === "done") return reminder.status === "done";
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;

    const key = "cc_notified_due_reminders";
    const seen = new Set(JSON.parse(window.localStorage.getItem(key) || "[]") as string[]);
    const due = allReminders.filter(
      (reminder) => reminder.status === "pending" && reminder.dueDate < tomorrow && !seen.has(reminder.id),
    );

    if (due.length > 0) {
      new Notification(ar ? "تذكير بموعد زيارة" : "Visit reminder", {
        body: `${due[0].title}${due[0].customerName ? ` - ${due[0].customerName}` : ""}`,
      });
      due.forEach((reminder) => seen.add(reminder.id));
      window.localStorage.setItem(key, JSON.stringify(Array.from(seen).slice(-300)));
    }
  }, [allReminders, ar, tomorrow]);

  const clearNotificationHistory = (reminderId: string) => {
    if (typeof window === "undefined") return;
    const key = "cc_notified_due_reminders";
    const seen = new Set(JSON.parse(window.localStorage.getItem(key) || "[]") as string[]);
    seen.delete(reminderId);
    window.localStorage.setItem(key, JSON.stringify(Array.from(seen).slice(-300)));
  };

  const updatePersistedReminder = (reminder: SystemReminder, patch: Partial<SystemReminder>) => {
    const persistedId = reminder.source === "manual" ? reminder.id : `override_${reminder.source}_${reminder.sourceId}`;
    const existing = reminders.find((item) => item.id === reminder.id || item.id === persistedId);
    const next: SystemReminder = {
      ...reminder,
      ...(existing || {}),
      ...patch,
      id: existing?.id || persistedId,
      source: reminder.source,
      sourceId: reminder.sourceId,
      updatedAt: Date.now(),
    };

    setReminders(existing ? reminders.map((item) => (item.id === existing.id ? next : item)) : [...reminders, next]);
  };

  const markDone = (reminder: SystemReminder) => {
    updatePersistedReminder(reminder, {
      status: "done",
      completedAt: Date.now(),
      completedByUserId: activeUser?.id,
      completedByName: activeUser?.name,
    });
  };

  const snooze = (reminder: SystemReminder, days: number) => {
    const nextDate = addDays(Date.now(), days);
    updatePersistedReminder(reminder, {
      status: "pending",
      dueDate: nextDate,
      snoozedUntil: nextDate,
      completedAt: undefined,
      completedByUserId: undefined,
      completedByName: undefined,
    });
    clearNotificationHistory(reminder.id);
  };

  const deleteReminder = (reminder: SystemReminder) => {
    if (reminder.source !== "manual") {
      updatePersistedReminder(reminder, { status: "canceled" });
      return;
    }
    setReminders(reminders.filter((item) => item.id !== reminder.id));
  };

  const openCreate = () => {
    setEditingReminder(null);
    setForm(emptyReminderForm());
    setModalOpen(true);
  };

  const openEdit = (reminder: SystemReminder) => {
    setEditingReminder(reminder);
    setForm({
      title: reminder.title || "",
      customerId: reminder.customerId || "",
      dueDate: toDateTimeLocal(reminder.dueDate),
      priority: reminder.priority || "normal",
      status: reminder.status || "pending",
      assignedToRole: reminder.assignedToRole || "supervisor",
      description: reminder.description || "",
      notes: reminder.notes || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingReminder(null);
    setForm(emptyReminderForm());
  };

  const submitReminder = () => {
    if (!form.title.trim() || !form.dueDate) return;

    const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
    const dueDate = fromDateTimeLocal(form.dueDate);

    if (editingReminder) {
      updatePersistedReminder(editingReminder, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        customerPhone: selectedCustomer?.phone,
        dueDate,
        priority: form.priority,
        status: form.status,
        assignedToRole: form.assignedToRole,
        notes: form.notes.trim() || undefined,
        completedAt: form.status === "done" ? editingReminder.completedAt || Date.now() : undefined,
        completedByUserId: form.status === "done" ? activeUser?.id : undefined,
        completedByName: form.status === "done" ? activeUser?.name : undefined,
        snoozedUntil: form.status === "snoozed" ? dueDate : undefined,
      });
      clearNotificationHistory(editingReminder.id);
      closeModal();
      return;
    }

    const reminder = createManualReminder({
      title: form.title,
      description: form.description,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      customerPhone: selectedCustomer?.phone,
      dueDate,
      priority: form.priority,
      assignedToRole: form.assignedToRole,
      notes: form.notes,
      createdBy: activeUser,
    });

    reminder.status = form.status;
    if (form.status === "done") {
      reminder.completedAt = Date.now();
      reminder.completedByUserId = activeUser?.id;
      reminder.completedByName = activeUser?.name;
    }
    if (form.status === "snoozed") reminder.snoozedUntil = dueDate;

    setReminders([...reminders, reminder]);
    closeModal();
  };

  if (!canManage) {
    return (
      <div>
        <PageTitle title={ar ? "التذكيرات" : "Reminders"} />
        <Card className="text-sm text-slate-500">
          {ar ? "لا تملك صلاحية عرض التذكيرات." : "You do not have permission to view reminders."}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title={ar ? "التذكيرات" : "Reminders"}
        action={<Button onClick={openCreate}>{ar ? "+ تذكير جديد" : "+ New reminder"}</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-slate-500">{ar ? "مستحقة اليوم أو متأخرة" : "Due / overdue"}</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{dueCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{ar ? "مواعيد خلال 7 أيام" : "Visits in the next 7 days"}</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{weekCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{ar ? "تم إنجازها" : "Completed"}</div>
          <div className="mt-1 text-2xl font-bold text-green-600">{doneCount}</div>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ar ? "بحث باسم العميل أو رقم الجوال أو التذكير" : "Search customer, phone, or reminder"}
          />
          <Select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
            <option value="week">{ar ? "خلال 7 أيام" : "Within 7 days"}</option>
            <option value="due">{ar ? "المستحقة" : "Due"}</option>
            <option value="today">{ar ? "اليوم" : "Today"}</option>
            <option value="upcoming">{ar ? "القادمة" : "Upcoming"}</option>
            <option value="done">{ar ? "المنجزة" : "Done"}</option>
            <option value="all">{ar ? "الكل" : "All"}</option>
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="text-center text-sm text-slate-500">
          {ar ? "لا توجد تذكيرات مطابقة." : "No matching reminders."}
        </Card>
      ) : (
        <Card>
          <Table
            headers={[
              ar ? "التذكير" : "Reminder",
              ar ? "العميل" : "Customer",
              ar ? "المصدر" : "Source",
              ar ? "التاريخ والوقت" : "Date and time",
              ar ? "الحالة" : "Status",
              ar ? "الإجراء" : "Actions",
            ]}
          >
            {filtered.map((reminder) => (
              <tr key={reminder.id} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-2 align-top">
                  <div className="font-medium text-slate-800">{reminder.title}</div>
                  {reminder.description && <div className="text-xs text-slate-500">{reminder.description}</div>}
                  {reminder.notes && <div className="mt-1 text-xs text-slate-400">{reminder.notes}</div>}
                </td>
                <td className="px-2 py-2 align-top text-sm">
                  <div>{reminder.customerName || "—"}</div>
                  {reminder.customerPhone && <div className="text-xs text-slate-400">{reminder.customerPhone}</div>}
                </td>
                <td className="px-2 py-2 align-top">
                  <Badge tone="slate">{sourceLabel(reminder.source, ar)}</Badge>
                </td>
                <td className="px-2 py-2 align-top text-sm">
                  {new Date(reminder.dueDate).toLocaleString(ar ? "ar-SA" : "en-US")}
                </td>
                <td className="px-2 py-2 align-top">
                  <Badge tone={reminderTone(reminder)}>{statusLabel(reminder.status, ar)}</Badge>
                </td>
                <td className="px-2 py-2 align-top">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => openEdit(reminder)}>{ar ? "تعديل" : "Edit"}</Button>
                    {reminder.status !== "done" && (
                      <Button variant="secondary" onClick={() => markDone(reminder)}>{ar ? "تم" : "Done"}</Button>
                    )}
                    {reminder.status !== "done" && (
                      <Button variant="secondary" onClick={() => snooze(reminder, 7)}>{ar ? "تأجيل أسبوع" : "Snooze"}</Button>
                    )}
                    <Button variant="danger" onClick={() => deleteReminder(reminder)}>{ar ? "حذف" : "Delete"}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingReminder ? (ar ? "تعديل بيانات التذكير" : "Edit reminder") : (ar ? "إضافة تذكير" : "Add reminder")}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{ar ? "عنوان التذكير" : "Reminder title"}</label>
            <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{ar ? "العميل" : "Customer"}</label>
            <Select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
              <option value="">{ar ? "بدون عميل" : "No customer"}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name} — {customer.phone}</option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{ar ? "موعد التذكير" : "Reminder date"}</label>
              <Input
                dir={ar ? "rtl" : "ltr"}
                type="datetime-local"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{ar ? "الأولوية" : "Priority"}</label>
              <Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as SystemReminder["priority"] })}>
                <option value="normal">{ar ? "عادي" : "Normal"}</option>
                <option value="high">{ar ? "مهم" : "High"}</option>
                <option value="low">{ar ? "منخفض" : "Low"}</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{ar ? "الحالة" : "Status"}</label>
              <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as SystemReminder["status"] })}>
                {(["pending", "done", "snoozed", "canceled"] as SystemReminder["status"][]).map((status) => (
                  <option key={status} value={status}>{statusLabel(status, ar)}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{ar ? "موجّه إلى" : "Assigned to"}</label>
              <Select
                value={form.assignedToRole}
                onChange={(event) => setForm({ ...form, assignedToRole: event.target.value as ReminderForm["assignedToRole"] })}
              >
                {(["admin", "supervisor", "technician", "pos", "all"] as ReminderForm["assignedToRole"][]).map((role) => (
                  <option key={role} value={role}>{roleLabel(role, ar)}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{ar ? "الوصف" : "Description"}</label>
            <Textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{ar ? "ملاحظات" : "Notes"}</label>
            <Textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>

          {editingReminder?.source !== "manual" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
              {ar
                ? "هذا تذكير تلقائي. سيتم حفظ تعديلاتك كتخصيص دائم دون تغيير الطلب أو الفاتورة الأصلية."
                : "This is an automatic reminder. Your changes are saved as an override without changing the source order or invoice."}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={submitReminder} disabled={!form.title.trim() || !form.dueDate}>{ar ? "حفظ التعديلات" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
