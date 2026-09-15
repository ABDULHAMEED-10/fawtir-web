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

## 8. Build order (supersedes §6)

| Phase | Screens |
|---|---|
| **1 — Subscriptions, console** | Subscriptions queue · tenant detail with Subscription tab · Record payment / Send link / Activate / Change plan / Suspend modals · Subscription invoices · Plans and rates · Console settings (Billing, Counting rules, Overage, Trial and lifecycle, Notices, Add-ons, Promotional, **Payments**, Fixed by design) |
| **2 — Subscriptions, tenant side** | sign-up Plans and Payment steps · Awaiting activation · Settings › Plan · Settings › Bills · notifications |
| 3 — ERP mapping | §2 (Overview, Fields, Preview, Certification, then Advanced, History, Samples) |
| 4 — Console, rest | ERP templates, audit log, onboarding queue |
| 5 — ERP connector | §3 |

Each phase: mock data in `src/lib` (one modelled population, figures derived), EN + AR, responsive with `max-md:` only, `npm run build`, sweep + desktop gate, screenshots.

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
| Not offered | IBT-111, IBT-158, BTOM-003/028/029, IBT-006, IBT-073/074/134/135 — the coverage limits |
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
| Monthly price | 12.000 · 28.000 · 55.000 · negotiated | money, rial sign |
| Annual | two months free → 10.000 · 23.333 · 45.833 shown derived | rule |
| Quarterly | monthly rate, no discount | rule |
| Users included | 2 · 5 · 10 · unlimited | number / unlimited |
| Extra user per month | 3.000 · 2.500 · 2.500 · negotiated | money |
| Branches included | 1 · 2 · 5 · unlimited | number / unlimited |
| Extra branch per month | upgrade required · 8.000 · 8.000 · negotiated | money / upgrade |
| Overage rate per document | 0.090 · 0.040 · 0.026 · n/a | money |
| Features | RBAC (— ✓ ✓ ✓), recurring invoices and bills (— ✓ ✓ ✓), approval workflow (— — ✓ ✓), REST API + sandbox (— ✓ ✓ ✓), webhooks + file transfer (— — ✓ ✓), SSO (Ent), custom reports (Ent), white label (Ent), support Email · Email · Email and chat · Account manager, SLA (Ent) | switches |
| ERP field mapping | included on every plan | locked switch |
| Automatic ERP extraction | add-on on every plan, included at Enterprise | add-on / included |
| Maximum API keys | set per plan | number |
| Accountant and auditor seats | free on every plan, read and export | locked rule |
| Trial mirrors | Business | plan picker |
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
| Trial length | 15 days |
| Trial allowance | 25 documents |
| Trial mirrors | Business |
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
