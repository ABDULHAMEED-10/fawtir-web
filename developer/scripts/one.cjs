const { chromium } = require('playwright')
;(async () => {
  const [, , url, out, theme = 'light'] = process.argv
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript((t) => localStorage.setItem('starlight-theme', t), theme)
  const p = await ctx.newPage()
  await p.goto(url, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1000)
  await p.screenshot({ path: out })
  await b.close()
})()
