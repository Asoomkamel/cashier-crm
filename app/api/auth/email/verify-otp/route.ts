export const runtime = 'nodejs';

export async function POST() {
  return Response.json(
    { error: 'تم تعطيل تسجيل الدخول بالبريد. استخدم تسجيل الدخول برقم الجوال وواتساب.' },
    { status: 410 },
  );
}
