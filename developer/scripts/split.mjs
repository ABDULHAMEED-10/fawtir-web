// Splits the four reviewed guide files into one page per `##` section, rewrites every
// cross-link to the new page URLs, and writes them under src/content/docs/guide/.
// The source files stay untouched; run `npm run split` again whenever they change.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from './transform.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '../guide-source')
const OUT = join(here, '../src/content/docs')

const FILES = [
  '1-getting-started.md',
  '2-api-reference-and-data-mapping.md',
  '3-sync-lifecycle-and-errors.md',
  '4-testing-go-live-and-reference.md',
]

// section anchor -> [folder, slug, sidebar title, order, description]
const PAGES = {
  overview: ['', 'guide', 'Overview', 0],
  introduction: ['get-started', 'introduction', 'Introduction', 1],
  'quick-start': ['get-started', 'quick-start', 'Quick start', 2],
  environments: ['get-started', 'environments', 'Environments', 3],
  authentication: ['get-started', 'authentication', 'Authentication', 5],
  'api-reference': ['api', 'reference', 'API reference', 1],
  'data-mapping': ['api', 'data-mapping', 'ERP data mapping', 2],
  'invoice-synchronization': ['integrate', 'synchronization', 'Invoice synchronization', 1],
  'erp-connector': ['integrate', 'managed-pull', 'ERP connector (Managed Pull)', 2],
  'invoice-lifecycle': ['integrate', 'lifecycle', 'Invoice lifecycle', 3],
  'invoice-corrections': ['integrate', 'corrections', 'Invoice corrections', 4],
  webhooks: ['integrate', 'webhooks', 'Webhooks', 5],
  'error-reference': ['reference', 'errors', 'Error reference', 1],
  'platform-limits': ['reference', 'limits', 'Platform limits', 2],
  'official-references': ['reference', 'official-references', 'Official references', 3],
  'faq-and-glossary': ['reference', 'faq', 'FAQ and glossary', 4],
  'erp-integration-test-checklist': ['go-live', 'test-checklist', 'TEST checklist', 1],
  'production-go-live-checklist': ['go-live', 'production', 'Production go-live', 2],
  'support-and-versioning': ['go-live', 'support', 'Support and versioning', 3],
}

const urlOf = (key) => {
  const [folder, slug] = PAGES[key]
  return folder ? `/${folder}/${slug}/` : `/${slug}/`
}

// GitHub-style slug, the same rule the source files' anchors were written against.
const slugify = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')

// Split one file into sections, tracking code fences so `#` comments in code are not headings.
function sectionsOf(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  const lines = body.split('\n')
  const sections = []
  let current = null
  let fence = null
  for (const line of lines) {
    const f = line.match(/^\s*(```+|~~~+)/)
    if (f) {
      if (!fence) fence = f[1]
      else if (line.trim().startsWith(fence)) fence = null
    }
    if (!fence && /^# /.test(line)) continue // the file title; each page gets its own
    const h2 = !fence && line.match(/^## (.+)$/)
    if (h2) {
      current = { title: h2[1].trim(), key: slugify(h2[1]), lines: [] }
      sections.push(current)
      continue
    }
    if (current) current.lines.push(line)
  }
  return sections
}

const all = FILES.flatMap((file) =>
  sectionsOf(readFileSync(join(SRC, file), 'utf8')).map((s) => ({ ...s, file })),
)

// Source links use anchors numbered across the whole file (GitHub style); the rendered page
// numbers repeated headings within the page. Map file anchor -> { page, anchor on that page }.
const anchors = new Map() // `${file}#${fileAnchor}` -> { page, anchor }
const fileSeen = new Map()
for (const s of all) {
  if (!PAGES[s.key]) throw new Error(`No page for section "${s.title}" (${s.key})`)
  const fseen = fileSeen.get(s.file) ?? new Map()
  fileSeen.set(s.file, fseen)
  const count = (seen, base) => {
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n ? `${base}-${n}` : base
  }
  anchors.set(`${s.file}#${count(fseen, s.key)}`, { page: s.key, anchor: null })
  const pseen = new Map()
  let fence = null
  for (const line of s.lines) {
    const f = line.match(/^\s*(```+|~~~+)/)
    if (f) fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]
    const h = !fence && line.match(/^#{3,6} (.+)$/)
    if (h) {
      const base = slugify(h[1])
      anchors.set(`${s.file}#${count(fseen, base)}`, { page: s.key, anchor: count(pseen, base) })
    }
  }
}

const unresolved = []
function rewriteLinks(line, own) {
  return line.replace(/\]\((?:([0-9]-[a-z-]+\.md))?#([^)\s]+)\)/g, (whole, file, anchor) => {
    const hit = anchors.get(`${file ?? own.file}#${anchor}`)
    if (!hit) {
      unresolved.push(`${own.key}: ${file ?? ''}#${anchor}`)
      return whole
    }
    if (hit.page === own.key) return hit.anchor ? `](#${hit.anchor})` : '](#_top)'
    return hit.anchor ? `](${urlOf(hit.page)}#${hit.anchor})` : `](${urlOf(hit.page)})`
  })
}

const yaml = (s) => JSON.stringify(s)
const DRAFT = 'Draft. This guide is under review and may change before Fawtir publishes it.'
const firstSentence = (lines) => {
  const p = lines.find((l) => l.trim() && !/^[#|>`<-]/.test(l.trim()) && !/^\d+\./.test(l.trim()))
  if (!p) return ''
  const s = p
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`]/g, '')
    .trim()
  const m = s.match(/^(.+?[.:])(\s|$)/)
  return (m ? m[1] : s).slice(0, 200)
}

for (const dir of ['get-started', 'api', 'integrate', 'reference', 'go-live']) {
  rmSync(join(OUT, dir), { recursive: true, force: true })
}

for (const s of all) {
  const [folder, slug, label, order] = PAGES[s.key]
  let fence = null
  const out = s.lines.map((line) => {
    const f = line.match(/^\s*(```+|~~~+)/)
    if (f) fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]
    if (fence || f) return line
    // The page title is the h1, so every heading moves up one level.
    const h = line.match(/^(#{3,6}) (.+)$/)
    if (h) return `${'#'.repeat(h[1].length - 1)} ${h[2]}`
    return rewriteLinks(line, s)
  })
  while (out.length && !out[0].trim()) out.shift()
  const shown = transform(out)
  const front = [
    '---',
    `title: ${yaml(s.title)}`,
    `description: ${yaml(firstSentence(s.lines))}`,
    'sidebar:',
    `  label: ${yaml(label)}`,
    `  order: ${order}`,
    'banner:',
    `  content: ${yaml(DRAFT)}`,
    '---',
    '',
  ].join('\n')
  const dir = folder ? join(OUT, folder) : OUT
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${slug}.md`), front + shown.join('\n').trimEnd() + '\n')
}

// Hand-written pages (source/extra) that are not part of the four reviewed files.
const EXTRA = { 'sandbox.md': 'get-started' }
for (const [file, folder] of Object.entries(EXTRA)) {
  const text = readFileSync(join(SRC, 'extra', file), 'utf8').replace(
    /^---\n/,
    `---\nbanner:\n  content: ${yaml(DRAFT)}\n`,
  )
  writeFileSync(join(OUT, folder, file), text)
}

if (unresolved.length) {
  console.error('Unresolved links:\n' + unresolved.join('\n'))
  process.exit(1)
}
console.log(`Wrote ${all.length} pages, every cross-link resolved.`)
