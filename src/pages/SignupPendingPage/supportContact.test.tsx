import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import type { SignupStatusResponse } from '../../lib/identity/onboarding'
import { FawtaraStatusPanel } from '../FawtaraStatusPage/FawtaraStatusPanel'
import { SignupClosedPanel } from './SignupClosedPanel'

const CONTACT_URL = '/api/v1/public/company-contact'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

const CLOSED = {
  stage: 'SUBMITTED',
  submitted: true,
  verificationStatus: 'REJECTED',
  rejectionReason: null,
} as unknown as SignupStatusResponse

const supportLink = (key: string) =>
  screen.getByRole('link', { name: i18n.t(key) }).getAttribute('href')

async function settle() {
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(CONTACT_URL, expect.anything()))
  await act(async () => {})
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('"contact support" links follow the company contact setting (CS-1)', () => {
  it('write to the support email the console saved', async () => {
    fetchMock.mockResolvedValue(
      json(200, { supportEmail: 'fawtara@insight.om', supportPhone: '+968 0000 0000' }),
    )
    render(
      <>
        <FawtaraStatusPanel phase="review" />
        <SignupClosedPanel status={CLOSED} />
      </>,
    )
    await settle()
    expect(supportLink('fawtaraStatus.contactSupport')).toBe('mailto:fawtara@insight.om')
    expect(supportLink('signupPending.closed.contact')).toBe('mailto:fawtara@insight.om')
    // One read serves every link on the page.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keep the old support address when the server has no setting', async () => {
    fetchMock.mockResolvedValue(json(404, { status: 404 }))
    render(
      <>
        <FawtaraStatusPanel phase="review" />
        <SignupClosedPanel status={CLOSED} />
      </>,
    )
    await settle()
    expect(supportLink('fawtaraStatus.contactSupport')).toBe('mailto:support@fawtir.om')
    expect(supportLink('signupPending.closed.contact')).toBe('mailto:support@fawtir.om')
  })
})
