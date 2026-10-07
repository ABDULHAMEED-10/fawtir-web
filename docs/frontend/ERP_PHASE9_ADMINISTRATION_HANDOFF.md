# ERP Phase 9: unified ERP integration administration

## Purpose and scope

Phases 1 to 8 each added an ERP screen under Settings › Integration on its own: connections,
upload, API push keys, mapping, activity reports. A reader had to know which card held what, and
two screens still drew design-time samples: the activity log and the Plan page's ERP add-on. This
change makes them one area, in place, with no redesign:

- **One strip for the area.** Every ERP page under Settings › Integration now shows the same strip:
  Overview, Connections, Bridge upload, API push, Mapping, Activity, Access and history. A reader
  sees only the areas their permissions open (`lib/erp/integrationAreas.ts`).
- **Overview** (`/settings/erp`, new): the backend Phase 6 overview for a chosen window, a setup
  checklist per channel, connection health, mapping readiness and the latest runs.
- **Access and history** (`/settings/erp/access`, new): the reader's own permissions against each
  ERP capability, the plan's personas as permission sets, and the real change history for
  administrators.
- **Real data in place of samples:** the activity log reads the server's log, and the Plan page's
  ERP add-on no longer draws a state, usage figure or "switch on" button from the connector mock.
- **Smaller fixes:**
  - the connection list shows collection health;
  - Needs attention shows the recipient's recorded answer;
  - the Settings mapping card no longer calls a refused read "Not set up";
  - accessibility fixes listed below.

Not in scope:
- any backend change;
- an ERP-scoped history for non-administrators (blocked, see Blockers);
- persona roles on the server;
- deployment.

## Backend contract used

| Call | Permission | Used for |
| --- | --- | --- |
| `GET /v1/erp/overview?from&to` | `erp.connection.read` and `invoice.read` | the overview: documents, attention counts, connections and their `health`, mapping readiness, latest and failed runs, `entitled`, `scheduler_globally_enabled`. The window is always sent; nothing is totalled in the browser |
| `GET /v1/erp/connections` | `erp.connection.read` | the checklist and the Collection column, from each item's `health` (one list read, never one status read per connection) |
| `GET /v1/erp/source-documents/summary?source_kind&from&to` | `invoice.read` | the checklist's per-channel "received" and "accepted" steps (three reads) |
| `GET /v1/apikeys` | `admin.settings.manage` | the API push checklist's key step, asked only of a holder |
| `GET /v1/peppol/mapping-profiles/JSON/certification?...` | `admin.settings.manage` or `mapping.read` | the checklist's certification step, asked only of a reader the mapping routes admit |
| `GET /v1/settings/activity-log?resource_type&outcome&page&page_size` | `admin.settings.manage` | the activity log and the ERP history. Whole-tenant for a holder; refused for everyone else |
| `GET /v1/erp/source-documents/reconciliation` | `invoice.read` | unchanged; its `recipient_response_code` is now shown |

## Decisions

- **Checklist from server facts only.** Each step is done, to do, not known (the reader cannot
  see the fact, or the platform switch hides it) or guidance. Nothing is stored in the browser,
  and upload and API push never ask for a connection. The issue-time pointer has no flag of its
  own; the server's extraction status answers it, and `GLOBALLY_DISABLED` makes it "not known".
- **Filters are not authorisation.** The activity log's resource and outcome filters are the
  server's exact-match parameters. The ERP history narrows the whole-tenant log to the seven ERP
  resource kinds as a view; the server answers it only to `admin.settings.manage`. Every other
  reader is told the history is for administrators, and the screen never asks for it. A crafted
  request from those personas is refused by the server (403, verified live).
- **Personas are presentation only.** The server has no Integration Administrator, Operator,
  Invoice Submitter or Auditor role; the page lists the permissions such a role would need, and
  Tenant Administrator is the built-in ADMIN role. No role is created or changed.
- **TDD visibility uses existing state only.** The document list has no TDD field or filter, so
  the overview shows the server's tax-report attention count, linked to Needs attention filtered
  by `TAX_REPORT_ATTENTION`, where each row already shows its tax report status.
- **RESPONSE_PENDING is not evaluated** (DEC-G). The overview names it under "Not checked", as
  Needs attention already did.
- **The Plan page's ERP add-on** says ERP is enabled per organisation by Fawtir and links to the
  ERP integration area. There is no billing or usage endpoint for it, so no figure is drawn.
- **Placeholders.** The per-connection Mapping and Write-back views were already unlinked and say
  they are unavailable; nothing new was added. The activity log's design KPIs and PDF export have
  no backend and are not drawn.

## Accessibility

- Table headers in the ERP idiom carry `scope="col"`.
- `TextField` links its hint or its error to the input with `aria-describedby`.
- `FileDropzone` takes `id`, `labelledBy` and `describedBy`, and its hidden input is out of the
  tab order. The Bridge file control is named by its "File" caption and described by the
  rejection message when there is one.
- The new strip is a labelled `nav` with `aria-current`.
- Checklist channels are labelled regions.
- Dialogs are the shared `Modal`, which already handled role, `aria-modal`, labelling, the focus
  trap and focus return; no change was needed.

## Files

| File | Change |
| --- | --- |
| `src/api/erp/overview.ts`, `src/api/settings/activityLog.ts` | new typed clients |
| `src/api/erp/connections.ts` | `health` on the list item |
| `src/lib/erp/setupChecklist.ts`, `integrationAreas.ts`, `erpAccess.ts`, `extractionTone.ts`, `src/lib/activityLog.ts` | new |
| `src/pages/ErpPage/ErpHomePage.tsx`, `ErpAccessPage.tsx` | new pages |
| `src/pages/SettingsPage/IntegrationAreaNav.tsx`, `ActivityHistory.tsx` | new |
| `src/pages/SettingsPage/SettingsShell.tsx` | the strip on every Integration page but the hub |
| `src/pages/SettingsPage/ActivityLogPage.tsx` | real log; sample KPIs, search, tabs and fake export removed |
| `src/pages/SettingsPage/PlanPage.tsx` | mock ERP add-on removed |
| `src/pages/SettingsPage/SettingsPage.tsx` | Overview and Access cards; mapping card permission state; log card foot without the sample count |
| `src/pages/ErpPage/ErpConnectionsPage.tsx`, `connections/connectionParts.tsx`, `connections/ConnectionExtractionPage.tsx` | Collection column from `health` |
| `src/pages/ErpPage/reporting/ErpAttentionPage.tsx`, `ErpDocumentsPage.tsx` | recipient answer; summary cards shared |
| `src/pages/ErpPage/ErpBridgePage.tsx` | uploaded-documents link; file control labelled |
| `src/components/form/FormFields.tsx`, `src/components/ui/FileDropzone.tsx`, `src/pages/ErpPage/overview/idiom.tsx` | accessibility |
| `src/App.tsx`, `src/lib/planAccess.ts`, `src/pages/ErpPage/index.ts`, `tools/responsive/seed-routes.mjs` | the two routes |
| `src/i18n/locales/en.json`, `ar.json` | new keys, English and Arabic, with Arabic plural forms |
| tests | `erpAdministration.test.tsx` (16), `setupChecklist.test.ts` (8), one attention test, the no-mock guard extended to every Phase 9 file, the connection strip test pinned to its own name |

## Blockers and limitations

- **ERP-scoped history for non-administrators: BLOCKED (backend, plan risk R22).** The only audit
  read is the whole-tenant activity log under `admin.settings.manage`. Showing an Integration
  Operator or Auditor an ERP-only history needs a server-enforced scoped read; it is not built in
  the frontend.
- **Persona roles** do not exist on the server. Live checks used custom roles made from the listed
  permissions.
- **Hub cards are not permission-filtered.** The Settings hub still shows every Integration card
  to every reader, as before; the new strip is permission-aware. The API push card opens to a
  permission notice for a reader without `admin.settings.manage`.

## Phase 4 follow-up

503 `ERP_REPORT_TIMEOUT`: RESOLVED (see `ERP_API_PUSH_HANDOFF.md`).

## Verification

- **Focused and affected tests:** `src/pages/ErpPage`, `src/pages/SettingsPage`, `src/lib/erp`,
  `src/components/ui` and the landing-route test, 411 tests in 26 files, all pass. The full suite
  was not run.
- **i18n:** every literal key in the touched files exists in English. The new key sets match
  between English and Arabic, and no new string has an em dash.
- **Build** (the type-check) passes. **Lint** on every touched file is clean; the repository
  total is the same 32 pre-existing problems as on `main`.
- **Real backend, real browser:** Chrome (Playwright) against backend `main` `dffc1855` images on
  an isolated local stack. Gateway and Mailpit were published on loopback only. Locality: every
  sign-in used local passwords and one-time codes from the local Mailpit. 50/50 checks:
  - **Tenant administrator:**
    - hub cards;
    - overview with one overview read, one connection list, no per-connection read and three
      channel summaries (13 API requests in all);
    - checklist with API push done and no connection asked of upload;
    - connection list health;
    - a Bridge upload through the UI, accepted, then seen under Activity filtered to
      `BRIDGE_UPLOAD` and not under `API_PUSH`, and pushed documents seen under `API_PUSH`;
    - Needs attention;
    - ERP history and the activity log from the real log, filtered by resource kind;
    - the Plan page without the mock.
  - **Widths:** no horizontal overflow on six pages at 1440, 1024, 768, 390 and 360, in English
    and Arabic. Arabic is right to left.
  - **Personas** (custom roles):
    - Integration Administrator, Integration Operator and Auditor see the overview;
    - Invoice Submitter is told it needs ERP read permissions;
    - each strip shows only the areas the role opens;
    - none of the four has the history asked for them;
    - crafted log requests, filtered and unfiltered, are 403 for all four;
    - the mapping card reads "No access", never "Not set up", for the three without mapping
      access.
- **Transmission:** core runs the stub AS4 transport ("outbound sends do NOT hit the wire") on a
  Docker network with no route out. The browser was refused every non-local host; the only one it
  tried was the web font host. Nothing left the machine.
