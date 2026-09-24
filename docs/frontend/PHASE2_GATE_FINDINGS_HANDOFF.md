# Phase 2 browser-gate findings — fixes

Closes the three findings the real-browser gate of 24 September 2026 left open. Spans both repos:
the refusal taxonomy and the workspace name needed backend work, the console gate did not.

## Repo state

| | backend | frontend |
|---|---|---|
| repo | `D:\fawtir` (worktree `D:\fawtir-fix-findings`) | `D:\fawtir-frontend` (worktree `D:\fawtir-frontend-p2v`) |
| branch | `fix/phase2-gate-findings` | `fix/phase2-gate-findings` |
| base | `origin/main` `e63e7179` | `origin/main` `11e2d6e` |
| committed | no | no |

## F1 — a refused address was reported as a refused transport-settings document

`CONNECTION_CONFIGURATION_INVALID` covered four unrelated causes (the endpoint's shape, the source
name/version bounds, and the transport-settings document). The portal turns a refusal code straight
into one sentence, so pasting `https://user:pass@erp…` produced *"The transport settings were not
accepted. They must be a JSON object…"* — the wrong field.

Backend (`core`):
- `ErpConnection` now owns two codes. `CONNECTION_ENDPOINT_INVALID` for the endpoint's length and
  its userinfo; `CONNECTION_VALUE_INVALID` (the existing code, previously only for unparseable
  enums) for the source name/version bounds. `CONNECTION_CONFIGURATION_INVALID` is left meaning
  only the `configuration` document.
- `ErpConnectionService.CODE_INVALID_VALUE` now names the domain constant, so there is one source.
- `ErpRestExceptionHandler` needed no change: unknown codes already fall to `400` and the code is
  echoed as the problem's `code`. Its comment was corrected.
- `openapi.yaml`: both ERP write operations list the new code.

Frontend:
- `ErpRefusal` gains `ENDPOINT_INVALID`; `REFUSAL_BY_CODE` maps the new code; `en`/`ar` copy added
  under `erp.connections.refusal`.

## F2 — the sidebar workspace card named the same fake company for every tenant

Backend:
- `/me/entitlements` gains `tenantName`, joined into the existing projection as an ad-hoc LEFT
  entity join (`left join TenantEntity t on t.id = u.tenantId`), so the response still costs one
  statement. Nullable: RLS (`tenant_visibility`) hiding the row costs the name, not the response.

Frontend:
- `Entitlements.tenantName?: string | null`.
- `AccountSwitcher` renders `branch?.name ?? session?.tenantName ?? ACCOUNTS[0].name`. The branch
  popover is unchanged design-time data; picking one still changes this label and nothing else.

**Deviation from the agreed shape, deliberate:** `planName` was *not* added. The plan label comes
from `useTenantPlan()`, a client-side store with `PLAN_GATING_ENABLED = false` and a `?plan=`
override — an explicit client decision of 20 Sep 2026. Serving a real plan name there would make
the label disagree with the gating that is still demo, and would break the override. The plan model
is its own integration.

## F3 — the console ERP screens were story data presented as live

`/console/erp` and `/console/erp/connections/:id` drew `src/lib/consoleErp.ts`: a fixed-clock
fixture with nine invented tenants, connection states, mapping health and "last collected" times.
There is no platform-scoped ERP API at all — `/api/v1/erp/connections` is tenant-scoped and derives
the tenant from the session.

- Both pages now render `ConsoleErpUnavailable` (`ConsoleShell` + `ConsoleNotice`, the component the
  console already uses for this state). Routes stay reachable; the nav entry is gone.
- Crumbs in the templates and add-on-request screens no longer link to `/console/erp`.
- `consoleErp.ts` is kept: the templates, add-on-request, audit and queue screens still read it.
- `noMockRuntime.test.ts` now guards the two console pages as well.

## Checks

| check | result |
|---|---|
| backend `ErpConnectionDomainTest` | 27 passed |
| backend `Erp*Test` | 200 passed |
| backend identity/entitlements suites | 36 passed |
| frontend suite | 1233 passed (83 files) |
| typecheck | clean |
| lint | 21 errors, all pre-existing on the base (identical count with the branch stashed) |
| build | clean |
| browser | all three verified live on the isolated `fawtir-p2v` stack, English and Arabic |

Browser evidence: `tenantName: "Erp Verify LLC"` served and rendered; a userinfo URL answered
`400` with *"That address was not accepted…"* while a `{"password":…}` transport document still
answered with the transport-settings sentence; `/console/erp` as a platform operator shows
"Not built yet" with no invented state and no nav entry; RTL Arabic verified.

## Notes for integration

- Backend and frontend must land together: the frontend maps a code the backend only emits after
  this change, and reads a field it only serves after this change. Neither is breaking on its own —
  an unmapped code falls back to the generic refusal, and an absent `tenantName` falls back to the
  previous label.
- No migration. `NEW_MIGRATION_CREATED = NO`.
- The verification stack needed `FAWTIR_IDENTITY_OPERATOR_INVITATION_ACCEPTANCE_URL` set to create a
  throwaway operator; that is a stack setting, not a repo change.
