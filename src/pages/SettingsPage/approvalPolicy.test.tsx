import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ApprovalPolicyDto } from '../../api/expenditure/approvalPolicy'
import { ApprovalPolicyPage } from './ApprovalPolicyPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const POLICY_URL = '/api/v1/expenditure/approval-policy'

const ADMIN: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.read', 'admin.settings.manage'],
  scopes: [],
  featureFlags: {},
}

/** May see the policy (invoice.read) but not move it — the split the controller argues for. */
const APPROVER: Entitlements = { ...ADMIN, permissions: ['invoice.read', 'invoice.approve'] }

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let policy: ApprovalPolicyDto
let sent: unknown
let refuse: Record<string, unknown> | null

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = ADMIN
  policy = { requiredApprovals: 2, autoApproveBelow: 50 }
  sent = null
  refuse = null

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
    if (url.startsWith(POLICY_URL)) {
      if (init?.method === 'PUT') {
        sent = JSON.parse(String(init.body))
        if (refuse !== null) {
          return new Response(
            JSON.stringify({
              ...refuse,
              status: 400,
              type: 'https://api.fawtir.om/problems/expenditure-refused',
            }),
            { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
          )
        }
        policy = sent as ApprovalPolicyDto
        return json(200, policy)
      }
      return json(200, policy)
    }
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
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

describe('the approval policy screen', () => {
  it('shows the rule the server holds, with the threshold as a chosen option', async () => {
    renderPage()
    expect(await screen.findByLabelText('People who must approve')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('Amount')).toHaveProperty('value', '50')
    expect(screen.getByRole('radio', { name: /Bills under a set amount/ })).toHaveProperty(
      'checked',
      true,
    )
  })

  it('sends both figures together, because the server replaces the policy whole', async () => {
    renderPage()
    const approvers = await screen.findByLabelText('People who must approve')
    fireEvent.change(approvers, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the rule' }))

    await waitFor(() => expect(sent).toEqual({ requiredApprovals: 3, autoApproveBelow: 50 }))
  })

  it('clears the threshold with an explicit null, and warns before it does', async () => {
    renderPage()
    await screen.findByLabelText('People who must approve')
    fireEvent.click(screen.getByRole('radio', { name: /Every bill needs approval/ }))

    // The consequence is stated before the save, not discovered afterwards.
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /This removes the .* threshold/.test(element.textContent ?? ''),
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save the rule' }))
    await waitFor(() => expect(sent).toEqual({ requiredApprovals: 2, autoApproveBelow: null }))
  })

  it('refuses out-of-range counts itself, and never asks the server', async () => {
    renderPage()
    const approvers = await screen.findByLabelText('People who must approve')

    fireEvent.change(approvers, { target: { value: '11' } })
    expect(await screen.findByText('Between 1 and 10.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save the rule' })).toHaveProperty('disabled', true)

    fireEvent.change(approvers, { target: { value: '0' } })
    expect(await screen.findByText('Between 1 and 10.')).toBeTruthy()
    expect(sent).toBeNull()
  })

  it('refuses a threshold the server would refuse: zero, and more than three decimals', async () => {
    renderPage()
    const amount = await screen.findByLabelText('Amount')

    fireEvent.change(amount, { target: { value: '0' } })
    expect(await screen.findByText('The amount has to be above zero.')).toBeTruthy()

    fireEvent.change(amount, { target: { value: '12.3456' } })
    expect(await screen.findByText('Up to three decimal places.')).toBeTruthy()
    expect(sent).toBeNull()
  })

  it('says the boundary out loud, because "below" is the part people misread', async () => {
    renderPage()
    await screen.findByLabelText('Amount')
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          /A bill of exactly .*OMR.* still needs approval/.test(element.textContent ?? ''),
      ),
    ).toBeTruthy()
  })

  it('offers no way to require nobody, which the server would refuse anyway', async () => {
    renderPage()
    const approvers = await screen.findByLabelText('People who must approve')
    expect(approvers.getAttribute('min')).toBe('1')
    expect(screen.getByText(/One is the minimum/)).toBeTruthy()
  })

  it('lets an approver read the rule but not change it', async () => {
    who = APPROVER
    renderPage()

    // The capability AND the constraint: the figures must still be legible, or a screen that
    // simply refused everyone would pass a test that only checked for the absence of a button.
    expect(await screen.findByLabelText('People who must approve')).toHaveProperty('value', '2')
    expect(screen.getByLabelText('People who must approve')).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Save the rule' })).toBeNull()
    expect(screen.getByText(/You can see this rule but not change it/)).toBeTruthy()
  })

  it('shows a server refusal by name rather than "try again"', async () => {
    refuse = { error: 'APPROVAL_POLICY_INVALID', trace_id: 'trace-4' }
    renderPage()
    const approvers = await screen.findByLabelText('People who must approve')
    fireEvent.change(approvers, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the rule' }))

    // The rule that was broken, by name, with the reference support needs -- not the generic
    // fallback, and not "try again", which no refusal ever rewards.
    expect(
      await screen.findByText(/An approval rule has to require at least one approver/),
    ).toBeTruthy()
    expect(screen.getByText(/trace-4/)).toBeTruthy()
    expect(screen.queryByText(/Please try again/i)).toBeNull()
  })

  it('offers nothing to save until something actually changed', async () => {
    renderPage()
    await screen.findByLabelText('People who must approve')
    expect(screen.getByRole('button', { name: 'Save the rule' })).toHaveProperty('disabled', true)
  })
})
