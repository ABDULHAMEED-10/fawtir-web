import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { PaymobPixelCard } from './PaymobPixelCard'
import { resetPaymobPixelLoader } from '../../lib/paymobPixel'

const SESSION = { publicKey: 'omn_pk_test_public', clientSecret: 'omn_csk_test_one' }
const sdkScript = () => document.head.querySelector<HTMLScriptElement>('script[data-paymob-pixel]')

afterEach(() => {
  document.head.querySelectorAll('script[data-paymob-pixel]').forEach((s) => s.remove())
  delete window.Pixel
  resetPaymobPixelLoader()
})

describe('PaymobPixelCard', () => {
  it("mounts Paymob's form once, into its own container, and renders no card field of its own", async () => {
    const constructed: Array<Record<string, unknown>> = []
    const log = vi.spyOn(console, 'log')
    render(
      <StrictMode>
        <PaymobPixelCard session={SESSION} />
      </StrictMode>,
    )
    expect(screen.getByText(/Loading the secure card form/)).toBeTruthy()
    window.Pixel = class {
      constructor(options: Record<string, unknown>) {
        constructed.push(options)
      }
    } as never
    await act(async () => {
      sdkScript()!.onload!(new Event('load'))
    })

    expect(constructed).toHaveLength(1)
    const container = screen.getByTestId('paymob-pixel')
    expect(constructed[0]).toMatchObject({ elementId: container.id, paymentMethods: ['card'], disablePay: true })
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(0)
    expect(document.querySelectorAll('input')).toHaveLength(0)
    expect(screen.queryByText(/Loading the secure card form/)).toBeNull()
    expect(log.mock.calls.flat().join(' ')).not.toContain(SESSION.clientSecret)
    log.mockRestore()
  })

  it('says the form is unavailable when the SDK cannot be loaded, without retrying on its own', async () => {
    render(<PaymobPixelCard session={SESSION} />)
    await act(async () => {
      sdkScript()!.onerror!(new Event('error'))
    })
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't be loaded/)
    expect(sdkScript()).toBeNull()
  })

  it('removes the form when the screen is left', async () => {
    window.Pixel = class {
      constructor(options: { elementId: string }) {
        document.getElementById(options.elementId)!.appendChild(document.createElement('iframe'))
      }
    } as never
    const { unmount } = render(<PaymobPixelCard session={SESSION} />)
    await act(async () => {})
    const container = screen.getByTestId('paymob-pixel')
    expect(container.querySelector('iframe')).not.toBeNull()
    unmount()
    expect(container.childElementCount).toBe(0)
  })
})
