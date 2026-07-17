import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// Best-effort in-memory lockout. Resets on cold start / redeploy — this is
// a lightweight deterrent for a small internal tool, not a substitute for
// a real rate-limiting service if this app ever needs stronger guarantees.
const attempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ownerPhones = (process.env.OWNER_LOGIN_PHONES || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const ownerPassword = process.env.OWNER_LOGIN_PASSWORD || "";

  if (ownerPhones.length === 0 || !ownerPassword) {
    return Response.json({ error: "Owner login is not configured on this server." }, { status: 501 });
  }

  const { phone, password } = await req.json().catch(() => ({ phone: "", password: "" }));
  if (!phone || !password) return Response.json({ error: "Phone and password are required." }, { status: 400 });

  if (!ownerPhones.includes(phone)) {
    return Response.json({ error: "This phone number is not an owner number." }, { status: 403 });
  }

  const now = Date.now();
  const rec = attempts.get(phone);
  if (rec && rec.lockedUntil > now) {
    const secondsLeft = Math.ceil((rec.lockedUntil - now) / 1000);
    return Response.json({ error: `Too many attempts. Try again in ${secondsLeft}s.` }, { status: 429 });
  }

  if (password !== ownerPassword) {
    const count = (rec?.count || 0) + 1;
    const lockedUntil = count >= MAX_ATTEMPTS ? now + LOCK_MS : 0;
    attempts.set(phone, { count, lockedUntil });
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  attempts.delete(phone);
  return Response.json({ ok: true });
}
