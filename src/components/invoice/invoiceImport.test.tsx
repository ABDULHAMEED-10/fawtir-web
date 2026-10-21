import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import type { Entitlements } from '../../lib/identity/entitlements'
import { SessionContext } from '../../lib/session/session'
import type { InvoiceImportBatchDto } from '../../api/invoices/import'
import {
  allClassified,
  classificationAnswers,
  classificationKey,
  importProgress,
  importStepOf,
  missingImportPermission,
} from '../../lib/invoiceImport'
import { InvoiceImportModal } from './InvoiceImportModal'

const DRAFTER: Entitlements = {
  userId: 'u-1',
  username: 'demo',
  tenantId: 't-1',
  roles: [],
  permissions: ['invoice.read', 'invoice.draft', 'customer.manage'],
  scopes: [],
  featureFlags: {},
}

const BLANK: InvoiceImportBatchDto = {
  id: 'imp-1',
  kind: 'BUSINESS',
  state: 'CHECKED',
  filename: 'september.xlsx',
  fileSha256: 'abc',
  duplicateOf: null,
  totalRows: 3,
  processedRows: 3,
  errors: [],
  summary: null,
  inferred: [],
  unresolved: [],
  created: [],
}

const WITH_ERRORS: InvoiceImportBatchDto = {
  ...BLANK,
  errors: [{ rowNumber: 14, column: 'Unit', message: 'KG is not a valid unit. Did you mean KGM?' }],
}

const CLEAN: InvoiceImportBatchDto = {
  ...BLANK,
  summary: {
    invoices: 2,
    lines: 3,
    total: 150.5,
    byCustomer: [{ customerName: 'Muscat Grand Hotel LLC', invoices: 2, total: 150.5 }],
  },
  unresolved: [{ description: 'Cardamom syrup', itemType: 'GOODS', rowCount: 2 }],
}

const CREATED: InvoiceImportBatchDto = {
  ...CLEAN,
  state: 'CREATED',
  created: [
    {
      reference: 'SEP-001',
      invoiceId: 'd-1',
      draftNumber: null,
      customerName: 'Muscat Grand Hotel LLC',
      total: 100,
    },
    {
      reference: 'SEP-002',
      invoiceId: 'd-2',
      draftNumber: null,
      customerName: 'Muscat Grand Hotel LLC',
      total: 50.5,
    },
  ],
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

let fetchMock: ReturnType<typeof vi.fn>
let checked: InvoiceImportBatchDto

const calls = (method: string, suffix: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).includes(suffix) &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )

beforeEach(async () => {
  await i18n.changeLanguage('en')
  checked = WITH_ERRORS
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url.endsWith('/v1/invoices/import/check') && method === 'POST') return json(200, checked)
    if (url.endsWith('/imp-1/commit') && method === 'POST') return json(200, CREATED)
    if (url.includes('/v1/code-lists/hs')) return json(200, { items: [], total: 0 })
    if (url.endsWith('/imp-1') && method === 'DELETE') return new Response(null, { status: 204 })
    throw new Error(`unexpected request to ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderModal(who: Entitlements = DRAFTER, onCreated = vi.fn()) {
  render(
    <SessionContext.Provider value={who}>
      <MemoryRouter>
        <InvoiceImportModal open onClose={() => {}} onCreated={onCreated} />
      </MemoryRouter>
    </SessionContext.Provider>,
  )
  return onCreated
}

async function upload() {
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  const file = new File(['x'], 'september.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  fireEvent.change(input, { target: { files: [file] } })
  await waitFor(() => expect(calls('POST', '/import/check').length).toBeGreaterThan(0))
}

describe('Invoice import dialog', () => {
  it('opens on the guidance, the type choice and the limits, and creates nothing', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'Import invoices' })).toBeTruthy()
    expect(screen.getByText(/One row is one invoice line/)).toBeTruthy()
    expect(screen.getByText('Excel (.xlsx), up to 2,000 rows and 10 MB')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Business/, pressed: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Government/ }))
    expect(screen.getByRole('button', { name: 'Download Government template' })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lists the problems by row and column and offers a corrected upload, never a partial import', async () => {
    renderModal()
    await upload()

    expect(await screen.findByText('KG is not a valid unit. Did you mean KGM?')).toBeTruthy()
    expect(screen.getByText('september.xlsx has 1 problem')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Create/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Upload a corrected file' }))
    expect(document.querySelector('input[type=file]')).toBeTruthy()
  })

  it('previews the file, asks for each unresolved classification once, then creates drafts', async () => {
    checked = CLEAN
    renderModal()
    await upload()

    expect(await screen.findByText('Muscat Grand Hotel LLC')).toBeTruthy()
    expect(screen.getByText('1 item needs a classification')).toBeTruthy()
    const create = screen.getByRole('button', { name: 'Create 2 drafts' }) as HTMLButtonElement
    // Nothing is created until every description has a code.
    expect(create.disabled).toBe(true)
    expect(calls('POST', '/commit')).toHaveLength(0)
  })

  it('warns, without blocking, when a blank VAT category was read as standard rate', async () => {
    checked = {
      ...CLEAN,
      unresolved: [],
      warnings: [
        {
          rowNumbers: [6, 7],
          column: 'TAX_CATEGORY',
          code: 'TAX_CATEGORY_DEFAULTED',
          message: 'server sentence',
        },
        {
          rowNumbers: [9],
          column: 'Unit',
          code: 'SOMETHING_NEW',
          message: 'A sentence from the server.',
        },
      ],
    }
    renderModal()
    await upload()

    expect(
      await screen.findByText('2 things to check. The file can still be imported.'),
    ).toBeTruthy()
    // A warning the dialog knows is worded by it; another shows the server's own sentence.
    expect(screen.getByText(/so these lines were set to standard rate \(5%\)/)).toBeTruthy()
    expect(screen.queryByText('server sentence')).toBeNull()
    expect(screen.getByText('A sentence from the server.')).toBeTruthy()
    // The column reads as words, the template's own header, never the code the server may send.
    expect(screen.getByText('Tax category')).toBeTruthy()
    expect(screen.queryByText('TAX_CATEGORY')).toBeNull()
    expect(screen.getByText('Unit')).toBeTruthy()
    // Amber, not the errors' red.
    const table = screen.getByText('Tax category').closest('[data-tone="warning"]') as HTMLElement
    expect(table.className).toContain('border-pending-200')
    const sentence = screen.getByText(/so these lines were set to standard rate \(5%\)/)
    expect(sentence.className).toContain('text-pending-700')
    expect(sentence.className).not.toMatch(/danger|warning-700/)
    // The import still goes ahead.
    const create = screen.getByRole('button', { name: 'Create 2 drafts' }) as HTMLButtonElement
    expect(create.disabled).toBe(false)
  })

  it('words the defaulted-category warning in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    checked = {
      ...CLEAN,
      unresolved: [],
      warnings: [
        { rowNumbers: [6], column: 'TAX_CATEGORY', code: 'TAX_CATEGORY_DEFAULTED', message: 'x' },
      ],
    }
    renderModal()
    await upload()
    expect(await screen.findByText(/بالنسبة الأساسية \(5%\)/)).toBeTruthy()
    expect(screen.getByText('الفئة الضريبية')).toBeTruthy()
    expect(screen.queryByText('TAX_CATEGORY')).toBeNull()
  })

  it('creates the drafts and shows each one with a link to the Drafts tab', async () => {
    checked = { ...CLEAN, unresolved: [] }
    const onCreated = renderModal()
    await upload()

    fireEvent.click(await screen.findByRole('button', { name: 'Create 2 drafts' }))
    expect(await screen.findByText('2 drafts created')).toBeTruthy()
    expect(screen.getByText('SEP-001')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See the drafts' }).getAttribute('href')).toBe(
      '/invoices?tab=drafts',
    )
    expect(calls('POST', '/imp-1/commit')).toHaveLength(1)
    expect(onCreated).toHaveBeenCalled()
  })

  it('refuses a Consumer file without the customer permission and names it', () => {
    renderModal({ ...DRAFTER, permissions: ['invoice.read', 'invoice.draft'] })
    fireEvent.click(screen.getByRole('button', { name: /Consumer/ }))
    expect(screen.getByRole('alert').textContent).toContain('Manage customers')
    expect(document.querySelector('input[type=file]')).toBeNull()
  })

  it('says the import is not available while the server has no route for it', async () => {
    fetchMock.mockImplementation(async () =>
      json(404, { type: 'about:blank', title: 'Not found', status: 404 }),
    )
    renderModal()
    await upload()
    expect(
      await screen.findByText('Invoice import is not available yet: the server does not offer it.'),
    ).toBeTruthy()
  })
})

describe('Invoice import rules', () => {
  it('walks prepare, validate, preview and result from the batch state', () => {
    expect(importStepOf(null)).toBe('prepare')
    expect(importStepOf({ ...BLANK, state: 'CHECKING' })).toBe('validate')
    expect(importStepOf(WITH_ERRORS)).toBe('validate')
    expect(importStepOf(CLEAN)).toBe('preview')
    expect(importStepOf(CREATED)).toBe('result')
  })

  it('shows progress as rows processed against rows total', () => {
    expect(importProgress({ ...BLANK, totalRows: 2000, processedRows: 500 })).toBe(25)
    expect(importProgress({ ...BLANK, totalRows: 0, processedRows: 0 })).toBe(0)
  })

  it('needs every unresolved description classified before creating', () => {
    const key = classificationKey(CLEAN.unresolved[0])
    expect(allClassified(CLEAN.unresolved, {})).toBe(false)
    expect(allClassified(CLEAN.unresolved, { [key]: '000000000000' })).toBe(true)
    expect(classificationAnswers(CLEAN.unresolved, { [key]: '000000000000' })).toEqual([
      { description: 'Cardamom syrup', itemType: 'GOODS', code: '000000000000' },
    ])
  })

  it('asks for customer.manage on a Consumer file only', () => {
    const only = (codes: string[]) => (code: string) => codes.includes(code)
    expect(missingImportPermission('BUSINESS', only(['invoice.draft']))).toBeNull()
    expect(missingImportPermission('CONSUMER', only(['invoice.draft']))).toBe('customer.manage')
    expect(missingImportPermission('BUSINESS', only([]))).toBe('invoice.draft')
  })
})
