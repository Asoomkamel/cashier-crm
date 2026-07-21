# Request / WhatsApp / Technician Enhancements

Implemented updates:

- Urgent order creation is now a two-step flow:
  1. Customer + request details + requested products/services.
  2. Completion details after pressing the complete-request button: technician, notes, marketer, maintenance date, required specialty, and expected amount.
- Urgent orders can include multiple products/services from the catalog.
- Expected amount is calculated automatically from selected products/services, and can also be reused from a previous matching request issue.
- Marketer name and phone are saved with the order and are suggested later using the browser suggestion list.
- A technician can also be used as the marketer.
- Technician users now support specialties such as: رذاذ، صيانة فلاتر، تركيب فلاتر.
- Admin can manage technician specialties in Settings → Branches & Categories.
- Urgent order status labels are displayed in Arabic when the system language is Arabic.
- WhatsApp buttons now open the correct chat using the customer or technician phone number, including Saudi local number normalization.
- WhatsApp sending now shows suggested templates before opening WhatsApp.
- Settings → Messages now supports adding/removing custom WhatsApp templates.
- New placeholders added for WhatsApp templates: {items}, {specialty}, {notes}, {marketer_name}, {marketer_phone}.
- Appointment datetime inputs now use RTL direction when Arabic language is active.

Validation:

- `npm run lint` passed.
- `npm run build` compiled successfully and passed type-checking, but the sandbox build command timed out during Next.js page-data collection. Re-test locally/Vercel after upload.
