import { OrderType, PaymentMethod } from "@/lib/types";

export interface NormalizedCheckoutItem {
  productId?: string;
  catalogId?: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  discount?: number;
  taxRate?: number;
  lineTotal?: number;
  source?: "main" | "technician";
  technicianId?: string;
}

export interface NormalizedCheckoutCommand {
  organizationId: string;
  branchId?: string;
  idempotencyKey: string;
  invoiceNumber: string;
  customerId?: string;
  customerName?: string;
  invoiceType: OrderType;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  remainingAmount?: number;
  totalBeforeTax: number;
  totalTax: number;
  totalDiscount: number;
  grandTotal: number;
  technicianId?: string;
  technicianName?: string;
  technicianCommission?: number;
  marketingCommission?: number;
  useTechnicianStock?: boolean;
  createdBy?: string;
  notes?: string;
  issuedAt?: string;
  items: NormalizedCheckoutItem[];
}

export interface NormalizedCheckoutResponse {
  ok: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  idempotencyKey?: string;
  replayed?: boolean;
  dryRun?: boolean;
  error?: string;
}

export function normalizeCheckoutCommand(command: NormalizedCheckoutCommand): NormalizedCheckoutCommand {
  return {
    ...command,
    branchId: command.branchId || undefined,
    customerId: command.customerId || undefined,
    customerName: command.customerName?.trim() || undefined,
    technicianId: command.technicianId || undefined,
    technicianName: command.technicianName?.trim() || undefined,
    createdBy: command.createdBy || undefined,
    notes: command.notes?.trim() || undefined,
    items: (command.items || [])
      .filter((item) => item.itemName?.trim() && Number(item.quantity) > 0)
      .map((item) => ({
        ...item,
        itemName: item.itemName.trim(),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice) || 0,
        discount: Number(item.discount) || 0,
        taxRate: Number(item.taxRate) || 0,
        source: item.source || "main",
      })),
  };
}

export function validateNormalizedCheckoutCommand(command: NormalizedCheckoutCommand): string[] {
  const errors: string[] = [];
  if (!command.organizationId) errors.push("organizationId is required.");
  if (!command.idempotencyKey) errors.push("idempotencyKey is required.");
  if (!command.invoiceNumber) errors.push("invoiceNumber is required.");
  if (!Array.isArray(command.items) || command.items.length === 0) errors.push("At least one invoice item is required.");
  if (command.grandTotal < 0) errors.push("grandTotal cannot be negative.");
  command.items?.forEach((item, index) => {
    if (!item.itemName?.trim()) errors.push(`items[${index}].itemName is required.`);
    if (!(Number(item.quantity) > 0)) errors.push(`items[${index}].quantity must be positive.`);
    if (Number(item.unitPrice) < 0) errors.push(`items[${index}].unitPrice cannot be negative.`);
  });
  return errors;
}
