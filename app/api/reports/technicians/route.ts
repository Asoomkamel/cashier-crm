import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseClient";
import { requireServerActionSecret, guardResponse } from "@/lib/modules/security/serverGuards";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guardErr = requireServerActionSecret(req);
  if (guardErr) return guardResponse(guardErr);

  const admin = createServiceRoleClient();
  if (!admin) return Response.json({ ok: false, mode: "local" });

  const { searchParams } = new URL(req.url);
  const orgId    = process.env.NEXT_PUBLIC_ORG_ID || searchParams.get("org_id") || "";
  const techName = searchParams.get("technician_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo   = searchParams.get("date_to");

  if (!orgId) return Response.json({ ok: false, error: "ORG_ID required." }, { status: 400 });

  // Technician financial transactions
  let finQuery = admin
    .from("technician_financial_transactions")
    .select("technician_name, transaction_type, amount, created_at")
    .eq("organization_id", orgId);

  if (techName) finQuery = finQuery.eq("technician_name", techName);
  if (dateFrom) finQuery = finQuery.gte("created_at", dateFrom);
  if (dateTo)   finQuery = finQuery.lte("created_at", dateTo + "T23:59:59");

  const { data: finLogs } = await finQuery.limit(2000);

  // Group by technician
  const byTech: Record<string, { commission: number; marketing: number; cashCollection: number }> = {};
  (finLogs || []).forEach((log: Record<string, unknown>) => {
    const name = String(log.technician_name || "Unknown");
    if (!byTech[name]) byTech[name] = { commission: 0, marketing: 0, cashCollection: 0 };
    const amt = Number(log.amount);
    if (log.transaction_type === "completion_commission") byTech[name].commission      += amt;
    if (log.transaction_type === "marketing_commission")  byTech[name].marketing       += amt;
    if (log.transaction_type === "cash_collection")       byTech[name].cashCollection  += amt;
  });

  // Technician inventory
  const { data: invBalances } = await admin
    .from("technician_inventory_balances")
    .select("technician_name, current_qty, stock_value")
    .eq("organization_id", orgId);

  const invByTech: Record<string, { totalQty: number; totalValue: number }> = {};
  (invBalances || []).forEach((b: Record<string, unknown>) => {
    const name = String(b.technician_name || "Unknown");
    if (!invByTech[name]) invByTech[name] = { totalQty: 0, totalValue: 0 };
    invByTech[name].totalQty   += Number(b.current_qty);
    invByTech[name].totalValue += Number(b.stock_value);
  });

  const technicians = Object.entries(byTech).map(([name, fin]) => ({
    technicianName:       name,
    completionCommission: fin.commission,
    marketingCommission:  fin.marketing,
    cashCollected:        fin.cashCollection,
    inventoryQty:         invByTech[name]?.totalQty  || 0,
    inventoryValue:       invByTech[name]?.totalValue || 0,
  }));

  return Response.json({ ok: true, mode: "server", technicians });
}
