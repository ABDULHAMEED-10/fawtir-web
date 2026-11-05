# Backend guides

**For:** the backend team. One guide per area of the product. Each lists every screen element the
API does not provide yet, and what to add.

| Area | Guide |
|---|---|
| Income and Customers (invoices, notes, periodic, reminders, self-billing up to 6 Oct 2026, customers, PINT-OM line classification, the sign-up answers invoices depend on) | [INCOME.md](INCOME.md) |
| POS support: the burnt-number block (no release in RC5; see §10.1), and its release note | [POS_SUPPORT_RUNBOOK.md](POS_SUPPORT_RUNBOOK.md) |
| Expenditure and Suppliers (bills, payments, recurring bills, bill reminders, supplier notes, suppliers, self-billing since 6 Oct 2026) | [EXPENDITURE.md](EXPENDITURE.md) |
| Documents (the archive) | [DOCUMENTS.md](DOCUMENTS.md) |
| Trade documents (quotations, order forms, delivery notes, purchase receipts, converting them to invoices) | [TRADE_DOCUMENTS.md](TRADE_DOCUMENTS.md) |
| Reports (the six report pages) | [REPORTS.md](REPORTS.md) |
| Activity ("TDD & OTA" in Figma) | [ACTIVITY.md](ACTIVITY.md) |
| Settings (Company profile) | [SETTINGS.md](SETTINGS.md) |
| Public site (Home, Pricing, Features, Contact Us) | [SITE.md](SITE.md) |
| Super Admin console (Tenants list) | [CONSOLE.md](CONSOLE.md) |
| Onboarding: plan, payment, review and the "Getting you live" status screen | [ONBOARDING.md](ONBOARDING.md) |

Every gap is also a `// TODO(backend)` comment in the code, citing its row number here.

Sign-in, sign-up, onboarding and the Super Admin console have their own integration handoffs in
`docs/frontend/` (the console's screen gaps are in [CONSOLE.md](CONSOLE.md)); ERP and the console
plan are in `docs/erp-and-console-plan.md`.
