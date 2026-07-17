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

const DAY = 24 * 60 * 60 * 1000;

type Filter = "all" | "due" | "today" | "upcoming" | "done";

function toInputDate(value: number) {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromInputDate(value: string) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return startOfDay(date.getTime());
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
    appointment: ar ? "موعد" : "Appointment",
    urgent_order: ar ? "طلب عاجل" : "Urgent order",
    customer: ar ? "عميل" : "Customer",
  }[source];
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

  const [filter, setFilter] = useState<Filter>("due");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState(toInputDate(Date.now()));
  const [priority, setPriority] = useState<SystemReminder["priority"]>("normal");
  const [description, setDescription] = useState("");

  const autoReminders = useMemo(
    () => buildAutoMaintenanceReminders({ orders, appointments, urgentOrders, customers }),
    [orders, appointments, urgentOrders, customers]
  );

  const allReminders = useMemo(
    () => mergeManualAndAutoReminders(reminders, autoReminders).filter((reminder) => isVisibleToUser(reminder, activeUser)),
    [reminders, autoReminders, activeUser]
  );

  const today = startOfDay(Date.now());
  const tomorrow = today + DAY;
  const dueCount = dueReminderCount(allReminders);
  const weekCount = allReminders.filter((reminder) => reminder.status === "pending" && reminder.dueDate >= today && reminder.dueDate <= addDays(today, 7)).length;
  const doneCount = allReminders.filter((reminder) => reminder.status === "done").length;

  const filtered = allReminders.filter((reminder) => {
    const haystack = [reminder.title, reminder.description, reminder.customerName, reminder.customerPhone, reminder.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;

    if (filter === "due") return reminder.status === "pending" && reminder.dueDate < tomorrow;
    if (filter === "today") return reminder.dueDate >= today && reminder.dueDate < tomorrow;
    if (filter === "upcoming") return reminder.status === "pending" && reminder.dueDate >= tomorrow;
    if (filter === "done") return reminder.status === "done";
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    const key = "cc_notified_due_reminders";
    const seen = new Set(JSON.parse(window.localStorage.getItem(key) || "[]") as string[]);
    const due = allReminders.filter((reminder) => reminder.status === "pending" && reminder.dueDate < tomorrow && !seen.has(reminder.id));
    if (due.length > 0) {
      new Notification(ar ? "تذكير صيانة" : "Maintenance reminder", {
        body: `${due[0].title}${due[0].customerName ? ` - ${due[0].customerName}` : ""}`,
      });
      due.forEach((reminder) => seen.add(reminder.id));
      window.localStorage.setItem(key, JSON.stringify(Array.from(seen).slice(-300)));
    }
  }, [allReminders, ar, tomorrow]);

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
    updatePersistedReminder(reminder, { status: "pending", dueDate: nextDate, snoozedUntil: nextDate });
  };

  const deleteReminder = (reminder: SystemReminder) => {
    if (reminder.source !== "manual") {
      updatePersistedReminder(reminder, { status: "canceled" });
      return;
    }
    setReminders(reminders.filter((item) => item.id !== reminder.id));
  };

  const submitReminder = () => {
    const selectedCustomer = customers.find((customer) => customer.id === customerId);
    const reminder = createManualReminder({
      title: title || (ar ? "تذكير جديد" : "New reminder"),
      description,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      customerPhone: selectedCustomer?.phone,
      dueDate: fromInputDate(dueDate),
      priority,
      assignedToRole: "supervisor",
      createdBy: activeUser,
    });
    setReminders([...reminders, reminder]);
    setModalOpen(false);
    setTitle("");
    setCustomerId("");
    setDueDate(toInputDate(Date.now()));
    setPriority("normal");
    setDescription("");
  };

  if (!canManage) {
    return (
      <div>
        <PageTitle title={ar ? "التذكيرات" : "Reminders"} />
        <Card className="text-sm text-slate-500">{ar ? "لا تملك صلاحية عرض التذكيرات." : "You do not have permission to view reminders."}</Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title={ar ? "التذكيرات" : "Reminders"}
        action={<Button onClick={() => setModalOpen(true)}>{ar ? "+ تذكير جديد" : "+ New reminder"}</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-slate-500">{ar ? "مستحقة اليوم أو متأخرة" : "Due / overdue"}</div>
          <div className="mt-1 text-2xl font-bold text-red-600">{dueCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{ar ? "خلال 7 أيام" : "Next 7 days"}</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{weekCount}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{ar ? "تم إنجازها" : "Completed"}</div>
          <div className="mt-1 text-2xl font-bold text-green-600">{doneCount}</div>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "بحث باسم العميل أو رقم الجوال أو التذكير" : "Search customer, phone, or reminder"} />
          <Select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
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
          <Table headers={[ar ? "التذكير" : "Reminder", ar ? "العميل" : "Customer", ar ? "المصدر" : "Source", ar ? "التاريخ" : "Date", ar ? "الحالة" : "Status", ar ? "الإجراء" : "Actions"]}>
            {filtered.map((reminder) => (
              <tr key={reminder.id} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-2 align-top">
                  <div className="font-medium text-slate-800">{reminder.title}</div>
                  {reminder.description && <div className="text-xs text-slate-500">{reminder.description}</div>}
                </td>
                <td className="px-2 py-2 align-top text-sm">
                  <div>{reminder.customerName || "—"}</div>
                  {reminder.customerPhone && <div className="text-xs text-slate-400">{reminder.customerPhone}</div>}
                </td>
                <td className="px-2 py-2 align-top"><Badge tone="slate">{sourceLabel(reminder.source, ar)}</Badge></td>
                <td className="px-2 py-2 align-top text-sm">{new Date(reminder.dueDate).toLocaleDateString(ar ? "ar-SA" : "en-US")}</td>
                <td className="px-2 py-2 align-top"><Badge tone={reminderTone(reminder)}>{statusLabel(reminder.status, ar)}</Badge></td>
                <td className="px-2 py-2 align-top">
                  <div className="flex flex-wrap gap-2">
                    {reminder.status !== "done" && <Button variant="secondary" onClick={() => markDone(reminder)}>{ar ? "تم" : "Done"}</Button>}
                    {reminder.status !== "done" && <Button variant="secondary" onClick={() => snooze(reminder, 7)}>{ar ? "تأجيل أسبوع" : "Snooze"}</Button>}
                    <Button variant="danger" onClick={() => deleteReminder(reminder)}>{ar ? "حذف" : "Delete"}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={ar ? "إضافة تذكير" : "Add reminder"}>
        <div className="space-y-3">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={ar ? "عنوان التذكير" : "Reminder title"} />
          <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">{ar ? "بدون عميل" : "No customer"}</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {customer.phone}</option>)}
          </Select>
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          <Select value={priority} onChange={(event) => setPriority(event.target.value as SystemReminder["priority"])}>
            <option value="normal">{ar ? "عادي" : "Normal"}</option>
            <option value="high">{ar ? "مهم" : "High"}</option>
            <option value="low">{ar ? "منخفض" : "Low"}</option>
          </Select>
          <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={ar ? "ملاحظات التذكير" : "Reminder notes"} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={submitReminder} disabled={!title.trim()}>{ar ? "حفظ" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
