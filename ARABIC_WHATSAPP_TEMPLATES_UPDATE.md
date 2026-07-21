# Arabic WhatsApp Templates Update

Changes made:

- Updated default customer WhatsApp template to Arabic.
- Updated default technician WhatsApp template to Arabic.
- Updated Settings placeholder label to Arabic when the UI language is Arabic.
- Added a compatibility migration in `lib/storage.ts`: if existing localStorage still contains the old English default templates, the app automatically replaces them with the new Arabic defaults. Custom user-edited templates are preserved.

Default customer template:

مرحباً {customer_name}، نذكركم بموعدكم بتاريخ {date} بخصوص: {issue}. المبلغ المستحق: {amount} {currency}.

Default technician template:

تم إسناد مهمة جديدة لك: العميل {customer_name} ({customer_phone}). التفاصيل: {issue}. الموعد: {date}.

TypeScript check:

`npx tsc --noEmit` passed.
