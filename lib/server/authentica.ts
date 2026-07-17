import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export type AdminClient = SupabaseClient<any, 'public', any>;

type SettingRow = {
  key: string;
  value: string | null;
};

export function jsonError(error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status });
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

export function getSupabasePublicConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase public credentials missing');
  }

  return { supabaseUrl, anonKey };
}

export function createAdminClient(): AdminClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Supabase URL or SERVICE_ROLE_KEY is missing');
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as AdminClient;
}

export function getAuthenticaApiKey() {
  const encoded = getRequiredEnv('AUTHENTICA_API_KEY_BASE64')
    .trim()
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .replace(/["']/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');

  if (!encoded) {
    throw new Error('AUTHENTICA_API_KEY_BASE64 is empty after sanitization');
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8').trim();

  if (!decoded || decoded.includes('\uFFFD')) {
    throw new Error('Invalid AUTHENTICA_API_KEY_BASE64 value');
  }

  const hasInvalidHeaderChars = [...decoded].some((char) => char.charCodeAt(0) > 255);
  if (hasInvalidHeaderChars) {
    throw new Error('Authentica API key contains invalid HTTP header characters');
  }

  return decoded;
}

export function normalizeSaudiPhone(rawPhone: string) {
  if (!rawPhone) return null;
  const cleaned = String(rawPhone).replace(/\D/g, '');

  if (cleaned.startsWith('9665') && cleaned.length === 12) return `+${cleaned}`;
  if (cleaned.startsWith('05') && cleaned.length === 10) return `+966${cleaned.slice(1)}`;
  if (cleaned.startsWith('5') && cleaned.length === 9) return `+966${cleaned}`;

  return null;
}

export function normalizeEmail(rawEmail: string) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function getClientIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function getAuthenticaError(data: unknown) {
  if (!data || typeof data !== 'object') return 'تعذر إرسال رمز التحقق. حاول مرة أخرى.';
  const record = data as { message?: string; errors?: { message?: string }[] };
  return record.errors?.[0]?.message || record.message || 'تعذر إرسال رمز التحقق. حاول مرة أخرى.';
}

export function isOtpVerified(data: unknown) {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  return (
    record.status === true ||
    record.verified === true ||
    record.success === true ||
    record.status === 'verified' ||
    record.status === 'success'
  );
}

export function placeholderEmailFromPhone(phone: string) {
  return `${phone.replace(/\D/g, '')}@phone.authentica.local`;
}

export function makeTemporaryPassword() {
  return `Auth-${randomUUID()}-${Date.now()}!`;
}

export function getOwnerLoginPhones() {
  const rawPhones = process.env.OWNER_LOGIN_PHONES || process.env.ADMIN_PASSWORD_LOGIN_PHONES || '';
  return rawPhones
    .split(',')
    .map((phone) => normalizeSaudiPhone(phone.trim()))
    .filter((phone): phone is string => Boolean(phone));
}

export function isOwnerLoginPhone(normalizedPhone: string) {
  const ownerPhones = getOwnerLoginPhones();
  return ownerPhones.includes(normalizedPhone);
}

export function getOwnerPrimaryPhone() {
  const explicitPrimary = normalizeSaudiPhone(
    process.env.OWNER_PRIMARY_PHONE || process.env.ADMIN_PRIMARY_PHONE || '',
  );
  return explicitPrimary || getOwnerLoginPhones()[0] || '';
}

export function ownerPhonesShareBusiness() {
  const value = String(process.env.OWNER_LOGIN_SHARED_BUSINESS || 'true').toLowerCase();
  return value !== 'false' && value !== '0' && value !== 'no';
}

export function getOwnerLoginPassword() {
  return process.env.OWNER_LOGIN_PASSWORD || process.env.ADMIN_PASSWORD_LOGIN_PASSWORD || '';
}

export function ownerPasswordLoginEnabled(normalizedPhone: string) {
  return Boolean(isOwnerLoginPhone(normalizedPhone) && getOwnerLoginPassword());
}

export function secureStringEquals(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual || '', 'utf8');
  const expectedBuffer = Buffer.from(expected || '', 'utf8');

  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function getSettingMap(supabaseAdmin: AdminClient) {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', [
        'admin_otp_bypass_enabled',
        'admin_otp_bypass_phone',
        'admin_otp_bypass_code',
      ]);

    if (error || !data) {
      return {
        admin_otp_bypass_enabled: 'false',
        admin_otp_bypass_phone: '',
        admin_otp_bypass_code: '',
      };
    }

    return (data as SettingRow[]).reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value ?? '';
      return acc;
    }, {});
  } catch {
    return {
      admin_otp_bypass_enabled: 'false',
      admin_otp_bypass_phone: '',
      admin_otp_bypass_code: '',
    };
  }
}

export async function findAuthUserByEmail(supabaseAdmin: AdminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = Array.isArray(data?.users) ? (data.users as any[]) : [];

    const user = users.find((u) =>
      String(u?.email ?? "").trim().toLowerCase() === normalizedEmail,
    );

    if (user) return user;
    if (users.length < perPage) return null;
  }

  return null;
}

export type BusinessRole = 'admin' | 'supervisor' | 'technician' | 'pos';

export type BusinessMembership = {
  businessId: string;
  businessName: string;
  role: BusinessRole;
  permissions: Record<string, unknown>;
};

/**
 * Resolves which business a phone number belongs to.
 *
 * - If the phone already has a business_members row, that membership is
 *   linked to this Supabase auth user id (if not already linked) and
 *   returned as-is — this is how staff added by an admin join the shared
 *   business on their first login.
 * - Otherwise, a brand-new business is created and this phone becomes its
 *   admin/owner — this is how the very first person from a business signs up.
 */
export async function resolveBusinessForPhone(
  supabaseAdmin: AdminClient,
  userId: string,
  normalizedPhone: string,
  fullName?: string,
): Promise<BusinessMembership> {
  // Use limit(1) instead of maybeSingle() so an old database with duplicate
  // phone membership rows cannot crash login with PostgREST's
  // "JSON object requested, multiple (or no) rows returned" error.
  const { data: allPhoneMembers, error: memberError } = await supabaseAdmin
    .from('business_members')
    .select('id, business_id, role, permissions, businesses(name), created_at')
    .eq('phone', normalizedPhone)
    .order('created_at', { ascending: true });

  if (memberError) throw new Error(memberError.message);

  const phoneMembers = Array.isArray(allPhoneMembers) ? allPhoneMembers : [];
  const existingMember = phoneMembers[0] ?? null;

  // Owner-password phones are usually two personal phones for the same shop.
  // They must not create two isolated businesses. When a primary owner phone
  // already has a business, every other owner phone is linked to that same
  // business automatically, even if it previously created an empty business.
  const primaryOwnerPhone = getOwnerPrimaryPhone();
  const shouldShareOwnerBusiness =
    ownerPhonesShareBusiness() &&
    isOwnerLoginPhone(normalizedPhone) &&
    primaryOwnerPhone &&
    normalizedPhone !== primaryOwnerPhone;

  if (shouldShareOwnerBusiness) {
    const { data: primaryRows, error: primaryError } = await supabaseAdmin
      .from('business_members')
      .select('id, business_id, role, permissions, businesses(name), created_at')
      .eq('phone', primaryOwnerPhone)
      .order('created_at', { ascending: true })
      .limit(1);

    if (primaryError) throw new Error(primaryError.message);

    const primaryMember = Array.isArray(primaryRows) ? primaryRows[0] ?? null : null;

    if (primaryMember) {
      const sharedPermissions = {
        ...((primaryMember.permissions as Record<string, unknown>) || {}),
        isFullAdmin: true,
        canLogin: true,
      };
      const sameBusinessMember = phoneMembers.find(
        (member: any) => member.business_id === primaryMember.business_id,
      );
      const rowToKeep = sameBusinessMember || existingMember;

      if (rowToKeep) {
        const duplicateIds = phoneMembers
          .filter((member: any) => member.id !== rowToKeep.id)
          .map((member: any) => member.id);
        if (duplicateIds.length > 0) {
          const { error: deleteError } = await supabaseAdmin
            .from('business_members')
            .delete()
            .in('id', duplicateIds);
          if (deleteError) throw new Error(deleteError.message);
        }

        const { error: updateSharedError } = await supabaseAdmin
          .from('business_members')
          .update({
            business_id: primaryMember.business_id,
            user_id: userId,
            full_name: fullName || normalizedPhone,
            role: 'admin',
            permissions: sharedPermissions,
          })
          .eq('id', rowToKeep.id);
        if (updateSharedError) throw new Error(updateSharedError.message);
      } else {
        const { error: insertSharedError } = await supabaseAdmin
          .from('business_members')
          .insert({
            business_id: primaryMember.business_id,
            user_id: userId,
            phone: normalizedPhone,
            full_name: fullName || normalizedPhone,
            role: 'admin',
            permissions: sharedPermissions,
          });
        if (insertSharedError) throw new Error(insertSharedError.message);
      }

      return {
        businessId: primaryMember.business_id as string,
        businessName: (primaryMember as any).businesses?.name || 'عملي',
        role: 'admin',
        permissions: sharedPermissions,
      };
    }
  }

  if (existingMember) {
    const { error: linkError } = await supabaseAdmin
      .from('business_members')
      .update({ user_id: userId, full_name: fullName || undefined })
      .eq('id', existingMember.id);
    if (linkError) throw new Error(linkError.message);

    return {
      businessId: existingMember.business_id as string,
      businessName: (existingMember as any).businesses?.name || 'عملي',
      role: existingMember.role as BusinessRole,
      permissions: (existingMember.permissions as Record<string, unknown>) || {},
    };
  }

  const { data: newBusiness, error: businessError } = await supabaseAdmin
    .from('businesses')
    .insert({ name: fullName ? `عمل ${fullName}` : 'عملي', owner_id: userId })
    .select('id, name')
    .single();
  if (businessError || !newBusiness) {
    throw new Error(businessError?.message || 'تعذر إنشاء حساب العمل');
  }

  const permissions = { isFullAdmin: true, canLogin: true };
  const { error: newMemberError } = await supabaseAdmin.from('business_members').insert({
    business_id: newBusiness.id,
    user_id: userId,
    phone: normalizedPhone,
    full_name: fullName || normalizedPhone,
    role: 'admin',
    permissions,
  });
  if (newMemberError) throw new Error(newMemberError.message);

  return {
    businessId: newBusiness.id as string,
    businessName: newBusiness.name as string,
    role: 'admin',
    permissions,
  };
}

/** Returns one business_member row (if any) linking this Supabase user id to a business. */
export async function getMembershipForUserId(supabaseAdmin: AdminClient, userId: string) {
  // The UI currently supports one active business at a time. limit(1) keeps the
  // app usable even if a previous migration accidentally created duplicate
  // rows for the same auth user.
  const { data, error } = await supabaseAdmin
    .from('business_members')
    .select('id, business_id, role, permissions, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] ?? null : null;
}
