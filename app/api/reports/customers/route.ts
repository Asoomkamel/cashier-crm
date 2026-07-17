import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseClient";
import { requireServerActionSecret, guardResponse } from "@/lib/modules/security/serverGuards";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const guardErr = requireServerActionSecret(req);
  if (guardErr) return guardResponse(guardErr);

  const admin = createServiceRoleClient();
  if (!admin) return Response.json({ ok: false, mode: "local" });

  const orgId = process.env.NEXT_PUBLIC_ORG_ID || new URL(req.url).searchParams.get("org_id") || "";
  if (!orgId) return Response.json({ ok: false, error: "ORG_ID required." }, { status: 400 });

  const { data } = await admin
    .from("customer_balances")
    .select("customer_id, customer_name, invoice_count, total_invoiced, total_paid, outstanding, last_invoice_at")
    .eq("organization_id", orgId)
    .order("outstanding", { ascending: false })
    .limit(500);

  return Response.json({ ok: true, mode: "server", customers: data || [] });
}
