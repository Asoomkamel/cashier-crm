# XLSX Export Update

Added a full Excel export feature for the system data.

## What was added

- New utility: `lib/xlsxExport.ts`
- New dependency: `xlsx`
- New button in Settings → Backup & Archive:
  - Arabic: `تصدير كل البيانات Excel`
  - English: `Export all data XLSX`
- New archive export button:
  - Arabic: `تصدير الأرشيف Excel`
  - English: `Export archive XLSX`

## Behavior

The exported workbook contains separate sheets for the available app data, including customers, catalog, orders, vendors, purchases, expenses, users, urgent orders, appointments, technician inventory, technician logs, customer payments, settings, and technician locations.

Nested data such as order items, locations, permissions, and settings are preserved inside cells as JSON text so no data is lost.
