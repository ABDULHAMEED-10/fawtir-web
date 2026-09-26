# Fawtir web: read this first

Front end of **Fawtir**, an Omani e-invoicing and accounting SaaS (React 19, TypeScript, Vite 7,
Tailwind v4, i18next in English and right-to-left Arabic). Invoices are reported to the Oman Tax
Authority over Peppol under the **PINT-OM** standard.

**The full memory of this project is `docs/PROJECT_HANDBOOK.md`: how we work, every rule, every
product and Oman-compliance decision, open questions and commands. Read it before changing
anything.** This file is the short version.

## The three rules that matter most

1. **The Figma design is the source of truth for every screen.** File `9cUaVMybChEiMAIyNNbxHp`,
   page `0:1` (read it with the Figma MCP; find frames by name, ids change on re-upload). Look at
   the frame's image before building or answering. POS is the only screen with no design.
2. **Fix the designer's slips, do not copy them** (wrong arithmetic, pasted labels, duplicated
   fields), and say what you corrected.
3. **Keep the backend integration, but the design wins.** Never delete an API call, request
   assertion or permission check to make a screen look right, and never drop a designed element
   because the API lacks data: draw it, mark it `// TODO(backend)`, and add a row to the area's
   guide in `docs/backend-guides/` (append only; row numbers are cited in code).

## Every screen

- English **and** Arabic for every string; add keys only with `node tools/i18n/merge.cjs`.
- No em dashes in visible copy. Money shows the Omani rial sign (`OmAmount`, `Rial`,
  `withRial`), never "OMR" beside a figure; three decimals always.
- No native `<select>` or date inputs (use `src/components/ui`). Figure inputs use
  `selectAllOnFocus`. Nothing may scroll sideways at 390 px. No "Project" field anywhere.
- Invoice-type forms: free-text lines, Goods/Service toggle, units following it with "Other",
  "Price excl." at three decimals, tax category as text, Classification (HS code or service type)
  for business and government only, Excl. VAT | Incl. VAT toggle.

## Before saying anything works

- `npm run build` is the type-check (a bare `npx tsc --noEmit` checks zero files here).
- `npm run test`; a few big console suites time out only under load, re-run them alone.
- Screenshot the page against its Figma frame in English, Arabic and at 390 px:
  `node tools/screenshot/shot.mjs out.png <url> [--ar] [--width 390]`, against a build made with
  `VITE_REQUIRE_SESSION=true` and served by the mock API (`node tools/mock-api/server.mjs`).
- `npm run responsive:sweep -- --no-build` must show 0 routes bleeding sideways.
- Prettier only with flags: `--no-semi --single-quote --print-width 100 --end-of-line auto`.

## Git and PRs

- Work on `dev`; the owner merges `dev` into `main` on GitHub. Only `main` and `dev` are kept.
- Backend PRs are **verified before merging**: read the diff, trial-merge onto `main`, build,
  test, screenshot the touched screens. Merge only if the UI is unchanged (handbook section 2).
- Never commit `.env.*.local`, tokens or passwords.
