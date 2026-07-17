import type { NextRequest } from "next/server";
import { toE164Saudi } from "@/lib/phone";

export const runtime = "nodejs";

/**
 * Sends a WhatsApp OTP via Authentica (https://api.authentica.sa) for
 * staff login. Matches Authentica's real API: X-Authorization header
 * (not Basic auth), a required "method" field, and E.164 phone format.
 * See https://github.com/AuthenticaSA/Authentica for reference.
 *
 * Falls back cleanly (501) if AUTHENTICA_API_KEY isn't set — LoginScreen.tsx
 * then uses local phone+PIN login instead, so the app keeps working with
 * zero configuration.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.AUTHENTICA_API_KEY;
  const baseUrl = process.env.AUTHENTICA_BASE_URL || "https://api.authentica.sa";

  if (!apiKey) {
    return Response.json(
      { error: "WhatsApp OTP is not configured on this server. Falling back to local phone+PIN login." },
      { status: 501 }
    );
  }

  try {
    const { phone } = await req.json();
    if (!phone) return Response.json({ error: "Phone number is required." }, { status: 400 });

    const res = await fetch(`${baseUrl}/api/v2/send-otp`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Authorization": apiKey,
      },
      body: JSON.stringify({ method: "whatsapp", phone: toE164Saudi(phone) }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json({ error: data?.message || `Authentica error (${res.status})` }, { status: 502 });
    }

    return Response.json({ sent: true });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
