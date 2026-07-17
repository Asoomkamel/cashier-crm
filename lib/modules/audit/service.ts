import { AuditLogEntry, StaffUser, uid } from "@/lib/types";

const AUDIT_KEY = "cc_audit_log";
const MAX_LOCAL_AUDIT_EVENTS = 1000;

function readAuditLog(): AuditLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AUDIT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAuditLog(entries: AuditLogEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUDIT_KEY, JSON.stringify(entries.slice(-MAX_LOCAL_AUDIT_EVENTS)));
}

export interface RecordAuditLogInput {
  user?: StaffUser | null;
  action: string;
  details?: string;
  date?: number;
}

export function recordAuditLog(input: RecordAuditLogInput): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: uid("audit"),
    date: input.date || Date.now(),
    userName: input.user?.name || "System",
    userRole: input.user?.role || "system",
    action: input.action,
    details: input.details,
  };
  writeAuditLog([...readAuditLog(), entry]);
  return entry;
}

export function getLocalAuditLog(): AuditLogEntry[] {
  return readAuditLog();
}
