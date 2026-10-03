# ERP integration, Phase 2: extraction reporting and reconciliation

## Scope

The tenant-facing read side of the backend's ERP Phase 3B reporting, under Settings › Integration:

| Route | Screen | Backend |
|---|---|---|
| `/settings/erp/documents` | Source documents: filters, server summary, paged list | `GET /api/v1/erp/source-documents`, `…/summary` |
| `/settings/erp/documents/:recordId` | One document: source, invoice, delivery, recipient answer, tax report, validation findings, timeline | `GET /api/v1/erp/source-documents/{recordId}` |
| `/settings/erp/attention` | Needs attention: query-time reconciliation labels | `GET /api/v1/erp/source-documents/reconciliation` |
| `/settings/erp/runs` | Extraction runs, all channels | `GET /api/v1/erp/extraction/runs` |
| `/settings/erp/runs/:runId` | One run: counters, downstream now, its documents (`run_id`) | `GET /api/v1/erp/extraction/runs/{runId}` + document list |

Entry: an "ERP activity" card in the Integration group, and a tab strip across the three lists.
The per-connection `…/connections/:id/runs[/:runId]` and `…/records[/:recordId]` addresses, which
said "not available", now redirect to these reports narrowed to the connection (or to the run or
record), so existing bookmarks land somewhere true. Write-back and per-connection mapping stay
"not available": they still have no backend.

## Contract (backend `main` e261eddc)

- Permission `invoice.read` on every route (Phase 3B D1). No tenant parameter exists.
- Snake-case `{items, page, page_size, has_more}`; no total. Page is zero-based, `page_size` ≤ 100
  (the screens send 20), page ≤ 500.
- Documents, summary and reconciliation require `from` and `to`, at most 367 days apart, unless the
  document list is given `run_id`. The run list's window is optional.
- `from`/`to` are sent as instants: local midnight in `Asia/Muscat` and the following local
  midnight (exclusive). The backend reads a bare date as a UTC day, which would start four hours
  late for a Muscat tenant.
- **No replay or recovery mutation exists.** No action is offered; every request is a GET (tested).

## Decisions

- **Dimensions stay separate.** `display_status` is shown once, labelled "Overall" as a summary;
  the processing state, reason, invoice, route, ledger state, recipient answer and tax report each
  have their own section, so a delivered invoice with a refused tax report shows both.
- **Off the network is not a failure.** For `OUTSIDE_PEPPOL` the ledger state is shown with a note
  that it describes a network leg the invoice does not have; the badge is neutral, never success or
  danger. `undeliverable` (raw, includes off-network) is not displayed; the server's own
  `delivery_failed` and `off_network` are.
- **`RESPONSE_PENDING` is never timed here.** The server lists it in `unevaluated_labels` while no
  approved MLS window is configured; the screen repeats that. No polling, no timer (tested).
- **Recipient answer `NONE` is silence**, shown neutral with "not a refusal".
- **Unknown enum values** (a new label, event type or state from a newer backend) render as the
  code itself, escaped, with a neutral tone.
- **Findings** show layer, rule, field and Fawtir's explanation only — the DTO carries no
  validator text or XPath and nothing reconstructs them. `truncated` shows "Only the first 50".
- **Timeline** keeps the server's order (oldest first); "Show newest first" only reverses the
  rendered list. `truncated` shows the 200-event audit limit. The origin (ledger vs audit evidence)
  and actor kind are shown; no event is inferred.
- **Connection names** come from one `erp.connection.read` list request per screen, only for holders
  of that permission; others see a short id. Bridge and API push rows show "Not applicable".
- **Summary** is the server's six mutually exclusive buckets over the window, channel and
  connection; the list-only filters do not change it, and the card says so. Replays and conflicts
  are shown as "at least" (audit evidence, a lower bound).
- **Read gate.** Without `invoice.read` the screens show the no-access notice and send no report
  request; a 403 renders as no access, never as an empty list.

## Request budget (measured in Chrome)

Documents page load: 1 list + 1 summary (+1 connection list for administrators); 0 per-row
requests. A filter change: 1 list + 1 summary. Run detail: 1 detail + 1 document list, no summary.
Stale answers are discarded by `useApiRead`; the shared client has no abort signal, so a superseded
request still completes on the network.

## Backend gaps / limitations (not fixed here)

| Item | Class |
|---|---|
| No replay/recovery endpoint, so evidence only | NON_BLOCKING_BACKEND_GAP |
| Summary has no `run_id`; the run detail uses its own downstream block | NON_BLOCKING_BACKEND_GAP |
| `RESPONSE_PENDING` unevaluated until an MLS timeout is approved | NON_BLOCKING_BACKEND_GAP |
| Off-network ledger mismatch (state moves without a network leg) | NON_BLOCKING_BACKEND_GAP |
| Platform-operator reporting not in v1 | FUTURE_SCOPE |
| Gateway machine (API key) access to reporting not verified | OPERABILITY_FOLLOWUP |
| Stale PostgreSQL statistics after bulk import can slow these reads; ANALYZE recommended | OPERABILITY_FOLLOWUP |
| Arabic copy is a working translation; native review pending | FUTURE_SCOPE |

## Verification

Unit and page tests: `src/pages/ErpPage/reporting/erpReporting.test.tsx`,
`src/lib/erp/reportingWindow.test.ts`. Real-browser verification ran in Chrome against a temporary
contract-shaped mock (not committed) — not a backend end-to-end test.
