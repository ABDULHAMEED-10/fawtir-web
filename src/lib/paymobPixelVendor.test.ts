import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAYMOB_PIXEL_SDK } from './paymobPixel'

// The browser refuses a file whose hash differs from the integrity attribute, which would leave card
// at signup silently unavailable: the self-hosted copy must stay byte-identical to the pinned release.
describe('self-hosted Paymob Pixel', () => {
  it('serves exactly the pinned release the integrity attribute names', () => {
    const file = readFileSync(resolve(__dirname, '../../public', PAYMOB_PIXEL_SDK.src.slice(1)))
    const sri = `sha384-${createHash('sha384').update(file).digest('base64')}`
    expect(sri).toBe(PAYMOB_PIXEL_SDK.integrity)
    expect(PAYMOB_PIXEL_SDK.src).toContain(`/${PAYMOB_PIXEL_SDK.version}/`)
  })
})
