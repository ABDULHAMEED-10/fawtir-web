# developer.fawtir.om (draft)

The Fawtir developer documentation: the ERP Developer Guide as a website, built with Astro
Starlight. It is a draft. Every page carries a "Draft" banner and `noindex` until the guide is
approved for publication. It is not deployed yet and is separate from the web app: nothing here
is part of `npm run build` at the repository root.

## Layout

| Path | What it is |
|---|---|
| `guide-source/1-…md` to `4-…md` | The four reviewed guide files. **Edit the guide here.** |
| `guide-source/extra/` | Pages written for the site that are not in the four files (Sandbox). |
| `src/content/docs/` | Generated pages (one per guide section), plus the two home pages (`index.mdx`, `ar/index.mdx`). Do not edit the generated pages by hand. |
| `scripts/` | Split, audit, link check and screenshot scripts. |
| `src/components/`, `src/styles/` | The Fawtir look: header, hero, footer, colours (light only, as the app). |

## Working on it

```bash
cd developer
npm ci
npm run split               # guide-source -> one page per section, every cross-link rewritten
node scripts/audit.mjs      # must show 0 missing, 0 extra, 0 lost words
npm run build               # dist/ with search (Pagefind)
node scripts/check-links.mjs  # every internal link and anchor must resolve
npm run preview             # http://localhost:4321
```

- The audit proves the pages hold every word, code block, table row and link of the four guide
  files. Only presentation changes: callout boxes for Note / Warning / Recommendation, and badges
  for the rule labels (FAWTIR rule, PINT-OM rule, Regulation (OTA), Recommendation).
- English is the default; `ar` is right to left. Arabic pages not yet translated show the English
  text with a notice.
- No em dashes in visible copy; codes and URLs stay left to right on Arabic pages.
