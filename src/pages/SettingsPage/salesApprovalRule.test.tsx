import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { SalesApprovalRuleDto } from '../../api/invoices/salesApproval'
import { ApprovalPolicyPage } from './ApprovalPolicyPage'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'admin.settings.manage'],
  scopes: [],
  featureFlags: {},
}
const READER: Entitlements = { ...ADMIN, permissions: ['invoice.read'] }

const RULE: SalesApprovalRuleDto = {
  version: 0,
  enabled: false,
  covers: { invoice: true, creditNote: true, debitNote: true, selfBilled: false },
  requiredApprovals: 1,
  autoApproveBelow: null,
  reason: null,
  updatedBy: null,
  updatedAt: null,
  approverCount: 1,
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let who: Entitlements
let ruleResponse: () => Response
let sent: unknown

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  sent = null
  ruleResponse = () => json(200, RULE)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/v1/me/entitlements')) return json(200, who)
      if (url.startsWith('/api/v1/expenditure/approval-policy'))
        return json(200, { requiredApprovals: 1, autoApproveBelow: null })
      if (url.startsWith('/api/v1/settings/sales-approval-rule')) {
        if (init?.method === 'PUT') {
          sent = JSON.parse(String(init.body))
          return json(200, { ...RULE, ...(sent as object), version: 1 })
        }
        return ruleResponse()
      }
      return json(404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/approvals']}>
      <Routes>
        <Route path="/settings/approvals" element={<ApprovalPolicyPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const card = async () => screen.findByRole('region', { name: 'Sales invoices' })

describe('the sales approval rule card', () => {
  it('switches the rule on with the whole rule, against the version read, and says what changes', async () => {
    renderPage()
    const region = await card()
    fireEvent.click(within(region).getByRole('switch', { name: 'Require approval before issuing' }))
    expect(
      within(region).getByText('Drafts not yet issued will need approval before they are issued.'),
    ).toBeTruthy()
    // One person can approve and a request needs one besides its preparer.
    expect(
      within(region).getByText(
        'Add the Approve permission to someone else, or every request will wait.',
      ),
    ).toBeTruthy()
    fireEvent.click(within(region).getByRole('button', { name: 'Save the sales rule' }))
    await waitFor(() =>
      expect(sent).toEqual({
        expectedVersion: 0,
        enabled: true,
        covers: RULE.covers,
        requiredApprovals: 1,
        autoApproveBelow: null,
      }),
    )
  })

  it('refuses to save a rule that is on and covers nothing', async () => {
    ruleResponse = () => json(200, { ...RULE, enabled: true, version: 2 })
    renderPage()
    const region = await card()
    for (const name of ['Invoices', 'Credit notes', 'Debit notes'])
      fireEvent.click(within(region).getByRole('checkbox', { name }))
    expect(
      within(region).getByText('Choose at least one kind of document, or turn the rule off.'),
    ).toBeTruthy()
    expect(within(region).getByRole('button', { name: 'Save the sales rule' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('is read-only without admin.settings.manage', async () => {
    who = READER
    renderPage()
    const region = await card()
    expect(within(region).getByRole('switch')).toHaveProperty('disabled', true)
    expect(within(region).queryByRole('button', { name: 'Save the sales rule' })).toBeNull()
  })

  it('is not drawn when sales approval is switched off on this deployment', async () => {
    ruleResponse = () => json(503, { status: 503, code: 'SALES_APPROVAL_UNAVAILABLE' })
    renderPage()
    await screen.findAllByText(/approv/i)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Sales invoices' })).toBeNull())
  })

  it('is not drawn for a reader the server refuses (403)', async () => {
    ruleResponse = () => json(403, { status: 403, code: 'FORBIDDEN' })
    renderPage()
    await screen.findAllByText(/approv/i)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Sales invoices' })).toBeNull())
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })

  it('reports any other 503 as a failure, not as switched off', async () => {
    ruleResponse = () => json(503, { status: 503, code: 'SOMETHING_DOWN' })
    renderPage()
    expect(await screen.findByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('selects the approvers figure on focus', async () => {
    renderPage()
    const region = await card()
    const input = within(region).getByLabelText('People who must approve each document') as HTMLInputElement
    const select = vi.spyOn(input, 'select')
    fireEvent.focus(input)
    expect(select).toHaveBeenCalled()
  })
})
