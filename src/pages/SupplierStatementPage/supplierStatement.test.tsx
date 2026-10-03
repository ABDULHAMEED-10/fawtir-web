import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { SupplierDetailDto } from '../../api/expenditure/suppliers'
import type { SupplierStatementDto } from '../../api/expenditure/supplierRecord'
import { termsNote } from '../../lib/supplierRecord'
import {
  everLateOf,
  columnsOf,
  customRangeProblem,
  emailBlocker,
  entryLink,
  periodRange,
  periodTotals,
} from '../../lib/supplierStatement'
import { SupplierStatementPage } from './SupplierStatementPage'

// The pages render slowly on a loaded machine; the default second is not enough for a find.
configure({ asyncUtilTimeout: 15000 })

const ID = '55cedba4-5eef-4e5e-906e-2676166d110a'
const ONE = `/api/v1/suppliers/${ID}`

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['supplier.read', 'supplier.manage'],
  scopes: [],
  featureFlags: {},
}
const READER: Entitlements = { ...MANAGER, username: 'viewer', permissions: ['supplier.read'] }

const DETAIL: SupplierDetailDto = {
  profile: {
    id: ID,
    type: 'BUSINESS',
    displayName: 'Sohar Packaging LLC',
    legalName: 'Sohar Packaging Industries LLC',
    vatNumber: 'OM1100628391',
    registeredForVat: true,
    registeredOnPeppol: true,
    participantScheme: '0248',
    participantValue: 'OM1100628391',
    participantId: '0248:OM1100628391',
    defaultCurrency: 'OMR',
    defaultTaxCategory: 'S5',
    paymentTerms: 'NET10',
    defaultPaymentMethod: '30',
    bankDetails: null,
    contactPerson: null,
    roleTitle: null,
    emailRecipients: ['ap@soharpack.om', 'finance@soharpack.om'],
    telephone: null,
    mobilePhone: null,
    preferredLanguage: 'en',
    receivingChannel: 'PEPPOL',
    requiresApprovalBeforePayment: true,
    earlyPaymentDiscountPercent: null,
    earlyPaymentDiscountDays: null,
    commercialRegistrationNumber: null,
    notes: null,
    supplierCategory: null,
    selfBillingAgreement: false,
    health: [],
    supplierSince: '2026-02-01',
    switchedOffAt: null,
    status: 'ACTIVE',
    customerStatus: 'ACTIVE',
    version: 3,
  },
  invoiceAddress: {
    attention: null,
    countryCode: 'OM',
    cityName: 'Sohar',
    countrySubentity: 'North Batinah',
    streetName: 'Falaj Road',
    buildingNumber: '12',
    additionalStreetName: null,
    poBox: null,
    postalCode: '311',
  },
  sameAsInvoicingAddress: true,
  deliveryAddress: null,
}

const STATEMENT: SupplierStatementDto = {
  supplierId: ID,
  currencyCode: 'OMR',
  from: '2026-01-01',
  to: '2026-09-17',
  opening: 200,
  bills: 1200,
  credits: 100,
  payments: 300,
  closing: 1000,
  entries: [
    {
      date: '2026-07-27',
      kind: 'BILL',
      documentId: 'bill-1',
      reference: 'SOHAR-1002',
      amount: 1200,
      runningBalance: 1400,
    },
    {
      date: '2026-08-01',
      kind: 'CREDIT_NOTE',
      documentId: 'note-1',
      reference: 'SOHAR-CN-1',
      amount: 100,
      runningBalance: 1300,
    },
    {
      date: '2026-08-24',
      kind: 'PAYMENT',
      documentId: 'pay-1',
      reference: 'TRF-9',
      amount: 300,
      runningBalance: 1000,
    },
  ],
  ageing: { NOT_DUE: 1000, DUE_WITHIN_30: 0, LATE_30: 0, LATE_60_PLUS: 0 },
  issuer: {
    legalName: 'Al Bahja Coffee LLC',
    legalNameAr: 'شركة البهجة للقهوة',
    vatNumber: 'OM1100392000',
    addressLine1: 'Souq Street',
    addressLine2: null,
    addressLine3: null,
    city: 'Nizwa',
    postalCode: '611',
    countrySubdivision: null,
    country: 'OM',
  },
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let detail: SupplierDetailDto
let emailResponse: () => Response

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).startsWith(prefix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  detail = DETAIL
  emailResponse = () => json(200, { recipient: 'ap@soharpack.om', nameSubstituted: false })
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url === ONE) return json(200, detail)
    if (url.startsWith(`${ONE}/statement/email`)) return emailResponse()
    if (url.startsWith(`${ONE}/statement.`))
      return new Response('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf' } })
    if (url.startsWith(`${ONE}/statement`)) {
      const query = new URL(url, 'http://x').searchParams
      return json(200, {
        ...STATEMENT,
        from: query.get('from') ?? STATEMENT.from,
        to: query.get('to') ?? STATEMENT.to,
      })
    }
    throw new Error(`unexpected request to ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderStatement() {
  return render(
    <MemoryRouter initialEntries={[`/suppliers/${ID}/statement`]}>
      <Routes>
        <Route path="/suppliers/:slug/statement" element={<SupplierStatementPage />} />
        <Route path="/expenditure/bills/:id" element={<p>bill page</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('The supplier statement, wired to the API', () => {
  it('shows both parties, the period equation, every entry and what is open today', async () => {
    renderStatement()

    expect(await screen.findByRole('heading', { level: 1, name: 'Statement' })).toBeTruthy()
    expect(screen.getByText('Sohar Packaging Industries LLC')).toBeTruthy()
    expect(screen.getByText('VAT OM1100628391 · 0248:OM1100628391')).toBeTruthy()
    // The issuer comes from the statement itself, which a supplier.read user may read.
    expect(screen.getByText('Al Bahja Coffee LLC')).toBeTruthy()
    expect(screen.getByText('Souq Street, Nizwa, 611, OM')).toBeTruthy()

    // Opening on the equation and on the brought-forward row.
    expect(screen.getAllByText('200.000')).toHaveLength(2)
    // What they billed over the period, and the one bill that makes it up.
    expect(screen.getAllByText('1,200.000')).toHaveLength(2)
    // The closing balance: the equation, the last running balance, the total row, the ageing and the footer.
    expect(screen.getAllByText('1,000.000')).toHaveLength(5)

    expect(screen.getByRole('link', { name: 'SOHAR-1002' }).getAttribute('href')).toBe(
      '/expenditure/bills/bill-1',
    )
    expect(screen.getByText('−100.000')).toBeTruthy()
    // The ageing strip (Figma 163:28602): four figures, the design's labels, no paragraph around them.
    expect(screen.getByText('Late by 60 or more')).toBeTruthy()
    expect(screen.getByText('Not due yet')).toBeTruthy()
    expect(screen.queryByText(/A rejected bill is not on this statement/)).toBeNull()
  })

  it('reads the year to date first, and any period the reader picks', async () => {
    // The custom range picks the 9th and 12th of this month, and the calendar refuses days after
    // today, so the clock is held at the 20th: on the 1st to the 11th the days could not be picked.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-20T09:00:00Z'))
    renderStatement()
    await screen.findByRole('heading', { level: 1, name: 'Statement' })
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())
    expect(String(calls('GET', `${ONE}/statement?`)[0][0])).toContain(
      `from=${today.slice(0, 4)}-01-01`,
    )

    fireEvent.click(screen.getByRole('button', { name: /Yearly/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Monthly' }))
    await waitFor(() => expect(calls('GET', `${ONE}/statement?`)).toHaveLength(2))
    expect(String(calls('GET', `${ONE}/statement?`)[1][0])).toContain(
      `from=${today.slice(0, 7)}-01`,
    )

    fireEvent.click(screen.getByRole('button', { name: /Monthly/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Custom dates' }))
    // The calendar opens on the month in the field, which both dates start in.
    const pick = (field: 'From' | 'To', dayOfMonth: number) => {
      fireEvent.click(screen.getByRole('button', { name: field }))
      // The grid spills into the next month, so the same number can appear twice; this month's is first.
      fireEvent.click(screen.getAllByRole('button', { name: String(dayOfMonth) })[0])
    }
    pick('From', 9)
    pick('To', 2)
    fireEvent.click(screen.getByRole('button', { name: 'Show the statement' }))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      "The first date can't be after the second.",
    )
    expect(calls('GET', `${ONE}/statement?`)).toHaveLength(2)

    pick('To', 12)
    fireEvent.click(screen.getByRole('button', { name: 'Show the statement' }))
    await waitFor(() => expect(calls('GET', `${ONE}/statement?`)).toHaveLength(3))
    const month = today.slice(0, 7)
    expect(String(calls('GET', `${ONE}/statement?`)[2][0])).toContain(
      `from=${month}-09&to=${month}-12`,
    )
  })

  it('asks for each file over the period on screen', async () => {
    renderStatement()
    await screen.findByRole('heading', { level: 1, name: 'Statement' })
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }))
    await waitFor(() => expect(calls('GET', `${ONE}/statement.xlsx`)).toHaveLength(1))
    expect(String(calls('GET', `${ONE}/statement.xlsx`)[0][0])).toContain(`to=${today}`)

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(calls('GET', `${ONE}/statement.pdf`)).toHaveLength(1))
    // The design's bar offers PDF and Excel; the CSV export lives on the supplier page's Statement menu.
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull()
  })

  it('draws the notes under the rows and the ageing figures once the server sends them', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/v1/me/entitlements') return json(200, who)
      if (url === ONE) return json(200, detail)
      if (url.startsWith(`${ONE}/statement?`))
        return json(200, {
          ...STATEMENT,
          entries: STATEMENT.entries.map((entry) =>
            entry.kind === 'BILL'
              ? { ...entry, detail: 'Against PO-0021 · matched in full', outstanding: 1000 }
              : entry,
          ),
          ageingDetail: { NOT_DUE: { bills: 1, nextDue: '2026-10-19' } },
          everLate: false,
          unusedCredits: 1,
        })
      throw new Error(`unexpected ${url}`)
    })
    renderStatement()
    expect(await screen.findByText('Against PO-0021 · matched in full')).toBeTruthy()
    expect(screen.getByText('1 bill · next due 19 Oct 2026')).toBeTruthy()
    expect(screen.getByText('Never been late with them')).toBeTruthy()
    expect(screen.getByText(/1 credit note still unused/)).toBeTruthy()
  })

  describe('"Never been late with them", read from the supplier overview', () => {
    const NOTHING = i18n.t('supplierStatement.nothing', { lng: 'en' })
    const withOverview = (overview: () => Response) =>
      fetchMock.mockImplementation(async (url: string) => {
        if (url === '/api/v1/me/entitlements') return json(200, who)
        if (url === ONE) return json(200, detail)
        if (url === `${ONE}/overview`) return overview()
        // The statement as the backend sends it today: no `everLate` of its own.
        if (url.startsWith(`${ONE}/statement?`)) return json(200, STATEMENT)
        throw new Error(`unexpected ${url}`)
      })
    const payables = (everLate: boolean, currencyCode = 'OMR') => ({
      tabs: { bills: 3, payments: 1, orders: 0, documents: 0 },
      match: { agreed: 0, orderBacked: 0, summary: null },
      usualLeadTimeDays: null,
      payables: {
        currencyCode,
        notDue: { amount: 1000, bills: 1, nextDue: '2026-10-19' },
        dueSoon: { amount: 0, bills: 0, nextDue: null },
        late: { amount: 0, bills: 0, nextDue: null },
        onHold: { amount: 0, bills: 0, nextDue: null },
        everLate,
        total: 1000,
      },
    })

    it('is said under the first late figure when the overview says they never were', async () => {
      withOverview(() => json(200, payables(false)))
      renderStatement()
      expect(await screen.findByText('Never been late with them')).toBeTruthy()
      expect(calls('GET', `${ONE}/overview`)).toHaveLength(1)
    })

    it('is not said when a bill was paid late before', async () => {
      withOverview(() => json(200, payables(true)))
      renderStatement()
      await screen.findByRole('heading', { level: 1, name: 'Statement' })
      await waitFor(() => expect(calls('GET', `${ONE}/overview`)).toHaveLength(1))
      // The strip is drawn: its empty buckets say so.
      await waitFor(() => expect(screen.getAllByText(NOTHING).length).toBeGreaterThan(0))
      expect(screen.queryByText('Never been late with them')).toBeNull()
    })

    it('is not said, and the statement still reads, when the overview cannot be read', async () => {
      withOverview(() => json(500, { status: 500 }))
      renderStatement()
      expect(await screen.findByRole('heading', { level: 1, name: 'Statement' })).toBeTruthy()
      await waitFor(() => expect(screen.getAllByText(NOTHING).length).toBeGreaterThan(0))
      expect(screen.queryByText('Never been late with them')).toBeNull()
    })

    it('takes the statement’s own answer first, and the overview’s only in the same currency', () => {
      const overview = payables(false) as never
      expect(everLateOf({ everLate: true, currencyCode: 'OMR' }, overview)).toBe(true)
      expect(everLateOf({ currencyCode: 'OMR' }, overview)).toBe(false)
      expect(everLateOf({ everLate: null, currencyCode: 'OMR' }, payables(true) as never)).toBe(
        true,
      )
      expect(everLateOf({ currencyCode: 'USD' }, overview)).toBeNull()
      expect(everLateOf({ currencyCode: 'OMR' }, null)).toBeNull()
    })
  })

  it('emails the statement to an address already on the record, and says when email is off', async () => {
    renderStatement()
    await screen.findByRole('heading', { level: 1, name: 'Statement' })

    fireEvent.click(screen.getByRole('button', { name: 'Email it to them' }))
    const dialog = await screen.findByRole('dialog', { name: 'Email this statement' })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'finance@soharpack.om' }))
    emailResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/validation-failed',
        detail: 'E-mail delivery is not switched on for this deployment',
      })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send it' }))
    // A server from before the codes: its code-less 400 still reads as e-mail not switched on.
    expect(
      await screen.findByText(
        "Email isn't switched on. Download the statement and send it yourself.",
      ),
    ).toBeTruthy()
    expect(JSON.parse(String(calls('POST', `${ONE}/statement/email`)[0][1]?.body))).toEqual({
      recipient: 'finance@soharpack.om',
    })

    emailResponse = () => json(200, { recipient: 'finance@soharpack.om', nameSubstituted: false })
    fireEvent.click(screen.getByRole('button', { name: 'Send it' }))
    expect(await screen.findByText('Sent to finance@soharpack.om.')).toBeTruthy()
  })

  // The owner's approved sentences, word for word.
  describe('why the statement was not e-mailed, in its own sentence', () => {
    const GENERIC = /The server refused this\. Nothing was changed/
    const refusal = (status: number, error: string) => () =>
      json(status, { type: 'https://api.fawtir.om/problems/expenditure-refused', error })

    async function send() {
      renderStatement()
      await screen.findByRole('heading', { level: 1, name: i18n.t('supplierStatement.title') })
      fireEvent.click(screen.getByRole('button', { name: i18n.t('supplierStatement.emailIt') }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('radio', { name: 'finance@soharpack.om' }))
      fireEvent.click(
        within(dialog).getByRole('button', { name: i18n.t('supplierStatement.email.send') }),
      )
      return dialog
    }

    it.each([
      [
        400,
        'SUPPLIER_STATEMENT_EMAIL_NOT_SWITCHED_ON',
        "Email isn't switched on. Download the statement and send it yourself.",
      ],
      [400, 'SUPPLIER_SWITCHED_OFF', 'This supplier is switched off, so nothing is sent to them.'],
      [
        400,
        'SUPPLIER_STATEMENT_NO_EMAIL_ADDRESS',
        'This supplier has no email address on file. Add one on their page.',
      ],
      [
        400,
        'SUPPLIER_STATEMENT_RECIPIENT_NOT_ON_RECORD',
        "finance@soharpack.om is not on this supplier's record. Choose an address from the list, or add it on their page.",
      ],
      [
        400,
        'SUPPLIER_STATEMENT_PERIOD_INVALID',
        'The start date is after the end date. Fix the period, then send.',
      ],
      [
        503,
        'SUPPLIER_STATEMENT_SEND_FAILED',
        'The statement could not be sent just now. Try again, or download it and send it yourself.',
      ],
    ])('%i %s', async (status, error, sentence) => {
      emailResponse = refusal(status, error)
      const dialog = await send()
      expect(await within(dialog).findByText(sentence)).toBeTruthy()
      expect(within(dialog).queryByText(GENERIC)).toBeNull()
    })

    it('names the address in Arabic', async () => {
      await i18n.changeLanguage('ar')
      emailResponse = refusal(400, 'SUPPLIER_STATEMENT_RECIPIENT_NOT_ON_RECORD')
      const dialog = await send()
      expect(
        await within(dialog).findByText(
          'finance@soharpack.om ليس في سجل هذا المورّد. اختر عنوانًا من القائمة، أو أضفه من صفحته.',
        ),
      ).toBeTruthy()
    })

    it('keeps the general refusal for a code with no sentence of its own', async () => {
      emailResponse = refusal(400, 'SUPPLIER_STATEMENT_SOMETHING_NEW')
      const dialog = await send()
      expect(await within(dialog).findByText(GENERIC)).toBeTruthy()
      expect(within(dialog).queryByText(/Email isn't switched on/)).toBeNull()
    })

    it('does not call a failure that is not a refusal "not switched on"', async () => {
      emailResponse = () =>
        json(500, { type: 'https://api.fawtir.om/problems/internal-error', detail: 'boom' })
      const dialog = await send()
      expect(await within(dialog).findByRole('alert')).toBeTruthy()
      expect(within(dialog).queryByText(/Email isn't switched on/)).toBeNull()
    })
  })

  it('offers no email without the permission, and none at all to a switched-off supplier', async () => {
    who = READER
    renderStatement()
    await screen.findByRole('heading', { level: 1, name: 'Statement' })
    expect(screen.queryByRole('button', { name: 'Email it to them' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy()

    who = MANAGER
    detail = {
      ...DETAIL,
      profile: { ...DETAIL.profile, status: 'SWITCHED_OFF', emailRecipients: [] },
    }
    forgetEntitlements()
    renderStatement()
    // The reader's page above offered none, so this is the only one on screen.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Email it to them' })).toHaveLength(1),
    )
    const off = screen.getAllByRole('button', { name: 'Email it to them' })[0] as HTMLButtonElement
    expect(off.disabled).toBe(true)
    expect(
      screen.getByText('This supplier is switched off, so nothing is sent to them.'),
    ).toBeTruthy()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderStatement()
    expect(await screen.findByRole('heading', { level: 1, name: 'كشف الحساب' })).toBeTruthy()
    expect(screen.getByText('شركة البهجة للقهوة')).toBeTruthy()
    expect(screen.getByText('إشعار دائن')).toBeTruthy()
  })
})

describe('statement helpers', () => {
  it('dates each preset from today', () => {
    expect(periodRange('year', '2026-09-17')).toEqual({ from: '2026-01-01', to: '2026-09-17' })
    expect(periodRange('quarter', '2026-09-17')).toEqual({ from: '2026-07-01', to: '2026-09-17' })
    expect(periodRange('month', '2026-09-17')).toEqual({ from: '2026-09-01', to: '2026-09-17' })
    expect(periodRange('last90', '2026-09-17')).toEqual({ from: '2026-06-19', to: '2026-09-17' })
  })

  it('says what a custom range would be refused for', () => {
    expect(customRangeProblem('', '2026-09-17', '2026-09-17')).toBe(
      'supplierStatement.error.datesRequired',
    )
    expect(customRangeProblem('2026-09-18', '2026-09-17', '2026-09-17')).toBe(
      'supplierStatement.error.fromAfterTo',
    )
    expect(customRangeProblem('2026-09-01', '2026-09-30', '2026-09-17')).toBe(
      'supplierStatement.error.future',
    )
    expect(customRangeProblem('2026-09-01', '2026-09-17', '2026-09-17')).toBeNull()
  })

  it('puts each entry in its column with the sign it moves the balance by', () => {
    expect(columnsOf('BILL', 100)).toEqual({ billed: 100, paid: null })
    expect(columnsOf('CREDIT_NOTE', 100)).toEqual({ billed: -100, paid: null })
    expect(columnsOf('PAYMENT', 100)).toEqual({ billed: null, paid: 100 })
    expect(columnsOf('REVERSAL', 100)).toEqual({ billed: null, paid: -100 })
    expect(entryLink('BILL', 'b-1')).toBe('/expenditure/bills/b-1')
    expect(entryLink('PAYMENT', 'p-1')).toBeNull()
    expect(periodTotals({ ...STATEMENT, bills: 1200.5, credits: 100.25 }).billedNet).toBe(1100.25)
  })

  it('reads payment terms in either spelling the records carry', () => {
    expect(termsNote('NET30')).toEqual({ key: 'supplierRecord.terms.net', values: { count: 30 } })
    expect(termsNote('NET_10')).toEqual({ key: 'supplierRecord.terms.net', values: { count: 10 } })
    expect(termsNote('DUE_ON_RECEIPT')).toEqual({ key: 'supplierRecord.terms.onReceipt' })
    expect(termsNote('NET0')).toEqual({ key: 'supplierRecord.terms.onReceipt' })
    expect(termsNote('MONTHLY')).toEqual({
      key: 'supplierRecord.terms.raw',
      values: { code: 'MONTHLY' },
    })
    expect(termsNote('  ')).toBeNull()
  })

  it('says why the statement cannot be emailed before the server is asked', () => {
    expect(emailBlocker(DETAIL.profile, true)).toBeNull()
    expect(emailBlocker({ ...DETAIL.profile, emailRecipients: [] }, true)).toBe(
      'supplierStatement.email.noAddress',
    )
    expect(emailBlocker({ ...DETAIL.profile, status: 'SWITCHED_OFF' }, true)).toBe(
      'supplierStatement.email.switchedOff',
    )
    expect(emailBlocker({ ...DETAIL.profile, emailRecipients: [] }, false)).toBeNull()
  })
})
