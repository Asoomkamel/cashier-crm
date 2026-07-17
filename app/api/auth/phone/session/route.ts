import type { NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig, jsonError } from '@/lib/server/authentica';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const access_token = body?.access_token;
    const refresh_token = body?.refresh_token;

    if (!access_token || !refresh_token) {
      return Response.json({ error: 'Missing tokens' }, { status: 400 });
    }

    const { supabaseUrl, anonKey } = getSupabasePublicConfig();
    const client = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client.auth.setSession({ access_token, refresh_token });
    if (error || !data.session) {
      return Response.json({ error: error?.message || 'Invalid session' }, { status: 401 });
    }

    return Response.json({ success: true, user: data.user });
  } catch (error) {
    return jsonError(error, 'Invalid session');
  }
}
