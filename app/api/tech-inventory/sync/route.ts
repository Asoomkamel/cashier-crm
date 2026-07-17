/**
 * app/api/tech-inventory/sync/route.ts
 *
 * Syncs technician inventory from local → Supabase technician_inventory table.
 * POST: upsert all tech inventory items
 * GET:  read current balances from technician_inventory_balances view
 */

import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseClient";
import { requireServerActionSecret, guardResponse } from "@/lib/modules/security/serverGuards";

export const runtime = "nodejs";

const ORG_ID    = process.env.NEXT_PUBLIC_ORG_ID    || "";
const BRANCH_ID = process.env.NEXT_PUBLIC_BRANCH_ID || "";

export async function POST(req: NextRequest) {
  const guardErr = requireServerActionSecret(req);
  if (guardErr) return guardResponse(guardErr);

  const admin = createServiceRoleClient();
  if (!admin || !ORG_ID) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 200 });
  }

  const body = await req.json().catch(() => ({}));
  const items: Record<string, unknown>[] = body.techInventory || [];
  const logs:  Record<string, unknown>[] = body.techInventoryLogs || [];

  if (items.length === 0) {
    return Response.json({ ok: true, synced: 0, message: "No items to sync." });
  }

  // Find product UUIDs by external_id
  const catalogIds = [...new Set(items.map(i => String(i.catalogId || "")))].filter(Boolean);
  const { data: products } = await admin
    .from("products")
    .select("id, external_id")
    .eq("organization_id", ORG_ID)
    .in("external_id", catalogIds);

  const productIdMap = new Map(
    (products || []).map((p: Record<string, unknown>) => [String(p.external_id), String(p.id)])
  );

  // Find staff profile UUIDs by external_id
  const techIds = [...new Set(items.map(i => String(i.technicianId || "")))].filter(Boolean);
  const { data: profiles } = await admin
    .from("staff_profiles")
    .select("id, external_id")
    .eq("organization_id", ORG_ID)
    .in("external_id", techIds);

  const techIdMap = new Map(
    (profiles || []).map((p: Record<string, unknown>) => [String(p.external_id), String(p.id)])
  );

  // Build upsert rows
  const rows = items.map(item => ({
    organization_id: ORG_ID,
    branch_id:       BRANCH_ID || null,
    external_id:     String(item.id || ""),
    technician_id:   techIdMap.get(String(item.technicianId || "")) || null,
    product_id:      productIdMap.get(String(item.catalogId || "")) || null,
    item_name:       String(item.itemName || ""),
    qty:             Number(item.qty ?? 0),
    updated_at:      new Date().toISOString(),
  })).filter(r => r.external_id);

  if (rows.length === 0) {
    return Response.json({ ok: true, synced: 0, message: "No valid rows to upsert." });
  }

  const { error, count } = await admin
    .from("technician_inventory")
    .upsert(rows, { onConflict: "organization_id,technician_id,product_id" });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, synced: count ?? rows.length, logs: logs.length });
}

export async function GET(req: NextRequest) {
  const guardErr = requireServerActionSecret(req);
  if (guardErr) return guardResponse(guardErr);

  const admin = createServiceRoleClient();
  if (!admin || !ORG_ID) return Response.json({ ok: false, mode: "local" });

  const { data, error } = await admin
    .from("technician_inventory_balances")
    .select("*")
    .eq("organization_id", ORG_ID);

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, mode: "server", balances: data || [] });
}
