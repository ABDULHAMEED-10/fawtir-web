# Fawtir web: read this first

> **Maintenance:** update this file whenever a rule or a version changes, and trim it whenever it grows past
> 200 lines; detail belongs in `docs/references/`. Facts tagged *(v YYYY-MM-DD)* were checked on that date.

Front end of **Fawtir**, an Omani e-invoicing and accounting SaaS (React 19, TypeScript, Vite 7, Tailwind v4,
i18next in English and right-to-left Arabic). Invoices are reported to the Oman Tax Authority over Peppol under
the **PINT-OM** standard.

**The full memory of this project is `docs/PROJECT_HANDBOOK.md`: how we work, every rule, every product and
Oman-compliance decision, open questions and commands. Read it before changing anything** (§3 keeping the UI
intact, §4 keeping the integration working, §5 compliance). This file is the short version.

## Orientation

- Two repos side by side: this one (`ABDULHAMEED-10/fawtir-web`, work on `dev`) and `../fawtir-backend`
  (`Rixon-agency/fawtir-backend`). The app always calls same-origin `/api`; Vite proxies it to the gateway
  (`FAWTIR_API_ORIGIN`, `FAWTIR_API_PROXY_ORIGIN` in the committed `.env.development`, overridden in gitignored `.env.local`).
- Environments: **local** (Vite :5173, gateway :8080, core :8081); **the one deployed host**, a Contabo VPS behind
  `api.fawtir.om`, in **integration mode** with no real taxpayer data, with this app at https://www.fawtir.om/
  proxying `/api` to it *(v 2026-09-26: a request answers 401 problem+json)*; the external Peppol Testbed.
- State *(v 2026-09-26)*: web `main` = `c2f07ac`, `dev` = `3fac694` (level bar one merge commit). Backend production
  runs `34e50486c6c3`, **182 commits behind** backend `main`, so the deployed spec
  (https://api.fawtir.om/docs/openapi.yaml) describes production, not `main`. Say which you mean.
- Versions *(v 2026-09-26, `package.json`)*: React ^19.1.1, TypeScript ~5.9.2, Vite ^7.1.7, Tailwind ^4.1.13,
  i18next ^25.5.2, Vitest ^3.2.7; Node ^20.19 or >=22.12; use npm (the lockfile is npm's).

## Getting running

`docs/LOCAL_SETUP.md` is the tested walkthrough, backend and web, with seeded logins (`demo_admin`, `demo_viewer`);
last run 2026-09-15, so re-run rather than trust. To work without a backend: `node tools/mock-api/server.mjs`, and
`VITE_REQUIRE_SESSION=false` in `.env.local` to look at mock screens (a session is otherwise required in dev).

## The three rules that matter most

1. **The Figma design is the source of truth for every screen.** File `9cUaVMybChEiMAIyNNbxHp`, page `0:1` (read it
   with the Figma MCP; find frames by name, ids change on re-upload). Look at the frame's image before building or
   answering. The live UI (https://www.fawtir.om/) shows what a screen *does*; where it and Figma disagree, report
   it. POS is the only screen with no design. **Unverified:** the backend repo's integration notes cite a different
   Figma file, `ocYGcyvocA2ltg0gEhuC3c` node `37-752`. Neither link opens without login *(v 2026-09-26)*, so ask Zain
   which is current before trusting either.
2. **Fix the designer's slips, do not copy them** (wrong arithmetic, pasted labels, duplicated fields), and say
   what you corrected.
3. **Keep the backend integration, but the design wins.** Never delete an API call, request assertion or permission
   check to make a screen look right, and never drop a designed element because the API lacks data: draw it, mark it
   `// TODO(backend)`, and add a row to the area's guide in `docs/backend-guides/` (append only; row numbers are
   cited in code).

## Integration rules (Zain, 2026-09-25)

Manual-test specification: `docs/references/manual-test-instructions.md`.

1. **The frontend is the first source of truth and the backend bends to it.** If the API returns a shape, field or
   status a screen does not expect, ask for an additive backend change (a `docs/backend-guides/` row); never reshape
   the screen to fit the API. Read the screen before wiring it; never infer its behaviour from the API.
2. If the *frontend* would have to change for an integration to work, **stop and tell Zain first**, with the reason
   and the options. Do not change it and report afterwards.
3. **Compliance outranks the UI.** A designed screen that would produce a non-compliant invoice, identifier or
   submission is not built: flag it with the primary source cited, and wait.
4. **No design or theme changes** (layout, spacing, colour, typography, components, icons, copy), and no "small
   improvements". Allowed: wiring data into the existing components; loading, empty, error and permission-denied
   states in the patterns already here; fixing what is plainly broken. **Follow the existing patterns** for data
   fetching, error handling, pagination and state; do not introduce a new one for a single screen. If unsure, ask.
5. **One screen at a time, in small portions,** each finished before the next. Each portion gets its own branch in
   each repo and cross-linked **draft** PRs. Nothing merges to `main` and nothing deploys without Zain's say-so.
6. **Zain tests every portion; it is done when he says so.** Every portion ships complete manual test steps.
7. A web PR that needs a backend change **waits for that backend PR**. When it does not, a required field the
   backend has not shipped renders as nothing: `BillsPage` guards on `totals.disputedCount > 0` while `bills.ts`
   types the field as required, so only the runtime guard kept web PR #70 from breaking.

## Team boundaries

The backend's Peppol/AS4/OTA dispatch path, certificates, `OmanSmpPort`, `ReadableInvoiceDeliveryConsumer` and
`InvoicePdfRenderingService` are **Abrar's**. The web app calls them and never works around them; a UI need that
would require changing one goes to Zain. The screen at `/compliance/activity/:id/resubmit` (`TddResubmitPage`)
calls the backend's `POST /invoices/{id}/tdd/resubmit`, and the `resubmit` link is server-provided: present only
when the server judges one possible, never inferred here (`src/api/compliance/activity.ts`).

## Every screen

- English **and** Arabic for every string; add keys only with `node tools/i18n/merge.cjs`.
- No em dashes in visible copy. Money shows the Omani rial sign (`OmAmount`, `Rial`, `withRial`), never "OMR"
  beside a figure; three decimals always.
- No native `<select>` or date inputs (use `src/components/ui`). Figure inputs use `selectAllOnFocus`. Nothing may
  scroll sideways at 390 px. No "Project" field anywhere.
- Invoice-type forms: free-text lines, Goods/Service toggle, units following it with "Other", "Price excl." at three
  decimals, tax category as text, Classification (HS code or service type) for business and government only,
  Excl. VAT | Incl. VAT toggle.

## Definition of done: before saying anything works

- `npm run build` is the type-check (a bare `npx tsc --noEmit` checks zero files here).
- `npm run test`; a few big console suites time out only under load, so re-run them alone.
- Screenshot the page against its Figma frame in English, Arabic and at 390 px:
  `node tools/screenshot/shot.mjs out.png <url> [--ar] [--width 390]`, against a build made with
  `VITE_REQUIRE_SESSION=true` and served by the mock API (`node tools/mock-api/server.mjs`).
- `npm run responsive:sweep -- --no-build` must show 0 routes bleeding sideways.
- Prettier only with flags: `--no-semi --single-quote --print-width 100 --end-of-line auto`.
- Manual test steps are written for Zain. State what was verified and what was not; never report a plausible-looking
  diff as done.

## When you're stuck

Start with `docs/LOCAL_SETUP.md` §8 (a table of failures and confirmed fixes). The ones a web session meets:

- **Redirects straight to `/login`:** a session is required in dev. Sign in, or `VITE_REQUIRE_SESSION=false`.
- **Login returns 401 with the right password:** backend PII protection is off. **Signs in, then everything 401s:**
  core and gateway hold different cookie keys; start both from the same `local-dev.env`.
- **403 on login or any POST:** `http://localhost:5173` is missing from one of the backend's two origin allow-lists.
  A deployed allow-list cannot name localhost, which is why the dev proxy can present `FAWTIR_API_PROXY_ORIGIN`.
- **503 `REFERENCE_CATALOGUE_NOT_AVAILABLE` when issuing:** a backend flag that is off by default everywhere.
- **A field or endpoint is missing:** check `../fawtir-backend/core/src/main/resources/static/docs/openapi.yaml` on `main`, not the
  deployed spec; then `docs/backend-guides/`. Missing means a `// TODO(backend)` row, not a workaround.
- **A `#NAME?`-style validation failure:** **unverified.** No record of it in either repo, the workspace or memory
  *(v 2026-09-26)*. Do not invent a fix; record the message, the input and the fix once reproduced.
- **A compliance question:** do not settle it from the UI. The backend's order is the phive PINT-OM Schematron,
  then OTA material, then OpenPeppol, then local documents for intent only, with a citation (document, version,
  section, page) for every claim: `../fawtir-backend/docs/references/pint-om-standards.md`. **Escalation:** when the
  sources do not settle it, draft the question with what each reading would change, leave the screen fail-closed,
  and move on to other work. Do not invent an answer.

## Known traps

- **Invoice lines against production.** The forms above draw free-text lines, and backend `main` accepts them
  (PR #355, 2026-09-26). Production `34e50486c6c3` does not: its deployed spec lists `productId` and `productCode`
  as required on a line, so a free-text line is rejected there *(v 2026-09-26)*.
- **The deployed spec is production's, not `main`'s.** New backend fields do not appear in it until a deploy.
- **The backend's SRS is not a compliance source** and has known errors (IBT-046/047 swapped, retention start):
  `../fawtir-backend/docs/references/errata-and-traps.md`.
- **"Complete" needs a noun:** web `main`, web `dev`, or the deployed site; and backend `main` or production.

## Git and PRs

- Work on `dev`; the owner merges `dev` into `main` on GitHub. Each integration portion is its own branch off `dev`
  with a draft PR cross-linked to its backend PR, deleted after merge; only `main` and `dev` are long-lived.
- Backend PRs are **verified before merging**: read the diff, trial-merge onto `main`, build, test, screenshot the
  touched screens. Merge only if the UI is unchanged (handbook section 2).
- Never commit `.env.*.local`, tokens or passwords. **No Claude attribution** in commits, pushes or PR bodies.

## Pointers

- `docs/PROJECT_HANDBOOK.md`, `docs/LOCAL_SETUP.md`, `docs/backend-guides/README.md`, `docs/frontend/` (per-area
  handoffs), `docs/responsive-plan.md`, `docs/erp-and-console-plan.md`.
- Backend, next to this repo: `../fawtir-backend/docs/references/` (`pint-om-standards.md`, `troubleshooting.md`,
  `integration-testing.md`, `errata-and-traps.md`, `production-operations.md`) and its ledger
  `docs/BUILD_ORDER_STATUS.md`. Workspace (not in either repo): `Testing/Manual-Test-Pack-2026-09-24.md`,
  `Planning/Integration-Status-Analysis-2026-09-23.md`, `Income-Invoice-APIs/API-Integration-Status.md`.
