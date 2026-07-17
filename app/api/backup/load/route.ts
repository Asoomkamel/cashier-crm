import { createServiceRoleClient } from "@/lib/supabaseClient";

export const runtime = "nodejs";

/** Loads the single backup row saved by app/api/backup/save. See that file for setup requirements. */
export async function GET() {
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
    const { data, error } = await admin
      .from("app_backups")
      .select("payload, updated_at")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      const message = error.message || "Supabase load failed.";
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
    if (!data) return Response.json({ payload: null, updatedAt: null });

    return Response.json({ payload: data.payload, updatedAt: data.updated_at });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
