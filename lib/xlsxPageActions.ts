import { applyBackupPayload } from "./backupPayload";
import { buildFullPayload } from "./fullPayload";
import { saveToSupabaseBackup } from "./supabaseBackup";
import { readWorkbookImport, ImportableEntityKey } from "./xlsxImport";
import { getArabicSheetName } from "./xlsxSchemas";

export async function importWorkbookToSystem(file: File, key: ImportableEntityKey, mode: "merge" | "replace" = "merge") {
  const parsed = await readWorkbookImport(file, key);
  const { imported, empty } = applyBackupPayload(parsed.payload, mode);
  if (!empty) await saveToSupabaseBackup(buildFullPayload());
  return { imported, empty, rowCount: parsed.rowCount };
}

export function importStatusMessage(result: { imported: string[]; empty: boolean; rowCount: number }, ar: boolean) {
  if (result.empty) return ar ? "لم يتم العثور على بيانات متوافقة في ملف Excel." : "No compatible data found in the Excel file.";
  const names = ar ? result.imported.map(getArabicSheetName).join("، ") : result.imported.join(", ");
  return ar
    ? `تم الاستيراد: ${names} — عدد الصفوف: ${result.rowCount}. جارٍ إعادة التحميل…`
    : `Imported: ${names} — rows: ${result.rowCount}. Reloading…`;
}
