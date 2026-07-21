import React, { useEffect } from "react";
import { Order } from "../types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PrintTechnicianStatementProps {
  technicianName: string;
  orders: Order[];
  expenses: any[];
  serviceOrders?: any[];
  inventoryItems?: any[];
  catalog?: any[];
  companyHeader: any;
}

export default function PrintTechnicianStatement({
  technicianName,
  orders,
  expenses,
  serviceOrders,
  inventoryItems,
  catalog,
  companyHeader,
}: PrintTechnicianStatementProps) {
  useEffect(() => {
    // Inject print styles
    const style = document.createElement("style");
    style.innerHTML = `
      @page { size: A4 portrait; margin: 15mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; color: black !important; font-family: 'Inter', sans-serif; }
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        * { color: black !important; text-shadow: none !important; box-shadow: none !important; border-color: #ddd !important; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const totalCommission = orders.reduce((sum, o) => sum + (o.technicianCommission || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  return (
    <div className="hidden print:block fixed inset-0 bg-white z-[9999] text-black w-full min-h-screen p-8 text-black" dir="rtl">
      <div className="flex justify-between items-start mb-8 border-b-2 border-black pb-4">
        <div>
          <h1 className="text-3xl font-black mb-2">{companyHeader?.name || "اسم الشركة"}</h1>
          {companyHeader?.taxNumber && <p className="text-sm font-bold">الرقم الضريبي: {companyHeader.taxNumber}</p>}
          <p className="text-sm whitespace-pre-wrap">{companyHeader?.address}</p>
          <p className="text-sm">الجوال: {companyHeader?.phone}</p>
        </div>
        {companyHeader?.logoUrl ? (
          <img
            src={companyHeader.logoUrl}
            alt="Logo"
            className="w-24 h-24 object-contain"
          />
        ) : (
          <div className="w-24 h-24 bg-gray-100 flex items-center justify-center font-bold text-gray-400">
            شعار
          </div>
        )}
      </div>

      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold border-2 border-black inline-block px-6 py-2 rounded-lg bg-gray-50">
          كشف حساب فني
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-4 rounded-lg bg-gray-50 border border-black/20">
          <p className="text-gray-600 text-sm mb-1">اسم الفني</p>
          <p className="font-bold text-xl text-indigo-700">{technicianName}</p>
        </div>
        <div className="p-4 rounded-lg bg-gray-50 border border-black/20 text-left">
          <p className="text-gray-600 text-sm mb-1">تاريخ الإصدار</p>
          <p className="font-bold text-lg">{new Date().toLocaleString("ar-SA")}</p>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="font-bold text-lg mb-2 text-indigo-800 border-b border-indigo-200 pb-2">طلبات البيع والعمولات</h3>
        {orders.length > 0 ? (
          <Table className="w-full text-sm mt-4 border border-black/20">
            <TableHeader className="bg-gray-100">
              <TableRow className="border-black/20 font-bold">
                <TableHead className="text-right text-black font-bold">التاريخ</TableHead>
                <TableHead className="text-right text-black font-bold">رقم الطلب</TableHead>
                <TableHead className="text-right text-black font-bold">العميل</TableHead>
                <TableHead className="text-right text-black font-bold">قيمة الطلب</TableHead>
                <TableHead className="text-left text-black font-bold">قيمة العمولة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.sort((a,b)=>b.date-a.date).map((o, i) => (
                <TableRow key={i} className="border-black/10 text-black">
                  <TableCell>{new Date(o.date).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell>{o.id}</TableCell>
                  <TableCell>{o.customerName}</TableCell>
                  <TableCell>{(o.grandTotal || 0).toLocaleString()} ر.س</TableCell>
                  <TableCell className="text-left font-bold text-green-700">{(o.technicianCommission || 0).toLocaleString()} ر.س</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center py-4 bg-gray-50 border border-gray-200 rounded text-gray-500">لا توجد طلبات مبيعات</p>
        )}
      </div>

      <div className="mb-8">
        <h3 className="font-bold text-lg mb-2 text-indigo-800 border-b border-indigo-200 pb-2">عمليات الصيانة والمواعيد</h3>
        {serviceOrders && serviceOrders.length > 0 ? (
          <Table className="w-full text-sm mt-4 border border-black/20">
            <TableHeader className="bg-blue-50">
              <TableRow className="border-black/20 font-bold">
                <TableHead className="text-right text-black font-bold">التاريخ</TableHead>
                <TableHead className="text-right text-black font-bold">رقم العملية</TableHead>
                <TableHead className="text-right text-black font-bold">العميل</TableHead>
                <TableHead className="text-right text-black font-bold">المشكلة/الطلب</TableHead>
                <TableHead className="text-left text-black font-bold">تكلفة العملية</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceOrders.sort((a,b)=> (b.createdAt||b.date) - (a.createdAt||a.date)).map((o, i) => (
                <TableRow key={i} className="border-black/10 text-black">
                  <TableCell>{new Date(o.createdAt || o.date).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell>{o.requestNumber || o.id.toString().substring(0,6)}</TableCell>
                  <TableCell>{o.customerName}</TableCell>
                  <TableCell>{o.issue}</TableCell>
                  <TableCell className="text-left font-bold text-blue-700">{(o.expectedAmount || 0).toLocaleString()} ر.س</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center py-4 bg-gray-50 border border-gray-200 rounded text-gray-500">لا توجد عمليات صيانة</p>
        )}
      </div>

      <div className="mb-8">
        <h3 className="font-bold text-lg mb-2 text-indigo-800 border-b border-indigo-200 pb-2">المصروفات والسلف</h3>
        {expenses.length > 0 ? (
          <Table className="w-full text-sm mt-4 border border-black/20">
            <TableHeader className="bg-red-50">
              <TableRow className="border-black/20">
                <TableHead className="text-right text-black font-bold">التاريخ</TableHead>
                <TableHead className="text-right text-black font-bold">التصنيف</TableHead>
                <TableHead className="text-right text-black font-bold">البيان</TableHead>
                <TableHead className="text-left text-black font-bold">المبلغ المدفوع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.sort((a,b)=>b.date-a.date).map((e, i) => (
                <TableRow key={i} className="border-black/10 text-black">
                  <TableCell>{new Date(e.date).toLocaleDateString("ar-SA")}</TableCell>
                  <TableCell>{e.category}</TableCell>
                  <TableCell>{e.title}</TableCell>
                  <TableCell className="text-left font-bold text-red-700">{e.amount.toLocaleString()} ر.س</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center py-4 bg-gray-50 border border-gray-200 rounded text-gray-500">لا توجد مصروفات أو مسحوبات مسجلة</p>
        )}
      </div>

      <div className="mb-8 block">
        <h3 className="font-bold text-lg mb-2 text-indigo-800 border-b border-indigo-200 pb-2">المنتجات الموجودة كعهدة</h3>
        {inventoryItems && inventoryItems.filter(i => i.qty > 0).length > 0 ? (
          <Table className="w-full text-sm mt-4 border border-black/20">
            <TableHeader className="bg-orange-50">
              <TableRow className="border-black/20">
                <TableHead className="text-right text-black font-bold">المنتج / الصنف</TableHead>
                <TableHead className="text-right text-black font-bold">الكمية الموجودة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventoryItems.filter((i: any) => i.qty > 0).map((item: any, idx: number) => {
                const catalogItem = catalog?.find((c: any) => c.id === item.catalogId);
                return (
                  <TableRow key={idx} className="border-black/10 text-black">
                    <TableCell>{catalogItem?.name || item.catalogId}</TableCell>
                    <TableCell className="font-bold">{item.qty}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center py-4 bg-gray-50 border border-gray-200 rounded text-gray-500">لا توجد منتجات مسجلة في عهدة الفني</p>
        )}
      </div>

      <div className="mt-8 border-t-2 border-black pt-4 grid grid-cols-2 gap-4 text-black">
        <div></div>
        <div className="space-y-2 text-xl bg-gray-50 p-4 rounded-lg border border-black/20">
          <div className="flex justify-between font-bold text-green-800">
            <span>إجمالي العمولات المستحقة:</span>
            <span>{totalCommission.toLocaleString()} ر.س</span>
          </div>
          <div className="flex justify-between font-bold text-red-800">
            <span>إجمالي المنصرف (خصميا):</span>
            <span>{totalExpenses.toLocaleString()} ر.س</span>
          </div>
          <div className="flex justify-between font-black border-t border-black/20 pt-2 mt-2">
            <span>الرصيد الصافي المتبقي:</span>
            <span className={totalCommission - totalExpenses >= 0 ? 'text-green-600' : 'text-red-600'}>
              {(totalCommission - totalExpenses).toLocaleString()} ر.س
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
