# Settings: backend guide

**For:** the backend team. **Covers:** Settings › Company profile. **Last updated:** 7 October 2026.

This is the single guide for this area. It lists every place where a screen draws something the
API does not provide yet, and what to add.

## How to use this guide

- **The rule.** The product owner ruled that the Figma design is the source of truth. Each screen
  follows its frame; where the API does not carry what the frame draws, the screen draws it from
  the best value it has, or shows a marked placeholder, and the gap is a row below. The backend
  adapts to the screen; the front end then re-tests the integration by hand.
- **Nothing existing was removed.** Every call, request shape and permission check the integration
  added is still there, and the tests that assert them still pass.
- **Rows.** Each row reads: number, what the screen shows, what the backend must add. Row numbers
  are stable ids: the code comments cite them, so they are never renumbered, and new rows are
  appended at the end of their section.
- **Finding it in the code.** Every gap is a `// TODO(backend)` comment naming its row. Search for
  `TODO(backend)` in `src/pages/SettingsPage/CompanyProfilePage.tsx`.

**Screens in this guide:** Settings › Company profile, Activity log, Branches, Peppol and tax, Plan and usage, Team members, Invite someone, Roles, Signing in.

---

## 1. Company profile (`GET/PUT /v1/company-profile`, `/branding`, `/branding/logo`, `/invoice-defaults`, `/industrial-classification`)

Business activity, branding (logo, brand colour), invoice defaults (language, currency, payment
terms, footer note) and the identity fields (registered name, Arabic name, trading name, commercial
registration, address, contact) are all wired as of 2026-09-28. **Decided by Zain, 2026-09-28**: the
identity fields are editable and saveable while `verificationStatus` is `PENDING_VERIFICATION` or
`REJECTED`, and read-only once `VERIFIED` — `PUT /company-profile` genuinely refuses any write once
verified ("Verified company profiles require an approved amendment workflow", which does not
exist), so the screen matches that rather than offering a Save that always fails for a live
customer. Whether a verified company should ever be able to amend its identity (and whether that
should re-trigger reverification) is a separate product/compliance question, not raised here since
today's behavior is not a bug — it matches the API exactly.

| # | The design shows | Ask |
|---|---|---|
| 1.1 | "On a receipt" (135:37013): "Use a plain black version" / "Leave it off receipts" | `CompanyBranding.receiptMonochrome` is a colour toggle on a logo the backend always draws; it cannot represent "leave it off receipts" (the second option). Either a third state (`omit`) on the same field, or a separate `showLogoOnReceipt` boolean alongside it. The screen keeps this control local-only (not saved) until then |
| 1.2 | "Website" input under "Where you are" | `/company-profile` (`CompanyProfileResult`/`UpdateCompanyProfileRequest`) has no website field at all. The screen keeps it local-only (not saved) until one exists |
| 1.3 | "VAT registered since" (a date) beside the locked VAT number | No such field on `/company-profile` or anywhere else in the company API. Local-only, pre-dates 2026-09-28's wiring |
| 1.4 | The company address ("Where you are": street, town, postal code) and the sign-up address step, where the postal code is optional | Suppliers send us invoices over Peppol with our company as the buyer. PINT-OM IBR-019-OM requires the buyer's address line, city and post code (IBT-050, IBT-052, IBT-053) on a full tax invoice, and IBT-055 country. Make `registeredPostalCode` required (3 digits) on `PUT /company-profile` and on the sign-up `address-contact` step once existing companies without one have been asked to add it; until then a supplier's invoice to a company with no postal code can fail validation. The screens keep the field optional today (owner, 2026-09-30) |
| 1.5 | Sign-up "Address & contact" (`/address-contact`) now asks for **Address line**, **Additional street or area** and **Building or address line 3**, all required (140 characters each), and the **postal code**, required (3 digits). Owner, 7 Oct 2026: new companies give the full seller address before their first invoice. Supersedes the "optional" note in row 1.4 for sign-up | Every invoice must state the seller's address lines 1, 2 and 3, city and postal code (PINT-OM IBR-010-OM, fatal), so a company that signed up with one line is refused at issue (`SELLER_ADDRESS_INCOMPLETE`) until it completes Settings › Company. (1) Add `addressLine2` and `addressLine3` (required, max 140) to `SignupAddressContactRequest` on `POST /v1/auth/signup/address-contact`, and make `postalCode` required (3 digits). (2) Store them on the registration and copy them to the company's `registeredAddressLine2` / `registeredAddressLine3` / `registeredPostalCode` when the registration is approved, as line 1 is today. (3) Show them to the console reviewer with the rest of the address. The screen already sends `postalCode` every time; lines 2 and 3 are kept on the review page but **not sent** until (1) ships, because the server refuses unknown members (`TODO(backend)` in `src/lib/identity/onboarding.ts`). Companies registered before this still complete the address in Settings › Company |
| 1.6 | Sign-up "Address & contact" now **sends** address lines 2 and 3 and an optional **PO Box** | Row 1.5's step (1) and (2) already existed: `SignupAddressContactRequest` has accepted `addressLine2`, `addressLine3` and `poBox` and promoted them to the company since V100/V107; the screen dropped lines 2 and 3 on a stale belief that it did not (7 Oct 2026, found when a TEST company's first invoice was refused `SELLER_ADDRESS_INCOMPLETE`). The server half of row 1.5 is on backend branch `feat/post-e2e-transport-onboarding` (not yet merged or deployed): `POST /v1/auth/signup/address-contact` requires lines 2 and 3 (max 255) and a 3-digit postal code, so an API client cannot skip them either. **Deploy this screen first**: the server already accepts the fields, while the server change refuses the request the old screen sends |

## 2. Activity log (`GET /v1/settings/activity-log`)

Settings › Activity log draws every element of its frame from the real log (7 Oct 2026, after PR
#148 replaced the sample log). What the log cannot answer yet says "Not available yet" or works on
the page the server answered, and says so.

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 2.1 | "Export as PDF" beside the title. Pressing it says the export is not available yet | An export of the log for a period: `GET /v1/settings/activity-log/export?from=&to=&format=pdf` (and CSV), same permission (`admin.settings.manage`), the same filters as the list, streamed for a long period |
| 2.2 | The three counts above the list: "This month" (entries), "By a person", "By the API" with its note. Each reads "Not available yet" | Counts for a period, by actor kind: `GET /v1/settings/activity-log/summary?from=&to=` answering `{total, byActorType: {USER, API_KEY, SYSTEM, SUPPORT_USER}, topPeople: [{actorId, displayName, count}]}`. The frame's "By a person" note names the top people and their counts |
| 2.3 | "Kept for 10 years, can't be edited or cleared" | Confirm the log's retention is ten years (the Oman VAT Law period the handbook records) and that it is append-only for every role, support included. If the period differs, answer it on the summary (`retentionYears`) and the screen will show it |
| 2.4 | The five tabs: All, People did it, Fawtir did it, By the API, Money and access, with counts | An `actor_type` filter (one or more of `USER`, `API_KEY`, `SYSTEM`, `SUPPORT_USER`) and a `resource_type` filter that takes several values, so a tab can ask the server. Until then the tabs and their counts cover the page the server answered, and the toolbar says so |
| 2.5 | The search box ("Search an invoice number, a name, anything...") | A `q` parameter searching the event, the resource and its number or name. Until then the search looks through the words shown on the page answered |
| 2.6 | Sort: newest or oldest first | A `sort` parameter (`occurred_at` ascending or descending). Until then the page answered is reversed |
| 2.7 | Each entry: who did it (the frame shows the person's initials and name, "Hafidh Saif changed the price of Flat White"), and a link to what it concerns | (1) `actor_display_name` on each item (the people list is not readable here); (2) a readable label for the resource (an invoice number, a customer or item name) beside `resource_id`; (3) where an event changed a value, the before and after (the frame's price change), from `metadata` in a documented shape. Until then a person shows the person glyph, the event is named in words, and the resource by its kind and a short id |

## 3. Branches (`GET /v1/branches/overview`)

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 3.1 | A closed branch's note: "Closed, not deleted. Its **612 invoices** stay reachable…" | The branch's all-time invoice count on each overview row (`invoicesTotal`). Until then the note leaves the number out: the row's `invoicesThisMonth` is 0 for a closed branch, and it used to print "Its 0 invoices" |
| 3.2 | Add branch: "Opens" (the opening date) under "Where it is". Drawn, cannot be set; reads "Not available yet" | An `openedOn` date (`yyyy-mm-dd`, today or later) on `BranchAttributes` for `POST`/`PUT /v1/branches`, returned on the overview. The design also shows it in the footer sentence ("…opens on {date}") once it exists |
| 3.3 | Add branch: "Who works there", the people working at the branch with their role and a tick each. Drawn with "Not available yet"; "Invite someone new" still works for those who may invite | A way to list and assign the people who work at a branch from the branch itself: the tenant's users with their role and current branch (or branches), and an assignment saved with the branch. Today a person's branch is set only on their own profile |

## 4. Peppol and tax (`GET /v1/peppol/smp/data-submissions/standing`, `GET /v1/peppol/smp/participants`)

The page states three separate facts and never calls the company "live": Fawtir's own verification
of the Participant ID (from the standing), publication in the Oman SMP (only a registration whose
`remoteState` is `CONFIRMED_ACTIVE`), and SML discoverability. The certificates and the
visibility switches the frame drew are kept, without the sample values: each reads "Not available
yet" until the server answers it (rows 4.3 and 4.4). Fawtir manages the access-point certificates.

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 4.1 | "SML discoverability": always "Not checked by Fawtir" | A read that says whether the company's Participant ID resolves through the SML to the Oman SMP, with when it was last checked. Until then the row never claims it can be found |
| 4.2 | "Oman SMP publication" | `participantReference` is masked, so the screen cannot tell which registration belongs to the verified ID; it says "Published" if any registration is `CONFIRMED_ACTIVE`. An unmasked reference for the tenant's own registrations, or a per-standing publication flag, would let it match exactly |
| 4.3 | "Certificates": signing certificate, AS4 transport certificate and OTA reporting credentials, each named with its note and "Not available yet" where the frame shows the issuer and the days left | A read of each certificate that applies to the company: what it is, who issued it, when it expires, and whether it renews itself. The design's renewal steps ("Ask Oman CA for a new one", "Upload it here") come back once that read exists, for any certificate the company itself holds |
| 4.4 | "How you appear to others": Listed in the Peppol directory, Accept bills sent to you over Peppol, Accept self-billing, Send a copy by email as well. Drawn at their usual settings, cannot be switched; the card reads "Not available yet" | Each as a company setting that can be read and saved (for example `GET`/`PUT /v1/peppol/visibility`), with the directory listing published to the Peppol Directory and "accept bills" reflected in the SMP registration |

## 5. Plan and usage (`GET /v1/settings/plan`, `GET /v1/settings/subscription`, `GET /v1/public/plans`)

PR #166 drew this screen from the server's figures and dropped what the server cannot answer. The
design's parts are drawn again (11 Oct 2026): the forecast is computed from `used`, `quota` and the
period, the plan cards come from the published catalogue (`GET /v1/public/plans`, marked "Your
plan" by `plan.code`), and the rest reads "Not available yet". **Owner decision:** a move to a
larger plan applies straight away; a move to a smaller plan applies from the next renewal.

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 5.1 | "Move up a plan" beside the usage, and "Move to {plan}" on each plan card (dearer and cheaper). Drawn disabled with "Not available yet", shown only to `tenant.plan.manage` | A plan change: `POST /v1/settings/subscription/plan-change` with `{planCode, billingCycle, priceVersionId}` (the catalogue's price version, so a repricing is caught), permission `tenant.plan.manage`, idempotent. An upgrade applies at once (pro rata, as `platformSettings` `upgrade: immediateProRata` describes) and answers the new `SubscriptionStatusDto`; a downgrade is stored as the `scheduledChange` the status already returns (and `DELETE /scheduled-change` already withdraws), effective on `renewsOn`. Refusals as problem types the screen can name (plan not offered, payment being checked, people or branches above the smaller plan's ceiling) |
| 5.2 | "Switch overage on or off" beside the usage. Drawn disabled, "Not available yet" | Whether overage is on for the tenant, readable on `GET /v1/settings/plan` (`overageEnabled`), and a way to switch it (`PUT /v1/settings/plan/overage {enabled}`, `tenant.plan.manage`). The plan's `overagePricePerInvoice` already says whether the plan offers it at all |
| 5.3 | "Busiest day so far" (the count and the date). Reads "Not available yet" | On the usage: `busiestDay: {date, count}` for the current period |
| 5.4 | "Last month" (documents used of the allowance then). Reads "Not available yet" | On the usage: `previousPeriod: {start, end, used, quota}`. **Answered by the server already** (since 6.2a): `usage.lastMonthUsed` (the previous allowance period's documents, issued and received) and `usage.lastMonthQuota` (the plan allowance of the terms that period closed on); no `start`/`end`. The screen reads those two names and keeps "Not available yet" only when `lastMonthUsed` is absent |
| 5.5 | "Raised today" split by branch (the design's note, "Muscat 3 · Nizwa 2"). The figure is shown; the note reads "By branch: not available yet" | On the usage: `raisedTodayByBranch: [{branchId, name, count}]`. **Answered by the server already** (since 6.2a), with the branch name as `branchName`, not `name`: `usage.raisedTodayByBranch: [{branchId, branchName, count}]` (`branchName` nullable; a null `branchId` holds documents issued without a branch). The screen names each branch as every other screen does (its Arabic name in Arabic, by `branchId`) and keeps "By branch: not available yet" only when the list is absent |
| 5.6 | "Add-ons": the ERP integration card (state, price, documents collected, reset date). Shows "Enabled by Fawtir" and links to ERP integration | A read of the tenant's add-ons, for example `GET /v1/settings/addons`: for ERP extraction, its availability on the plan (not offered, priced, included), whether it is active, its monthly price and allowance, and this period's collected count |
| 5.7 | The plan cards mark "Your plan" by matching `plan.code` against the public catalogue | A company on a retired or private plan finds no card marked as its own, and the price difference on the other cards falls back to `plan.monthlyPrice`. A list of the plans this tenant may move to, with the difference in price for its billing cycle (`GET /v1/settings/plan/options`), would answer it exactly |
| 5.8 | The allowance warning at 80%, 90% and 100% (AL-8) in the bell and on Plan and usage. Built from `allowance.warningPercent` on `GET /v1/settings/plan`; the bell's "read" mark is kept in the browser only | A server-side in-app allowance notice, listed and acknowledged like the subscription reminders (`GET /v1/settings/subscription/notices` with a quota kind, or its own route), raised once per period and threshold and raised again after extras are bought and run out |
| 5.9 | Buy extra documents (`/settings/plan/extra-documents`, 16 Oct 2026), which replaces the overage switch of row 5.2. On Bills and payment an extra documents bill is told apart from the subscription bill only by matching its id against `GET /v1/settings/plan/extra-documents` `outstanding.bill.id` | The kind of each bill on `SubscriptionBill` (`kind: SUBSCRIPTION | EXTRA_DOCUMENTS`, the stored `bill_kind`), so Bills and payment can name every bill, paid ones in the history included, without a second read. Also: the overview finds only the newest open bill, so a renewal bill and an extras bill open together show one at a time |
| 5.10 | Extra users, branches and add-on (`/settings/plan/extras`, 17 Oct 2026), from `GET/…/quote/POST …/orders` and the add-on cancellation. Invite someone and Add branch name the 409 `extra-place-required` (problem field `kind`: `USER` or `BRANCH`) and link to the page for `tenant.plan.manage`, or say to ask an administrator | The refusal itself on invite, create, reactivate, branch create and branch reopen, with `kind`, `included`, `inUse` and `capacity` in the problem body (the limits wiring after #538). Until it is deployed the server answers `plan-limit-reached` there and the screens show their general failure. Row 5.6 is answered for plans that offer the add-on: Plan and usage reads its price and state from `GET /v1/settings/plan/extras` `erpAddon` |
| 5.11 | Self-service plan changes on Plan and usage (17 Oct 2026, backend P2-2): "Move to {plan}" on each card, "Switch to yearly/monthly billing" on the own card, the change dialog from `GET /v1/settings/plan/changes/preview`, `POST /v1/settings/plan/changes`, the change waiting for payment with its bill and `DELETE …/{id}`, and "Keep {plan}" on a downgrade already paid for. Answers row 5.1. All of it only while `GET /v1/settings/plan/changes` says `available` | `scheduledChange` on `GET /v1/settings/subscription` carries no `kind` (the plan named `DOWNGRADE` / `CYCLE_TO_MONTHLY`), so a yearly-to-monthly change is recognised by the same plan code with another cycle, and "Keep {plan}" is offered when the change's `effectiveOn` falls inside `paidThrough`. A `kind` on `scheduledChange` (and whether withdrawing it is charged) would let the screen stop inferring both. **Closed by backend #614** (18 Oct 2026): `scheduledChange` now carries `kind` (`DOWNGRADE`, `CYCLE_TO_MONTHLY`, `ENTERPRISE_TERMS`), `paidFor` and `withdrawal` (`FREE`, `KEEP_PLAN`, `NONE`); the screen words the line by `kind` and offers the action `withdrawal` names ("Keep {plan}" only while `available`). The inference stays only as the fallback for a server that sends none of the three |
| 5.12 | "Fawtir is reviewing a refund of the remaining months" on Settings, Subscription after a yearly subscription is cancelled (CA-1, LV-6, RF-1; #252, 21 Oct 2026), read from `refundUnderReview` on `GET /v1/settings/subscription`; shown only when the server sends it | `refundUnderReview: boolean` on the subscription read: true while the super admin is reviewing a refund of a yearly subscription's remaining whole months, false once decided. **Closed by backend #671** (live, 9261d2462); the field name is final |

## 6. Team members (`GET /v1/users`, `GET /v1/users/invitations`)

The four figures and the tabs are drawn again (11 Oct 2026). "With a login", the invitations
waiting and "Two-step sign-in" (people without an authenticator app) are counted from the lists;
the tabs All, Waiting to accept and Without two-step work on them.

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 6.1 | "Signed in this week" (figure and note), the "Last signed in" column, the "Not signed in lately" tab and the "Signed in most recently" sort. Each reads "Not available yet" or cannot be chosen | `lastSignedInAt` on `RecordUserResponse` (and, for the design's second line, the channel: web, mobile or till device, and the branch). Optionally a `signedInSince` filter on `GET /v1/users` |
| 6.2 | "Extra people cost" (what the people beyond the plan's included count cost a month). Reads "Not available yet" | The server's own figure, readable by `admin.users.manage` (the Team screen's permission, not `tenant.plan.read`): for example `extraPeople: {count, monthlyCost}` on the users list or on `GET /v1/settings/plan` with the permission widened. The screen will not compute charges itself |
| 6.3 | The "Removed" tab ("Removed people keep their entries in the activity log, but hold no place"). Cannot be chosen | A list of removed people: a `status=REMOVED` (or `enabled=false`) filter on `GET /v1/users`, and a statement of whether a deactivated person still holds a place on the plan |

## 7. Invite someone (`POST /v1/users/invitations`)

`InviteUserRequest` carries an email and role codes only, and the server refuses unknown members,
so the fields below are drawn disabled and **never sent** (11 Oct 2026).

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 7.1 | "Name" beside the email. Disabled, "Not available yet" | `firstName` and `lastName` (or `displayName`) on `InviteUserRequest`, used in the email and carried to the user created on acceptance |
| 7.2 | "Which branches" (the branches the person works at). Shows "Not available yet" in place of the list | `branchIds` on `InviteUserRequest`, applied on acceptance (see row 3.3 for the branch-side view) |
| 7.3 | "Add a note to the email". Disabled, "Not available yet" | `message` (plain text, up to 500 characters) on `InviteUserRequest`, included in the invitation email |
| 7.4 | "Ask them to set up two-step sign-in". Drawn off, disabled | `requireMfa` on `InviteUserRequest`, so the person is asked to set up an authenticator app at first sign-in |
| 7.5 | "What they'll receive" (the email preview) and "What happens next" (link works for, place taken, charged from). The preview is built from the session and the form and says so; the last three rows read "Not available yet" | (1) A preview of the server's own email: `POST /v1/users/invitations/preview` with the request body, answering `{subject, bodyText}` in the inviter's language. (2) The invitation's lifetime before it is sent (`invitationValidityDays`, the gap between `createdAt` and `expiresAt`), and when a place is taken and charged (on sending or on acceptance) |

## 8. Roles (`GET /v1/roles`)

The permission matrix is drawn again (11 Oct 2026) from each role's `permissionCodes`: every code
any role holds is a row, grouped by what it concerns. The codes are named in words by the screen
(`src/lib/permissionLabels.ts`), never shown raw. The matrix is read-only for now; changing a mark
needs `PATCH /v1/roles/{id}`, which the server has (front-end work, not a backend gap).

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 8.1 | The matrix rows and the permission lists on each role card, named by the screen's own words | A permission catalogue, `GET /v1/permissions` (readable with `role.list`): each code with its group and an English and Arabic name and description. The matrix can then also show permissions no role holds yet, and use the server's wording |
| 8.2 | "Export this as a PDF" beside "Make a role". Drawn disabled, "Not available yet" | `GET /v1/roles/export?format=pdf` (the roles, their holders and the matrix), `role.list` |
| 8.3 | The legend's "Can, but only so far" (a grant with a limit: "own branch", "up to 10%"). Shown with "Not available yet"; no cell uses it | Limits on a grant: a role's permission as `{code, scope}` (for example `BRANCH_OWN`, a discount ceiling), returned on `GET /v1/roles` and accepted on `PATCH /v1/roles/{id}` |
| 8.4 | Make a role / Change a role (21 Oct 2026, wired to `GET /v1/roles/matrix`, `POST /v1/roles`, `PATCH` and `DELETE /v1/roles/{id}`): the switches hide what only Administrators do (RL-5). Neither the matrix nor `GET /v1/permissions` says which codes those are (`assignable` covers platform codes only), so `src/api/settings/roles.ts` mirrors `ReservedPermissions` | **Done (backend #682):** each permission on `GET /v1/roles/matrix` carries `reserved` (true for what only the Administrator does, RL-5). The screen reads `reserved` first (`isReservedInMatrix` in `src/api/settings/roles.ts`) and falls back to the mirrored list only when the field is missing, for a server older than #682 |
| 8.5 | The refusal sentences on saving and deleting a role. "Someone holds this role" (`RoleInUseException`) and "this role code exists" (`DuplicateRoleCodeException`) both answer a bare 409 `resource-conflict`, and "a built-in role can't be changed" (`SystemRoleModificationException`) and a platform code (`PlatformPermissionAssignmentException`) a bare 403 `insufficient-permission`; the screen tells them apart by which request failed | Their own problem slugs: `role-in-use` (with the holder count), `role-code-taken`, `system-role-protected`, `platform-permission` |
| 8.6 | A made role holding an Administrator-only code. `RoleManagementService` refuses one (403 `reserved-permission`) only while branch access is enforced, so today a role can still be saved with one through the API. The screen never offers them and, when changing a role saved with one, says saving takes it away | Refuse Administrator-only codes on company-built roles whatever the branch access switch (RL-5 is not part of branch access), and decide what happens to roles already saved with one |
| 8.7 | Each switch's name and one-line note, in English and Arabic, written by the screen (`permissionLabel.*`, `roles.permNote.*`) because the catalogue's `description` is English only and technical | As 8.1: English and Arabic names and notes on the catalogue |
| 8.8 | The design's limits that cannot be built: "own branch" on reports and earnings, "count only" on stock, "approve only" on supplier bills, the till's "Take a payment" branch note, and the four "owner only" billing switches. Not drawn; the only limits offered are the server's `OWN` (credit notes) and `MAX_PERCENT` (discount on a draft line, offered as 10% and 20%) | Further qualifiers if the product still wants them (`OWN_BRANCH` needs branch-scoped authorization; `COUNT_ONLY` needs stock) |

## 9. Signing in (`GET /v1/users`)

PR #166 removed the policy switches because nothing saved them. They are drawn again, disabled,
each reading "Not available yet" (11 Oct 2026); the page still says these rules are Fawtir's for
now.

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 9.1 | "Require it of everyone" under Two-step sign-in, with how many people would be prompted (counted from the users list). Drawn off, disabled | A tenant security policy: `GET`/`PUT /v1/settings/security` with `requireMfa` (permission `admin.settings.manage`), enforced at sign-in by asking anyone without an authenticator app to set one up |
| 9.2 | "How long a session lasts": on a browser (a day, a week, a fortnight, a month) and on a till device (until the shift ends, a day, don't sign out). Both pickers disabled, "Not available yet" | On the same policy: `browserSessionLength` and `tillSessionLength` (as enums, not ISO durations), applied to the refresh-token lifetime for that kind of client |

## Update 17 Oct 2026: branch access (rows 3.3 and 7.2 answered)

Rows 3.3 and 7.2 are now built against the live API (backend #561 to #581): "Who works there" on a
branch (`GET/PUT /v1/branches/{id}/people`) and "Which branches" on the invitation (`branchIds`).
The same change adds the branches column and the Owner mark on Team members, and a page per person
(`/settings/team/:userId`: role through `PUT /v1/users/{id}/role`, branches through
`PUT /v1/users/{id}/branches`, own grants and denials through `GET/PUT /v1/users/{id}/permissions`,
and the Owner's handover through `POST /v1/settings/owner/handover`). The rows above are kept as
they were (append only).

All of it waits for branch access to be switched on (`FAWTIR_IDENTITY_BRANCH_ACCESS_ENFORCED`, off
in production): while it is off, Invite someone, Team members and a branch's "Who works there" are
drawn exactly as before, the invitation names no branch (the server then gives every branch, BA-6),
and a person's page goes back to Team members. The screens read "on" from `GET /v1/me/entitlements`
(`src/lib/identity/branchAccessSwitch.ts`): `branchAccessEnforced` true, or, for a branch
administrator, `branchAdministrator` true or `allBranches` false. A server without the field reads off.

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 7.6 | Every branch access screen above, for the Owner and Administrators. Their session reads the same whether branch access is on or off (`allBranches` true, `branchAdministrator` false, `featureFlags` empty), so for them the screens stay as they were even once it is on | **Closed by backend PR #616** (Rixon-agency/fawtir-backend): `GET /v1/me/entitlements` carries `branchAccessEnforced: boolean`, true exactly when `FAWTIR_IDENTITY_BRANCH_ACCESS_ENFORCED` is, for every caller. The screens read it; a server before #616 omits it, which reads off |

## Update 22 Oct 2026: switching a person back on (Team members, "Switched off" tab)

"Switch back on" now asks for the person's role, with their old role preselected, and each
switched-off row says when and by whom. The free paid user places on Team members are counted
from `GET /v1/settings/plan/extras` `users` (`paidPlacesNow` less the paid places `inUse` needs
above `included`), so they need nothing new.

| # | Element on the screen | What the backend needs to add |
|---|---|---|
| 6.4 | "Switch back on" dialog: the role picker (job roles from `GET /v1/roles`) and, once branch access is on, the branch picker shared with the invitation. The web sends `POST /v1/users/{id}/reactivate` with `{ "roleId": "<RoleDto.id>", "branchIds": [...] }` (`branchIds` only while branch access is on and the role is not Administrator; no body when no role can be listed) | **Done (backend #683):** the request takes `{roleId?, branchIds?}`. Without `roleId` the role they held is kept; with it, the person comes back holding that one job role under the checks of `PUT /v1/users/{id}/role`. Once branch access is on, `branchIds` replace their branches (absent: kept), at least one is needed (409 `branch-required`) and none for an Administrator (409 `admin-has-all-branches`); both refusals are worded by the screen in English and Arabic (`src/lib/removalRefusals.ts`) |
| 6.5 | "Switched off on {date} by {name}" under each switched-off person, and the old role preselected in "Switch back on". Neither is drawn while absent | **Done (backend #683):** on `GET /v1/users?status=DEACTIVATED` each person carries `deactivatedAt` (instant), `deactivatedByName` (null when unknown) and `previousRoles` (role codes, the same shape as `roles`: what they held when switched off, or the role last retired for an older row; empty when none). Null on every other read. The screen preselects the first held job role by code (Administrator first) |
