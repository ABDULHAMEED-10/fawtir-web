import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import { INTAKE_LIVE_MAX_BYTES, INTAKE_MAX_BYTES } from '../../api/expenditure/billIntake'
import { fitForUpload } from '../../lib/billUpload'
import { BillFilePicker, type UploadedIntake } from './BillFilePicker'

/** The edge's 413 (`payload-too-large`, no module code) and what a person is told about it. */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const TOO_LARGE = {
  type: 'https://api.fawtir.om/problems/payload-too-large',
  title: 'Payload too large',
  status: 413,
}

const intake = {
  id: 'i-1',
  source: 'SCANNED',
  filename: 'small.pdf',
  contentType: 'application/pdf',
  byteSize: 3,
  sha256: 'x',
  documentTypeCode: null,
  extractionStatus: 'NONE',
  extracted: { lines: [], confidence: {} },
  confirmedBillId: null,
  workflowState: null,
  uploadedAt: '2026-10-31T10:00:00Z',
}

const pdf = (name: string, bytes = 3) =>
  new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })

let sent: string[]

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sent = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const file = (init?.body as FormData).get('file') as File
      sent.push(file.name)
      return file.name.startsWith('big') ? json(TOO_LARGE, 413) : json(intake, 201)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

function setup() {
  const onUploaded = vi.fn<(uploaded: UploadedIntake[], problems: string[]) => void>()
  const { container } = render(
    <BillFilePicker
      accept=".pdf,.jpg"
      source="SCANNED"
      multiple
      title="Choose"
      hint="Hint"
      onUploaded={onUploaded}
    />,
  )
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  return { onUploaded, input }
}

describe('a file the server refuses for size', () => {
  it.each([
    ['en', /big\.pdf is too large/],
    ['ar', /big\.pdf أكبر مما يقبله فوتر/],
  ])('is named with what to do, not "something went wrong" (%s)', async (language, words) => {
    await i18n.changeLanguage(language)
    const { input, onUploaded } = setup()
    await userEvent.upload(input, pdf('big.pdf'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(words)
    expect(alert.textContent).not.toContain(i18n.t('identityErrors.unexpected'))
    expect(onUploaded).not.toHaveBeenCalled()
  })

  // W5-SHARED audit: a Spring default body puts its reason phrase in `error`. Read as a code, it
  // made refusedForSize (413 and no code) false, and the person saw "something went wrong".
  it('is named the same when the 413 carries only a reason phrase', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      json({ timestamp: '2026-11-05T08:00:00Z', status: 413, error: 'Payload Too Large', path: '/x' }, 413),
    )
    const { input } = setup()
    await userEvent.upload(input, pdf('big.pdf'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/big.pdf is too large/)
    expect(alert.textContent).not.toContain(i18n.t('identityErrors.unexpected'))
  })

  it('does not stop the others, and the parent is told which one did not make it', async () => {
    const { input, onUploaded } = setup()
    await userEvent.upload(input, [pdf('small1.pdf'), pdf('big.pdf'), pdf('small2.pdf')])
    await waitFor(() => expect(onUploaded).toHaveBeenCalled())
    expect(sent).toEqual(['small1.pdf', 'big.pdf', 'small2.pdf'])
    const [uploaded, problems] = onUploaded.mock.calls[0]
    expect(uploaded).toHaveLength(2)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/big\.pdf is too large/)
  })

  it('names a file over the screen limit that came with others', async () => {
    const { input, onUploaded } = setup()
    const over = pdf('huge.pdf')
    Object.defineProperty(over, 'size', { value: 200 * 1024 * 1024 })
    expect(INTAKE_MAX_BYTES).toBeLessThan(over.size)
    await userEvent.upload(input, [pdf('small1.pdf'), over])
    await waitFor(() => expect(onUploaded).toHaveBeenCalled())
    expect(onUploaded.mock.calls[0][1][0]).toMatch(/huge\.pdf is larger than 10 MB/)
  })
})

describe('other failures in a run of files', () => {
  it('names every file that was not stored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const file = (init?.body as FormData).get('file') as File
        return file.name === 'first.pdf' ? json(intake, 201) : json({ status: 500 }, 500)
      }),
    )
    const { input, onUploaded } = setup()
    await userEvent.upload(input, [pdf('first.pdf'), pdf('second.pdf'), pdf('third.pdf')])
    await waitFor(() => expect(onUploaded).toHaveBeenCalled())
    expect(onUploaded.mock.calls[0][1].join(' ')).toContain('Not added: second.pdf, third.pdf.')
  })
})

describe('fitForUpload', () => {
  const photo = (bytes: number) => new File([new Uint8Array(bytes)], 'r.png', { type: 'image/png' })

  afterEach(() => vi.restoreAllMocks())

  it('leaves a file under the limit alone', async () => {
    const small = photo(1000)
    expect(await fitForUpload(small)).toBe(small)
  })

  it('leaves a big PDF alone: only photos shrink', async () => {
    const big = pdf('b.pdf', INTAKE_LIVE_MAX_BYTES + 1)
    expect(await fitForUpload(big)).toBe(big)
  })

  it('sends a big photo shrunk', async () => {
    vi.stubGlobal('createImageBitmap', async () => ({ width: 3200, height: 1600 }))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => undefined,
    } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) =>
      done(new Blob([new Uint8Array(500)], { type: 'image/jpeg' })),
    )
    const fitted = await fitForUpload(photo(INTAKE_LIVE_MAX_BYTES + 1))
    expect(fitted.name).toBe('r.jpg')
    expect(fitted.type).toBe('image/jpeg')
    expect(fitted.size).toBe(500)
  })
})

describe('the words before a file is in', () => {
  it.each(['en', 'ar'])(
    'promise no reading and the size the server takes today (%s)',
    async (lng) => {
      await i18n.changeLanguage(lng)
      expect(i18n.t('billIntake.upload.subtitle')).not.toMatch(/fills in what it can read/)
      expect(i18n.t('billIntake.upload.hint', { mb: 1 })).toMatch(/\b1\b/)
      expect(i18n.t('billIntake.scan.hint', { mb: 1 })).toMatch(/\b1\b/)
      expect(i18n.t('billIntake.upload.hint', { mb: 1 })).not.toMatch(/10/)
    },
  )
})
