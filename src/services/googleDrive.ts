/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from "../lib/supabase";

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Allow backward compatibility with Settings.tsx
export const setGoogleClientId = (id: string) => {
  // Deprecated - no longer needed with Supabase
};

export const initGoogleAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void,
) => {
  if (!supabase) {
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }

  // Fetch initial session if exists
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session && session.user) {
      cachedAccessToken = session.provider_token || session.access_token || null;
      if (cachedAccessToken && onAuthSuccess) {
        onAuthSuccess(session.user, cachedAccessToken);
      } else if (onAuthFailure) {
        onAuthFailure();
      }
    } else if (onAuthFailure) {
      onAuthFailure();
    }
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session && session.user) {
      cachedAccessToken = session.provider_token || session.access_token || null;
      if (cachedAccessToken && onAuthSuccess) {
        onAuthSuccess(session.user, cachedAccessToken);
      } else if (onAuthFailure) {
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });

  return () => {
    subscription.unsubscribe();
  };
};

export const signInWithGoogle = async (): Promise<{
  user: any;
  accessToken: string;
} | null> => {
  if (!supabase) {
    throw new Error("Supabase is not configured yet.");
  }
  try {
    isSigningIn = true;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/drive.file",
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      throw error;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user) {
      cachedAccessToken = session.provider_token || session.access_token || null;
      return { user: session.user, accessToken: cachedAccessToken || "" };
    }
    return null;
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  if (supabase) {
    await supabase.auth.signOut();
  }
  cachedAccessToken = null;
};

// --- Google Drive Business APIs ---

const FILE_NAME = "Kaisher Pro.json";

/**
 * List all backup files in Google Drive matching the name "Kaisher Pro"
 */
export const listBackupFiles = async (
  token: string,
): Promise<{ id: string; name: string; modifiedTime: string }[]> => {
  try {
    const q = encodeURIComponent(
      `name contains 'Kaisher Pro' and trashed = false`,
    );
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive&orderBy=modifiedTime desc`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.statusText}`);
    }
    const data = await response.json();
    return data.files || [];
  } catch (err) {
    console.error("listBackupFiles error:", err);
    return [];
  }
};

/**
 * Find a specific backup file in Google Drive. Returns the file metadata or null.
 */
export const findBackupFile = async (
  token: string,
  name: string = FILE_NAME,
): Promise<{ id: string; name: string; modifiedTime: string } | null> => {
  try {
    const q = encodeURIComponent(`name = '${name}' and trashed = false`);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
    return null;
  } catch (err) {
    console.error("findBackupFile error:", err);
    return null;
  }
};

/**
 * Upload backup data to Google Drive.
 */
export const uploadBackupToGoogleDrive = async (
  token: string,
  backupData: any,
  customName: string = FILE_NAME,
): Promise<{ id: string; modifiedTime: string }> => {
  const existingFile = await findBackupFile(token, customName);
  const bodyString = JSON.stringify(backupData, null, 2);

  if (existingFile) {
    // Update existing file content directly
    const updateResponse = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: bodyString,
      },
    );

    if (!updateResponse.ok) {
      throw new Error(
        `Failed to update backup file content: ${updateResponse.statusText}`,
      );
    }

    // Get latest metadata to retrieve modifiedTime
    const metaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existingFile.id}?fields=id,modifiedTime`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!metaResponse.ok) {
      return { id: existingFile.id, modifiedTime: new Date().toISOString() };
    }
    return await metaResponse.json();
  } else {
    // Create new file: Step 1: Create file metadata
    const createMetaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: customName,
          mimeType: "application/json",
        }),
      },
    );

    if (!createMetaResponse.ok) {
      throw new Error(
        `Failed to create backup metadata: ${createMetaResponse.statusText}`,
      );
    }

    const fileMeta = await createMetaResponse.json();

    // Step 2: Upload actual media content
    const mediaResponse = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileMeta.id}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: bodyString,
      },
    );

    if (!mediaResponse.ok) {
      throw new Error(
        `Failed to upload backup content payload: ${mediaResponse.statusText}`,
      );
    }

    // Retrieve modified time
    const finalMetaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileMeta.id}?fields=id,modifiedTime`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (!finalMetaResponse.ok) {
      return { id: fileMeta.id, modifiedTime: new Date().toISOString() };
    }
    return await finalMetaResponse.json();
  }
};

/**
 * Downloads and parses backup data from Google Drive.
 */
export const downloadBackupFromGoogleDrive = async (
  token: string,
  fileId: string,
): Promise<any> => {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to download backup file payload: ${response.statusText}`,
    );
  }
  return await response.json();
};
