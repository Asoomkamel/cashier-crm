"use client";

import React from "react";
import { AppSettings, Expense, Order, ServiceOrder, TechFinancialLog, TechInventoryItem } from "@/lib/types";
import { serviceOrderStatusLabel } from "@/lib/serviceOrderLabels";

function money(value: number, currency: string) {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function dateLabel(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ar-SA");
}

export default function PrintTechnicianStatement({
  technicianName,
  orders,
  serviceOrders,
  expenses,
  financialLogs,
  inventoryItems,
  settings,
}: {
  technicianName: string;
  orders: Order[];
  serviceOrders: ServiceOrder[];
  expenses: Expense[];
  financialLogs: TechFinancialLog[];
  inventoryItems: TechInventoryItem[];
  settings: AppSettings;
}) {
  const totalRevenue = orders.reduce((sum, order) => sum + (order.type === "return_invoice" ? -order.grandTotal : order.grandTotal), 0);
  const totalCommission = orders.reduce((sum, order) => sum + (order.technicianCommission || 0), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0) + financialLogs.filter((log) => log.type === "expense" || log.type === "advance").reduce((sum, log) => sum + log.amount, 0);
  const settlements = financialLogs.filter((log) => log.type === "settlement").reduce((sum, log) => sum + log.amount, 0);
  const netBalance = totalCommission + settlements - totalExpenses;

  return (
    <div dir="rtl" className="bg-white p-8 text-black">
      <div className="mb-6 flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div>
          <h1 className="text-xl font-bold">{settings.companyHeader?.name || "الشركة"}</h1>
          <p className="text-sm">الرقم الضريبي: {settings.companyHeader?.taxNumber || "-"}</p>
          <p className="text-sm">الهاتف: {settings.companyHeader?.phone || "-"}</p>
        </div>
        <div className="text-left">
          <h2 className="text-2xl font-bold">كشف حساب فني</h2>
          <p className="text-sm">تاريخ الطباعة: {new Date().toLocaleString("ar-SA")}</p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-slate-300 bg-slate-50 p-4">
        <h3 className="text-lg font-bold">{technicianName}</h3>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-3">
        <div className="rounded border p-3 text-center"><div className="text-xs text-slate-500">إجمالي الإيرادات</div><div className="text-lg font-bold">{money(totalRevenue, settings.currency)}</div></div>
        <div className="rounded border p-3 text-center"><div className="text-xs text-slate-500">إجمالي العمولة</div><div className="text-lg font-bold">{money(totalCommission, settings.currency)}</div></div>
        <div className="rounded border p-3 text-center"><div className="text-xs text-slate-500">المصروفات/السلف</div><div className="text-lg font-bold">{money(totalExpenses, settings.currency)}</div></div>
        <div className="rounded border p-3 text-center"><div className="text-xs text-slate-500">صافي الفني</div><div className="text-lg font-bold">{money(netBalance, settings.currency)}</div></div>
      </div>

      <h3 className="mb-2 font-bold">المبيعات والعمولات</h3>
      <table className="mb-6 w-full border-collapse text-sm">
        <thead><tr className="bg-slate-100"><th className="border p-2">التاريخ</th><th className="border p-2">الفاتورة</th><th className="border p-2">العميل</th><th className="border p-2">الإيراد</th><th className="border p-2">العمولة</th></tr></thead>
        <tbody>
          {orders.length === 0 ? <tr><td className="border p-3 text-center" colSpan={5}>لا توجد مبيعات</td></tr> : orders.map((order) => (
            <tr key={order.id}><td className="border p-2">{dateLabel(order.date)}</td><td className="border p-2">{order.invoiceNumber}</td><td className="border p-2">{order.customerName}</td><td className="border p-2">{money(order.grandTotal, settings.currency)}</td><td className="border p-2">{money(order.technicianCommission || 0, settings.currency)}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-2 font-bold">عمليات الصيانة</h3>
      <table className="mb-6 w-full border-collapse text-sm">
        <thead><tr className="bg-slate-100"><th className="border p-2">التاريخ</th><th className="border p-2">رقم الطلب</th><th className="border p-2">العميل</th><th className="border p-2">التفاصيل</th><th className="border p-2">الحالة</th></tr></thead>
        <tbody>
          {serviceOrders.length === 0 ? <tr><td className="border p-3 text-center" colSpan={5}>لا توجد عمليات</td></tr> : serviceOrders.map((order) => (
            <tr key={order.id}><td className="border p-2">{dateLabel(order.date || order.createdAt)}</td><td className="border p-2">{order.requestNumber}</td><td className="border p-2">{order.customerName}</td><td className="border p-2">{order.issue || order.serviceDescription || "-"}</td><td className="border p-2">{serviceOrderStatusLabel(order.status, "ar")}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-2 font-bold">المصروفات والحركات المالية</h3>
      <table className="mb-6 w-full border-collapse text-sm">
        <thead><tr className="bg-slate-100"><th className="border p-2">التاريخ</th><th className="border p-2">التصنيف</th><th className="border p-2">البيان</th><th className="border p-2">المبلغ</th></tr></thead>
        <tbody>
          {expenses.map((expense) => <tr key={expense.id}><td className="border p-2">{dateLabel(expense.date)}</td><td className="border p-2">{expense.category}</td><td className="border p-2">{expense.description}</td><td className="border p-2">{money(expense.amount, settings.currency)}</td></tr>)}
          {financialLogs.map((log) => <tr key={log.id}><td className="border p-2">{dateLabel(log.date)}</td><td className="border p-2">{log.type}</td><td className="border p-2">{log.notes || "-"}</td><td className="border p-2">{money(log.amount, settings.currency)}</td></tr>)}
          {expenses.length + financialLogs.length === 0 && <tr><td className="border p-3 text-center" colSpan={4}>لا توجد مصروفات</td></tr>}
        </tbody>
      </table>

      <h3 className="mb-2 font-bold">العهدة / المنتجات الموجودة مع الفني</h3>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="bg-slate-100"><th className="border p-2">المنتج</th><th className="border p-2">الكمية</th></tr></thead>
        <tbody>
          {inventoryItems.filter((item) => item.qty > 0).length === 0 ? <tr><td className="border p-3 text-center" colSpan={2}>لا توجد عهدة</td></tr> : inventoryItems.filter((item) => item.qty > 0).map((item) => <tr key={item.id}><td className="border p-2">{item.itemName}</td><td className="border p-2">{item.qty}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
