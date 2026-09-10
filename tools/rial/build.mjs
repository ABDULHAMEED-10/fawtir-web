// Rebuilds every copy of the Omani rial sign in src/assets from one outline.
//
//   node tools/rial/build.mjs
//
// The outline is the Bold weight of the sign the Central Bank of Oman published on 19 Nov 2025
// (cbo.gov.om/omrsymbol, "The Omani Rial symbol (SVG)"). That download draws it at 1.52:1, but the
// bank's own Omani Rial Symbol Guidelines (p. 16, "Proportions: the shape of the symbol should be
// maintained") show the correct shape at 1.86:1, and so does the bank's gold-on-blue launch art
// the client sent as the reference (1.865:1). The bars and the curl match both once the height is
// scaled by FLATTEN, so the outline is not redrawn, only flattened to the published proportion.
//
// Each asset keeps the width it had, so the <img> tags that size it by width stay put and only
// the height changes. `preserveAspectRatio="none"` is gone from all of them: with it, any box of
// the wrong shape stretched the sign, which is how it ended up looking taller than it is.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const FLATTEN = 0.8175

/** CBO Bold outline, as published (its own coordinate space). */
const OUTLINE =
  'M2044.8,451.3c-6.5-11.2-11.8-23.3-14.1-36.1-1.6-9-1.4-18.5.3-27.7,6.8-5,14.8-8.3,23.6-9.5,8.7-1.2,17.1-.4,25.2,3,8.5,3.5,16,9.1,22.8,15.1,7.6,6.8,20.8,22.4,20.8,22.4l23.5-40.7c-8.8-11-18.4-21.6-29.9-29.8-5.7-4.1-12-7.6-18.8-9.6-6.4-1.9-12.9-2.1-19.4-1.3-11.4,1.4-22.2,6.3-30.2,14.5-6.5,6.6-32.9,50-37.4,63.4-3.7,11-5.6,23.1-4.7,34.6,0,.5,0,1,.2,1.5h-39.8l-23.5,40.7h77.9c7.8,13.5,17.6,26,28.7,37h-127.9l-23.5,40.7h286.7l23.5-40.7h-62.5c-26.1-3.5-50.1-19.2-68.9-37h152.7l23.5-40.7h-208.7v.2Z'

const ASSETS = [
  // [file, frame width, frame height or null for a tight box, glyph width, glyph centre x, centre y]
  ['brand/omr.svg', 32, null, 32],
  ['create-invoice/omr.svg', 20, null, 20],
  ['invoices/omr-row.svg', 20, null, 20],
  ['invoices/omr.svg', 26.6667, null, 26.6667],
  ['order-forms-v2/omr.svg', 32, 32, 26.6667, 16, 16.2865],
  ['quotations/omr-lg.svg', 32, 32, 26.6667, 16, 16.2865],
  ['quotations/omr-row.svg', 24, 24, 20, 12, 12.2149],
]

/* ------------------------------------------------------------------ path maths */

function tokens(d) {
  return d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g)
}

/** Absolute M/L/C/Z only — every relative or shorthand command resolved. */
function absolute(d) {
  const t = tokens(d)
  const out = []
  let i = 0
  let cmd = ''
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let cx = 0
  let cy = 0
  const num = () => parseFloat(t[i++])
  while (i < t.length) {
    if (/[a-zA-Z]/.test(t[i])) cmd = t[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M': {
        x = ox + num()
        y = oy + num()
        sx = x
        sy = y
        out.push(['M', x, y])
        cmd = rel ? 'l' : 'L'
        cx = x
        cy = y
        break
      }
      case 'L': {
        x = ox + num()
        y = oy + num()
        out.push(['L', x, y])
        cx = x
        cy = y
        break
      }
      case 'H': {
        x = (rel ? x : 0) + num()
        out.push(['L', x, y])
        cx = x
        cy = y
        break
      }
      case 'V': {
        y = (rel ? y : 0) + num()
        out.push(['L', x, y])
        cx = x
        cy = y
        break
      }
      case 'C': {
        const x1 = ox + num()
        const y1 = oy + num()
        const x2 = ox + num()
        const y2 = oy + num()
        x = ox + num()
        y = oy + num()
        out.push(['C', x1, y1, x2, y2, x, y])
        cx = x2
        cy = y2
        break
      }
      case 'S': {
        const x1 = 2 * x - cx
        const y1 = 2 * y - cy
        const x2 = ox + num()
        const y2 = oy + num()
        x = ox + num()
        y = oy + num()
        out.push(['C', x1, y1, x2, y2, x, y])
        cx = x2
        cy = y2
        break
      }
      case 'Z': {
        x = sx
        y = sy
        out.push(['Z'])
        cx = x
        cy = y
        break
      }
      default:
        throw new Error(`Unhandled path command ${cmd}`)
    }
  }
  return out
}

/** Where a cubic's coordinate turns back on itself, as parameters inside (0, 1). */
function turns(a, b, c, d) {
  const qa = -a + 3 * b - 3 * c + d
  const qb = 2 * (a - 2 * b + c)
  const qc = b - a
  if (Math.abs(qa) < 1e-12) return Math.abs(qb) < 1e-12 ? [] : [-qc / qb]
  const disc = qb * qb - 4 * qa * qc
  if (disc < 0) return []
  const r = Math.sqrt(disc)
  return [(-qb + r) / (2 * qa), (-qb - r) / (2 * qa)]
}

const at = (a, b, c, d, t) =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d

/** The outline's true box — the curl's top is on a curve, not at a point of the path. */
function bounds(segments) {
  const xs = []
  const ys = []
  let x = 0
  let y = 0
  for (const [c, ...p] of segments) {
    if (c === 'C') {
      const [x1, y1, x2, y2, x3, y3] = p
      for (const t of turns(x, x1, x2, x3)) if (t > 0 && t < 1) xs.push(at(x, x1, x2, x3, t))
      for (const t of turns(y, y1, y2, y3)) if (t > 0 && t < 1) ys.push(at(y, y1, y2, y3, t))
    }
    if (p.length) {
      x = p[p.length - 2]
      y = p[p.length - 1]
      xs.push(x)
      ys.push(y)
    }
  }
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

const round = (n) => +n.toFixed(3)

function place(segments, box, width, left, top) {
  const s = width / box.w
  return segments
    .map(([c, ...p]) => {
      const q = p.map((v, k) =>
        k % 2 === 0 ? left + (v - box.x) * s : top + (v - box.y) * s * FLATTEN,
      )
      return c + q.map(round).join(' ')
    })
    .join('')
}

/* ---------------------------------------------------------------------- write */

const segments = absolute(OUTLINE)
const box = bounds(segments)
console.log(`outline ${round(box.w)}×${round(box.h)} → ${round(box.w / (box.h * FLATTEN))}:1`)
const root = join(dirname(fileURLToPath(import.meta.url)), '../../src/assets')

for (const [file, frameW, frameH, width, centreX, centreY] of ASSETS) {
  const height = (width / box.w) * box.h * FLATTEN
  const w = frameW
  const h = frameH ?? height
  const left = frameH ? centreX - width / 2 : 0
  const top = frameH ? centreY - height / 2 : 0
  const d = place(segments, box, width, left, top)
  const svg = `<svg width="${round(w)}" height="${round(h)}" viewBox="0 0 ${round(w)} ${round(h)}" fill="none" xmlns="http://www.w3.org/2000/svg">\n<path d="${d}" fill="#2C3342"/>\n</svg>\n`
  writeFileSync(join(root, file), svg)
  console.log(`${file}  ${round(w)}×${round(h)}`)
}
