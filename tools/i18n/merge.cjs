/**
 * Merges a block of translations into both locale files without two writers treading on each
 * other.
 *
 *   node tools/i18n/merge.cjs path/to/keys.json
 *
 * The file holds `{ "en": {...}, "ar": {...} }`, each a nested object that is deep-merged into
 * the locale at its root (so `{ "console": { "subscriptions": {...} } }` lands under
 * `console.subscriptions`). Existing keys are overwritten only when the file names them; nothing
 * else moves. A lock directory serialises concurrent runs.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const LOCALES = { en: path.join(ROOT, 'src/i18n/locales/en.json'), ar: path.join(ROOT, 'src/i18n/locales/ar.json') }
const LOCK = path.join(ROOT, 'src/i18n/locales/.merge-lock')

const file = process.argv[2]
if (!file) throw new Error('usage: node tools/i18n/merge.cjs <keys.json>')
const block = JSON.parse(fs.readFileSync(file, 'utf8'))

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {}
      deepMerge(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

function withLock(fn) {
  const started = Date.now()
  for (;;) {
    try {
      fs.mkdirSync(LOCK)
      break
    } catch {
      if (Date.now() - started > 30_000) throw new Error('could not take the locale lock in 30 s')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
  }
  try {
    fn()
  } finally {
    fs.rmdirSync(LOCK)
  }
}

withLock(() => {
  for (const [lang, target] of Object.entries(LOCALES)) {
    if (!block[lang]) continue
    const raw = fs.readFileSync(target, 'utf8')
    const crlf = raw.includes('\r\n')
    const json = JSON.parse(raw)
    deepMerge(json, block[lang])
    let out = JSON.stringify(json, null, 2) + '\n'
    if (crlf) out = out.replace(/\n/g, '\r\n')
    fs.writeFileSync(target, out)
    console.log(`merged ${lang}: ${Object.keys(block[lang]).join(', ')}`)
  }
})
