// Google Drive backup helpers for the Settings page.
// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID to be set and a Google OAuth Web
// client with Drive API + drive.file scope enabled.

export const isGoogleDriveConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

export interface DriveBackupFile {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
}

declare global {
  interface Window {
    google?: any;
  }
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(script);
  });
}

/** Opens Google's consent popup and resolves with a short-lived Drive access token. */
export function requestDriveAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return reject(new Error("Google Drive is not configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID missing)."));

    loadGis()
      .then(() => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/drive.file",
          callback: (resp: any) => {
            if (resp.error) return reject(new Error(resp.error));
            resolve(resp.access_token);
          },
        });
        client.requestAccessToken();
      })
      .catch(reject);
  });
}

const FIXED_BACKUP_FILENAME = "cashier-crm-backup.json";
const BACKUP_PREFIX = "cashier-crm-backup-";

function safeIsoFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function findBackupFileId(token: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${FIXED_BACKUP_FILENAME}'&spaces=drive&fields=files(id)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function uploadJsonFile(token: string, fileName: string, payload: unknown, existingId?: string | null): Promise<void> {
  const metadata = { name: fileName, mimeType: "application/json" };
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  body.append("file", new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error(`Google Drive upload failed (${res.status}).`);
}

/** Saves/updates the fixed backup file. Optionally also saves a dated version. */
export async function backupToDrive(token: string, payload: unknown, options?: { datedCopy?: boolean }): Promise<void> {
  const existingId = await findBackupFileId(token);
  await uploadJsonFile(token, FIXED_BACKUP_FILENAME, payload, existingId);

  if (options?.datedCopy) {
    await uploadJsonFile(token, `${BACKUP_PREFIX}${safeIsoFileName()}.json`, payload);
  }
}

export async function listDriveBackups(token: string): Promise<DriveBackupFile[]> {
  const query = encodeURIComponent(`name contains 'cashier-crm-backup' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Google Drive listing failed (${res.status}).`);
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

export async function restoreFromDrive(token: string, fileId?: string): Promise<unknown> {
  const id = fileId || (await findBackupFileId(token));
  if (!id) throw new Error("No backup file found on Google Drive yet.");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google Drive download failed (${res.status}).`);
  return res.json();
}
