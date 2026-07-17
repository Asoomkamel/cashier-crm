import { OrderItem } from "@/lib/types";

export function calculateInvoiceTotals(items: OrderItem[], cartDiscount = 0) {
  const safeItems = Array.isArray(items) ? items : [];
  const subtotal = safeItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const lineDiscount = safeItems.reduce((sum, item) => sum + (item.discount || 0) * item.qty, 0);
  const totalDiscount = lineDiscount + Math.max(0, cartDiscount || 0);
  const grossAfterDiscount = Math.max(0, subtotal - totalDiscount);
  const totalTax = safeItems.reduce((sum, item) => {
    const lineGross = Math.max(0, item.price * item.qty - (item.discount || 0) * item.qty);
    const net = lineGross / (1 + (item.tax || 0) / 100);
    return sum + (lineGross - net);
  }, 0);
  return {
    subtotal,
    totalDiscount,
    totalTax,
    totalBeforeTax: grossAfterDiscount - totalTax,
    grandTotal: grossAfterDiscount,
  };
}
