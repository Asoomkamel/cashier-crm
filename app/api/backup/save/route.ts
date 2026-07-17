import type { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";
/**
 * Saves the full app snapshot to app_backups in Supabase.
 * Called automatically from the browser (store.tsx) on every change.
 *
 * Security note: Not protected by SERVER_ACTION_SECRET because it is called
 * from the client. The backup is a JSON snapshot — sensitive operations
 * (migration, checkout) are protected separately.
 */
export async function POST(req: NextRequest) {
  const admin = createServiceRoleClient();
  if (!admin) {
    return Response.json(
      {
        error: "Supabase is not configured on this server (missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
        configured: false,
      },
      { status: 501 }
    );
  }

  try {
    const payload = await req.json();
    const { error } = await admin
      .from("app_backups")
      .upsert({ id: "default", payload, updated_at: new Date().toISOString() }, { onConflict: "id" });

    if (error) {
      const message = error.message || "Supabase save failed.";
      const tableMissing = message.toLowerCase().includes("app_backups") || message.toLowerCase().includes("does not exist");
      return Response.json(
        {
          error: message,
          configured: true,
          setupRequired: tableMissing,
        },
        { status: 500 }
      );
    }
    return Response.json({ saved: true, savedAt: new Date().toISOString() });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
