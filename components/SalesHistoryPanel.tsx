"use client";

import React, { useState } from "react";
import { useApp, useT } from "@/lib/store";
import { Button, Card, Input, Modal, Select, Table } from "@/components/ui";
import { confirmWithAdminPassword } from "@/lib/security";
import { Order } from "@/lib/types";
import InvoicePrint from "@/components/InvoicePrint";
import { openWhatsApp } from "@/lib/whatsapp";
import { downloadWorkbookXlsx, makeXlsxFileName } from "@/lib/xlsxExport";
import { importStatusMessage, importWorkbookToSystem } from "@/lib/xlsxPageActions";

function invoiceWhatsAppMessage(order: Order, template: string, currency: string, locale: string) {
  const nextMaintenance = order.nextMaintenanceDate || order.scheduledMaintenanceDate;
  const nextMaintenanceLine = nextMaintenance ? `موعد الزيارة القادم: ${new Date(nextMaintenance).toLocaleDateString(locale)}` : "";
  const fallback = "مرحبًا {اسم_العميل}\nتم إصدار فاتورتكم رقم {رقم_الفاتورة}\nالإجمالي: {الإجمالي} {العملة}\n{موعد_الصيانة_القادم}\nشكرًا لكم.";
  return (template || fallback)
    .replaceAll("{اسم_العميل}", order.customerName || "")
    .replaceAll("{رقم_الفاتورة}", order.invoiceNumber || "")
    .replaceAll("{الإجمالي}", order.grandTotal.toFixed(2))
    .replaceAll("{العملة}", currency)
    .replaceAll("{موعد_الصيانة_القادم}", nextMaintenanceLine)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function invoiceTypeLabel(type: Order["type"], ar: boolean): string {
  return {
    tax_invoice: ar ? "فاتورة ضريبية" : "Tax invoice",
    quotation: ar ? "عرض سعر" : "Quotation",
    return_invoice: ar ? "فاتورة مرتجع" : "Return invoice",
  }[type];
}

function invoiceStatusLabel(status: Order["status"], ar: boolean): string {
  return {
    active: ar ? "نشطة" : "Active",
    returned: ar ? "مرتجعة" : "Returned",
    deleted: ar ? "محذوفة" : "Deleted",
  }[status];
}

function periodStart(periodFilter: string) {
  const now = new Date();
  const start = new Date(now);
  if (periodFilter === "all") return 0;
  if (periodFilter === "today") start.setHours(0, 0, 0, 0);
  if (periodFilter === "week") start.setDate(now.getDate() - 7);
  if (periodFilter === "month") start.setMonth(now.getMonth() - 1);
  if (periodFilter === "year") start.setFullYear(now.getFullYear() - 1);
  if (periodFilter !== "today") start.setHours(0, 0, 0, 0);
  return start.getTime();
}

export default function SalesHistoryPanel() {
  const { orders, setOrders, settings, customers } = useApp();
  const t = useT();
  const ar = settings.language === "ar";
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [excelStatus, setExcelStatus] = useState("");

  const filtered = orders.filter((order) => {
    const q = search.toLowerCase();
    const matchesText =
      (order.invoiceNumber || "").toLowerCase().includes(q) ||
      (order.customerName || "").toLowerCase().includes(q);
    const matchesPeriod = order.date >= periodStart(periodFilter);
    const matchesPayment = !paymentFilter || order.paymentMethod === paymentFilter;
    return matchesText && matchesPeriod && matchesPayment;
  });

  const customerFor = (order: Order) => customers.find((customer) => customer.id === order.customerId);

  const remove = (id: string) => {
    if (!confirmWithAdminPassword(settings.adminPassword, ar ? "حذف سجل مبيعات" : "deleting this sales record")) return;
    setOrders(orders.map((order) => (order.id === id ? { ...order, status: "deleted" } : order)));
  };

  const sendInvoiceWhatsApp = (order: Order) => {
    const customer = customerFor(order);
    const phone = order.invoiceContactPhone || customer?.phone || "";
    if (!phone) {
      alert(ar ? "لا يوجد رقم جوال للعميل." : "Customer phone is missing.");
      return;
    }
    openWhatsApp(phone, invoiceWhatsAppMessage(order, settings.invoiceWhatsAppTemplate, settings.currency, ar ? "ar-SA" : "en-US"));
  };

  const printAndSend = (order: Order) => {
    setSelectedOrder(order);
    setTimeout(() => {
      window.print();
      sendInvoiceWhatsApp(order);
    }, 120);
  };

  const exportSalesExcel = async () => {
    await downloadWorkbookXlsx(makeXlsxFileName("sales-history"), { orders: filtered });
  };

  const importSalesExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setExcelStatus(ar ? "جارٍ استيراد ملف Excel…" : "Importing Excel…");
      const result = await importWorkbookToSystem(file, "orders", "merge");
      setExcelStatus(importStatusMessage(result, ar));
      if (!result.empty) setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      setExcelStatus(`❌ ${err?.message || (ar ? "تعذر استيراد Excel." : "Could not import Excel.")}`);
    }
  };

  return (
    <Card className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{ar ? "سجل المبيعات" : "Sales history"}</h2>
          <p className="text-xs text-slate-400">{ar ? "أصبح سجل المبيعات داخل نقطة البيع." : "Sales records are now inside POS."}</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button variant="secondary" onClick={exportSalesExcel}>{ar ? "تصدير Excel" : "Export Excel"}</Button>
          <label className="cursor-pointer rounded-lg bg-slate-100 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
            {ar ? "استيراد Excel" : "Import Excel"}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importSalesExcel} />
          </label>
        </div>
      </div>

      {excelStatus && <Card className="mb-3 text-sm text-slate-600">{excelStatus}</Card>}

      <div className="mb-3 flex flex-wrap gap-2 no-print">
        <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm flex-1" />
        <Select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className="max-w-[150px]">
          <option value="all">{ar ? "كل الفترات" : "All"}</option>
          <option value="today">{ar ? "اليوم" : "Today"}</option>
          <option value="week">{ar ? "آخر أسبوع" : "Last week"}</option>
          <option value="month">{ar ? "آخر شهر" : "Last month"}</option>
          <option value="year">{ar ? "آخر سنة" : "Last year"}</option>
        </Select>
        <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="max-w-[150px]">
          <option value="">{ar ? "كل طرق الدفع" : "All payments"}</option>
          <option value="cash">{t("pos_cash")}</option>
          <option value="card">{t("pos_card")}</option>
          <option value="transfer">{t("pos_transfer")}</option>
          <option value="partial">{t("pos_partial")}</option>
          <option value="credit">{t("pos_credit")}</option>
          <option value="tabby">Tabby</option>
          <option value="tamara">Tamara</option>
        </Select>
      </div>

      <Table headers={[t("history_invoice"), t("customer"), t("type"), t("date"), t("total"), t("status"), ""]}>
        {filtered.map((order) => (
          <tr key={order.id} className="border-b border-slate-100">
            <td className="px-2 py-2 font-medium">{order.invoiceNumber}</td>
            <td className="px-2 py-2">{order.customerName}</td>
            <td className="px-2 py-2">{invoiceTypeLabel(order.type, ar)}</td>
            <td className="px-2 py-2 text-xs">{new Date(order.date).toLocaleDateString(ar ? "ar-SA" : "en-US")}</td>
            <td className="px-2 py-2">{order.grandTotal.toFixed(2)} {settings.currency}</td>
            <td className="px-2 py-2">{invoiceStatusLabel(order.status, ar)}</td>
            <td className="px-2 py-2 text-right">
              <div className="flex flex-wrap justify-end gap-2">
                {order.status !== "deleted" && (
                  <>
                    <button className="text-brand-600 hover:underline" onClick={() => setSelectedOrder(order)}>{ar ? "عرض" : "View"}</button>
                    <button className="text-green-600 hover:underline" onClick={() => sendInvoiceWhatsApp(order)}>{ar ? "إرسال" : "Send"}</button>
                    <button className="text-blue-600 hover:underline" onClick={() => printAndSend(order)}>{ar ? "طباعة وإرسال" : "Print & send"}</button>
                    <button className="text-red-600 hover:underline" onClick={() => remove(order.id)}>{t("delete")}</button>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {filtered.length === 0 && <p className="mt-3 text-sm text-slate-400">{t("history_no_sales")}</p>}

      <Modal open={!!selectedOrder} onClose={() => setSelectedOrder(null)} title={selectedOrder ? `${ar ? "فاتورة" : "Invoice"} ${selectedOrder.invoiceNumber}` : ""}>
        {selectedOrder && (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-end gap-2 no-print">
              <Button variant="secondary" onClick={() => window.print()}>{ar ? "طباعة" : "Print"}</Button>
              <Button variant="secondary" onClick={() => sendInvoiceWhatsApp(selectedOrder)}>{ar ? "إرسال واتساب" : "Send WhatsApp"}</Button>
              <Button onClick={() => printAndSend(selectedOrder)}>{ar ? "طباعة وإرسال" : "Print & send"}</Button>
            </div>
            <div className="overflow-x-auto">
              <InvoicePrint order={selectedOrder} settings={settings} customer={customerFor(selectedOrder)} />
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
