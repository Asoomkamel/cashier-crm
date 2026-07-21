import { Customer, Order, AppSettings } from "../types";
import { ReceiptText, MapPin } from "lucide-react";

interface PrintCustomerStatementProps {
  customer: Customer;
  orders: Order[];
  techOrders: any[];
  settings: AppSettings;
  previewMode?: boolean;
}

export default function PrintCustomerStatement({
  customer,
  orders,
  techOrders,
  settings,
  previewMode = false,
}: PrintCustomerStatementProps) {
  const { companyHeader, offsets = {} } = settings;

  const totalSales = orders.reduce((sum, o) => sum + o.grandTotal, 0);
  const totalRemaining = orders.reduce(
    (sum, o) => sum + (o.remainingAmount || 0),
    0,
  );

  return (
    <div
      id="print-statement-container"
      className={`${
        previewMode
          ? "print-preview origin-top-center w-[210mm] min-h-[297mm] mx-auto shadow-xl scale-75 md:scale-90 lg:scale-100 flex flex-col overflow-hidden"
          : "hidden print:flex print:absolute print:left-0 print:top-0 print:right-0 print:bg-white print:text-black print:z-50 flex-col w-[100%]"
      } print-container text-black bg-white dir-rtl`}
      style={{ direction: "rtl", padding: "40px" }}
    >
      <style>{`
        @media print {
          @page { size: auto; margin: 0; }
        }
      `}</style>

      {/* Header section */}
      <div className="flex justify-between items-start mb-6">
        <div className="w-1/3">
          <h1 className="font-bold text-xl">
            {companyHeader?.name || "اسم الشركة غير مسجل"}
          </h1>
          <p className="text-sm">
            الرقم الضريبي: {companyHeader?.taxNumber || "-"}
          </p>
          <p className="text-sm">هاتف: {companyHeader?.phone || "-"}</p>
        </div>

        <div className="w-1/3 flex flex-col items-center">
          {companyHeader?.logoUrl ? (
            <img
              src={companyHeader.logoUrl}
              alt="Logo"
              className="max-h-20 max-w-[200px] object-contain"
            />
          ) : (
            <div className="text-center font-bold text-gray-400">
              شعار الشركة
            </div>
          )}
        </div>

        <div className="w-1/3 text-left">
          <h2 className="font-bold text-2xl text-blue-900 border-b-2 border-blue-900 pb-1 mb-2 inline-block">
            كشف حساب عميل
          </h2>
          <p className="text-sm">
            تاريخ الطباعة: {new Date().toLocaleDateString("ar-SA")}
          </p>
        </div>
      </div>

      {/* Customer Info Box */}
      <div className="border-2 border-gray-200 rounded-lg p-4 mb-6 bg-gray-50 flex justify-between">
        <div>
          <h3 className="font-bold text-lg mb-1">{customer.name}</h3>
          <p className="text-sm text-gray-700">الجوال: {customer.phone}</p>
          {customer.taxNumber && (
            <p className="text-sm text-gray-700">
              الرقم الضريبي: {customer.taxNumber}
            </p>
          )}
        </div>
        <div className="text-left bg-white p-2 border border-gray-200 rounded text-center min-w-32">
          <p className="text-xs text-gray-500 mb-1">عدد الفواتير</p>
          <p className="font-bold text-xl">{orders.length}</p>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex-1 border p-3 text-center border-green-200 bg-green-50 rounded">
          <p className="text-xs text-green-700 font-bold mb-1">
            إجمالي المشتريات
          </p>
          <p className="font-bold text-lg">{totalSales.toLocaleString()} ر.س</p>
        </div>
        <div className="flex-1 border p-3 text-center border-orange-200 bg-orange-50 rounded">
          <p className="text-xs text-orange-700 font-bold mb-1">
            إجمالي المتأخرات (آجل)
          </p>
          <p className="font-bold text-lg">
            {totalRemaining.toLocaleString()} ر.س
          </p>
        </div>
        <div className="flex-1 border p-3 text-center border-blue-200 bg-blue-50 rounded">
          <p className="text-xs text-blue-700 font-bold mb-1">صافي المدفوع</p>
          <p className="font-bold text-lg">
            {(totalSales - totalRemaining).toLocaleString()} ر.س
          </p>
        </div>
      </div>

      {/* Table of Orders */}
      <h3 className="font-bold text-lg border-b border-gray-300 pb-2 mb-4 mt-6">
        تفاصيل الفواتير:
      </h3>
      {orders.length > 0 ? (
        <table className="w-full mb-8" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-black p-2 text-right">
                رقم الفاتورة
              </th>
              <th className="border border-black p-2 text-right">التاريخ</th>
              <th className="border border-black p-2 text-right">
                الأصناف (تفصيل الخدمة/جهاز جديد)
              </th>
              <th className="border border-black p-2 text-center">
                إجمالي الفاتورة
              </th>
              <th className="border border-black p-2 text-center">
                المتبقي (آجل)
              </th>
            </tr>
          </thead>
          <tbody>
            {orders
              .sort((a, b) => a.date - b.date)
              .map((order, idx) => (
                <tr key={idx}>
                  <td className="border border-black p-2 font-bold">
                    {order.id}
                  </td>
                  <td className="border border-black p-2">
                    {new Date(order.date).toLocaleDateString("ar-SA")}
                  </td>
                  <td className="border border-black p-2 text-sm text-gray-700">
                    {order.items.map((i) => `${i.name} (x${i.qty})`).join("، ")}
                  </td>
                  <td className="border border-black p-2 text-center font-bold">
                    {order.grandTotal.toLocaleString()}
                  </td>
                  <td className="border border-black p-2 text-center text-orange-600 font-bold">
                    {order.remainingAmount
                      ? order.remainingAmount.toLocaleString()
                      : "0"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      ) : (
        <p className="text-center text-gray-500 my-8">لا توجد فواتير للعميل</p>
      )}

      {techOrders && techOrders.length > 0 && (
        <>
          <h3 className="font-bold text-lg border-b border-gray-300 pb-2 mb-4 mt-6">
            سجل زيارات الفنيين والصيانة:
          </h3>
          <table className="w-full mb-8" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black p-2 text-right">تاريخ الزيارة</th>
                <th className="border border-black p-2 text-right">
                  المشكلة / الطلب
                </th>
                <th className="border border-black p-2 text-right">
                  المنتجات (ايش أخذ)
                </th>
                <th className="border border-black p-2 text-right">الفني</th>
                <th className="border border-black p-2 text-center">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {techOrders
                .sort((a, b) => a.date - b.date)
                .map((to, idx) => {
                  return (
                    <tr key={idx}>
                      <td className="border border-black p-2 whitespace-nowrap">
                        {new Date(to.date || to.createdAt).toLocaleDateString("ar-SA")}
                      </td>
                      <td className="border border-black p-2">{to.issue || to.requestType}</td>
                      <td className="border border-black p-2 text-sm text-gray-700">
                        {to.selectedProducts?.map((p: any) => p.name).join("، ") || "-"}
                      </td>
                      <td className="border border-black p-2">{to.technicianName || "غير محدد"}</td>
                      <td className="border border-black p-2 text-center">{to.expectedAmount ? `${to.expectedAmount} ر.س` : "-"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </>
      )}

      <div className="mt-16 flex justify-between text-center pt-8 border-t border-gray-200">
        <div className="w-1/3">
          <p className="mb-8 font-bold">توقيع العميل</p>
          <p>_______________________</p>
        </div>
        <div className="w-1/3">
          <p className="mb-8 font-bold">توقيع المحاسب / الإدارة</p>
          <p>_______________________</p>
        </div>
      </div>
    </div>
  );
}
