# XLSX Import/Export + POS Sales History Update

Implemented changes:

- Excel export now preserves column headers even when a sheet has no records.
- Added shared XLSX sheet schemas in `lib/xlsxSchemas.ts` for the main system entities.
- Added shared import action helper in `lib/xlsxPageActions.ts`; imports merge into the local data and then save the full payload to Supabase.
- Added Excel export/import controls to key data pages:
  - Catalog
  - CRM customers
  - Customer statement export
  - Expenses
  - Purchases and vendors
  - Vendor statement export
  - Users
  - Technician Inventory
  - Technician personal inventory export
  - POS sales history
  - Existing urgent orders, appointments, reports, and settings XLSX flows now use the improved header-preserving exporter.
- Moved Sales History into POS through `components/SalesHistoryPanel.tsx`.
- Removed Sales History from the main Sidebar navigation and from hidden module settings.
- Kept `/history` as a lightweight wrapper around the new POS sales history panel for backward compatibility with old links.

Notes:

- Imports support `.xlsx` and `.xls` files exported from the system.
- Empty exported files intentionally contain a blank data row so Excel keeps the column names visible and reusable as a template.
