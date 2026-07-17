import { ServiceOrder, AppSettings, Customer, getLocationMapUrl, getLocationLabel } from "./types";
import { toE164Saudi } from "./phone";

/**
 * Renders a WhatsApp template string, substituting placeholders with live
 * data from a service order (urgent order or appointment) and the app's
 * settings (currency).
 *
 * Supported placeholders (Arabic preferred, English legacy supported):
 * {اسم_العميل} / {customer_name}
 * {رقم_العميل} / {customer_phone}
 * {تفاصيل_الطلب} / {issue}
 * {المنتجات} / {items}
 * {التاريخ} / {date}
 * {المبلغ} / {amount}
 * {العملة} / {currency}
 * {اسم_الفني} / {technician_name}
 * {التخصص} / {specialty}
 * {الملاحظات} / {notes}
 * {اسم_المسوق} / {marketer_name}
 * {رقم_المسوق} / {marketer_phone}
 * {رقم_الطلب} / {request_number}
 * {رابط_الموقع} / {location_url}
 * {عنوان_الموقع} / {location_address}
 * {مدينة_العميل} / {customer_city}
 * {حي_العميل} / {customer_district}
 */
export function renderWhatsAppTemplate(template: string, order: ServiceOrder, settings: AppSettings, customer?: Customer): string {
  const dateStr = new Date(order.date).toLocaleString(settings.language === "ar" ? "ar-SA" : "en-US");
  const items = (order.requestedItems || [])
    .map((it) => `${it.name} x${it.qty}`)
    .join("، ");

  // Resolve location data: prefer order fields, fall back to customer locations
  const orderMapUrl = order.customerGoogleMapsUrl || "";
  const orderAddress = order.locationLabel || order.customerAddress || "";
  const orderCity = order.customerCity || "";
  const orderDistrict = order.customerDistrict || "";

  // Also check customer's primary location if available
  const primaryLoc = customer?.locations?.[0];
  const locationUrl = orderMapUrl || getLocationMapUrl(primaryLoc);
  const locationAddress = orderAddress || getLocationLabel(primaryLoc);
  const customerCity = orderCity || primaryLoc?.city || "";
  const customerDistrict = orderDistrict || primaryLoc?.district || "";

  const values = {
    customerName: order.customerName || "",
    customerPhone: order.customerPhone || "",
    issue: order.issue || "",
    date: dateStr,
    amount: order.expectedAmount ? order.expectedAmount.toFixed(2) : "0.00",
    currency: settings.currency,
    technicianName: order.technicianName || (settings.language === "ar" ? "غير معين" : "Unassigned"),
    requestNumber: String(order.requestNumber),
    specialty: order.requiredSpecialty || "",
    notes: order.notes || "",
    marketerName: order.marketerName || "",
    marketerPhone: order.marketerPhone || "",
    items,
    locationUrl,
    locationAddress,
    customerCity,
    customerDistrict,
  };

  const map: Record<string, string> = {
    // Arabic placeholders
    "{اسم_العميل}": values.customerName,
    "{رقم_العميل}": values.customerPhone,
    "{تفاصيل_الطلب}": values.issue,
    "{المنتجات}": values.items,
    "{التاريخ}": values.date,
    "{المبلغ}": values.amount,
    "{العملة}": values.currency,
    "{اسم_الفني}": values.technicianName,
    "{التخصص}": values.specialty,
    "{الملاحظات}": values.notes,
    "{اسم_المسوق}": values.marketerName,
    "{رقم_المسوق}": values.marketerPhone,
    "{رقم_الطلب}": values.requestNumber,
    "{رابط_الموقع}": values.locationUrl,
    "{عنوان_الموقع}": values.locationAddress,
    "{مدينة_العميل}": values.customerCity,
    "{حي_العميل}": values.customerDistrict,

    // English placeholders — backward compat
    "{customer_name}": values.customerName,
    "{customer_phone}": values.customerPhone,
    "{issue}": values.issue,
    "{items}": values.items,
    "{date}": values.date,
    "{amount}": values.amount,
    "{currency}": values.currency,
    "{technician_name}": values.technicianName,
    "{specialty}": values.specialty,
    "{notes}": values.notes,
    "{marketer_name}": values.marketerName,
    "{marketer_phone}": values.marketerPhone,
    "{request_number}": values.requestNumber,
    "{location_url}": values.locationUrl,
    "{location_address}": values.locationAddress,
    "{customer_city}": values.customerCity,
    "{customer_district}": values.customerDistrict,
  };

  let out = template;
  Object.entries(map).forEach(([key, value]) => {
    out = out.split(key).join(value);
  });
  return out;
}

/** Opens the native/web WhatsApp client with a pre-filled message. */
export function openWhatsApp(phone: string, message: string) {
  const e164 = toE164Saudi(phone || "");
  const cleanPhone = e164.replace(/[^0-9]/g, "");
  if (!cleanPhone) {
    alert("لا يوجد رقم هاتف صالح لفتح واتساب.");
    return;
  }
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Opens Google Maps URL in a new tab, works on mobile too */
export function openGoogleMaps(url: string) {
  if (!url) return;
  // On mobile, try to open maps app directly
  window.open(url, "_blank", "noopener,noreferrer");
}
