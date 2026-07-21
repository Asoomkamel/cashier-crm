# Vendor, Purchases, and Technician Tasks Update

Implemented changes:

- Purchase invoice modal now uses vendor wording instead of customer wording.
- Added quick product creation inside the purchase invoice form with:
  - Product name
  - Product barcode
  - Sale price
- Selecting an existing catalog item now auto-fills purchase cost and sale price, while still allowing manual edits.
- Purchase invoice lines now keep sale price and barcode; saving a purchase updates catalog stock, cost price, sale price, and barcode.
- Added a dedicated technician menu item: My Tasks / مهامي.
- Added `/my-tasks` page for technician-assigned urgent orders and appointments.
- Assigned tasks are shown automatically when an urgent order or appointment has the technician name.
- Technicians can change task status from the task list.
- Technicians can call or open WhatsApp chat with the customer from their task list.
- Technician-facing urgent orders and appointments no longer show WhatsApp technician or delete actions.
- My Inventory task cards also include WhatsApp customer access.

Validation:

- `npm run lint` passed.
- `npm run build` passed.
