// Proves the generated pages hold every word, code block, table row and link of the source
// files. Allowed differences: front matter, the file titles, heading levels and link targets.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { transform } from './transform.mjs'
const SRC = new URL('../guide-source/', import.meta.url).pathname
const OUT = new URL('../src/content/docs/', import.meta.url).pathname
const FILES = [
  '1-getting-started.md',
  '2-api-reference-and-data-mapping.md',
  '3-sync-lifecycle-and-errors.md',
  '4-testing-go-live-and-reference.md',
]
const strip = (t) => t.replace(/^---\n[\s\S]*?\n---\n/, '')
const norm = (t) => {
  let fence = false
  return t
    .split('\n')
    .map((l) => {
      if (/^\s*(```|~~~)/.test(l)) fence = !fence
      if (fence || /^\s*(```|~~~)/.test(l)) return l
      return l.replace(/^#{1,6} /, '# ').replace(/\]\([^)]*\)/g, '](LINK)')
    })
    .filter((l) => l.trim())
}
const src = FILES.map((f) =>
  strip(readFileSync(join(SRC, f), 'utf8'))
    .split('\n')
    .filter((l, i, a) => !/^# FAWTIR ERP Developer Guide/.test(l))
    .join('\n'),
)
// Pages written by hand (source/extra) are not part of the four reviewed files.
const HAND_WRITTEN = ['get-started/sandbox.md']
const pages = []
const walk = (d) =>
  readdirSync(d).forEach((f) => {
    const p = join(d, f)
    statSync(p).isDirectory()
      ? f !== 'ar' && walk(p)
      : p.endsWith('.md') && !HAND_WRITTEN.some((h) => p.endsWith(h)) && pages.push(p)
  })
walk(OUT)
// Each page's title is its source "## heading": put it back as a heading line for the comparison.
const out = pages.map((p) => {
  const t = readFileSync(p, 'utf8')
  const title = JSON.parse(t.match(/^title: (.*)$/m)[1])
  return `# ${title}\n` + strip(t)
})
const a = norm(transform(src.join('\n').split('\n')).join('\n')),
  b = norm(out.join('\n'))
const count = (lines) => {
  const m = new Map()
  lines.forEach((l) => m.set(l, (m.get(l) ?? 0) + 1))
  return m
}
const ca = count(a),
  cb = count(b)
const missing = [...ca].filter(([l, n]) => (cb.get(l) ?? 0) < n)
const extra = [...cb].filter(([l, n]) => (ca.get(l) ?? 0) < n)
const fences = (t) => (t.match(/^\s*```/gm) ?? []).length
const rows = (t) => (t.match(/^\|/gm) ?? []).length
const links = (t) => (t.match(/\]\(/g) ?? []).length
const S = src.join('\n'),
  O = out.join('\n')
console.log(`lines: source ${a.length}, pages ${b.length}`)
console.log(
  `code fences: ${fences(S)} / ${fences(O)}; table rows: ${rows(S)} / ${rows(O)}; links: ${links(S)} / ${links(O)}`,
)
console.log(`missing lines: ${missing.length}; extra lines: ${extra.length}`)
missing.slice(0, 10).forEach(([l]) => console.log('  MISSING ' + l.slice(0, 120)))
extra.slice(0, 10).forEach(([l]) => console.log('  EXTRA   ' + l.slice(0, 120)))
// Words: every word of the source must appear at least as often in the pages. Extra words may
// only be markup (callout and badge names).
const MARKUP = new Set([
  'note',
  'caution',
  'tip',
  'span',
  'class',
  'rule',
  'fawtir',
  'pint',
  'ota',
  'advice',
])
const words = (t) => {
  const m = new Map()
  for (const w of t
    .replace(/\]\([^)]*\)/g, ']')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [])
    m.set(w, (m.get(w) ?? 0) + 1)
  return m
}
const ws = words(S),
  wo = words(O)
const lost = [...ws].filter(([w, n]) => (wo.get(w) ?? 0) < n)
const added = [...wo].filter(([w, n]) => (ws.get(w) ?? 0) < n && !MARKUP.has(w))
console.log(
  `words: source ${[...ws.values()].reduce((x, y) => x + y, 0)}; lost ${lost.length}; added (not markup) ${added.length}`,
)
lost.slice(0, 10).forEach(([w, n]) => console.log(`  LOST ${w} x${n - (wo.get(w) ?? 0)}`))
added.slice(0, 10).forEach(([w]) => console.log(`  ADDED ${w}`))
process.exit(missing.length || extra.length || lost.length || added.length ? 1 : 0)
