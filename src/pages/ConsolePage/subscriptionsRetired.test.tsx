import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import App from '../../App'

/** The sample-data subscription screens are retired: old links land on the real screens. */
describe('Console › retired subscription screens', () => {
  beforeEach(async () => {
    resetSharedRequests()
    await i18n.changeLanguage('en')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.pushState({}, '', '/')
    vi.restoreAllMocks()
  })

  it.each([
    ['/console/subscriptions', '/console/tenants'],
    ['/console/subscriptions/invoices', '/console/billing/payments'],
  ])('%s leads to %s', async (from, to) => {
    window.history.pushState({}, '', from)
    const replaced = vi.spyOn(window.history, 'replaceState')
    render(<App />)
    // Without a session the shell may then leave for Login; the redirect is the first replacement.
    const urls = () => replaced.mock.calls.map((call) => call[2]).filter((url) => url != null)
    await waitFor(() => expect(urls().length).toBeGreaterThan(0))
    expect(new URL(String(urls()[0]), window.location.origin).pathname).toBe(to)
  })
})
