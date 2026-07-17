import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * When USE_SUPABASE_AUTH is false, disable auto session refresh
 * to prevent "Failed to fetch" / AuthRetryableFetchError in the console.
 * The app uses local PIN login by default — Supabase Auth is optional.
 */
const useSupabaseAuth = process.env.NEXT_PUBLIC_USE_SUPABASE_AUTH === "true";

/**
 * Browser-side Supabase client.
 * Returns null when Supabase is not configured.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession:     useSupabaseAuth,
        autoRefreshToken:   useSupabaseAuth,
        detectSessionInUrl: useSupabaseAuth,
      },
    })
  : null;

/**
 * Server-side admin client (service role key).
 * Only import this from app/api/** route handlers — never from client components.
 * Service role bypasses Row Level Security.
 */
export function createServiceRoleClient(): SupabaseClient | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
