import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { ErpBridgePage } from './ErpBridgePage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const BRIDGE_URL = '/api/v1/invoices/bridge'
const CERTIFICATION_URL = '/api/v1/peppol/mapping-profiles/'

const ADMIN_UPLOADER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['invoice.submit', 'admin.settings.manage'],
  scopes: [],
  featureFlags: {},
}
const UPLOADER: Entitlements = { ...ADMIN_UPLOADER, permissions: ['invoice.submit'] }
const READER: Entitlements = {
  ...ADMIN_UPLOADER,
  permissions: ['invoice.read', 'admin.settings.manage'],
}

const RECEIPT = {
  id: 'invc_01J9ZB',
  invoice_uuid: '7a2935a9-1cce-5260-bf9a-57f156f66867',
  instance_uuid: 'a1',
  document_kind: 'STANDARD_INVOICE',
  state: 'QUEUED',
  warnings: [],
  source: { external_document_id: 'SO-1001', disposition: 'ACCEPTED' },
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      type: 'https://fawtir.om/problems/x',
      status,
      error: code,
      detail: 'SERVER-PROSE-MARKER java.lang.IllegalStateException at com.fawtir.Secret',
      correlationId: 'corr-123',
      ...extra,
    }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> }

let who: Entitlements
let calls: Call[]
let certified: boolean
let answers: (() => Response | Promise<Response>)[]

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  resetSharedRequests()
  who = ADMIN_UPLOADER
  calls = []
  certified = true
  answers = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      )
      const method = init?.method ?? 'GET'
      const headers = Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      )
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null, headers })
      if (url.startsWith(ENTITLEMENTS_URL)) return json(200, who)
      if (url.startsWith(CERTIFICATION_URL)) {
        return json(200, {
          certified,
          format: url.includes('/XML/') ? 'XML' : 'JSON',
          document_kind: 'STANDARD_INVOICE',
          route: 'INVOICE',
          transaction_scope: 'x',
          active_content_hash: null,
          certified_content_hash: null,
          certified_at: null,
          profile_id: null,
          reason: certified ? null : 'SERVER-REASON-MARKER no passing FR-005 test invoice',
        })
      }
      if (url === BRIDGE_URL && method === 'POST') {
        const next = answers.shift()
        return next ? next() : json(202, RECEIPT)
      }
      return json(404)
    }),
  )
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/erp/bridge']}>
      <Routes>
        <Route path="/settings/erp/bridge" element={<ErpBridgePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const uploads = () => calls.filter((call) => call.url === BRIDGE_URL)
const fileInput = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement

async function choose(container: HTMLElement, file: File) {
  fireEvent.change(fileInput(container), { target: { files: [file] } })
  await screen.findByText(file.name)
}

async function fillAndChoose(
  container: HTMLElement,
  file = new File(['{"number":"INV-1"}'], 'so-1001.json'),
) {
  await screen.findByRole('button', { name: 'Upload' })
  await choose(container, file)
  fireEvent.change(screen.getByLabelText(/Document ID in your ERP/), {
    target: { value: 'SO-1001' },
  })
}

describe('access', () => {
  it('offers the upload to a holder of invoice.submit and never asks for a connection', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: 'Upload' })).toBeTruthy()
    expect(screen.queryByLabelText(/connection/i)).toBeNull()
    expect(screen.getByText('How documents reach Fawtir')).toBeTruthy()
    expect(calls.some((call) => call.url.startsWith('/api/v1/erp/connections'))).toBe(false)
  })

  it('draws no form without invoice.submit, and sends nothing', async () => {
    who = READER
    renderPage()
    expect(await screen.findByText('How documents reach Fawtir')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull()
    expect(uploads()).toHaveLength(0)
  })
})

describe('mapping readiness', () => {
  it('reads the certification once for the invoice route and says when it is ready', async () => {
    renderPage()
    expect(await screen.findByText('Ready')).toBeTruthy()
    const reads = calls.filter((call) => call.url.startsWith(CERTIFICATION_URL))
    expect(reads).toHaveLength(1)
    expect(reads[0].url).toBe(
      '/api/v1/peppol/mapping-profiles/JSON/certification?document_kind=STANDARD_INVOICE&route=INVOICE&transaction_type=1XXXXXXXXXXXXXXXXXXX',
    )
  })

  it('says when it is not ready, in its own words, and links to certification', async () => {
    certified = false
    const { container } = renderPage()
    expect(await screen.findByText('Not ready')).toBeTruthy()
    expect(container.textContent).not.toContain('SERVER-REASON-MARKER')
    expect(
      screen.getByRole('link', { name: 'Open mapping certification' }).getAttribute('href'),
    ).toBe('/settings/erp-mapping/certification')
  })

  it('for XML, says the mapping is made through the API and sends no one to the JSON-only screens', async () => {
    certified = false
    renderPage()
    await screen.findByText('Not ready')
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    fireEvent.click(await screen.findByRole('option', { name: 'XML' }))
    expect(await screen.findByText(/saved and certified through the Fawtir API/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open mapping certification' })).toBeNull()
  })

  it('does not read the mapping for an uploader who may not administer it', async () => {
    who = UPLOADER
    renderPage()
    expect(await screen.findByText(/Your administrator manages the ERP mapping/)).toBeTruthy()
    expect(calls.some((call) => call.url.startsWith(CERTIFICATION_URL))).toBe(false)
  })

  it('reads it for an uploader holding mapping.read, which the status route accepts', async () => {
    who = { ...ADMIN_UPLOADER, permissions: ['invoice.submit', 'mapping.read'] }
    renderPage()
    expect(await screen.findByText('Ready')).toBeTruthy()
    expect(calls.some((call) => call.url.startsWith(CERTIFICATION_URL))).toBe(true)
  })
})

describe('the request', () => {
  it('sends one POST with the route body, the parsed document and an upload key', async () => {
    const { container } = renderPage()
    await fillAndChoose(container)
    fireEvent.change(screen.getByLabelText(/^Version/), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await screen.findByText('Accepted')
    expect(uploads()).toHaveLength(1)
    const [upload] = uploads()
    expect(upload.method).toBe('POST')
    expect(upload.headers['Idempotency-Key']).toMatch(/^bridge-upload-[0-9a-f-]{36}$/)
    expect(upload.body).toEqual({
      format: 'JSON',
      document: { number: 'INV-1' },
      supplement: {
        issue_time: expect.stringMatching(/^\d{2}:\d{2}:00$/),
        transaction_type: '1XXXXXXXXXXXXXXXXXXX',
      },
      source: { external_document_id: 'SO-1001', external_version: '2' },
    })
    expect(JSON.stringify(upload.body)).not.toContain('so-1001.json')
  })

  it('sends an XML document as the markup itself', async () => {
    const { container } = renderPage()
    await screen.findByRole('button', { name: 'Upload' })
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    fireEvent.click(await screen.findByRole('option', { name: 'XML' }))
    await choose(container, new File(['<Invoice><ID>1</ID></Invoice>'], 'so.xml'))
    fireEvent.change(screen.getByLabelText(/Document ID in your ERP/), {
      target: { value: 'SO-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await screen.findByText('Accepted')
    expect(uploads()[0].body).toMatchObject({
      format: 'XML',
      document: '<Invoice><ID>1</ID></Invoice>',
    })
  })

  it('makes exactly one request however often the upload is pressed', async () => {
    let release: () => void = () => {}
    answers.push(() => new Promise((resolve) => (release = () => resolve(json(202, RECEIPT)))))
    const { container } = renderPage()
    await fillAndChoose(container)
    const button = screen.getByRole('button', { name: 'Upload' })
    const form = button.closest('form') as HTMLFormElement
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(uploads()).toHaveLength(1))
    release()
    await screen.findByText('Accepted')
    expect(uploads()).toHaveLength(1)
  })
})

describe('the answer', () => {
  it('says accepted, not delivered, and links to the compliance activity', async () => {
    const { container } = renderPage()
    await fillAndChoose(container)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    expect(await screen.findByText('Accepted')).toBeTruthy()
    expect(screen.getByText(/entered the invoicing pipeline/)).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'Follow it in the compliance activity' })
        .getAttribute('href'),
    ).toBe(`/compliance/activity/${RECEIPT.invoice_uuid}`)
    expect(container.textContent).not.toMatch(/delivered successfully|success/i)
  })

  it('tells a replay of an accepted document from a new invoice', async () => {
    answers.push(() =>
      json(200, { ...RECEIPT, source: { ...RECEIPT.source, disposition: 'DUPLICATE' } }),
    )
    const { container } = renderPage()
    await fillAndChoose(container)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText('Already uploaded')).toBeTruthy()
    expect(screen.getByText(/Nothing new was submitted/)).toBeTruthy()
  })

  it('shows the failed checks by layer, rule and field, and none of the validator text', async () => {
    answers.push(() =>
      problem(422, 'VALIDATION_FAILED', {
        layer_results: [
          {
            layer: 5,
            layer_name: 'L5_PINT_OM',
            issues: [
              {
                rule: 'OM-R-001',
                field_id: 'IBT-031',
                xpath: "/Invoice[1]/Note[text()='PASSWORD_MARKER']",
                message: 'Seller VAT SECRET_SOURCE_VALUE is not valid',
                severity: 'ERROR',
              },
              { rule: 'OM-W-1', field_id: null, xpath: null, message: 'warn', severity: 'WARN' },
            ],
          },
        ],
      }),
    )
    const { container } = renderPage()
    await fillAndChoose(container)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    expect(await screen.findByText('OM-R-001')).toBeTruthy()
    expect(screen.getByText('IBT-031')).toBeTruthy()
    expect(screen.getByText('Oman rules')).toBeTruthy()
    expect(screen.queryByText('OM-W-1')).toBeNull()
    for (const marker of [
      'SECRET_SOURCE_VALUE',
      'PASSWORD_MARKER',
      'SERVER-PROSE-MARKER',
      'java.lang',
      'Exception',
    ]) {
      expect(container.textContent).not.toContain(marker)
    }
  })

  it('answers each ledger refusal in its own words', async () => {
    const cases: [number, string, RegExp][] = [
      [409, 'SOURCE_IDENTITY_CONFLICT', /A different document was already uploaded/],
      [409, 'SOURCE_DOCUMENT_ALREADY_REFUSED', /was refused before and is not checked again/],
      [409, 'SOURCE_DOCUMENT_IN_PROGRESS', /already being processed/],
      [422, 'SUBMISSION_NOT_SUPPORTED', /not yet certified for invoices/],
      [422, 'MAPPING_FAILED', /could not turn this document into an invoice/],
    ]
    for (const [status, code, text] of cases) {
      answers.push(() => problem(status, code))
      const { container, unmount } = renderPage()
      await fillAndChoose(container)
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
      expect(await screen.findByText(text)).toBeTruthy()
      expect(container.textContent).not.toContain('SERVER-PROSE-MARKER')
      unmount()
    }
  })

  it('gives an unrecognised failure the shared text and the support reference only', async () => {
    answers.push(() => problem(500, 'INTERNAL_ERROR'))
    const { container } = renderPage()
    await fillAndChoose(container)
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText(/corr-123/)).toBeTruthy()
    expect(container.textContent).not.toContain('SERVER-PROSE-MARKER')
    expect(container.textContent).not.toContain('IllegalStateException')
  })
})

describe('the upload key', () => {
  it('is kept for a retry after no answer, and replaced after a final one or a change', async () => {
    answers.push(() => Promise.reject(new TypeError('Failed to fetch')))
    answers.push(() => problem(422, 'MAPPING_FAILED'))
    const { container } = renderPage()
    await fillAndChoose(container)
    const button = screen.getByRole('button', { name: 'Upload' })

    fireEvent.click(button)
    await screen.findByText(/Fawtir could not be reached/)
    fireEvent.click(button)
    await screen.findByText(/could not turn this document into an invoice/)
    fireEvent.click(button)
    await screen.findByText('Accepted')
    fireEvent.change(screen.getByLabelText(/Document ID in your ERP/), {
      target: { value: 'SO-1002' },
    })
    fireEvent.click(button)
    await waitFor(() => expect(uploads()).toHaveLength(4))

    const keys = uploads().map((call) => call.headers['Idempotency-Key'])
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[1])
    expect(keys[3]).not.toBe(keys[2])
  })
})

describe('the file', () => {
  it('refuses the wrong type, invalid JSON, a non-object and a file over the limit before sending', async () => {
    const { container } = renderPage()
    await screen.findByRole('button', { name: 'Upload' })

    fireEvent.change(fileInput(container), { target: { files: [new File(['x'], 'notes.txt')] } })
    expect(await screen.findByText('Choose a JSON file.')).toBeTruthy()
    fireEvent.change(fileInput(container), { target: { files: [new File(['{nope'], 'a.json')] } })
    expect(await screen.findByText('The file is not valid JSON.')).toBeTruthy()
    fireEvent.change(fileInput(container), { target: { files: [new File(['[1]'], 'a.json')] } })
    expect(await screen.findByText(/must hold one JSON object/)).toBeTruthy()
    const big = new File(['x'], 'big.json')
    Object.defineProperty(big, 'size', { value: 4 * 1024 * 1024 + 1 })
    fireEvent.change(fileInput(container), { target: { files: [big] } })
    expect(await screen.findByText('The file is larger than 4 MB.')).toBeTruthy()

    expect((screen.getByRole('button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(uploads()).toHaveLength(0)
  })

  it('shows a hostile file name as text', async () => {
    const { container } = renderPage()
    await screen.findByRole('button', { name: 'Upload' })
    const name = '<img src=x onerror=alert(1)>.json'
    await choose(container, new File(['{"a":1}'], name))
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(screen.getByText(name)).toBeTruthy()
  })
})

describe('Arabic', () => {
  it('renders in Arabic and keeps codes left to right', async () => {
    await i18n.changeLanguage('ar')
    const { container } = renderPage()
    expect(await screen.findByRole('heading', { name: 'الرفع من نظامك' })).toBeTruthy()
    const bitmap = Array.from(container.querySelectorAll('[dir="ltr"]')).find(
      (node) => node.textContent === '1XXXXXXXXXXXXXXXXXXX',
    )
    expect(bitmap).toBeTruthy()
  })
})
