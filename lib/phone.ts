/**
 * Converts a Saudi local phone number ("05XXXXXXXX") to E.164 format
 * ("+9665XXXXXXXX"), which Authentica's API requires. Leaves already-E.164
 * numbers (starting with "+") untouched.
 */
export function toE164Saudi(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("05")) return `+966${digits.slice(1)}`;
  if (digits.startsWith("5")) return `+966${digits}`;
  return `+${digits}`;
}
