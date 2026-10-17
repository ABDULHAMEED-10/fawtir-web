import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from '../../i18n'
import { SessionContext } from '../../lib/session/session'
import type { Entitlements } from '../../lib/identity/entitlements'
import type { SalesApprovalDto } from '../../api/invoices/salesApproval'
import { DraftApprovalCard } from './DraftApprovalCard'

const PREPARER: Entitlements = {
  userId: 'u-1',
  username: 'accountant',
  tenantId: 't-1',
  roles: [],
  permissions: ['invoice.read', 'invoice.draft'],
  scopes: [],
  featureFlags: {},
}
const APPROVER: Entitlements = { ...PREPARER, permissions: ['invoice.read', 'invoice.approve'] }

const base: SalesApprovalDto = {
  status: 'NOT_REQUESTED',
  requiredApprovals: 2,
  distinctApprovals: 0,
  draftVersion: 5,
  payableAmount: 1050.5,
  currency: 'OMR',
  requestedBy: null,
  requestedAt: null,
  lastDecision: null,
  callerMayRequest: false,
  callerMayDecide: false,
}

let posted: { url: string; body: unknown }[]
let fetchMock: ReturnType<typeof vi.fn>
/** What every step answers; a test sets the state the server would return. */
let answer: SalesApprovalDto

beforeEach(async () => {
  await i18n.changeLanguage('en')
  posted = []
  answer = base
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    posted.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function show(approval: SalesApprovalDto | null, session: Entitlements, extra = {}) {
  const onChanged = vi.fn()
  render(
    <SessionContext.Provider value={session}>
      <DraftApprovalCard
        invoiceId="d-1"
        type="INVOICE"
        approval={approval}
        onChanged={onChanged}
        {...extra}
      />
    </SessionContext.Provider>,
  )
  return onChanged
}

describe('the draft approval card', () => {
  it('draws nothing while no rule covers the draft, or the approval could not be read', () => {
    const { container } = render(
      <SessionContext.Provider value={PREPARER}>
        <DraftApprovalCard invoiceId="d-1" type="INVOICE" approval={null} onChanged={() => {}} />
      </SessionContext.Provider>,
    )
    expect(container.innerHTML).toBe('')
    show({ ...base, status: 'NOT_REQUIRED' }, PREPARER)
    expect(screen.queryByText('Approval')).toBeNull()
  })

  it('offers the preparer Send for approval, with the version they saw', async () => {
    const onChanged = show({ ...base, callerMayRequest: true }, PREPARER)
    expect(screen.getByText('This document needs approval before it is issued.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(posted[0]).toEqual({
      url: '/api/v1/invoice-drafts/d-1/approval/request',
      body: { expectedVersion: 5 },
    })
  })

  it('shows a waiting draft to its preparer with Withdraw and never Approve', () => {
    show({ ...base, status: 'PENDING', distinctApprovals: 1 }, PREPARER)
    expect(screen.getByText('Waiting for approval · 1 of 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Withdraw request' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('lets an approver approve, approve and issue, or reject with a reason', async () => {
    const issue = vi.fn()
    show({ ...base, status: 'PENDING', callerMayDecide: true }, APPROVER, {
      onApproveAndIssue: issue,
    })
    expect(screen.queryByRole('button', { name: 'Withdraw request' })).toBeNull()

    answer = { ...base, status: 'APPROVED', distinctApprovals: 2 }
    fireEvent.click(screen.getByRole('button', { name: 'Approve and issue' }))
    await waitFor(() => expect(issue).toHaveBeenCalled())
    expect(posted[0].url).toBe('/api/v1/invoice-drafts/d-1/approval/approve')

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const confirm = await screen.findAllByRole('button', { name: 'Reject' })
    // The reason is required before the refusal can be sent.
    expect(confirm[confirm.length - 1]).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Wrong price' } })
    fireEvent.click(confirm[confirm.length - 1])
    await waitFor(() => expect(posted).toHaveLength(2))
    expect(posted[1]).toEqual({
      url: '/api/v1/invoice-drafts/d-1/approval/reject',
      body: { expectedVersion: 5, text: 'Wrong price' },
    })
  })

  it('opens the issue dialog only once the draft is fully approved', async () => {
    const issue = vi.fn()
    // The first of two approvals: the server answers PENDING and would refuse the issue.
    answer = { ...base, status: 'PENDING', distinctApprovals: 1 }
    const onChanged = show({ ...base, status: 'PENDING', callerMayDecide: true }, APPROVER, {
      onApproveAndIssue: issue,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve and issue' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(posted[0].url).toBe('/api/v1/invoice-drafts/d-1/approval/approve')
    expect(issue).not.toHaveBeenCalled()
  })

  it("shows the amount in the draft's own currency", () => {
    show({ ...base, status: 'PENDING', currency: 'USD', payableAmount: 250 }, PREPARER)
    const line = screen.getByText(/Sent for approval at/)
    expect(line.textContent).toMatch(/USD/)
    expect(line.textContent).not.toMatch(/OMR/)
    // No rial sign for a dollar draft.
    expect(line.querySelector('.sr-only')).toBeNull()
  })

  it('shows the rial sign, not the word OMR, for a draft in rials', () => {
    show({ ...base, status: 'PENDING' }, PREPARER)
    const line = screen.getByText(/Sent for approval at/)
    // The sign carries "OMR" for screen readers only; no visible "OMR" text node.
    expect(line.querySelector('.sr-only')?.textContent).toBe('OMR')
    expect(line.firstChild?.textContent).not.toMatch(/OMR/)
  })

  it('shows the reason a draft was not approved', () => {
    show(
      {
        ...base,
        status: 'REJECTED',
        callerMayRequest: true,
        lastDecision: {
          kind: 'REJECTED',
          by: 'u-2',
          at: '2026-10-16T08:00:00Z',
          reason: 'Wrong price',
        },
      },
      PREPARER,
    )
    expect(screen.getByText('Reason: Wrong price')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeTruthy()
  })

  it("says a refusal in our words, not the server's", async () => {
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            status: 403,
            code: 'SALES_APPROVER_IS_PREPARER',
            detail: 'server prose',
          }),
          { status: 403, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    )
    show({ ...base, status: 'PENDING', callerMayDecide: true }, APPROVER)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(
      await screen.findByText(/You prepared this draft, so someone else must approve it\./),
    ).toBeTruthy()
    expect(screen.queryByText(/server prose/)).toBeNull()
  })
})
