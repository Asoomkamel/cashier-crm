/**
 * lib/modules/auth/service.ts
 *
 * Auth service — Phase 5 addition.
 *
 * Handles the bridge between the current local-PIN login and the future
 * Supabase Auth flow. The module is designed to be a drop-in: the rest of
 * the app calls these helpers; the actual backend (local vs Supabase) is
 * switched by the NEXT_PUBLIC_USE_SUPABASE_AUTH env flag.
 *
 * Current state:  local-only (PIN / phone → localStorage).
 * Future state:   Supabase Auth OTP → JWT → RLS.
 *
 * The transition is safe: if Supabase Auth is not configured the module
 * falls back to the existing local login path transparently.
 */

import { StaffUser } from "@/lib/types";
import { storage } from "@/lib/storage";
import { getEffectivePermissions } from "@/lib/modules/permissions/permissions";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const SUPABASE_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_USE_SUPABASE_AUTH === "true";

// ---------------------------------------------------------------------------
// Session helpers (local)
// ---------------------------------------------------------------------------

export function getLocalSession(): StaffUser | null {
  return storage.getActiveUser();
}

export function saveLocalSession(user: StaffUser | null): void {
  storage.saveActiveUser(user);
}

export function clearLocalSession(): void {
  storage.saveActiveUser(null);
}

// ---------------------------------------------------------------------------
// Login (local PIN flow — current default)
// ---------------------------------------------------------------------------

export interface LocalLoginResult {
  ok: boolean;
  user?: StaffUser;
  error?: string;
}

export function localLogin(phone: string, pin: string): LocalLoginResult {
  const cleanPhone = phone
    .replace(/[\u200e\u200f\u200b\u200c\u200d\ufeff\u00a0\s]/g, "")
    .trim();

  const users = storage.getUsers();
  const found = users.find((u) => {
    const cleanStored = (u.phone || "").replace(
      /[\u200e\u200f\u200b\u200c\u200d\ufeff\u00a0\s]/g,
      ""
    ).trim();
    return cleanStored === cleanPhone && u.pin === pin;
  });

  if (!found) {
    return { ok: false, error: "رقم الهاتف أو الرمز السري غير صحيح." };
  }

  saveLocalSession(found);
  return { ok: true, user: found };
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export function logout(): void {
  clearLocalSession();
}

// ---------------------------------------------------------------------------
// Permission helpers (convenience re-exports)
// ---------------------------------------------------------------------------

export { getEffectivePermissions };

export function canPerform(
  user: StaffUser | null,
  permission: keyof import("@/lib/types").Permissions
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const perms = getEffectivePermissions(user);
  return Boolean(perms?.[permission]);
}

// ---------------------------------------------------------------------------
// Future: Supabase Auth helpers (stubs — activated by SUPABASE_AUTH_ENABLED)
// ---------------------------------------------------------------------------

/**
 * Returns the Supabase access token for server calls, or null if not
 * available (local-only mode or not signed in).
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!SUPABASE_AUTH_ENABLED) return null;
  try {
    // Lazy import to avoid breaking SSR when Supabase is not configured.
    const { supabase } = await import("@/lib/supabaseClient");
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Signs the user out from both local storage and Supabase Auth.
 */
export async function signOut(): Promise<void> {
  clearLocalSession();
  if (!SUPABASE_AUTH_ENABLED) return;
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    if (supabase) await supabase.auth.signOut();
  } catch {
    // Fail silently — local session already cleared.
  }
}
