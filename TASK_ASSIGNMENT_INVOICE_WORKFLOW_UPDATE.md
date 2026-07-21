# Task Assignment & Technician Invoice Workflow Update

Implemented requested workflow updates:

- Technicians cannot create urgent requests.
- Technicians no longer have POS access in the sidebar or route guard.
- Global `+` urgent request action opens the main advanced urgent request form for admin/supervisor only.
- Admin/supervisor can create urgent requests with optional issue/details.
- Requests now support multiple required specialties through `requiredSpecialties`.
- Requests now support assignment to one or more technicians through `assignedTechnicianIds` / `assignedTechnicianNames`.
- Technician eligibility now supports:
  - directly assigned technician,
  - technicians matching all required specialties,
  - first technician to accept takes ownership.
- Technician can accept or reject eligible urgent requests.
- Accepted requests move to My Tasks and disappear from urgent requests for technicians.
- Rejected requests disappear only from the rejecting technician.
- Admin can see who accepted a request.
- My Tasks redesigned into:
  - Assigned tasks,
  - Completed tasks.
- Technician task workflow supports:
  - Accepted,
  - In progress,
  - Deferred,
  - Completed.
- Deferred tasks support:
  - 1 day,
  - 2 days,
  - 1 week,
  - custom days,
  - optional defer note.
- Completed tasks show a Print Invoice button.
- Technician invoice creation uses task customer/items automatically.
- Technician cannot edit task products/prices during invoice creation.
- Invoice stores technician name and source task ID.
- Settings now include maintenance reminder options used for next maintenance date calculations.
- Quick product add fields in urgent request form are hidden behind a `+` button.
- Quick added products require name, barcode, and sale price, then save into catalog and attach to the request.
- Product search supports name, barcode, and SKU.
- `package-lock.json` registry URLs were normalized to public npm registry to avoid Vercel internal registry timeout errors.

Files mainly touched:

- `lib/types.ts`
- `lib/storage.ts`
- `app/urgent-orders/page.tsx`
- `app/my-tasks/page.tsx`
- `app/settings/page.tsx`
- `app/users/page.tsx`
- `components/Sidebar.tsx`
- `components/Shell.tsx`
- `components/GlobalActions.tsx`
- `package-lock.json`
