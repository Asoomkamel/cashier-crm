# Product Categories, Maintenance Options, Invoice Print/Send, and Customer Statement Updates

Implemented updates:

- Added product category management through Settings under Operations.
- Added productCategories to AppSettings while keeping legacy categories backward-compatible.
- Catalog now uses product categories from Settings and supports quick category creation inside the product modal.
- Catalog list now displays product category and supports category filtering.
- POS/catalog product filtering now uses Settings productCategories plus existing item categories.
- Technician inventory and technician self-inventory now display and filter items by product category.
- Maintenance reminder/defer options now include monthly options from 1 month to 12 months, including 4, 5, 6, 7 months and beyond.
- Technician task defer modal now includes monthly deferral buttons based on maintenanceReminderOptions.
- POS last invoice now supports Print, Send WhatsApp, and Print & Send.
- Sales history now supports printing any invoice, sending invoice details over WhatsApp, and Print & Send.
- Technician task invoice modal now supports Print, Send WhatsApp, and Print & Send after creating the invoice.
- CRM customer details now include account statement filters: all, last week, last month, last 3 months, last 6 months, last year, and custom date range.
- CRM customer statement printing now respects the selected filter and includes invoices and payments.

Notes:

- WhatsApp opens with a pre-filled invoice message. The user still presses Send manually inside WhatsApp.
- Existing data remains supported. Products without a category show as "غير مصنف".
- Existing settings are merged safely so new product categories and maintenance month options appear even for older localStorage/backups.
