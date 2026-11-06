import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * The image of a QR payload, encoded exactly as given: the server's (read frozen, filed, live, QR
 * E-3), or for a sale queued offline the one `posOfflineQr` built and sends as `printedQr` (E-1).
 * The image never builds or completes a payload itself, so it cannot differ from the one printed or
 * filed. Undefined while encoding, and when there is no payload.
 */
export function useServerQr(payload: string | null | undefined): string | undefined {
  const [image, setImage] = useState<string>()

  useEffect(() => {
    let cancelled = false
    if (!payload) {
      setImage(undefined)
      return
    }
    QRCode.toDataURL(payload, { margin: 0, width: 240, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setImage(url)
      })
      .catch(() => {
        // A missing QR must not blank the document; the rest of the sheet still prints.
        if (!cancelled) setImage(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [payload])

  return image
}
