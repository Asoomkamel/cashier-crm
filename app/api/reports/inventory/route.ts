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
  const orgId    = process.env.NEXT_PUBLIC_ORG_ID || searchParams.get("org_id") || "";
  const category = searchParams.get("category");

  if (!orgId) return Response.json({ ok: false, error: "ORG_ID not configured." }, { status: 400 });

  let query = admin
    .from("products")
    .select("id, name, sku, category, item_type, sale_price, cost_price, low_stock_threshold, external_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("name");

  if (category) query = query.eq("category", category);

  const { data: products, error } = await query.limit(500);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Get stock balances from view
  const { data: balances } = await admin
    .from("stock_balances")
    .select("product_id, current_stock")
    .eq("organization_id", orgId);

  const balanceMap: Record<string, number> = {};
  (balances || []).forEach((b: Record<string, unknown>) => {
    balanceMap[String(b.product_id)] = Number(b.current_stock);
  });

  const rows = (products || []).map(p => ({
    ...p,
    currentStock: balanceMap[p.id] ?? 0,
    stockValue:   (balanceMap[p.id] ?? 0) * Number(p.cost_price),
    isLowStock:   (balanceMap[p.id] ?? 0) <= Number(p.low_stock_threshold ?? 5),
  }));

  return Response.json({ ok: true, mode: "server", products: rows });
}
