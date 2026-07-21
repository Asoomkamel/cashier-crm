# Product Categories, Maintenance Options, Invoice Print/Send, and Customer Statements Fix

This version explicitly adds and verifies the requested workflow items:

- Product categories managed from Settings.
- Category add/rename/delete from Settings.
- Product category dropdown and quick category creation from Catalog.
- Product unit field in Catalog.
- Category filtering in Catalog/POS/technician inventory views where applicable.
- Maintenance reminder options from 1 month to 12 months.
- Invoice WhatsApp message template in Settings.
- Sales History actions: View, Print, Send WhatsApp, Print & Send.
- Sales History filters: date period and payment method.
- CRM customer statement filters: all, today, this week, this month, last periods, this year, custom date.
- CRM customer statement type filter: all activities, invoices, payments, service requests, credit balances.
- Customer statement print view includes invoices, payments, service requests, and current balance.

Main files touched:

- lib/types.ts
- lib/storage.ts
- app/settings/page.tsx
- app/catalog/page.tsx
- app/history/page.tsx
- app/pos/page.tsx
- app/my-tasks/page.tsx
- app/crm/page.tsx
