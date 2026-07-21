# Settings-focused features added

This version focuses on completing the remaining Settings-related features while preserving the existing Next.js App Router structure.

## Added

- Rebuilt Settings page into tabs:
  - Company
  - Branches & Categories
  - Print & Invoice
  - Messages
  - Security & Modules
  - Backup & Archive
  - Cloud & Google Drive
  - Mobile App / PWA
- Added advanced print/invoice settings:
  - show/hide logo
  - show/hide stamp
  - show/hide customer signature
  - show/hide company signature
  - logo position
  - company info position
  - customer info position
  - QR position
  - logo size
  - QR size
  - font size
  - page margin
  - stamp image URL
  - company signature URL
- Updated invoice printing to use the new print settings.
- Added expense category management in Settings.
- Added warranty/invoice terms editing in Settings.
- Added archive tools:
  - export records older than a chosen number of months
  - clean old records after admin-password confirmation
  - automatic archive JSON export before deleting old records
- Improved Google Drive backup:
  - fixed backup file
  - optional dated backup copies
  - list available Drive backups
  - restore a selected Drive backup
  - configurable auto-backup reminder interval setting
- Added PWA install prompt component.
- Added Settings tab explaining the mobile/PWA installation status.
- Removed OTP API route folders from the active codebase.
- Sanitized .env.example so no real secrets are included.
- Added deep settings merge in storage to avoid breaking old backups/localStorage after new settings fields are added.

## Validation

- npm run lint: passed
- npm run build: passed
