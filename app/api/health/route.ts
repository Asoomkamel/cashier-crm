export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ ok: true, time: new Date().toISOString(), framework: 'nextjs' });
}
