"use client";

import React, { useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, Select, Textarea, Modal, Table, Badge } from "@/components/ui";
import { ServiceOrder, ServiceOrderStatus, uid, getLocationMapUrl, getLocationLabel } from "@/lib/types";
import { renderWhatsAppTemplate, openWhatsApp, openGoogleMaps } from "@/lib/whatsapp";
import { exportToCSV } from "@/lib/csv";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { readWorkbookImport } from "@/lib/xlsxImport";
import { applyBackupPayload } from "@/lib/backupPayload";
import { saveToSupabaseBackup } from "@/lib/supabaseBackup";
import { buildFullPayload } from "@/lib/fullPayload";
import { confirmWithAdminPassword } from "@/lib/security";
import { IconWhatsApp, IconMapPin } from "@/components/icons";
import {
  SERVICE_ORDER_STATUSES,
  fromDateTimeLocal,
  hasVisitAppointment,
  serviceOrderStatusLabel,
  serviceOrderStatusTone,
  toDateTimeLocal,
} from "@/lib/serviceOrderLabels";

type AppointmentForm = {
  customerId: string;
  customerPhone: string;
  customerName: string;
  issue: string;
  technicianId: string;
  date: string;
  locationId: string;
  status: ServiceOrderStatus;
  notes: string;
};

const EMPTY: AppointmentForm = {
  customerId: "",
  customerPhone: "",
  customerName: "",
  issue: "",
  technicianId: "",
  date: "",
  locationId: "",
  status: "pending",
  notes: "",
};

function isReminderDue(customer: { reminderLevel?: number; nextReminderDate?: number }): boolean {
  return Boolean(customer.nextReminderDate && Date.now() >= customer.nextReminderDate);
}

export default function AppointmentsPage() {
  const { appointments, setAppointments, customers, setCustomers, users, settings, setSettings, activeUser } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const language = ar ? "ar" : "en";

  const [open, setOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<ServiceOrder | null>(null);
  const [form, setForm] = useState<AppointmentForm>(EMPTY);
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [rescheduling, setRescheduling] = useState<ServiceOrder | null>(null);
  const [newDate, setNewDate] = useState("");
  const [excelImportStatus, setExcelImportStatus] = useState("");

  const technicians = users.filter((user) => user.role === "technician");
  const canManage = activeUser?.role === "admin" || activeUser?.role === "supervisor";

  const filtered = useMemo(
    () => appointments.filter((appointment) => {
      const query = search.toLowerCase();
      return (
        (appointment.customerName || "").toLowerCase().includes(query) ||
        (appointment.customerPhone || "").includes(search) ||
        (appointment.issue || "").toLowerCase().includes(query) ||
        (appointment.technicianName || "").toLowerCase().includes(query)
      );
    }),
    [appointments, search],
  );

  const customerResults = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const query = customerSearch.toLowerCase();
    return customers
      .filter((customer) => customer.name.toLowerCase().includes(query) || customer.phone.includes(query))
      .slice(0, 8);
  }, [customers, customerSearch]);

  const selectedCustomer = customers.find(
    (customer) => customer.id === form.customerId || (!form.customerId && customer.phone === form.customerPhone),
  );
  const customerLocations = selectedCustomer?.locations || [];

  const selectCustomer = (customer: { id: string; name: string; phone: string }) => {
    setForm((previous) => ({
      ...previous,
      customerId: customer.id,
      customerPhone: customer.phone,
      customerName: customer.name,
      locationId: "",
    }));
    setCustomerSearch("");
  };

  const lookupByPhone = (phone: string) => {
    const match = customers.find((customer) => customer.phone === phone);
    setForm((previous) => ({
      ...previous,
      customerPhone: phone,
      customerId: match?.id || "",
      customerName: match?.name || previous.customerName,
      locationId: match?.id === previous.customerId ? previous.locationId : "",
    }));
  };

  const closeEditor = () => {
    setOpen(false);
    setEditingAppointment(null);
    setCustomerSearch("");
    setForm(EMPTY);
  };

  const openCreate = () => {
    setEditingAppointment(null);
    setForm(EMPTY);
    setCustomerSearch("");
    setOpen(true);
  };

  const openEdit = (appointment: ServiceOrder) => {
    const technician = technicians.find(
      (user) => user.id === appointment.technicianId || user.name === appointment.technicianName,
    );

    setEditingAppointment(appointment);
    setForm({
      customerId: appointment.customerId || "",
      customerPhone: appointment.customerPhone || "",
      customerName: appointment.customerName || "",
      issue: appointment.issue || "",
      technicianId: technician?.id || appointment.technicianId || "",
      date: toDateTimeLocal(appointment.date),
      locationId: appointment.locationId || "",
      status: appointment.status || "pending",
      notes: appointment.notes || "",
    });
    setCustomerSearch("");
    setOpen(true);
  };

  const saveAppointment = () => {
    if (!canManage || !form.customerPhone.trim() || !form.issue.trim() || !form.date) return;

    const customer = customers.find((item) => item.id === form.customerId || item.phone === form.customerPhone);
    const location = customer?.locations?.find((item) => item.id === form.locationId);
    const technician = technicians.find((item) => item.id === form.technicianId);
    const visitDate = fromDateTimeLocal(form.date);
    const now = Date.now();

    if (editingAppointment) {
      setAppointments(
        appointments.map((appointment) =>
          appointment.id === editingAppointment.id
            ? {
                ...appointment,
                customerId: customer?.id,
                customerName: form.customerName.trim() || customer?.name || appointment.customerName,
                customerPhone: form.customerPhone.trim(),
                locationId: location?.id,
                locationLabel: location ? getLocationLabel(location) : undefined,
                customerGoogleMapsUrl: location ? getLocationMapUrl(location) : undefined,
                customerAddress: location?.address,
                customerCity: location?.city,
                customerDistrict: location?.district,
                issue: form.issue.trim(),
                technicianId: technician?.id,
                technicianName: technician?.name,
                assignedTechnicianIds: technician ? [technician.id] : [],
                assignedTechnicianNames: technician ? [technician.name] : [],
                date: visitDate,
                visitScheduled: true,
                status: form.status,
                notes: form.notes.trim() || undefined,
                completedAt: form.status === "completed" ? appointment.completedAt || now : undefined,
                updatedAt: now,
                activityLogs: [
                  ...(appointment.activityLogs || []),
                  {
                    date: now,
                    text: ar ? "تم تعديل بيانات موعد الزيارة" : "Visit appointment details updated",
                  },
                ],
              }
            : appointment,
        ),
      );
      closeEditor();
      return;
    }

    const appointment: ServiceOrder = {
      id: uid("apt"),
      requestNumber: settings.nextRequestNumber,
      customerId: customer?.id,
      customerName: form.customerName.trim() || customer?.name || (ar ? "عميل غير مسجل" : "Unknown customer"),
      customerPhone: form.customerPhone.trim(),
      technicianId: technician?.id,
      technicianName: technician?.name,
      assignedTechnicianIds: technician ? [technician.id] : [],
      assignedTechnicianNames: technician ? [technician.name] : [],
      locationId: location?.id,
      locationLabel: location ? getLocationLabel(location) : undefined,
      customerGoogleMapsUrl: location ? getLocationMapUrl(location) : undefined,
      customerAddress: location?.address,
      customerCity: location?.city,
      customerDistrict: location?.district,
      issue: form.issue.trim(),
      status: form.status,
      date: visitDate,
      visitScheduled: true,
      notes: form.notes.trim() || undefined,
      completedAt: form.status === "completed" ? now : undefined,
      activityLogs: [{ date: now, text: ar ? "تم جدولة موعد الزيارة" : "Visit appointment scheduled" }],
      createdAt: now,
      updatedAt: now,
    };

    setAppointments([...appointments, appointment]);
    setSettings({ ...settings, nextRequestNumber: settings.nextRequestNumber + 1 });
    closeEditor();
  };

  const complete = (appointment: ServiceOrder) => {
    if (!canManage) return;
    const now = Date.now();
    setAppointments(
      appointments.map((item) =>
        item.id === appointment.id
          ? {
              ...item,
              status: "completed" as ServiceOrderStatus,
              completedAt: now,
              updatedAt: now,
              activityLogs: [...(item.activityLogs || []), { date: now, text: ar ? "تم إنجاز موعد الزيارة" : "Visit completed" }],
            }
          : item,
      ),
    );

    if (appointment.customerId) {
      setCustomers(
        customers.map((customer) =>
          customer.id === appointment.customerId
            ? {
                ...customer,
                reminderLevel: Math.min(6, (customer.reminderLevel || 0) + 1),
                nextReminderDate: Date.now() + 90 * DAY,
              }
            : customer,
        ),
      );
    }
  };

  const remove = (id: string) => {
    if (
      !canManage ||
      !confirmWithAdminPassword(
        settings.adminPassword,
        "deleting this appointment",
        activeUser ? { name: activeUser.name, role: activeUser.role } : undefined,
      )
    ) return;

    setAppointments(appointments.filter((appointment) => appointment.id !== id));
  };

  const sendReminder = (appointment: ServiceOrder, to: "customer" | "technician") => {
    const customer = customers.find((item) => item.id === appointment.customerId);
    if (to === "customer") {
      openWhatsApp(
        appointment.customerPhone,
        renderWhatsAppTemplate(settings.whatsappTemplates.customer, appointment, settings, customer),
      );
      return;
    }

    const technician = users.find(
      (user) => user.id === appointment.technicianId || user.name === appointment.technicianName,
    );
    if (!technician) {
      alert(ar ? "الفني ليس لديه رقم هاتف." : "Assign a technician with a phone number first.");
      return;
    }

    openWhatsApp(
      technician.phone,
      renderWhatsAppTemplate(settings.whatsappTemplates.technician, appointment, settings, customer),
    );
  };

  const applyReschedule = () => {
    if (!rescheduling || !newDate || !canManage) return;
    const timestamp = fromDateTimeLocal(newDate);
    const now = Date.now();

    setAppointments(
      appointments.map((appointment) =>
        appointment.id === rescheduling.id
          ? {
              ...appointment,
              date: timestamp,
              visitScheduled: true,
              updatedAt: now,
              activityLogs: [
                ...(appointment.activityLogs || []),
                {
                  date: now,
                  text: ar
                    ? `إعادة جدولة موعد الزيارة: ${new Date(timestamp).toLocaleString("ar-SA")}`
                    : `Visit rescheduled to ${new Date(timestamp).toLocaleString()}`,
                },
              ],
            }
          : appointment,
      ),
    );
    setRescheduling(null);
    setNewDate("");
  };

  const exportRows = () => filtered.map((appointment) => ({
    id: appointment.id,
    requestNumber: appointment.requestNumber,
    customerId: appointment.customerId || "",
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    issue: appointment.issue,
    technicianId: appointment.technicianId || "",
    technicianName: appointment.technicianName || "",
    locationId: appointment.locationId || "",
    locationLabel: appointment.locationLabel || "",
    status: appointment.status,
    statusArabic: serviceOrderStatusLabel(appointment.status, "ar"),
    date: hasVisitAppointment(appointment) ? appointment.date : "",
    notes: appointment.notes || "",
    activityLogs: appointment.activityLogs || [],
  }));

  const exportCSV = () => exportToCSV("appointments.csv", exportRows().map((appointment) => ({
    RequestNumber: appointment.requestNumber,
    Customer: appointment.customerName,
    Phone: appointment.customerPhone,
    Issue: appointment.issue,
    Technician: appointment.technicianName || "",
    Location: appointment.locationLabel || "",
    Status: ar ? appointment.statusArabic : serviceOrderStatusLabel(appointment.status as ServiceOrderStatus, "en"),
    Date: appointment.date ? new Date(Number(appointment.date)).toLocaleString(ar ? "ar-SA" : "en-US") : "",
  })));

  const exportXlsx = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("appointments"), { appointments: exportRows() });
  };

  const importXlsx = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setExcelImportStatus(ar ? "جارٍ استيراد ملف Excel…" : "Importing Excel…");
      const parsed = await readWorkbookImport(file, "appointments");
      const { imported, empty } = applyBackupPayload(parsed.payload, "merge");
      if (empty) {
        setExcelImportStatus(ar ? "لم يتم العثور على مواعيد متوافقة في الملف." : "No compatible appointments were found in the file.");
        return;
      }
      const cloud = await saveToSupabaseBackup(buildFullPayload());
      setExcelImportStatus(`${ar ? "تم الاستيراد" : "Imported"}: ${imported.join(", ")}. ${cloud.message} ${ar ? "جارٍ إعادة التحميل" : "Reloading"}…`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      setExcelImportStatus(`❌ ${error?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    } finally {
      event.target.value = "";
    }
  };

  const dueReminders = customers.filter(isReminderDue);

  return (
    <div>
      <PageTitle
        title={ar ? "مواعيد الزيارات" : "Visit appointments"}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCSV}>{ar ? "تصدير CSV" : "Export CSV"}</Button>
            <Button variant="secondary" onClick={exportXlsx}>{ar ? "تصدير Excel" : "Export XLSX"}</Button>
            {canManage && (
              <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
                {ar ? "استيراد Excel" : "Import XLSX"}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importXlsx} />
              </label>
            )}
            {canManage && <Button onClick={openCreate}>{ar ? "+ موعد زيارة جديد" : "+ New visit"}</Button>}
          </div>
        }
      />

      {excelImportStatus && <Card className="mb-4 text-sm text-slate-600">{excelImportStatus}</Card>}

      {dueReminders.length > 0 && (
        <Card className="mb-4 border border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">
            {ar ? "عملاء بحاجة إلى متابعة موعد زيارة" : "Customers due for a visit reminder"}: {dueReminders.map((customer) => customer.name).join("، ")}
          </p>
        </Card>
      )}

      <Card>
        <Input placeholder={t("search")} value={search} onChange={(event) => setSearch(event.target.value)} className="mb-3 max-w-sm" />
        <Table headers={["#", t("customer"), ar ? "تفاصيل الزيارة" : "Visit details", t("technician"), t("status"), ar ? "موعد الزيارة" : "Visit date", ""]}>
          {filtered.slice().reverse().map((appointment) => {
            const hasDate = hasVisitAppointment(appointment);
            return (
              <tr
                key={appointment.id}
                className={`border-b align-top ${hasDate ? "border-slate-100" : "border-red-200 bg-red-50"}`}
              >
                <td className="px-2 py-2 text-xs font-medium text-slate-500">{appointment.requestNumber}</td>
                <td className="px-2 py-2">
                  <div className="font-medium">{appointment.customerName}</div>
                  <div className="text-xs text-slate-400">{appointment.customerPhone}</div>
                  {appointment.locationLabel && <div className="mt-0.5 text-xs text-slate-400">📍 {appointment.locationLabel}</div>}
                </td>
                <td className="max-w-xs px-2 py-2 text-sm">
                  <div>{appointment.issue}</div>
                  {appointment.notes && <div className="mt-1 text-xs text-slate-400">{appointment.notes}</div>}
                </td>
                <td className="px-2 py-2 text-sm">{appointment.technicianName || "—"}</td>
                <td className="px-2 py-2">
                  <Badge tone={serviceOrderStatusTone(appointment.status)}>{serviceOrderStatusLabel(appointment.status, language)}</Badge>
                </td>
                <td className="px-2 py-2 text-xs">
                  {hasDate ? (
                    new Date(appointment.date).toLocaleString(ar ? "ar-SA" : "en-US")
                  ) : (
                    <Badge tone="red">{ar ? "بدون موعد زيارة" : "No visit date"}</Badge>
                  )}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {appointment.customerGoogleMapsUrl ? (
                      <button
                        onClick={() => openGoogleMaps(appointment.customerGoogleMapsUrl!)}
                        title={ar ? "فتح الموقع في خرائط Google" : "Open in Google Maps"}
                        className="rounded-lg bg-blue-50 p-1.5 text-blue-600 transition-colors hover:bg-blue-100"
                      >
                        <IconMapPin className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        disabled
                        title={ar ? "لا يوجد موقع محفوظ" : "No location saved"}
                        className="cursor-not-allowed rounded-lg bg-slate-50 p-1.5 text-slate-300"
                      >
                        <IconMapPin className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      onClick={() => sendReminder(appointment, "customer")}
                      title={ar ? "واتساب العميل" : "WhatsApp Customer"}
                      className="rounded-lg bg-green-50 p-1.5 text-green-600 transition-colors hover:bg-green-100"
                    >
                      <IconWhatsApp className="h-4 w-4" />
                    </button>

                    {activeUser?.role !== "technician" && appointment.technicianName && (
                      <button
                        onClick={() => sendReminder(appointment, "technician")}
                        title={ar ? "واتساب الفني" : "WhatsApp Technician"}
                        className="rounded-lg bg-green-50 p-1.5 text-green-700 transition-colors hover:bg-green-100"
                      >
                        <IconWhatsApp className="h-4 w-4" />
                      </button>
                    )}

                    {canManage && <button className="px-1 text-xs text-blue-700 hover:underline" onClick={() => openEdit(appointment)}>{ar ? "تعديل" : "Edit"}</button>}
                    {canManage && appointment.status !== "completed" && (
                      <button className="px-1 text-xs text-green-700 hover:underline" onClick={() => complete(appointment)}>{ar ? "إتمام" : "Complete"}</button>
                    )}
                    {canManage && (
                      <button
                        className="px-1 text-xs text-brand-600 hover:underline"
                        onClick={() => {
                          setRescheduling(appointment);
                          setNewDate(toDateTimeLocal(appointment.date));
                        }}
                      >
                        {ar ? "إعادة جدولة" : "Reschedule"}
                      </button>
                    )}
                    {canManage && <button className="px-1 text-xs text-red-600 hover:underline" onClick={() => remove(appointment.id)}>{t("delete")}</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
        {filtered.length === 0 && <p className="mt-3 text-sm text-slate-400">{ar ? "لا توجد مواعيد زيارات بعد." : "No visit appointments yet."}</p>}
      </Card>

      <Modal
        open={open}
        onClose={closeEditor}
        title={editingAppointment ? (ar ? "تعديل بيانات موعد الزيارة" : "Edit visit appointment") : (ar ? "موعد زيارة جديد" : "New visit appointment")}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{ar ? "البحث عن العميل" : "Search customer"}</label>
            <Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder={ar ? "اسم أو جوال" : "Name or phone"} />
            {customerResults.length > 0 && (
              <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm">
                {customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => selectCustomer(customer)}
                    className="flex w-full justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-brand-50"
                  >
                    <span className="font-medium">{customer.name}</span>
                    <span className="text-slate-400">{customer.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("phone")}</label>
              <Input value={form.customerPhone} onChange={(event) => lookupByPhone(event.target.value)} placeholder="05xxxxxxxx" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("name")}</label>
              <Input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{ar ? "موقع العميل" : "Customer location"}</label>
            <Select value={form.locationId} onChange={(event) => setForm({ ...form, locationId: event.target.value })}>
              <option value="">{ar ? "بدون موقع" : "No location"}</option>
              {customerLocations.map((location) => (
                <option key={location.id} value={location.id}>{getLocationLabel(location)}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{ar ? "تفاصيل الزيارة / الخدمة" : "Visit / service details"}</label>
            <Textarea rows={3} value={form.issue} onChange={(event) => setForm({ ...form, issue: event.target.value })} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{ar ? "الفني" : "Technician"}</label>
              <Select value={form.technicianId} onChange={(event) => setForm({ ...form, technicianId: event.target.value })}>
                <option value="">{t("unassigned")}</option>
                {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{ar ? "موعد الزيارة" : "Visit date and time"}</label>
              <Input
                dir={ar ? "rtl" : "ltr"}
                type="datetime-local"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{ar ? "حالة الموعد" : "Appointment status"}</label>
            <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ServiceOrderStatus })}>
              {SERVICE_ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>{serviceOrderStatusLabel(status, language)}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("notes")}</label>
            <Textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeEditor}>{t("cancel")}</Button>
            <Button onClick={saveAppointment} disabled={!form.customerPhone.trim() || !form.issue.trim() || !form.date}>
              {editingAppointment ? (ar ? "حفظ التعديلات" : "Save changes") : (ar ? "جدولة موعد الزيارة" : "Schedule visit")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!rescheduling} onClose={() => setRescheduling(null)} title={ar ? "إعادة جدولة موعد الزيارة" : "Reschedule visit"}>
        <div className="space-y-3">
          <label className="mb-1 block text-sm font-medium">{ar ? "التاريخ والوقت الجديد" : "New date and time"}</label>
          <Input dir={ar ? "rtl" : "ltr"} type="datetime-local" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setRescheduling(null)}>{t("cancel")}</Button>
            <Button onClick={applyReschedule}>{t("save")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const DAY = 24 * 60 * 60 * 1000;
