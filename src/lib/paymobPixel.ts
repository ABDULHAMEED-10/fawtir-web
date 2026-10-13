/**
 * Paymob Pixel, Paymob's own embedded card form, for the signup Payment screen. Not used yet:
 * card at signup stays off until the backend opens a signup card session and the embedded form is
 * tested in a real browser (docs/billing/paymob-oman-contract.md in the backend, 13 Oct 2026).
 *
 * The browser only ever receives the public key and one intention's client secret, both handed
 * over by the backend for that payment. Card numbers are typed into Paymob's frames, never into a
 * Fawtir field, and nothing here reads, stores or logs them.
 *
 * The SDK is served from our own origin, pinned and integrity-checked, so the site's
 * `script-src 'self'` stands: no third-party script host is trusted at run time.
 */

/**
 * Pinned `paymob-pixel` release. `integrity` is the SHA-384 of its `main.js`, identical to the npm
 * tarball whose sha512 matches the registry's `dist.integrity`; a changed file is refused by the
 * browser instead of being run.
 */
export const PAYMOB_PIXEL_SDK = {
  version: '1.2.8',
  src: '/vendor/paymob-pixel/1.2.8/main.js',
  integrity: 'sha384-4ITAGSF5NsYiL+fauejz88cmuuYkGC7Yw0lgzHATTP0n/Az+BPASNgkDC5PfA1cM',
} as const

/** What the backend hands over for one payment; nothing else reaches the browser. */
export type PixelSession = {
  publicKey: string
  clientSecret: string
}

export type PixelOptions = {
  publicKey: string
  clientSecret: string
  paymentMethods: Array<'card'>
  elementId: string
  disablePay: boolean
  showSaveCard: boolean
  forceSaveCard: boolean
  cardValidationChanged?: (valid: boolean) => void
}

type PixelConstructor = new (options: PixelOptions) => unknown

declare global {
  interface Window {
    Pixel?: PixelConstructor
  }
}

/** A loaded SDK that never answered within this time is treated as unavailable. */
export const PIXEL_LOAD_TIMEOUT_MS = 20_000

let loading: Promise<PixelConstructor> | null = null

/**
 * Loads the pinned SDK once per page and resolves its `Pixel` constructor. A failed or timed-out
 * load is not cached, so a later attempt can try again.
 */
export function loadPaymobPixel(doc: Document = document): Promise<PixelConstructor> {
  const win = doc.defaultView
  if (win?.Pixel) return Promise.resolve(win.Pixel)
  if (loading) return loading
  loading = new Promise<PixelConstructor>((resolve, reject) => {
    const script = doc.createElement('script')
    script.type = 'module'
    script.src = PAYMOB_PIXEL_SDK.src
    script.integrity = PAYMOB_PIXEL_SDK.integrity
    script.crossOrigin = 'anonymous'
    script.dataset.paymobPixel = PAYMOB_PIXEL_SDK.version
    const timer = setTimeout(() => fail(new Error('Paymob Pixel did not load in time')), PIXEL_LOAD_TIMEOUT_MS)
    function fail(error: Error) {
      clearTimeout(timer)
      loading = null
      script.remove()
      reject(error)
    }
    script.onload = () => {
      clearTimeout(timer)
      const Pixel = doc.defaultView?.Pixel
      if (Pixel) resolve(Pixel)
      else fail(new Error('Paymob Pixel loaded without its constructor'))
    }
    script.onerror = () => fail(new Error('Paymob Pixel could not be loaded'))
    doc.head.appendChild(script)
  })
  return loading
}

/**
 * The options Fawtir mounts Pixel with. Card only; Paymob's own pay button stays off, so paying is
 * a deliberate step the screen triggers once the rest of the application is valid, and cards are
 * never saved for later charges (auto-renew and saved cards are not offered).
 */
export function pixelOptions(
  session: PixelSession,
  elementId: string,
  onValidation?: (valid: boolean) => void,
): PixelOptions {
  return {
    publicKey: session.publicKey,
    clientSecret: session.clientSecret,
    paymentMethods: ['card'],
    elementId,
    disablePay: true,
    showSaveCard: false,
    forceSaveCard: false,
    cardValidationChanged: onValidation,
  }
}

/** For tests: forget a cached load. */
export function resetPaymobPixelLoader() {
  loading = null
}
