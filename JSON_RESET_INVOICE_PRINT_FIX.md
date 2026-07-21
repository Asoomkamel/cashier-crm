# JSON Import, Reset, and Invoice Print Fix

Implemented updates:

- Added support for legacy CRM backup JSON keys such as `crm_orders`, `crm_catalog`, `crm_customers`, `crm_urgent_orders`, `crm_service_orders`, `pos_expenses`, `crm_tech_inventory`, and technician logs.
- Legacy JSON import now maps old fields to the current data model before applying merge/replace.
- Factory reset now requires the admin code and a final confirmation phrase.
- Factory reset clears operational entries locally and overwrites Supabase backup with an empty operational payload while preserving settings and users.
- POS invoice creation now supports invoice display details:
  - If a tax number is entered, company/institution name, tax number, contact number, address, and payment method appear on the invoice.
  - If no tax number exists and a customer is selected, customer name, contact number, and payment method appear.
  - If printing a walk-in invoice without customer data, only the payment method appears in the customer block.
- QR code is now placed at the lower-left area of the invoice.
- Invoice print CSS was improved for long invoices so page-one header data is not clipped by the modal container and table headers can repeat across pages.
