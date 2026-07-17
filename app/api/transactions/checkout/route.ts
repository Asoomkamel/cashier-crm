import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseClient";
import {
  NormalizedCheckoutCommand,
  normalizeCheckoutCommand,
  validateNormalizedCheckoutCommand,
} from "@/lib/modules/database/normalizedCheckout";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const admin = createServiceRoleClient();
  if (!admin) {
    return Response.json(
      {
        ok: false,
        configured: false,
        setupRequired: true,
        error: "Supabase server-side configuration is incomplete.",
      },
      { status: 501 }
    );
  }

  let command: NormalizedCheckoutCommand;
  try {
    command = normalizeCheckoutCommand((await req.json()) as NormalizedCheckoutCommand);
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const validationErrors = validateNormalizedCheckoutCommand(command);
  if (validationErrors.length > 0) {
    return Response.json({ ok: false, error: validationErrors.join(" ") }, { status: 400 });
  }

  const { data, error } = await admin.rpc("create_checkout_transaction", { p_command: command });
  if (error) {
    const message = error.message || "Checkout transaction failed.";
    const setupRequired =
      message.toLowerCase().includes("function") ||
      message.toLowerCase().includes("does not exist") ||
      message.toLowerCase().includes("schema cache");
    return Response.json(
      {
        ok: false,
        configured: true,
        setupRequired,
        error: message,
        recommendedMigration: setupRequired ? "supabase/09_checkout_transaction_rpc.sql" : undefined,
      },
      { status: setupRequired ? 501 : 500 }
    );
  }

  const result = (data || {}) as Record<string, any>;
  return Response.json({
    ok: Boolean(result.ok),
    invoiceId: result.invoice_id || result.invoiceId,
    invoiceNumber: result.invoice_number || result.invoiceNumber,
    idempotencyKey: result.idempotency_key || result.idempotencyKey,
    replayed: Boolean(result.replayed),
    dryRun: Boolean(result.dryRun || result.dry_run),
  });
}
