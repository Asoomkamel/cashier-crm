import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseClient";
import { requireServerActionSecret, guardResponse } from "@/lib/modules/security/serverGuards";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guardErr = requireServerActionSecret(req);
  if (guardErr) return guardResponse(guardErr);

  const admin = createServiceRoleClient();
  if (!admin) {
    return Response.json({ ok: false, error: "Supabase not configured.", mode: "local" }, { status: 200 });
  }

  const { searchParams } = new URL(req.url);
  const orgId      = process.env.NEXT_PUBLIC_ORG_ID || searchParams.get("org_id") || "";
  const dateFrom   = searchParams.get("date_from");
  const dateTo     = searchParams.get("date_to");
  const branchId   = searchParams.get("branch_id");
  const techName   = searchParams.get("technician_id");
  const customerId = searchParams.get("customer_id");
  const method     = searchParams.get("payment_method");

  if (!orgId) {
    return Response.json({ ok: false, error: "NEXT_PUBLIC_ORG_ID not configured." }, { status: 400 });
  }

  let query = admin
    .from("invoices")
    .select(`
      id, invoice_number, customer_name, invoice_type, payment_method,
      paid_amount, remaining_amount, total_before_tax, total_tax,
      total_discount, grand_total, technician_name, status, issued_at,
      invoice_items(item_name, quantity, unit_price, discount, tax_rate, line_total)
    `)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("invoice_type", ["tax_invoice", "simplified_invoice"])
    .order("issued_at", { ascending: false });

  if (dateFrom)   query = query.gte("issued_at", dateFrom);
  if (dateTo)     query = query.lte("issued_at", dateTo + "T23:59:59");
  if (branchId)   query = query.eq("branch_id", branchId);
  if (techName)   query = query.eq("technician_name", techName);
  if (customerId) query = query.eq("customer_id", customerId);
  if (method)     query = query.eq("payment_method", method);

  const { data, error } = await query.limit(1000);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Aggregate
  const invoices = data || [];
  const totalRevenue   = invoices.reduce((s, i) => s + Number(i.grand_total),    0);
  const totalTax       = invoices.reduce((s, i) => s + Number(i.total_tax),      0);
  const totalDiscount  = invoices.reduce((s, i) => s + Number(i.total_discount), 0);
  const totalPaid      = invoices.reduce((s, i) => s + Number(i.paid_amount),    0);
  const byMethod: Record<string, number> = {};
  invoices.forEach(i => { byMethod[i.payment_method] = (byMethod[i.payment_method] || 0) + Number(i.grand_total); });

  return Response.json({
    ok: true,
    mode: "server",
    summary: { totalRevenue, totalTax, totalDiscount, totalPaid, invoiceCount: invoices.length, byMethod },
    invoices,
  });
}
