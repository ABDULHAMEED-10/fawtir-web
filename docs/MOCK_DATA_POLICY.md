# Mock data policy

Owner decision, 2026-10-08. Applies to every screen in this app and to every person or coding agent
changing one.

Sample data may stay in the code while a module has no server behind it: it is useful for design,
development and tests. It must never be shown as a company's real records, and it must never reach a
real business workflow.

## 1. Classify the module from the code, not from its name

| Kind | What it means | What the screen does |
|---|---|---|
| **Integrated** | Every record on the screen comes from a server endpoint (`src/api/**`, `useApiRead`, `useApiResource`) | Real data only. Empty state when there is none. Error state with retry when the read fails. No sample fallback, ever. |
| **Partially integrated** | Some facts have an endpoint, some do not | Real data for what has one. Anything without one is labelled *Not available yet* (`ModuleUnavailable`, `dashboard.notAvailableYet`, `ChartPending`). Never mix a sample record into a list of real ones. |
| **Not yet implemented** | No endpoint at all (POS, stock, catalogue rules and bundles, trade documents, closing, export, the OTA call log, console operations, subscriptions, incidents, audit, ERP templates) | The prototype and its sample data stay, routed through `DemoModule`, and are shown under a sample-data ribbon until the module is integrated. Console sample tenants are reachable only by their slug ids, never by a real tenant UUID. |

## 2. Showing a prototype: `DemoModule`

```tsx
<Route path="/pos" element={<DemoModule module="pos"><PosPage /></DemoModule>} />
```

- Prototypes are shown by default (owner decision, 2026-10-08: keep the mock data of modules that
  are not integrated). A build hides them all, and shows *Not available yet* instead, with
  `VITE_FAWTIR_DEMO_MODULES=false`; only that literal string hides them.
- Every prototype on screen carries a ribbon that cannot be dismissed (`demoModule.ribbon`):
  sample data, not the company's, nothing is saved.
- A failed request never shows sample data. There is no "fall back to sample data" path on an
  integrated screen.
- **Hidden outright** (owner, 23 Oct 2026, R6): quotations, order forms and delivery notes showed
  another company's sample records inside a real session, so `tradeDocuments` is in
  `HIDDEN_PROTOTYPES` (`src/lib/demoModules.ts`). Whatever the build says, its routes show *Not
  available yet*, the sidebar leaves the Trade documents group out, and no other screen links to it.
  Take it out of that list in the change that connects the module. Purchase orders are integrated
  (`/v1/purchase-orders`) and stay.

### Pages that are partly integrated

A page that has both kinds of content keeps its real reads and its prototype parts side by side,
under the ribbon while prototypes are shown:

- **Compliance report** (`ComplianceReportPrototype`). The company's identity, its Participant ID once
  verified and the signed-in requester come from the server. The figures, register, attestation and
  sharing panels are sample data.
- **Catalog.** The product list comes from `/v1/products`. The "Upload a menu" and "New item" actions
  open their prototypes.
- **Settings hub.** The bills, export and closing cards show their prototype facts.

With `VITE_FAWTIR_DEMO_MODULES=false` each of these falls back to its real-only form.

## 3. Sample data never reaches a real workflow

- **No writes.** Prototypes call no write endpoint. A prototype that needs one is no longer a prototype:
  integrate it (section 5).
- **No conversions.** A sample record is never converted into a real draft. The invoice composer
  ignores `?from=` references and offers nothing to link while `TRADE_DOCUMENTS_CONNECTED` is false
  (`pages/CreateInvoicePage/CreateInvoicePage.tsx`), whether the demo switch is on or off.
- **No preselection.** Real forms start empty and never preselect an invented person, branch,
  customer, number or prefix.
- **No sample input to real calculations.** Sample records never feed a real total, quota, VAT figure,
  compliance report or Peppol state.
- **Tenant from the session only.** Tenant identity always comes from the signed-in session
  (`/v1/me/entitlements`) and the server. It never comes from a sample company.

## 4. Critical screens: always real or "pending"

Some screens show nothing invented, not even inside a prototype ribbon. If the fact is unknown, they
say "pending", "not checked" or "not available":

- company identity and VAT
- Peppol participant registration, SMP publication and SML discovery
- roles and permissions
- payment status and settlement, and bank details
- compliance and certification status
- audit history
- invoice issuance and transmission

## 5. When a module is integrated

A module is production-ready only when all of these hold:

1. It reads and writes through authenticated API calls (`src/api/**`).
2. The server enforces tenant isolation (PostgreSQL RLS) and the right permission. The screen hides
   what the session may not do.
3. Its `DemoModule` wrapper and its sample module in `src/lib/**` are deleted in the same change.
4. It has loading, empty, error and unavailable states.
5. Every new string is in English and in Arabic (`src/i18n/locales/{en,ar}.json`).
6. It shows no invented records.
7. It has backend integration tests and frontend tests, with fetch mocked at the boundary.
8. It has passed real-browser verification of the actual workflow: genuine login, no SQL or API
   shortcuts.
9. It causes no regression in modules already integrated.

## 6. Tests

- Sample data used only by tests lives beside the test or in `src/testing/**`, which production code
  never imports.
- `src/pages/remediation.test.tsx` checks that integrated screens show the reader's own data.
- `src/components/feedback/DemoModule.test.tsx` checks that a prototype is shown by default only
  under the ribbon, and that `VITE_FAWTIR_DEMO_MODULES=false` hides it. The switch is in
  `src/lib/demoModules.ts`.
