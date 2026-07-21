"use client";

import React from "react";
import { AppSettings, Customer, Order, ServiceOrder } from "@/lib/types";
import { serviceOrderStatusLabel } from "@/lib/serviceOrderLabels";

function money(value: number, currency: string) {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function dateLabel(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ar-SA");
}

export default function PrintCustomerStatement({
  customer,
  orders,
  serviceOrders,
  settings,
}: {
  customer: Customer;
  orders: Order[];
  serviceOrders: ServiceOrder[];
  settings: AppSettings;
}) {
  const totalSales = orders.reduce((sum, order) => sum + (order.type === "return_invoice" ? -order.grandTotal : order.grandTotal), 0);
  const totalRemaining = orders.reduce((sum, order) => sum + (order.remainingAmount || 0), 0);
  const products = new Map<string, number>();
  orders.forEach((order) => {
    order.items.forEach((item) => products.set(item.name, (products.get(item.name) || 0) + item.qty));
  });

  return (
    <div dir="rtl" className="bg-white p-8 text-black">
      <div className="mb-6 flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div>
          <h1 className="text-xl font-bold">{settings.companyHeader?.name || "الشركة"}</h1>
          <p className="text-sm">الرقم الضريبي: {settings.companyHeader?.taxNumber || "-"}</p>
          <p className="text-sm">الهاتف: {settings.companyHeader?.phone || "-"}</p>
        </div>
        <div className="text-left">
          <h2 className="text-2xl font-bold">كشف حساب عميل</h2>
          <p className="text-sm">تاريخ الطباعة: {new Date().toLocaleString("ar-SA")}</p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-slate-300 bg-slate-50 p-4">
        <h3 className="text-lg font-bold">{customer.name}</h3>
        <p>الجوال: {customer.phone || "-"}</p>
        {customer.companyName && <p>الشركة: {customer.companyName}</p>}
        {customer.taxNumber && <p>الرقم الضريبي: {customer.taxNumber}</p>}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded border p-3 text-center"><div className="text-xs text-slate-500">عدد الفواتير</div><div className="text-xl font-bold">{orders.length}</div></div>
        <div className="rounded border p-3 text-center"><div className="text-xs text-slate-500">إجمالي المشتريات</div><div className="text-xl font-bold">{money(totalSales, settings.currency)}</div></div>
        <div className="rounded border p-3 text-center"><div className="text-xs text-slate-500">الرصيد المتبقي</div><div className="text-xl font-bold">{money(totalRemaining, settings.currency)}</div></div>
      </div>

      <h3 className="mb-2 font-bold">الفواتير</h3>
      <table className="mb-6 w-full border-collapse text-sm">
        <thead><tr className="bg-slate-100"><th className="border p-2">التاريخ</th><th className="border p-2">رقم الفاتورة</th><th className="border p-2">النوع</th><th className="border p-2">الإجمالي</th><th className="border p-2">المتبقي</th></tr></thead>
        <tbody>
          {orders.length === 0 ? <tr><td className="border p-3 text-center" colSpan={5}>لا توجد فواتير</td></tr> : orders.map((order) => (
            <tr key={order.id}><td className="border p-2">{dateLabel(order.date)}</td><td className="border p-2">{order.invoiceNumber}</td><td className="border p-2">{order.type}</td><td className="border p-2">{money(order.grandTotal, settings.currency)}</td><td className="border p-2">{money(order.remainingAmount || 0, settings.currency)}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-2 font-bold">طلبات الصيانة والخدمة</h3>
      <table className="mb-6 w-full border-collapse text-sm">
        <thead><tr className="bg-slate-100"><th className="border p-2">التاريخ</th><th className="border p-2">رقم الطلب</th><th className="border p-2">الفني</th><th className="border p-2">التفاصيل</th><th className="border p-2">الحالة</th></tr></thead>
        <tbody>
          {serviceOrders.length === 0 ? <tr><td className="border p-3 text-center" colSpan={5}>لا توجد طلبات صيانة</td></tr> : serviceOrders.map((order) => (
            <tr key={order.id}><td className="border p-2">{dateLabel(order.date || order.createdAt)}</td><td className="border p-2">{order.requestNumber}</td><td className="border p-2">{order.acceptedByTechnicianName || order.technicianName || "-"}</td><td className="border p-2">{order.issue || order.serviceDescription || "-"}</td><td className="border p-2">{serviceOrderStatusLabel(order.status, "ar")}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-2 font-bold">المنتجات المطلوبة سابقًا</h3>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="bg-slate-100"><th className="border p-2">المنتج</th><th className="border p-2">الكمية</th></tr></thead>
        <tbody>
          {Array.from(products.entries()).length === 0 ? <tr><td className="border p-3 text-center" colSpan={2}>لا توجد منتجات</td></tr> : Array.from(products.entries()).map(([name, qty]) => <tr key={name}><td className="border p-2">{name}</td><td className="border p-2">{qty}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
