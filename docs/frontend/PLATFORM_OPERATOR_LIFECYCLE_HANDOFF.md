# Platform — operator lock, unlock and deactivate handoff (frontend for backend P9 lifecycle)

> **Update 2026-09-14 — backend hardening done.** Every backend ask below is resolved on backend branch `hardening/operator-lifecycle`, commit `d1d05c0f` (not pushed). The frontend now uses the operator path with a reason. See [Backend hardening](#backend-hardening-2026-09-14) at the end. The sections in between record the first delivery as it was.

## Scope

| Delivered | What |
|---|---|
| **Lock sign-in** | In each other operator's row menu. A confirm dialog, then one bodiless POST. The row shows the red **Locked** pill in place |
| **Unlock** | Replaces Lock when the person is locked, whether by an administrator or a failed-sign-in lockout (it clears both). Same dialog pattern, one POST |
| **Deactivate** | Red, last in the menu. One DELETE. The person leaves the team and appears **first** in Deactivated operators (from where the P9 reactivation brings them back with no role) |
| **Never on your own row** | Your row offers Roles and Change sign-in email only |
| **Last administrator** | Mirrors the backend's P4 guard. For the last tenant administrator who can act, the Lock and Deactivate dialogs explain why and disable the confirm button. The backend's `403 last-administrator` gets the same message |

Menu order (approved 2026-09-14):
- Roles, Change sign-in email, Lock sign-in / Unlock
- a divider, then Reset two-step (red)
- a divider, then Deactivate (red)

The icons are the existing Settings menu set: padlock `menu-key` for Lock/Unlock, `menu-sparkle` for Reset two-step (the Settings → Team two-step icon; it was the padlock before), and `menu-remove` for Deactivate.

**Decisions (product owner, 2026-09-14):**
- Build now on the generic endpoints, with UI guards, and record the backend asks.
- Rebuild the local core from backend `main` `e0587424`.
- The menu order above.

| | |
|---|---|
| Frontend | `feat/signup-integration` @ `2e99ca0` — **not committed, not pushed** |
| Backend | `main` = `origin/main` @ `e0587424` (P1–P13), read only. Local core rebuilt from a clean `git archive` of it: image `91d2318e`; rollback tag `fawtir/core:local-pre-e0587424` (= `2117dde5`); database V183; mail to Mailpit |
| Design | existing parts only: `ActionMenu` (`floating`), `Modal`, `Button`, `ConsoleStatusPill`, and the Deactivated section. No CSS, token or layout-system change |
| Prisma | `PRISMA_APPLICABLE = NO` |
| New dependencies | none |

## Backend contract used (verified in source at `e0587424` and live)

| Call | Permission | Answers |
|---|---|---|
| `POST /api/v1/users/{id}/lock` | `admin.users.manage` | **204**. An administrator lock that ends every session, refresh token and pending MFA challenge; audited `IdentityUserLocked`. **403 `last-administrator`** / 404 / 401 |
| `POST /api/v1/users/{id}/unlock` | same | **204**. Lifts an administrator lock or a failed-sign-in lockout; audited `IdentityUserUnlocked` |
| `DELETE /api/v1/users/{id}` | same | **204**. A soft deactivation that ends sessions and devices; audited `IdentityUserDeactivated`. **403 `last-administrator`** / 404 |

No request body, no reason, no response body.

## Behaviour

- **Menu items:** Lock or Unlock is chosen from the row's `locked` field (P9). The backend doesn't refuse your own account, so the screen never offers these on your row.
- **Last administrator:** `isLastTenantAdmin` (enabled, not admin-locked holders, whole team on screen) blocks Lock and Deactivate in the dialog. On a paged team the backend decides and its 403 is shown.
- **One request per action:** a ref guard plus a disabled button.
- **After a 204:**
  - Lock → `locked: true, lockedUntil: null` (the red pill)
  - Unlock → not locked (Active)
  - Deactivate → removed from the team and added to the deactivated list as `enabled: false, roles: []`, which is how the backend lists deactivated people; the list shows it first once opened
  - Nothing is read again
- **Deactivated and then reactivated here:** the reactivation answer replaces any older copy, so the person comes back showing **no role** even though the team was read before (a fix in `withReactivated`, tested).
- **Errors:**
  - `403 last-administrator` → the last-administrator message
  - other 403 → refused
  - 404 → gone
  - 401 → login
  - 429 / network / 5xx → shared messages

## Request counts (measured in the browser)

| Action | Requests |
|---|---|
| Open `/console/operators` | 4, unchanged |
| Lock (double-clicked) | 1 × `POST /users/{id}/lock` (204, CSRF header) |
| Unlock | 1 × `POST /users/{id}/unlock` (204) |
| Deactivate | 1 × `DELETE /users/{id}` (204) |
| Last administrator | 0 (the confirm button is disabled) |

`UNNECESSARY_API_CALLS = 0`.

## Files

| File | Change |
|---|---|
| `src/lib/console/operatorLifecycle.ts` (+ test) | **new**: `changeOperatorLifecycle`, `afterLifecycle`, `describeLifecycleFailure` (P12 `last-administrator`) |
| `src/pages/ConsolePage/operators/LifecycleDialog.tsx` | **new**: confirm dialog for lock, unlock and deactivate |
| `src/pages/ConsolePage/OperatorsPage.tsx` | the menu items; lifecycle state (`statuses`, `deactivatedHere`); dialog wiring |
| `src/pages/ConsolePage/operators/DeactivatedOperators.tsx` | takes `deactivatedHere` and `statuses` from the page (its private "returned" set is gone) |
| `src/lib/console/operatorReactivation.ts` (+ test) | `withReactivated` replaces older copies and places new people only when the whole team is shown |
| `src/pages/ConsolePage/operators.test.tsx` | the `Row actions` expectations; new `Lock, unlock and deactivate (P9)` suite |
| `src/i18n/locales/en.json`, `ar.json` | `console.operators.lifecycle.*` (23 lines each, no reformatting) |

## Security

- **Writes:** only the three calls, `same-origin` with the CSRF header, no body.
- **Safeguards:** never offered on your own row; the last administrator is mirrored and the backend still decides; every action is confirmed.
- **Nothing persisted;** no backend prose is shown.

## Verification

**Automated checks**

| Check | Result |
|---|---|
| Unit + component tests | **590/590** pass (33 files) |
| TypeScript | clean |
| ESLint | clean on every changed file. Whole repo: only the pre-existing `Rial.tsx` error |
| Build | passes |

**Browser run** (Playwright, `:5174`, local core `91d2318e`)

All eight steps passed on the final run. The first run failed only in the harness: a `/login` load took over 15 s on the dev server. The product actions in that run were correct, and the audit trail was complete.

1. **Preparation (harness only):** disposable operator `7651692c…` was reactivated, given a new password through the real reset email, and signed in, giving **1 live session**.
2. **The backend refuses** locking the only tenant administrator (the bootstrap operator): **403 `last-administrator`**. The call was refused, so nothing changed.
3. **Menus (English, 1440 px):**
   - Target: Roles, Change sign-in email, Lock sign-in, Reset two-step, Deactivate.
   - Own row: Roles, Change sign-in email.
4. **Lock (double-clicked):** 1 POST (204). The Locked pill and the notice showed. Database: `account_non_locked=f`, no expiry, **0 sessions**.
5. **The target's own tab** dropped to `/login`. **Signing in while locked: 401**, and the page stayed on `/login`.
6. **Unlock:** 1 POST (204). The Active pill showed; the database shows unlocked. **The target signed in again** and reached `/dashboard`.
7. **Deactivate (Arabic, 390 px):**
   - 1 DELETE (204); the person left the team.
   - Deactivated operators listed them **first**; the Arabic notice showed; RTL, no overflow.
   - Database: `deleted=t`, `enabled=f`, 0 sessions.
   - Audit: `IdentityUserLocked, IdentityUserUnlocked, IdentityUserDeactivated`.
8. **The target's tab** dropped to `/login`.

The run had no page errors, no console errors, no unexpected writes, and no secrets in the report.

**Local data:** the disposable operator ends deactivated, as it started (with a new harness password).

## Backend asks (documented, not fixed — owner chose frontend-first)

*All four are resolved by the backend hardening below.*

1. **Self-refusal:** lock and deactivate don't refuse the caller's own account. An admin can lock themselves out whenever another admin exists. The UI hides it; the backend should refuse it (`own-account-refused`).
2. **Operator path:** lock, unlock and deactivate for PLATFORM tenants go through the generic `/users` path with `admin.users.manage` only.
   - Every other operator change requires `platform.operators.manage`, a fresh MFA check and a reason; that includes reactivation, the undo of deactivation.
   - Recommended: `POST /platform/operators/{id}/lock|unlock|deactivate` with those fences, and refuse the generic path in PLATFORM tenants, as P7 and P10 did.
3. **No reason is recorded** in these audit events.
4. **Deactivation doesn't revoke** invitations the person sent, or their API keys (from the contract review).

## Next slice (needs authorisation)

- ~~Switch to the operator lifecycle path once backend ask 2 exists.~~ Done in the hardening below.
- Remaining open items across the operator slices: same-name accessible labels, the email-change link and pending-read backend asks, and copy approval.

## Backend hardening (2026-09-14)

**Where it lives:** backend `D:\fawtir`, branch **`hardening/operator-lifecycle`**, commit **`d1d05c0f`**, on top of `main` `e5b1ec2f` (P1–P13 plus certification tooling). **Not pushed.**

The commit was built without moving `main`'s checkout, because another session commits to `main` in the same working tree. The same changes are also still present, uncommitted, in that checkout.

### What changed

| Area | Now |
|---|---|
| **Operator endpoints** | `POST /api/v1/platform/operators/{userId}/lock`, `…/unlock`, `…/deactivate`, each with body `{ "reason": string }` (`@NotBlank`, at most 280). Answer 204 |
| **Authorisation** | `platform.operators.manage`, checked both at the controller and in the service |
| **Other fences** | Never from an impersonation session (403); an MFA-verified session (`requireMfaVerified`, 401 otherwise); the production PLATFORM realm |
| **Generic path** | `POST /users/{id}/lock`, `…/unlock` and `DELETE /users/{id}` refuse **every PLATFORM tenant** with `403 platform-operator-path-required`, as the generic invitation, MFA reset and reactivation already did. Customer users are unchanged apart from the own-account refusal |
| **Own account** | Refused on **both paths** with `403 own-account-refused`: operator lock, unlock and deactivate; generic lock and deactivate (and generic unlock of yourself, a no-op until now). The last-administrator guard still runs first, so the only administrator locking themselves keeps `403 last-administrator` (the P12 contract) |
| **Reason** | Trimmed, required, at most 280 characters; recorded in the audit event |
| **Audit** | One event per action through the single `IdentityAuditService` path, carrying actor, tenant, target, time, IP and user agent (from the request context), and metadata: `PlatformOperatorLocked` {`username`, `reason`, `revokedSessions`}; `PlatformOperatorUnlocked` {`username`, `reason`, `wasLocked`}; `PlatformOperatorDeactivated` {`username`, `reason`, `revokedSessions`, `invitationsRevoked`}. The generic events keep their names; `IdentityUserDeactivated` gains `revokedSessions` and `invitationsRevoked`. Refusals are not audited, matching the P10 MFA reset. The catalogue in `docs/identity/audit-events.md` is updated, and the operator events are on the WARN review list |
| **Invitations** | Deactivation, on both paths, revokes every invitation the person sent that is still open. They're marked revoked by the administrator, never deleted, so history stays. An invitation carries the inviter's authority from when it was sent, so it shouldn't outlive them |
| **API keys** | **Deliberately unchanged.** They're the tenant's integration credentials (`ApiClient` plus scopes); the principal carries no user and their authority doesn't come from the creator. Revoking them would break the tenant's integrations without reducing the deactivated person's access. A platform tenant can't hold keys anyway (the plan gate). Proven by a regression test |
| **Structure** | What each action does to the account lives once, in `AccountLifecycle`, shared by both paths; each path keeps its own fences and audit event |
| **Contract docs** | `openapi.yaml` gains the three operator paths; the generic entries document the new refusals |

**MFA freshness.** The platform's own re-assertion for operator-changing actions is `requireMfaVerified()`, used by roles, email change, reactivation and MFA reset. It means the live session passed MFA at sign-in, and the session's idle and absolute expiry bound its freshness. No per-action freshness window exists in the platform. The only step-up mechanism (`MfaStepUpProof`, password plus TOTP or recovery code) is for authenticator replacement, and operators who sign in with email codes can't satisfy it. So the hardening reuses `requireMfaVerified()` rather than inventing a second mechanism. What's tested: no MFA → 401; ended session → 401; impersonation → 403; verified live session → 204.

**Frontend contract change (minimal, no visual change).**
- `changeOperatorLifecycle(user, action, reason)` now sends `POST /v1/platform/operators/{id}/{action}` with `{ reason }`.
- `LifecycleDialog` is now a thin wrapper around the shared `OperatorReasonDialog`, which gained an optional `blockedNote` for the last-administrator case (the note is shown, the reason field hidden, confirm disabled).
- A 400 maps to the shared reason message.
- The menu, the one request per action, the live row update, Arabic/RTL and the last-admin messaging are unchanged.

### Tests

**Backend**

| Check | Result |
|---|---|
| Baseline before any change | **99/99** across 14 classes |
| `PlatformOperatorLifecycleIntegrationTest` | **new, 12/12**, through the real HTTP, security, permission and audit chain: lock, unlock and deactivate succeed with one audit event each (actor, tenant, target, time, IP, reason); own-account refusals on both paths; the generic path refuses operators; `admin.users.manage` alone (a custom role), `PLATFORM_SUPPORT` and a customer admin are refused; no MFA 401; ended session 401; impersonation 403; blank, missing and 281-character reasons 400; cross-tenant and unknown 404; open invitations revoked while accepted and others' are untouched; API keys unchanged |
| `UserAdministrationServiceTest` | 11/11 (+4: own account, last-administrator precedence, platform refusal, invitation revocation) |
| Focused suites | lifecycle, last-admin, problem-type, reactivation (its operator deactivation now uses the operator path), MFA reset, invitations, plus the audit-catalogue, refusal-type, OpenAPI and RBAC guards: **122 tests pass** |
| Full core suite | **7,715 tests, 0 failures, 2 errors, 51 skipped**. The 2 errors are `Pkcs11SoftHsmSigningIntegrationTest` and `OxalisPkcs11As4SigningIntegrationTest`, both "SoftHSM is not installed": the recorded environment baseline, unrelated |

**Frontend**

| Check | Result |
|---|---|
| Unit + component tests | **591/591** |
| TypeScript | clean |
| ESLint | clean on changed files (the pre-existing `Rial.tsx` error is unchanged) |
| Build | passes |

### Browser verification

Run against a local core `87a2588d` built from `e0587424` plus exactly this change (rollback tag `fawtir/core:local-pre-olc`); mail to Mailpit.

| Check | Result |
|---|---|
| Self-lock while the only admin | `403 last-administrator` |
| After a second admin exists: self lock, deactivate and unlock | `403 own-account-refused` each |
| Generic lock and deactivate on an operator | `403 platform-operator-path-required` |
| Blank reason | API 400; the UI sends **0 requests** and moves focus to the reason field |
| Menus | target: Roles, Change sign-in email, Lock sign-in, Reset two-step, Deactivate; own row: Roles, Change sign-in email |
| Lock (double-clicked) | **1 POST** carrying only `{reason}` (204); the Locked pill; database locked with 0 sessions; the target's tab dropped to `/login`; **sign-in while locked: 401** |
| Unlock | 1 POST (204); the Active pill; **the target signed in again** |
| Deactivate (Arabic, 390 px) | 1 POST (204); left the team and listed first as deactivated; RTL, no overflow; 0 sessions; **the invitation the target had sent was revoked, row kept**; the target's tab dropped to `/login` |
| Audit | `PlatformOperatorLocked`, `…Unlocked` and `…Deactivated` each carry the reason; Deactivated has `invitationsRevoked=1` |
| Reactivation | the target held `PLATFORM_TENANT_ADMIN` while deactivated; reactivation answered roles `[]` and retired the row |
| Clean run | no page errors, no console errors, no unexpected writes, no secrets in the report |
| Cleanup | the target is deactivated again with no active roles; its revoked invitation row stays, as history |

### Remaining known items

- **Push/PR:** push `hardening/operator-lifecycle` and open a PR. The branch is based on `e5b1ec2f`; `origin/main` is one docs-only commit ahead.
- **Frontend commit:** this slice isn't committed. Its files sit among roughly 85 uncommitted files from every earlier slice on `feat/signup-integration`, so a focused commit needs the slice-by-slice commit plan.
- **Copy approval:** product needs to approve the reason prompt.
- Earlier open items stand (same-name accessible labels, email-change link).
