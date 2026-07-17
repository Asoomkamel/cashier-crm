import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";

/** Loads the caller's business_data payload from Supabase. See save/route.ts for setup requirements. */
export async function GET(req: NextRequest) {
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

    const { data, error } = await admin
      .from("business_data")
      .select("payload, updated_at")
      .eq("business_id", membership.business_id)
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ payload: data?.payload || {}, updatedAt: data?.updated_at || null });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
