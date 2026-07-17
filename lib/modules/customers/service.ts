/**
 * lib/modules/customers/service.ts
 *
 * Customer business logic — Phase 5.
 * Pure functions: no React, no localStorage access, no side effects.
 * All data comes in as parameters; persistence is handled by the caller.
 */

import {
  Customer,
  CustomerType,
  Location,
  Order,
  ServiceOrder,
  uid,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Search / lookup
// ---------------------------------------------------------------------------

export function searchCustomers(
  customers: Customer[],
  query: string,
  limit = 10
): Customer[] {
  if (!query.trim()) return [];
  const q = query
    .replace(/[\u200e\u200f\u200b\u200c\u200d\ufeff\u00a0]/g, "")
    .trim()
    .toLowerCase();
  return customers
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "")
          .replace(/[\u200e\u200f\u200b\u200c\u200d\ufeff\u00a0]/g, "")
          .includes(q) ||
        (c.companyName || "").toLowerCase().includes(q)
    )
    .slice(0, limit);
}

export function findByPhone(
  customers: Customer[],
  phone: string
): Customer | undefined {
  const clean = phone
    .replace(/[\u200e\u200f\u200b\u200c\u200d\ufeff\u00a0\s]/g, "")
    .trim();
  return customers.find(
    (c) =>
      (c.phone || "")
        .replace(/[\u200e\u200f\u200b\u200c\u200d\ufeff\u00a0\s]/g, "")
        .trim() === clean
  );
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export interface NewCustomerInput {
  name: string;
  phone: string;
  type?: CustomerType;
  companyName?: string;
  taxNumber?: string;
  city?: string;
  district?: string;
  address?: string;
  googleMapsUrl?: string;
  notes?: string;
}

export function createCustomer(input: NewCustomerInput): Customer {
  const locations: Location[] = [];
  const hasLocation =
    input.city || input.district || input.address || input.googleMapsUrl;

  if (hasLocation) {
    locations.push({
      id: uid("loc"),
      address: input.address || "",
      type: "main",
      label: input.city || undefined,
      city: input.city || undefined,
      district: input.district || undefined,
      googleMapsUrl: input.googleMapsUrl || undefined,
      mapLink: input.googleMapsUrl || undefined,
      notes: input.notes || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  return {
    id: uid("cust"),
    name: input.name.trim(),
    phone: input.phone
      .replace(/[\u200e\u200f\u200b\u200c\u200d\ufeff\u00a0\s]/g, "")
      .trim(),
    type: input.type || "customer",
    companyName: input.companyName?.trim() || undefined,
    taxNumber: input.taxNumber?.trim() || undefined,
    interests: [],
    locations,
    createdAt: Date.now(),
  };
}

export function addLocationToCustomer(
  customer: Customer,
  loc: Omit<Location, "id" | "createdAt" | "updatedAt">
): Customer {
  const newLoc: Location = {
    id: uid("loc"),
    ...loc,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return { ...customer, locations: [...customer.locations, newLoc] };
}

export function updateCustomerLocation(
  customer: Customer,
  locationId: string,
  patch: Partial<Location>
): Customer {
  return {
    ...customer,
    locations: customer.locations.map((l) =>
      l.id === locationId ? { ...l, ...patch, updatedAt: Date.now() } : l
    ),
  };
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export function advanceReminderLevel(customer: Customer, monthsUntilNext: number): Customer {
  const nextLevel = Math.min(6, (customer.reminderLevel || 0) + 1);
  const nextDate = Date.now() + monthsUntilNext * 30 * 24 * 60 * 60 * 1000;
  return { ...customer, reminderLevel: nextLevel, nextReminderDate: nextDate };
}

export function isReminderDue(customer: Customer): boolean {
  if (!customer.nextReminderDate) return false;
  return Date.now() >= customer.nextReminderDate;
}

// ---------------------------------------------------------------------------
// Balance / analytics (derived from existing orders)
// ---------------------------------------------------------------------------

export interface CustomerBalance {
  customerId: string;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  invoiceCount: number;
  lastPurchaseDate?: number;
}

export function computeCustomerBalance(
  customerId: string,
  orders: Order[]
): CustomerBalance {
  const relevant = orders.filter(
    (o) => o.customerId === customerId && o.status === "active"
  );
  const totalInvoiced = relevant.reduce((s, o) => s + o.grandTotal, 0);
  const totalPaid = relevant.reduce((s, o) => s + o.paidAmount, 0);
  const dates = relevant.map((o) => o.date).filter(Boolean);
  return {
    customerId,
    totalInvoiced,
    totalPaid,
    outstanding: totalInvoiced - totalPaid,
    invoiceCount: relevant.length,
    lastPurchaseDate: dates.length ? Math.max(...dates) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Merge / de-duplicate (used during imports)
// ---------------------------------------------------------------------------

/**
 * Upserts a customer into a list by phone number.
 * If a customer with the same phone exists, merges locations (no duplicates).
 * Returns the updated list and whether the customer was created or updated.
 */
export function upsertCustomer(
  list: Customer[],
  incoming: Customer
): { list: Customer[]; created: boolean } {
  const existing = findByPhone(list, incoming.phone);
  if (!existing) {
    return { list: [...list, incoming], created: true };
  }

  // Merge locations (avoid duplicates by id)
  const existingLocIds = new Set(existing.locations.map((l) => l.id));
  const newLocs = (incoming.locations || []).filter(
    (l) => !existingLocIds.has(l.id)
  );
  const merged: Customer = {
    ...existing,
    locations: [...existing.locations, ...newLocs],
    companyName: incoming.companyName || existing.companyName,
    taxNumber: incoming.taxNumber || existing.taxNumber,
  };

  return {
    list: list.map((c) => (c.id === existing.id ? merged : c)),
    created: false,
  };
}
