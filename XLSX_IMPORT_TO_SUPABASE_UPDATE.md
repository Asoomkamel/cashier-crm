# XLSX Import to Supabase Update

Implemented system-wide XLSX import support for the main areas that export Excel/CSV files.

## Added

- New reusable importer: `lib/xlsxImport.ts`
  - Reads `.xlsx` and `.xls` files from the user's device.
  - Recognizes supported sheets such as `customers`, `catalog`, `orders`, `purchases`, `expenses`, `urgentOrders`, `appointments`, `techInventory`, `techInventoryLogs`, `techFinancialLogs`, `customerPayments`, `users`, `settings`, and `techLocations`.
  - Converts JSON cells back into arrays/objects.
  - Preserves timestamps and converts date-like Excel cells when possible.
  - Generates IDs when imported rows do not include IDs.

- New shared payload builder: `lib/fullPayload.ts`
  - Builds the same full dataset used by backup/export/cloud sync.

## Updated pages

- `app/settings/page.tsx`
  - Import now accepts JSON and Excel files.
  - Imported data is merged or replaced, then saved to Supabase.
  - Archive XLSX export now creates importable data sheets.

- `app/urgent-orders/page.tsx`
  - Added XLSX export for urgent orders.
  - Added XLSX import for urgent orders.
  - Imported urgent orders are merged and pushed to Supabase.

- `app/appointments/page.tsx`
  - Added XLSX export for appointments.
  - Added XLSX import for appointments.
  - Imported appointments are merged and pushed to Supabase.

- `app/reports/page.tsx`
  - Added XLSX export for the current report.
  - Added a generic Excel import button for data workbooks from the reports area.
  - Import merges compatible sheets and saves the result to Supabase.

- `lib/xlsxExport.ts`
  - Data XLSX export now keeps timestamps as raw values so exported workbooks can be imported safely.

## Notes

- Import works best with Excel files exported from the system.
- Supported sheet names should match system data keys such as `customers`, `catalog`, `orders`, `urgentOrders`, or `appointments`.
- Report-only XLSX files are exports for viewing and may not contain enough source data to re-import as business records.
