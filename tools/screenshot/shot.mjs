/**
 * Screenshots a running build of the app through the Chrome DevTools protocol: opens a page,
 * optionally switches to Arabic, clicks buttons, types into inputs or picks a file, then captures
 * the whole page and prints its scrollWidth (anything above the window width means the page
 * scrolls sideways, which is a defect).
 *
 *   node tools/screenshot/shot.mjs <out.png> <url> [--width 1440] [--ar] [--wait ms]
 *        [--text "<button, tab or menu item text>"]... [--click "<css selector>"]...
 *        [--type "<css selector>" "<value>"]... [--file "<absolute path>"]...
 *
 * Examples:
 *   node tools/screenshot/shot.mjs .design/sub/invoices.png http://localhost:4188/invoices
 *   node tools/screenshot/shot.mjs .design/sub/invoices-ar.png http://localhost:4188/invoices --ar
 *   node tools/screenshot/shot.mjs .design/sub/invoices-390.png http://localhost:4188/invoices --width 390
 *   node tools/screenshot/shot.mjs .design/sub/new-error.png http://localhost:4188/invoices/new --wait 4000 --text "Create invoice"
 *
 * Needs Google Chrome at its default Windows path. See docs/PROJECT_HANDBOOK.md, "Verifying a screen".
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const out = args.shift()
const url = args.shift()
let width = 1440
let ar = false
let wait = 1500
const actions = []
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]
  if (a === '--width') width = Number(args[++i])
  else if (a === '--ar') ar = true
  else if (a === '--wait') wait = Number(args[++i])
  else if (a === '--click') actions.push({ click: args[++i] })
  else if (a === '--text') actions.push({ text: args[++i] })
  else if (a === '--file') actions.push({ file: args[++i] })
  else if (a === '--type') actions.push({ type: args[++i], value: args[++i] })
}

const PORT = 9224 + Math.floor(Math.random() * 200)
const chrome = spawn(
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(tmpdir(), `fawtir-shot-${PORT}`)}`,
    `--window-size=${width},1200`,
    '--lang=en-GB',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function version() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      return await res.json()
    } catch {
      await sleep(200)
    }
  }
  throw new Error('chrome did not answer')
}

let id = 0
const pending = new Map()
const listeners = []
let ws

function send(method, params = {}, sessionId) {
  id += 1
  const msg = { id, method, params }
  if (sessionId) msg.sessionId = sessionId
  ws.send(JSON.stringify(msg))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function main() {
  const v = await version()
  ws = new WebSocket(v.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message))
      else p.resolve(msg.result)
    } else if (msg.method) {
      for (const l of listeners) l(msg)
    }
  }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const s = (method, params) => send(method, params, sessionId)
  await s('Page.enable')
  await s('Runtime.enable')
  await s('DOM.enable')
  listeners.push((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') console.error('page exception:', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description?.slice(0, 400))
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') console.error('console.error:', msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400))
  })
  // Wait for the app to have rendered something inside the root before acting.
  const ready = async () => {
    for (let i = 0; i < 40; i += 1) {
      const r = await s('Runtime.evaluate', { expression: 'document.querySelector("main, h1") ? "yes" : "no"' })
      if (r.result.value === 'yes') return
      await sleep(500)
    }
  }
  const navigateAndWait = async (to) => {
    await s('Page.navigate', { url: to })
    await sleep(600)
    await ready()
  }
  await s('Emulation.setDeviceMetricsOverride', { width, height: 1200, deviceScaleFactor: 1, mobile: width < 600 })
  const origin = new URL(url).origin
  if (ar) {
    await navigateAndWait(`${origin}/`)
    await s('Runtime.evaluate', { expression: `localStorage.setItem('language','ar')` })
  }
  await navigateAndWait(url)
  await sleep(wait)
  for (const action of actions) {
    if (action.file) {
      const doc = await s('DOM.getDocument', { depth: -1, pierce: true })
      const q = await s('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
      await s('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [action.file] })
      await sleep(4000)
    } else if (action.click) {
      await s('Runtime.evaluate', {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(action.click)}); if (!el) return 'missing'; el.scrollIntoView({block:'center'}); el.click(); return 'ok' })()`,
      })
    } else if (action.text) {
      const r = await s('Runtime.evaluate', {
        expression: `(() => { const els = [...document.querySelectorAll('button, a, [role=menuitem], [role=option], [role=tab]')]; const el = els.find((e) => e.textContent.trim() === ${JSON.stringify(action.text)}); if (!el) return 'missing'; el.scrollIntoView({block:'center'}); el.click(); return 'ok' })()`,
      })
      if (r.result.value !== 'ok') console.error('text not found:', action.text)
    } else if (action.type) {
      await s('Runtime.evaluate', {
        expression: `(() => { const el = document.querySelector(${JSON.stringify(action.type)}); if (!el) return 'missing'; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(action.value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return 'ok' })()`,
      })
    }
    await sleep(700)
  }
  await sleep(500)
  const { result } = await s('Runtime.evaluate', {
    expression: 'JSON.stringify({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, main: (document.querySelector("main")||document.body).scrollHeight })',
  })
  const dims = JSON.parse(result.value)
  // The shell keeps the page inside a scrolling <main>; grow the viewport so the whole page shows.
  const height = Math.min(6000, Math.max(dims.h, dims.main + 120, 900))
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  await sleep(600)
  // The viewport already holds the whole page; capturing beyond it shifts an RTL page sideways.
  const shot = await s('Page.captureScreenshot', { format: 'png' })
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`${out} ${width}x${height} (scrollWidth ${dims.w})`)
  ws.close()
  chrome.kill()
}

main().catch((error) => {
  console.error(error)
  chrome.kill()
  process.exit(1)
})
