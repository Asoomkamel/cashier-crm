import type { NextRequest } from "next/server";
import { requireServerActionSecret, guardResponse } from "@/lib/modules/security/serverGuards";

export const runtime = "nodejs";

// Expenses are stored in localStorage only (not migrated to PostgreSQL yet).
// This endpoint exists for future use and returns a clear message.
export async function GET(req: NextRequest) {
  const guardErr = requireServerActionSecret(req);
  if (guardErr) return guardResponse(guardErr);

  return Response.json({
    ok: true,
    mode: "local",
    message: "Expenses are not yet migrated to PostgreSQL. Use local data from localStorage.",
  });
}
