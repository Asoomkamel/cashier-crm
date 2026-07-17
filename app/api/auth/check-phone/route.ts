import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Tells the login screen whether a phone number should use the fixed
 * owner password. The actual OWNER_LOGIN_PHONES
 * list stays server-side only — the client never sees it, only a boolean.
 */
export async function POST(req: NextRequest) {
  const ownerPhones = (process.env.OWNER_LOGIN_PHONES || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const { phone } = await req.json().catch(() => ({ phone: "" }));
  if (!phone) return Response.json({ error: "Phone number is required." }, { status: 400 });

  return Response.json({ ownerMode: ownerPhones.includes(phone) });
}
