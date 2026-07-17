/**
 * Builds the TLV-encoded, base64 QR payload required for Saudi (ZATCA)
 * simplified tax invoices: seller name, VAT number, timestamp, invoice
 * total (with VAT), and VAT total — the 5 standard fields.
 * Reference: ZATCA e-invoicing "Simplified Tax Invoice" QR spec.
 */
function tlv(tag: number, value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  return [tag, bytes.length, ...bytes];
}

export function buildZatcaQrPayload(opts: {
  sellerName: string;
  vatNumber: string;
  timestampISO: string;
  invoiceTotal: string;
  vatTotal: string;
}): string {
  const allBytes = [
    ...tlv(1, opts.sellerName),
    ...tlv(2, opts.vatNumber),
    ...tlv(3, opts.timestampISO),
    ...tlv(4, opts.invoiceTotal),
    ...tlv(5, opts.vatTotal),
  ];
  let binary = "";
  allBytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
