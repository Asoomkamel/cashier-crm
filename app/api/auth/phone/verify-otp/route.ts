import type { NextRequest } from "next/server";
import { toE164Saudi } from "@/lib/phone";

export const runtime = "nodejs";

/**
 * Verifies a WhatsApp OTP via Authentica. Matches Authentica's real API
 * shape (X-Authorization header, E.164 phone). On success, the client
 * (LoginScreen.tsx) looks up a matching staff record in the app's local
 * users list — this app authenticates against that local list, not a
 * separate Authentica-side user, so this route's only job is confirming
 * "yes, this phone number is really the person typing it."
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.AUTHENTICA_API_KEY;
  const baseUrl = process.env.AUTHENTICA_BASE_URL || "https://api.authentica.sa";

  if (!apiKey) {
    return Response.json({ error: "WhatsApp OTP is not configured on this server." }, { status: 501 });
  }

  try {
    const { phone, otp } = await req.json();
    if (!phone || !otp) return Response.json({ error: "Phone and OTP are required." }, { status: 400 });

    const res = await fetch(`${baseUrl}/api/v2/verify-otp`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Authorization": apiKey,
      },
      body: JSON.stringify({ phone: toE164Saudi(phone), otp }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json({ error: data?.message || "Invalid or expired OTP." }, { status: 401 });
    }

    return Response.json({ ok: true });
  } catch (err: any) {
    return Response.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
