// Every internal link in the built site must reach a page, and every #anchor an id on it.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const DIST = new URL('../dist/', import.meta.url).pathname
const files = []
const walk = (d) =>
  readdirSync(d).forEach((f) => {
    const p = join(d, f)
    statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && files.push(p)
  })
walk(DIST)
const ids = new Map()
const idsOf = (file) => {
  if (!ids.has(file))
    ids.set(
      file,
      new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
    )
  return ids.get(file)
}
let bad = 0
for (const file of files) {
  const html = readFileSync(file, 'utf8')
  const page = '/' + file.slice(DIST.length).replace(/index\.html$/, '')
  for (const [, href] of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
    if (/^(https?:|mailto:)/.test(href)) continue
    const [path, anchor] = href.split('#')
    const target = path ? join(DIST, path, path.endsWith('/') ? 'index.html' : '') : file
    if (!existsSync(target)) {
      bad++
      console.log(`${page} -> ${href} (no page)`)
      continue
    }
    if (anchor && anchor !== '_top' && !idsOf(target).has(decodeURIComponent(anchor))) {
      bad++
      console.log(`${page} -> ${href} (no anchor)`)
    }
  }
}
console.log(bad ? `${bad} broken links` : `All internal links resolve (${files.length} pages).`)
process.exit(bad ? 1 : 0)
