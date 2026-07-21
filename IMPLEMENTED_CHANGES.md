# Implemented Changes — Technician Permissions, Login, Quotations

## Completed in this build

1. Removed OTP login from the active UI.
   - Users now sign in with phone number + password/PIN.
   - Admin creates users/technicians with an initial password/PIN.
   - OTP API routes were removed from the active app.

2. Added technician password/PIN change.
   - Technicians can change their own password/PIN from their personal inventory page.

3. Added two new permission flags.
   - `canUpdateCustomerLocation`
   - `canRecordPayments`
   - Both are enabled by default for admin/supervisor.
   - Both are disabled by default for technicians and can be enabled from Users.

4. Updated Users page.
   - Supports creating and editing staff users.
   - Adds optional technician-only checkboxes:
     - Allow updating customer location.
     - Allow recording customer payments.

5. Updated CRM page.
   - Technicians can only update customer location fields if permission is granted.
   - Technicians cannot edit customer name, phone, company, tax number, or customer type.
   - Technicians cannot delete customers.
   - Users with `canRecordPayments` can record a cash payment against a customer's outstanding balance without viewing the full financial history.

6. Added customer payment storage.
   - New `CustomerPayment` model.
   - Payments are saved in local storage and included in JSON backup/import/export.
   - A recorded payment is applied against the customer's outstanding active invoices.

7. Improved quotation handling in POS.
   - Quotations can be created from the POS order type.
   - Quotations do not affect inventory.
   - Quotations do not create a receivable balance.
   - Return invoices add product stock back.
   - Tax invoices deduct stock.
   - Added extra payment methods: Credit/Pay later, Tabby, Tamara.
   - Added invoice/quotation notes.

8. Cleaned project structure.
   - Removed the unused legacy `/src` Vite app.
   - Removed unused shadcn-style `components/ui/` folder to avoid dependency/build conflicts.
   - Sanitized `.env.example` and removed `.env.local` from the distributable project.

## Validation

- `npm run lint` passed.
- `npm run build` passed successfully.

## Not completed in this build

The very large feature migration request from the other project version, such as full VAT declaration, Excel import/export, inventory count module, full technician financial reports, advanced dashboards, PWA installer, and Google Drive version listing, is not fully implemented here. Those features require staged implementation because they affect many modules and data structures.
