// A reader whose device is in dark mode, with an old "dark" choice saved, still gets the light
// docs, and the page has no theme switcher.
const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
  await ctx.addInitScript(() => localStorage.setItem('starlight-theme', 'dark'))
  const p = await ctx.newPage()
  for (const path of ['/', '/get-started/quick-start/', '/ar/']) {
    await p.goto('http://localhost:4321' + path, { waitUntil: 'networkidle' })
    await p.waitForTimeout(800)
    const r = await p.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.body).backgroundColor,
      switcher: !!document.querySelector('starlight-theme-select'),
    }))
    console.log(path, JSON.stringify(r))
  }
  await p.goto('http://localhost:4321/', { waitUntil: 'networkidle' })
  await p.screenshot({ path: process.argv[2] })
  await b.close()
})()
