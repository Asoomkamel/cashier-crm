export interface SupabaseBackupResult {
  ok: boolean;
  message: string;
  status?: number;
  configured?: boolean;
  setupRequired?: boolean;
}

async function readResponseJson(res: Response): Promise<Record<string, any>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function formatSupabaseBackupMessage(result: SupabaseBackupResult, ar: boolean): string {
  if (result.ok) {
    return ar ? "تم الحفظ في السحابة." : "Saved to cloud.";
  }
  if (result.status === 501 || result.configured === false) {
    return ar
      ? "تم الحفظ محليًا فقط؛ Supabase غير مضبوط في هذا النشر."
      : "Saved locally only; Supabase is not configured for this deployment.";
  }
  if (result.setupRequired) {
    return ar
      ? "تم الحفظ محليًا فقط؛ جدول النسخ السحابية غير موجود في Supabase. شغّل ملف الهجرة 06_complete_sync_migration.sql."
      : "Saved locally only; the Supabase backup table is missing. Run 06_complete_sync_migration.sql.";
  }
  return ar
    ? `تم الحفظ محليًا فقط؛ تعذر الحفظ في السحابة${result.message ? `: ${result.message}` : "."}`
    : `Saved locally only; cloud save failed${result.message ? `: ${result.message}` : "."}`;
}

/** POSTs the full payload to /api/backup/save. Returns a clear ok/message result either way. */
export async function saveToSupabaseBackup(payload: unknown): Promise<SupabaseBackupResult> {
  try {
    const res = await fetch("/api/backup/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await readResponseJson(res);
    if (res.status === 501) {
      return {
        ok: false,
        status: res.status,
        configured: false,
        message: data.error || "Supabase is not configured on this deployment.",
      };
    }
    if (!res.ok || data.error) {
      return {
        ok: false,
        status: res.status,
        configured: data.configured,
        setupRequired: Boolean(data.setupRequired),
        message: data.error || `Save failed (${res.status}).`,
      };
    }
    return {
      ok: true,
      status: res.status,
      configured: true,
      message: data.savedAt ? `Saved to Supabase at ${new Date(data.savedAt).toLocaleString()}.` : "Saved to Supabase.",
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Network error while saving to Supabase." };
  }
}

/** GETs the stored payload from /api/backup/load. Returns { ok, message, payload }. */
export async function loadFromSupabaseBackup(): Promise<SupabaseBackupResult & { payload: any | null }> {
  try {
    const res = await fetch("/api/backup/load");
    const data = await readResponseJson(res);
    if (res.status === 501) {
      return {
        ok: false,
        status: res.status,
        configured: false,
        message: data.error || "Supabase is not configured on this deployment.",
        payload: null,
      };
    }
    if (!res.ok || data.error) {
      return {
        ok: false,
        status: res.status,
        configured: data.configured,
        setupRequired: Boolean(data.setupRequired),
        message: data.error || `Load failed (${res.status}).`,
        payload: null,
      };
    }
    if (!data.payload) return { ok: false, status: res.status, message: "No backup has been saved to Supabase yet.", payload: null };
    return {
      ok: true,
      status: res.status,
      configured: true,
      message: data.updatedAt ? `Loaded backup from ${new Date(data.updatedAt).toLocaleString()}.` : "Loaded backup from Supabase.",
      payload: data.payload,
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Network error while loading from Supabase.", payload: null };
  }
}
