/**
 * app/api/work-orders/sync/route.ts
 *
 * Syncs urgent orders and appointments from local snapshot → PostgreSQL.
 * Idempotent: uses external_id ON CONFLICT DO UPDATE.
 *
 * POST body: { urgentOrders: ServiceOrder[], appointments: ServiceOrder[] }
 */

import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseClient";
import { requireServerActionSecret, guardResponse } from "@/lib/modules/security/serverGuards";

export const runtime = "nodejs";

const ORG_ID    = process.env.NEXT_PUBLIC_ORG_ID    || "";
const BRANCH_ID = process.env.NEXT_PUBLIC_BRANCH_ID || "";

function mapOrder(o: Record<string, unknown>, source: "urgent" | "appointment") {
  return {
    organization_id:      ORG_ID,
    branch_id:            BRANCH_ID || null,
    external_id:          String(o.id || ""),
    request_number:       o.requestNumber ? Number(o.requestNumber) : null,
    customer_name:        String(o.customerName || ""),
    customer_phone:       String(o.customerPhone || ""),
    issue:                String(o.issue || o.serviceType || ""),
    status:               String(o.status || "pending"),
    scheduled_at:         o.date ? new Date(Number(o.date)).toISOString() : null,
    updated_at:           new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  const guardErr = requireServerActionSecret(req);
  if (guardErr) return guardResponse(guardErr);

  const admin = createServiceRoleClient();
  if (!admin) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 200 });
  }
  if (!ORG_ID) {
    return Response.json({ ok: false, error: "NEXT_PUBLIC_ORG_ID not configured." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const urgentOrders:  Record<string, unknown>[] = body.urgentOrders  || [];
  const appointments:  Record<string, unknown>[] = body.appointments  || [];
  const allOrders = [...urgentOrders, ...appointments];

  if (allOrders.length === 0) {
    return Response.json({ ok: true, synced: 0 });
  }

  const rows = allOrders.map(o => mapOrder(o, "urgent"));

  const { error, count } = await admin
    .from("work_orders")
    .upsert(rows, { onConflict: "organization_id,external_id" });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, synced: count ?? rows.length });
}

export async function GET(req: NextRequest) {
  const guardErr = requireServerActionSecret(req);
  if (guardErr) return guardResponse(guardErr);

  const admin = createServiceRoleClient();
  if (!admin || !ORG_ID) {
    return Response.json({ ok: false, mode: "local" });
  }

  const { data, error } = await admin
    .from("work_orders")
    .select("*")
    .eq("organization_id", ORG_ID)
    .order("scheduled_at", { ascending: false })
    .limit(500);

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, workOrders: data || [] });
}
