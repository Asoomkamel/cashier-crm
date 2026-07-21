import { AppSettings, PurchaseInvoice, Vendor } from "../types";

interface PrintVendorReceiptProps {
  invoice: PurchaseInvoice;
  vendor: Vendor;
  settings: AppSettings;
  paymentAmount: number;
  paymentDate: number;
  previewMode?: boolean;
}

export default function PrintVendorReceipt({
  invoice,
  vendor,
  settings,
  paymentAmount,
  paymentDate,
  previewMode = false,
}: PrintVendorReceiptProps) {
  const { companyHeader } = settings;
  const newRemaining = (invoice.remainingAmount || 0) - paymentAmount;

  return (
    <div
      id="print-vendor-receipt-container"
      className={`${
        previewMode
          ? "print-preview origin-top-center w-[148mm] min-h-[210mm] mx-auto shadow-xl scale-90 lg:scale-100 flex flex-col overflow-hidden"
          : "hidden print:flex print:absolute print:left-0 print:top-0 print:right-0 print:bg-white print:text-black print:z-50 flex-col w-[100%]"
      } print-container text-black bg-white dir-rtl`}
      style={{ direction: "rtl", padding: "30px" }}
    >
      <style>{`
        @media print {
          @page { size: A5 portrait; margin: 0; }
        }
      `}</style>

      {/* Header section */}
      <div className="flex justify-between items-start mb-8 border-b-2 border-gray-800 pb-4">
        <div className="w-1/2">
          <h1 className="font-bold text-xl mb-1">
            {companyHeader?.name || "اسم الشركة غير مسجل"}
          </h1>
          <p className="text-sm text-gray-700">
            الرقم الضريبي: {companyHeader?.taxNumber || "-"}
          </p>
          <p className="text-sm text-gray-700">
            هاتف: {companyHeader?.phone || "-"}
          </p>
        </div>

        <div className="w-1/2 flex justify-end">
          {companyHeader?.logoUrl ? (
            <img
              src={companyHeader.logoUrl}
              alt="Logo"
              className="max-h-16 max-w-[150px] object-contain"
            />
          ) : (
            <div className="text-center font-bold text-gray-400">
              شعار الشركة
            </div>
          )}
        </div>
      </div>

      <div className="text-center mb-6">
        <h2 className="font-bold text-2xl text-green-800 inline-block px-4 py-1 border-2 border-green-800 rounded">
          سند صرف / دفع للمورد
        </h2>
        <p className="mt-2 text-sm">
          التاريخ: {new Date(paymentDate).toLocaleDateString("ar-SA")}
        </p>
        <p className="text-sm mt-1">
          الوقت:{" "}
          {new Date(paymentDate).toLocaleTimeString("ar-SA", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}
        </p>
      </div>

      <div className="mb-6 space-y-3">
        <div className="flex bg-gray-50 border border-gray-200 p-3 rounded">
          <span className="w-32 font-bold text-gray-700">
            استلمنا من السادة:
          </span>
          <span className="font-bold">{vendor.companyName || vendor.name}</span>
        </div>

        <div className="flex bg-gray-50 border border-gray-200 p-3 rounded">
          <span className="w-32 font-bold text-gray-700">مبلغاً وقدره:</span>
          <span className="font-bold text-lg">
            {paymentAmount.toLocaleString()} ريال سعودي
          </span>
        </div>

        <div className="flex bg-gray-50 border border-gray-200 p-3 rounded">
          <span className="w-32 font-bold text-gray-700">وذلك عن:</span>
          <span>
            سداد دفعة من فاتورة المشتريات رقم (
            {invoice.referenceNumber || invoice.id})
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="border border-gray-300 p-3 text-center rounded bg-gray-100">
          <p className="text-sm text-gray-500 mb-1">إجمالي الفاتورة</p>
          <p className="font-bold text-lg">
            {invoice.grandTotal.toLocaleString()} ر.س
          </p>
        </div>
        <div className="border border-gray-300 p-3 text-center rounded bg-gray-100">
          <p className="text-sm text-gray-500 mb-1">المتبقي على الفاتورة</p>
          <p className="font-bold text-lg text-red-600">
            {Math.max(0, newRemaining).toLocaleString()} ر.س
          </p>
        </div>
      </div>

      <div className="mt-16 flex justify-between text-center pt-8 border-t border-gray-200">
        <div className="w-1/2">
          <p className="mb-8 font-bold">المورد / المستلم</p>
          <p>_______________________</p>
        </div>
        <div className="w-1/2">
          <p className="mb-8 font-bold">توقيع المحاسب</p>
          <p>_______________________</p>
        </div>
      </div>
    </div>
  );
}
