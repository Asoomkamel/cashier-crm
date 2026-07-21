import { Order, Customer } from "../types";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";

export function generateWhatsAppMessage(
  template: string,
  order: any,
  customer?: Customer,
): string {
  if (!template) return "";

  let result = template;

  const location = customer?.locations?.find((l) => l.id === order.locationId);
  const locationText = location
    ? `${location.address || ""} ${location.city || ""}`
    : order.location || customer?.address || "";
  let mapLink = location?.mapLink || order.googleMapsUrl || "";
  if (!mapLink && customer?.locations && customer.locations.length > 0) {
     mapLink = customer.locations[0].mapLink || "";
  }
  
  // Convert standard Google Maps links into Directions links to automatically route from the technician's location
  if (mapLink && !mapLink.includes("/dir/") && !mapLink.includes("saddr=")) {
    const cleanLink = mapLink.split("?")[0];
    mapLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanLink)}`;
  }
  
  let formattedDate = "";
  if (order.date) {
    const d = new Date(order.date);
    const dayName = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(d);
    formattedDate = `يوم ${dayName} الموافق ${format(d, "yyyy/MM/dd")} الساعة ${format(d, "hh:mm a", { locale: arSA })}`;
  }

  // Replace keywords
  result = result.replace(/{رقم الطلب}/g, order.id);
  result = result.replace(
    /{اسم العميل}/g,
    customer?.name || order.customerName || "",
  );
  result = result.replace(
    /{جوال العميل}/g,
    customer?.phone || order.customerPhone || "",
  );
  result = result.replace(/{موقع العميل}/g, locationText);
  result = result.replace(
    /{موعد الزياره}/g,
    formattedDate,
  );
  let serviceText = order.productInterest || order.requestType || order.issue || "";
  
  if (order.selectedProducts && Array.isArray(order.selectedProducts) && order.selectedProducts.length > 0) {
    serviceText = "\n" + order.selectedProducts.map((p: any, index: number) => {
      const q = p.qty || 1;
      return `${index + 1}- ${p.name} ${q > 1 ? `(العدد: ${q})` : ''}`
    }).join("\n");
  }

  result = result.replace(
    /{الخدمه}/g,
    serviceText,
  );
  result = result.replace(
    /{طريقه الدفع}/g,
    order.paymentMethod === "cash"
      ? "كاش"
      : order.paymentMethod === "card"
        ? "شبكة"
        : "تحويل",
  );
  result = result.replace(/{الموقع الجغرافي}/g, mapLink);
  
  const orderAmount = order.remainingAmount !== undefined && order.remainingAmount !== null ? order.remainingAmount : (order.expectedAmount || order.grandTotal || order.amount || 0);
  result = result.replace(/{مبلغ الطلبيه}/g, `${orderAmount} ر.س`);
  result = result.replace(/{مبلغ الطلب}/g, `${orderAmount} ر.س`);

  // Include multiple notes if needed, maybe using order.notes or order.internalNotes
  result = result.replace(/{ملاحضه}/g, order.notes || "");

  return result;
}
