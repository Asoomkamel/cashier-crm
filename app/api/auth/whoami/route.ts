import type { NextRequest } from 'next/server';
import { createAdminClient, getMembershipForUserId, jsonError } from '@/lib/server/authentica';

export const runtime = 'nodejs';

/**
 * Returns the business membership (businessId/role/permissions) for whoever
 * the Bearer token belongs to. Used to restore role/business context on page
 * reload, when the Supabase SDK restores a session without going through the
 * login screen again.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!token) {
      return Response.json({ error: 'Missing access token.' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) {
      return Response.json({ error: 'Invalid or expired session.' }, { status: 401 });
    }

    const membership = await getMembershipForUserId(admin, data.user.id);
    if (!membership) {
      return Response.json({ error: 'No business membership found for this account.' }, { status: 404 });
    }

    const { data: business } = await admin
      .from('businesses')
      .select('name')
      .eq('id', membership.business_id)
      .maybeSingle();

    return Response.json({
      businessId: membership.business_id,
      businessName: business?.name || 'عملي',
      role: membership.role,
      permissions: membership.permissions || {},
    });
  } catch (error) {
    return jsonError(error, 'تعذر تحميل بيانات الحساب');
  }
}
