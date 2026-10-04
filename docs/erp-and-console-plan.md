# ERP integration and console configuration — screen plan

**Date:** 14 Sep 2026, updated 15 Sep (subscription payments, §7–8) · **Inputs:** `ERP_MAPPING_SPEC-2026-09-11.md`, `ERP_CONNECTOR_SPEC-2026-09-11.md` (backend, Zain), `Fawtir_Pricing_Model.pdf`, `Fawtir_Subscription_Defaults-1.pdf` · **Status:** plan, nothing built.

No Figma frame exists for any screen in this plan. Like POS, they are built from our own templates — `SettingsShell` for the tenant side, `ConsoleShell` for the super admin side — and every visual decision is ours to make and flag.

---

## 1. Where ERP integration lives in Settings

**Decision: a new group tab, `Integration`, placed between People and Billing.**

`All · Company · People · Integration · Billing · Records`

Why there and not last:
- Company, People and Integration are all "set the account up"; Billing is money; Records is history. Keeping the three set-up groups together reads better than pushing Integration to the end.
- Records is deliberately the last tab (it is the read-only trail). A tab after it would break that.
- The backend spec proposed between Company and People. That splits "who is in the company" from "what the company is"; ours keeps them adjacent. The API does not care.

Why not a card under Company beside "Peppol and tax": the mapping alone is seven screens and the connector adds six more. A single card in Company would hide the largest sub-area of Settings.

Hub cards in the Integration group (same `HubCard` shape as today — state first, name second):

| Card | Pill (from `GET /settings/erp-mapping` / `GET /settings/erp`) | Foot line | Opens |
|---|---|---|---|
| **ERP mapping** | Not set up · Draft · Ready, not certified · Certified · Stale | "Guided · Odoo · 41 of 43 fields" | `/settings/erp-mapping` |
| **Connected systems** | Add-on (not active) · 1 connected · Error | "Next run 14:30 · 12 collected today" | `/settings/erp/connections` |
| **API access** | later — no screen today | — | — |

The card is hidden for users without `admin.settings.manage`, same as the group.

---

## 2. Tenant screens — ERP mapping (spec 1)

All under `SettingsShell group="integration"`. Route map:

| Route | Screen | Built from |
|---|---|---|
| `/settings/erp-mapping` | Overview | KPI cards (reuse `CatalogShell` `Kpi`), status chip, certification table, recent activity list |
| `/settings/erp-mapping/fields` | Field mapping (the wizard) | one long page, seven section anchors, sticky checklist |
| `/settings/erp-mapping/preview` | Preview | sample picker + JSON tree |
| `/settings/erp-mapping/certification` | Certification | four route cards + report + history table |
| `/settings/erp-mapping/advanced` | Hand-written profile | code editor + dry-run |
| `/settings/erp-mapping/history` | History | three tabs: Revisions · Profiles · Certifications (`RowsView` tables) |
| `/settings/erp-mapping/samples` | Samples and import/export | table + upload modal |

A sub-navigation strip under the Settings tabs (same `TabStrip` component the catalog uses) links the seven: **Overview · Fields · Preview · Certify · Advanced · History · Samples**, with a count or dot where something needs attention (e.g. Certify shows "2 stale").

### 2.1 Overview

- Top row: four KPI cards — **Route** (Guided / Hand-written / None, with source system), **Fields** (43 of 43 required mapped), **Certified routes** (2 of 4), **Samples** (2 of 10).
- **Coverage-limit banner** (always shown, warning tone): "The guided mapping cannot express goods invoices needing HS codes, foreign-currency invoices or period-based invoices. Those need the hand-written route." Three chips link to the relevant section.
- **Certification table**: one row per route (Invoice, Credit note, Debit note, Self-billing) → state pill (Certified / Failed / Not certified / Stale), when, "Run test" button.
- **Recent activity**: last five audit entries, "See all in Records → Activity log".
- Empty state (`NOT_SET_UP`): the OTA-required-fields note in plain words (seller phone, three address lines, issue time, VATIN, per-line goods/services flag, ISIC, line VAT amount) and two buttons: *Start guided mapping* · *Upload a hand-written profile*.
- Primary call to action changes with status: Start → Finish the 2 missing fields → Certify → Re-certify (stale).

### 2.2 Field mapping — the wizard

Answer to F-1: **one long page, not a stepper.** Seven sections in catalogue order (Document · Seller · Buyer · Tax · Lines · Payment · Totals), each a card with its rows; a sticky right-hand **readiness checklist** that never scrolls away. A stepper would hide the checklist and force the tenant through sections they do not need.

Row anatomy (one per `TENANT_MAPPED` target from `GET /peppol/mapping-targets` — never hard-coded):

```
[IBT-042]  Seller contact telephone           REQUIRED
   Source   [ header.seller.phone        ▾ ]   ← SourcePathPicker
   Default  [ +968 …                       ]   ← optional constant
   ▸ Value map (3)     ▸ Advanced
```

- **Requirement pill**: Required · Conditional ("when credit or debit note") · Optional. `PLATFORM_SUPPLIED` / `DERIVED` rows render read-only, greyed, "Fawtir supplies this".
- **SourcePathPicker**: our `Popover`, search box, keys flattened client-side from the chosen sample (answer to F-2: no server endpoint needed). Shows the example value beside each key. Free typing allowed; grammar-checked live (`MALFORMED_SOURCE_PATH`).
- **Value map**: only on code targets (`codeList` present). Opens a modal (pattern: `ChangePricesModal`): left column = codes seen in the samples (auto-collected), right column = app `Select` fed by `GET …/code-lists/{id}`, plus "if a code is not listed → Fail the invoice / Use default / Pass through". Rate rule shown beside S/E/O/Z. Answer to F-3: no value maps on free text.
- **Advanced disclosure**: transform presets as a menu (date from DD/MM/YYYY, epoch, trim+uppercase, strip non-digits, round 2/3 dp, absolute, percent) which fill a mono textarea the user can edit.
- **Paired requirement**: Buyer identifier / Buyer VATIN shown as one row group "either of"; IBT-047 plain optional.
- **Live validation**: `POST …/guided/validate` debounced **2 s idle**, never per keystroke (30 req/min shared bucket). On 429: banner "Checking paused — resumes in 0:42", edits are kept.
- **Checklist** (right, sticky): Required fields 41/43 with the two missing named and linked; Invalid 0; Coverage limits (three, always); **Save** button with `expectedVersion`; after a complete save: "Compiled and activated — now certify".
- Stale-version conflict (409): modal "Someone else saved this mapping" with reload.

### 2.3 Preview

Sample picker (our popover) → **Run preview** → two panes: the sample JSON (collapsed tree) and the canonical invoice produced, or the failure list with canonical path → business term (looked up through the catalogue) → "Go to field" link into the wizard. Runs through `POST …/guided/dry-run` (or `…/dry-run` with the hand-written content).

### 2.4 Certification

Four route cards. Each: state pill, certified hash short form, "Run test invoice" → modal: choose sample, transaction type (BTOM-001) defaulted by route (answer to F-4: default by route in V1), Run. Result panel: **Passed** (green) or **Failed** with findings table (rule id, message, field). A 200 with `passed=false` is a result, not an error. History table below (`RowsView`).

Any edit after a pass: banner (not toast) "Your mapping changed. Every route needs re-certifying before invoices can be sent."

### 2.5 Hand-written profile

Mono editor (textarea with line numbers, no library in V1), `erpKey` field, **Dry-run with unsaved content**, **Save and activate**, **Deactivate** (danger, confirm dialog says submissions will fail closed). Banner when a guided mapping also exists: "Saving here replaces the guided mapping as what runs."

### 2.6 History

Tabs: **Revisions** (no., origin Edit/Import/Restore, entries, ready, who, when, Restore) · **Profiles** (every compiled or uploaded row incl. inactive, hash, version) · **Certifications** (attempts). Restore = confirm dialog → runs the ordinary save → "Restored as revision 13; certification reacquired" when the hash matches a pass.

### 2.7 Samples and import/export

Table of samples (label, size, uploaded by, when, used in last certification) with upload modal (drag/drop, label, "Samples are visible to all administrators — remove personal data before uploading"). Limit 10, duplicate label → inline error. Export button (downloads the guided-mapping file) and Import (file picker → validation result → 422 lists unknown terms).

### 2.8 Reusable pieces to build once

| Component | Used by |
|---|---|
| `StatusChip` (mapping/connection/record states, tone map) | all ERP screens, hub cards, console |
| `SourcePathPicker` | wizard, template editor (console) |
| `ValueMapModal` | wizard, template editor |
| `ReadinessChecklist` | wizard, connection mapping |
| `JsonTree` (collapsible, copy) | preview, record detail, run detail |
| `CodeEditor` (mono textarea + line numbers) | advanced profile, transform |
| `RuleFindingsTable` | certification report, rejected records |
| `IntegrationSubnav` | the seven mapping screens |

Data per convention: `src/lib/erpMapping.ts` (one modelled tenant state: Odoo, 41/43 mapped, Invoice certified, Debit failed), `erpCatalogue.ts` (the 76 targets, from the backend list — not hand-invented), `erpCodeLists.ts`.

---

## 3. Tenant screens — ERP connector (spec 2)

Gated by the add-on. Same Integration tab.

| Route | Screen |
|---|---|
| `/settings/erp/connections` | Connections list + add-on panel (state, usage bars: connected systems, collected this month) |
| `/settings/erp/connections/new` | Connect: product tiles (Odoo, ERPNext first; others "coming") → credentials form per `authKind` → **Test** → **Discover** (samples + template applied) → hand-off to the connection's mapping |
| `/settings/erp/connections/:id` | Connection detail with tabs: **Overview · Mapping · Runs · Records · Write-back · Settings** |
| `…/:id/mapping` | The same wizard as §2.2, scoped to the connection, with "Reset to Odoo template" |
| `…/:id/runs`, `…/:id/runs/:runId` | Runs table; run detail with counts and error summary |
| `…/:id/records`, `…/:id/records/:recordId` | Records table (ERP no., state, Fawtir invoice link, rejection) + detail with payload tree, rejection findings, **Retry**, **Re-queue write-back** |

Add-on not active → the list shows the add-on card only: price (rial sign, from console config), allowance, "Ask to activate" (plan-included → immediate; purchased → pending until billing). Enterprise → "Included in your plan".

Notifications: collection failures, credential errors, stale certification and the 50/80/100 % extraction quota notices join the bell (`notes.*`), same tone rules as today.

---

## 4. Console (super admin) — configurable platform settings

Everything in `Fawtir_Subscription_Defaults` becomes a screen. Two existing nav items stop being "soon":

### 4.1 `/console/plans` — Plans and rates

- **Plan catalogue** table: Starter · Business · Business Plus (Enterprise is per tenant, §4.3). Columns: band, monthly, annual (two months free, derived), quarterly (= monthly), users, branches, extra user, extra branch, overage rate, features on/off, add-ons available.
- Click a plan → editor with sections: Price and band · Seats · Features (RBAC, recurring, approvals, API, webhooks, SSO, custom reports, white label, support tier, SLA) · Add-ons offered.
- **POS plan** card: per terminal price, receipts included, overage, B2B documents included, users and branches per terminal.
- **Publish model** (fixed by design: a change applies to new subscriptions only): each plan has a *live* version and an optional *draft*; "Publish" stamps a date; tenants on the old terms keep them — shown as "Grandfathered: 41 tenants on the previous price".

### 4.2 `/console/settings` — Console settings

Left sub-nav (same pattern as Settings tabs, vertical on desktop):

| Section | Controls |
|---|---|
| **Billing** | currency (locked OMR), VAT rate, prices shown exclusive, billing anchor, minimum term, subscription invoice series |
| **Counting rules** | table of document kinds × Counts / Does not count (issued, self-billing, received, trade doc over Peppol, trade doc held, POS simplified, receipt no tax, draft, voided, failed validation, rejected by OTA, resubmission); quota consumed at; allowance pools across period |
| **Overage** | rates per plan, permitted, enabled by default, hard ceiling |
| **Trial and lifecycle** | default plan, trial length, trial allowance, mirrors plan, auto-convert, payment details required, auto-renewal, grace days, notice days, cancellation notice, refund, upgrade timing, downgrade timing, suspended behaviour |
| **Notices** | thresholds (50/80/100), recipients, language rule, channels |
| **Add-ons** | ERP extraction price / allowance / overage / included at; POS pricing |
| **Promotional** | discount codes, referral commission, introductory pricing (all "None" at launch — switches present, off) |
| **Fixed by design** | read-only panel: retention 10/15 years, compliance record always accessible, compliance never gated, live-plan change new subs only — with the sentence explaining why they are not settings |

Every control is a form field with **Save** and an audit line ("Changed by Nasser, 14 Sep"). Money uses the rial sign.

### 4.3 Tenant detail — `/console/tenants/:id` (new)

Needed for the "operations" defaults: **Temporary quota grant** and **Overage waiver on a single bill**, both with a reason field and a recorded entry; **Enterprise configuration** panel for per-tenant price, allowance, counting, overage, seats, features, add-ons, contract dates, SLA; the tenant's ERP state (mapping status, connections) read-only for support.

### 4.4 `/console/erp-templates` (under The platform)

Platform-owned starter mappings per product and schema version: list, edit with the same wizard components, publish. From connector spec §6.2.

---

## 5. Things the documents disagree on — flag before building

1. **Three price lists in the app today.** `settingsBilling.PLANS` and `superAdmin.PLANS`: 19/150, 49/500, 89/1500. Sign-up `PlansPage`: 12/35 (Starter/Premium). Pricing doc: **12/200, 28/1000, 55/3000**, users 2/5/10, branches 1/2/5. Proposal: one `src/lib/plans.ts` fed by the console config, aligned to the pricing doc, and the Settings › Plan, sign-up and console screens all read from it. This changes visible figures on built screens, so it is a decision for you.
2. **Overage default.** Doc: permitted and on. App: Al Bahja has it off (`OVERAGE_ON = false`) — fine as a tenant choice, but the console default and the Plan page copy ("submissions would be blocked") must follow the setting.
3. **What counts.** Doc counts received invoices and trade documents sent over Peppol. The app counts "invoices" only ("441 of 500 invoices"). Copy becomes "documents" and the usage forecast must include received ones.
4. **Trial.** Doc: 15 days, 25 documents, mirrors Business, no auto-convert, no card. The sign-up flow's plan step should say this plainly.
5. **Tab placement** differs from the backend's suggestion (see §1) — no API impact.
6. **Rate limit** (30/min on the whole mapping prefix) shapes the wizard; we back the backend's Z-2 split.
7. **Arabic names** for the 76 targets: we localise from `businessTermId` client-side (answer to F-7); if the backend adds `nameAr` later we switch.
8. **Currency text.** The docs write "OMR"; every screen here uses the rial sign per our rule.

## 6. Build order (original — superseded by §8)

| Phase | Screens | Why first |
|---|---|---|
| 1 | Integration tab + hub cards; mapping Overview, Fields, Preview, Certification | the backend's V1 is this; field mapping is included on every plan |
| 2 | Advanced, History, Samples/import-export | completes spec 1 |
| 3 | Console: Plans and rates, Console settings, tenant detail, ERP templates | your plan-configuration promise to the backend |
| 4 | Connector: add-on, connections, connect flow, runs, records | ≈36 backend days; UI can be built on mock data earlier if wanted |

Each phase: mock data in `src/lib`, EN + AR, responsive (`max-md:` only), `npm run build`, sweep + desktop gate, screenshots.

---

## 7. Subscription payments and activation (added 15 Sep 2026)

### 7.1 The rule

**Every subscription is activated by an operator in the console.** Money can arrive four ways; how it arrives changes who confirms it, not what the system does afterwards.

| Method | Who confirms it arrived | Then |
|---|---|---|
| **Card, by payment link** (Thawani hosted checkout) | Thawani, by webhook — the console shows it as *Paid online* | operator activates (one click); a console setting *Auto-activate on online payment* exists, **off by default** because the client asked for activation to stay in the console |
| **Bank transfer** | someone at Insight sees it on the bank statement | operator records the payment (reference, date) and activates |
| **Cash** | someone at Insight receives it | operator records it and activates |
| **Cheque** | Insight banks it | operator records it (cheque number, bank) and activates |

The payment link is a Thawani checkout session created by the backend. The operator sends it through **WhatsApp, email or any channel** — the console gives them the URL, a copy button and a `wa.me` share with a pre-filled message in the tenant's language. The customer can also open the same link from their own Settings › Bills. Thawani: `https://thawani-technologies.stoplight.io/docs/thawani-ecommerce-api/` — backend owns the session, webhook and redirect URLs; the front end only shows link status (*Unpaid · Paid · Expired*) and a resend.

Every recorded payment and activation is an audit entry with who, when, method, reference and note.

### 7.2 Subscription states (one enum, used on both sides)

`TRIAL` → `AWAITING_PAYMENT` → `ACTIVE` → (payment fails) `GRACE` (14 days, notices day 1/7/13) → `SUSPENDED` (read-only, compliance record still open) → `CANCELLED`. `ACTIVE` renews to `AWAITING_PAYMENT` at the period end when auto-renewal cannot collect (offline methods always do), then back to `ACTIVE` on activation.

### 7.3 Console — subscription screens (build these first)

New nav item under **Customers**: `Subscriptions` (`/console/subscriptions`). Tenant detail becomes real (`/console/tenants/:id`) with a Subscription tab. `Plans and rates` and `Console settings` stop being "soon".

| Route | Screen | Elements |
|---|---|---|
| `/console/subscriptions` | Subscriptions queue | KPIs: awaiting payment (count + rial total), in grace, trials ending in 7 days, revenue this month. Tabs by state with counts: All · Awaiting payment · Active · Grace · Suspended · Trial · Cancelled. Table: tenant, plan, term (monthly/quarterly/annual), state pill, period end, amount due, payment method, last payment, link status. Filters (plan, method, term), sort, search. Row actions: Record payment · Send payment link · Activate · Change plan · Suspend · Open tenant. RowsView on phones. |
| `/console/tenants/:id` › Subscription tab | Subscription detail | Plan and terms in force (price, band, seats, grandfathered since), period and next charge, usage vs allowance (documents, people, branches) with overage state, **Payments ledger** (date, method, amount, reference, confirmed by, invoice), **Activation history**, **Payment links** (URL, sent via, sent when, status, expires), subscription invoices (own series `FWT-…`, Unpaid/Paid/Overdue/Waived, download). Actions bar: Record payment · Send payment link · Activate · Change plan · Grant temporary quota · Waive overage on a bill · Suspend / Resume · Cancel. Enterprise panel for per-tenant terms. |
| `/console/subscriptions/invoices` | Subscription invoices | every `FWT-` invoice across tenants: number, tenant, period, amount, VAT, state, method, paid on; download; "Send reminder". |
| `/console/plans` | Plans and rates | as §4.1 — catalogue editor, POS plan, live/draft publish. |
| `/console/settings` | Console settings | as §4.2 plus a **Payments** section (§7.5). |

Modals (all record a reason/note and land in the audit trail):

| Modal | Fields | Result |
|---|---|---|
| **Record payment** | method (Cash · Bank transfer · Cheque · Card link), amount (prefilled from the unpaid invoice), received on, reference (transfer ref / cheque no. and bank), confirmed by (current operator), note, optional proof upload; checkbox *Activate the subscription now* (on) | invoice → Paid; state → ACTIVE for the period; audit `SubscriptionPaymentRecorded`, `SubscriptionActivated` |
| **Send payment link** | which invoice, expiry (from settings), channel: WhatsApp (opens `wa.me/<phone>?text=…` with amount, plan, period and the URL in the tenant's language) · Email · Copy link; message preview | link row with status Unpaid; resend from the same modal |
| **Activate** (no payment yet — pilot, plan-included, trial extension) | plan, term, start date, period end, reason | state → ACTIVE; audit |
| **Change plan** | new plan, term, when (now pro rata / at period end), price override for Enterprise, reason | schedule or apply; audit |
| **Suspend / Resume / Cancel** | reason, effective date | state change; audit; suspended keeps compliance record open |
| **Grant temporary quota** | extra documents, expires, reason | recorded (existing §4.3) |
| **Waive overage on a bill** | bill, amount waived, reason | recorded (existing §4.3) |

### 7.4 Tenant side — what changes

| Screen | Change |
|---|---|
| Sign-up `/plans` | plans and figures from the console catalogue (pricing doc: Starter 12.000 / Business 28.000 / Business Plus 55.000 monthly; 10.000 / 23.333 / 45.833 annual; 200 / 1,000 / 3,000 documents; 2/5/10 users; 1/2/5 branches; Enterprise on request). Trial: 15 days, 25 documents, no card, no auto-convert — said plainly. Note under the plans: "Pay by card through a secure link, bank transfer or cash. Your account is activated by the Fawtir team once payment is confirmed." |
| Sign-up `/payment` | replace the card form (no card entry in our app — Thawani hosts it) with **How would you like to pay?**: Card by secure link (Pay now → Thawani checkout redirect, or *Send me the link* by WhatsApp/email) · Bank transfer (bank details + reference to quote) · Cash (where and how; "we activate once received"). Then an **Awaiting activation** state on the pending screen (the branch's `SignupPendingPage` already tracks stages; add `AWAITING_PAYMENT` / `AWAITING_ACTIVATION`). |
| Settings › Plan and usage `/settings/plan` | cards from the catalogue; "documents" not "invoices"; overage on/off per console default; upgrade → payment step (link / transfer / cash) → "awaiting activation" banner; downgrade at period end. |
| Settings › Bills and payment `/settings/bills` | **remove the Visa card-on-file panel** ("Add another card", default card) — nothing is stored with Thawani hosted checkout. Replace with **How you pay**: preferred method, bank details for transfer, and per bill: state (Paid via link · Paid cash — confirmed by Fawtir on <date> · Unpaid → **Pay now** opens the link) plus the open payment link if one was sent. Past bills table unchanged. This changes a built screen — flagged. |
| Notifications | awaiting payment (with link), payment received, subscription activated, grace day 1/7/13, trial ends in 3 days, suspended (read-only). Amounts with the rial sign. |

### 7.5 Console settings › Payments (new section, all configurable)

| Setting | Default |
|---|---|
| Provider | Thawani (key status shown masked; test/live mode badge) |
| Methods accepted | Card by link ✓ · Bank transfer ✓ · Cash ✓ · Cheque ✓ |
| Bank details shown to customers | account name, bank, IBAN, reference format |
| Payment link expiry | 7 days |
| Auto-activate on online payment | Off |
| Activation requires an operator | On (locked while the above is off) |
| Cash / cheque proof required | Off (reference only) |
| Reminder cadence for unpaid subscription invoices | day 3, day 7, then grace notices |
| WhatsApp message template | per language, with `{{tenant}} {{plan}} {{amount}} {{period}} {{link}}` |

### 7.6 Decisions (settled 15 Sep 2026)

1. **Prices aligned to the pricing doc** everywhere (12 / 28 / 55; 200 / 1,000 / 3,000); they are console-configurable, so the figures are launch defaults, not a commitment. Client: "align price for now as they will be customisable".
2. **POS: no separate plan** and no terminal charge; POS simplified invoices count against the plan allowance (defaults doc wins). The per-terminal POS plan from the pricing model is not drawn.
3. Auto-activate on Thawani payment: **off by default** (left to us).
4. The card-on-file panel in Settings › Bills **is removed** (left to us).

## 7.7 Built (15–16 Sep 2026)

Phases 1 and 2 are built on mock data, verified by screenshot at 1440 / 390 in EN and AR, with zero
overflow on the responsive sweep (132 routes) and `npm run build` green.

| Screen | Route | Data |
|---|---|---|
| Subscriptions queue | `/console/subscriptions` | `src/lib/consoleSubscriptions.ts` (31 listed rows; platform counts 268 / 9 / 4 / 7 / 3 / 12) |
| Subscription invoices | `/console/subscriptions/invoices` | same ledger |
| Tenant page + Subscription tab, Filing tab, ERP placeholder | `/console/tenants/:id` (`?action=recordPayment|sendLink|activate|changePlan|suspend|resume|cancel|grantQuota|waiveOverage`) | same ledger; `subscriptionsStore.*` mutates it and appends audit events |
| Record payment · Send link (WhatsApp / email / copy) · Activate · Change plan · Suspend / Resume / Cancel · Grant quota · Waive overage | modals in `src/pages/ConsolePage/subscriptions/` | |
| Console settings, 9 sections + Fixed by design | `/console/settings?section=` | `src/lib/platformSettings.ts` (`DEFAULT_SETTINGS`, `settingsStore`) |
| Plans and rates | `/console/plans` | already integrated with `GET/PUT /platform/plans` (feat/signup-integration); the doc's extra plan fields (annual, features, add-ons) are backend asks |
| Tenant: Settings › Bills ("How you pay", no card on file), sign-up Payment step (link / transfer / cash), Plans page (trial + pay note), status page note | `/settings/bills`, `/payment`, `/plans`, `/fawtara-status` | `src/lib/settingsBilling.ts` `HOW_YOU_PAY`, `src/lib/plans.ts` |

**Backend asks that fall out of it** (none of these endpoints exist yet — the discovery doc lists tenants, subscriptions and billing as BNA):
- `GET /platform/subscriptions?state&plan&method&term&q&page` and `GET /platform/subscriptions/{tenantId}` with invoices, payments, links, events, grants.
- `POST …/{tenantId}/payments` (method, amount, receivedOn, reference, note, proof, activate), `POST …/{tenantId}/payment-links` (invoiceId, channel) → Thawani checkout session URL + expiry; Thawani webhook marks the invoice paid and, when `autoActivateOnlinePayment` is on, activates.
- `POST …/{tenantId}/activate | plan-change | suspend | resume | cancel | quota-grants | overage-waivers`, each with a reason, each audited.
- `GET /platform/subscription-invoices`.
- `GET/PUT /platform/settings/{section}` for the nine sections of `PlatformSettings`.
- Tenant side: `GET /settings/billing` (next bill with extras, how-you-pay, past bills with method and confirmation), `POST /settings/billing/payment-link` ("Send the link now").

## 7.8 ERP mapping built (16 Sep 2026)

Phase 3 is built on a mock engine that mirrors the backend's contracts, verified by screenshot at
1440 / 390 in EN and AR, zero overflow on the responsive sweep (140 routes), `npm run build` green.

| Piece | Where |
|---|---|
| Field catalogue — 75 PINT-OM terms with section, requirement, condition, origin, canonical + UBL path, code list, rule id, helper copy | `src/lib/erpCatalogue.ts` (stands in for `GET /peppol/mapping-targets`) |
| The 16 code lists (excerpts of the long ones; the backend serves them whole) | `src/lib/erpCodeLists.ts` |
| Engine: validator (14 error codes), `flattenKeys`, dry-run over a sample → canonical invoice or refusals by canonical path, deterministic compile + content hash, certification with route rules, the tenant's story (Odoo, Invoice certified, Debit failed) and a store for save / import / restore / samples / hand-written / certify | `src/lib/erpMapping.ts` |
| Shared frame: Integration tab, status pill, 7-screen sub-nav, coverage banner | `src/pages/ErpPage/ErpShell.tsx` |
| Overview · Fields · Preview · Certify · Advanced · History · Samples · Connected systems | `src/pages/ErpPage/*` (+ `fields/`, `overview/`, `shared/`) |
| Settings hub: Integration group with ERP mapping and Connected systems cards | `src/pages/SettingsPage/SettingsPage.tsx` |

Answers to the backend's questions (spec §16.2) are in §2: F-1 long page, F-2 client-side path
picker, F-3 no value maps on free text, F-4 default BTOM-001 by route, F-5 samples not exported,
F-6 the Integration tab, F-7 Arabic names from the catalogue client-side (`nameAr`).

**When the endpoints arrive** the screens keep their shape: replace the store's functions with
the calls in Appendix A (validate → `POST …/guided/validate`, save → `PUT …/guided`, dry-run,
certification, samples, revisions, import/export, code lists) and the catalogue with
`GET /peppol/mapping-targets`. Two things the mock cannot do and the UI already says so: run a
non-preset JSONata transform (deferred to the server) and the 429 pause banner.

## 7.9 ERP connector built (16 Sep 2026)

Phase 5 is built on a mock store that mirrors the connector spec's states and refusals, verified by
screenshot at 1440 / 390 in EN and AR, zero overflow on the responsive sweep, `npm run build` green.

| Piece | Where |
|---|---|
| Model, story and store: products, auth kinds, scopes, schedules; connection / run / record / outbox / add-on states; templates; `connectorStore` (create, discover, pause, resume, remove, update, rotateCredentials, test, collectNow with the 409 / 422 refusals, retryRecord, requeueWriteBack, resetToTemplate, requestAddon); readers (usage, watermark age, mapping status derived from `erpMapping.ts` for the head office) | `src/lib/erpConnector.ts` |
| Shared frame: label + product + state and mapping pills, six tabs with a rejection mark on Records, not-found state | `src/pages/ErpPage/connections/ConnectionShell.tsx` |
| Connections list + add-on panel (active: usage bars, price, error banner, table with row actions; inactive: the add-on card with Ask to activate → pending) | `src/pages/ErpPage/ErpConnectionsPage.tsx` (`?addon=INACTIVE` for the harness) |
| Connect flow — System · Credentials · Test · Discover, hand-off to the connection's mapping | `src/pages/ErpPage/ErpConnectPage.tsx` |
| Detail tabs — Overview (Collect now, Pause / Resume, banners, figures, set-up, last runs, activity, delete) · Mapping (provenance, routes, Reset to template) · Runs (+ run detail) · Records (+ record detail with payload tree, Retry, Re-queue) · Write-back (switch, fields, outbox) · Settings (form, credentials rotation, danger zone) | `src/pages/ErpPage/connections/*.tsx` |
| Bell: credential error on a connection; a record superseded in the ERP | `src/lib/notifications.ts` |
| Settings hub: Connected systems card shows connected count / needs-attention and this month's collection | `src/pages/SettingsPage/SettingsPage.tsx` |

Story: add-on ACTIVE (purchased 1 Aug, 3 of 5 systems, 412 of 1,000 documents); head office Odoo 17
CONNECTED with write-back, Salalah ERPNext in ERROR after three UNAUTHORIZED runs, Sohar Odoo 16
PAUSED with a twelve-day-old watermark. Records include two REJECTED (BR-OM-06, BR-OM-10), one
WRITEBACK_FAILED (409 record locked) and one SUPERSEDED.

**When the endpoints arrive** (Appendix B): the store's functions become the calls one for one —
`POST /connections` + `/test` + `/discover`, `GET/PATCH/DELETE …/{id}`, pause / resume,
`PUT …/credentials`, `POST …/collect`, runs, records, retry, writeback, `GET/PUT /settings/erp/addon`.
Two things the mock cannot do: a RUNNING run (collect-now completes at once) and the OAuth redirect
(the wizard fakes the sign-in). Per-connection mapping edits open the tenant wizard with
`?connection=<id>`; the backend scopes the mapping by connection, the front end already passes the id.

## 7.10 Upload from your ERP built (3 Oct 2026)

The Extraction Bridge on the tenant side: `/settings/erp/bridge`, a third card in the Integration
group. A signed-in user sends one document their ERP produced, in its own JSON or XML, through
`POST /v1/invoices/bridge` (`invoice.submit`; the body is the submission body with `source`
required; one document per request, standard invoices only). No connection is involved: Managed
pull, this upload and API push are three ways into the same mapping and pipeline, and the page says
so. Handoff: `docs/frontend/ERP_BRIDGE_UPLOAD_HANDOFF.md`.

Decisions taken without a Figma frame (none exists for any ERP screen):

- Built from the Integration templates only (`SettingsShell`, `SectionCard`, `FileDropzone`,
  `Select`, `Input`, `Checkbox`, the hub `Card`). No new colour, token or component.
- The transaction type (BTOM-001) and issue time are the certification run's own controls and
  words: no mapping produces them, so the uploader supplies them, as the run does. The bit helpers
  moved from the Certification screen into `lib/erp/mappingState.ts` and both screens use them.
- Readiness is the server's certification status for the invoice route, read once per format and
  transaction type, and only for a holder of `admin.settings.manage` (the mapping endpoints'
  permission). Its prose `reason` is not shown; the reader gets our sentence and a link.
- A validation refusal shows layer, rule and business term only. The validator's message and
  location can quote the document, so neither is shown (the backend keeps the same three for the
  same reason).
- API push has no screen: it is explained in one sentence, not drawn as a connection.

## 7.11 ERP activity reports built (4 Oct 2026)

The read side of the backend's Phase 3B reporting, under Settings › Integration: source documents
(`/settings/erp/documents`, with the server summary), one document's detail and timeline, needs
attention (`/settings/erp/attention`, query-time reconciliation labels) and extraction runs
(`/settings/erp/runs`). All read-only and gated by `invoice.read`; the backend has no replay or
recovery action, so none is offered. The old per-connection runs and records addresses redirect to
these reports narrowed to the connection. Built from the Integration templates without a Figma
frame. Handoff: `docs/frontend/ERP_REPORTING_HANDOFF.md`.

## 8. Build order (supersedes §6)

| Phase | Screens |
|---|---|
| **1 — Subscriptions, console** | Subscriptions queue · tenant detail with Subscription tab · Record payment / Send link / Activate / Change plan / Suspend modals · Subscription invoices · Plans and rates · Console settings (Billing, Counting rules, Overage, Trial and lifecycle, Notices, Add-ons, Promotional, **Payments**, Fixed by design) |
| **2 — Subscriptions, tenant side** | sign-up Plans and Payment steps · Awaiting activation · Settings › Plan · Settings › Bills · notifications |
| 3 — ERP mapping | §2 — **built, §7.8** |
| 4 — Console, rest | **§9** — ERP group (connections, templates, add-on requests), tenant ERP tab, submission queue, incidents, audit log, onboard a business |
| 5 — ERP connector | §3 — **built, §7.9** |

Each phase: mock data in `src/lib` (one modelled population, figures derived), EN + AR, responsive with `max-md:` only, `npm run build`, sweep + desktop gate, screenshots.

---

## 9. Console completion (added 16 Sep 2026)

The client's ruling: the super admin console must be complete as UI, on mock data where the backend
has nothing yet; ERP gets its **own sidebar group** so connectors, templates and add-on requests are
handled in one place; anything that is a platform-wide rule stays in Console settings.

### 9.1 What the console has (16 Sep 2026)

| Area | Route | State |
|---|---|---|
| Operations home | `/console` | mock (Figma) |
| Tenants directory | `/console/tenants` | mock (Figma); "Onboard a business" button does nothing yet |
| Tenant page: Subscription · Filing · ERP | `/console/tenants/:id` | Subscription built (§7.7), Filing partial, ERP placeholder |
| Verification queue + company page | `/console/onboarding`, `/:companyId` | **integrated** (backend) — keep |
| Subscriptions queue · invoices · 8 action modals | `/console/subscriptions`, `/invoices` | mock (§7.7) |
| Plans and rates | `/console/plans` | **integrated** — keep |
| Operators | `/console/operators` | **integrated** — keep |
| Console settings, 9 sections + Fixed by design | `/console/settings` | mock (§7.7) |
| Submission queue · Incidents · Audit log | `/console/queue`, `/incidents`, `/audit` | "not built yet" stubs |

A customer who picks **cash** (or transfer, or a link) at sign-up lands in the Subscriptions queue as
*Awaiting payment*; the operator records the payment and activates — that path is already built.
What is missing is the operator-led start: a business that never signs up online.

### 9.2 Sidebar after completion

| Group | Items |
|---|---|
| Running | Operations · Submission queue · Incidents |
| Customers | Tenants · Verification · Subscriptions · Plans and rates |
| **ERP** (new) | Connections · Mapping templates · Add-on requests |
| The platform | Operators · Audit log · Console settings |

The tenant page keeps its ERP tab as the per-tenant view; the ERP group is the cross-tenant view.

### 9.3 Screens to build (phase 4, the last)

| Screen | Route | What it does | Data |
|---|---|---|---|
| **ERP · Connections** | `/console/erp` | KPIs (tenants on the add-on, connections, in error, stale, documents collected this month, add-on revenue); table of every connection across tenants — tenant, label, product, state, mapping, last run, rejections; filters by state / product / tenant; rows open the connection | `src/lib/consoleErp.ts` |
| **ERP · Connection** (read-only) | `/console/erp/connections/:id` | what support sees: figures, set-up, recent runs, rejections, template version in use, the tenant's add-on usage; actions limited to what an operator may do — grant extraction quota, message the tenant; never credentials | same |
| **ERP · Mapping templates** | `/console/erp/templates`, `/:id` | list per product and ERP version with published version, fields, tenants on it; editor with the mapping entries (target · source path · transform · value map), validation via `erpMapping.validate`, dry-run via `dryRun` on a bundled sample, **Save draft** and **Publish** (new version; tenants keep theirs until they reset) | same |
| **ERP · Add-on requests** | `/console/erp/add-on-requests` | queue of "Ask to activate" requests: tenant, plan, source, requested when; **Approve** (activates, adds the add-on line to the next invoice), **Approve on trial**, **Decline** with reason; history tab | same |
| **Tenant page · ERP tab** | `/console/tenants/:id?tab=erp` | the tenant's add-on state and usage, connections with state and last run, links into `/console/erp/connections/:id`; grant quota | same |
| **Submission queue** | `/console/queue` | cross-tenant OTA / Peppol submissions: waiting by stage, refused today, stuck; row actions Redrive (stuck) and Notify tenant (refused); the Operations home's "Open the queue" lands here | `src/lib/consoleOps.ts` |
| **Incidents** | `/console/incidents`, `/:id` | platform incidents (OTA slow, access point, signing, platform): state investigating → identified → monitoring → resolved, severity, component, affected tenants, timeline of updates, **Post a notice** to tenants (EN + AR), **Open an incident** | same |
| **Audit log** | `/console/audit` | every operator action in one list — subscriptions, verification, operators, settings, plans, ERP, incidents, queue — filter by area, operator, tenant, date; export | `src/lib/consoleAudit.ts` (seeded + live events from the other stores) |
| **Onboard a business** | `/console/tenants/new` | operator-led onboarding for a walk-in customer: Company (name, CR, VATIN, town) · Owner (name, phone, email → invitation) · Plan, term, payment method, optional payment recorded now · Review → creates the tenant in the ledger as *Awaiting payment* or *Active*, lands on its page | `consoleSubscriptions.onboard()` |
| **Operations home** | `/console` | one more card: "Integrations needing attention" (connections in error or stale) → `/console/erp` | `consoleErp.ts` |

Not built on purpose: any console-side entry of a tenant's ERP credentials, and impersonation.

### 9.4 Beyond this phase — the console backlog, in priority order

What a complete platform console still lacks after §9.3, each with why and where it would sit.
None is started; each is a decision for the client when the backend can carry it.

| # | Screen | Why | Where | Backend |
|---|---|---|---|---|
| 1 | **Tenant page · Support tab** | one place per tenant for the things support keeps looking up: people and roles, branches, certificate state, Peppol id and access point, last sign-ins, open notices; with "Send a reset link", "Resend invitation" | Tenants › tenant | tenant read APIs behind `platform.support` |
| 2 | **Announcements** | platform-wide notices that are not incidents (new feature, OTA deadline, planned maintenance), scheduled, EN + AR, targeted by plan or town; today only incidents post a notice | The platform › Announcements | notices API |
| 3 | **Revenue and usage reports** | MRR by plan, churn, overage billed, add-on take-up, documents per tenant per month, exportable; the Tenants KPIs hint at it | Insights › Reports (new group) | reporting API |
| 4 | **Peppol operations** | SMP problem summary, access point health, test tenants and certification fixtures (discovery doc §3a lists the endpoints that exist) | Running › Peppol | partly exists |
| 5 | **Operator roles and permissions matrix** | Operators shows roles; a matrix of what each platform role may do (support · billing · platform admin) with the audit of changes | The platform › Operators › Roles | permission model (discovery §2) |
| 6 | **Tenant closure and data export** | close a tenant properly: final invoice, read-only period, 10-year record retention, export on request | Tenants › tenant › Danger zone | closure API |
| 7 | **Feature flags per tenant** | switch a beta on for one tenant (approvals workflow, webhooks) before the plan carries it | Tenants › tenant › Subscription › Features | flags API |
| 8 | **API keys and webhooks monitor** | tenants' API keys (count, last used, revoke on request) and webhook delivery failures across tenants | ERP › API and webhooks | API |
| 9 | **Refunds and credit notes on subscriptions** | a refund is "not mid-period" by default (Fixed by design), but Enterprise contracts and mistakes need a credit note on a subscription invoice | Subscriptions › invoice | billing API |
| 10 | **Console search** | one box: tenant, VATIN, invoice number, operator, incident | topbar | search API |

Not planned on purpose: impersonation ("log in as tenant") and any console entry of tenant secrets.
Support sees the tenant's state read-only and sends the tenant to the right screen.

### 9.5 Plan model (settled 20 Sep 2026)

*Added later on 20 Sep:* the compare table also lists the platform features every plan carries —
compliance and delivery (Peppol, PINT-OM validation, OTA reporting and TDD, signing and QR,
bilingual invoices, ten-year archive, compliance log), one reports row naming the report kinds,
and the notices, so a buyer sees the whole product, not only what differs. Rows any accounting
tool has (customer and supplier records, activity log, exports, period closing, two-step sign-in)
were tried and cut the same day as too general to sell a plan. The add-on is
offered on the sign-up Payment step (a tick on Business Plus that adds the line to the first
invoice and rides the same activation) and managed from an Add-ons section on Settings › Plan; the
plans page gets no fifth card, because the add-on is not a plan. Bill tracking was split from bill reminders. Overage is quoted as
"extra per invoice" at 0.150 · 0.060 · 0.040. Support is email and chat on every plan. An extra
branch is 8.000 on every plan, Starter included.

The client's ruling, final: plans differ by **features** and by **limits**, both set from the
console. `src/lib/plans.ts` is the one file that holds it (`FEATURES`, `FEATURE_GROUPS`,
`hasFeature`, `lowestPlanWith`, `EXTRACTION_AVAILABILITY_DEFAULT`, `TRIAL`); every screen that
prints a plan reads it from there.

**Who each plan is for.** Starter — a shop or service with no system of its own. Business —
every Fawtir feature, for a business run in Fawtir. Business Plus — everything, plus the ways in
for a system of your own. Enterprise — Business Plus with limits agreed on a call; nothing else
differs.

| Feature (`Feature` id) | Starter | Business | Business Plus | Enterprise |
|---|---|---|---|---|
| *Income* | | | | |
| Tax invoices (`invoices`) † | ✓ | ✓ | ✓ | ✓ |
| Credit notes (`creditNotes`) † | ✓ | ✓ | ✓ | ✓ |
| Debit notes (`debitNotes`) † | ✓ | ✓ | ✓ | ✓ |
| Bulk upload (`bulkUpload`) | ✓ | ✓ | ✓ | ✓ |
| Payment reminders (`incomeReminders`) | ✓ | ✓ | ✓ | ✓ |
| Recurring invoices (`recurringInvoices`) | — | ✓ | ✓ | ✓ |
| Self-billing (`selfBilling`) | — | ✓ | ✓ | ✓ |
| Trade documents (`tradeDocuments`) | — | ✓ | ✓ | ✓ |
| *Expenditure* | | | | |
| Bill tracking and uploading — received over Peppol, scanned or uploaded (`billTracking`) | ✓ | ✓ | ✓ | ✓ |
| Bill reminders (`billReminders`) | ✓ | ✓ | ✓ | ✓ |
| Supplier credit and debit notes (`supplierNotes`) | — | ✓ | ✓ | ✓ |
| Recurring bills (`recurringBills`) | — | ✓ | ✓ | ✓ |
| Approval workflow (`approvals`) | — | ✓ | ✓ | ✓ |
| *Operations* | | | | |
| Point of sale (`pos`) | ✓ | ✓ | ✓ | ✓ |
| Catalogue (`catalogue`) | ✓ | ✓ | ✓ | ✓ |
| Stock (`stock`) | ✓ | ✓ | ✓ | ✓ |
| Reports (`reports`) | ✓ | ✓ | ✓ | ✓ |
| *People* | | | | |
| Roles and permissions (`rolesAndPermissions`) | ✓ | ✓ | ✓ | ✓ |
| Branches (`multiBranch`) — limits differ | ✓ | ✓ | ✓ | ✓ |
| *Integration* | | | | |
| API (`api`) | — | — | ✓ | ✓ |
| Webhooks (`webhooks`) | — | — | ✓ | ✓ |
| ERP field mapping (`erpMapping`) | — | — | ✓ | ✓ |
| **Automatic ERP extraction** (add-on, availability per plan) | not supported | not supported | add-on, priced | included |
| **Monthly price** (placeholder; the console changes it) | 35.000 | 80.000 | 150.000 | negotiated |

† Compliance, never gated: every plan issues tax invoices, credit notes and debit notes, and
sends and receives over Peppol. The console lists these as **Fixed by design** and cannot switch
them off; the compare table shows them so a buyer sees they are there.

Rules that follow from the table:

- **Prices** are 35 / 80 / 150 rial a month, annual = ten months (29.167 / 66.667 / 125.000
  a month equivalent). Placeholders until the console's Plans and rates sets the live ones; shown
  everywhere, hidden nowhere.
- **Extraction add-on availability** is a console setting per plan (`notOffered` · `priced` ·
  `included`), Console settings › Add-ons. Defaults: Starter and Business not supported, Business
  Plus priced (20.000 a month, 1,000 documents, 0.020 overage), Enterprise included. *Not
  offered* hides the add-on from that plan's Connected systems screen and blocks Approve on the
  console's Add-on requests queue; *included* switches it on without the add-on price the moment
  the tenant asks. ERP field mapping is not the add-on: it follows the plan's feature switch.
- **Trial**: 14 days of the plan the tenant chose (`lifecycle.trialPlan = 'chosen'`; the console
  may pin one plan instead), offered on Starter, Business and Business Plus and never on
  Enterprise, which starts from a contract (`lifecycle.trialOfferedOn`). 25 documents, no card,
  never converts by itself.
- **Compliance is never gated** — see †. No plan, trial or suspension state removes invoices,
  credit notes, debit notes or Peppol.
- **Tenant-side gating**: a module the plan lacks is shown **greyed with an upgrade nudge** — **built but switched off for now** (client, 20 Sep 2026: "not needed yet, later"; `PLAN_GATING_ENABLED = false` in `src/lib/planAccess.ts` turns it on)
  ("Available on Business — see plans", from `lowestPlanWith`), never hidden. The nudge links to
  Settings › Plan.

What changed in the UI (20 Sep 2026):

- Sign-up plans page and the compare table: the four plans with the feature matrix above, the
  new prices, extraction as its own row, the trial line per plan.
- Settings › Plan: the current plan's features, the same matrix, the upgrade path.
- Console settings › Trial and lifecycle: *Trial mirrors* became **Trial plan** ("the plan the
  tenant picks" or a fixed plan) plus **Trial offered on** (Starter · Business · Business Plus;
  Enterprise shown locked off). Trial length defaults to 14 days.
- Console settings › Add-ons: *Included at* became an **Availability per plan** table (not
  offered · add-on · included, one row per plan); the ERP mapping line is read-only "Follows the
  plan's feature switch — Business Plus and Enterprise at launch".
- Console › Add-on requests: a request from a plan that does not offer the add-on carries a
  "Not supported on {plan} — upgrade first" chip and Approve is disabled; an included plan's
  Approve summary says "Included in the plan — no charge".
- Tenant gating: greyed modules with the nudge, per the rule above.
- Settings › Integration › Connected systems, add-on not active: the card follows the tenant's
  plan — not supported (which plan carries it, link to plans, no button), included ("Switch on —
  included in your plan", active at once), priced (unchanged). The mapping strip now reads "ERP
  field mapping is part of the Business Plus and Enterprise plans — the connector only automates
  the collecting."

---

## Appendix A — ERP mapping: element inventory (spec 1, `ERP_MAPPING_SPEC-2026-09-11.md`)

Every row is something to draw. Reads/writes are the backend contract; states are what the element must be able to show.

### A.1 Overview `/settings/erp-mapping` — reads `GET /settings/erp-mapping`

| Element | Content | States |
|---|---|---|
| Status chip | `status` | NOT_SET_UP · DRAFT · READY_UNCERTIFIED · PARTIALLY_CERTIFIED · CERTIFIED · STALE |
| Route line | `route` + `sourceSystem` + `activeProfile.erpKey` | GUIDED · HAND_WRITTEN · NONE; source system ORACLE, SAP, MICROSOFT_DYNAMICS, ODOO, ERPNEXT, CUSTOM |
| KPI Required fields | `readiness.mappedRequiredCount / requiredCount` | complete · missing (names listed) |
| KPI Invalid entries | `readiness.invalidCount` | 0 · n (links into the wizard) |
| KPI Certified routes | count of `certification[].state = CERTIFIED` of 4 | |
| KPI Samples | `samples.count / limit` (10) | at limit |
| Coverage-limit banner | `readiness.coverageLimits[]`: GOODS_CLASSIFICATION, FOREIGN_CURRENCY, INVOICING_PERIOD | always visible once a guided mapping exists |
| Certification table | per route INVOICE, CREDIT_NOTE, DEBIT_NOTE, SELF_BILLING → documentKind, state, certifiedAt or lastAttempt.findings, transactionScopes | CERTIFIED · FAILED · NOT_CERTIFIED · STALE |
| Recent activity | `recentActivity[]` last 5 | GuidedMappingSaved/Archived/Restored/Imported, MappingProfileActivated/Deactivated, MappingSampleUploaded/Deleted |
| Hand-written banner | route = HAND_WRITTEN while a guided mapping exists | "Your guided mapping is not what runs" |
| Primary CTA | by status | Start guided mapping · Upload hand-written · Finish n fields · Certify · Re-certify |
| Empty state | the OTA required-fields list: seller phone, address lines 1–3 + city + postcode, issue time, seller VATIN, per-line goods/services flag, ISIC, line VAT amount, line total incl. VAT | NOT_SET_UP only |

### A.2 Fields `/settings/erp-mapping/fields`

Reads `GET /peppol/mapping-targets` (76 rows, 74 terms), `GET /peppol/mapping-profiles/JSON/guided` (404 = none), `GET /settings/erp-mapping/code-lists`, `GET …/JSON/samples`. Writes `POST …/guided/validate` (debounced ≥ 2 s), `PUT …/guided` with `expectedVersion` (400 structural, 409 stale).

| Element | Detail |
|---|---|
| Source system picker | app Select, 6 values, metadata only |
| Sample selector | which sample feeds the path picker; link to Samples when none |
| Section cards ×7 | 15.1 Document · 15.2 Seller · 15.3 Buyer · 15.4 Tax · 15.5 Lines · 15.6 Payment · 15.7 Totals; anchor strip on top |
| Row: id + name | `IBT-042 Seller contact telephone`; helper copy paraphrases the rule, never quotes it |
| Row: requirement pill | Required (MANDATORY + TENANT_MAPPED) · Conditional with its condition ("when credit or debit note", "either of", "unless simplified") · Optional |
| Row: read-only variant | PLATFORM_SUPPLIED / DERIVED → greyed "Fawtir supplies this" (IBT-024, IBT-023, BTOM-002, BTOM-004, IBT-034, IBT-168, IBT-116/117 if derived) |
| Row: source path | SourcePathPicker: Popover, search, keys from the sample with example values, `[]` for arrays; free text allowed; grammar `[A-Za-z_][A-Za-z0-9_]*(\[\])?(\.…)*`, ≤ 512 chars |
| Row: default | Input; default without a path = constant |
| Row: value map | only where `codeList` is set: IBT-003, 118, 151, 121, 130, 081, 005, 040, 055, 034-1, 049-1, BTOM-015, 018, 032, 019, 024, 026, 022, 034, 025 |
| ValueMapModal | left: source codes collected from samples + free add; right: Select from `…/code-lists/{id}`; on-unmapped FAIL (default) · USE_DEFAULT (needs default) · PASS_THROUGH; ≤ 200 pairs, ≤ 128 chars; IBT-121 list follows category (E → VATEX-OM-01…12, Z → VATZR-OM-01…16); rate rule beside S (5 %), E (no rate), O (no rate), Z (0) |
| Row: advanced | disclosure with transform textarea (`$src`) and preset menu: date from DD/MM/YYYY, epoch millis, trim + uppercase, strip non-digits, round 3 dp, round 2 dp, absolute, percent from fraction |
| Row: inline error | from `invalidMappings[]`: UNKNOWN_BUSINESS_TERM, TARGET_NOT_MAPPABLE, UNSUPPORTED_TARGET, MISSING_SOURCE, MALFORMED_SOURCE_PATH, MALFORMED_TRANSFORM, DUPLICATE_SINGLETON_TARGET, REPEATED_TARGET_NOT_SUPPORTED, CONFLICTING_TARGET_PATH, INVALID_CODE_VALUE, VALUE_MAP_TOO_LARGE, MALFORMED_VALUE_MAP, VALUE_MAP_NOT_ALLOWED, VALUE_MAP_DEFAULT_REQUIRED |
| Paired rows | Buyer identifier IBT-046 *or* Buyer VATIN IBT-048 as one requirement; allowance vs charge one of the two |
| Not supported | IBT-111, IBT-158, BTOM-003/028/029, IBT-006, IBT-073/074/134/135 — the coverage limits |
| Sticky checklist | required n/m with missing names linked; invalid count; `warnings[]`; the 3 coverage limits; Save; after a complete save "Compiled and activated — certify next" |
| Rate-limit state | 429 → banner with countdown, validation paused, edits kept |
| Conflict | 409 → modal "Someone else saved this mapping", reload with client-side diff |
| Decimal helper copy | totals ≤ 2 dp; other amounts ≤ 3 dp; rates 0.00–100.00 ≤ 2 dp |

### A.3 Preview `/settings/erp-mapping/preview`

Sample picker → `POST …/guided/dry-run` (guided) or `POST …/JSON/dry-run` (hand-written, may pass unsaved `content`). Left: sample JSON tree. Right: canonical invoice tree, or the failure list (`errors[].field` canonical path → business term through `canonicalPath` → "Go to field"). Labels the level: L3 dry-run.

### A.4 Certification `/settings/erp-mapping/certification`

Reads `GET …/JSON/certification?document_kind=&route=`, `GET …/certification/history?limit=` (≤ 100). Writes `POST …/JSON/certification?route=` with `{document, supplement.transaction_type}`.

| Element | Detail |
|---|---|
| Route cards ×4 | state pill, short hash, certified when, scopes, "Run test invoice" |
| Run modal | sample picker; transaction type (20-bit BTOM-001) defaulted by route: INVOICE `10000000000000000000`, CREDIT/DEBIT = referenced invoice type, SELF_BILLING `00100000000000000000`; advanced: choose bits by name (15 positions) |
| Result panel | `passed=true` green; `passed=false` → RuleFindingsTable (rule id, message, field); 404 = no active profile |
| Running state | takes seconds; no timeout under 60 s |
| Stale banner | after any edit that changed the hash |
| History table | attempts newest first; RowsView on phones |

### A.5 Advanced `/settings/erp-mapping/advanced`

`GET /peppol/mapping-profiles/JSON` (400 = none, treat as none), `PUT` `{content, erpKey?}` ≤ 256 KiB, `POST …/dry-run` with `content`, `DELETE` 204 (confirm: submissions fail closed). CodeEditor (mono, line numbers), erpKey input, Download, banner when a guided mapping also exists.

### A.6 History `/settings/erp-mapping/history`

Tabs: Revisions (`GET …/revisions` paged: revisionNo, origin EDIT/IMPORT/RESTORE, entryCount, compiledContentHash, readyForActivation, savedBy, savedAt; `GET …/revisions/{id}`; `POST …/revisions/{id}/restore` with `expectedVersion`, 400 on catalogue drift lists the entries) · Profiles (`GET /peppol/mapping-profiles`, all rows incl. inactive) · Certifications.

### A.7 Samples `/settings/erp-mapping/samples`

`GET/POST/DELETE …/JSON/samples` (label ≤ 80 unique, payload ≤ 256 KiB, 10 live; 409 sample-label-exists / sample-limit-reached). Upload modal with the personal-data warning. Export `GET …/guided/export` (`fawtir-guided-mapping-JSON-<date>.json`, schema `fawtir.guided-mapping/1`) · Import `POST …/guided/import` (400 malformed, 409 stale, 422 import-catalogue-mismatch lists unknown terms; ≤ 500 entries).

### A.8 Problem types the screens must render

validation · mapping-profile-not-found (400, treat as none) · mapping-profile-invalid · not-found · stale-version (+ currentVersion) · sample-label-exists · sample-limit-reached · payload-too-large (413) · import-catalogue-mismatch · mapping-value-unmapped · mapping-not-certified · rate-limited (429, Retry-After).

---

## Appendix B — ERP connector: element inventory (spec 2, `ERP_CONNECTOR_SPEC-2026-09-11.md`)

| Screen | Elements | Endpoints |
|---|---|---|
| Add-on panel | state ACTIVE / SUSPENDED / CANCELLED / PENDING_PAYMENT; source PLAN_INCLUDED / PURCHASED / TRIAL; limit + usage bars (connected systems, collected this month); resets at; Activate | `GET/PUT /settings/erp/addon` |
| Connections list | label, product, state DRAFT / CONNECTED / PAUSED / ERROR / DISCONNECTED, mapping status UNMAPPED / DRAFT / READY / CERTIFIED / STALE, last run, next run, pending rejections | `GET /settings/erp`, `GET /settings/erp/connections` |
| Connect flow | product tiles ODOO, ERPNEXT, DYNAMICS_365, SAP_S4, ORACLE_FUSION, ZOHO_BOOKS; label, base URL; auth API_KEY / BASIC / OAUTH2_CLIENT / OAUTH2_AUTHCODE with per-kind fields (secrets never echoed); scopes READ / WRITE; schedule 15 / 30 / 60 / 240 / 1440 min; write-back toggle → Test (erpVersion, company, grantedScopes, latency) → Discover (fields, samples, templateApplied) | `POST /connections`, `POST …/test`, `POST …/discover`, OAuth callback |
| Detail · Overview | state, watermark (newest ERP invoice collected), next run, last run, quota, age warning ≥ 10 days, pause / resume, delete (secret destroyed, records kept) | `GET/PATCH/DELETE …/{id}`, pause, resume |
| Detail · Mapping | the §2.2 wizard scoped by connection; template provenance; Reset to template (revision origin TEMPLATE); certification per route | `GET/PUT …/{id}/mapping`, validate, dry-run `{sampleId}`, apply-template, revisions, certification |
| Detail · Runs | trigger SCHEDULE / MANUAL / RETRY; state RUNNING / SUCCEEDED / PARTIAL / FAILED / SKIPPED_QUOTA / SKIPPED_LEASE; fetched, new, duplicates, errors; watermark before/after; Collect now (409 in progress or quota, 422 not certified) | `POST …/collect`, `GET …/runs`, `GET …/runs/{id}` |
| Detail · Records | ERP number, state COLLECTED / MAPPED / SUBMITTED / ACCEPTED / REJECTED / WRITTEN_BACK / WRITEBACK_FAILED / SUPERSEDED, Fawtir invoice link, rejection; filters by state and date; detail with payload tree, rejection findings, Retry, Re-queue write-back | `GET …/records`, `GET …/records/{id}`, retry, writeback |
| Detail · Write-back | enabled toggle (needs WRITE scope); outbox state PENDING / SENT / FAILED / ABANDONED; fields written: fawtir_status, invoice number, uuid, submitted_at, rejection reason, QR | PATCH |
| Detail · Settings | label, schedule, scopes, base URL, rotate credentials (re-tests) | PATCH, `PUT …/credentials` |
| Notifications | credential error; three failed runs → ERROR; write-back abandoned; superseded source ("issue a credit note in the ERP"); extraction quota 50 / 80 / 100 % | bell |

Permissions: `erp.connections.manage` (ADMIN) for writes; `erp.connections.read` (ADMIN, FINANCE_MANAGER) for reads.

---

## Appendix C — Console: every configurable setting (`Fawtir_Subscription_Defaults-1.pdf`, `Fawtir_Pricing_Model.pdf`)

Every row is a control on `/console/plans` or `/console/settings`. Default = launch value. The UI hard-codes none of these; it reads the config and shows these as its initial values.

### C.1 Plans and rates `/console/plans`

| Setting | Default (Starter · Business · Business Plus · Enterprise) | Control |
|---|---|---|
| Band, documents/month | 200 · 1,000 · 3,000 · on request | number |
| Monthly price | 35.000 · 80.000 · 150.000 · negotiated (placeholders, 20 Sep 2026) | money, rial sign |
| Annual | two months free → 29.167 · 66.667 · 125.000 shown derived | rule |
| Quarterly | monthly rate, no discount | rule |
| Users included | 2 · 5 · 10 · unlimited | number / unlimited |
| Extra user per month | 3.000 · 2.500 · 2.500 · negotiated | money |
| Branches included | 1 · 2 · 5 · unlimited | number / unlimited |
| Extra branch per month | 8.000 · 8.000 · 8.000 · negotiated (on every plan since 20 Sep 2026) | money |
| Extra per invoice (overage) | 0.150 · 0.060 · 0.040 · n/a — quoted per invoice the way Omani ASPs do, a little above the market because Fawtir is the whole platform, always below the plan's own price per document (20 Sep 2026) | money |
| Features | the §9.5 matrix: compliance documents on every plan (locked); Starter also bulk upload, payment reminders, bill tracking, POS, catalogue, stock, reports, roles, branches; Business adds recurring invoices and bills, self-billing, trade documents, supplier notes, approvals; Business Plus and Enterprise add API, webhooks, ERP mapping; support Email · Email · Email and chat · Account manager | switches, per feature per plan |
| ERP field mapping | per plan: Business Plus and Enterprise (a feature switch, not an add-on) | switch |
| Automatic ERP extraction | availability per plan: not supported · not supported · add-on · included | not supported / add-on / included |
| Maximum API keys | set per plan | number |
| Accountant and auditor seats | free on every plan, read and export | locked rule |
| Trial | 14 days of the chosen plan, not on Enterprise | plan picker ("the plan the tenant picks" or a fixed plan) + offered-on checkboxes |
| Point of sale | no separate plan, no terminal charge; POS simplified invoices count against the plan allowance (settled 15 Sep) | locked rule |
| Publish model | live vs draft; a change applies to new subscriptions only; grandfathered count shown | publish + date |
| Enterprise | configured per tenant, never public — on tenant detail | — |

### C.2 Console settings `/console/settings`

**Billing**

| Setting | Default |
|---|---|
| Currency | Omani rial (locked) |
| VAT on subscription invoices | 5 %, prices shown exclusive |
| Minimum contract term | none on monthly |
| Billing anchor | signup date |
| Subscription invoice numbering | its own series, separate from tenant documents |

**Counting rules** (document kind → Counts / Does not count)

| Kind | Default |
|---|---|
| Invoice, credit note, debit note issued | Counts |
| Self-billing invoice or credit note | Counts |
| Invoice or credit note received | Counts |
| Trade document sent over Peppol | Counts |
| Trade document held in the platform | Does not count |
| Point of sale simplified invoice | Counts |
| Receipt carrying no tax | Does not count |
| Draft | Does not count |
| Voided before transmission | Does not count |
| Failed our own validation | Does not count |
| Rejected by the Tax Authority | Counts |
| Resubmission | Counts again |
| Quota consumed at | successful transmission, not creation |
| Allowance pools across the period | Yes |

**Overage**

| Setting | Default |
|---|---|
| Overage permitted | Yes |
| Enabled by default for new tenants | Yes |
| Hard ceiling | None |
| Rates | see C.1 |

**Trial and lifecycle**

| Setting | Default |
|---|---|
| Default plan for a new tenant | the trial |
| Trial length | 14 days (20 Sep 2026; was 15) |
| Trial allowance | 25 documents |
| Trial plan | the plan the tenant picked; offered on Starter, Business, Business Plus — never Enterprise |
| Trial auto-converts | No |
| Payment details required for trial | No |
| Auto-renewal | On |
| Grace after failed payment | 14 days |
| Notices within grace | day 1, day 7, day 13 |
| Cancellation notice period | None |
| Refund on mid-period cancellation | None; the period runs to its end |
| Upgrade | immediate, pro rata |
| Downgrade | at the end of the period |
| While suspended | read-only; documents viewable and downloadable |

**Notices**

| Setting | Default |
|---|---|
| Thresholds | 50, 80 and 100 % |
| Recipients | account owner and administrators |
| Language | the customer's chosen language |
| Channels | email and in-app |

**Add-ons**

| Setting | Default |
|---|---|
| Automatic ERP extraction price | 20.000 / month |
| Extraction allowance | 1,000 documents / month |
| Extraction overage | 0.020 / document |
| Supported systems | connector list (Odoo, ERPNext first) |
| Enterprise | included |

**Promotional** (controls present, all off at launch)

| Setting | Default |
|---|---|
| Discount codes | None |
| Referral or partner commission | None |
| Introductory pricing | None |

**Operations** (on tenant detail, every action recorded with a reason)

| Action | Default |
|---|---|
| Temporary quota grant by an operator | permitted, recorded |
| Overage waiver on a single bill | permitted, recorded |
| Grandfathering | existing customers keep their price until they change plan |
| Live plan change | new subscriptions only |

**Fixed by design** (read-only panel, never a switch)

| Item | Position |
|---|---|
| Document retention | 10 years; 15 where records relate to real estate |
| Access to the compliance record | always, including while suspended |
| Compliance features | never gated; on every plan |
| Change to a live plan | new subscriptions only |

**Payment provider** (pricing doc §11; becomes an operations setting once chosen)

| Setting | Default |
|---|---|
| Provider | undecided: Thawani / Amwal / PayTabs / Checkout.com — Stripe excluded (client decision) |
| Methods | bank transfer first, card once the provider is engaged |

### C.3 Tenant detail `/console/tenants/:id`

Plan and terms in force (grandfathered since), usage this period, temporary quota grant (reason, expiry), overage waiver on a bill, Enterprise configuration (price, billing frequency, allowance, counting rules, overage, users, branches, features, add-ons, pilot terms, grace period, contract dates, SLA), ERP state read-only, audit of every operator action.

### C.4 Conflicts between the two pricing documents

- Defaults doc: "Point of sale — no separate plan and no terminal charge; POS simplified invoices count against the plan allowance". Pricing model §7: a **per-terminal POS plan** (15.000, 5,000 receipts, 0.010 overage). The console needs both switches; which is live is a product decision — ask before drawing the POS plan card.
- Notice thresholds: defaults doc 50/80/100 %, pricing §4 says 80 and 100. Use the configurable thresholds.
