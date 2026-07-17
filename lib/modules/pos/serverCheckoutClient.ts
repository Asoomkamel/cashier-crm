import {
  NormalizedCheckoutCommand,
  NormalizedCheckoutResponse,
  normalizeCheckoutCommand,
  validateNormalizedCheckoutCommand,
} from "@/lib/modules/database/normalizedCheckout";

export interface ServerCheckoutResult extends NormalizedCheckoutResponse {
  status?: number;
  setupRequired?: boolean;
  message?: string;
}

async function readJson(res: Response): Promise<Record<string, any>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function submitServerCheckoutTransaction(command: NormalizedCheckoutCommand): Promise<ServerCheckoutResult> {
  const normalized = normalizeCheckoutCommand(command);
  const validationErrors = validateNormalizedCheckoutCommand(normalized);
  if (validationErrors.length > 0) {
    return { ok: false, error: validationErrors.join(" "), message: validationErrors.join(" ") };
  }

  try {
    const res = await fetch("/api/transactions/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    });
    const data = await readJson(res);
    return {
      ok: Boolean(data.ok && res.ok),
      status: res.status,
      setupRequired: Boolean(data.setupRequired),
      invoiceId: data.invoiceId,
      invoiceNumber: data.invoiceNumber,
      idempotencyKey: data.idempotencyKey,
      replayed: Boolean(data.replayed),
      error: data.error,
      message: data.message || data.error,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network error.", message: err?.message || "Network error." };
  }
}
