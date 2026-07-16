# Fawtir ASP

React + TypeScript + Vite + Tailwind CSS starter with bilingual English / Arabic support via i18next.

## Getting started

```bash
npm install
npm run dev
```

## Folder structure

```
src/
  api/          # API client and request helpers
  components/   # Reusable UI components
  hooks/        # Custom React hooks
  i18n/         # i18next config and locale files
  pages/        # Page-level views
```

## Scripts

| Command         | Description              |
|-----------------|--------------------------|
| `npm run dev`   | Start development server |
| `npm run build` | Production build         |
| `npm run preview` | Preview production build |

## Languages

Toggle **English** / **Arabic** in the header. Preference is stored in `localStorage` and the document `dir` switches to RTL for Arabic.
