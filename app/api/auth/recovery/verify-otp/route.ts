import type { NextRequest } from 'next/server';
import {
  createAdminClient,
  getAuthenticaApiKey,
  isOtpVerified,
  jsonError,
  normalizeSaudiPhone,
} from '@/lib/server/authentica';

export const runtime = 'nodejs';

/**
 * Re-verifies a fresh WhatsApp OTP for the phone number that belongs to the
 * currently authenticated Supabase session. Used to gate destructive/sensitive
 * actions (admin PIN recovery, factory reset) without any shared static secret.
 * Never creates or rotates a Supabase session — it only answers ok: true/false.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!token) {
      return Response.json({ error: 'يجب تسجيل الدخول أولاً.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const normalizedPhone = normalizeSaudiPhone(String(body?.phone ?? ''));
    const otpCode = String(body?.otp ?? '').trim();

    if (!normalizedPhone) {
      return Response.json({ error: 'رقم الجوال غير صحيح' }, { status: 400 });
    }
    if (!/^\d{4,8}$/.test(otpCode)) {
      return Response.json({ error: 'رمز التحقق غير صحيح' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return Response.json({ error: 'جلسة الدخول غير صالحة. سجّل الدخول من جديد.' }, { status: 401 });
    }

    const accountPhone = normalizeSaudiPhone(
      String(data.user.phone || data.user.user_metadata?.phone || ''),
    );
    if (!accountPhone || accountPhone !== normalizedPhone) {
      return Response.json(
        { error: 'رقم الجوال لا يطابق رقم الحساب المسجّل دخوله.' },
        { status: 403 },
      );
    }

    const apiKey = getAuthenticaApiKey();
    const verifyUrl = process.env.AUTHENTICA_VERIFY_OTP_URL || 'https://api.authentica.sa/api/v2/verify-otp';

    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Authorization': apiKey,
      },
      body: JSON.stringify({ method: 'whatsapp', phone: normalizedPhone, otp: otpCode }),
    });

    const verifyData = await verifyRes.json().catch(() => ({}));
    const ok = verifyRes.ok && isOtpVerified(verifyData);

    if (!ok) {
      const record = verifyData as { message?: string; errors?: { message?: string }[] };
      return Response.json(
        { error: record.errors?.[0]?.message || record.message || 'رمز التحقق غير صحيح أو منتهي' },
        { status: 401 },
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Recovery verify-OTP error:', error);
    return jsonError(error, 'تعذر التحقق من الرمز');
  }
}
