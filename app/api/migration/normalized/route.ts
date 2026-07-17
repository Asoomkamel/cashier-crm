import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseClient";
import { LegacySnapshotPayload, seedNormalizedData } from "@/lib/modules/database/normalizedSeed";
import {
  requireServerActionSecret,
  requireAdminActionCode,
  guardResponse,
  getRequestActor,
} from "@/lib/modules/security/serverGuards";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Require server secret for automated calls or admin code for UI calls
  const secretErr = requireServerActionSecret(req);
  const adminErr  = await requireAdminActionCode(req);
  if (secretErr && adminErr) return guardResponse(adminErr); // either one passes

  const actor = getRequestActor(req);
  const admin = createServiceRoleClient();
  if (!admin) {
    return Response.json(
      {
        ok: false,
        setupRequired: true,
        error: "Supabase service-role configuration is incomplete.",
      },
      { status: 501 }
    );
  }

  let body: { payload?: LegacySnapshotPayload; dryRun?: boolean; adminCode?: string; runLabel?: string };
  try {
    body = (await req.json()) as { payload?: LegacySnapshotPayload; dryRun?: boolean; adminCode?: string; runLabel?: string };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = body.payload;
  if (!payload || typeof payload !== "object") {
    return Response.json({ ok: false, error: "payload is required." }, { status: 400 });
  }

  if (!body.dryRun) {
    const expectedCode = String(payload.settings?.adminPassword || "");
    if (!expectedCode || body.adminCode !== expectedCode) {
      return Response.json({ ok: false, error: "Admin reset/action code is required for migration." }, { status: 403 });
    }
  }

  const result = await seedNormalizedData(admin, payload, {
    dryRun: Boolean(body.dryRun),
    runLabel: body.runLabel || "manual-normalized-seed",
  });

  return Response.json(result, { status: result.ok ? 200 : 500 });
}
