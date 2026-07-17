/**
 * app/api/migration/idb/route.ts
 *
 * Returns the status of the IndexedDB migration.
 * Client-side only — this endpoint just tells the UI what's available.
 */

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    message:
      "IndexedDB migration is client-side only. " +
      "Use the System Health page to trigger migration from the browser.",
    steps: [
      "1. Open the app in a modern browser (Chrome, Firefox, Safari, Edge).",
      "2. Go to /system-health.",
      "3. Click 'نقل البيانات إلى IndexedDB' to migrate localStorage → IndexedDB.",
      "4. After migration, set NEXT_PUBLIC_USE_IDB_CACHE=true and redeploy.",
    ],
  });
}
