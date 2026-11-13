// Screenshots of the docs site: node scripts/shots.cjs <out dir> [name ...]
const { chromium } = require('playwright')
const out = process.argv[2]
const only = process.argv.slice(3)
const B = 'http://localhost:4321'
const shots = [
  ['home-en', '/', 1440, 'light', true],
  ['home-dark', '/', 1440, 'dark', false],
  ['quick-start-en', '/get-started/quick-start/', 1440, 'light', false],
  [
    'callouts-en',
    '/get-started/quick-start/#31-prepare-a-sample-of-your-erps-invoice',
    1440,
    'light',
    false,
  ],
  ['errors-en', '/reference/errors/', 1440, 'light', false],
  ['home-ar', '/ar/', 1440, 'light', true],
  ['home-390', '/', 390, 'light', true],
  ['auth-390', '/get-started/authentication/', 390, 'light', false],
]
;(async () => {
  const browser = await chromium.launch()
  for (const [name, path, width, theme, full] of shots) {
    if (only.length && !only.includes(name)) continue
    const ctx = await browser.newContext({
      viewport: { width, height: width < 500 ? 844 : 900 },
      deviceScaleFactor: 1,
    })
    await ctx.addInitScript((t) => localStorage.setItem('starlight-theme', t), theme)
    const page = await ctx.newPage()
    await page.goto(B + path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    console.log(name, sw.join('/'))
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: full })
    await ctx.close()
  }
  await browser.close()
})()
