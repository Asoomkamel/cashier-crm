import { storage } from "./storage";

// ─────────────────────────────────────────────────────────────────────────
// Synchronous SHA-256 (pure JS, no dependencies, no Web Crypto async calls
// — kept synchronous on purpose so it drops into the existing synchronous
// login/changeOwnPin flow without having to convert every call site to
// async). Used below to hash PINs instead of storing them as plain text.
// ─────────────────────────────────────────────────────────────────────────
function sha256Hex(message: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  const bytes: number[] = [];
  const utf8 = unescape(encodeURIComponent(message));
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const w = new Array(64).fill(0);
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[chunk + i * 4] << 24) | (bytes[chunk + i * 4 + 1] << 16) | (bytes[chunk + i * 4 + 2] << 8) | bytes[chunk + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map((x) => x | 0);
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

const PIN_HASH_PREFIX = "sha256:";

/** Hashes a PIN for storage. Salted with the phone number so two users with the same PIN don't produce identical hashes. */
export function hashPin(pin: string, phone: string): string {
  return PIN_HASH_PREFIX + sha256Hex(`${phone}::${pin}`);
}

/** True if a stored pin value is already a hash produced by hashPin() (vs. legacy plain text). */
export function isPinHashed(value: string): boolean {
  return value.startsWith(PIN_HASH_PREFIX);
}

/** Verifies a typed PIN against whatever is stored — supports both the new hashed format and legacy plain-text PINs still present from before this update. */
export function verifyPin(typedPin: string, storedPin: string, phone: string): boolean {
  if (isPinHashed(storedPin)) return hashPin(typedPin, phone) === storedPin;
  return typedPin === storedPin; // legacy plain-text fallback
}

// ─────────────────────────────────────────────────────────────────────────
// Login lockout — blocks repeated PIN guessing on a device/kiosk.
// ─────────────────────────────────────────────────────────────────────────
const LOCKOUT_KEY = "cc_login_attempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

interface AttemptRecord { count: number; firstAttempt: number; lockedUntil?: number }

function readAttempts(): Record<string, AttemptRecord> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(LOCKOUT_KEY) || "{}"); } catch { return {}; }
}
function writeAttempts(data: Record<string, AttemptRecord>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
}

/** Returns remaining lockout minutes if the phone is currently locked out, or 0 if not. */
export function getLockoutRemainingMinutes(phone: string): number {
  const rec = readAttempts()[phone];
  if (!rec?.lockedUntil) return 0;
  const remainingMs = rec.lockedUntil - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 60000) : 0;
}

export function recordFailedLogin(phone: string) {
  const data = readAttempts();
  const rec = data[phone] || { count: 0, firstAttempt: Date.now() };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60000;
    rec.count = 0;
  }
  data[phone] = rec;
  writeAttempts(data);
}

export function clearFailedLogins(phone: string) {
  const data = readAttempts();
  delete data[phone];
  writeAttempts(data);
}

export function confirmWithAdminPassword(
  adminPassword: string,
  actionLabel = "this action",
  actor?: { name: string; role: string }
): boolean {
  const input = window.prompt(`Enter admin password to confirm ${actionLabel}:`);
  if (input === null) return false;
  if (input !== adminPassword) {
    window.alert("Incorrect admin password.");
    return false;
  }
  storage.addAuditLog({
    userName: actor?.name || "unknown",
    userRole: actor?.role || "unknown",
    action: "admin_confirmed_action",
    details: actionLabel,
  });
  return true;
}
