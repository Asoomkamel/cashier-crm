# Reports, Printing, and Visual Charts Update

This update improves the Reports module and fixes printing for reports and statement-style documents.

## Added / Improved

- Added a global printable report container (`print-root`) that works with the existing invoice print system.
- Fixed report printing so the selected report prints cleanly without sidebar, buttons, or app chrome.
- Added professional report header with company name, selected period, and generation timestamp.
- Added date range filter shared across all report tabs.
- Added print button and CSV export button for the active report.
- Added visual bar charts without adding new dependencies:
  - Sales vs expenses and profit.
  - Top products/services.
  - Expenses by category.
  - Payment method distribution.
  - Top customers.
  - Technician performance.
  - Purchases by vendor.
  - Lowest stock products.
  - VAT output/input/net comparison.
- Improved reporting calculations to use the selected period.
- Excluded quotations from actual sales reports.
- Treated sales returns and purchase returns as negative values in relevant reports.
- Improved print support for customer statements, vendor statements/receipts, and technician custody statements by using `print-root`.

## Files changed

- `app/reports/page.tsx`
- `app/globals.css`
- `app/crm/page.tsx`
- `app/purchases/page.tsx`
- `app/technician-inventory/page.tsx`
