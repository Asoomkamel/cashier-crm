# Arabic WhatsApp Template Placeholders Update

Implemented Arabic placeholders for WhatsApp templates while keeping legacy English placeholders supported for existing saved templates and backups.

## Arabic placeholders now supported

- `{اسم_العميل}`
- `{رقم_العميل}`
- `{تفاصيل_الطلب}`
- `{المنتجات}`
- `{التاريخ}`
- `{المبلغ}`
- `{العملة}`
- `{اسم_الفني}`
- `{التخصص}`
- `{الملاحظات}`
- `{اسم_المسوق}`
- `{رقم_المسوق}`
- `{رقم_الطلب}`

## Files changed

- `lib/whatsapp.ts`: renders Arabic and legacy English placeholders.
- `lib/types.ts`: default templates now use Arabic placeholders.
- `lib/storage.ts`: migrates known old default templates to the Arabic-placeholder version.
- `app/settings/page.tsx`: displays Arabic placeholders in Settings.

Build tested successfully with `npm run build`.
