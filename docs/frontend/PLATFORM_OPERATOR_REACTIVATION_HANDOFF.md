# Platform — operator reactivation handoff (frontend for backend P9)

## Scope

This slice follows the backend P9 work: lifecycle audit, lock state, and reactivation. On the backend that work is **not committed yet**; it sits in the `D:\fawtir` working tree on top of `main` `b265fd88`.

| Delivered | What |
|---|---|
| **Deactivated operators** | A section under Pending invitations. It is read **only when asked for**, via a "Show deactivated operators" button, and has a **Reactivate** action on each person |
| **Reactivate dialog** | Asks for a required reason (1–280 characters) and says what reactivation does and doesn't bring back |
| **After reactivation** | The person moves into the team list in place, with **no platform role**. A notice is shown and the existing Roles dialog opens for them. A role is still a separate, confirmed grant on the P2 path |
| **Lock state** | A "Locked" pill in the team table: danger tone for an administrator's lock, pending tone plus "Unlocks …" for a lockout after failed sign-ins |
| **P4 alignment** | The last-tenant-administrator check now leaves out admin-locked holders, exactly as `LastAdministratorGuard` does |

Not in scope:
- **Customer-user reactivation** (`POST /users/{id}/reactivate`): the frontend has no integrated customer user-management screen to host it.
- **Lock, unlock and deactivate buttons:** not requested.

**Decisions (product owner, 2026-09-14):**
- The list loads on demand.
- The Roles dialog opens after a reactivation.
- The lock pill and the guard fix are included.
- Local verification runs against a core built from the current backend working tree.

| | |
|---|---|
| Frontend | `feat/signup-integration` @ `2e99ca0` — **not committed, not pushed** |
| Backend | `main` @ `b265fd88` + **uncommitted** P9/P10 work (read only from here). This slice needs that P9 work to be merged before it ships |
| Design | composed only of existing parts: the Pending-invitations section/table, `Modal`, `Input` (with hint), `Button`, `ConsoleStatusPill`. No CSS, token or global layout change |
| Prisma | `PRISMA_APPLICABLE = NO` |
| New dependencies | none |

## Backend contract used (verified in source and live)

| Call | Permission | Answers |
|---|---|---|
| `GET /api/v1/users?status=DEACTIVATED&page=0&size=50&sort=deletedAt,desc` | `admin.users.manage` | a page of `RecordUserResponse`, each with `enabled:false` and `roles:[]`. Any other `status` gets a 400; no `status` returns the active list, unchanged |
| `POST /api/v1/platform/operators/{id}/reactivate` with body `{ "reason": string }` | `platform.operators.manage` plus a fresh MFA check; production PLATFORM realm; never from impersonation | **200** `RecordUserResponse`, active and with no roles. **400** blank or over-long reason. **401** session or MFA. **403** refused. **404** not a deactivated operator here. **409** already active |
| `RecordUserResponse.locked` / `lockedUntil` (every user read) | — | `locked` is true while sign-in is refused. `lockedUntil` is `null` for an administrator's lock and the end time for a failed-sign-in lockout |

What the backend does on reactivation, and what the UI therefore tells the operator:
- Username, email, password and MFA are kept, and so is any administrator lock.
- No session is created, and old sessions stay revoked.
- **Every role row is retired.**
- An `ACCOUNT_REACTIVATED` notice is emailed, with no link or code.
- It is audited as `PlatformOperatorReactivated` (with the reason); refusals as `UserReactivationRefused`.

## Behaviour

- **Loading:** the page still makes its three reads on load. "Show deactivated operators" adds one GET, and a failed read offers a retry without disturbing the team.
- **Validation:** the reason is required. A blank one is refused before sending, and focus moves to the field. `maxLength=280` mirrors `@Size(max = 280)`, and the value is trimmed before sending.
- **One request per action:** a ref guard plus a disabled button give one reactivation per confirmation. Double-click, Enter spam and overlapping submits were tested, including in the browser.
- **On success:**
  - the row leaves the deactivated list
  - with the whole team on one page, the person is placed by `createdAt`, parsed as an instant because Instants serialise with varying fraction digits
  - with a paged team, they aren't placed on the current page, but the Roles dialog still opens for them
  - nothing is read again
- **Errors are mapped by status, never by message:**
  - 400 → reason
  - 409 → "already active, reload"
  - 404 → "no longer deactivated, reload"
  - 403 → the shared refusal
  - 429, network, timeout and 5xx → shared messages
  - 401 → forget entitlements and go to `/login`

  Backend prose is never shown.
- **Lock display:** "Sign-in off" (disabled) wins over "Locked", which wins over "Active".

## Request counts (measured in the browser)

| Action | Requests |
|---|---|
| Open `/console/operators` | `GET /me/entitlements`, `GET /users` (team), `GET /users/invitations?PENDING`, `GET /users/invitations?EXPIRED`: **no deactivated read** |
| Show deactivated operators | 1 × `GET /users?status=DEACTIVATED…` |
| Blank reason | 0 |
| Reactivate (double-clicked) | 1 × `POST /platform/operators/{id}/reactivate` (200, CSRF header) |
| Closing the Roles dialog afterwards | 0 |

`UNNECESSARY_API_CALLS = 0`.

## Files

| File | Change |
|---|---|
| `src/lib/console/operatorReactivation.ts` | **new**: list path, `reactivateOperator` (whitelisted `{reason}` body), `withReactivated`, `describeReactivateFailure` |
| `src/lib/console/operatorReactivation.test.ts` | **new** |
| `src/pages/ConsolePage/operators/DeactivatedOperators.tsx` | **new**: the on-demand section |
| `src/pages/ConsolePage/operators/ReactivateOperatorDialog.tsx` | **new**: reason dialog. *Since the P10 slice, a thin wrapper around the shared `OperatorReasonDialog`; see `PLATFORM_OPERATOR_MFA_RESET_HANDOFF.md`* |
| `src/lib/console/platformOperators.ts` | `PlatformUser` gains `createdAt`, `locked`, `lockedUntil`; adds `isAdminLocked`; `isLastTenantAdmin` excludes admin-locked holders |
| `src/pages/ConsolePage/OperatorsPage.tsx` | lock pill; the deactivated section; merges reactivated people and opens their Roles dialog |
| `src/lib/console/platformOperators.test.ts`, `src/pages/ConsolePage/operators.test.tsx` | fixtures gain the new fields; `Lock state (P9)` and `Deactivated operators (P9)` suites |
| `src/i18n/locales/en.json`, `ar.json` | `console.operators.status.locked`, `lockedUntil`, `deactivated.*`, `reactivate.*` (26 lines each, no reformatting). *Since P10 the reason label, hint and 400 message live in the shared `console.operators.reason.*`* |
| `docs/frontend/PLATFORM_OPERATOR_INVITATIONS_HANDOFF.md` | its P9 notes now point here |

## Security

- The only write is the reactivation POST. It uses `credentials: 'same-origin'`, and `apiRequest` adds `X-CSRF-Token`.
- The body is exactly `{ reason }`; no UI state is sent.
- Nothing is persisted (no storage, no URL state). The reason lives in component state only.
- Roles are never granted implicitly. The screen relies on the backend retiring them and offers a grant only through the confirmed P2 dialog.
- Permission gating is unchanged (`admin.users.manage` + `platform.operators.manage`); the backend decides every call.
- A stale list can't reactivate twice: the second attempt gets 409 (proven live), and the refusal is audited.

## Verification

**Automated checks**

| Check | Result |
|---|---|
| Unit + component tests | **505/505** pass (27 files); the operators file has 65, including 16 new P9 cases |
| TypeScript (`tsc -b`) | clean |
| ESLint | clean on every changed file. Whole repo: 1 error in `src/components/ui/Rial.tsx`, **pre-existing** (same as the 2026-09-12 baseline), not touched |
| Build | passes (the existing >500 kB chunk warning is unchanged) |

**Browser run** (Playwright, `:5174`, real local stack; core `2117dde5` built from the backend working tree, mail to Mailpit)

Every step passed:
- **Load:** no deactivated read.
- **Show:** 1 GET, 4 rows, all `roles: []`, most recently deactivated first.
- **Blank reason:** 0 requests, focus on `reason`.
- **Double-clicked Reactivate:** 1 POST (200) with body `{reason}`.
  - Database afterwards: `deleted=f, enabled=t`, **0 active roles**, the 1 former `PLATFORM_SUPPORT` row retired.
  - Audit: 1 `PlatformOperatorReactivated` row.
  - The Roles dialog opened offering a grant; the notice showed.
- **After closing the dialog:** 0 requests. The row is in the team as "Active / No platform role" and is gone from the deactivated list.
- **Notice email:** arrived, with no link and no code, and says the previous access was not restored.
- **Stale tab (Arabic, 390 px):** POST 409, Arabic message, RTL, no overflow, 1 `UserReactivationRefused` audit row.
- **English 390 px and Arabic 1440 px:** no overflow; correct text direction.
- **Lock pill:** the harness locked the account (204), the reload showed "Locked" with no "Unlocks" line, and the harness unlocked it (204).
- **Clean run:** no page errors, no console errors, no unexpected writes.

**Local data changed:**
- Disposable operator `ee1c52d3…` was reactivated, locked, unlocked and **deactivated again**.
- Its old `PLATFORM_SUPPORT` row stays retired, which is the backend's intended effect.

## Open items

- *Update 2026-09-14: P9 is merged into backend `main` (`e0587424`, pushed), so this item is done.*
- **Backend P9 must be merged** before this ships. Against `b265fd88`:
  - the deactivated list and reactivate call don't exist
  - `locked` and `lockedUntil` are absent (read as falsy, so there is no pill and the guard falls back to enabled-only)
- **Same display names:** people with identical names get identical accessible names ("Reactivate X", and the existing "Roles for X"). The username is shown under the name but isn't part of the label. Worth fixing across the team table and this list together.
- **The invite dialog** (earlier slice) doesn't move focus to its field on a failed submit. This slice's dialog does.
- **Copy approval:** product needs to approve the reactivation email and the new UI text.
- **P11:** the backend working tree also holds another session's in-progress P11 CSRF changes, which were built into the local core used here.

## Next slice (needs authorisation)

- Slice 2 — two-step operator email change (P8), unchanged from the invitations handoff.
- P10 admin MFA reset UI (`POST /platform/operators/{id}/mfa-reset`).
- Lock / unlock / deactivate actions for operators, if product wants them on this screen.
