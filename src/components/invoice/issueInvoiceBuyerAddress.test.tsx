import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { SessionContext } from '../../lib/session/session'
import type { Entitlements } from '../../lib/identity/entitlements'
import { muscatToday } from '../../lib/invoiceIssue'
import { IssueInvoiceModal } from './IssueInvoiceModal'

const ISSUER: Entitlements = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [],
  permissions: ['invoice.read', 'invoice.issue'],
  scopes: [],
  featureFlags: {},
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

/** The refusal as the server sent it on 29 Oct (e2e 30 Oct, X-1): a code, no list of fields. */
const REFUSAL = {
  detail:
    "The customer's invoice address is incomplete for Peppol (IBR-019-OM needs street, additional street, address line 3, city and postal code). Complete the customer before issuing.",
  status: 400,
  title: 'Request rejected',
  type: 'https://api.fawtir.om/problems/buyer-address-incomplete',
  code: 'BUYER_ADDRESS_INCOMPLETE',
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url).split('?')[0]
      if (path.endsWith('/issue')) return json(400, REFUSAL)
      return json(404, { type: 'about:blank' })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const refuse = async (customerId?: string) => {
  const user = userEvent.setup({ delay: null })
  const today = muscatToday()
  render(
    <MemoryRouter>
      <SessionContext.Provider value={ISSUER}>
        <IssueInvoiceModal
          invoiceId="d-1"
          version={0}
          initialIssueDate={today}
          initialDueDate={today}
          customerId={customerId}
          onClose={() => {}}
          onIssued={() => {}}
        />
      </SessionContext.Provider>
    </MemoryRouter>,
  )
  await user.click(screen.getByRole('button', { name: i18n.t('invoiceIssue.submit') }))
}

describe("Issue refused for the customer's incomplete address (IBR-019-OM)", () => {
  it('says what the address needs, not "something went wrong", and links to the customer', async () => {
    await refuse('c-42')
    expect(
      await screen.findByText(i18n.t('invoiceIssue.refused.buyerAddressIncomplete')),
    ).toBeTruthy()
    expect(screen.queryByText(/Something went wrong/)).toBeNull()
    expect(
      screen.getByRole('link', { name: i18n.t('invoiceIssue.openCustomer') }).getAttribute('href'),
    ).toBe('/customers/c-42/edit')
  })

  it('links to the customer list when the customer is not known here', async () => {
    await refuse()
    expect(
      (await screen.findByRole('link', { name: i18n.t('invoiceIssue.openCustomer') })).getAttribute(
        'href',
      ),
    ).toBe('/customers')
  })
})
