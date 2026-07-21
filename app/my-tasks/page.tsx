"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Card, PageTitle, Button, Badge, Input, Modal, Select, Textarea } from "@/components/ui";
import {
  Order,
  OrderItem,
  TechFinancialLog,
  TechInventoryLog,
  ServiceOrder,
  ServiceOrderStatus,
  getLocationLabel,
  getLocationMapUrl,
  uid,
} from "@/lib/types";
import { renderWhatsAppTemplate, openWhatsApp, openGoogleMaps } from "@/lib/whatsapp";
import { IconWhatsApp, IconMapPin, IconPhone } from "@/components/icons";
import InvoicePrint from "@/components/InvoicePrint";

const STATUS_TONE: Record<ServiceOrderStatus, "amber" | "blue" | "green" | "red" | "slate"> = {
  pending: "amber",
  started: "blue",
  in_progress: "blue",
  completed: "green",
  canceled: "red",
  deferred: "slate",
};

type TaskWithSource = ServiceOrder & { source: "urgent" | "appointment" };

function isValidMapsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["maps.google.com", "www.google.com", "maps.app.goo.gl", "goo.gl"].some((host) => parsed.hostname.endsWith(host));
  } catch {
    return false;
  }
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next.getTime();
}

export default function MyTasksPage() {
  const {
    activeUser,
    urgentOrders,
    setUrgentOrders,
    appointments,
    setAppointments,
    customers,
    setCustomers,
    orders,
    setOrders,
    settings,
    setSettings,
    techInventory,
    setTechInventory,
    techInventoryLogs,
    setTechInventoryLogs,
    techFinancialLogs,
    setTechFinancialLogs,
  } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const techName = activeUser?.name || "";
  const techId = activeUser?.id || "";
  const canUpdateLocation = Boolean(activeUser?.permissions?.canUpdateCustomerLocation);

  const [locationModal, setLocationModal] = useState<{ task: TaskWithSource; customerId?: string } | null>(null);
  const [mapsUrl, setMapsUrl] = useState("");
  const [mapsCity, setMapsCity] = useState("");
  const [mapsDistrict, setMapsDistrict] = useState("");
  const [urlError, setUrlError] = useState("");
  const [deferModal, setDeferModal] = useState<TaskWithSource | null>(null);
  const [deferOtherDays, setDeferOtherDays] = useState("");
  const [deferNote, setDeferNote] = useState("");
  const [invoiceModal, setInvoiceModal] = useState<TaskWithSource | null>(null);
  const [maintenanceMonths, setMaintenanceMonths] = useState(String(settings.maintenanceReminderOptions?.[0]?.months || 1));
  const [createdInvoice, setCreatedInvoice] = useState<Order | null>(null);

  const allTasks: TaskWithSource[] = useMemo(() => {
    const acceptedUrgent = urgentOrders
      .filter((order) =>
        order.acceptedByTechnicianId === techId ||
        order.acceptedByTechnicianName === techName ||
        ((order.technicianId === techId || order.technicianName === techName) && order.status !== "pending")
      )
      .map((order) => ({ ...order, source: "urgent" as const }));

    const assignedAppointments = appointments
      .filter((order) => order.technicianId === techId || order.technicianName === techName)
      .map((order) => ({ ...order, source: "appointment" as const }));

    return [...acceptedUrgent, ...assignedAppointments].sort((a, b) => a.date - b.date);
  }, [urgentOrders, appointments, techId, techName]);

  const activeTasks = allTasks.filter((task) => task.status !== "completed" && task.status !== "canceled" && task.status !== "pending");
  const completedTasks = allTasks.filter((task) => task.status === "completed");

  useEffect(() => {
    if (typeof window === "undefined" || !activeUser) return;
    const key = `cc_seen_accepted_task_ids_${activeUser.id}`;
    const seen = new Set(JSON.parse(window.localStorage.getItem(key) || "[]") as string[]);
    const newTasks = activeTasks.filter((task) => !seen.has(`${task.source}:${task.id}`));
    if (newTasks.length > 0 && "Notification" in window && Notification.permission === "granted") {
      new Notification(ar ? "مهمة جديدة" : "New task", { body: `${newTasks[0].customerName} - ${newTasks[0].issue}` });
    }
    newTasks.forEach((task) => seen.add(`${task.source}:${task.id}`));
    window.localStorage.setItem(key, JSON.stringify(Array.from(seen).slice(-200)));
  }, [activeTasks.length, activeUser?.id, ar]);

  const statusLabel = (status: ServiceOrderStatus) => ({
    pending: ar ? "قيد الانتظار" : "Pending",
    started: ar ? "تم القبول" : "Accepted",
    in_progress: ar ? "قيد التنفيذ" : "In progress",
    completed: ar ? "تم" : "Completed",
    canceled: ar ? "ملغي" : "Canceled",
    deferred: ar ? "مؤجل" : "Deferred",
  }[status] || status);

  const updateTask = (task: TaskWithSource, patch: Partial<ServiceOrder>, note?: string) => {
    const entry = {
      date: Date.now(),
      text: note || (ar ? `تحديث المهمة بواسطة ${techName}` : `Task updated by ${techName}`),
    };
    const nextPatch = { ...patch, updatedAt: Date.now(), activityLogs: [...(task.activityLogs || []), entry] };
    if (task.source === "urgent") {
      setUrgentOrders(urgentOrders.map((order) => order.id === task.id ? { ...order, ...nextPatch } : order));
    } else {
      setAppointments(appointments.map((order) => order.id === task.id ? { ...order, ...nextPatch } : order));
    }
  };

  const deferTask = (days: number) => {
    if (!deferModal) return;
    const postponedUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    updateTask(
      deferModal,
      { status: "deferred", postponedUntil, postponedDays: days, postponementNote: deferNote || undefined },
      ar ? `تم تأجيل المهمة ${days} يوم${deferNote ? ` - ${deferNote}` : ""}` : `Task deferred ${days} day(s)${deferNote ? ` - ${deferNote}` : ""}`
    );
    setDeferModal(null);
    setDeferOtherDays("");
    setDeferNote("");
  };

  const sendCustomerWhatsApp = (task: ServiceOrder) => {
    const customer = customers.find((item) => item.id === task.customerId);
    openWhatsApp(task.customerPhone, renderWhatsAppTemplate(settings.whatsappTemplates.customer, task, settings, customer));
  };

  const getTaskMapUrl = (task: ServiceOrder): string => {
    if (task.customerGoogleMapsUrl) return task.customerGoogleMapsUrl;
    const customer = customers.find((item) => item.id === task.customerId);
    if (!customer) return "";
    const location = customer.locations.find((item) => item.id === task.locationId) || customer.locations[0];
    return getLocationMapUrl(location);
  };

  const getTaskLocationLabel = (task: ServiceOrder): string => {
    if (task.locationLabel) return task.locationLabel;
    const customer = customers.find((item) => item.id === task.customerId);
    if (!customer) return "";
    const location = customer.locations.find((item) => item.id === task.locationId) || customer.locations[0];
    return getLocationLabel(location);
  };

  const openLocationModal = (task: TaskWithSource) => {
    setMapsUrl(getTaskMapUrl(task));
    setMapsCity(task.customerCity || "");
    setMapsDistrict(task.customerDistrict || "");
    setUrlError("");
    setLocationModal({ task, customerId: task.customerId });
  };

  const saveLocation = () => {
    if (!locationModal) return;
    if (mapsUrl && !isValidMapsUrl(mapsUrl)) {
      setUrlError(t("crm_maps_url_invalid" as any));
      return;
    }
    const { task } = locationModal;
    const patch = {
      customerGoogleMapsUrl: mapsUrl || undefined,
      customerCity: mapsCity || undefined,
      customerDistrict: mapsDistrict || undefined,
      locationLabel: [mapsCity, mapsDistrict].filter(Boolean).join(" - ") || task.locationLabel,
    };
    updateTask(task, patch, ar ? "تم تحديث موقع العميل" : "Customer location updated");

    if (task.customerId) {
      setCustomers(customers.map((customer) => {
        if (customer.id !== task.customerId) return customer;
        const existing = customer.locations.find((location) => location.id === task.locationId);
        if (existing) {
          return { ...customer, locations: customer.locations.map((location) => location.id === task.locationId ? { ...location, googleMapsUrl: mapsUrl || location.googleMapsUrl, mapLink: mapsUrl || location.mapLink, city: mapsCity || location.city, district: mapsDistrict || location.district, updatedAt: Date.now() } : location) };
        }
        const newLocation = {
          id: uid("loc"),
          address: [mapsCity, mapsDistrict].filter(Boolean).join("، "),
          type: "field_update",
          googleMapsUrl: mapsUrl || undefined,
          mapLink: mapsUrl || undefined,
          city: mapsCity || undefined,
          district: mapsDistrict || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return { ...customer, locations: [...customer.locations, newLocation] };
      }));
    }
    setLocationModal(null);
  };

  const openInvoiceModal = (task: TaskWithSource) => {
    setCreatedInvoice(null);
    setInvoiceModal(task);
    setMaintenanceMonths(String(settings.maintenanceReminderOptions?.[0]?.months || 1));
  };

  const createInvoiceFromTask = () => {
    if (!invoiceModal) return;
    const sourceItems = invoiceModal.requestedItems || [];
    const items: OrderItem[] = sourceItems.length > 0
      ? sourceItems.map((item) => ({ catalogId: item.catalogId || uid("line"), name: item.name, qty: item.qty, price: item.price, tax: settings.defaultTaxRate, discount: 0 }))
      : [{ catalogId: uid("line"), name: invoiceModal.issue || (ar ? "خدمة" : "Service"), qty: 1, price: invoiceModal.expectedAmount || 0, tax: settings.defaultTaxRate, discount: 0, isManualItem: true }];

    for (const item of items) {
      if (item.isManualItem) continue;
      const techItem = techInventory.find((inv) => (inv.technicianId === techId || inv.technicianName === techName) && inv.catalogId === item.catalogId);
      if (!techItem || techItem.qty < item.qty) {
        alert(ar ? `الكمية غير كافية في عهدتك للصنف: ${item.name}` : `Insufficient stock in your custody for: ${item.name}`);
        return;
      }
    }

    const gross = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const tax = items.reduce((sum, item) => {
      const lineGross = item.price * item.qty;
      const net = lineGross / (1 + item.tax / 100);
      return sum + (lineGross - net);
    }, 0);
    const invoiceNumber = `${settings.invoicePrefix}${settings.nextInvoiceNumber}`;
    const nextMaintenanceDate = addMonths(new Date(), Math.max(1, Number(maintenanceMonths) || 1));
    const completionCommission = (gross * (settings.technicianCompletionCommissionPercent ?? 5)) / 100;
    const marketingCommission = invoiceModal.marketerName?.trim().toLowerCase() === techName.trim().toLowerCase()
      ? (gross * (settings.technicianMarketingCommissionPercent ?? 25)) / 100
      : 0;
    const inventoryMovements: NonNullable<Order["inventoryMovements"]> = [];
    let nextTechInventory = techInventory;
    const saleLogs: TechInventoryLog[] = [];

    items.forEach((item) => {
      if (item.isManualItem) return;
      const techItem = nextTechInventory.find((inv) => (inv.technicianId === techId || inv.technicianName === techName) && inv.catalogId === item.catalogId);
      if (!techItem) return;
      nextTechInventory = nextTechInventory.map((inv) => inv.id === techItem.id ? { ...inv, qty: inv.qty - item.qty, updatedAt: Date.now() } : inv);
      inventoryMovements.push({ catalogId: item.catalogId, source: "technician", technicianId: techId, technicianName: techName, qty: item.qty });
      saleLogs.push({ id: uid("tlog"), technicianId: techId, technicianName: techName, catalogId: item.catalogId, itemName: item.name, type: "sale", qty: item.qty, beforeQty: techItem.qty, afterQty: techItem.qty - item.qty, customerId: invoiceModal.customerId, customerName: invoiceModal.customerName, invoiceNumber, reference: invoiceModal.requestNumber ? String(invoiceModal.requestNumber) : undefined, performedByUserId: techId, performedByName: techName, date: Date.now() });
    });

    const invoice: Order = {
      id: uid("order"),
      invoiceNumber,
      customerId: invoiceModal.customerId,
      customerName: invoiceModal.customerName,
      type: "tax_invoice",
      items,
      paymentMethod: "cash",
      paidAmount: gross,
      remainingAmount: 0,
      totalBeforeTax: gross - tax,
      totalTax: tax,
      totalDiscount: 0,
      grandTotal: gross,
      technicianName: techName,
      technicianCommission: completionCommission,
      technicianCommissionType: "percentage",
      referralName: invoiceModal.marketerName || undefined,
      referralPhone: invoiceModal.marketerPhone || undefined,
      referralCommission: marketingCommission || undefined,
      marketingCommission: marketingCommission || undefined,
      requiredSpecialty: invoiceModal.requiredSpecialties?.join("، ") || invoiceModal.requiredSpecialty,
      scheduledMaintenanceDate: nextMaintenanceDate,
      nextMaintenanceDate,
      sourceServiceOrderId: invoiceModal.id,
      inventorySource: inventoryMovements.length ? "technician" : "main",
      inventoryMovements,
      notes: invoiceModal.notes || undefined,
      status: "active",
      date: Date.now(),
    };

    const financialLogs: TechFinancialLog[] = [
      { id: uid("tfin"), technicianId: techId, technicianName: techName, type: "cash_collection", amount: gross, method: "cash", orderId: invoice.id, invoiceNumber, customerId: invoice.customerId, customerName: invoice.customerName, performedByUserId: techId, performedByName: techName, notes: ar ? "كاش مستلم من العميل" : "Cash collected from customer", date: Date.now() },
    ];
    if (completionCommission > 0) financialLogs.push({ id: uid("tfin"), technicianId: techId, technicianName: techName, type: "completion_commission", amount: completionCommission, orderId: invoice.id, invoiceNumber, customerId: invoice.customerId, customerName: invoice.customerName, performedByUserId: techId, performedByName: techName, notes: `${settings.technicianCompletionCommissionPercent ?? 5}%`, date: Date.now() });
    if (marketingCommission > 0) financialLogs.push({ id: uid("tfin"), technicianId: techId, technicianName: techName, type: "marketing_commission", amount: marketingCommission, orderId: invoice.id, invoiceNumber, customerId: invoice.customerId, customerName: invoice.customerName, performedByUserId: techId, performedByName: techName, notes: `${settings.technicianMarketingCommissionPercent ?? 25}%`, date: Date.now() });

    setTechInventory(nextTechInventory);
    if (saleLogs.length > 0) setTechInventoryLogs([...techInventoryLogs, ...saleLogs]);
    setTechFinancialLogs([...techFinancialLogs, ...financialLogs]);
    setOrders([...orders, invoice]);
    setSettings({ ...settings, nextInvoiceNumber: settings.nextInvoiceNumber + 1 });
    updateTask(invoiceModal, { taskInvoiceOrderId: invoice.id, invoicePrintedAt: Date.now(), nextMaintenanceDate }, ar ? `تم إنشاء فاتورة ${invoiceNumber}` : `Invoice ${invoiceNumber} created`);
    setCreatedInvoice(invoice);
  };


  const invoiceWhatsAppMessage = (order: Order) => {
    const nextMaintenance = order.nextMaintenanceDate || order.scheduledMaintenanceDate;
    const nextMaintenanceLine = nextMaintenance ? `موعد الزيارة القادم: ${new Date(nextMaintenance).toLocaleDateString(ar ? "ar-SA" : "en-US")}` : "";
    const fallback = "مرحبًا {اسم_العميل}\nتم إصدار فاتورتكم رقم {رقم_الفاتورة}\nالإجمالي: {الإجمالي} {العملة}\n{موعد_الصيانة_القادم}\nشكرًا لكم.";
    return (settings.invoiceWhatsAppTemplate || fallback)
      .replaceAll("{اسم_العميل}", order.customerName || "")
      .replaceAll("{رقم_الفاتورة}", order.invoiceNumber || "")
      .replaceAll("{الإجمالي}", order.grandTotal.toFixed(2))
      .replaceAll("{العملة}", settings.currency)
      .replaceAll("{موعد_الصيانة_القادم}", nextMaintenanceLine)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const sendInvoiceWhatsApp = (order: Order) => {
    const customer = customers.find((item) => item.id === order.customerId);
    const phone = customer?.phone || invoiceModal?.customerPhone || "";
    openWhatsApp(phone, invoiceWhatsAppMessage(order));
  };

  const printAndSendInvoice = (order: Order) => {
    window.print();
    sendInvoiceWhatsApp(order);
  };

  const renderInvoiceItems = (task: TaskWithSource) => {
    const requestedItems = task.requestedItems ?? [];

    if (requestedItems.length > 0) {
      return requestedItems.map((item) => (
        <div key={item.catalogId || `${item.name}-${item.qty}-${item.price}`} className="flex justify-between border-b border-slate-100 py-1 last:border-0">
          <span>{item.name} × {item.qty}</span>
          <span>{(item.price * item.qty).toFixed(2)} {settings.currency}</span>
        </div>
      ));
    }

    return <div>{task.issue} — {(task.expectedAmount || 0).toFixed(2)} {settings.currency}</div>;
  };

  const renderTaskCard = (task: TaskWithSource, completedSection = false) => {
    const mapUrl = getTaskMapUrl(task);
    const locationLabel = getTaskLocationLabel(task);
    return (
      <Card key={`${task.source}-${task.id}`}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-800">#{task.requestNumber} — {task.customerName}</div>
            <div className="text-xs text-slate-400">{task.customerPhone}</div>
          </div>
          <Badge tone={STATUS_TONE[task.status] || "amber"}>{statusLabel(task.status)}</Badge>
        </div>

        <div className="mb-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <div className="font-medium">{task.issue}</div>
          {(task.requestedItems ?? []).length > 0 && <div className="text-xs text-slate-500">{(task.requestedItems ?? []).map((item) => `${item.name} × ${item.qty}`).join("، ")}</div>}
          {task.notes && <div className="text-xs italic text-slate-500">{task.notes}</div>}
          {task.postponedUntil && <div className="text-xs text-amber-700">{ar ? "مؤجل حتى" : "Deferred until"}: {new Date(task.postponedUntil).toLocaleDateString(ar ? "ar-SA" : "en-US")}</div>}
        </div>

        <div className="mb-3 grid grid-cols-1 gap-1 text-xs text-slate-500 sm:grid-cols-2">
          <div>{task.source === "appointment" ? t("tv_appointment") : t("tv_urgent_order")} · {new Date(task.date).toLocaleDateString(ar ? "ar-SA" : "en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
          {(task.requiredSpecialties || (task.requiredSpecialty ? [task.requiredSpecialty] : [])).length > 0 && <div>{(task.requiredSpecialties || [task.requiredSpecialty]).filter(Boolean).join("، ")}</div>}
          {locationLabel && <div className="text-slate-400 sm:col-span-2">📍 {locationLabel}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!completedSection && (
            <>
              <a href={`tel:${task.customerPhone}`} title={ar ? "اتصال بالعميل" : "Call customer"} className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"><IconPhone className="h-4 w-4" /></a>
              <button onClick={() => sendCustomerWhatsApp(task)} title={ar ? "واتساب العميل" : "WhatsApp Customer"} className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-600 hover:bg-green-100"><IconWhatsApp className="h-4 w-4" /></button>
              {mapUrl ? <button onClick={() => openGoogleMaps(mapUrl)} title={ar ? "فتح الموقع" : "Open location"} className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-600 hover:bg-blue-100"><IconMapPin className="h-4 w-4" /></button> : canUpdateLocation ? <button onClick={() => openLocationModal(task)} title={ar ? "إضافة موقع" : "Add location"} className="flex items-center gap-1 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-400 hover:bg-blue-100"><IconMapPin className="h-4 w-4" /></button> : <button disabled className="cursor-not-allowed rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-300"><IconMapPin className="h-4 w-4" /></button>}
              {mapUrl && canUpdateLocation && <button onClick={() => openLocationModal(task)} className="text-xs text-blue-500 hover:underline">{t("crm_update_location" as any)}</button>}
            </>
          )}

          {!completedSection && task.status !== "completed" && task.status !== "canceled" && (
            <>
              {task.status !== "in_progress" && <Button variant="secondary" onClick={() => updateTask(task, { status: "in_progress" }, ar ? "تم تحويل المهمة إلى قيد التنفيذ" : "Task in progress")}>{ar ? "قيد التنفيذ" : "In progress"}</Button>}
              <Button variant="secondary" onClick={() => setDeferModal(task)}>{ar ? "مؤجل" : "Defer"}</Button>
              <Button onClick={() => updateTask(task, { status: "completed" }, ar ? "تم إكمال المهمة" : "Task completed")}>{ar ? "تم" : "Done"}</Button>
            </>
          )}
          {completedSection && <Button onClick={() => openInvoiceModal(task)}>{ar ? "طباعة فاتورة" : "Print invoice"}</Button>}
        </div>
      </Card>
    );
  };

  return (
    <div>
      <PageTitle title={t("tv_my_tasks")} />

      {activeTasks.length > 0 && <Card className="mb-4 border border-amber-200 bg-amber-50 text-sm text-amber-800">{ar ? `لديك ${activeTasks.length} مهمة موكلة.` : `You have ${activeTasks.length} assigned task(s).`}</Card>}

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800">{ar ? "مهامي الموكلة" : "Assigned tasks"}</h2>
          {activeTasks.length === 0 ? <Card className="text-sm text-slate-400">{ar ? "لا توجد مهام موكلة حالياً." : "No assigned tasks right now."}</Card> : <div className="space-y-3">{activeTasks.map((task) => renderTaskCard(task))}</div>}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800">{ar ? "المهام التي تم إنجازها" : "Completed tasks"}</h2>
          {completedTasks.length === 0 ? <Card className="text-sm text-slate-400">{ar ? "لا توجد مهام منجزة بعد." : "No completed tasks yet."}</Card> : <div className="space-y-3">{completedTasks.map((task) => renderTaskCard(task, true))}</div>}
        </section>
      </div>

      <Modal open={!!deferModal} onClose={() => { setDeferModal(null); setDeferOtherDays(""); setDeferNote(""); }} title={ar ? "تأجيل المهمة" : "Defer task"}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{ar ? "اختر مدة التأجيل." : "Choose defer duration."}</p>
          <div className="grid grid-cols-3 gap-2"><Button variant="secondary" onClick={() => deferTask(1)}>{ar ? "يوم" : "1 day"}</Button><Button variant="secondary" onClick={() => deferTask(2)}>{ar ? "يومين" : "2 days"}</Button><Button variant="secondary" onClick={() => deferTask(7)}>{ar ? "أسبوع" : "1 week"}</Button></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(settings.maintenanceReminderOptions || []).map((option) => <Button key={`${option.label}-${option.months}`} variant="secondary" onClick={() => deferTask(Math.max(1, option.months) * 30)}>{option.label}</Button>)}</div>
          <div className="grid grid-cols-[1fr_auto] gap-2"><Input type="number" min={1} value={deferOtherDays} onChange={(e) => setDeferOtherDays(e.target.value)} placeholder={ar ? "غير ذلك - عدد الأيام" : "Other - days"} /><Button onClick={() => deferTask(Math.max(1, Number(deferOtherDays) || 1))}>{t("save")}</Button></div>
          <Textarea rows={3} value={deferNote} onChange={(e) => setDeferNote(e.target.value)} placeholder={ar ? "ملاحظة التأجيل (اختياري)" : "Defer note (optional)"} />
        </div>
      </Modal>

      <Modal open={!!locationModal} onClose={() => setLocationModal(null)} title={ar ? "تحديث موقع العميل" : "Update customer location"}>
        <div className="space-y-3">
          <Input value={mapsUrl} onChange={(e) => { setMapsUrl(e.target.value); setUrlError(""); }} placeholder="https://maps.google.com/..." dir="ltr" />
          {urlError && <p className="text-xs text-red-500">{urlError}</p>}
          <div className="grid grid-cols-2 gap-2"><Input value={mapsCity} onChange={(e) => setMapsCity(e.target.value)} placeholder={ar ? "المدينة" : "City"} /><Input value={mapsDistrict} onChange={(e) => setMapsDistrict(e.target.value)} placeholder={ar ? "الحي" : "District"} /></div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setLocationModal(null)}>{t("cancel")}</Button><Button onClick={saveLocation}>{t("save")}</Button></div>
        </div>
      </Modal>

      <Modal open={!!invoiceModal} onClose={() => { setInvoiceModal(null); setCreatedInvoice(null); }} title={ar ? "طباعة فاتورة المهمة" : "Task invoice"}>
        {invoiceModal && <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 p-3 text-sm"><div>{ar ? "العميل" : "Customer"}: {invoiceModal.customerName}</div><div>{ar ? "نوع الطلب" : "Invoice type"}: {ar ? "فاتورة تلقائي" : "Automatic invoice"}</div><div>{ar ? "الفني" : "Technician"}: {techName}</div></div>
          <div><label className="mb-1 block text-sm font-medium">{ar ? "موعد الزيارة القادم" : "Next visit"}</label><Select value={maintenanceMonths} onChange={(e) => setMaintenanceMonths(e.target.value)}>{(settings.maintenanceReminderOptions || []).map((option) => <option key={`${option.label}-${option.months}`} value={option.months}>{option.label}</option>)}</Select></div>
          <div className="rounded-lg border border-slate-200 p-2 text-sm"><div className="mb-2 font-medium">{ar ? "بيانات المنتج / الخدمة" : "Products / services"}</div>{renderInvoiceItems(invoiceModal)}</div>
          {!createdInvoice ? <Button onClick={createInvoiceFromTask}>{ar ? "إنشاء وطباعة الفاتورة" : "Create and print invoice"}</Button> : <><div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => window.print()}>{ar ? "طباعة" : "Print"}</Button><Button variant="secondary" onClick={() => sendInvoiceWhatsApp(createdInvoice)}>{ar ? "إرسال واتساب" : "Send WhatsApp"}</Button><Button onClick={() => printAndSendInvoice(createdInvoice)}>{ar ? "طباعة وإرسال" : "Print & send"}</Button></div><div className="overflow-x-auto"><InvoicePrint order={createdInvoice} settings={settings} customer={customers.find((customer) => customer.id === createdInvoice.customerId)} /></div></>}
        </div>}
      </Modal>
    </div>
  );
}
