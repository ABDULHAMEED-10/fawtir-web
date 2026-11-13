// Presentation-only changes to the guide text. Every word stays; only the markup around it
// changes, and scripts/audit.mjs proves no word was lost.
//
// 1. `> **Note:**`, `> **Warning:**`, `> **Recommendation:**` blockquotes become callout boxes.
// 2. The guide's four rule labels become badges, so a reader sees at a glance where a rule
//    comes from (the guide's own "How to read the rules in this guide").

const CALLOUTS = {
  Note: ':::note',
  Warning: ':::caution[Warning]',
  Recommendation: ':::tip[Recommendation]',
}

const LABELS = [
  ['FAWTIR rule', 'fawtir'],
  ['PINT-OM rule', 'pint'],
  ['Regulation (OTA)', 'ota'],
  ['Recommendation', 'advice'],
]
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function badges(line) {
  for (const [label, kind] of LABELS) {
    // **Label:**  **Label**:  **Label**  (the colon, when there is one, is kept)
    line = line.replace(
      new RegExp(`\\*\\*${esc(label)}(:?)\\*\\*(:?)`, 'g'),
      (_, a, b) => `<span class="rule rule--${kind}">${label}</span>${a || b}`,
    )
  }
  return line
}

// A badge that opens a sentence is its own lead-in: the colon after it would only dangle.
const leadIn = (line) =>
  line.replace(/^((?:\d+\. |- )?<span class="rule [^"]+">[^<]+<\/span>):/, '$1')

export function transform(lines) {
  const out = []
  let fence = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const f = line.match(/^\s*(```+|~~~+)/)
    if (f) fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]
    if (fence || f) {
      out.push(line)
      continue
    }
    const c = line.match(/^> \*\*(Note|Warning|Recommendation):\*\*\s?(.*)$/)
    if (c) {
      const body = [c[2]]
      while (i + 1 < lines.length && /^>/.test(lines[i + 1]))
        body.push(lines[++i].replace(/^> ?/, ''))
      out.push(CALLOUTS[c[1]], ...body.map((l) => leadIn(badges(l))), ':::')
      continue
    }
    out.push(leadIn(badges(line)))
  }
  return out
}
