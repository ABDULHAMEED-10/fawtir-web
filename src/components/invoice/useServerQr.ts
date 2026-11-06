import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * The image of a QR payload the server supplied, encoded exactly as given. The payload is never
 * built or completed on the device: the receipt QR is the backend's (owner policy, B2C only), read
 * in the server's frozen, filed, live order (QR E-3), so a payload worked out here could differ from
 * the one already printed or filed. Undefined while encoding, and when there is no payload.
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
