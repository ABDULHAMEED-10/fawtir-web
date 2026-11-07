import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import QRCode from 'qrcode'
import { useServerQrImage } from './useServerQr'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }))

/**
 * QW4R-6 (R6): the image is tied to the payload it was made from. A component kept mounted while
 * the payload changes (InvoiceDetailsPage moving from one invoice to the next) must not show the
 * previous invoice's QR as drawn while the new one is encoding.
 */
describe('useServerQrImage across payloads', () => {
  afterEach(() => vi.mocked(QRCode.toDataURL).mockReset())

  it('reads as encoding for a new payload, never as the previous image', async () => {
    let finishB: ((url: string) => void) | null = null
    vi.mocked(QRCode.toDataURL)
      .mockImplementationOnce((async () => 'data:image/png;base64,A') as never)
      .mockImplementationOnce((() =>
        new Promise<string>((resolve) => {
          finishB = resolve
        })) as never)
    const { result, rerender } = renderHook(({ payload }) => useServerQrImage(payload), {
      initialProps: { payload: 'PAYLOAD-A' as string | null },
    })
    await waitFor(() => expect(result.current).toEqual({ status: 'drawn', image: 'data:image/png;base64,A' }))
    rerender({ payload: 'PAYLOAD-B' })
    expect(result.current).toEqual({ status: 'encoding' })
    finishB!('data:image/png;base64,B')
    await waitFor(() => expect(result.current).toEqual({ status: 'drawn', image: 'data:image/png;base64,B' }))
    rerender({ payload: null })
    expect(result.current).toEqual({ status: 'none' })
  })
})
