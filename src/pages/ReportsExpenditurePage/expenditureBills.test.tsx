import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { ExpenditureReportDto, ExpenditureRowDto } from '../../api/reports/reports'
import { ReportsExpenditurePage } from './ReportsExpenditurePage'

const READER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['reports.read'],
  scopes: [],
  featureFlags: {},
}

function row(over: Partial<ExpenditureRowDto> = {}): ExpenditureRowDto {
  return {
    period: '2026-02',
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    groupKey: null,
    groupLabel: null,
    currency: 'OMR',
    documents: 5,
    netAmount: 900,
    vatAmount: 45,
    totalAmount: 945,
    ...over,
  }
}

// Five documents a month: four bills and a credit note that took 100.000 off. The bill-only
// figures (4 bills, 1,000.000 of bill net) differ from the mixed ones (5, 900.000), so a card
// can only show 250.000 by reading them, and 180.000 by reading the mixed ones.
const BILLS = { billDocuments: 4, billNetAmount: 1000 }

function report(rows: ExpenditureRowDto[], groupBy: ExpenditureReportDto['groupBy'] = 'NONE') {
  return {
    from: '2026-01-01',
    to: '2026-02-28',
    granularity: 'MONTH',
    groupBy,
    rows,
    totals: [{ currency: 'OMR', documents: 5, netAmount: 900, vatAmount: 45, totalAmount: 945 }],
  } satisfies ExpenditureReportDto
}

let summary: ExpenditureReportDto
let suppliers: ExpenditureReportDto

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(async () => {
  // The page draws the months ending today; the fixtures sit in 2026, so today does too.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 25, 10))
  await i18n.changeLanguage('en')
  forgetEntitlements()
  summary = report([row(BILLS)])
  suppliers = report([], 'SUPPLIER')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/me/entitlements')) return json(200, READER)
      if (url.includes('/reports/expenditure') && url.includes('group_by=SUPPLIER'))
        return json(200, suppliers)
      if (url.includes('/reports/expenditure')) return json(200, summary)
      return json(404)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/reports/expenditure']}>
      <Routes>
        <Route path="/reports/expenditure" element={<ReportsExpenditurePage />} />
      </Routes>
    </MemoryRouter>,
  )

/** The card's figure, not its change pill or note. */
const figure = async (label: string) =>
  ((await screen.findByRole('heading', { name: label })).closest('article') as HTMLElement)
    .querySelector('span.truncate')?.textContent

describe('"Bills received" and "Average bill" (ACC-5, backend #824)', () => {
  it('count bills only and divide bill net by them when the server sends the bill figures', async () => {
    renderPage()
    expect(await figure('Bills received')).toBe('4')
    expect(await figure('Average bill')).toBe('250.000')
    // "Billed to you" stays the signed net, credit note included.
    expect(await figure('Billed to you, net of VAT')).toBe('900.000')
  })

  it('keep reading every document when the server sends no bill figures', async () => {
    summary = report([row()])
    renderPage()
    expect(await figure('Bills received')).toBe('5')
    expect(await figure('Average bill')).toBe('180.000')
  })

  it('do not mix the two bases when only some rows carry the bill figures', async () => {
    summary = report([
      row({ period: '2026-01', periodStart: '2026-01-01', periodEnd: '2026-01-31' }),
      row(BILLS),
    ])
    renderPage()
    // 5 + 5 documents and 900 + 900 net: the mixed basis throughout, never 5 + 4.
    expect(await figure('Bills received')).toBe('10')
    expect(await figure('Average bill')).toBe('180.000')
  })
})

// Net is dated by issue date and VAT by received date (D9 2026-10-12, EXP-VAT-DATE-DISCLOSURE),
// so the page says so whether or not the server reports the D-27 figures.
const VAT_DATES =
  "VAT is counted by the date each document was received, and the net by the document's own date, so a month's VAT need not match that month's net."

describe('what the spend leaves out (D-27)', () => {
  const DECIDED = {
    pendingDocuments: 2,
    pendingNetAmount: 120,
    pendingTotalAmount: 126,
    rejectedDocuments: 1,
    rejectedNetAmount: 300,
    rejectedTotalAmount: 315,
  }

  it('names pending and rejected beside the billed figure, which stays the server net', async () => {
    summary = report([row({ ...BILLS, ...DECIDED })])
    renderPage()
    expect(await figure('Billed to you, net of VAT')).toBe('900.000')
    expect(
      screen.getByText(
        'Not in the billed figure this year: documents awaiting approval or a decision (including a Peppol copy held until its duplicate check is resolved), OMR 120.000 (2); documents rejected or refused, OMR 300.000 (1). Both are net of credit notes, so either can be negative.',
      ),
    ).toBeTruthy()
  })

  // Both figures are signed (backend 04cddf824): a credit note against a pending bill reduces
  // pending, and one carrying a legacy rejection alone makes rejected negative.
  it('prints a negative rejected figure as the server sends it, under the net-of-credit-notes sentence', async () => {
    summary = report([row({ ...BILLS, ...DECIDED, rejectedNetAmount: -60, rejectedTotalAmount: -63 })])
    renderPage()
    expect(await figure('Billed to you, net of VAT')).toBe('900.000')
    expect(screen.getByText(/documents rejected or refused, OMR -60\.000 \(1\)\. Both are net of credit notes/)).toBeTruthy()
  })

  it('says nothing about them to a server that does not send them', async () => {
    renderPage()
    expect(await figure('Billed to you, net of VAT')).toBe('900.000')
    expect(screen.queryByText(/Not in the billed figure/)).toBeNull()
    expect(screen.getByText(VAT_DATES)).toBeTruthy()
  })

  it('says beside the D-27 sentence that VAT and net are not on one date, each readable alone', async () => {
    summary = report([row({ ...BILLS, ...DECIDED })])
    renderPage()
    expect(await figure('Billed to you, net of VAT')).toBe('900.000')
    expect(screen.getByText(VAT_DATES)).toBeTruthy()
    expect(screen.getByText(/^Not in the billed figure this year:/)).toBeTruthy()
  })
})

describe('spend by supplier keys (NEW-1, backend #824)', () => {
  it('never prints a prefixed key, and names each unlinked supplier by its label', async () => {
    suppliers = report(
      [
        row({ groupKey: 'name:dhofar pipes', groupLabel: 'Dhofar Pipes', netAmount: 600 }),
        row({ groupKey: 'participant:0235:om1100999001', groupLabel: '', netAmount: 200 }),
        row({ groupKey: '8f6c1d2e-0000-4000-8000-000000000001', groupLabel: 'Sohar Steel', netAmount: 100 }),
      ],
      'SUPPLIER',
    )
    renderPage()
    expect(await screen.findByText('Dhofar Pipes')).toBeTruthy()
    expect(screen.getByText('Sohar Steel')).toBeTruthy()
    expect(screen.getAllByText('Not grouped').length).toBeGreaterThan(0)
    expect(screen.queryByText(/participant:|name:/)).toBeNull()
    for (const link of screen.queryAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/participant:|name:/)
    }
  })
})
