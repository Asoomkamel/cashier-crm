"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";

import {
  AppSettings,
  Customer,
  Order,
  PrintPosition,
} from "@/lib/types";
import { translate } from "@/lib/i18n";
import { buildZatcaQrPayload } from "@/lib/zatcaQr";

function orderClass(position: PrintPosition | undefined): string {
  if (position === "center") return "order-2";
  if (position === "end") return "order-3";
  return "order-1";
}

function justifyClass(position: PrintPosition | undefined): string {
  if (position === "center") return "justify-center";
  if (position === "start") return "justify-start";
  return "justify-end";
}

function firstCustomerAddress(customer?: Customer): string {
  const location = customer?.locations?.[0];

  if (!location) {
    return "";
  }

  return [
    location.city,
    location.district,
    location.address,
  ]
    .filter(Boolean)
    .join(" - ");
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeDate(value: unknown): Date {
  const parsedDate = new Date(String(value ?? ""));

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date();
  }

  return parsedDate;
}

export default function InvoicePrint({
  order,
  settings,
  customer,
}: {
  order: Order;
  settings: AppSettings;
  customer?: Customer;
}) {
  const t = (key: Parameters<typeof translate>[0]) =>
    translate(key, settings.language);

  const isArabic = settings.language === "ar";
  const direction = isArabic ? "rtl" : "ltr";
  const locale = isArabic ? "ar-SA" : "en-US";
  const printSettings = settings.printSettings;

  const companyName = settings.companyHeader?.name ?? "";
  const companyAddress = settings.companyHeader?.address ?? "";
  const companyPhone = settings.companyHeader?.phone ?? "";
  const companyTaxNumber = settings.companyHeader?.taxNumber ?? "";
  const companyLogo = settings.companyHeader?.logoUrl ?? "";

  const invoiceDate = safeDate(order.date);

  const grandTotal = safeNumber(order.grandTotal);
  const totalTax = safeNumber(order.totalTax);
  const totalBeforeTax = safeNumber(order.totalBeforeTax);
  const totalDiscount = safeNumber(order.totalDiscount);

  const margin = Math.max(
    4,
    Math.min(30, safeNumber(printSettings?.marginMm, 12)),
  );

  const fontSize = Math.max(
    10,
    Math.min(18, safeNumber(printSettings?.fontSize, 14)),
  );

  const logoSize = Math.max(
    32,
    Math.min(180, safeNumber(printSettings?.logoSize, 64)),
  );

  const qrSize = Math.max(
    80,
    Math.min(240, safeNumber(printSettings?.qrSize, 160)),
  );

  const invoiceStyle: React.CSSProperties & {
    "--invoice-padding"?: string;
  } = {
    padding: `${margin}mm`,
    fontSize: `${fontSize}px`,
    "--invoice-padding": `${margin}mm`,
  };

  const qrPayload = buildZatcaQrPayload({
    sellerName: companyName,
    vatNumber: companyTaxNumber,
    timestampISO: invoiceDate.toISOString(),
    invoiceTotal: grandTotal.toFixed(2),
    vatTotal: totalTax.toFixed(2),
  });

  const invoiceTypeLabel =
    order.type === "quotation"
      ? t("pos_quotation")
      : order.type === "return_invoice"
        ? t("pos_return_invoice")
        : t("pos_tax_invoice");

  const paymentLabels: Record<string, string> = {
    cash: t("pos_cash"),
    card: t("pos_card"),
    transfer: t("pos_transfer"),
    partial: t("pos_partial"),
    credit: t("pos_credit"),
    tabby: "Tabby",
    tamara: "Tamara",
  };

  const paymentLabel =
    paymentLabels[String(order.paymentMethod ?? "")] ??
    String(order.paymentMethod ?? "—");

  const currencyLabel =
    isArabic && settings.currency === "SAR"
      ? "ر.س"
      : settings.currency || "SAR";

  const invoiceTaxNumber =
    order.invoiceTaxNumber ||
    customer?.taxNumber ||
    "";

  const invoiceCompanyName =
    order.invoiceCompanyName ||
    customer?.companyName ||
    "";

  const invoiceCustomerName =
    order.invoiceCustomerName ||
    customer?.name ||
    order.customerName ||
    "";

  const invoicePhone =
    order.invoiceContactPhone ||
    customer?.phone ||
    "";

  const invoiceAddress =
    order.invoiceAddress ||
    firstCustomerAddress(customer);

  const hasTaxInvoiceCustomer = Boolean(invoiceTaxNumber);

  const hasRealCustomer = Boolean(
    customer ||
      (order.customerId && order.customerId !== "walk-in"),
  );

  const items = Array.isArray(order.items)
    ? order.items
    : [];

  return (
    <article
      id="invoice-print"
      dir={direction}
      style={invoiceStyle}
      className="invoice-sheet mx-auto w-full max-w-[210mm] bg-white text-slate-800 shadow-sm"
    >
      {/* Invoice header */}
      <header className="invoice-print-header invoice-header mb-4 flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
        {/* Company information */}
        <section
          className={`min-w-[160px] flex-1 text-start ${orderClass(
            printSettings?.companyInfoPosition,
          )}`}
        >
          <div className="text-base font-bold">
            {companyName || "—"}
          </div>

          {companyAddress && (
            <div className="mt-1 text-xs">
              {companyAddress}
            </div>
          )}

          {companyPhone && (
            <div className="text-xs">
              {t("login_phone")}: {companyPhone}
            </div>
          )}

          {companyTaxNumber && (
            <div className="text-xs">
              {t("settings_tax_number")}: {companyTaxNumber}
            </div>
          )}
        </section>

        {/* Company logo */}
        {printSettings?.showLogo !== false && companyLogo && (
          <section
            className={`flex min-w-[90px] flex-1 ${justifyClass(
              printSettings?.logoPosition,
            )} ${orderClass(printSettings?.logoPosition)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={companyLogo}
              alt={companyName || "Company logo"}
              style={{
                width: logoSize,
                height: logoSize,
              }}
              className="object-contain"
            />
          </section>
        )}

        {/* Invoice information */}
        <section
          className={`min-w-[190px] flex-1 text-start text-sm ${orderClass(
            printSettings?.customerInfoPosition,
          )}`}
        >
          <div className="mb-2 border-b border-slate-400 pb-1 text-base font-bold">
            {invoiceTypeLabel}
          </div>

          <div className="flex justify-between gap-3">
            <span>{t("inv_number")}:</span>

            <span className="font-bold">
              {order.invoiceNumber || "—"}
            </span>
          </div>

          <div className="flex justify-between gap-3">
            <span>{t("inv_date")}:</span>

            <span>
              {invoiceDate.toLocaleDateString(locale)}
            </span>
          </div>

          <div className="flex justify-between gap-3">
            <span>{t("inv_time")}:</span>

            <span>
              {invoiceDate.toLocaleTimeString(locale, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </section>
      </header>

      {/* Customer and payment information */}
      <section className="invoice-customer-block mb-4 rounded-md border border-slate-300 p-3 text-sm">
        <div className="mb-2 font-bold">
          {isArabic ? "بيانات الفاتورة والعميل" : "Invoice and customer details"}
        </div>

        <div className="invoice-customer-grid grid grid-cols-1 gap-2 md:grid-cols-2">
          {hasTaxInvoiceCustomer ? (
            <>
              <div>
                <span className="font-medium">
                  {isArabic
                    ? "اسم الشركة/المؤسسة"
                    : "Company / Establishment"}
                  :
                </span>{" "}
                {invoiceCompanyName || invoiceCustomerName || "—"}
              </div>

              <div>
                <span className="font-medium">
                  {t("settings_tax_number")}:
                </span>{" "}
                {invoiceTaxNumber || "—"}
              </div>

              <div>
                <span className="font-medium">
                  {t("inv_contact_number")}:
                </span>{" "}
                {invoicePhone || "—"}
              </div>

              <div>
                <span className="font-medium">
                  {isArabic ? "العنوان" : "Address"}:
                </span>{" "}
                {invoiceAddress || "—"}
              </div>
            </>
          ) : hasRealCustomer ? (
            <>
              <div>
                <span className="font-medium">
                  {isArabic ? "اسم العميل" : "Customer name"}:
                </span>{" "}
                {invoiceCustomerName || "—"}
              </div>

              <div>
                <span className="font-medium">
                  {t("inv_contact_number")}:
                </span>{" "}
                {invoicePhone || "—"}
              </div>

              {invoiceAddress && (
                <div>
                  <span className="font-medium">
                    {isArabic ? "العنوان" : "Address"}:
                  </span>{" "}
                  {invoiceAddress}
                </div>
              )}
            </>
          ) : (
            <div>
              <span className="font-medium">
                {isArabic ? "العميل" : "Customer"}:
              </span>{" "}
              {isArabic ? "عميل نقدي" : "Walk-in customer"}
            </div>
          )}

          <div>
            <span className="font-medium">
              {t("inv_payment_method")}:
            </span>{" "}
            <span className="font-bold">
              {paymentLabel}
            </span>
          </div>
        </div>
      </section>

      {/* Invoice items */}
      <section className="invoice-items-wrap print-no-scroll mb-4 overflow-x-auto print:overflow-visible">
        <table className="invoice-print-table invoice-items-table w-full min-w-[600px] border-collapse text-sm print:min-w-0">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 p-2 text-start">
                {t("name")}
              </th>

              <th className="border border-slate-300 p-2 text-center">
                {t("qty")}
              </th>

              <th className="border border-slate-300 p-2 text-center">
                {t("inv_price_before_tax")}
              </th>

              <th className="border border-slate-300 p-2 text-center">
                {t("inv_discount_percent")}
              </th>

              <th className="border border-slate-300 p-2 text-center">
                {t("discount")}
              </th>

              <th className="border border-slate-300 p-2 text-center">
                {t("tax")}
              </th>

              <th className="border border-slate-300 p-2 text-center">
                {t("inv_price_after_tax")}
              </th>
            </tr>
          </thead>

          <tbody>
            {items.length > 0 ? (
              items.map((item, index) => {
                const quantity = safeNumber(item.qty);
                const unitPrice = safeNumber(item.price);
                const taxRate = safeNumber(item.tax);
                const discount = safeNumber(item.discount);

                const lineGross = unitPrice * quantity;
                const taxDivisor = 1 + taxRate / 100;

                const lineNet =
                  taxDivisor !== 0
                    ? lineGross / taxDivisor
                    : lineGross;

                const taxAmount = lineGross - lineNet;

                const discountPercent =
                  lineNet !== 0
                    ? (discount / Math.abs(lineNet)) * 100
                    : 0;

                const finalAfterTax =
                  lineGross - discount;

                return (
                  <tr key={`${item.catalogId ?? "item"}-${index}`}>
                    <td className="border border-slate-200 p-2">
                      {item.name || "—"}
                    </td>

                    <td className="border border-slate-200 p-2 text-center">
                      {quantity}
                    </td>

                    <td className="border border-slate-200 p-2 text-center">
                      {lineNet.toFixed(2)}
                    </td>

                    <td className="border border-slate-200 p-2 text-center">
                      {discountPercent.toFixed(1)}%
                    </td>

                    <td className="border border-slate-200 p-2 text-center text-red-600">
                      {discount.toFixed(2)}
                    </td>

                    <td className="border border-slate-200 p-2 text-center">
                      {taxAmount.toFixed(2)}
                    </td>

                    <td className="border border-slate-200 p-2 text-center font-semibold">
                      {finalAfterTax.toFixed(2)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="border border-slate-200 p-6 text-center text-slate-500"
                >
                  {isArabic
                    ? "لا توجد أصناف في هذه الفاتورة"
                    : "No items are available in this invoice"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Notes and totals */}
      <section className="invoice-print-totals invoice-summary mb-8 flex flex-wrap justify-between gap-6 text-sm">
        <div className="invoice-notes max-w-xs whitespace-pre-line text-xs text-slate-500">
          {order.notes && (
            <div className="mb-3 text-slate-700">
              <div className="mb-1 font-bold">
                {isArabic ? "ملاحظات" : "Notes"}
              </div>

              {order.notes}
            </div>
          )}

          {settings.warrantyTerms && (
            <div>
              <div className="mb-1 font-bold text-slate-700">
                {isArabic ? "شروط الضمان" : "Warranty terms"}
              </div>

              {settings.warrantyTerms}
            </div>
          )}
        </div>

        <div className="invoice-totals-card w-64 space-y-1.5">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">
              {t("inv_total_before_tax")}:
            </span>

            <span>
              {totalBeforeTax.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between gap-4 text-red-600">
            <span>
              {t("inv_total_discount")}:
            </span>

            <span>
              -{totalDiscount.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between gap-4">
            <span className="text-slate-500">
              {t("inv_total_tax_added")}:
            </span>

            <span>
              {totalTax.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between gap-4 border-t border-slate-300 pt-2 text-base font-bold">
            <span>
              {t("inv_final_net")}:
            </span>

            <span>
              {grandTotal.toFixed(2)} {currencyLabel}
            </span>
          </div>
        </div>
      </section>

      {/* Signatures and stamp */}
      {(printSettings?.showCustomerSignature ||
        printSettings?.showCompanySignature ||
        printSettings?.showStamp) && (
        <section className="invoice-print-signatures invoice-signatures mb-6 grid grid-cols-1 gap-4 text-xs text-slate-600 sm:grid-cols-3">
          {printSettings?.showCustomerSignature && (
            <div className="border-t border-slate-400 pt-2">
              {isArabic
                ? "توقيع العميل"
                : "Customer signature"}
            </div>
          )}

          {printSettings?.showCompanySignature && (
            <div className="border-t border-slate-400 pt-2">
              {printSettings.companySignatureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={printSettings.companySignatureUrl}
                  alt={
                    isArabic
                      ? "توقيع الشركة"
                      : "Company signature"
                  }
                  className="mb-1 h-12 max-w-[140px] object-contain"
                />
              )}

              {isArabic
                ? "توقيع الشركة"
                : "Company signature"}
            </div>
          )}

          {printSettings?.showStamp && (
            <div className="text-center">
              {printSettings.stampImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={printSettings.stampImageUrl}
                  alt={isArabic ? "ختم الشركة" : "Company stamp"}
                  className="mx-auto h-20 max-w-[120px] object-contain"
                />
              ) : (
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-slate-400 text-slate-400">
                  {isArabic ? "ختم" : "Stamp"}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ZATCA QR */}
      <footer
        dir="ltr"
        className="invoice-print-qr invoice-qr mt-8 flex justify-start"
      >
        <QRCodeSVG
          value={qrPayload}
          size={qrSize}
          marginSize={1}
        />
      </footer>
    </article>
  );
}