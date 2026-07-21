import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Browser-side Supabase client. Returns null when no real project has
 * been configured (the default for this build) — callers must check
 * `isSupabaseConfigured` / a non-null return before using it.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url!, anonKey!) : null;

/**
 * Server-side admin client (service role key). Only ever import this from
 * app/api/** route handlers — never from client components — since the
 * service role key bypasses Row Level Security.
 */
export function createServiceRoleClient(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
