"use client";

import React, { useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Input, SuggestInput, Select, Textarea, Modal, Table, Badge } from "@/components/ui";
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

const EMPTY = { customerPhone: "", customerName: "", issue: "", technicianName: "", date: "", locationId: "" };

function isReminderDue(customer: { reminderLevel?: number; nextReminderDate?: number }): boolean {
  if (customer.nextReminderDate) return Date.now() >= customer.nextReminderDate;
  return false;
}

export default function AppointmentsPage() {
  const { appointments, setAppointments, customers, setCustomers, users, settings, setSettings, activeUser } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [rescheduling, setRescheduling] = useState<ServiceOrder | null>(null);
  const [newDate, setNewDate] = useState("");
  const [excelImportStatus, setExcelImportStatus] = useState("");

  const technicians = users.filter((u) => u.role === "technician");
  const isAdmin = activeUser?.role === "admin";

  const filtered = useMemo(
    () => appointments.filter((o) =>
      (o.customerName || "").toLowerCase().includes(search.toLowerCase()) ||
      (o.customerPhone || "").includes(search)
    ),
    [appointments, search]
  );

  // Customer search for appointment form
  const customerResults = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 5);
  }, [customers, customerSearch]);

  const selectedCustomer = customers.find((c) => c.phone === form.customerPhone);
  const customerLocations = selectedCustomer?.locations || [];

  const selectCustomer = (c: { name: string; phone: string }) => {
    setForm((f) => ({ ...f, customerPhone: c.phone, customerName: c.name, locationId: "" }));
    setCustomerSearch("");
  };

  const lookupByPhone = (phone: string) => {
    setForm((f) => ({ ...f, customerPhone: phone }));
    const match = customers.find((c) => c.phone === phone);
    if (match) setForm((f) => ({ ...f, customerPhone: phone, customerName: match.name }));
  };

  const create = () => {
    if (!form.customerPhone || !form.issue || !form.date) return;
    const match = customers.find((c) => c.phone === form.customerPhone);
    const loc = customerLocations.find((l) => l.id === form.locationId);
    const order: ServiceOrder = {
      id: uid("apt"),
      requestNumber: settings.nextRequestNumber,
      customerId: match?.id,
      customerName: form.customerName || match?.name || "Unknown",
      customerPhone: form.customerPhone,
      technicianName: form.technicianName || undefined,
      locationId: loc?.id,
      locationLabel: loc ? getLocationLabel(loc) : undefined,
      customerGoogleMapsUrl: loc ? getLocationMapUrl(loc) : undefined,
      customerCity: loc?.city || undefined,
      customerDistrict: loc?.district || undefined,
      issue: form.issue,
      status: "pending",
      date: new Date(form.date).getTime(),
      activityLogs: [{ date: Date.now(), text: ar ? "تم جدولة الموعد" : "Appointment scheduled" }],
      createdAt: Date.now(),
    };
    setAppointments([...appointments, order]);
    setSettings({ ...settings, nextRequestNumber: settings.nextRequestNumber + 1 });
    setForm(EMPTY);
    setCustomerSearch("");
    setOpen(false);
  };

  const complete = (o: ServiceOrder) => {
    setAppointments(
      appointments.map((a) =>
        a.id === o.id
          ? { ...a, status: "completed" as ServiceOrderStatus, activityLogs: [...a.activityLogs, { date: Date.now(), text: ar ? "تم الإنجاز" : "Marked completed" }] }
          : a
      )
    );
    if (o.customerId) {
      setCustomers(
        customers.map((c) =>
          c.id === o.customerId
            ? { ...c, reminderLevel: Math.min(6, (c.reminderLevel || 0) + 1), nextReminderDate: Date.now() + 90 * 24 * 60 * 60 * 1000 }
            : c
        )
      );
    }
  };

  const remove = (id: string) => {
    if (!confirmWithAdminPassword(settings.adminPassword, "deleting this appointment", activeUser ? { name: activeUser.name, role: activeUser.role } : undefined)) return;
    setAppointments(appointments.filter((o) => o.id !== id));
  };

  const sendReminder = (order: ServiceOrder, to: "customer" | "technician") => {
    const customer = customers.find((c) => c.id === order.customerId);
    if (to === "customer") {
      openWhatsApp(order.customerPhone, renderWhatsAppTemplate(settings.whatsappTemplates.customer, order, settings, customer));
    } else {
      const tech = users.find((u) => u.name === order.technicianName);
      if (!tech) { alert(ar ? "الفني ليس لديه رقم هاتف." : "Assign a technician with a phone number first."); return; }
      openWhatsApp(tech.phone, renderWhatsAppTemplate(settings.whatsappTemplates.technician, order, settings, customer));
    }
  };

  const applyReschedule = () => {
    if (!rescheduling || !newDate) return;
    const ts = new Date(newDate).getTime();
    setAppointments(
      appointments.map((o) =>
        o.id === rescheduling.id
          ? { ...o, date: ts, activityLogs: [...o.activityLogs, { date: Date.now(), text: ar ? `إعادة جدولة: ${new Date(ts).toLocaleString("ar-SA")}` : `Extended to ${new Date(ts).toLocaleString()}` }] }
          : o
      )
    );
    setRescheduling(null);
    setNewDate("");
  };

  const exportRows = () => filtered.map((o) => ({
    id: o.id,
    requestNumber: o.requestNumber,
    customerId: o.customerId || "",
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    issue: o.issue,
    technicianId: o.technicianId || "",
    technicianName: o.technicianName || "",
    locationId: o.locationId || "",
    locationLabel: o.locationLabel || "",
    status: o.status,
    date: o.date,
    notes: o.notes || "",
    activityLogs: o.activityLogs || [],
  }));

  const exportCSV = () => exportToCSV("appointments.csv", exportRows().map((o) => ({
    RequestNumber: o.requestNumber,
    Customer: o.customerName,
    Phone: o.customerPhone,
    Issue: o.issue,
    Technician: o.technicianName || "",
    Location: o.locationLabel || "",
    Status: o.status,
    Date: new Date(Number(o.date)).toLocaleString(),
  })));

  const exportXlsx = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("appointments"), { appointments: exportRows() });
  };

  const importXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
    } catch (err: any) {
      setExcelImportStatus(`❌ ${err?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    } finally {
      e.target.value = "";
    }
  };

  const dueReminders = customers.filter(isReminderDue);

  return (
    <div>
      <PageTitle
        title={t("appt_title")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCSV}>{t("urgent_export_csv")}</Button>
            <Button variant="secondary" onClick={exportXlsx}>{ar ? "تصدير Excel" : "Export XLSX"}</Button>
            {(activeUser?.role === "admin" || activeUser?.permissions?.canCreateRequests) && (
              <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
                {ar ? "استيراد Excel" : "Import XLSX"}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importXlsx} />
              </label>
            )}
            {(activeUser?.role === "admin" || activeUser?.permissions?.canCreateRequests) && (
              <Button onClick={() => setOpen(true)}>{t("appt_new")}</Button>
            )}
          </div>
        }
      />

      {excelImportStatus && <Card className="mb-4 text-sm text-slate-600">{excelImportStatus}</Card>}

      {dueReminders.length > 0 && (
        <Card className="mb-4 border border-amber-300 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">
            {dueReminders.length} {t("appt_due_banner")}: {dueReminders.map((c) => c.name).join("، ")}
          </p>
        </Card>
      )}

      <Card>
        <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 max-w-sm" />
        <Table headers={["#", t("customer"), t("urgent_issue"), t("technician"), t("status"), t("date"), ""]}>
          {filtered.slice().reverse().map((o) => (
            <tr key={o.id} className="border-b border-slate-100 align-top">
              <td className="px-2 py-2 text-xs font-medium text-slate-500">{o.requestNumber}</td>
              <td className="px-2 py-2">
                <div className="font-medium">{o.customerName}</div>
                <div className="text-xs text-slate-400">{o.customerPhone}</div>
                {o.locationLabel && <div className="mt-0.5 text-xs text-slate-400">📍 {o.locationLabel}</div>}
              </td>
              <td className="px-2 py-2 max-w-xs text-sm">{o.issue}</td>
              <td className="px-2 py-2 text-sm">{o.technicianName || "—"}</td>
              <td className="px-2 py-2">
                <Badge tone={o.status === "completed" ? "green" : "amber"}>{(o.status || "pending").replace("_", " ")}</Badge>
              </td>
              <td className="px-2 py-2 text-xs">{new Date(o.date).toLocaleString(ar ? "ar-SA" : "en-US")}</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap items-center gap-1.5 justify-end">
                  {/* Map icon */}
                  {o.customerGoogleMapsUrl ? (
                    <button
                      onClick={() => openGoogleMaps(o.customerGoogleMapsUrl!)}
                      title={ar ? "فتح الموقع في خرائط Google" : "Open in Google Maps"}
                      className="rounded-lg bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100 transition-colors"
                    >
                      <IconMapPin className="h-4 w-4" />
                    </button>
                  ) : (
                    <button disabled title={ar ? "لا يوجد موقع محفوظ" : "No location saved"}
                      className="rounded-lg bg-slate-50 p-1.5 text-slate-300 cursor-not-allowed">
                      <IconMapPin className="h-4 w-4" />
                    </button>
                  )}
                  {/* WhatsApp customer */}
                  <button
                    onClick={() => sendReminder(o, "customer")}
                    title={ar ? "واتساب العميل" : "WhatsApp Customer"}
                    className="rounded-lg bg-green-50 p-1.5 text-green-600 hover:bg-green-100 transition-colors"
                  >
                    <IconWhatsApp className="h-4 w-4" />
                  </button>
                  {/* WhatsApp technician — admin only */}
                  {activeUser?.role !== "technician" && o.technicianName && (
                    <button
                      onClick={() => sendReminder(o, "technician")}
                      title={ar ? "واتساب الفني" : "WhatsApp Technician"}
                      className="rounded-lg bg-green-50 p-1.5 text-green-700 hover:bg-green-100 transition-colors"
                    >
                      <span className="relative">
                        <IconWhatsApp className="h-4 w-4" />
                        <span className="absolute -top-1 -end-1 h-2 w-2 rounded-full bg-green-700" />
                      </span>
                    </button>
                  )}
                  {isAdmin && o.status !== "completed" && (
                    <button className="text-xs text-green-700 hover:underline px-1" onClick={() => complete(o)}>{t("appt_complete")}</button>
                  )}
                  {isAdmin && <button className="text-xs text-brand-600 hover:underline px-1" onClick={() => { setRescheduling(o); setNewDate(""); }}>{t("appt_extend")}</button>}
                  {isAdmin && (
                    <button className="text-xs text-red-600 hover:underline px-1" onClick={() => remove(o.id)}>{t("delete")}</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
        {filtered.length === 0 && <p className="mt-3 text-sm text-slate-400">{t("appt_no_appointments")}</p>}
      </Card>

      {/* ── New appointment modal ── */}
      <Modal open={open} onClose={() => { setOpen(false); setCustomerSearch(""); setForm(EMPTY); }} title={t("appt_new_title")}>
        <div className="space-y-3">
          {/* Customer search */}
          <div>
            <label className="mb-1 block text-sm font-medium">{t("urgent_search_customer")}</label>
            <Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder={ar ? "اسم أو جوال" : "Name or phone"} />
            {customerResults.length > 0 && (
              <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm">
                {customerResults.map((c) => (
                  <button key={c.id} onClick={() => selectCustomer(c)}
                    className="flex w-full justify-between px-3 py-2 text-sm hover:bg-brand-50 border-b border-slate-100 last:border-0">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-slate-400">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manual entry */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("phone")}</label>
              <Input value={form.customerPhone} onChange={(e) => lookupByPhone(e.target.value)} placeholder="05xxxxxxxx" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("name")}</label>
              <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            </div>
          </div>

          {/* Location selector */}
          {customerLocations.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium">{t("urgent_select_location")}</label>
              <Select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">{ar ? "بدون موقع" : "No location"}</option>
                {customerLocations.map((l) => (
                  <option key={l.id} value={l.id}>{getLocationLabel(l)}</option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">{t("appt_details")}</label>
            <Textarea rows={3} value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isAdmin ? (
              <div>
                <label className="mb-1 block text-sm font-medium">{t("pos_technician_optional")}</label>
                <Select value={form.technicianName} onChange={(e) => setForm({ ...form, technicianName: e.target.value })}>
                  <option value="">{t("unassigned")}</option>
                  {technicians.map((tc) => <option key={tc.id} value={tc.name}>{tc.name}</option>)}
                </Select>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                {ar ? "سيتم تحديد الفني من قبل الإدارة." : "The technician will be assigned by admin."}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">{t("appt_datetime")}</label>
              <Input dir={ar ? "rtl" : "ltr"} type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={create}>{t("appt_schedule")}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Reschedule modal ── */}
      <Modal open={!!rescheduling} onClose={() => setRescheduling(null)} title={t("appt_extend_title")}>
        <div className="space-y-3">
          <label className="mb-1 block text-sm font-medium">{t("urgent_new_datetime")}</label>
          <Input dir={ar ? "rtl" : "ltr"} type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setRescheduling(null)}>{t("cancel")}</Button>
            <Button onClick={applyReschedule}>{t("save")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
