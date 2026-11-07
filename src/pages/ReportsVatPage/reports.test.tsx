import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type {
  CashFlowReportDto,
  ExpenditureReportDto,
  ListsCatalogueDto,
  VatReportDto,
  VolumeReportDto,
  VatRowDto,
  VolumeRowDto,
} from '../../api/reports/reports'
import { catalogueHref } from '../../api/reports/reports'
import {
  byPeriod,
  categoryAmounts,
  currenciesIn,
  outputByCategory,
  periodsOf,
  reportCurrency,
  vatMonths,
  vatPosition,
} from '../../lib/vatReport'
import {
  byGroup,
  byPeriodTotal,
  cancelledCount,
  invoicesSent,
  salesAmount,
  selfBilledVat,
} from '../../lib/volumeReport'
import { periodWindows } from '../../lib/reportPeriod'
import { LineChart, PlainBars } from '../../components/reports/charts'
import { ReportsVatPage } from './ReportsVatPage'
import { ReportsIncomePage } from '../ReportsIncomePage'
import { ReportsListsPage } from '../ReportsListsPage'
import { ReportsExpenditurePage } from '../ReportsExpenditurePage'
import { ReportsCashFlowPage } from '../ReportsCashFlowPage'

const READER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['reports.read', 'invoice.export'],
  scopes: [],
  featureFlags: {},
}

function vatRow(over: Partial<VatRowDto> = {}): VatRowDto {
  return {
    side: 'OUTPUT',
    period: '2026-Q1',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    category: 'S',
    rate: 5,
    currency: 'OMR',
    documents: 3,
    taxableAmount: 1000,
    vatAmount: 50,
    ...over,
  }
}

const VAT: VatReportDto = {
  from: '2026-01-01',
  to: '2026-06-30',
  granularity: 'QUARTER',
  output: [
    vatRow(),
    vatRow({ category: 'Z', rate: null, taxableAmount: 400, vatAmount: 0 }),
    vatRow({ period: '2026-Q2', periodStart: '2026-04-01', taxableAmount: 2000, vatAmount: 100 }),
  ],
  input: [
    vatRow({ side: 'INPUT', category: 'ALL', rate: null, taxableAmount: 600, vatAmount: 30 }),
  ],
  net: [
    vatRow({ side: 'NET', category: 'ALL', rate: null, vatAmount: 20 }),
    vatRow({ side: 'NET', period: '2026-Q2', category: 'ALL', rate: null, vatAmount: 100 }),
  ],
}

function volumeRow(over: Partial<VolumeRowDto> = {}): VolumeRowDto {
  return {
    period: '2026-01',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    groupKey: null,
    groupLabel: null,
    currency: 'OMR',
    documents: 4,
    taxableAmount: 1000,
    vatAmount: 50,
    totalAmount: 1050,
    cancelled: 0,
    ...over,
  }
}

const VOLUME: VolumeReportDto = {
  from: '2026-01-01',
  to: '2026-02-28',
  granularity: 'MONTH',
  groupBy: 'NONE',
  rows: [volumeRow(), volumeRow({ period: '2026-02', totalAmount: 2100, cancelled: 2 })],
  totals: [
    { currency: 'OMR', documents: 8, taxableAmount: 3000, vatAmount: 150, totalAmount: 3150 },
  ],
}

/**
 * The same two months by document type. Invoices are the NONE fixture's figures; beside them a
 * credit note, a debit note and one of the tenant's own self-billed invoices, which is a purchase.
 */
const VOLUME_TYPES: VolumeReportDto = {
  ...VOLUME,
  groupBy: 'TYPE',
  rows: [
    volumeRow({ groupKey: '380' }),
    volumeRow({ groupKey: '380', period: '2026-02', periodStart: '2026-02-01' }),
    volumeRow({ groupKey: '381', documents: 1, taxableAmount: -200, vatAmount: -10 }),
    volumeRow({ groupKey: '383', documents: 1, taxableAmount: 100, vatAmount: 5 }),
    volumeRow({ groupKey: '389', documents: 2, taxableAmount: 500, vatAmount: 25 }),
  ],
}

const EXPENDITURE: ExpenditureReportDto = {
  from: '2026-01-01',
  to: '2026-02-28',
  granularity: 'MONTH',
  groupBy: 'NONE',
  rows: [
    {
      period: '2026-01',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      groupKey: null,
      groupLabel: null,
      currency: 'OMR',
      documents: 4,
      netAmount: 1000,
      vatAmount: 50,
      totalAmount: 1050,
    },
    {
      period: '2026-02',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      groupKey: null,
      groupLabel: null,
      currency: 'OMR',
      documents: 3,
      netAmount: 1500,
      vatAmount: 75,
      totalAmount: 1575,
    },
  ],
  totals: [{ currency: 'OMR', documents: 7, netAmount: 2500, vatAmount: 125, totalAmount: 2625 }],
}

// February's reversals outweigh its payments: a direction the server states negative.
const CASH_FLOW: CashFlowReportDto = {
  from: '2026-01-01',
  to: '2026-02-28',
  granularity: 'MONTH',
  rows: [
    {
      period: '2026-01',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      currency: 'OMR',
      received: 1500,
      paidOut: 400,
      net: 1100,
    },
    {
      period: '2026-02',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      currency: 'OMR',
      received: -200,
      paidOut: 300,
      net: -500,
    },
  ],
  totals: [{ currency: 'OMR', received: 1300, paidOut: 700, net: 600 }],
}

const CATALOGUE: ListsCatalogueDto = {
  datasets: [
    {
      key: 'invoices',
      title: 'Every invoice',
      description: 'Issued and draft documents',
      permission: 'invoice.export',
      formats: ['csv', 'xlsx'],
      hrefCsv: '/api/v1/authored-invoices/export.csv',
      hrefXlsx: '/api/v1/authored-invoices/export.xlsx',
      parameters: ['state', 'type'],
    },
    {
      key: 'tax-document-register',
      title: 'Tax document register',
      description: 'What was reported',
      permission: 'compliance.read',
      formats: ['csv'],
      hrefCsv: '/api/v1/reports/lists/tax-document-register.csv',
      hrefXlsx: null,
      parameters: [],
    },
  ],
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
const calls = (prefix: string) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix))

beforeEach(async () => {
  // The pages draw the twelve months ending today; the fixtures sit in 2026, so today does too.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 25, 10))
  await i18n.changeLanguage('en')
  forgetEntitlements()
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (url.includes('/me/entitlements')) return json(200, READER)
    if (url.includes('/reports/vat')) return json(200, VAT)
    if (url.includes('/reports/volume') && url.includes('group_by=TYPE'))
      return json(200, VOLUME_TYPES)
    if (url.includes('/reports/volume')) return json(200, VOLUME)
    if (url.includes('/reports/lists')) return json(200, CATALOGUE)
    if (url.includes('/reports/expenditure')) return json(200, EXPENDITURE)
    if (url.includes('/reports/cash-flow')) return json(200, CASH_FLOW)
    return json(404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const renderAt = (path: string, element: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path.split('?')[0]} element={element} />
      </Routes>
    </MemoryRouter>,
  )

describe('VAT arithmetic', () => {
  it('takes the net position from the server rather than subtracting here', () => {
    const position = vatPosition(VAT)
    expect(position.output).toBe(150)
    expect(position.input).toBe(30)
    // 150 - 30 is 120, but the server's NET rows say 120 too only because this fixture agrees.
    // The point is that the figure comes from those rows: it decides how a period with input and
    // no output reads, and a second answer computed here would eventually disagree with it.
    expect(position.net).toBe(120)
  })

  it('shares treatments by taxable amount, not by VAT', () => {
    // Zero-rated carries no VAT at all. Sharing by VAT would show it as nothing when it may be
    // most of the trade.
    const [standard, zero] = outputByCategory(VAT.output)
    expect(standard.category).toBe('S')
    expect(standard.taxable).toBe(3000)
    expect(zero.category).toBe('Z')
    expect(zero.vat).toBe(0)
    expect(Math.round(zero.share)).toBe(12)
  })

  it('lines the periods up across all three sides', () => {
    expect(periodsOf(VAT)).toEqual(['2026-Q1', '2026-Q2'])
    expect(byPeriod(VAT.output, periodsOf(VAT))).toEqual([50, 100])
    // Nothing was bought in Q2, which is a zero rather than a missing bar.
    expect(byPeriod(VAT.input, periodsOf(VAT))).toEqual([30, 0])
  })

  it('names every currency in the range', () => {
    expect(currenciesIn(VAT)).toEqual(['OMR'])
    expect(currenciesIn({ ...VAT, input: [vatRow({ side: 'INPUT', currency: 'USD' })] })).toEqual([
      'OMR',
      'USD',
    ])
  })

  it('opens on OMR whenever the report has it, not the first currency by name', () => {
    expect(reportCurrency(['AED', 'OMR', 'USD'])).toBe('OMR')
    // No OMR row at all: the first currency named, as before.
    expect(reportCurrency(['AED', 'USD'])).toBe('AED')
    expect(reportCurrency([])).toBe('OMR')
  })
})

describe('volume arithmetic', () => {
  it('totals signed amounts per period and counts cancellations apart', () => {
    expect(byPeriodTotal(VOLUME.rows, ['2026-01', '2026-02'])).toEqual([1050, 2100])
    // Cancelled documents carry no amount, so they are a count and never folded into a total.
    expect(cancelledCount(VOLUME.rows)).toBe(2)
  })

  it('collapses ungrouped rows into one entry rather than dropping them', () => {
    const groups = byGroup(VOLUME.rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].total).toBe(3150)
    expect(groups[0].documents).toBe(8)
  })

  it('keeps a label a later row supplies', () => {
    const groups = byGroup([
      volumeRow({ groupKey: 'c-1', groupLabel: null, totalAmount: 100 }),
      volumeRow({ groupKey: 'c-1', groupLabel: 'Al Bahja', totalAmount: 50 }),
    ])
    expect(groups[0].label).toBe('Al Bahja')
    expect(groups[0].total).toBe(150)
  })
})

describe('what counts as a sale', () => {
  it('adds invoices and debit notes, takes credit notes away, and leaves self-billing out', () => {
    const net = VOLUME_TYPES.rows.reduce(
      (sum, row) => sum + salesAmount(row, (entry) => entry.taxableAmount),
      0,
    )
    // 1000 + 1000 invoiced, less a 200 credit note, plus a 100 debit note. The tenant issued the
    // 389 as the buyer, so its 500 is a purchase and not in sales.
    expect(net).toBe(1900)
    // Only invoices are "invoices sent".
    expect(VOLUME_TYPES.rows.reduce((sum, row) => sum + invoicesSent(row), 0)).toBe(8)
    expect(VOLUME_TYPES.rows.reduce((sum, row) => sum + selfBilledVat(row), 0)).toBe(25)
  })

  it('reads a credit note as a subtraction whichever way the server signed it', () => {
    const credit = volumeRow({ groupKey: 'CREDIT_NOTE', taxableAmount: 200 })
    expect(salesAmount(credit, (row) => row.taxableAmount)).toBe(-200)
    const debit = volumeRow({ groupKey: 'DEBIT_NOTE', taxableAmount: -100 })
    expect(salesAmount(debit, (row) => row.taxableAmount)).toBe(100)
  })
})

describe('the VAT figures by month', () => {
  const monthly: VatReportDto = {
    from: '2026-01-01',
    to: '2026-01-31',
    granularity: 'MONTH',
    output: [
      vatRow({ period: '2026-01', category: 'S', taxableAmount: 1000, vatAmount: 50 }),
      vatRow({ period: '2026-01', category: 'Z', rate: 0, taxableAmount: 300, vatAmount: 0 }),
      vatRow({ period: '2026-01', category: 'E', rate: null, taxableAmount: 200, vatAmount: 0 }),
      vatRow({ period: '2026-01', category: 'O', rate: null, taxableAmount: 100, vatAmount: 0 }),
    ],
    input: [
      vatRow({ side: 'INPUT', period: '2026-01', category: 'ALL', rate: null, vatAmount: 20 }),
    ],
    net: [vatRow({ side: 'NET', period: '2026-01', category: 'ALL', rate: null, vatAmount: 30 })],
  }

  it('states the server figures as they are when there is nothing to correct', () => {
    const figures = vatMonths(monthly, 'OMR')
    expect(figures.output.get('2026-01')).toBe(50)
    expect(figures.input.get('2026-01')).toBe(20)
    expect(figures.net.get('2026-01')).toBe(30)
  })

  it("takes the tenant's own self-billed VAT out of output and net", () => {
    const figures = vatMonths(monthly, 'OMR', new Map([['2026-01', 5]]))
    expect(figures.output.get('2026-01')).toBe(45)
    expect(figures.net.get('2026-01')).toBe(25)
  })

  it('confirms nothing reclaimable until the server says which bills are', () => {
    expect(vatMonths(monthly, 'OMR').reclaimable).toBeNull()
    const confirmed = {
      ...monthly,
      input: monthly.input.map((row) => ({ ...row, reclaimableVatAmount: 4 })),
    }
    expect(vatMonths(confirmed, 'OMR').reclaimable?.get('2026-01')).toBe(4)
  })

  it('keeps exempt and outside scope apart, and does not split input it cannot', () => {
    expect(categoryAmounts(monthly.output, ['2026-01'])).toEqual([1000, 300, 200, 100])
    // INPUT rows say ALL: not split rather than guessed.
    expect(categoryAmounts(monthly.input, ['2026-01'])).toBeNull()
  })
})

describe('the Quarterly pill', () => {
  it('is the tax period to date, not the last three months', () => {
    const { current, previous } = periodWindows('quarterly', new Date(2026, 7, 10))
    // Calendar quarters stand in for the company's tax period (REPORTS.md row 1.24).
    expect(current.from).toBe('2026-07-01')
    expect(current.months).toEqual(['2026-07', '2026-08'])
    expect(previous.from).toBe('2026-04-01')
    expect(previous.to).toBe('2026-06-30')
  })

  it("follows the company's own tax period when there is one", () => {
    const { current } = periodWindows('quarterly', new Date(2026, 7, 10), {
      months: ['2026-06', '2026-07', '2026-08'],
    })
    expect(current.from).toBe('2026-06-01')
  })
})

describe('a month with no data', () => {
  it('is drawn as no data, not as a zero bar', () => {
    const { container } = render(
      <PlainBars values={[120, null, 90]} labels={['Jan', 'Feb', 'Mar']} missingLabel="No data" />,
    )
    const dashed = container.querySelectorAll('rect[stroke-dasharray]')
    expect(dashed).toHaveLength(1)
    expect(dashed[0].querySelector('title')?.textContent).toBe('No data')
  })

  it('breaks the line rather than dropping it to zero', () => {
    const { container } = render(
      <LineChart values={[90, null, 95, 96]} labels={['Jan', 'Feb', 'Mar', 'Apr']} />,
    )
    // One dot per month with data, and the line starts again after the gap.
    expect(container.querySelectorAll('circle')).toHaveLength(3)
    const line = container.querySelectorAll('path')[1].getAttribute('d') ?? ''
    expect(line.match(/M/g)).toHaveLength(2)
  })
})

describe('the catalogue href', () => {
  it('drops the base the client adds back, so a download is not asked for twice', () => {
    // The catalogue states absolute paths; the client prefixes /api. Left alone every download
    // would ask for /api/api/v1/...
    expect(catalogueHref('/api/v1/reports/lists/payments-made.csv')).toBe(
      '/v1/reports/lists/payments-made.csv',
    )
    expect(catalogueHref('/v1/already-relative.csv')).toBe('/v1/already-relative.csv')
  })
})

describe('the VAT page', () => {
  it('says, in the owner\'s words, that it is not a filed return (VAT-LABEL, K22)', async () => {
    renderAt('/reports/vat-tax', <ReportsVatPage />)
    expect(
      await screen.findByText(
        'Calculated from your records to help you prepare your return. It is not a filed return.',
      ),
    ).toBeTruthy()
  })

  it('says it in Arabic too', async () => {
    expect(i18n.exists('reports.vat.notAReturn', { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t('reports.vat.notAReturn', { lng: 'ar' })).not.toMatch(/[A-Za-z]{4,}/)
  })

  it('shows the position and asks the server for both buckets the frame draws', async () => {
    renderAt('/reports/vat-tax', <ReportsVatPage />)
    // Output and net less the 25 on the tenant's own self-billed invoice (a purchase).
    expect(await screen.findByText('125.000')).toBeTruthy()
    expect(screen.getByText('30.000')).toBeTruthy()
    expect(screen.getByText('95.000')).toBeTruthy()
    // Quarterly position reads quarters and Monthly net payable reads months: the frame has no
    // bucket picker, so both are asked for rather than one at a time.
    const asked = calls('/api/v1/reports/vat')
    expect(asked.some((url) => url.includes('granularity=QUARTER'))).toBe(true)
    expect(asked.some((url) => url.includes('granularity=MONTH'))).toBe(true)
    // Reclaim by supplier is the VAT on received bills, grouped by the server.
    expect(
      calls('/api/v1/reports/expenditure').some((url) => url.includes('group_by=SUPPLIER')),
    ).toBe(true)
  })

  it("takes the tenant's own self-billed VAT out of output, and does not call input reclaimable", async () => {
    renderAt('/reports/vat-tax', <ReportsVatPage />)
    // 150 charged, less the 25 on the self-billed invoice the tenant issued as the buyer.
    expect(await screen.findByText('125.000')).toBeTruthy()
    expect(screen.getByText('95.000')).toBeTruthy()
    expect(screen.getByText('input VAT, reclaim not confirmed')).toBeTruthy()
    expect(screen.queryByText('input VAT, reclaimable')).toBeNull()
    expect(screen.getAllByText('Not split by category yet').length).toBe(1)
    expect(screen.getByText('Outside scope')).toBeTruthy()
  })

  it('says when a range mixes currencies instead of adding across them', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      if (url.includes('/me/entitlements')) return json(200, READER)
      if (url.includes('/reports/vat'))
        return json(200, { ...VAT, input: [vatRow({ side: 'INPUT', currency: 'USD' })] })
      return json(404)
    })
    renderAt('/reports/vat-tax', <ReportsVatPage />)
    expect(await screen.findByText(/more than one currency \(OMR, USD\)/)).toBeTruthy()
  })

  it('opens on OMR even when another currency comes first by name', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      if (url.includes('/me/entitlements')) return json(200, READER)
      if (url.includes('/reports/vat'))
        return json(200, {
          ...VAT,
          input: [
            ...VAT.input,
            vatRow({ side: 'INPUT', category: 'ALL', rate: null, currency: 'AED', vatAmount: 7 }),
          ],
        })
      return json(404)
    })
    renderAt('/reports/vat-tax', <ReportsVatPage />)
    expect(await screen.findByText(/more than one currency \(AED, OMR\)/)).toBeTruthy()
    // The OMR input, not the 7 AED that sorts first.
    expect(screen.getByText('30.000')).toBeTruthy()
    expect(screen.queryByText('7.000')).toBeNull()
  })
})

describe('the income page', () => {
  it('shows net of VAT, the VAT on it and the documents sent', async () => {
    renderAt('/reports/income', <ReportsIncomePage />)
    // Sales by document type: invoices and the debit note, less the credit note; the tenant's
    // own self-billed invoice is a purchase and is left out.
    expect(await screen.findByText('1,900.000')).toBeTruthy()
    // Taxable and VAT are summed from the monthly rows, not the totals line.
    expect(screen.getByText('95.000')).toBeTruthy()
    expect(screen.getByText('Invoices sent')).toBeTruthy()
    // Invoices over invoices: 2,000 over 8.
    expect(screen.getByText('250.000')).toBeTruthy()
    expect(
      calls('/api/v1/reports/volume').some(
        (url) => url.includes('group_by=TYPE') && url.includes('granularity=MONTH'),
      ),
    ).toBe(true)
  })

  it('asks the server to group by customer rather than grouping a page in the browser', async () => {
    renderAt('/reports/income', <ReportsIncomePage />)
    await screen.findByText('1,900.000')
    const asked = calls('/api/v1/reports/volume')
    expect(asked.some((url) => url.includes('group_by=CUSTOMER'))).toBe(true)
    expect(
      asked.some((url) => url.includes('group_by=NONE') && url.includes('granularity=MONTH')),
    ).toBe(true)
  })

  it('reads the window the period pill names', async () => {
    renderAt('/reports/income', <ReportsIncomePage />)
    await screen.findByText('1,900.000')
    expect(calls('/api/v1/reports/volume').some((url) => url.includes('from=2025-10-01'))).toBe(
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Yearly' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Quarterly' }))
    await waitFor(() =>
      expect(
        calls('/api/v1/reports/volume').some(
          (url) => url.includes('group_by=CUSTOMER') && url.includes('from=2026-07-01'),
        ),
      ).toBe(true),
    )
  })
})

describe('the expenditure page', () => {
  it('shows what was billed net of VAT, the VAT on it and the bills behind it', async () => {
    renderAt('/reports/expenditure', <ReportsExpenditurePage />)
    expect(await screen.findByText('2,500.000')).toBeTruthy()
    expect(screen.getByText('125.000')).toBeTruthy()
    expect(screen.getByText('Bills received')).toBeTruthy()
    // One read per shape the frame draws, each asked for once.
    const asked = calls('/api/v1/reports/expenditure')
    for (const groupBy of ['NONE', 'SUPPLIER', 'CATEGORY', 'SOURCE']) {
      expect(asked.filter((url) => url.includes(`group_by=${groupBy}`))).toHaveLength(1)
    }
  })

  it('asks the server to group, and names a bill without a category as such rather than dropping it', async () => {
    renderAt('/reports/expenditure', <ReportsExpenditurePage />)
    await screen.findByText('2,500.000')
    await waitFor(() => expect(screen.getAllByText('Uncategorised').length).toBeGreaterThan(0))
    expect(
      calls('/api/v1/reports/expenditure').some((url) => url.includes('group_by=CATEGORY')),
    ).toBe(true)
    expect(
      calls('/api/v1/reports/expenditure').some((url) => url.includes('group_by=SUPPLIER')),
    ).toBe(true)
  })
})

describe('the cash flow page', () => {
  it('states both directions from the server and names a reversal-heavy period instead of drawing it small', async () => {
    renderAt('/reports/cash-flow', <ReportsCashFlowPage />)
    expect(await screen.findByText('1,300.000')).toBeTruthy()
    expect(screen.getByText('700.000')).toBeTruthy()
    expect(screen.getByText('600.000')).toBeTruthy()
    // A bar cannot be negative, so the period is named and the reader is sent to the figures.
    expect(screen.getByText(/Reversals outweighed payments in 2026-02/)).toBeTruthy()
    expect(screen.queryByText('Bucketed on the payment date, not the invoice date.')).toBeNull()
  })

  it('says so when nothing was recorded, rather than drawing an empty chart', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/me/entitlements')) return json(200, READER)
      if (url.includes('/reports/cash-flow'))
        return json(200, { ...CASH_FLOW, rows: [], totals: [] })
      return json(404)
    })
    renderAt('/reports/cash-flow', <ReportsCashFlowPage />)
    expect(await screen.findByText('No payments were recorded in this range.')).toBeTruthy()
  })

  // NOT RUN (static only). Backend 9ce2bdcf4: no business time zone, with till paid-outs to date.
  it('sends the reader to the company settings when the time zone is not set, without a retry', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/me/entitlements')) return json(200, READER)
      if (url.includes('/reports/cash-flow'))
        return new Response(
          JSON.stringify({
            type: 'https://fawtir.om/problems/conflict',
            status: 409,
            code: 'TENANT_TIMEZONE_UNAVAILABLE',
          }),
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        )
      return json(404)
    })
    renderAt('/reports/cash-flow', <ReportsCashFlowPage />)
    expect(
      await screen.findByText(
        "The cash flow report needs the company's time zone, which isn't set. Contact Fawtir support to set it, then open the report again.",
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('appAccess.retry') })).toBeNull()
  })

  // NOT RUN (static only). Backend cb9898ac3 (FIN-M3): the four drawer columns and the bucket of
  // till paid-outs from before RC5, which carry no currency.
  it('shows the till paid-outs by class and keeps the currency-less bucket apart', async () => {
    const september = {
      period: '2026-09',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      received: 0,
      paidOut: 0,
      net: 0,
    }
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/me/entitlements')) return json(200, READER)
      if (url.includes('/reports/cash-flow'))
        return json(200, {
          ...CASH_FLOW,
          rows: [
            ...CASH_FLOW.rows,
            {
              ...september,
              currency: 'OMR',
              cashPaidOutExpense: 4,
              cashPaidOutAdvance: 2,
              cashTransferred: 7,
              cashPaidOutUnclassified: 0,
            },
            { ...september, currency: null, cashPaidOutUnclassified: 1.25 },
          ],
          totals: [
            { currency: null, received: 0, paidOut: 0, net: 0, cashPaidOutUnclassified: 1.25 },
            ...CASH_FLOW.totals,
          ],
        })
      if (url.includes('/reports/expenditure')) return json(200, EXPENDITURE)
      return json(404)
    })
    renderAt('/reports/cash-flow', <ReportsCashFlowPage />)
    expect(await screen.findByText('Cash paid out of the tills')).toBeTruthy()
    expect(screen.getByText('Expenses')).toBeTruthy()
    expect(screen.getByText('4.000')).toBeTruthy()
    expect(screen.getByText('7.000')).toBeTruthy()
    expect(screen.getByText('Not classed (before RC5)')).toBeTruthy()
    // The null bucket is never taken as the report's currency, nor counted as a second one.
    expect(screen.getByText('1,300.000')).toBeTruthy()
    expect(screen.queryByText(/more than one currency/)).toBeNull()
    expect(
      screen.getByText(
        'Till paid-outs from before RC5 carry no currency (currency not recorded (before RC5)): 1.25 in this report. They are kept apart and never added to any currency.',
      ),
    ).toBeTruthy()
  })
})

describe('the downloads page', () => {
  it('renders the server catalogue, and greys what the reader may not take', async () => {
    renderAt('/reports/lists', <ReportsListsPage />)
    expect(await screen.findByText('Every invoice')).toBeTruthy()

    // invoice.export is held, so both formats are offered.
    const invoices = screen.getByText('Every invoice').closest('article')!
    expect(within(invoices).getByRole('button', { name: 'CSV' })).toBeTruthy()
    expect(within(invoices).getByRole('button', { name: 'Download Excel' })).toBeTruthy()
    // In words, not the catalogue's query parameter names (NEW-2).
    expect(within(invoices).getByText('Filters: status, type')).toBeTruthy()

    // compliance.read is not, so the dataset is still named — hiding it would leave someone
    // asking for a file they cannot see exists.
    const register = screen.getByText('Tax document register').closest('article')!
    expect(within(register).queryByRole('button')).toBeNull()
    expect(within(register).getByText('Needs compliance.read')).toBeTruthy()
  })

  it('names a dataset’s filters in Arabic too (NEW-2)', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/reports/lists', <ReportsListsPage />)
    expect(await screen.findByText('المرشحات: الحالة، النوع')).toBeTruthy()
    expect(screen.queryByText(/state|type/)).toBeNull()
  })
})
