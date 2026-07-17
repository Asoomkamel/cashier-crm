import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppSettings,
  CatalogItem,
  Customer,
  Expense,
  Order,
  OrderItem,
  PurchaseInvoice,
  StaffUser,
  SystemReminder,
} from "@/lib/types";

type JsonRecord = Record<string, unknown>;

export interface LegacySnapshotPayload {
  customers?: Customer[];
  catalog?: CatalogItem[];
  orders?: Order[];
  purchases?: PurchaseInvoice[];
  expenses?: Expense[];
  users?: StaffUser[];
  settings?: AppSettings;
  reminders?: SystemReminder[];
  urgentOrders?: unknown[];
  appointments?: unknown[];
  [key: string]: unknown;
}

export interface NormalizedSeedSummary {
  customers: number;
  products: number;
  profiles: number;
  invoices: number;
  invoiceItems: number;
  payments: number;
  stockAdjustments: number;
  reminders: number;
  warnings: string[];
}

export interface NormalizedSeedResult extends NormalizedSeedSummary {
  ok: boolean;
  dryRun: boolean;
  organizationId?: string;
  branchId?: string;
  migrationRunId?: string;
  error?: string;
}

export interface NormalizedSeedOptions {
  dryRun?: boolean;
  runLabel?: string;
  actorName?: string;
}

const EMPTY_SUMMARY: NormalizedSeedSummary = {
  customers: 0,
  products: 0,
  profiles: 0,
  invoices: 0,
  invoiceItems: 0,
  payments: 0,
  stockAdjustments: 0,
  reminders: 0,
  warnings: [],
};

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function text(value: unknown): string | null {
  const next = String(value ?? "").trim();
  return next ? next : null;
}

function num(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function dateIso(value: unknown): string {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return new Date(n).toISOString();
  const raw = text(value);
  if (raw) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function firstLocation(customer: Customer) {
  return customer.locations?.[0];
}

function invoiceNumber(order: Order): string {
  return text(order.invoiceNumber) || text(order.id) || `INV-${Date.now()}`;
}

export function buildNormalizedSeedPlan(payload: LegacySnapshotPayload): NormalizedSeedSummary {
  const customers = arr<Customer>(payload.customers);
  const catalog = arr<CatalogItem>(payload.catalog).filter((item) => item.type !== "service");
  const users = arr<StaffUser>(payload.users);
  const orders = arr<Order>(payload.orders).filter((order) => order.status !== "deleted" && order.type !== "quotation");
  const reminders = arr<SystemReminder>(payload.reminders);
  const warnings: string[] = [];

  const invoiceItems = orders.reduce((sum, order) => sum + arr(order.items).length, 0);
  const payments = orders.filter((order) => num(order.paidAmount) > 0).length;
  const stockAdjustments = catalog.filter((item) => typeof item.stock === "number" && Number(item.stock) !== 0).length;

  if (arr(payload.orders).some((order) => (order as Order).type === "quotation")) {
    warnings.push("عروض الأسعار لن تُرحّل كفواتير تشغيلية لأنها لا تخصم المخزون ولا تُعد مبيعات فعلية.");
  }
  if (catalog.length !== arr<CatalogItem>(payload.catalog).length) {
    warnings.push("الخدمات غير المخزنية لن تُرحّل إلى جدول المنتجات المخزنية.");
  }
  if (orders.some((order) => !order.invoiceNumber)) {
    warnings.push("بعض الفواتير لا تحتوي رقم فاتورة؛ سيتم استخدام المعرف القديم كرقم بديل.");
  }

  return {
    ...EMPTY_SUMMARY,
    customers: customers.length,
    products: catalog.length,
    profiles: users.length,
    invoices: orders.length,
    invoiceItems,
    payments,
    stockAdjustments,
    reminders: reminders.length,
    warnings,
  };
}

async function upsertOrganization(admin: SupabaseClient, payload: LegacySnapshotPayload) {
  const settings = payload.settings;
  const company = settings?.companyHeader;
  const name = text(company?.name) || "Default Organization";
  const slug = "default";

  const { data, error } = await admin
    .from("organizations")
    .upsert(
      {
        slug,
        name,
        tax_number: text(company?.taxNumber),
        phone: text(company?.phone),
        address: text(company?.address),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return String(data.id);
}

async function upsertBranch(admin: SupabaseClient, organizationId: string, payload: LegacySnapshotPayload) {
  const settings = payload.settings;
  const name = text(settings?.branches?.[0]) || "Main Branch";

  const { data, error } = await admin
    .from("branches")
    .upsert(
      {
        organization_id: organizationId,
        external_id: "default",
        name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,external_id" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return String(data.id);
}

async function recordMigrationRun(
  admin: SupabaseClient,
  organizationId: string,
  status: "started" | "completed" | "failed",
  label: string,
  summary?: JsonRecord,
  errorMessage?: string
): Promise<string | undefined> {
  if (status === "started") {
    const { data, error } = await admin
      .from("app_migration_runs")
      .insert({ organization_id: organizationId, label, status, summary: summary || {} })
      .select("id")
      .single();
    if (error) throw error;
    return String(data.id);
  }

  return undefined;
}

async function finishMigrationRun(
  admin: SupabaseClient,
  runId: string | undefined,
  status: "completed" | "failed",
  summary: JsonRecord,
  errorMessage?: string
) {
  if (!runId) return;
  await admin
    .from("app_migration_runs")
    .update({ status, summary, error_message: errorMessage || null, finished_at: new Date().toISOString() })
    .eq("id", runId);
}

async function mapExternalIds(admin: SupabaseClient, table: string, organizationId: string): Promise<Map<string, string>> {
  const { data, error } = await admin.from(table).select("id,external_id").eq("organization_id", organizationId).not("external_id", "is", null);
  if (error) throw error;
  return new Map((data || []).map((row: JsonRecord) => [String(row.external_id), String(row.id)]));
}

export async function seedNormalizedData(
  admin: SupabaseClient,
  payload: LegacySnapshotPayload,
  options: NormalizedSeedOptions = {}
): Promise<NormalizedSeedResult> {
  const dryRun = Boolean(options.dryRun);
  const plan = buildNormalizedSeedPlan(payload);
  if (dryRun) return { ok: true, dryRun: true, ...plan };

  let runId: string | undefined;
  let organizationId = "";
  let branchId = "";

  try {
    organizationId = await upsertOrganization(admin, payload);
    branchId = await upsertBranch(admin, organizationId, payload);
    runId = await recordMigrationRun(admin, organizationId, "started", options.runLabel || "legacy-snapshot-seed", plan as unknown as JsonRecord);

    const users = arr<StaffUser>(payload.users);
    if (users.length > 0) {
      const profileRows = users.map((user) => ({
        organization_id: organizationId,
        branch_id: branchId,
        external_id: user.id,
        display_name: user.name || user.phone || user.id,
        phone: text(user.phone),
        role: user.role || "technician",
        specialties: user.specialties || [],
        is_active: true,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await admin.from("profiles").upsert(profileRows, { onConflict: "organization_id,external_id" });
      if (error) throw error;
    }

    const customers = arr<Customer>(payload.customers);
    if (customers.length > 0) {
      const rows = customers.map((customer) => {
        const loc = firstLocation(customer);
        return {
          organization_id: organizationId,
          branch_id: branchId,
          external_id: customer.id,
          name: customer.name || customer.phone || customer.id,
          phone: text(customer.phone),
          type: customer.type || "customer",
          company_name: text(customer.companyName),
          tax_number: text(customer.taxNumber),
          city: text(loc?.city),
          district: text(loc?.district),
          address: text(loc?.address),
          google_maps_url: text(loc?.googleMapsUrl || loc?.mapLink),
          created_at: dateIso(customer.createdAt),
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await admin.from("customers").upsert(rows, { onConflict: "organization_id,external_id" });
      if (error) throw error;
    }

    const products = arr<CatalogItem>(payload.catalog).filter((item) => item.type !== "service");
    if (products.length > 0) {
      const rows = products.map((item) => ({
        organization_id: organizationId,
        branch_id: branchId,
        external_id: item.id,
        name: item.name || item.sku || item.id,
        item_type: item.type || "product",
        sku: text(item.sku),
        barcode: text(item.barcode),
        category: text(item.category),
        unit: text(item.unit),
        sale_price: num(item.price),
        cost_price: num(item.costPrice),
        tax_rate: num(item.tax),
        low_stock_threshold: num(item.lowStockThreshold, 5),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await admin.from("products").upsert(rows, { onConflict: "organization_id,external_id" });
      if (error) throw error;
    }

    const customerMap = await mapExternalIds(admin, "customers", organizationId);
    const productMap = await mapExternalIds(admin, "products", organizationId);
    const profileMap = await mapExternalIds(admin, "profiles", organizationId);

    const invoices = arr<Order>(payload.orders).filter((order) => order.status !== "deleted" && order.type !== "quotation");
    for (const order of invoices) {
      const technician = users.find((user) => user.name === order.technicianName);
      const { data: invoiceData, error: invoiceError } = await admin
        .from("invoices")
        .upsert(
          {
            organization_id: organizationId,
            branch_id: branchId,
            external_id: order.id,
            invoice_number: invoiceNumber(order),
            customer_id: order.customerId ? customerMap.get(order.customerId) || null : null,
            customer_name: text(order.customerName),
            invoice_type: order.type || "tax_invoice",
            payment_method: order.paymentMethod || "cash",
            paid_amount: num(order.paidAmount),
            remaining_amount: num(order.remainingAmount),
            total_before_tax: num(order.totalBeforeTax),
            total_tax: num(order.totalTax),
            total_discount: num(order.totalDiscount),
            grand_total: num(order.grandTotal),
            technician_id: technician ? profileMap.get(technician.id) || null : null,
            technician_name: text(order.technicianName),
            status: order.status || "active",
            issued_at: dateIso(order.date),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,external_id" }
        )
        .select("id")
        .single();
      if (invoiceError) throw invoiceError;

      const invoiceId = String(invoiceData.id);
      const { error: deleteItemsError } = await admin.from("invoice_items").delete().eq("invoice_id", invoiceId);
      if (deleteItemsError) throw deleteItemsError;

      const itemRows = arr<OrderItem>(order.items).map((item) => ({
        organization_id: organizationId,
        invoice_id: invoiceId,
        product_id: item.catalogId ? productMap.get(item.catalogId) || null : null,
        item_name: item.name || item.catalogId || "Item",
        quantity: num(item.qty, 1),
        unit_price: num(item.price),
        discount: num(item.discount),
        tax_rate: num(item.tax),
        line_total: Math.max(0, num(item.qty, 1) * num(item.price) - num(item.discount)),
      }));
      if (itemRows.length > 0) {
        const { error: itemError } = await admin.from("invoice_items").insert(itemRows);
        if (itemError) throw itemError;
      }

      if (num(order.paidAmount) > 0) {
        const { error: paymentError } = await admin.from("payments").upsert(
          {
            organization_id: organizationId,
            branch_id: branchId,
            external_id: `${order.id}:payment`,
            invoice_id: invoiceId,
            customer_id: order.customerId ? customerMap.get(order.customerId) || null : null,
            amount: num(order.paidAmount),
            method: order.paymentMethod || "cash",
            paid_at: dateIso(order.date),
          },
          { onConflict: "organization_id,external_id" }
        );
        if (paymentError) throw paymentError;
      }
    }

    const stockRows = products
      .filter((item) => typeof item.stock === "number" && Number(item.stock) !== 0 && productMap.get(item.id))
      .map((item) => ({
        organization_id: organizationId,
        branch_id: branchId,
        product_id: productMap.get(item.id) as string,
        movement_type: "ADJUSTMENT",
        quantity: num(item.stock),
        unit_cost: num(item.costPrice),
        tax_rate: num(item.tax),
        reference_type: "legacy_snapshot",
        reference_number: item.sku || item.name,
        notes: "Initial stock imported from legacy snapshot.",
        idempotency_key: `seed:stock:${item.id}`,
      }));
    if (stockRows.length > 0) {
      const { error } = await admin.from("stock_movements").upsert(stockRows, { onConflict: "organization_id,idempotency_key" });
      if (error) throw error;
    }

    const summary = { ...plan, organizationId, branchId };
    await finishMigrationRun(admin, runId, "completed", summary as unknown as JsonRecord);
    return { ok: true, dryRun: false, organizationId, branchId, migrationRunId: runId, ...plan };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishMigrationRun(admin, runId, "failed", { ...plan, organizationId, branchId } as unknown as JsonRecord, message);
    return { ok: false, dryRun: false, organizationId, branchId, migrationRunId: runId, ...plan, error: message };
  }
}
