import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";

/**
 * Saves the caller's full JSON dataset (the same shape produced by
 * Settings → "Export data") into Supabase's business_data table, scoped
 * to their business via their bearer token.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
 * SUPABASE_SERVICE_ROLE_KEY. Not called by the running app by default —
 * see README Phase 5 section for how to wire it into lib/storage.ts.
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = createServiceRoleClient();

  if (!url || !anonKey || !admin) {
    return Response.json({ error: "Supabase is not configured on this server." }, { status: 501 });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) return Response.json({ error: "Missing bearer token." }, { status: 401 });

    // Verify the token belongs to a real, current Supabase session.
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return Response.json({ error: "Invalid or expired session." }, { status: 401 });

    const { data: membership } = await admin
      .from("business_members")
      .select("business_id")
      .eq("user_id", userData.user.id)
      .limit(1)
      .maybeSingle();
    if (!membership) return Response.json({ error: "No business membership found for this user." }, { status: 403 });

    const payload = await req.json();
    const { error: upsertErr } = await admin
      .from("business_data")
      .upsert({ business_id: membership.business_id, payload, updated_at: new Date().toISOString() });
    if (upsertErr) return Response.json({ error: upsertErr.message }, { status: 500 });

    return Response.json({ saved: true });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
