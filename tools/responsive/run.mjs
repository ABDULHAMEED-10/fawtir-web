/**
 * The responsive audit and the desktop regression gate.
 *
 *   node tools/responsive/run.mjs sweep      how far every screen bleeds sideways, at every width
 *   node tools/responsive/run.mjs baseline   record what the desktop looks like today
 *   node tools/responsive/run.mjs check      prove the desktop still looks exactly like that
 *
 * `check` is the one that matters. The whole responsive effort is built on the promise that the
 * large-screen design does not move, and headless Chrome renders this app deterministically, so
 * that promise can be a checksum rather than an opinion.
 *
 * Options: --no-build (measure the existing dist), --port <n>, --routes <a,b,c>.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_ROUTES, WIDTHS, FROZEN_WIDTH, UNSTABLE_ROUTES } from './seed-routes.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const SHOTS = join(HERE, '.shots')
const ROUTES_FILE = join(HERE, 'routes.json')
const BASELINE_FILE = join(HERE, `baseline-${FROZEN_WIDTH}.json`)

const args = process.argv.slice(2)
const command = args.find((a) => !a.startsWith('--')) ?? 'sweep'
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const PORT = Number(flag('port', 4188))
const BASE = `http://localhost:${PORT}`
/** Overflow at or below this is sub-pixel rounding, not a layout fault. */
const NOISE = 2

const SHOULD_BUILD = !args.includes('--no-build')

/* ------------------------------------------------------------------ chrome */

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]
  const found = candidates.find((p) => p && existsSync(p))
  if (!found) {
    throw new Error('Chrome not found. Set CHROME=/path/to/chrome and try again.')
  }
  return found
}

const CHROME = findChrome()

/** Every launch shares one throwaway profile, so first-run setup happens once. */
function chrome(extraArgs, { timeout = 180_000 } = {}) {
  return execFileSync(
    CHROME,
    [
      '--headless=old',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--disable-extensions',
      `--user-data-dir=${join(SHOTS, 'profile').replaceAll('\\', '/')}`,
      ...extraArgs,
    ],
    { timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
}

/* ------------------------------------------------------------------ server */

async function reachable() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function withServer(run) {
  if (SHOULD_BUILD) {
    process.stdout.write('building… ')
    execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'ignore', shell: true })
    process.stdout.write('done\n')
  }

  if (await reachable()) {
    console.log(`using the preview server already on ${BASE}\n`)
    return run()
  }

  console.log(`starting vite preview on ${PORT}…`)
  const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', shell: true, detached: false },
  )
  try {
    for (let i = 0; i < 40; i++) {
      if (await reachable()) break
      await new Promise((r) => setTimeout(r, 250))
    }
    if (!(await reachable())) throw new Error(`preview server never came up on ${BASE}`)
    return await run()
  } finally {
    server.kill()
  }
}

/* ------------------------------------------------------------------- sweep */

/**
 * The audit page has to be served from the same origin as the app, or the iframe is cross-origin
 * and unreadable. So it is written into dist for the run and removed afterwards.
 */
function writeAuditPage() {
  const script = readFileSync(join(HERE, 'audit-page.js'), 'utf8')
  const html = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0}iframe{border:0;height:900px}pre{font:11px monospace}</style>
<iframe id="f" src="/dashboard"></iframe><pre id="out">running</pre>
<script>window.__ROUTES=${JSON.stringify(SEED_ROUTES)};window.__WIDTHS=${JSON.stringify(WIDTHS)}</script>
<script>${script}</script>`
  const path = join(ROOT, 'dist', '__audit.html')
  writeFileSync(path, html)
  return path
}

async function sweep() {
  const pagePath = writeAuditPage()
  try {
    const dom = chrome([
      '--window-size=1600,1000',
      '--virtual-time-budget=900000',
      '--dump-dom',
      `${BASE}/__audit.html`,
    ], { timeout: 900_000 }) // 160+ routes × 6 widths outgrew the 3-minute default

    // Only the output element — the page's own script source contains these sentinels too.
    const pre = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
    if (!pre) throw new Error('the audit page never rendered its output element')
    const text = pre[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

    const error = text.match(/^<<<ERR ([\s\S]*) ERR>>>$/)
    if (error) throw new Error(`the audit page failed: ${error[1]}`)
    const payload = text.match(/^<<<JSON ([\s\S]*) JSON>>>$/)
    if (!payload) throw new Error(`the audit page produced no result (it said: ${text.slice(0, 200)})`)

    return JSON.parse(payload[1])
  } finally {
    rmSync(pagePath, { force: true })
  }
}

function reportSweep({ seed, discovered, rows }) {
  const routes = seed.concat(discovered)
  writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2))

  console.log(`${seed.length} seed routes + ${discovered.length} discovered = ${routes.length}\n`)

  const redirected = rows.filter((r) => r.width === FROZEN_WIDTH && r.landed !== r.route)
  if (redirected.length) {
    console.log(`${redirected.length} route(s) redirected — measured where they landed:`)
    for (const r of redirected) console.log(`  ${r.route} -> ${r.landed}`)
    console.log()
  }

  console.log('OVERFLOW BY WIDTH')
  console.log('  width   routes bleeding sideways')
  for (const width of WIDTHS) {
    const at = rows.filter((r) => r.width === width)
    const bad = at.filter((r) => r.over > NOISE)
    const mark = width >= FROZEN_WIDTH ? '  <- frozen' : ''
    console.log(`  ${String(width).padStart(5)}   ${String(bad.length).padStart(3)} / ${at.length}${mark}`)
  }

  for (const width of WIDTHS) {
    const bad = rows.filter((r) => r.width === width && r.over > NOISE).sort((a, b) => b.over - a.over)
    if (!bad.length) continue
    console.log(`\n${width}px — ${bad.length} route(s)`)
    for (const r of bad.slice(0, 20)) {
      console.log(`  ${String(r.over).padStart(5)}px  ${r.route}`)
      for (const c of r.culprits ?? [])
        console.log(`           +${String(c.past).padStart(4)}  ${c.tag}.${c.cls}${c.text ? `  — ${c.text}` : ''}`)
    }
    if (bad.length > 20) console.log(`  … and ${bad.length - 20} more`)
  }
  console.log()
}

/* ------------------------------------------------- the desktop pixel gate */

/**
 * A tall viewport on purpose: the app scrolls inside `main`, so a 900px window would only ever
 * fingerprint what sits above the fold and a change further down would slip through.
 */
function shoot(route) {
  const file = join(SHOTS, `${route.replace(/[^a-z0-9]+/gi, '_') || 'root'}.png`)
  chrome([
    `--window-size=${FROZEN_WIDTH},2000`,
    '--virtual-time-budget=8000',
    `--screenshot=${file.replaceAll('\\', '/')}`,
    `${BASE}${route}`,
  ])
  const hash = createHash('md5').update(readFileSync(file)).digest('hex')
  rmSync(file, { force: true })
  return hash
}

/** The gate skips screens it cannot judge — see UNSTABLE_ROUTES for why each is on that list. */
function gateable(routes) {
  const skipped = routes.filter((r) => UNSTABLE_ROUTES.includes(r))
  if (skipped.length) console.log(`not fingerprintable, skipped: ${skipped.join(', ')}`)
  return routes.filter((r) => !UNSTABLE_ROUTES.includes(r))
}

function routeList() {
  const override = flag('routes', null)
  if (override) return override.split(',')
  if (existsSync(ROUTES_FILE)) return gateable(JSON.parse(readFileSync(ROUTES_FILE, 'utf8')))
  console.log('no routes.json yet — falling back to the seed list; run `sweep` to include details\n')
  return gateable(SEED_ROUTES)
}

function fingerprint(routes) {
  const hashes = {}
  routes.forEach((route, i) => {
    process.stdout.write(`\r  ${i + 1}/${routes.length}  ${route.padEnd(48).slice(0, 48)}`)
    hashes[route] = shoot(route)
  })
  process.stdout.write('\r'.padEnd(70) + '\r')
  return hashes
}

function baseline() {
  const routes = routeList()
  console.log(`fingerprinting ${routes.length} routes at ${FROZEN_WIDTH}px…`)
  const hashes = fingerprint(routes)
  writeFileSync(BASELINE_FILE, JSON.stringify(hashes, null, 2))
  console.log(`baseline written: ${routes.length} routes -> ${BASELINE_FILE}\n`)
}

function check() {
  if (!existsSync(BASELINE_FILE)) {
    throw new Error(`no baseline yet — run \`node tools/responsive/run.mjs baseline\` first`)
  }
  const before = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  // `--routes` narrows the gate to a few screens, which is what you want while iterating.
  const only = flag('routes', null)
  const routes = only ? only.split(',') : gateable(Object.keys(before))
  const missing = routes.filter((r) => !(r in before))
  if (missing.length) throw new Error(`not in the baseline: ${missing.join(', ')}`)
  console.log(`checking ${routes.length} routes against the ${FROZEN_WIDTH}px baseline…`)
  const now = fingerprint(routes)

  const changed = routes.filter((r) => before[r] !== now[r])
  if (!changed.length) {
    console.log(`DESKTOP UNCHANGED — all ${routes.length} routes identical at ${FROZEN_WIDTH}px\n`)
    return
  }
  console.log(`DESKTOP MOVED on ${changed.length} of ${routes.length} routes:\n`)
  for (const r of changed) console.log(`  ${r}`)
  console.log(
    '\nEvery one of these must be an intended shell change or be reverted.' +
      '\nOnce reviewed and accepted, re-run `baseline` to adopt the new state.\n',
  )
  process.exitCode = 1
}

/* -------------------------------------------------------------------- main */

/**
 * Start from a browser that remembers nothing.
 *
 * The app keeps the chosen language in `localStorage`, so a single stray click on العربية — in a
 * probe, or in a run that was interrupted — leaves the profile rendering the whole app right to
 * left, and every route's fingerprint changes for a reason that has nothing to do with the code.
 * That happened once; a clean profile per run makes it impossible.
 */
rmSync(join(SHOTS, 'profile'), { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })

await withServer(async () => {
  if (command === 'sweep') reportSweep(await sweep())
  else if (command === 'baseline') baseline()
  else if (command === 'check') check()
  else throw new Error(`unknown command "${command}" — expected sweep, baseline or check`)
})
