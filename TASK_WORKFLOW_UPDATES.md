# Task Workflow Updates

Implemented updates in this build:

- The global floating `+` button now routes `طلب عاجل جديد` to the same full urgent-order creation workflow used in `/urgent-orders`.
- Technicians and non-admin users cannot change assigned technician or administrative task status from urgent orders/appointments tables.
- CRM/customer list is hidden from technicians and non-admin/non-supervisor users through sidebar filtering and route guard.
- WhatsApp template body is read-only for non-admin users; they can open WhatsApp but cannot edit the template text.
- Technician task list now shows pending task notifications and sidebar badge count.
- Technician workflow now supports:
  - ✓ Accept task → status becomes `تم القبول`.
  - ✕ Reject task → task is canceled/rejected.
  - Move accepted tasks to `قيد التنفيذ`, `تم`, or `مؤجل`.
  - Deferred tasks ask for duration: one day, two days, one week, or custom number of days.
- Urgent request product entry now supports searching catalog items by name/barcode/SKU.
- Urgent request product entry now supports quick creation of a new product with:
  - product name
  - barcode
  - sale price
- Newly created products are saved to the catalog and added to the request immediately.
