"use client";

import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Order, AppSettings, Customer, PrintPosition } from "@/lib/types";
import { translate } from "@/lib/i18n";
import { buildZatcaQrPayload } from "@/lib/zatcaQr";

function orderClass(position: PrintPosition | undefined) {
  if (position === "center") return "order-2";
  if (position === "end") return "order-3";
  return "order-1";
}

function justifyClass(position: PrintPosition | undefined) {
  if (position === "center") return "justify-center";
  if (position === "start") return "justify-start";
  return "justify-end";
}

function firstCustomerAddress(customer?: Customer): string {
  const loc = customer?.locations?.[0];
  if (!loc) return "";
  return [loc.city, loc.district, loc.address].filter(Boolean).join(" - ");
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
  const t = (key: Parameters<typeof translate>[0]) => translate(key, settings.language);
  const dir = settings.language === "ar" ? "rtl" : "ltr";
  const ar = settings.language === "ar";
  const print = settings.printSettings;
  const qrPayload = buildZatcaQrPayload({
    sellerName: settings.companyHeader.name,
    vatNumber: settings.companyHeader.taxNumber,
    timestampISO: new Date(order.date).toISOString(),
    invoiceTotal: order.grandTotal.toFixed(2),
    vatTotal: order.totalTax.toFixed(2),
  });

  const invoiceTypeLabel =
    order.type === "quotation"
      ? t("pos_quotation")
      : order.type === "return_invoice"
        ? t("pos_return_invoice")
        : t("pos_tax_invoice");

  const paymentLabel = {
    cash: t("pos_cash"),
    card: t("pos_card"),
    transfer: t("pos_transfer"),
    partial: t("pos_partial"),
    credit: t("pos_credit"),
    tabby: "Tabby",
    tamara: "Tamara",
  }[order.paymentMethod];

  const currencyLabel = ar && settings.currency === "SAR" ? "ر.س" : settings.currency;
  const dateObj = new Date(order.date);

  const margin = Math.max(4, Math.min(30, print?.marginMm ?? 12));
  const fontSize = Math.max(10, Math.min(18, print?.fontSize ?? 14));
  const logoSize = Math.max(32, Math.min(180, print?.logoSize ?? 64));
  const qrSize = Math.max(80, Math.min(240, print?.qrSize ?? 160));

  const invoiceTaxNumber = order.invoiceTaxNumber || customer?.taxNumber || "";
  const invoiceCompanyName = order.invoiceCompanyName || customer?.companyName || "";
  const invoiceCustomerName = order.invoiceCustomerName || customer?.name || order.customerName || "";
  const invoicePhone = order.invoiceContactPhone || customer?.phone || "";
  const invoiceAddress = order.invoiceAddress || firstCustomerAddress(customer);
  const hasTaxInvoiceCustomer = Boolean(invoiceTaxNumber);
  const hasRealCustomer = Boolean(customer || (order.customerId && order.customerId !== "walk-in"));

  return (
    <div
      dir={dir}
      id="invoice-print"
      style={{ padding: `${margin}mm`, fontSize }}
      className="mx-auto w-full max-w-[210mm] bg-white text-slate-800 print:w-[190mm] print:max-w-none print:shadow-none"
    >
      <div className="invoice-print-header mb-4 flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
        <div className={`min-w-[160px] flex-1 text-start ${orderClass(print?.companyInfoPosition)}`}>
          <div className="text-base font-bold">{settings.companyHeader.name}</div>
          <div className="text-xs">{settings.companyHeader.address}</div>
          <div className="text-xs">
            {t("login_phone")}: {settings.companyHeader.phone}
          </div>
          <div className="text-xs">
            {t("settings_tax_number")}: {settings.companyHeader.taxNumber}
          </div>
        </div>

        {print?.showLogo !== false && settings.companyHeader.logoUrl && (
          <div className={`flex min-w-[90px] flex-1 ${justifyClass(print?.logoPosition)} ${orderClass(print?.logoPosition)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.companyHeader.logoUrl}
              alt={settings.companyHeader.name}
              style={{ width: logoSize, height: logoSize }}
              className="object-contain"
            />
          </div>
        )}

        <div className={`min-w-[210px] flex-1 text-start text-sm ${orderClass(print?.customerInfoPosition)}`}>
          <div className="mb-1 border-b border-slate-400 pb-1 font-bold">{invoiceTypeLabel}</div>
          <div>
            {t("inv_number")}: <span className="font-bold">{order.invoiceNumber}</span>
          </div>
          <div>
            {t("inv_date")}: {dateObj.toLocaleDateString()}
          </div>
          <div>
            {t("inv_time")}: {dateObj.toLocaleTimeString()}
          </div>
          <div className="my-2 border-t border-slate-200" />

          {hasTaxInvoiceCustomer ? (
            <>
              <div>
                {ar ? "اسم الشركة/المؤسسة" : "Company / Establishment"}: {invoiceCompanyName || invoiceCustomerName}
              </div>
              <div>
                {t("settings_tax_number")}: {invoiceTaxNumber}
              </div>
              <div>
                {t("inv_contact_number")}: {invoicePhone || "—"}
              </div>
              <div>
                {ar ? "العنوان" : "Address"}: {invoiceAddress || "—"}
              </div>
            </>
          ) : hasRealCustomer ? (
            <>
              <div>
                {ar ? "اسم العميل" : "Customer name"}: {invoiceCustomerName}
              </div>
              <div>
                {t("inv_contact_number")}: {invoicePhone || "—"}
              </div>
            </>
          ) : null}

          <div>
            {t("inv_payment_method")}: <span className="font-bold">{paymentLabel}</span>
          </div>
        </div>
      </div>

      <div className="print-no-scroll mb-4 overflow-x-auto print:overflow-visible">
        <table className="invoice-print-table w-full min-w-[600px] border-collapse text-sm print:min-w-0">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 p-2 text-start">{t("name")}</th>
              <th className="border border-slate-300 p-2 text-center">{t("qty")}</th>
              <th className="border border-slate-300 p-2 text-center">{t("inv_price_before_tax")}</th>
              <th className="border border-slate-300 p-2 text-center">{t("inv_discount_percent")}</th>
              <th className="border border-slate-300 p-2 text-center">{t("discount")}</th>
              <th className="border border-slate-300 p-2 text-center">{t("tax")}</th>
              <th className="border border-slate-300 p-2 text-center">{t("inv_price_after_tax")}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => {
              const lineGross = it.price * it.qty;
              const lineNet = lineGross / (1 + it.tax / 100);
              const taxAmount = lineGross - lineNet;
              const discountPercent = lineNet > 0 ? (it.discount / lineNet) * 100 : 0;
              const finalAfterTax = lineGross - it.discount;
              return (
                <tr key={`${it.catalogId}-${i}`}>
                  <td className="border border-slate-200 p-2">{it.name}</td>
                  <td className="border border-slate-200 p-2 text-center">{it.qty}</td>
                  <td className="border border-slate-200 p-2 text-center">{lineNet.toFixed(2)}</td>
                  <td className="border border-slate-200 p-2 text-center">{discountPercent.toFixed(1)}%</td>
                  <td className="border border-slate-200 p-2 text-center text-red-600">{it.discount.toFixed(2)}</td>
                  <td className="border border-slate-200 p-2 text-center">{taxAmount.toFixed(2)}</td>
                  <td className="border border-slate-200 p-2 text-center font-semibold">{finalAfterTax.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="invoice-print-totals mb-8 flex flex-wrap justify-between gap-6 text-sm">
        <div className="max-w-xs whitespace-pre-line text-xs text-slate-500">
          {order.notes && <div className="mb-2 text-slate-700">{order.notes}</div>}
          {settings.warrantyTerms}
        </div>
        <div className="w-64 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">{t("inv_total_before_tax")}:</span>
            <span>{order.totalBeforeTax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>{t("inv_total_discount")}:</span>
            <span>-{order.totalDiscount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t("inv_total_tax_added")}:</span>
            <span>{order.totalTax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-1.5 text-base font-bold">
            <span>{t("inv_final_net")}:</span>
            <span>
              {order.grandTotal.toFixed(2)} {currencyLabel}
            </span>
          </div>
        </div>
      </div>

      {(print?.showCustomerSignature || print?.showCompanySignature || print?.showStamp) && (
        <div className="invoice-print-signatures mb-6 grid grid-cols-1 gap-4 text-xs text-slate-600 sm:grid-cols-3">
          {print?.showCustomerSignature && (
            <div className="border-t border-slate-400 pt-2">{ar ? "توقيع العميل" : "Customer signature"}</div>
          )}
          {print?.showCompanySignature && (
            <div className="border-t border-slate-400 pt-2">
              {print.companySignatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={print.companySignatureUrl} alt="Signature" className="mb-1 h-12 max-w-[140px] object-contain" />
              ) : null}
              {ar ? "توقيع الشركة" : "Company signature"}
            </div>
          )}
          {print?.showStamp && (
            <div className="text-center">
              {print.stampImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={print.stampImageUrl} alt="Stamp" className="mx-auto h-20 max-w-[120px] object-contain" />
              ) : (
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-slate-400 text-slate-400">
                  {ar ? "ختم" : "Stamp"}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div dir="ltr" className="invoice-print-qr mt-8 flex justify-start">
        <QRCodeSVG value={qrPayload} size={qrSize} marginSize={1} />
      </div>
    </div>
  );
}
