# Platform / Admin — discovery and integration plan

Status: **discovery complete, nothing implemented.** No source file was changed for this phase.
The only change is this document.

| | |
|---|---|
| Frontend | `D:\fawtir-frontend`, branch `feat/signup-integration`, HEAD `2e99ca0` (`main`) + 55 uncommitted entries from the Signup → Logout slices (preserved, untouched) |
| Backend | `D:\fawtir` @ `94cde817` (V178 committed and applied locally; Flyway at V178); no backend change |
| Method | code sweep of all 106 core `@RestController`s, the permission/role catalogues and migrations; full frontend sweep; **live checks** against the local stack as the bootstrap platform operator (read-only GETs, then signed out); DB read-only queries |

## 1. Summary

- **The frontend has a complete-looking Platform Console that is 100 % mock.** `/console` (Operations) and `/console/tenants` are fully designed in the product's own visual language, fed by `src/lib/superAdmin.ts`. The other six console routes are "Not built yet" placeholders.
- **The tenant-admin Settings screens are also 100 % mock**: Team, Invite, Roles, Make a role, Signing-in, Plan, Billing and Activity log. Their role and permission model (owner / manager / accountant / till; 16 plain-language permissions) does not match the backend (ADMIN / FINANCE_MANAGER / …; 49 codes).
- **No frontend code reads roles, permissions or tenant kind.** There are no route guards. `/console` opens for anyone who types the URL, and its user ("Nasser Al Habsi, Super Admin") is hard-coded. The only network code is the identity flows plus Sign out.
- **Backend coverage for the console is uneven.**
  - **Ready:** the company-verification review workflow (queue, detail, history, evidence upload, attest, reject), the plan catalogue, and platform operator role grants. Also, with no frontend at all: PEPPOL_TEST tenant provisioning and a large SMP administration surface.
  - **Missing:** anything behind Operations, Tenants, Submission queue, Incidents and platform Audit log. There is no tenant list, no operational metrics and no cross-tenant audit query.
- **Recommendation:** start with **Company verification → review queue** (the existing "Onboarding" console item). It is fully backed and verified live. It is the direct continuation of the integrated signup (a submitted registration waits for exactly this). It exercises the console access foundation every later screen needs.

## 2. Backend permission model (reviewed)

**Where permissions come from:**
- `GET /api/v1/me/entitlements` (authenticated only) returns `{userId, username, tenantId, roles[{id, code, name, systemRole}], permissions[], scopes[] (= permissions), featureFlags (always {})}`.
- The permissions come from the same resolver that `@RequiresPermission` enforces, so this is the correct **single frontend source for UX gating**.
- It has **no tenant kind or purpose, no plan data and no MFA flag.** A platform principal is recognised by holding `platform.*` codes: only PLATFORM-kind tenants can hold them, and the service layer plus a DB trigger enforce that at grant time.

**Portal sessions:**
- A cookie session reloads the user and permissions from the database on every request (`AccessSessionValidationService.validateAndTouchByCookie`). Grants and revocations therefore take effect immediately, for both `@PreAuthorize` and `@RequiresPermission` endpoints.
- A cookie session counts as MFA-verified (`requireMfaVerified` returns early for `PortalSessionPrincipal`). The MFA-gated platform actions work from the portal without a step-up.

**Tenant realms** (`tenant.tenants`: `kind` is the security boundary, `tenant_type` = `kind`, plus `purpose`):

| Realm | kind / purpose | Local stack |
|---|---|---|
| Customer | CUSTOMER / BUSINESS | 10 tenants (self-service signups, all `PENDING_VERIFICATION`) |
| Production platform (Fawtir) | PLATFORM / BUSINESS | 1 (`FAWTIR`) |
| Peppol TEST authority | PLATFORM / PEPPOL_TEST_AUTHORITY | none |
| PEPPOL_TEST tenant | CUSTOMER / PEPPOL_TEST | none |

**Platform roles and grants** (verified in the local database; `PlatformRoleCatalogue`):

| Role | Permissions | Assignable in |
|---|---|---|
| `PLATFORM_TENANT_ADMIN` | `platform.tenants.manage`, `platform.operators.manage`, `admin.users.manage`, `admin.roles.manage`, `role.read`, `role.list` | production platform |
| `PLATFORM_SUPPORT` | `platform.support`, 14 × `platform.smp.*`, `platform.selfbilling.counterparty.verify`, `platform.dispatch.recover` | production platform |
| `PEPPOL_TEST_OPERATOR` | `platform.peppol-test.manage`, `platform.certification.seller.attest` | TEST authority realm only (V091 triggers) |
| `PLATFORM_OPERATOR` | `platform.tenants.manage` | provisioned, no holder after bootstrap |

- **The local bootstrap operator** holds `PLATFORM_TENANT_ADMIN` and `PLATFORM_SUPPORT`, giving exactly 23 codes (verified live).
- **By design, no platform role holds** `platform.peppol-test.manage` in production, or `tenant.plan.*` or `compliance.hold.manage` (those are customer-operational codes).
- There is no `PLATFORM_ADMIN` or `OWNER` role anywhere; a privileged-sounding name grants nothing.
- **Customer roles:**
  - `ADMIN`: all 49 non-platform catalogue codes, including `tenant.plan.*` and `compliance.hold.manage` (V178)
  - `FINANCE_MANAGER`: 8 codes, including `tenant.plan.read`
  - `ACCOUNTANT`, `VIEWER`, `APPROVER`, `MOBILE_USER`, `INTEGRATION`: smaller sets
  - A self-service registrant receives `ADMIN`.

**Catalogue:** `GET /api/v1/permissions` returns the 59 Java-catalogue codes `{code, module, description, assignable}`, with `assignable=false` for platform codes. The database holds 102 rows. The extra ones are legacy V008 codes (not enforced) and three enforced codes missing from the Java catalogue (`dispatch.read`, `dispatch.recover`, `smp.participant.reonboard`).

**Error contract:**
- RFC 7807 `https://api.fawtir.om/problems/{slug}`. Relevant slugs: `validation-failed`, `unauthenticated`, `insufficient-permission` (403), `resource-not-found`, `resource-conflict` (409), `rate-limited` (429), `internal-error`.
- **Any unhandled `IllegalArgumentException` or `IllegalStateException` becomes `500 internal-error`.** Several platform services use them for user errors (see gaps).

## 3. Screen / capability matrix

Legend:
- **State:** EI existing and integrated · EM existing but mocked · ED existing but disconnected · EC existing, backend contract changed · PI partially implemented · MF missing frontend · BNA backend not available · NR not required.
- **Risk:** L / M / H.

### 3a. Platform Console (Fawtir staff)

| Capability | Route | Frontend files | Backend endpoint(s) | Permission | State | Gap | Action | Risk |
|---|---|---|---|---|---|---|---|---|
| Console access / nav gating | `/console/*` | `layouts/ConsoleShell/*`, `lib/consoleNav.ts` | `GET /me/entitlements` | authenticated; `platform.*` for UX | EM | no session read, no guard, hard-coded user, `UserMenu` links to tenant settings | foundation with the first screen: one entitlements read per console visit, 401 → Login, no `platform.*` → leave console; real username | M |
| **Company verification — queue** | `/console/onboarding` (soon page) | `pages/ConsolePage/ConsoleSoonPage.tsx` | `GET /platform/companies?status&page&size` | `platform.tenants.manage` | MF (route exists) | no screen; queue includes unsubmitted shells | **integrate first** (read-only) | L |
| Company verification — detail and history | none | none | `GET /platform/companies/{id}`, `GET …/{id}/verification-history` | `platform.tenants.manage` | MF | new detail screen | with the queue | L |
| Company verification — evidence, attest, reject | none | none | `POST …/{id}/verification-evidence` (multipart), `POST /tenants/{id}/company-verification/manual-attestation`, `…/rejection` | `platform.tenants.manage` (four-eyes: reviewer ≠ submitter) | MF | decision UI not designed; revision / 409 handling | second slice | M |
| Tenants list and metrics | `/console/tenants` | `pages/ConsolePage/TenantsPage.tsx`, `lib/superAdmin.ts` | **none** (`GET /tenants` answers 405); only the review queue lists tenants | — | EM + BNA | no tenant list, search, quota, filing health or revenue API | backend first; keep the mock, or reduce it to review-queue data after product decision | H if faked |
| Tenant provisioning ("Onboard a business") | button on Tenants | `TenantsPage.tsx` (no-op) | `POST /tenants` | `platform.tenants.manage` | ED | no form | later; needs design and product decision (self-service is the main path) | M |
| Tenant deprovisioning | none | none | `POST /tenants/{id}/deprovisioning` | `platform.tenants.manage` | MF | **no backend guard against deprovisioning the PLATFORM or own tenant** | do not expose until backend guards exist | H |
| Operations dashboard | `/console` | `pages/ConsolePage/OperationsPage.tsx` | **none** (no ops, OTA health or filing metrics API) | — | EM + BNA | entirely mock | keep mock or mark as preview; backend API needed | M |
| Submission queue | `/console/queue` (soon) | none | partial: `GET /platform/peppol/smp/problem-summary`, dispatch redrive `POST /dispatch/tenants/{t}/authored-invoices/{i}/redrive` | `platform.support` + `platform.smp.operations.review` / `platform.dispatch.recover` | MF + partial BNA | no cross-tenant OTA/TDD queue API | defer; define product scope | M |
| Incidents | `/console/incidents` (soon) | none | none | — | BNA | — | defer | L |
| Plans and rates (catalogue) | `/console/plans` (soon) | none (mock plans in `superAdmin.ts`) | `GET /platform/plans`, `PUT /platform/plans/{code}` | `platform.tenants.manage` | MF | new screen; upsert has no delete or version history | third or fourth slice | M |
| Platform audit log | `/console/audit` (soon) | none | **none cross-tenant**. Tenant log `GET /settings/activity-log` needs `admin.settings.manage`, which the operator lacks (403, verified) | — | BNA | — | backend first | M |
| Console settings | `/console/settings` (soon) | none | undefined | — | NR until defined | no product definition | ask product | L |
| Platform operators and roles | none (could live under Console settings) | none | `GET /users` (platform tenant), `POST`/`DELETE /platform/operators/{userId}/roles/{roleCode}`, `PUT /platform/operators/{userId}/email` | `platform.operators.manage` (+ MFA, no self-grant, keep last admin) | MF | wrong role code or realm → `500`, not 4xx | after the verification slices | H |
| Support impersonation | none | row action "Sign in as them" (no-op) | `POST /support/impersonations` | `platform.support` (+ MFA, 15-minute session) | ED | high-risk flow; token returned in body | defer; security design first | H |
| Dispatch recovery (cross-tenant) | none | none | `POST /dispatch/tenants/{t}/authored-invoices/{i}/redrive` | `platform.dispatch.recover` | MF | no list of dead-lettered dispatches across tenants | defer with the submission queue | M |
| Self-billing counterparty verification | none | none | `POST /self-billing-agreements/{id}/counterparty-verification` | `platform.selfbilling.counterparty.verify` | MF | no queue listing pending verifications | defer | M |
| SMP administration (AP profiles, data blockers, operator review, readiness) | none | none | `/platform/peppol/smp/**` (no GET for AP profiles; blockers have GET current and versions) | `platform.support` + `platform.smp.*`, separation of duties | MF | Peppol compliance workflows; no design | defer; compliance authority needed (project rule: never guess Peppol rules) | H |
| PEPPOL_TEST tenants and certification fixtures | none | `settings/peppol` "Test in the sandbox" (no-op, tenant side) | `POST /platform/peppol/test-tenants`, `…/first-administrator`, `…/certification-fixture/*`, SMP external-test bindings | `platform.peppol-test.manage` (TEST authority realm only, MFA, TEST network required) | MF + BNA locally | no list GET; local stack has no TEST authority realm | defer | M |
| mTLS principals, BDV | none | none | `POST`/`DELETE /support/mtls-principals`; `POST /platform/certification/business-document-validation` | `platform.support`; `platform.certification.bdv.execute` (no role holds it) | NR for now | — | not in UI scope | L |

### 3b. Tenant administration (customer tenant, Settings)

All eight screens exist in the design and are mocked. Their model differs from the backend, so each is **EC** (existing, backend contract changed), not a plain wiring job.

| Capability | Route | Frontend files | Backend endpoint(s) | Permission | State | Main gap | Risk |
|---|---|---|---|---|---|---|---|
| Team (people list) | `/settings/team` | `TeamPage.tsx`, `lib/settingsPeople.ts` | `GET /users` (Spring page), `POST /{id}/lock` / `/unlock`, `DELETE /{id}`, `GET`/`DELETE /users/{id}/sessions`, `DELETE /users/{id}/mfa` | `admin.users.manage` | EC | mock has branches, "last signed in", seats; backend `RecordUserResponse` has no last-sign-in or branch list; no re-enable endpoint | M |
| Invite | `/settings/team/invite` | `InvitePage.tsx` | `POST /users/invitations` {email, roleCodes}; list, resend, revoke | `admin.users.manage` | EC | backend takes only email + role codes; name, note, branches and two-step switch have no counterpart; list has no totals | M |
| Roles and matrix | `/settings/roles` | `RolesPage.tsx` | `GET /roles`, `GET /roles/matrix`, `GET /permissions` | `role.list` / `role.read` | EC | 16 plain-language permissions and limits vs 49 codes plus qualifiers | H (design) |
| Make a role | `/settings/roles/new` | `MakeRolePage.tsx` | `POST`/`PATCH`/`DELETE /roles`, `…/users/{id}/roles` (UUIDs) | `admin.roles.manage` | EC | same mapping problem; no subset rule in backend | H |
| How you sign in (policy) | `/settings/signing-in` | `SigningInPage.tsx` | `GET`/`PUT /identity/policy`, `GET /identity/metrics` | `admin.settings.manage` | EC | mock session-length and SMS options have no backend counterpart; MFA cannot be turned off (backend) | M |
| Activity log | `/settings/activity-log` | `ActivityLogPage.tsx`, `lib/settingsRecords.ts` | `GET /settings/activity-log` (filters, `page` / `page_size`, `has_more`) | `admin.settings.manage` | EC | mock tabs and grouping vs `security_audit_events` rows | M |
| Plan | `/settings/plan` | `PlanPage.tsx`, `lib/settingsBilling.ts` | `GET`/`PUT /settings/plan`, `/catalogue`, `PUT /overage` | `tenant.plan.read` / `.manage` | EC (closest match: same 3 plans and prices) | usage and forecast fields must be mapped | L–M |
| Billing | `/settings/bills` | `BillingPage.tsx` | none (billing deliberately absent in backend) | — | BNA | — | — |

The signup-era `/plans` → `/payment` → `/fawtara-status` flow uses a **different** plan catalogue (12 / 35 / Enterprise). It is unlinked from signup since the final-submission slice; it is **NR** unless product revives it.

## 4. Existing frontend inventory

- **Platform routes:** `/console`, `/console/tenants`, and `/console/{queue, incidents, onboarding, plans, audit, settings}` (placeholders).
- **Platform screens:** `OperationsPage`, `TenantsPage`, `ConsoleSoonPage` (all mock).
- **Platform components:** `ConsoleShell`, `ConsoleSidebar`, `consoleIcons`. Reused from the shared shell: `Topbar`, `UserMenu`, `ActionMenu`, `FilterMenu`, `SortMenu`, `RowsView`, `Modal`, `Popover`, and the form controls.
- **Platform API services:** none. The only services are `src/api/client.ts` (`apiRequest`, now with the CSRF header) and `src/lib/identity/*`.
- **Shared-pattern gaps relevant to admin screens:**
  - no generic table, pagination, loading, error or empty-state component
  - each page draws its own `<table>` inside `RowsView`, its own tabs, and its own KPI cards
  - pagination is client-side slicing of mock arrays in about 15 pages
- **Dead or unused:** the barrel files `src/pages/index.ts` and `src/components/index.ts` are never imported. Unused exports include `superAdmin.REFUSED_TODAY`, the `consoleNav.soon` flag (never rendered), and `settingsPeople.grantsFor`.

## 5. Gaps

### RBAC gaps
1. **No frontend gating at all.** Every console and settings screen renders for anyone. This is UX only, because the backend enforces every call, but integrated screens must handle 401 and 403 and must not show mock "live" data as if it were real.
2. **Entitlements carry no tenant kind or purpose.** Platform-ness has to be inferred from `platform.*` codes (sound by construction, but implicit). A `tenantKind` field would be cleaner (backend ask).
3. **The operator cannot read its own tenant's activity log, identity policy or metrics.** Those require `admin.settings.manage`, which no platform role holds.
4. **No "cannot grant what you don't hold" rule** in customer role management. Any `admin.roles.manage` holder can build a role with any non-platform code.
5. **Platform role path may be bypassable (unverified).** The generic `/users/{id}/roles` could, inside the platform tenant, assign `PLATFORM_*` roles without the platform path's MFA, no-self-grant and last-admin rules. DB triggers still apply.
6. **Catalogue drift.**
   - `platform.certification.bdv.execute` is held by no role.
   - `dispatch.read`, `dispatch.recover` and `smp.participant.reonboard` are enforced but absent from the Java catalogue, so customer `ADMIN` never receives them.
   - `docs/identity/delegated-administration.md` is stale: it cites V008 codes that are not enforced.

### API contract gaps
1. **Review queue includes unsubmitted signup shells.** They carry `PENDING_VERIFICATION` with no profile: locally 7 of 10, only 3 submitted, verified in the database. There is no `submitted` filter, no text search and a fixed sort. Attesting a shell answers 409 "incomplete profile". Backend ask: exclude shells or add a `submitted` filter. Frontend interim: label rows with `submittedAt = null` as "Not submitted yet" and offer no decision.
2. **No tenant list, tenant detail, operational metrics, OTA health, submission queue, incidents or cross-tenant audit API.**
3. **User errors that answer `500`:**
   - unknown platform role code or wrong realm on operator grants
   - evidence file empty or too large (max 10 MB, from configuration)
   - evidence storage disabled
4. **Deprovisioning has no guard** against the PLATFORM or caller's own tenant.
5. **Missing read endpoints:** no GET for AP profiles, PEPPOL_TEST tenants, mTLS principals or OAuth clients. The invitation list has no totals.
6. **Inconsistent identifiers:** user–role assignment takes role UUIDs, while create and invite take role codes. There is no endpoint to re-enable a deactivated user.
7. **Plan catalogues disagree across the frontend.** Signup-era prices differ from the backend `STARTER` / `BUSINESS` / `BUSINESS_PLUS` at 19 / 49 / 89.
8. **Known, out of scope:** a CSRF refusal answers 401 because the audit write fails row-level security (Logout handoff).

### UI gaps
- No designed screens for the company detail, the evidence upload and decision flow, the plan catalogue editor or operator management. These are new screens that must be composed from existing parts; any new layout goes to design review first (VISUAL_BLOCKER process).
- Console defects (prototype):
  - Tenants tab counts come from constants (303 total, 12 closed) but only 7 rows exist
  - the console `UserMenu` links to tenant routes
  - `GlobalSearch` searches tenant mock data inside the console
  - no tenant detail route
  - the `soon` flag is never shown
- No shared loading, error or empty-state pattern for data screens. The first integrated screen must establish one from existing parts: the identity forms' `role="alert"` text and the tables' "no results" row.

### Security concerns
1. **PII.** Company review exposes tax numbers, CR numbers, addresses and the registrant's identity. Keep it only in component state: no web storage, no logging, and no PII in URLs (the tenant UUID is fine).
2. **Evidence uploads.** There is no server-side content-type allow-list, so the frontend should restrict the picker to documents and images (UX), and the backend should add a check. Evidence is bound to the profile revision, and the four-eyes rule (reviewer ≠ submitter) is enforced server-side.
3. **Irreversible or high-impact actions** (deprovision, impersonation, operator grants, plan upserts): each needs an explicit confirmation design and must not be exposed before its backend guard gaps are closed.
4. **The console must never offer an action the backend would refuse.** It must also never hide a refusal: a 403 must be shown as "you don't have access", not as an empty list.
5. **Existing issues, out of scope:** the logout CSRF-audit defect; the local `:5173` origin not being allowed.

## 6. Recommended integration order

| # | Slice | Endpoints | Requests (initial / follow-up / user action) | Why here |
|---|---|---|---|---|
| 1 | **Console access + Company verification queue (read-only)**: `/console/onboarding` list, company detail and history | `GET /me/entitlements`, `GET /platform/companies`, `GET …/{id}`, `GET …/{id}/verification-history` | see §7 | fully backed, verified live, low risk, continues the integrated signup, establishes the console foundation |
| 2 | **Company verification decisions**: evidence upload, attest, reject | `POST …/verification-evidence`, `POST /tenants/{id}/company-verification/manual-attestation` \| `/rejection` | 1 upload (+ re-upload by choice); 1 decision; refresh detail and history once | completes the approval loop so a registrant can finally sign in; needs a decision-UI design review |
| 3 | **Plans and rates** (catalogue view, then edit) | `GET /platform/plans`, `PUT /platform/plans/{code}` | 1 initial; 1 per save | small, backed; the design already has the "Plans and rates" nav item |
| 4 | **Platform operators** (list, grant or revoke platform roles) | `GET /users`, `POST`/`DELETE /platform/operators/{id}/roles/{code}` | 1 initial; 1 per change | backed, but needs the 500-on-user-error backend fix first for clean errors |
| 5 | **Tenant-admin track** (customer Settings), in this order: Plan → Activity log → Team (read, then lock, unlock, sessions, MFA reset) → Invitations → Roles | see §3b | per screen | high value for customers but needs design/mapping decisions (EC) |
| 6 | **Tenants list, Operations, Queue, Incidents, Audit** | backend APIs do not exist | — | blocked on backend (BNA) |
| 7 | **SMP administration, PEPPOL_TEST, impersonation, deprovisioning** | exist, but high-risk or compliance-bound | — | needs security, compliance and design decisions first |

## 7. First screen recommended: Company verification queue (read-only)

**Scope:**
- Replace the `/console/onboarding` placeholder with the review queue:
  - status tabs: Waiting / Verified / Rejected / All
  - server pagination (`page`, `size`)
  - rows showing company, code, submitted and decided dates, status, and revision
- Opening a row goes to a company detail view: submitted fields, verification state, sign-in state of the registrant's admin, and the history timeline.
- Read-only; no decisions in this slice.

**Built from existing parts only:**
- `ConsoleShell` and the Tenants page's header, tabs, table and search patterns
- `RowsView` for mobile cards
- `SettingsHeader`-style detail headings
- the existing status-pill styles

The detail view has no design frame, so its layout goes to review before implementation.

**Console foundation (included):**
- One `GET /me/entitlements` per console visit, shared by the console pages. Every page mounts its own shell, so it is cached for the tab; dropped on sign-out and on a 401.
- Without `platform.tenants.manage`, the item and page say "no access". A 401 goes to Login.
- The real username replaces the hard-coded console user.

**Request budget:**

| Moment | Requests |
|---|---|
| Console entry | 1 (`/me/entitlements`, cached for the console visit) |
| Queue first load | 1 (`GET /platform/companies?status=PENDING_VERIFICATION&page=0&size=25`) |
| Change tab or page | 1 |
| Open a company | 2 in parallel (`detail` + `verification-history`) |
| Back to the queue | 0 if the page is kept, else 1 |
| Polling | none |

Avoidable requests: none planned. No refetch on focus, no pre-checks, no count queries (`totalElements` comes with the page).

**Why this one first:**
1. It is the only platform capability that is complete end to end in the backend, and it was verified live (list, filter, detail, history: all `200` for the operator).
2. It closes the loop of the already-integrated signup: every submitted registration waits in this queue.
3. It is read-only, so it carries the lowest risk while it establishes the console access, error and loading patterns that every later console screen reuses.
4. Its route and nav item already exist in the design.

**Open decisions to confirm before implementing it:**
1. Show unsubmitted signup shells as "Not submitted yet", or hide them client-side? Hiding breaks server paging totals, so the recommendation is to show and label them, and raise the backend filter ask.
2. The detail view layout (no existing frame): approve a composition of the existing card and field patterns.
3. Whether "Onboarding" keeps its label or becomes "Verification".

## 8. Verification performed during discovery

| Check | Result |
|---|---|
| Operator entitlements (live) | roles `PLATFORM_SUPPORT`, `PLATFORM_TENANT_ADMIN`; 23 permissions (listed in §2); `featureFlags {}` |
| `GET /platform/companies` (all, and `status=PENDING_VERIFICATION&size=5`) | 200, `SummaryPage{items, page, size, totalElements, totalPages}` |
| `GET /platform/companies/{id}`, `…/verification-history` | 200; shapes as in §3a |
| `GET /platform/plans` | 200, 3 plans (`STARTER` / `BUSINESS` / `BUSINESS_PLUS`) |
| `GET /users`, `/roles`, `/roles/matrix`, `/permissions`, `/me/sessions`, `/users/invitations` | 200 |
| `GET /settings/activity-log`, `/identity/metrics`, `/identity/policy`, `/settings/plan` as operator | 403 `insufficient-permission` (as the model predicts) |
| `GET /tenants` | 405 (no list) |
| Sign-out after probing | session `401` |
| Existing console screens (browser, 1440 en and 390 ar) | render in the product style; no horizontal overflow |
| Evidence storage (local) | enabled, local MinIO; max 10 MB |

## 9. State

`CSS_CHANGED = NO`, `DESIGN_CHANGED = NO`, `LAYOUT_CHANGED = NO`, `BACKEND_CHANGED = NO`, `COMMITTED = NO`, `PUSHED = NO`.
Nothing implemented. The next step waits for review and explicit authorisation of the first screen.
