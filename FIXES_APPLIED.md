# Fixed Version Notes

This version focuses on reliable JSON migration/import and shared Supabase loading.

## Main fixes applied

1. JSON import now supports normal app exports and Supabase `business_data` payload exports.
2. Import flow is now cloud-first:
   - validate and normalize JSON
   - save the complete payload to `/api/cloud/save`
   - reload the payload from `/api/cloud/load`
   - apply the reloaded cloud data to React state and local cache
3. Imported data includes customers, catalog, sales orders, service orders, urgent orders, fast orders, vendors, purchases, expenses, settings, technician inventory, technician inventory logs, technician financial logs, and technician locations.
4. Merge mode now updates records using the best available identity such as `id`, `phone`, `sku`, `catalogId`, `technicianName`, or `name`.
5. Technician inventory, inventory logs, financial logs, and live technician location writes now trigger a Supabase cloud-sync event instead of staying only in localStorage.
6. Reports now read technician inventory from the correct `crm_tech_inventory` storage key through the shared storage service.
7. Environment files were sanitized. Replace placeholders in `.env.local` with your real Supabase/Auth/Gemini values before running or deploying.

## Important setup note

Run the SQL files in the `supabase` folder, especially `03_business_multiuser.sql`, so the `business_data`, `businesses`, and `business_members` tables/policies exist before testing import and cloud sync.

## Patch v2 - Missing access token startup/import fix

- Prevented protected cloud API calls from running when a Supabase session token is not available.
- Added an explicit `AUTH_REQUIRED` path before API calls so the app does not call `/api/*` routes without a Bearer token.
- Cleared stale business login data restored from localStorage when Supabase has no active session, forcing a clean login before cloud sync/import.
- Updated JSON import validation to require an active Supabase session before uploading imported data.
- Skipped background Supabase sync events when there is no active Supabase session.
- Reduced expected auth/admin errors in development console to avoid Next.js error overlay interruptions.


## v3 Startup/Auth Robustness Patch

- Avoided startup red-screen console errors when the browser has an expired Supabase session.
- Broadened auth-error detection for messages such as `Invalid or expired Supabase session`.
- Replaced fragile `.maybeSingle()` lookups in membership/profile paths with ordered `limit(1)` queries so duplicate legacy rows no longer crash login with `JSON object requested, multiple (or no) rows returned`.
- Updated cloud load/save and business member admin checks to tolerate duplicate legacy membership rows.
- Added `supabase/04_repair_duplicate_business_rows.sql` to help inspect and clean duplicate membership rows if needed.
- Changed non-fatal cloud sync logs from `console.error` to `console.warn` to avoid Next.js dev overlay screens for expected offline/expired-session cases.

## v4 Owner Password Login Patch

- Added a server-side owner login mode for selected phone numbers configured in `OWNER_LOGIN_PHONES`.
- Owner phone numbers no longer trigger a WhatsApp OTP send request; the login screen switches to a fixed-password field.
- The fixed password is checked only on the server using `OWNER_LOGIN_PASSWORD`, so it is not exposed in the React/client bundle.
- Added attempt logging and a short lockout after repeated wrong owner-password attempts.
- `.env.local` now contains the two owner phone numbers requested for this project. Replace `OWNER_LOGIN_PASSWORD` with a strong private password before running.
- Normal users still use the existing Authentica WhatsApp OTP flow.

## v5 Google Drive Backup Token Patch

- Fixed Google Drive backup errors caused by sending the normal Supabase session JWT to the Google Drive API.
- Google Drive API calls now use only `session.provider_token`, which is the real Google OAuth access token.
- Phone/password and owner-password sessions no longer appear as connected Google Drive sessions.
- Google Drive backup/restore now fails with clear user-facing messages when Drive is not connected or permission is missing.
- Removed expected Google Drive API failures from `console.error` paths so Next.js development overlay does not interrupt the app for recoverable Drive backup issues.
- Changed new-file backup upload to a single multipart Drive upload request so metadata and JSON content are created together.


## v6 — Shared owner business mapping

- Fixed the case where both owner password phones could login successfully but each phone was attached to a different `business_id`.
- `OWNER_PRIMARY_PHONE` now identifies the main owner business. Other `OWNER_LOGIN_PHONES` are automatically linked to the same business when they login.
- Added `OWNER_LOGIN_SHARED_BUSINESS=true` to make this behavior explicit.
- Added `supabase/05_link_owner_phones_to_one_business.sql` to repair existing databases where the second owner phone already created an empty business.
