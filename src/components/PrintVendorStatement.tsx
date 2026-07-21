import { PurchaseInvoice, Vendor, AppSettings } from "../types";

interface PrintVendorStatementProps {
  vendor: Vendor;
  invoices: PurchaseInvoice[];
  settings: AppSettings;
  previewMode?: boolean;
}

export default function PrintVendorStatement({
  vendor,
  invoices,
  settings,
  previewMode = false,
}: PrintVendorStatementProps) {
  const { companyHeader } = settings;

  const totalPurchases = invoices.reduce((sum, v) => sum + v.grandTotal, 0);
  const totalPaid = invoices.reduce((sum, v) => sum + (v.paidAmount || 0), 0);
  const totalRemaining = invoices.reduce(
    (sum, v) => sum + (v.remainingAmount || 0),
    0,
  );

  return (
    <div
      id="print-vendor-statement-container"
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
          <h2 className="font-bold text-2xl text-orange-900 border-b-2 border-orange-900 pb-1 mb-2 inline-block">
            كشف حساب مورد
          </h2>
          <p className="text-sm">
            تاريخ الطباعة: {new Date().toLocaleDateString("ar-SA")}
          </p>
        </div>
      </div>

      {/* Vendor Info Box */}
      <div className="border-2 border-gray-200 rounded-lg p-4 mb-6 bg-gray-50 flex justify-between">
        <div>
          <h3 className="font-bold text-lg mb-1">
            {vendor.companyName || vendor.name}
          </h3>
          {vendor.companyName && (
            <p className="text-sm text-gray-700">المسؤول: {vendor.name}</p>
          )}
          <p className="text-sm text-gray-700">الجوال: {vendor.phone}</p>
          {vendor.taxNumber && (
            <p className="text-sm text-gray-700">
              الرقم الضريبي: {vendor.taxNumber}
            </p>
          )}
        </div>
        <div className="text-left bg-white p-2 border border-gray-200 rounded text-center min-w-32">
          <p className="text-xs text-gray-500 mb-1">عدد الفواتير</p>
          <p className="font-bold text-xl">{invoices.length}</p>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex-1 border p-3 text-center border-purple-200 bg-purple-50 rounded">
          <p className="text-xs text-purple-700 font-bold mb-1">
            إجمالي المشتريات
          </p>
          <p className="font-bold text-lg">
            {totalPurchases.toLocaleString()} ر.س
          </p>
        </div>
        <div className="flex-1 border p-3 text-center border-green-200 bg-green-50 rounded">
          <p className="text-xs text-green-700 font-bold mb-1">
            إجمالي المدفوع
          </p>
          <p className="font-bold text-lg">{totalPaid.toLocaleString()} ر.س</p>
        </div>
        <div className="flex-1 border p-3 text-center border-orange-200 bg-orange-50 rounded">
          <p className="text-xs text-orange-700 font-bold mb-1">
            صافي المتأخرات (مستحق)
          </p>
          <p className="font-bold text-lg">
            {totalRemaining.toLocaleString()} ر.س
          </p>
        </div>
      </div>

      {/* Table of Invoices */}
      <h3 className="font-bold text-lg border-b border-gray-300 pb-2 mb-4 mt-6">
        تفاصيل العمليات وحركة الحساب:
      </h3>
      {invoices.length > 0 ? (
        <table className="w-full mb-8" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-black p-2 text-right">التاريخ</th>
              <th className="border border-black p-2 text-right">نوع العملية</th>
              <th className="border border-black p-2 text-right">
                رقم الفاتورة (المرجع)
              </th>
              <th className="border border-black p-2 text-center">المدين (مشتريات)</th>
              <th className="border border-black p-2 text-center">الدائن (مدفوع/مرتجع)</th>
              <th className="border border-black p-2 text-center">الرصيد المتبقي (مديونية)</th>
            </tr>
          </thead>
          <tbody>
            {invoices
              .sort((a, b) => a.date - b.date)
              .map((inv, idx) => {
                let dain = inv.paidAmount || 0;
                if (inv.type === "return") {
                  dain += inv.grandTotal;
                }
                const maden = inv.type === "purchase" ? inv.grandTotal : 0;
                
                return (
                  <tr key={idx}>
                    <td className="border border-black p-2">
                      {new Date(inv.date).toLocaleDateString("ar-SA")}
                    </td>
                    <td className="border border-black p-2">
                      {inv.type === "return" ? "مرتجع مشتريات" : "فاتورة مشتريات"}
                    </td>
                    <td className="border border-black p-2 font-bold">
                      {inv.referenceNumber || inv.id || "-"}
                    </td>
                    <td className="border border-black p-2 text-center">
                      {maden > 0 ? maden.toLocaleString() : "-"}
                    </td>
                    <td className="border border-black p-2 text-center text-green-600">
                      {dain > 0 ? dain.toLocaleString() : "-"}
                    </td>
                    <td className="border border-black p-2 text-center text-orange-600 font-bold">
                      {inv.remainingAmount
                        ? inv.remainingAmount.toLocaleString()
                        : "0"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      ) : (
        <p className="text-center text-gray-500 my-8">
          لا توجد فواتير مسجلة للمورد
        </p>
      )}

      <div className="mt-16 flex justify-between text-center pt-8 border-t border-gray-200">
        <div className="w-1/3">
          <p className="mb-8 font-bold">المورد</p>
          <p>_______________________</p>
        </div>
        <div className="w-1/3">
          <p className="mb-8 font-bold">المحاسب / الإدارة</p>
          <p>_______________________</p>
        </div>
      </div>
    </div>
  );
}
