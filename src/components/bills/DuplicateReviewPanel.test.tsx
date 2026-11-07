import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import type { Entitlements } from '../../lib/identity/entitlements'
import type { DuplicateReview } from '../../lib/billDuplicateOverride'
import { SessionContext } from '../../lib/session/session'
import { DuplicateReviewPanel } from './DuplicateReviewPanel'

/**
 * The panel alone, under a session the test chooses: on the screens AppShell publishes the session
 * it fetched, so "still loading" (a null session) cannot be held there long enough to look at.
 */

const APPROVER_ONLY =
  'Only an authorized invoice approver can confirm that this is a different bill. You can submit it for review.'
const APPROVER_MUST_RECORD =
  'Only an authorized invoice approver can confirm that this is a different bill. Ask an invoice approver to record it.'
const APPROVER_REQUIRED =
  'This action requires an authorized human invoice approver. Ask an invoice approver to record this bill.'

const PAYER: Entitlements = {
  userId: 'u-payer',
  username: 'payer',
  tenantId: 't-1',
  roles: [],
  permissions: ['invoice.read', 'invoice.payment.manage'],
  scopes: [],
  featureFlags: {},
}
const APPROVER: Entitlements = { ...PAYER, permissions: [...PAYER.permissions, 'invoice.approve'] }

const bill = (id: string) => ({
  billId: id,
  supplierBillNumber: 'INV-1',
  issueDate: null,
  total: null,
  currencyCode: null,
  source: 'PEPPOL' as const,
})
const review = (overrides: Partial<DuplicateReview> = {}): DuplicateReview => ({
  seen: [bill('b-0')],
  listed: true,
  heldForReview: true,
  reason: '',
  problem: null,
  ...overrides,
})

function panel(session: Entitlements | null, value: DuplicateReview) {
  return render(
    <SessionContext.Provider value={session}>
      <MemoryRouter>
        <DuplicateReviewPanel
          review={value}
          onChange={vi.fn()}
          onDifferent={vi.fn()}
          busy={false}
          sentence={(match) => match.supplierBillNumber}
          linkClassName=""
          buttonClassName=""
        />
      </MemoryRouter>
    </SessionContext.Provider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('the duplicate review panel', () => {
  it('round 20 L-4: draws no decision, submission, reason box or explanation while the session is loading', () => {
    panel(null, review())
    expect(screen.queryByRole('button', { name: "It's a different bill. Save it" })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit it for review' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(APPROVER_ONLY)).toBeNull()
    expect(screen.queryByText(APPROVER_MUST_RECORD)).toBeNull()
  })

  it('round 20 L-4: draws the decision for an approver only, enabled', () => {
    panel(APPROVER, review())
    const different = screen.getByRole('button', {
      name: "It's a different bill. Save it",
    }) as HTMLButtonElement
    expect(different.disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Submit it for review' })).toBeNull()
  })

  it('round 20 L-4: a payer is not drawn the decision, disabled or otherwise', () => {
    panel(PAYER, review({ heldForReview: false }))
    expect(screen.queryByRole('button', { name: "It's a different bill. Save it" })).toBeNull()
    expect(screen.getByText(APPROVER_MUST_RECORD)).toBeTruthy()
  })

  it('round 20 L-1: after the approver refusal, one sentence: the refusal, not the explanation too', () => {
    panel(PAYER, review({ heldForReview: false, problem: 'billIntake.duplicate.approverRequired' }))
    expect(screen.getByText(APPROVER_REQUIRED)).toBeTruthy()
    expect(screen.queryByText(APPROVER_MUST_RECORD)).toBeNull()
    expect(screen.queryByText(APPROVER_ONLY)).toBeNull()
  })

  it('round 21 F-2: the submission is offered for the one held-against copy only', () => {
    panel(PAYER, review())
    expect(screen.getByRole('button', { name: 'Submit it for review' })).toBeTruthy()
    expect(screen.getByText(APPROVER_ONLY)).toBeTruthy()
  })

  it('round 21 F-2: two bills in the review are never a submission, whatever the flag says', () => {
    panel(PAYER, review({ seen: [bill('b-0'), bill('b-1')] }))
    expect(screen.queryByRole('button', { name: 'Submit it for review' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(APPROVER_MUST_RECORD)).toBeTruthy()
  })
})
