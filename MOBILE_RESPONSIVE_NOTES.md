# Mobile Responsive Version Notes

This version was adjusted to work better on both desktop and phone screens.

## Main changes

- Added a mobile top bar with a menu button and theme toggle.
- Changed the desktop sidebar into a slide-in mobile drawer on small screens.
- Kept the normal desktop sidebar for tablet/desktop screens.
- Improved mobile scrolling by using `100dvh`, `min-h-0`, and safe-area padding.
- Improved dialogs so they fit inside the phone screen and scroll correctly.
- Improved tables so they scroll horizontally instead of breaking the layout.
- Adjusted POS layout so the cart and product area stack correctly on mobile.
- Adjusted several form/dialog grids to switch from two columns to one column on phones.
- Adjusted floating buttons and AI assistant position/size on phones.

## Files changed

- src/App.tsx
- src/components/Sidebar.tsx
- src/index.css
- components/ui/dialog.tsx
- components/ui/table.tsx
- src/components/AIAgent.tsx
- src/components/POS.tsx
- src/components/CRM.tsx
- src/components/Catalog.tsx
- src/components/Appointments.tsx
- src/components/Purchases.tsx
- src/components/Expenses.tsx
- src/components/Users.tsx
- src/components/Dashboard.tsx
- src/components/GlobalActions.tsx
- src/components/CreateRequestForm.tsx
- .env.example was sanitized with placeholders only.

## Test result

The project was tested with:

```bash
npm run build
```

The build completed successfully.

## Important

A previous delivery of this project shipped `.env.example` and `.env.local`
with real, live Supabase and Authentica keys committed in plaintext, despite
this file's earlier claim that they were sanitized. That was inaccurate —
those keys should be treated as already exposed. See the "Security notes"
section in `README.md` for what to rotate before deploying this version.
