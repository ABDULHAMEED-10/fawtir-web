# Backend guides

**For:** the backend team. One guide per area of the product. Each lists every screen element the
API does not provide yet, and what to add.

| Area | Guide |
|---|---|
| Income and Customers (invoices, notes, periodic, reminders, self-billing, customers, PINT-OM line classification, the sign-up answers invoices depend on) | [INCOME.md](INCOME.md) |
| Expenditure and Suppliers (bills, payments, recurring bills, bill reminders, supplier notes, suppliers) | [EXPENDITURE.md](EXPENDITURE.md) |
| Documents (the archive) | [DOCUMENTS.md](DOCUMENTS.md) |
| Reports (the six report pages) | [REPORTS.md](REPORTS.md) |
| Activity ("TDD & OTA" in Figma) | [ACTIVITY.md](ACTIVITY.md) |
| Settings (Company profile) | [SETTINGS.md](SETTINGS.md) |
| Public site (Home, Pricing, Features, Contact Us) | [SITE.md](SITE.md) |

Every gap is also a `// TODO(backend)` comment in the code, citing its row number here.

Sign-in, sign-up, onboarding and the Super Admin console have their own integration handoffs in
`docs/frontend/`; ERP and the console plan are in `docs/erp-and-console-plan.md`.
