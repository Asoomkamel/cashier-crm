# Reports Curves & Charts Update

This update improves the Reports page with real SVG-based visual charts without adding new dependencies.

## Added

- Curved line charts for time-based report trends:
  - Sales, expenses, and profit curve.
  - Profit curve over the selected period.
  - Output VAT, input VAT, and net VAT curve.
  - Purchases and input VAT curve.
- Donut charts for composition reports:
  - Payment method distribution.
  - Top customer contribution distribution.
- Automatic chart granularity:
  - Daily view for shorter date ranges.
  - Monthly view for longer date ranges.
- Tooltips using native SVG `<title>` on curve points and donut segments.
- Print-friendly chart cards.
- No dependency on Recharts or other chart libraries.

## Build verification

- `npm run lint` passed.
- `npm run build` passed.
