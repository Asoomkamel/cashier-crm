/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QRCodeSVG } from "qrcode.react";
import { AppSettings, Order, Customer } from "../types";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";

interface PrintInvoiceProps {
  order: Order;
  settings: AppSettings;
  previewMode?: boolean;
  customer?: Customer;
}

export default function PrintInvoice({
  order,
  settings,
  previewMode,
  customer,
}: PrintInvoiceProps) {
  const { companyHeader, invoiceOffsets } = settings;
  const offsets = invoiceOffsets || {};

  const getPaymentMethodLabel = (pm: string | undefined) => {
    switch (pm) {
      case "cash":
        return "كاش";
      case "network":
        return "شبكة";
      case "partial":
        return "جزء";
      case "postponed":
        return "تأجل";
      case "tabby":
        return "تابي";
      case "tamara":
        return "تمارا";
      case "transfer":
        return "تحويل بنكي";
      default:
        return pm || "غير محدد";
    }
  };

  const getQRValue = () => {
    return [
      companyHeader.name ? `الشركة: ${companyHeader.name}` : "",
      companyHeader.taxNumber
        ? `الرقم الضريبي: ${companyHeader.taxNumber}`
        : "",
      companyHeader.phone ? `هاتف: ${companyHeader.phone}` : "",
      "--------------------------",
      `رقم الفاتورة: ${order.id}`,
      `نوع المستند: ${order.type === "tax_invoice" ? "فاتورة ضريبية" : order.type === "return_invoice" ? "مرتجع مبيعات" : "عرض سعر"}`,
      `التاريخ: ${new Date(order.date).toLocaleString("ar-SA")}`,
      `العميل: ${order.customerName || "عميل غير مسجل"}`,
      "--------------------------",
      "تفاصيل الفاتورة:",
      ...order.items.map(
        (i) =>
          `- ${i.name}\n  الكمية: ${i.qty} | السعر: ${i.price.toFixed(2)} | الخصم: ${i.discount.toFixed(2)}`,
      ),
      "--------------------------",
      `الإجمالي قبل الضريبة: ${order.totalBeforeTax.toFixed(2)} ريال`,
      `قيمة الضريبة: ${order.totalTax.toFixed(2)} ريال`,
      `الإجمالي شامل الضريبة: ${order.grandTotal.toFixed(2)} ريال`,
    ]
      .filter(Boolean)
      .join("\n");
  };

  return (
    <div
      id="print-invoice-container"
      className={`${previewMode ? "print-preview origin-top-center w-[210mm] min-h-[297mm] mx-auto scale-75 md:scale-90 lg:scale-100 flex flex-col overflow-hidden" : "hidden print:flex print:absolute print:left-0 print:top-0 print:right-0 print:z-50 flex-col w-[100%]"} print-container dir-rtl`}
      style={{
        boxShadow: previewMode
          ? "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
          : "none",
        direction: "rtl",
        backgroundColor: "#ffffff",
        color: "#000000",
        paddingTop: offsets.marginTop ? `${offsets.marginTop}px` : undefined,
        paddingBottom: offsets.marginBottom
          ? `${offsets.marginBottom}px`
          : undefined,
        paddingLeft: offsets.marginLeft ? `${offsets.marginLeft}px` : undefined,
        paddingRight: offsets.marginRight
          ? `${offsets.marginRight}px`
          : undefined,
        fontSize: offsets.fontSizeBase
          ? `${offsets.fontSizeBase}px`
          : undefined,
      }}
    >
      <style>{`
        @media print {
          @page { size: auto; margin: 0; }
        }
      `}</style>
      <div
        className="flex-1 m-4 p-6 flex flex-col pt-0"
        style={{ backgroundColor: "#fff", color: "#000" }}
      >
        {/* Header section with relative positioning offsets */}
        <div className="flex justify-between items-start mb-6">
          {/* Right side - Company Info */}
          <div
            style={{
              transform: `translate(${offsets.companyX || 0}px, ${offsets.companyY || 0}px)`,
            }}
            className="w-1/3"
          >
            <h1
              className="font-bold"
              style={{
                fontSize: offsets.fontSizeHeader
                  ? `${offsets.fontSizeHeader}px`
                  : "1.25rem",
              }}
            >
              {companyHeader.name}
            </h1>
            <p>{companyHeader.address}</p>
            <p>هاتف: {companyHeader.phone}</p>
            <p className="font-bold mt-1">
              الرقم الضريبي:{" "}
              <span className="font-normal">{companyHeader.taxNumber}</span>
            </p>
          </div>

          {/* Center - Logo */}
          <div
            style={{
              transform: `translate(${offsets.logoX || 0}px, ${offsets.logoY || 0}px)`,
            }}
            className="w-1/3 flex justify-center"
          >
            {companyHeader.logoUrl && (
              <img
                src={companyHeader.logoUrl}
                alt="Logo"
                style={{
                  maxHeight: `${offsets.logoSize || 100}px`,
                  objectFit: "contain",
                }}
              />
            )}
          </div>

          {/* Left side - Customer and Invoice Info */}
          <div
            style={{
              transform: `translate(${offsets.customerX || 0}px, ${offsets.customerY || 0}px)`,
            }}
            className="w-1/3 text-left"
          >
            <h2
              className="font-bold border-b pb-1 mb-2 inline-block"
              style={{
                borderColor: "#000",
                fontSize: offsets.fontSizeHeader
                  ? `${offsets.fontSizeHeader}px`
                  : "1.125rem",
              }}
            >
              {order.type === "tax_invoice"
                ? "فاتورة ضريبية"
                : order.type === "return_invoice"
                  ? "مرتجع مبيعات"
                  : "عرض سعر"}
            </h2>
            <p>
              رقم:{" "}
              <strong style={{ direction: "ltr", display: "inline-block" }}>
                {order.id}
              </strong>
            </p>
            <p>التاريخ: {format(order.date || Date.now(), "yyyy/MM/dd")}</p>
            <p>الوقت: {format(order.date || Date.now(), "hh:mm a", { locale: arSA })}</p>
            {order.branchId &&
              settings?.branches?.find((b) => b.id === order.branchId) && (
                <p>
                  الفرع:{" "}
                  <strong>
                    {
                      settings.branches.find((b) => b.id === order.branchId)
                        ?.name
                    }
                  </strong>
                </p>
              )}
            {order.customerName && order.customerName !== "عميل نقدي" && (
              <div
                className="mt-2 border-t pt-2 space-y-1"
                style={{ borderTopColor: "rgba(0,0,0,0.3)" }}
              >
                {customer?.companyName ? (
                  <p>
                    الشركة/المؤسسة: <strong>{customer.companyName}</strong>
                  </p>
                ) : (
                  <p>
                    العميل: <strong>{order.customerName}</strong>
                  </p>
                )}
                {customer?.taxNumber && (
                  <p>
                    الرقم الضريبي: <strong>{customer.taxNumber}</strong>
                  </p>
                )}
                {customer?.phone && (
                  <p>
                    رقم التواصل: <strong>{customer.phone}</strong>
                  </p>
                )}
                {customer?.address && (
                  <p>
                    العنوان الوطني: <strong>{customer.address}</strong>
                  </p>
                )}
              </div>
            )}
            {order.paymentMethod && order.paymentMethod !== "none" && (
              <p className="mt-2">
                طريقة الدفع:{" "}
                <strong>{getPaymentMethodLabel(order.paymentMethod)}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="flex-grow">
          {/* Table */}
          <table
            className="w-full border-collapse mb-4 mt-4"
            style={{ border: "1px solid #000" }}
          >
            <thead>
              <tr style={{ backgroundColor: "#e5e7eb" }}>
                <th
                  className="p-2 text-right"
                  style={{ border: "1px solid #000" }}
                >
                  الصنف
                </th>
                <th
                  className="p-2 text-center w-16"
                  style={{ border: "1px solid #000" }}
                >
                  الكمية
                </th>
                <th
                  className="p-2 text-center w-20"
                  style={{ border: "1px solid #000" }}
                >
                  السعر قبل الضريبة
                </th>
                <th
                  className="p-2 text-center w-20"
                  style={{ border: "1px solid #000" }}
                >
                  نسبة الخصم
                </th>
                <th
                  className="p-2 text-center w-20"
                  style={{ border: "1px solid #000" }}
                >
                  الخصم
                </th>
                <th
                  className="p-2 text-center w-20"
                  style={{ border: "1px solid #000" }}
                >
                  الضريبة
                </th>
                <th
                  className="p-2 text-center w-24"
                  style={{ border: "1px solid #000" }}
                >
                  السعر بعد الضريبة
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items?.map((item, idx) => {
                const itemDiscount = item.discount || 0;
                const itemTax = item.tax || 0;
                const itemPrice = item.price || 0;
                const itemQty = item.qty || 1;

                // Calculate values for a single item (unit)
                const unitPriceBeforeTax = itemPrice / (1 + itemTax / 100);
                const unitDiscountBeforeTax =
                  itemDiscount / (1 + itemTax / 100);

                const discountPercentage =
                  itemPrice > 0 ? (itemDiscount / itemPrice) * 100 : 0;

                const lineBase =
                  (itemPrice - itemDiscount) / (1 + itemTax / 100);
                const lineTax = itemPrice - itemDiscount - lineBase;
                const lineTotal = itemPrice - itemDiscount;

                return (
                  <tr key={idx}>
                    <td className="p-2" style={{ border: "1px solid #000" }}>
                      {item.name}
                    </td>
                    <td
                      className="p-2 text-center font-bold"
                      style={{ border: "1px solid #000" }}
                    >
                      {itemQty}
                    </td>
                    <td
                      className="p-2 text-center"
                      style={{ border: "1px solid #000" }}
                    >
                      {(unitPriceBeforeTax * itemQty).toFixed(2)}
                    </td>
                    <td
                      className="p-2 text-center"
                      style={{ border: "1px solid #000", color: "#dc2626" }}
                    >
                      {itemDiscount > 0
                        ? `${discountPercentage.toFixed(1)}%`
                        : "0%"}
                    </td>
                    <td
                      className="p-2 text-center"
                      style={{ border: "1px solid #000", color: "#dc2626" }}
                    >
                      {itemDiscount > 0
                        ? (unitDiscountBeforeTax * itemQty).toFixed(2)
                        : "0.00"}
                    </td>
                    <td
                      className="p-2 text-center"
                      style={{ border: "1px solid #000" }}
                    >
                      {(lineTax * itemQty).toFixed(2)}
                    </td>
                    <td
                      className="p-2 text-center font-bold"
                      style={{ border: "1px solid #000" }}
                    >
                      {(lineTotal * itemQty).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals & Notes Row */}
          <div className="flex justify-between items-start mt-4">
            <div className="w-2/3 max-w-[60%] pl-8">
              {/* Notes Area */}
              {settings.warrantyTerms && (
                <div className="p-3">
                  <p
                    className="whitespace-pre-line font-bold mt-4"
                    style={{
                      color: "#374151",
                      fontSize: offsets.fontSizeBase
                        ? `${Math.max(10, offsets.fontSizeBase - 2)}px`
                        : "0.75rem",
                    }}
                  >
                    {settings.warrantyTerms}
                  </p>
                </div>
              )}
            </div>

            {/* Totals calculations */}
            <div className="w-1/3 min-w-[250px]">
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="pb-1">الإجمالي (قبل الضريبة):</td>
                    <td className="text-left pb-1 font-mono">
                      {(order.totalBeforeTax || 0).toFixed(2)}
                    </td>
                  </tr>
                  {(order.totalDiscount || 0) > 0 && (
                    <tr>
                      <td className="pb-1" style={{ color: "#dc2626" }}>
                        إجمالي الخصم:
                      </td>
                      <td
                        className="text-left pb-1 font-mono"
                        style={{ color: "#dc2626" }}
                      >
                        -{(order.totalDiscount || 0).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td
                      className="pb-1 border-b"
                      style={{ borderBottomColor: "#000" }}
                    >
                      إجمالي الضريبة المضافة:
                    </td>
                    <td
                      className="text-left pb-1 border-b font-mono"
                      style={{ borderBottomColor: "#000" }}
                    >
                      {(order.totalTax || 0).toFixed(2)}
                    </td>
                  </tr>
                  <tr
                    className="font-bold"
                    style={{
                      fontSize: offsets.fontSizeHeader
                        ? `${offsets.fontSizeHeader}px`
                        : "1.125rem",
                    }}
                  >
                    <td className="pt-2">الصافي النهائي:</td>
                    <td className="text-left pt-2 font-mono">
                      {(order.grandTotal || 0).toFixed(2)} ر.س
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* QR Code and Footer at bottom */}
        <div className="mt-auto flex flex-col items-center pt-8">
          <div
            style={{
              transform: `translate(${offsets.qrX || 0}px, ${offsets.qrY || 0}px)`,
            }}
            className="mb-4 self-end ml-12"
          >
            {order.type === "tax_invoice" && companyHeader.taxNumber && (
              <div
                className="p-2 rounded-lg inline-block"
                style={{ backgroundColor: "#ffffff" }}
              >
                <QRCodeSVG
                  value={getQRValue()}
                  size={offsets.qrSize || 200}
                  level="Q"
                  includeMargin={true}
                  style={{ backgroundColor: "#ffffff" }}
                />
              </div>
            )}
          </div>

          {settings.showSignatures !== false && (
            <div
              style={{
                color: "#1f2937",
                transform: `translate(${offsets.footerX || 0}px, ${offsets.footerY || 0}px)`,
              }}
              className="text-center font-bold pb-8 w-full mt-4"
            >
              <div className="flex justify-between px-12">
                <div>
                  {settings.footerSignatures?.client ||
                    "توقيع العميل: ......................"}
                </div>
                <div>
                  {settings.footerSignatures?.company ||
                    "ختم الشركة: ......................"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
