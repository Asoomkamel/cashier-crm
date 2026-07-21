# Cashier CRM — Phase 1 + 2 + 3 + 4 + 5 + 6 (Local, Runnable Build)

This is a working Next.js + TypeScript + Tailwind implementation of the core
modules from the Requirements Specification. It runs entirely locally
(data is stored in your browser's localStorage) — no API keys or external
accounts are required to start it up.

## What's included (Phase 1)

- Login (local phone + PIN placeholder — see Roadmap)
- Dashboard (KPIs, recent orders)
- CRM (customers: add/edit/delete/search)
- Catalog (products/services, stock, tax, bundles-ready data model)
- POS (cart, discounts, tax calculation, payment methods, invoice printing)
- Sales History (search, soft-delete)
- Expenses (categories, totals)
- Purchases & Vendors (vendor CRUD; invoice UI is a stub — see Roadmap)
- Reports (sales by product, expenses by category, stock levels)
- Users & Roles (admin/supervisor/technician/pos, permission flags)
- Settings (company profile, tax/currency/language, invoice numbering,
  JSON export, factory reset)

## Phase 2 additions (new in this build)

- **Urgent Orders** (`/urgent-orders`) — create a request with auto customer
  lookup by phone, assign a technician, move through the status lifecycle
  (pending → started/in progress → completed/canceled), reschedule, send a
  WhatsApp reminder to the customer or technician, export to CSV, and
  delete behind the admin password.
- **Appointments** (`/appointments`) — schedule a maintenance visit, mark it
  completed (which advances the customer's 7-stage reminder cycle and sets
  their next reminder date +90 days), extend/reschedule, WhatsApp reminders,
  CSV export, and password-gated delete. A banner surfaces customers whose
  reminder is currently due.
- **WhatsApp template engine** (`lib/whatsapp.ts`) — placeholder-based
  message rendering ({customer_name}, {customer_phone}, {issue}, {date},
  {amount}, {currency}, {technician_name}, {request_number}), editable in
  Settings, opens a `wa.me` link with the message pre-filled.
- **Admin password gate** (`lib/security.ts`) — customer, sales-history, and
  service-order deletions now prompt for the admin password configured in
  Settings, instead of a plain confirm dialog.
- **CSV export helper** (`lib/csv.ts`) — a dependency-free stand-in for the
  spec's "export to Excel" (CSV opens correctly in Excel); swap in the
  `xlsx` package later if you need native `.xlsx` files.

## Phase 3 additions (new in this build)

- **Technician Inventory** (`/technician-inventory`, admin-facing, gated by
  `canManageTechnicians`) — assign catalog items to a technician, add/pull
  stock, transfer stock between technicians (with insufficient-balance
  checks), record cash advances/settlements against a technician's balance
  (also balance-checked), and a recent-activity log per technician.
- **Technician Mobile View** — signing in with a **technician**-role
  account now replaces the whole admin layout with a dedicated, mobile-first
  screen: live GPS location sharing (`navigator.geolocation.watchPosition`),
  a task list combining assigned Urgent Orders and Appointments, one-tap
  Call and Directions links, and Accept/Complete actions gated by that
  user's `canAcceptTask`/`canCompleteTask` permissions.
- Added `canAcceptTask` / `canCompleteTask` permission flags (Users page
  sets these automatically for the `technician` role).
- Try it: in **Users**, add a staff member with role "Technician" (note
  their phone/PIN), log out, then log back in with that phone/PIN — you'll
  land directly on the technician view instead of the admin sidebar.

## Phase 4 additions (new in this build)

- **Full Purchase Invoice entry** (`/purchases`) — build a purchase or
  return invoice line-by-line (item, quantity, cost price), auto-computed
  subtotal/tax/total, cash/transfer/partial payment tracking, and it now
  actually **updates catalog stock and cost price** (purchases add stock,
  returns remove it). Record a payment against any invoice with a
  remaining balance.
- **AI Assistant** — a floating chat widget (bottom-right, on every admin
  page) that understands a small set of commands and executes real actions
  against your data:
  - `add customer <name> <phone>`
  - `add product <name> <price>`
  - `urgent order <phone>: <issue>`
  - `total sales`, `today sales`, `how many customers`, `low stock`,
    `pending urgent orders`, `help`
  It runs **entirely locally** — no API key needed — via
  `lib/assistant.ts`. To upgrade to a real LLM (Gemini/OpenAI/Claude),
  replace the body of `runAssistantCommand()` with a `fetch()` to a server
  API route that forwards the message to your provider and returns the
  same `{ reply, action }` shape; the widget itself doesn't need to change.

## Phase 5 additions

**Tested and active by default** (no external accounts needed):

- **POS ↔ Technician Inventory link** — a POS sale now deducts from the
  assigned technician's van stock first (if they're carrying enough of
  that item), logging a `sale` entry, and only falls back to the main
  catalog otherwise. "Add"/"Pull" in Technician Inventory now also move
  stock to/from the main catalog, so the two ledgers stay consistent.
  POS also gained a technician + commission-% field.
- **AI Assistant now has a real-LLM hook** (`app/api/agent`) — if you set
  `GEMINI_API_KEY`, the assistant calls Gemini for replies/actions; if you
  don't, it responds `{available:false}` and the widget transparently
  falls back to the local command engine from Phase 4. Verified: both the
  configured-check and the fallback path work today with zero keys set.

**Shipped as ready-to-configure code, not yet tested against a live
account** (each needs a real external service you'd have to sign up for):

- **Supabase multi-tenant backend** — `supabase/schema.sql` (businesses,
  business_members, business_data tables + RLS policies) and
  `lib/supabaseClient.ts` (client + admin helpers, inert unless
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
  `SUPABASE_SERVICE_ROLE_KEY` are set).
- **WhatsApp OTP login (Authentica)** — `app/api/auth/phone/send-otp` and
  `/verify-otp`, which auto-create a business + admin membership on first
  login. Returns a clear `501` today (verified) since no Authentica
  account is configured; **not yet wired into `LoginScreen.tsx`**, so the
  local phone+PIN login keeps working either way.
- **Cloud save/load** — `app/api/cloud/save` and `/load`, which persist/
  fetch the same JSON shape as "Export data" into Supabase, scoped to the
  caller's business via their bearer token. Also returns a clear `501`
  today (verified) without Supabase configured.
- **Google Drive backup** — a "Backup now" / "Restore from Drive" card in
  Settings using Google Identity Services (`lib/googleDrive.ts`). Shows a
  clear "not configured" message today (verified) without
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; becomes a working OAuth popup + Drive
  upload/download once you add a Google Cloud OAuth client ID.

All four are additive — none of them change the app's default (local,
key-free) behavior. Fill in `.env.example` → `.env.local` to activate the
ones you want.

## Phase 6 additions (new in this build)

- **Full Arabic translation + RTL** — every page, nav item, button, table
  header, and form label now goes through `lib/i18n.ts`'s `t()` function.
  Switch **Settings → Financial & Localization → Language → العربية** and
  the whole app (including the printed invoice) flips to Arabic text and
  right-to-left layout immediately — no reload needed. English stays the
  default. To add more translated strings later, add a key to
  `lib/i18n.ts`'s dictionary and use `t("your_key")` instead of hardcoding text.
- **JSON import** (this was missing before — now fixed) — **Settings →
  Backup & Reset → "Import data (JSON)"** lets you pick a `.json` file
  (the same format "Export data" produces) and merges it into your current
  data by ID, so re-importing the same file twice never duplicates records.
  A **"Replace existing data"** link next to it does a full overwrite
  instead, if that's what you want. Both reload the page automatically
  when done so the UI reflects the imported data.

## What's still not wired in

---

## 1. Prerequisites (Windows)

1. Install **Node.js LTS (v20 or v22)** from https://nodejs.org — the
   Windows installer sets up `node` and `npm` automatically.
   Verify in a terminal:
   ```powershell
   node -v
   npm -v
   ```
2. Install **VS Code** from https://code.visualstudio.com
3. In VS Code, install these extensions (Extensions icon on the left, or
   `Ctrl+Shift+X`):
   - **ESLint**
   - **Tailwind CSS IntelliSense**
   - **Prettier - Code formatter**
   (all optional but recommended)

## 2. Open the project in VS Code

1. Unzip the project folder anywhere, e.g. `C:\projects\cashier-crm`.
2. Open VS Code → File → Open Folder... → select `cashier-crm`.
3. Open the integrated terminal: `Ctrl+` ` (backtick), or Terminal → New Terminal.

## 3. Install dependencies and run

The app runs with **zero configuration** — no `.env.local` needed. If you
want to activate any Phase 5 integration (Supabase, WhatsApp OTP, Google
Drive, or a real LLM), copy `.env.example` to `.env.local` first and fill
in only the variables for that integration; leave the rest blank.

In the VS Code terminal:

```powershell
npm install
npm run dev
```

Then open your browser at:

```
http://localhost:3000
```

Sign in with the seeded admin account:
- Phone: `0500000000`
- PIN: `1234`

## 4. Verify everything works (a quick test pass)

1. **Settings** → set your company name/tax rate → Save.
2. **Catalog** → add a product (e.g. "Oil Filter", price 50, tax 15, stock 20).
3. **CRM** → add a customer.
4. **POS** → click the product to add to cart, select the customer,
   choose a payment method, click "Complete Sale" → an invoice preview
   appears at the bottom → click "Print" to test the print layout
   (Ctrl+P in the browser print dialog).
5. **History** → confirm the sale appears.
6. **Dashboard** → confirm totals updated.
7. **Reports** → confirm "Product Sales" shows the item you sold.
8. **Users** → add a staff member with the "pos" role.
9. **Settings → Export data (JSON)** → confirm a backup file downloads.
10. **Urgent Orders** → create a request with a phone number that matches
    an existing customer → confirm the name auto-fills → assign a
    technician → change status to "Completed" → click "WA Customer" and
    confirm a WhatsApp web link opens with the message filled in →
    "Export CSV" and confirm the file downloads.
11. **Appointments** → schedule an appointment → click "Complete" → confirm
    the amber "due for reminder" banner behaves as expected once 90 days
    would have passed (internal state only in this build).
12. **Technician Inventory** → in Users, add a "Technician" role staff
    member → back in Technician Inventory, select them, assign a catalog
    item, click "Add" to give them stock, then "Transfer" to move some to
    another technician → confirm the recent-activity log updates.
13. **Technician Mobile View** → log out → log back in with the
    technician's phone/PIN → confirm you land on the mobile task view
    (not the admin sidebar) → allow location access if prompted → assign
    that technician to an Urgent Order from another (admin) session/browser
    profile, then refresh the technician view and confirm the task appears
    with working Call/Directions/Accept/Complete actions.
14. **Purchases** → add a vendor → "+ New Purchase / Return" → pick a
    catalog item, quantity, and cost price → add the line → Save Invoice →
    confirm the item's stock increased in **Catalog** → back in Purchases,
    click "Record payment" on an invoice with a remaining balance.
15. **AI Assistant** → click the 🤖 button (bottom-right) → try
    `add customer Sara 0511111111`, then `total sales`, then `help` →
    confirm the customer appears in CRM and the replies make sense.
16. **POS ↔ Technician Inventory** → Technician Inventory → assign a
    catalog item to a technician → "Add" 5 units (confirm the main
    Catalog stock for that item drops by 5) → go to POS, add that item to
    the cart, pick the same technician, and complete the sale → confirm
    the technician's van stock dropped by the sold quantity while the
    main Catalog stock did **not** change again (it was already deducted
    when you assigned/added stock to them).
17. **Credential-gated routes** (optional, confirms safe fallback) — with
    no `.env.local` present, `POST /api/auth/phone/send-otp`,
    `POST /api/cloud/save`, and `GET /api/cloud/load` should each return
    HTTP 501 with a clear message, and Settings → "Google Drive Backup"
    should show "Not configured" — the rest of the app keeps working
    normally either way.
18. **Arabic language** → Settings → Financial & Localization → Language
    → select "العربية" → Save Settings → confirm the sidebar, page titles,
    buttons, and table headers switch to Arabic and the layout flips to
    right-to-left → go to POS, complete a sale, and confirm the printed
    invoice is also in Arabic/RTL → switch back to English the same way.
19. **JSON import** → Settings → "Export data (JSON)" to get a backup file
    → make a change (e.g. delete a customer) → Settings → "Import data
    (JSON)" → pick that file → confirm the deleted customer reappears
    (merge mode) after the page reloads. Try "Replace existing data" with
    the same file to confirm a full overwrite also works.

## 5. Building for production / type-checking

```powershell
npm run lint    # TypeScript type-check only, no emit
npm run build   # Production build (same build used for deployment)
npm start       # Serve the production build on port 3000
```

## 6. Debugging in VS Code

- Set breakpoints directly in `.tsx` files.
- Press `F5` or use "Run and Debug" with a launch config like:
  ```json
  {
    "type": "node-terminal",
    "request": "launch",
    "name": "Next dev",
    "command": "npm run dev"
  }
  ```
  Then attach the built-in "JavaScript Debugger" to the browser tab
  (VS Code will prompt you), or simply use the browser's own DevTools
  (F12) for React component debugging — this is normal for Next.js apps.

## 7. Project structure

```
app/                 Next.js App Router pages (one folder per module)
  page.tsx           Dashboard
  pos/page.tsx        POS
  crm/page.tsx         CRM
  catalog/page.tsx     Catalog
  purchases/page.tsx   Purchases & Vendors
  expenses/page.tsx    Expenses
  history/page.tsx     Sales History
  reports/page.tsx     Reports
  users/page.tsx       Users & Roles
  settings/page.tsx    Settings
components/          Shared UI (Sidebar, Shell, LoginScreen, ui.tsx, InvoicePrint)
lib/
  types.ts           Core data model (matches the spec's Section 5)
  storage.ts         localStorage persistence layer
  store.tsx           React context wiring state + actions to every page
```

## 8. Roadmap / how to activate the Phase 5 integrations

Completed so far:

- ✅ **Phase 1** — Dashboard, CRM, Catalog, POS, History, Expenses, Vendors,
  Reports, Users & Roles, Settings, local login.
- ✅ **Phase 2** — Urgent Orders, Appointments, WhatsApp template engine,
  admin-password-gated deletes.
- ✅ **Phase 3** — Technician Inventory (stock/cash ledger, transfers) and
  the Technician Mobile View (GPS, tasks, call/directions, accept/complete).
- ✅ **Phase 4** — Full Purchase Invoice entry (with stock updates) and the
  AI Assistant (local command engine, upgradeable to a real LLM).
- ✅ **Phase 5** — POS↔Technician Inventory stock link (tested); real-LLM
  hook for the AI Assistant (tested fallback); Supabase schema, WhatsApp
  OTP routes, cloud save/load, and Google Drive backup shipped as
  ready-to-configure code (tested "not configured" paths; live behavior
  needs your own credentials).

To activate each remaining integration:

1. **Supabase** — create a project at supabase.com, run `supabase/schema.sql`
   in the SQL editor, then set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in
   `.env.local` (copy from `.env.example`).
2. **WhatsApp OTP (Authentica)** — sign up at authentica.sa, set
   `AUTHENTICA_API_KEY_BASE64` + the two URL vars, then update
   `components/LoginScreen.tsx` to POST to `/api/auth/phone/send-otp` and
   `/verify-otp` instead of calling the local `login()` function.
3. **Cloud sync** — once Supabase is active, replace the bodies of
   `lib/storage.ts`'s getters/setters with calls to `/api/cloud/load` and
   `/api/cloud/save` (same function signatures, so no page changes needed).
4. **Google Drive backup** — create an OAuth 2.0 Web client ID in Google
   Cloud Console (enable the Drive API, add the `drive.file` scope, add
   your dev/prod origins as authorized JavaScript origins), then set
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. The Settings page buttons activate
   automatically.
5. **Real LLM for the AI Assistant** — get a Gemini API key from
   ai.google.dev and set `GEMINI_API_KEY`. No other changes needed —
   `app/api/agent` and the widget already handle both states.

Each phase/integration is additive and doesn't require rewriting the
modules already built here.
