// Remembers previously-entered values per field category (e.g. customer
// names, phone numbers, places) so forms can suggest them instead of
// making the user retype the same thing every time.

const PREFIX = "cc_suggest:";
const MAX_PER_CATEGORY = 200;

function key(category: string) {
  return `${PREFIX}${category}`;
}

export function getSuggestions(category: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(category));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Records a value as a suggestion for later. Most-recently-used first, deduplicated, capped. */
export function addSuggestion(category: string, value: string): void {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  const existing = getSuggestions(category).filter((v) => v.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...existing].slice(0, MAX_PER_CATEGORY);
  try {
    window.localStorage.setItem(key(category), JSON.stringify(next));
  } catch {
    // localStorage full or unavailable — suggestions are a nice-to-have, fail silently.
  }
}
