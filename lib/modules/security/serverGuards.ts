/**
 * lib/modules/security/serverGuards.ts
 *
 * Centralized API security helpers for server-side routes.
 *
 * IMPORTANT:
 * - Never put SUPABASE_SERVICE_ROLE_KEY or SERVER_ACTION_SECRET in client code.
 * - Never prefix these with NEXT_PUBLIC_.
 * - All checks happen server-side only (Next.js API routes / route handlers).
 *
 * Environment variables used (all server-side only):
 *   SERVER_ACTION_SECRET   — shared secret for automated/internal API calls
 *   ADMIN_ACTION_CODE      — admin verification code for sensitive ops
 */

import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Typed response helpers
// ---------------------------------------------------------------------------

export interface GuardError {
  ok: false;
  error: string;
  code: "MISSING_SECRET" | "UNAUTHORIZED" | "FORBIDDEN" | "MISSING_PERMISSION" | "INVALID_ADMIN_CODE" | "SERVER_ONLY";
  status: number;
}

export function guardError(code: GuardError["code"], message?: string): GuardError {
  const defaults: Record<GuardError["code"], { msg: string; status: number }> = {
    MISSING_SECRET:      { msg: "Missing server action secret.",     status: 401 },
    UNAUTHORIZED:        { msg: "Unauthorized.",                     status: 401 },
    FORBIDDEN:           { msg: "Forbidden.",                        status: 403 },
    MISSING_PERMISSION:  { msg: "Missing required permission.",      status: 403 },
    INVALID_ADMIN_CODE:  { msg: "Invalid admin action code.",        status: 403 },
    SERVER_ONLY:         { msg: "This endpoint is server-side only.",status: 400 },
  };
  return {
    ok: false,
    error: message || defaults[code].msg,
    code,
    status: defaults[code].status,
  };
}

export function guardResponse(err: GuardError): Response {
  return Response.json(
    { ok: false, error: err.error, code: err.code },
    { status: err.status }
  );
}

// ---------------------------------------------------------------------------
// SERVER_ACTION_SECRET guard
//
// For automated calls (e.g. cron, internal services), pass the secret in:
//   Authorization: Bearer <SERVER_ACTION_SECRET>
//   OR X-Action-Secret: <SERVER_ACTION_SECRET>
// ---------------------------------------------------------------------------

export function requireServerActionSecret(req: NextRequest): GuardError | null {
  const secret = process.env.SERVER_ACTION_SECRET;
  if (!secret) {
    // If not configured, allow in development but block in production
    if (process.env.NODE_ENV === "production") {
      return guardError("MISSING_SECRET", "SERVER_ACTION_SECRET is not configured.");
    }
    return null; // dev: skip
  }

  const authHeader = req.headers.get("authorization") || "";
  const xSecret    = req.headers.get("x-action-secret") || "";

  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : xSecret.trim();

  if (!provided || provided !== secret) {
    return guardError("UNAUTHORIZED", "Invalid or missing server action secret.");
  }
  return null;
}

// ---------------------------------------------------------------------------
// ADMIN_ACTION_CODE guard
//
// For admin operations sent from the UI (settings, migration, reset).
// The code is expected in the request body as `adminCode`.
// ---------------------------------------------------------------------------

export async function requireAdminActionCode(
  req: NextRequest,
  inlineCode?: string
): Promise<GuardError | null> {
  const envCode = process.env.ADMIN_ACTION_CODE;

  // Determine the code to verify
  let providedCode = inlineCode;
  if (!providedCode) {
    try {
      const clone = req.clone();
      const body  = await clone.json().catch(() => ({}));
      providedCode = (body as Record<string, string>).adminCode || "";
    } catch {
      providedCode = "";
    }
  }

  if (!envCode) {
    // Not configured → fall back to checking the payload adminPassword
    // This is the legacy path — will be removed once ADMIN_ACTION_CODE is set
    return null;
  }

  if (!providedCode || providedCode !== envCode) {
    return guardError("INVALID_ADMIN_CODE", "Invalid admin action code.");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lightweight request actor info (no Supabase Auth required yet)
// ---------------------------------------------------------------------------

export interface RequestActor {
  userId?:   string;
  userName?: string;
  role?:     string;
  source:    "header" | "unknown";
}

export function getRequestActor(req: NextRequest): RequestActor {
  // When Supabase Auth is active, we'd decode the JWT here.
  // For now, read optional actor headers set by trusted internal callers.
  return {
    userId:   req.headers.get("x-actor-user-id")   || undefined,
    userName: req.headers.get("x-actor-user-name") || undefined,
    role:     req.headers.get("x-actor-role")       || undefined,
    source:   "header",
  };
}

// ---------------------------------------------------------------------------
// Health check security — only expose sensitive info to internal callers
// ---------------------------------------------------------------------------

export function canViewSensitiveHealth(req: NextRequest): boolean {
  // In dev: always allow
  if (process.env.NODE_ENV !== "production") return true;

  // In prod: require SERVER_ACTION_SECRET
  const secret = process.env.SERVER_ACTION_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.get("authorization") || "";
  const xSecret    = req.headers.get("x-action-secret") || "";
  const provided   = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : xSecret.trim();
  return provided === secret;
}

// ---------------------------------------------------------------------------
// Supabase Auth session guard (future — activated by NEXT_PUBLIC_USE_SUPABASE_AUTH)
// ---------------------------------------------------------------------------

export async function requireSupabaseAdminSession(
  _req: NextRequest
): Promise<{ userId: string; role: string } | GuardError> {
  // Stub — will be implemented when NEXT_PUBLIC_USE_SUPABASE_AUTH=true
  // For now, always returns a placeholder admin in non-production environments
  if (process.env.NODE_ENV !== "production") {
    return { userId: "system", role: "admin" };
  }
  return guardError("UNAUTHORIZED", "Supabase Auth session required.");
}
