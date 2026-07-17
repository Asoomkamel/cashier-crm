/**
 * lib/featureFlags.ts
 *
 * Single source of truth for all Phase 5/6 feature flags.
 *
 * All flags default to false (backward-compatible).
 * Flip in .env.local when ready to activate server-side features.
 */

/** Use Supabase Auth OTP instead of local PIN login */
export const USE_SUPABASE_AUTH =
  process.env.NEXT_PUBLIC_USE_SUPABASE_AUTH === "true";

/** Use server-side atomic checkout (create_checkout_transaction RPC) */
export const USE_SERVER_CHECKOUT =
  process.env.NEXT_PUBLIC_USE_SERVER_CHECKOUT === "true";

/**
 * Use IndexedDB as primary cache instead of localStorage.
 * When true: localStorage is used only for settings (language, theme).
 * Set to true after running the IDB migration in /system-health.
 */
export const USE_IDB_CACHE =
  process.env.NEXT_PUBLIC_USE_IDB_CACHE === "true";

/** Organization ID set by migration — used for normalized table queries */
export const ORG_ID =
  process.env.NEXT_PUBLIC_ORG_ID || "";

/** Branch ID set by migration */
export const BRANCH_ID =
  process.env.NEXT_PUBLIC_BRANCH_ID || "";

/** Whether normalized tables are available (org exists) */
export const NORMALIZED_TABLES_READY = Boolean(ORG_ID);

/**
 * Generate an idempotency key for a given operation.
 * Includes a device-specific prefix so keys are globally unique.
 */
export function generateIdempotencyKey(prefix = "idem"): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${ts}_${rand}`;
}
