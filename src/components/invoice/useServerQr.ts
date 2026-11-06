import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * The image of a QR payload, encoded exactly as given: the server's (read frozen, filed, live, QR
 * E-3), or for a sale queued offline the one `posOfflineQr` built and sends as `printedQr` (E-1).
 * The image never builds or completes a payload itself, so it cannot differ from the one printed or
 * filed. Undefined while encoding, and when there is no payload.
 */
export function useServerQr(payload: string | null | undefined): string | undefined {
  const qr = useServerQrImage(payload)
  return qr.status === 'drawn' ? qr.image : undefined
}

export type ServerQrImage =
  | { status: 'none' | 'encoding' | 'failed' }
  | { status: 'drawn'; image: string }

/**
 * `useServerQr` with "still encoding" told apart from "could not be encoded", for a page that must
 * not claim a QR it has not drawn (review QW3R-3): the result is tied to the payload it was made
 * from, so a new payload reads as encoding, never as the previous one's image.
 */
export function useServerQrImage(payload: string | null | undefined): ServerQrImage {
  const [made, setMade] = useState<{ payload: string; image: string | null } | null>(null)

  useEffect(() => {
    if (!payload) return
    let cancelled = false
    QRCode.toDataURL(payload, { margin: 0, width: 240, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setMade({ payload, image: url })
      })
      .catch(() => {
        // A missing QR must not blank the document; the rest of the sheet still prints.
        if (!cancelled) setMade({ payload, image: null })
      })
    return () => {
      cancelled = true
    }
  }, [payload])

  if (!payload) return { status: 'none' }
  if (made?.payload !== payload) return { status: 'encoding' }
  return made.image ? { status: 'drawn', image: made.image } : { status: 'failed' }
}
