import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import type { ActivitySummaryDto } from '../../api/compliance/activity'
import { ComplianceReportModal } from './ComplianceReportModal'

// The design's sample book (PERIOD_BOOKS) that the dialog used to fall back to: its totals, the
// VAT worked out from them, its counts, and the XML note's sample file count and size. None may
// appear in a real session.
const INVENTED = [
  '52,418.900',
  '18,902.400',
  '194,800.000',
  '2,459.898',
  '412 invoices',
  '147 invoices',
  '1,624 invoices',
  '1624 invoices',
  '412 files',
  '8 MB',
]

// Exactly the fields backend ActivitySummaryResponse sends: no invoiced_total, no vat_reported.
const SUMMARY: ActivitySummaryDto = {
  from: null,
  to: null,
  documents: 37,
  tdd_ack: { ap: 20, ab: 3, re: 2, none: 12 },
  invoice_ack: { ap: 30, ab: 2, re: 1, none: 4 },
  dead_lettered: 0,
  attention: 2,
  sla: { met: 20, missed: 1, pending: 16 },
  median_minutes_to_tdd_ack: 2,
  tdd_state: {
    never_submitted: 1,
    awaiting_response: 9,
    authority_rejected: 2,
    internally_stopped: 1,
  },
}

let summaryAnswer: () => Promise<Response>

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  summaryAnswer = async () => json(200, SUMMARY)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/compliance/activity/summary')) return summaryAnswer()
      return json(404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const renderModal = () =>
  render(
    <MemoryRouter>
      <ComplianceReportModal open onClose={() => {}} onBuild={() => {}} />
    </MemoryRouter>,
  )

const rowValue = (label: string) =>
  screen.getByText(label).closest('div')?.querySelector('dd')?.textContent ?? ''

function expectNoInventedFigure() {
  const text = document.body.textContent ?? ''
  for (const figure of INVENTED) expect(text).not.toContain(figure)
}

describe('the compliance report dialog shows only what the server supplies', () => {
  it('reads the server counts and says the totals it does not send are not available', async () => {
    renderModal()
    expect(await screen.findByText('37 invoices')).toBeTruthy()
    expect(rowValue('Invoices in the period')).toBe('37')
    expect(rowValue('Accepted by the OTA')).toBe('20 · 54.1%')
    // Rejected, never submitted and stopped at Fawtir: 2 + 1 + 1.
    expect(rowValue('Still not reported')).toBe('4')
    expect(rowValue('Sent, still waiting for an answer')).toBe('9')
    expect(rowValue('Rejected then corrected')).toBe('Not available yet')
    expect(rowValue('Total invoiced')).toBe('Not available yet')
    expect(rowValue('VAT reported')).toBe('Not available yet')
    expectNoInventedFigure()
  })

  it('prints the totals when the server does send them', async () => {
    summaryAnswer = async () => json(200, { ...SUMMARY, invoiced_total: 1234.5, vat_reported: 58.786 })
    renderModal()
    await screen.findByText('37 invoices')
    expect(rowValue('Total invoiced')).toContain('1,234.500')
    expect(rowValue('VAT reported')).toContain('58.786')
  })

  it('shows a loading state, and no figure, while the summary is on its way', async () => {
    // Settled at the end so no promise outlives the test; beforeEach also clears the shared
    // in-flight reads, which `sharedRequest` keys by path alone.
    let settle: (response: Response) => void = () => {}
    summaryAnswer = () => new Promise<Response>((resolve) => (settle = resolve))
    const { unmount } = renderModal()
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.queryByText('Total invoiced')).toBeNull()
    expect(screen.queryByText('VAT reported')).toBeNull()
    expect(screen.queryByText('Rejected then corrected')).toBeNull()
    expect(screen.queryByText(/\d+ invoices?$/)).toBeNull()
    expectNoInventedFigure()
    unmount()
    settle(json(200, SUMMARY))
  })

  it('shows the failure, and no figure, when the summary cannot be read', async () => {
    summaryAnswer = async () => json(500, { title: 'Internal Server Error' })
    renderModal()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Total invoiced')).toBeNull()
    expect(screen.queryByText('VAT reported')).toBeNull()
    expect(screen.queryByText(/\d+ invoices?$/)).toBeNull()
    expectNoInventedFigure()
  })

  it('reads again on retry and then shows the server counts', async () => {
    summaryAnswer = async () => json(500, { title: 'Internal Server Error' })
    renderModal()
    const retry = await screen.findByRole('button', { name: 'Try again' })
    summaryAnswer = async () => json(200, SUMMARY)
    fireEvent.click(retry)
    expect(await screen.findByText('37 invoices')).toBeTruthy()
    expect(rowValue('Invoices in the period')).toBe('37')
  })

  it('shows loading, not the previous period, while a new period is read', async () => {
    renderModal()
    await screen.findByText('37 invoices')
    let settle: (response: Response) => void = () => {}
    summaryAnswer = () => new Promise<Response>((resolve) => (settle = resolve))
    fireEvent.click(screen.getByRole('button', { name: 'This year' }))
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.queryByText('37 invoices')).toBeNull()
    expect(screen.queryByText('Invoices in the period')).toBeNull()
    settle(json(200, { ...SUMMARY, documents: 50 }))
    expect(await screen.findByText('50 invoices')).toBeTruthy()
  })
})
