import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadPaymobPixel,
  PAYMOB_PIXEL_SDK,
  PIXEL_LOAD_TIMEOUT_MS,
  pixelOptions,
  resetPaymobPixelLoader,
} from './paymobPixel'

const sdkScripts = () => [...document.head.querySelectorAll<HTMLScriptElement>('script[data-paymob-pixel]')]

afterEach(() => {
  sdkScripts().forEach((s) => s.remove())
  delete window.Pixel
  resetPaymobPixelLoader()
  vi.useRealTimers()
})

describe('loading Paymob Pixel', () => {
  it('loads the pinned SDK from our own origin, integrity-checked, once per page', async () => {
    const first = loadPaymobPixel()
    const second = loadPaymobPixel()
    const scripts = sdkScripts()
    expect(scripts).toHaveLength(1)
    const [script] = scripts
    expect(script.getAttribute('src')).toBe('/vendor/paymob-pixel/1.2.8/main.js')
    expect(script.getAttribute('src')!.startsWith('/')).toBe(true)
    expect(script.type).toBe('module')
    expect(script.integrity).toBe(PAYMOB_PIXEL_SDK.integrity)
    expect(script.integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/)
    expect(script.crossOrigin).toBe('anonymous')

    class FakePixel {}
    window.Pixel = FakePixel as never
    script.onload!(new Event('load'))
    await expect(first).resolves.toBe(FakePixel)
    await expect(second).resolves.toBe(FakePixel)
    await expect(loadPaymobPixel()).resolves.toBe(FakePixel)
    expect(sdkScripts()).toHaveLength(1)
  })

  it('fails closed when the file is refused (integrity or network), and a later attempt loads again', async () => {
    const failed = loadPaymobPixel()
    sdkScripts()[0].onerror!(new Event('error'))
    await expect(failed).rejects.toThrow('could not be loaded')
    expect(sdkScripts()).toHaveLength(0)

    void loadPaymobPixel()
    expect(sdkScripts()).toHaveLength(1)
  })

  it('treats a script without the Pixel constructor, or one that never answers, as unavailable', async () => {
    const empty = loadPaymobPixel()
    sdkScripts()[0].onload!(new Event('load'))
    await expect(empty).rejects.toThrow('without its constructor')

    vi.useFakeTimers()
    const slow = loadPaymobPixel()
    vi.advanceTimersByTime(PIXEL_LOAD_TIMEOUT_MS)
    await expect(slow).rejects.toThrow('did not load in time')
  })
})

describe('Pixel options', () => {
  it('card only, Paymob pay button off, no saved cards, only the public key and this client secret', () => {
    const options = pixelOptions({ publicKey: 'omn_pk_test_x', clientSecret: 'omn_csk_test_y' }, 'el')
    expect(options).toMatchObject({
      publicKey: 'omn_pk_test_x',
      clientSecret: 'omn_csk_test_y',
      paymentMethods: ['card'],
      elementId: 'el',
      disablePay: true,
      showSaveCard: false,
      forceSaveCard: false,
    })
    expect(Object.keys(options).sort()).toEqual(
      ['cardValidationChanged', 'clientSecret', 'disablePay', 'elementId', 'forceSaveCard', 'paymentMethods',
        'publicKey', 'showSaveCard'].sort(),
    )
  })
})
