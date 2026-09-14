# Platform — Operators handoff

## Scope

The console's **Operators** screen (`/console/operators`) lists the platform team — Fawtir's own
operators — and lets a platform tenant administrator **give or remove the two platform roles**:
- `PLATFORM_TENANT_ADMIN` ("Tenant administration")
- `PLATFORM_SUPPORT` ("Support")

**Decided with the product owner (2026-09-12):**
- **Scope:** roles only. Adding an operator (`POST /users`) and moving an operator's email (`PUT /platform/operators/{id}/email`) are separate slices.
- **Placement:** a new **Operators** item under "The platform" in the console sidebar, at `/console/operators`. The layout was approved as previewed: the team table with a Roles button per row, a roles dialog, and a confirmation for every change.
- **Self-removal:** allowed, as the backend allows it, with a warning. Removing your own Tenant administration ends your access to the screen.
- **Local verification:** used disposable local operators.

**Not in scope:**
- creating operators, changing an operator's email, locking or unlocking, deactivating
- Peppol TEST roles
- tenant settings

| | |
|---|---|
| Frontend branch | `feat/signup-integration` (not committed, not pushed) |
| Frontend base / current HEAD | `2e99ca0` (`main`); no commits made |
| Backend | `D:\fawtir` @ `94cde817`, read only; **no backend code or config change** |
| Prisma | not used — `PRISMA_APPLICABLE = NO` |
| New dependencies | none |

## API contracts (verified in backend source and live)

| Endpoint | Authority | Behaviour |
|---|---|---|
| `GET /api/v1/users?page&size&sort` | `admin.users.manage` | The caller's own tenant — here the platform tenant. A Spring `Page` (`content`, `totalElements`, `totalPages`, `number`, `size`). Each user carries `id`, `username`, `email`, `firstName`, `lastName`, `enabled` and `roles` (active assignments only). Deactivated (deleted) users are not listed |
| `POST /api/v1/platform/operators/{userId}/roles/{roleCode}` | `platform.operators.manage` (`@PreAuthorize`) | Grants one role; no body. Returns `200 {userId, platformRoles[]}`. **See gap 1: the reply can omit the granted role** |
| `DELETE /api/v1/platform/operators/{userId}/roles/{roleCode}` | same | Revokes one role. Returns `200 {userId, platformRoles[]}` |

Only `PLATFORM_TENANT_ADMIN` holds both codes, so the screen requires both; a support-only
operator sees "No access".

**Service fences** (`PlatformRoleAssignmentService`):
- MFA re-assertion. A portal cookie session counts as MFA-verified.
- Production platform tenant only.
- **No self-grant** → `403`.
- **Catalogue codes only.** Anything else → `500 internal-error` (`IllegalArgumentException`).
- **The last `PLATFORM_TENANT_ADMIN` cannot be revoked** → `403`. Counted over users not deleted.
- The target must be a user of the platform tenant; an unknown or deleted user → `404 resource-not-found`.
- Every change writes an audit event (`PlatformRoleGranted` / `PlatformRoleRevoked`).

**Refusals proven live:**

| Case | Result |
|---|---|
| Self-grant | `403 insufficient-permission` |
| Removing the last tenant admin | `403 insufficient-permission` |
| Non-catalogue code (`PLATFORM_OPERATOR`) | `500 internal-error` |
| Change to a deactivated user | `404` |

## Behaviour

| Piece | Behaviour |
|---|---|
| Access | `ConsoleShell requires={['admin.users.manage', 'platform.operators.manage']}`. The shell's `requires` now takes one code or several, all required. Permission codes only, never role names |
| Read | One `GET /users?page=N&size=50&sort=createdAt,asc`. Page size 50 puts the whole team on one page; a pager (`?page=`) appears only beyond that. Ordered by creation because names are stored only as ciphertext (the plain columns are empty), so a name sort would be meaningless |
| States | Loading; failed (`403` → "No access", never an empty list; anything else offers Retry; `401` → Login); empty; past-the-end page; loaded |
| Row | Name (or the username when there is none), username, email, Active / Sign-in off, platform roles in the reader's language, any other role codes as data, and a **Roles** button. The signed-in operator is marked **You**. Usernames and emails are `<bdi>`-isolated for RTL |
| Roles dialog | Both roles, each with its description, a Held / Not held pill, and Give or Remove |
| Not offered | Giving the signed-in operator a role: "Another operator must give you this role." Removing the **last** tenant administration: "The platform must keep at least one person with tenant administration." The last-admin check needs the whole team on screen; if it spans pages, the backend's `403` decides |
| Confirmation | Every change is confirmed first: title, the role's effect, the consequence. Removing your own role warns that only another operator can give it back; for Tenant administration, that you lose this screen |
| After a change | One `POST`/`DELETE`. The row is updated from the reply **with the accepted change applied on top** (`rolesAfter`; see gap 1), a status notice announces it, and the list is **not** re-read |
| Your own roles | After changing them, the shell forgets the cached entitlements and asks again (`useRefreshConsoleAccess`), which re-reads the list too — or ends at "No access" if you removed your Tenant administration. Stale cached authority would otherwise keep offering what the backend now refuses |
| Double submit | Guarded by an in-flight ref and disabled buttons: one request per confirmation |
| Errors | `403` → one localized message covering all three causes (never the English detail). `404` → "no longer on the platform team, reload". `401` → Login. `429` / `5xx` / network / timeout → the shared localized messages. The confirmation stays open |

## Request counts (measured in the browser)

| Action | Requests |
|---|---|
| Open from the console sidebar (entitlements cached) | **1** — `GET /users` |
| Direct load / refresh | **2** — `GET /me/entitlements`, `GET /users` |
| Give or remove a role (double-clicked) | **1** — `POST`/`DELETE` with `X-CSRF-Token` |
| Change one of **your own** roles | **3** — the change, then `GET /me/entitlements` and `GET /users`, because your authority changed |
| Opening the dialog, Back, Cancel, blocked actions | **0** |
| Polling | **0** |

## Files (this slice)

**New:**
- `src/lib/console/platformOperators.ts` — permissions, the role catalogue, types, `operatorsPath`, `displayName`, `changePlatformRole`, `rolesAfter`, `withPlatformRoles`, `isLastTenantAdmin`, `describeRoleChangeFailure`.
- `src/lib/console/platformOperators.test.ts`.
- `src/layouts/ConsoleShell/consoleAccessRefresh.ts` — the context through which a screen asks the shell to re-check access.
- `src/pages/ConsolePage/OperatorsPage.tsx`.
- `src/pages/ConsolePage/operators/RolesDialog.tsx`.
- `src/pages/ConsolePage/operators.test.tsx`.

**Modified:**
- `src/layouts/ConsoleShell/ConsoleShell.tsx` — `requires` accepts several codes; provides the access refresh.
- `src/lib/consoleNav.ts` — the Operators item. It reuses the people icon, the same as Tenants; **design may want its own icon**.
- `src/App.tsx` — the route.
- `src/pages/ConsolePage/index.ts` — the export.
- `src/i18n/locales/en.json`, `ar.json` — `console.nav.operators`, `console.operators.*`.

## Security

- Gated on permission codes; the backend enforces every request.
- Role codes come only from the catalogue constant; nothing user-typed reaches the URL. The user id is `encodeURIComponent`-ed.
- Writes carry the CSRF double-submit header and no body.
- Nothing is stored in local or session storage, URLs or logs. Emails are shown only to the administrators the backend lets read them.
- Backend English (`detail`) is never rendered.
- Self-grant and last-admin removal are blocked in the UI and by the backend.
- After a self-change, cached authority is dropped at once.

## Verification

**Automated:**
- 435 vitest tests in total, 45 of them this slice's (33 page, 12 unit). They cover:
  - access (either permission missing, a role name alone, `403`, `401`)
  - the team (You marker, username fallback, disabled person, non-catalogue role, loading, empty, retry, pager, Arabic)
  - the dialog (held/not held, self-give blocked, last admin blocked or left to the backend)
  - changes (exact `POST`/`DELETE` with CSRF and no body, no re-read, other roles kept, the first-time-grant reply defect, double confirm, Back)
  - errors (`403`, `404`, `429`, `500`, network, `401`)
  - self-changes (warning, entitlements re-asked, "no access" afterwards, fresh list)
- The first-time-grant test was mutation-checked: it fails without `rolesAfter`.
- `tsc -b` clean, eslint clean on the changed files, `vite build` OK.
- **Full-suite stability on this machine:** one default run and two 6-worker runs passed 435/435. Other full runs each failed 1–4 *different*, unrelated tests on async-wait or real-time timeouts (Plans, Login code, Signup, Operators), all of which pass when their file runs alone. The host sat at 68% CPU with no tests running (IDE, Docker/Java, browsers), so this is classed as environmental load; the test configuration was left unchanged.

**Real browser, local backend:**
- Playwright on `:5174` → gateway `:18080`, bootstrap operator, real email-code sign-in via Mailpit.
- Harness: scratchpad `operators-verify.mjs`, final run 16/16 steps.

| Check | Result |
|---|---|
| Sidebar → Operators (EN 1440) | 1 request |
| Direct load: EN 1440, EN 390, AR 390, AR 1440 | 2 requests each; `dir` ltr/rtl; no horizontal overflow; dialog on AR 390 without overflow |
| Own roles dialog | Remove Tenant administration disabled with the last-admin note; Remove Support enabled (not clicked) |
| Remove Support from the test operator, double-clicked | 1 `DELETE` (+CSRF); row "No platform role"; DB matched |
| Give Support | 1 `POST`; DB matched |
| Give Tenant administration (first time) | 1 `POST`; the row shows it and your own Remove becomes enabled (no longer last admin); DB matched |
| Remove Tenant administration, AR 390 | 1 `DELETE`; DB matched |
| Stale row after the test operator was deactivated elsewhere | real `404` → "no longer on the platform team" |
| Reload | a deactivated user is not listed |
| Sign out, then open `/console/operators` | `/login` |
| Page errors / console errors / unexpected writes | 0 / 0 / 0; your own roles unchanged throughout |

## Local data changed by verification

- **Three disposable `@example.test` users** were created in the local platform tenant (`POST /users`, `roleCodes: [PLATFORM_SUPPORT]`), their roles changed, and each deactivated. Their verification and welcome emails went to Mailpit.
  - Two ended with **no roles**.
  - The first (`ee1c52d3…`) was deactivated by an earlier run **before** its roles were cleared. It keeps an active `PLATFORM_SUPPORT` assignment the API can no longer remove (`404`; see gap 4). It is inert: the user is deleted, cannot sign in, and is excluded from the last-admin count.
- Audit rows for those grants, revokes and creations.
- One `500` (ERROR log) from the deliberate non-catalogue-code probe.
- A few harness sign-in sessions from debug runs were not signed out; they expire.
- The bootstrap operator's roles are **unchanged** (`PLATFORM_SUPPORT`, `PLATFORM_TENANT_ADMIN`).
- Nothing on TEST or production.

## Backend gaps (documented, not fixed)

1. **The grant reply omits a role granted for the first time.** `changePlatformRole` reads the user with authorities before the grant, and the reply re-reads the same managed entity. A new `UserRoleEntity` is not in its cached collection; a revived soft-deleted row is.
   - Proven live: first grant of `PLATFORM_TENANT_ADMIN` → reply `[PLATFORM_SUPPORT]`, while the database and `GET /users/{id}` both have both roles. Re-grants and revokes reply correctly.
   - The frontend compensates with `rolesAfter`.
   - Fix: clear or refresh the persistence context, or query the assignments afresh.
2. **One `403` for three causes** — missing permission, self-grant, last admin — told apart only in English `detail`. Distinct problem types would let the UI explain precisely.
3. **A non-catalogue role code answers `500`**, and so does a wrong realm (`IllegalArgumentException`). It should be `400`/`404`.
4. **Deactivating a user (`DELETE /users/{id}`) leaves their role assignments active**, and the role API then answers `404` for them, so the rows can no longer be cleaned through any API.
5. **The last-admin fence counts disabled (locked) holders.** The last *usable* tenant administrator can be removed while a locked one remains.
6. **`POST /users` with `roleCodes` can hand out platform roles**, including the legacy `PLATFORM_OPERATOR` (holding `platform.tenants.manage`). This bypasses the operator-role API's no-self-grant rule and its dedicated audit event. The backend Javadoc acknowledges the `admin.users.manage` route as an accountability control.
7. **A platform user created without `roleCodes` gets the default `VIEWER`, which the platform tenant does not have**, so creation would fail (code reading; not exercised).
8. **No dedicated operators list.** The screen uses the generic `GET /users` and needs `admin.users.manage`.
9. **The platform tenant carries a legacy `PLATFORM_OPERATOR` role** outside the catalogue. The screen shows such roles read-only.
10. **`mfaEnabled` is `false` for an operator under mandatory EMAIL_OTP.** The screen does not show it, because it would mislead.

## Pre-existing work preserved

All earlier uncommitted slices on this branch are untouched. The shell change only widens
`requires` (a string still works) and adds a context; Verification and Plans behave as before.

## Next recommended slice (needs separate authorisation)

- **Adding a platform operator is BLOCKED on the backend.** The product owner chose invitation-based onboarding and ruled out direct creation and password sharing (2026-09-12). The required backend work (R1–R8) is in `PLATFORM_ADD_OPERATOR_BACKEND_REQUIREMENTS.md`.
- Moving an operator's email (`PUT /platform/operators/{id}/email` — `expectedCurrentEmail` and a reason; revokes sessions) remains a candidate, pending authorisation.

## Post-integration checklist

- [ ] Design: its own nav icon for Operators (it currently shares the people icon with Tenants).
- [ ] Backend: gap 1 (grant reply), then gaps 2–5.
- [ ] Optional local tidy-up: the orphaned `PLATFORM_SUPPORT` assignment on the first disposable user (gap 4).
- [ ] Commit and push only when authorised.
