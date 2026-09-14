# Platform — Plans and rates handoff

## Scope

The console's **Plans and rates** screen (`/console/plans`) is the platform's subscription-plan
catalogue: every plan companies can subscribe to, including those no longer offered. From it a
platform operator can:

1. read the whole catalogue: prices, quotas, limits, and whether each plan is offered
2. **edit** a plan (every field except its code)
3. **add** a plan

Before this slice the route showed the "not built yet" page.

**Not in scope:**
- deleting a plan (the backend has no delete)
- a tenant's own plan screen (`/settings/plan`, still mock data)
- the public `/plans` prototype page
- subscriptions and billing
- platform operators, tenant settings, tenants, operations, incidents, audit

| | |
|---|---|
| Frontend branch | `feat/signup-integration` (not committed, not pushed) |
| Frontend base / current HEAD | `2e99ca0` (`main`); no commits made |
| Backend | `D:\fawtir` @ `94cde817`, read only. **No backend code or config change** |
| Backend migration needed | none beyond what `94cde817` already contains: V176 (catalogue table and seed) and V178 (permission backfill) |
| Prisma | not used: `PRISMA_APPLICABLE = NO` |
| New dependencies | none |

## API contracts (verified in backend source and live)

Source: `PlatformPlanCatalogueController`, `PlanCatalogueAdminService`, `JdbcSubscriptionPlanAdapter`,
the `SubscriptionPlan` domain record, and V176.

Both endpoints are `@RequiresPermission("platform.tenants.manage")`. The portal cookie session is
MFA-verified by construction, and no extra step-up applies.

**`GET /api/v1/platform/plans`**
- Returns `SubscriptionPlan[]`: **all** plans, inactive ones included, ordered `sort_order, code`.
- Companies see a different endpoint, `/settings/plan/catalogue`, and it returns only active plans (`findAll(false)`).

**`PUT /api/v1/platform/plans/{code}`** is an upsert:
- It runs `INSERT … ON CONFLICT (code) DO UPDATE`. An unknown code **creates** a plan; a known one is **replaced in full**.
- It returns the stored plan (re-read after the write).

**Request body:**

```
{ name, monthlyPrice, invoicesPerMonth, peopleIncluded, extraPersonPrice, branchesIncluded,
  apiAccess, prioritySupport, overagePricePerInvoice, sortOrder, active }
```

**Nulls carry meaning.** An omitted field is stored as `null`; it is not kept:

| Field | `null` means |
|---|---|
| `extraPersonPrice` | the people count is a hard ceiling — no one can be added beyond it |
| `branchesIncluded` | unlimited branches |
| `overagePricePerInvoice` | overage is not offered — invoicing stops at the quota |
| `sortOrder` | `0` |
| `active` | `true` |

**Validation:**
- Bean Validation: `@NotBlank name`; `@NotNull` on `monthlyPrice`, `invoicesPerMonth`, `peopleIncluded`, `apiAccess` and `prioritySupport`. A failure is a `400 validation-failed` with `errors[].field`.
- Domain invariants throw `ValidationException`, which is also `400 validation-failed` but carries no field, only an English sentence:
  - code `[A-Z][A-Z0-9_]{1,29}`
  - name at most 80 characters
  - money `≥ 0`
  - invoices and people `≥ 1`
  - branches `≥ 1` or `null`

**Money:**
- Omani Rial, `NUMERIC(12, 3)`. Every price is monthly. Currency and period are implied, not fields.
- JSON numbers arrive unscaled (for example `49`), so the UI formats them to three decimals.

**Other refusals:**
- `401 unauthenticated`
- `403 insufficient-permission`
- `429 rate-limited`
- `5xx`
- network failure and timeout (client side)

**No `409`:** the upsert has no version and no conflict path.

**Effect of a save:** subscriptions reference `plan_code` live, so an edit applies at once to every
company on that plan. The only record of who changed it is `updated_by` / `updated_at`.

## Behaviour

| Piece | Behaviour |
|---|---|
| Access | `ConsoleShell requires="platform.tenants.manage"`: the permission **code** from `GET /me/entitlements`, never a role name. Without it: "No access", and the catalogue is not requested |
| Read | One `GET /platform/plans` through `useConsoleRead`, which joins identical in-flight requests (StrictMode) and sends a `401` to Login |
| States | Loading (spinner status). Failed (`ConsoleReadFailure`): a `403` reads as "No access" — **never** as an empty catalogue — and anything else offers Retry. Empty ("There are no plans in the catalogue yet."). Loaded |
| Card | The tenant plan screen's card, filled only from backend fields: Active/Inactive pill, code, name, `Rial` + price + "/ month", and the feature list |
| Feature lines | Derived only from the fields and their null meanings (`planFeatures`), never from a plan's name or code. Invoices; people (or "people, then OMR x each"); branches (or unlimited); API; priority support; overage (or "Invoicing stops at the quota") |
| Edit | A modal pre-filled from the plan. The code is read-only, because a different code in the URL would create a second plan rather than rename this one. Every field is sent on save (full replacement) |
| Add | The same modal with an editable code. A code already in the catalogue is refused **before** sending ("A plan with this code already exists"), because the upsert would silently overwrite that plan |
| Optional limits | An empty input sends `null` — never `0` — with the hint saying what empty means |
| Money in the editor | Pre-filled with three decimals and no thousands separators (for example `49.000`), so it re-parses |
| After a save | The stored plan the `PUT` returns is merged into the list in the backend's own order (`sortOrder`, then `code`) and "*Name* saved." is announced. **No re-read**; a reload was verified to show the same list |
| Double submit | Guarded by an in-flight ref plus disabled buttons. Double-click, repeated Enter or a second submit all give one `PUT` |
| Validation | Client rules mirror the backend exactly (code regex, name ≤ 80, `NUMERIC(12,3)` money, `≥ 1` counts, Java int bounds). The first invalid field gets focus. Backend field errors are mapped by field name to a localized message; a field-less `400` (a domain invariant) is one localized form message. Backend English is never shown |
| Save failures | `401` → Login (cached entitlements forgotten). `403` → "You don't have access". `429`, `5xx`, network and timeout → the shared localized messages. The editor stays open with the draft intact |
| Cancel | Closes without a request; the draft is discarded. Escape and a backdrop click also close it, except while saving |
| Nav | "Plans and rates" no longer carries the "soon" marker |

**Design parity.** No Figma frame exists for the console Plans screen: the console nav notes that
only Operations and Tenants are designed. The screen is composed only of existing parts:
- the Tenants page header and primary button
- the tenant `/settings/plan` plan card (the same classes)
- the Operations status pill (now the shared `ConsoleStatusPill`)
- `ConsoleNotice` / `ConsoleReadFailure`
- `Modal`, `Input` and `Switch`

No CSS file, token, colour, font or global layout changed. **Product-owner visual sign-off is still
outstanding** for this composed layout.

## Request counts (measured in the browser)

| Action | Requests |
|---|---|
| Open from the console sidebar (entitlements cached) | **1**: `GET /platform/plans` |
| Direct load or refresh of `/console/plans` | **2**: `GET /me/entitlements`, `GET /platform/plans` |
| Save (edit or add), double-clicked | **1**: `PUT /platform/plans/{code}` with `X-CSRF-Token` |
| Client-side validation failure, codeTaken, Cancel | **0** |
| Polling | **0** |

## Files (this slice)

**New:**
- `src/lib/subscriptionPlans.ts`: the `SubscriptionPlan` type, `formatOmr`, `planFeatures`, `sortPlans`. Shared, ready for the tenant plan screen.
- `src/lib/console/planCatalogue.ts`: the permission and path, `PlanUpsertRequest`, the form types, `planFormFrom`, `validatePlanForm`, `toUpsertRequest`, `savePlan`, `withSavedPlans`, `describePlanSaveFailure`.
- `src/lib/console/planCatalogue.test.ts`
- `src/layouts/ConsoleShell/ConsoleStatusPill.tsx`: the Operations pill as a shared component.
- `src/pages/ConsolePage/PlansPage.tsx`: exports `ConsolePlansPage`. The public prototype already owns the name `PlansPage`.
- `src/pages/ConsolePage/plans/PlanEditor.tsx`
- `src/pages/ConsolePage/plans.test.tsx`
- `src/test/setup.ts`: raises Testing Library's async timeout to 5 s. `findByRole` over the console shell took longer than 1 s under full-suite load, and a varying handful of console tests failed per run.

**Modified:**
- `src/App.tsx`: `/console/plans` → `ConsolePlansPage`.
- `src/pages/ConsolePage/index.ts`: the export.
- `src/lib/consoleNav.ts`: `soon` removed from Plans.
- `src/pages/ConsolePage/verification/VerificationStatusPill.tsx`: now uses `ConsoleStatusPill` (same markup).
- `src/lib/identity/errors.ts`: `FormMessage.values` accepts strings as well as numbers.
- `vite.config.ts`: `test.setupFiles`.
- `src/i18n/locales/en.json` and `ar.json`:
  - `console.plans.*`, and `plan.feature.overage` / `noOverage`
  - **plural forms** for `plan.feature.people` / `peopleThen`, and the Arabic `branches` (`_two`, `_few`, `_many`)

  Before this change "1 people" rendered in English. In Arabic, 3–10 branches fell back to **English** ("5 branches") because i18next asks for `_few`. The tenant `/settings/plan` screen uses the same keys, so it is fixed too.

## Security

- Access is gated on the permission code only; the backend enforces it regardless. No role name
  grants anything (tested with `PLATFORM_ADMIN` and no permission).
- A `403` read never masquerades as an empty catalogue.
- Writes use the cookie session with the double-submit CSRF header (`apiRequest`). Nothing goes
  into local or session storage, URLs or logs. The plan code in the URL is `encodeURIComponent`-ed.
- Request bodies are built field by field (`toUpsertRequest`), with no spread of form state and no
  UI-only fields.
- Add-mode `codeTaken` prevents an accidental overwrite through the upsert. It is UX only: another
  operator could create the code between read and save (see gaps).
- Server English is never rendered; everything is localized in EN and AR.

## Verification

**Automated:**
- 390/390 vitest, green on three consecutive full runs. The Plans slice has 41 page tests and 15 unit tests, covering:
  - access, missing permission, role-name-only, `403`, `401`
  - loading, empty, backend figures (none of the mock 19/49/89 figures) and backend order
  - active/inactive; null semantics; singular and Arabic plurals
  - the exact full `PUT` payload with nulls; the in-place merge without a re-read; clearing a limit to `null`
  - double submit; client validation cases; backend field errors; field-less `400`
  - `403`/`429`/`5xx`/network on save; `401` mid-edit; cancel
  - add with codeTaken and invalid codes; a timeout
- The Arabic plural test was mutation-checked: it fails with `branches_few` removed.
- `tsc -b` clean, eslint clean on the changed files, `vite build` OK (the existing chunk-size warning only).

**Real browser, local backend:**
- Playwright on `:5174`, gateway `:18080`, the bootstrap platform operator (`platform.tenants.manage`), and a real email-code sign-in via Mailpit.
- Harness: scratchpad `plans-verify.mjs`.

| Check | Result |
|---|---|
| Sidebar → Plans (EN 1440) | 1 request; 3 seeded plans, all Active |
| Direct load: EN 1440, EN 390, AR 390, AR 1440 | 2 requests each; `dir` ltr/rtl; no horizontal overflow; no overflow with the editor open on AR 390 |
| Client validation (invoices `0`, price `1.2345`) | both messages shown; focus on the first invalid field; 0 requests |
| Edit Business → 52.500 plus overage 0.100, double-clicked | 1 `PUT` (+CSRF), full payload; card updated in place; DB row matched |
| Restore Business to 49.000, overage empty | 1 `PUT`; all three seeded rows equal the "before" capture |
| Add with code `STARTER` | "already exists"; 0 requests; DB unchanged |
| Add `LOCAL_TEST_PLAN` (inactive, sort 999) | 1 `PUT`; Inactive card placed last; DB row matched |
| Reload after the saves | the same list as the merged view |
| Sign out, then open `/console/plans` | lands on `/login` |
| Page errors / console errors / unexpected writes | 0 / 0 / 0 |

## Local data changed by verification

- **`BUSINESS`**: edited and restored. Its values equal the V176 seed again; only its `updated_by` / `updated_at` now record the operator's restore.
- **`LOCAL_TEST_PLAN`**: created twice (two harness runs). Each time it was removed afterwards with one local `DELETE`, guarded by `active = false` and "no subscription references it" (0 did). The API has no delete. The final catalogue equals the original three rows.
- No subscriptions exist locally, so no company was affected. Nothing on TEST or production.

## Backend gaps (documented, not fixed)

1. **No optimistic concurrency.** Two operators editing the same plan: the last write silently wins. Suggest a `version` / `If-Match` and a `409`.
2. **The upsert cannot distinguish add from replace.** A create with an existing code overwrites that plan. The UI's `codeTaken` check is only as fresh as its read. Suggest `POST` for create (`409` on an existing code) and `PUT` for update (`404` on an unknown code).
3. **No delete or retire flow** beyond `active = false`. A mistaken plan cannot be removed through the API.
4. **No audit event** for catalogue changes, only `updated_by` / `updated_at`, which a later save overwrites. Price changes to live subscribers deserve an audit trail (SRS FR-603/604).
5. **Edits apply immediately to every subscriber.** There is no effective date, grandfathering, or notice to affected companies.
6. **Plan names are single-language data.** The Arabic UI shows "Business Plus" as stored. A localized name (or name key) would be needed.
7. **Currency and period are implied** (OMR, monthly), not fields.
8. **The seed has `overage_price_per_invoice = NULL` on every plan.** Overage is therefore "not offered" on all plans, while the tenant `/settings/plan` prototype shows an overage toggle. That needs a product decision.
9. **Domain-invariant failures carry only an English sentence with no field** (`ValidationException` → field-less `400`), so the UI can mark only Bean Validation fields.
10. The earlier slices' gaps still stand; see `PLATFORM_COMPANY_VERIFICATION_DECISIONS_HANDOFF.md`.

## Pre-existing work preserved

All earlier uncommitted slices on this branch are untouched: signup, onboarding, final submission,
login, logout, platform discovery, verification, and verification decisions.

The mock catalogues are left in place, because the other screens that use them are out of scope:
- `src/lib/settingsBilling.ts` `PLANS`, used by the tenant plan screen
- `src/lib/superAdmin.ts` `PLANS`, used by Operations and Tenants

## Integration notes and conflict-sensitive areas

- `src/i18n/locales/*.json`: the plural-key renames (`people` → `people_one` / `_other` and so on). Any branch that adds text under `plan.feature.people` must use the plural keys.
- `ConsoleStatusPill` is now shared by Verification and Plans.
- `App.tsx` imports `ConsolePlansPage` (not `PlansPage`, which is the public prototype).

## Next recommended slice (needs separate authorisation)

- The tenant's own plan screen (`/settings/plan`) reading `/settings/plan/catalogue` through the
  shared `subscriptionPlans.ts`.
- Or Platform Operators.

Not started.

## Post-integration checklist

- [ ] Product owner signs off the composed Plans layout (no Figma frame exists).
- [ ] Backend decision on concurrency and create-versus-replace (gaps 1–2) before multiple operators edit prices.
- [ ] Decide the overage policy (gap 8) and localized plan names (gap 6).
- [ ] Commit and push only when authorised.
