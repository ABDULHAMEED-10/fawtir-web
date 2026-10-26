# Console: backend guide

**For:** the backend team. **Covers:** the Super Admin console (`/console/*`), starting with the
Tenants list. **Last updated:** 7 October 2026.

This guide lists every place where a console screen draws something the API does not provide yet,
and what to add. The console's existing integration contracts (company verification, operators,
plans, validation policies) stay in their handoffs in `docs/frontend/`; this file holds only the
gaps.

## How to use this guide

- **The rule.** The product owner ruled that the Figma design is the source of truth. Each screen
  follows its frame; where the API does not carry what the frame draws, the screen shows a marked
  empty placeholder ("—", a neutral bar, "Not reported yet") and the gap is a row below. No figure
  is invented for a real business.
- **Nothing existing was removed.** Every call, request shape and permission check the integration
  added is still there, and the tests that assert them still pass.
- **Rows.** Each row reads: number, what the screen shows, what the backend must add. Row numbers
  are stable ids: the code comments cite them, so they are never renumbered, and new rows are
  appended at the end of their section.
- **Finding it in the code.** Every gap is a `// TODO(backend)` comment naming its row. Search for
  `TODO(backend): CONSOLE.md` in `src/pages/ConsolePage/`.

---

## 1. Tenants list (`/console/tenants`, Figma "Super Admin -> Tenants" 154:112167)

The screen makes one request, unchanged: `GET /v1/platform/companies?page={n}&size=25`
(`PlatformCompanyReview.SummaryPage`). Its summary carries `tenantId`, `tenantCode`, `tenantName`,
`legalName`, `country`, `verificationStatus`, `tenantStatus`, `profileRevision`, `submittedAt`,
`decidedAt`. Tabs, search, filter and sort run over the loaded page only, and say so when the
register is longer than one page. Amounts below are OMR strings with three decimals, as elsewhere.

| # | The design shows | Ask |
|---|---|---|
| 1.1 | Subtitle "284 live, 7 still onboarding", KPI **Live tenants** "284" with "Up 11 this month · 2 left", and the count badge on every tab | Platform-wide counts, not one page's. Add `GET /v1/platform/companies/summary` (or a `counts` object on the page response): `{ byTenantStatus: { ACTIVE, PENDING, SUSPENDED, CLOSED }, awaitingReview, rejected, joinedThisMonth, leftThisMonth, tabs: { needsAttention, onboarding, quiet, nearQuota, closed } }`. Until then the screen counts the loaded rows when one page holds the whole register and shows "—" otherwise |
| 1.2 | KPI **At risk of stopping** "11 · 9 certificates expiring · 2 out of quota with overage off"; row pills "CERT IN 6 DAYS", "88% QUOTA" | Per tenant on the summary: `signingCertificateExpiresAt` (instant) and `quota { used, allowance, overageEnabled }`. Aggregate on the summary endpoint (1.1): `atRisk { total, certificatesExpiring, outOfQuotaOverageOff }`, with the expiry window the platform uses (the design implies 30 days) |
| 1.3 | KPI **Gone quiet** "6 · No filing in 7 days or more · 4 look like broken integrations"; tab **Gone quiet**; row pill "QUIET 9 DAYS" | Per tenant: `lastFiledAt` (instant of the last submission to the Tax Authority) and `integrationSuspectedBroken` (boolean). Aggregate `quiet { total, brokenIntegrations }`. A list filter `activity=QUIET` so the tab can page through every quiet tenant |
| 1.4 | KPI **Monthly recurring** "14,206.000" with "Average 50.020 a tenant" | Aggregate `recurring { monthlyTotal, averagePerTenant }` (OMR, 3 decimals) for subscriptions in force this month |
| 1.5 | Column **Plan**: plan name and "19.000/mo" or "Free until 1 Oct" | Per tenant: `plan { code, name, monthlyPrice, freeUntil }` (`freeUntil` a date, null when paying), names in English and Arabic or a code the console's plan catalogue (`/v1/platform/plans`) can name |
| 1.6 | Column **Quota this month**: a bar and "441 of 500"; tab **Near their quota** | Per tenant: `quota { used, allowance }` for the current period (the same object as 1.2). A list filter `quota=NEAR` (the design's threshold reads as 80 % or more) so the tab can page |
| 1.7 | Column **Filing health · 7 days**: seven day segments (green filed, gold warning, red refused, grey none) and a coloured note ("Renewal not started", "Overage off: would block", "Same cause repeating", "Stopped after key rotation", "Peppol registered, testing", "Nothing to report", "One refusal Tuesday"); row pill "31% REFUSED TODAY" | Per tenant: `filingHealth { days: [{ date, outcome: FILED \| WARNING \| REFUSED \| NONE }] (7, oldest first), noteCode, noteTone: GOOD \| WATCH \| BAD, refusedShareToday }`. `noteCode` an enum the console translates (e.g. `RENEWAL_NOT_STARTED`, `OVERAGE_OFF_WOULD_BLOCK`, `SAME_CAUSE_REPEATING`, `STOPPED_AFTER_KEY_ROTATION`, `PEPPOL_TESTING`, `NOTHING_TO_REPORT`, `ONE_REFUSAL`) with its parameters (weekday, count), never prose |
| 1.8 | Column **Monthly**: "49.000" and the tenure under it ("18 months") | Per tenant: `monthlyAmount` (what the tenant is billed this month, OMR, 3 decimals). The tenure is drawn today from `submittedAt`; an `activatedAt` (when the tenant went live) would make it exact |
| 1.9 | The line under the name: "Sur · VAT OM1100891204 · joined May 2026" | Per tenant on the summary: `city` (the registered town), `taxNumber` (VAT number) and `peppolParticipantId`. Today the line shows the country, the tenant code and `submittedAt` |
| 1.10 | Search "Name, VAT number or Peppol ID…" | A `q` parameter on `GET /v1/platform/companies` matching name, legal name, tenant code, VAT number and Peppol participant ID across the whole register. Today the search covers name and code on the loaded page, and its placeholder says so |
| 1.11 | **Filters** and **Sort** | List parameters: `tenantStatus` (the existing `status` is the verification status), and `sort` (`submittedAt,desc` default, `submittedAt,asc`, `tenantName,asc`, and once 1.5 to 1.8 exist `monthlyAmount,desc`, `quotaShare,desc`). Today both run over the loaded page |
| 1.12 | **Export the list** | `GET /v1/platform/companies/export?format=csv` taking the same filters as the list, behind `platform.tenants.manage`. The button is drawn disabled, with a note, until it exists |

## 2. Tenant page, subscription (`/console/tenants/:id`, real companies)

The page shows the company's subscription, its documents this month with the extra-document
credits, received-document counting for Enterprise, and the lifecycle history, from
`GET …/subscription`, `GET …/extra-documents` and `GET …/received-document-counting`. It offers the
trial exception, the temporary grant and the counting override. These are still missing:

| # | The screen wants | Ask |
|---|---|---|
| 2.1 | **Bills and payments** for one company (two tables, each payment linking to the payments queue; refund cases read-only) | `GET /v1/platform/companies/{id}/bills` and `…/payments` (with refund cases), paged, behind `platform.billing.read`. Not drawn until they exist |
| 2.2 | **History** that reads who, when, what and why, covering grants, give-backs, counting changes and operator plan changes as well as lifecycle events | A history read that unions those sources, newest first with a cursor, and names the actor (operator, customer, system). Today the card lists the subscription read's lifecycle events and shows the actor's id |
| 2.3 | "Would be read-only now; restrictions are switched off on this server" | `wouldRestrict` on the subscription read: the restriction the company would have if restrictions were enforced. Not drawn until it exists |
| 2.4 | **Give back documents**: search the company's documents by number or date and pick the ones a Fawtir fault cost the customer | **Done (21 Oct 2026):** `GET /v1/platform/companies/{id}/issued-documents?number=&limit=` finds the documents (number, type, issued date, `alreadyGivenBack`) and `POST /v1/platform/companies/{id}/extra-documents/give-backs` takes `{ documentIds, reason }`; both need `platform.tenants.manage`. The Documents this month card offers "Give back documents" to that permission; the given-back credit shows in its extra documents with the reason. Search by issued date (`issuedFrom`/`issuedTo`) is served but not drawn |
| 2.5 | **Upgrade at no charge** with a required reason, shown in the history | **Done (17 Oct 2026):** `PUT /v1/platform/companies/{id}/plan` takes `{ planCode, reason }` and requires both (`reason` at most 500 characters); the change is written to the company history as `OPERATOR_PLAN_CHANGED`. The tenant page's Subscription card offers "Upgrade at no charge" with a required reason, to an operator with `platform.tenants.manage` and `platform.plans.read` |

## 3. Enterprise terms (`/console/tenants/:id/enterprise-terms`, `/console/enterprise`)

The terms screen reads and writes `GET/PUT /v1/platform/companies/{id}/enterprise-terms` and its
`/quote`, and lists companies from `GET /v1/platform/enterprise-terms` (V348). The customer's
Plan and usage reads `enterprise.termsSet` on `/v1/settings/plan` and `/v1/settings/subscription`.

| # | What the screen shows | Backend |
|---|---|---|
| 3.1 | **ERP add-on price a month** on the terms form (empty = not offered as a paid add-on) | Done: `erpAddonMonthlyPrice` on the terms request and the plan version (above zero, needs `erpMapping`). ERP included in the contract stays the ERP access card |
| 3.2 | Who saved each set of terms, by name | Done: `createdByName` on each `history` entry; the screen shows "you" for the reader's own saves, the name otherwise, and the id only when the server has no name |
| 3.3 | The Enterprise view on the customer's Plan and usage for every company on Enterprise terms | Done: `enterprise` is set for a company that chose Enterprise at sign-up or holds its own Enterprise plan. One still on a public plan reads `termsSet: false` (TERMS_NOT_SET): "terms being prepared" for the customer, "Terms not set" in the console |
| 3.4 | New Enterprise terms waiting for the renewal, with no withdraw button | Done: `DELETE /settings/subscription/scheduled-change` refuses with 409 `enterprise-terms-scheduled-by-fawtir` |

## 4. Billing settings (`/console/billing/settings`)

| # | The screen wants | Ask |
|---|---|---|
| 4.1 | **Payment link validity** in days, beside card on or off (business rules, console settings: "payment link validity (7 days today)"); greyed while card is off | `paymentLinkValidityDays` on `GET/PUT /v1/platform/billing/settings` (sent only when changed, like the V415 numbers), with its range, and the payment link expiry read from it. Today the console shows 7 read-only (`PAYMENT_LINK_VALIDITY_DAYS`) |

## 5. Console sidebar and topbar (every console screen)

| # | The screen wants | Ask |
|---|---|---|
| 5.1 | **A count beside the sidebar links** that hold work waiting: Verification (companies waiting for a decision), Subscription payments (payments waiting for Finance), Refund cases (cases still open), Incidents (open). Not drawn yet: the queues are cursor-paged without totals, so the sidebar would have to load whole lists on every console page to count them (owner, 24 Oct 2026) | One small read, e.g. `GET /v1/platform/console/counts` answering `{ verificationPending, paymentsAwaitingFinance, refundCasesOpen, incidentsOpen }`, each present only when the caller holds that screen's permission |
| 5.2 | **The topbar search finds a company anywhere in the register.** Today Enter opens Tenants with the words in its search box, which narrows only the page it loaded (row 1.10) | The `q` parameter of row 1.10 on `GET /v1/platform/companies`; with it the topbar can list matches as you type |

## 6. Business types and catalogue templates (`/console/settings/business-types`)

The Business types page reads `GET /v1/platform/business-types` and changes the lists through the
`/v1/platform/business-types` and `/v1/platform/sub-business-types` endpoints; the template editor
reads and writes `/v1/platform/sub-business-types/{code}/template` (draft, import, publish,
versions). All need `platform.catalogue.manage`.

| # | The screen wants | Ask |
|---|---|---|
| 6.1 | **Row errors in the operator's language.** A refused draft or spreadsheet lists every row with the field in words ("Row 12 · HS code"), then the server's own sentence, because the error carries no code | A `code` on each entry of `errors` on `catalogue-template-invalid` (for example `HS_CODE_NOT_LISTED`, `UNIT_NOT_FOR_GOODS`, `REASON_REQUIRED`, `EXPORT_REASON_NOT_ALLOWED`, `NAME_REQUIRED`, `TOO_LONG`, `LIMIT_EXCEEDED`), with its parameters, so the console can word it in English and Arabic and stop showing the English `message` |
