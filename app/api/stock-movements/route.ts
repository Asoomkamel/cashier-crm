import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseClient";
import { requireServerActionSecret, guardResponse } from "@/lib/modules/security/serverGuards";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guardErr = requireServerActionSecret(req);
  if (guardErr) return guardResponse(guardErr);

  const admin = createServiceRoleClient();
  const orgId = process.env.NEXT_PUBLIC_ORG_ID || "";
  if (!admin || !orgId) return Response.json({ ok: false, mode: "local", movements: [] });

  const { searchParams } = new URL(req.url);
  const dateFrom    = searchParams.get("date_from");
  const dateTo      = searchParams.get("date_to");
  const mvType      = searchParams.get("movement_type");
  const productId   = searchParams.get("product_id");
  const techId      = searchParams.get("technician_id");

  let query = admin
    .from("stock_movements")
    .select("id, product_id, technician_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (dateFrom)  query = query.gte("created_at", dateFrom);
  if (dateTo)    query = query.lte("created_at", dateTo + "T23:59:59");
  if (mvType)    query = query.eq("movement_type", mvType);
  if (productId) query = query.eq("product_id", productId);
  if (techId)    query = query.eq("technician_id", techId);

  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, mode: "server", movements: data || [] });
}
