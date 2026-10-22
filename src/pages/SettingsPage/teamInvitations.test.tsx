import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import { forgetSubscriptionStanding } from '../../lib/subscriptionReadOnly'
import { TeamPage } from './TeamPage'
import { InvitePage } from './InvitePage'

/**
 * Team members' "Waiting to accept" (E12): each open invitation can be sent again or revoked, the
 * server decides whether either is still possible, and the list is read again after. The invite
 * form names an address that already has an invitation waiting (E13), and a new attempt clears the
 * last "sent" line (E17).
 */
const ADMIN = {
  userId: 'u-1',
  username: 'admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['admin.users.manage', 'role.list'],
  scopes: [],
  featureFlags: {},
} as Entitlements

const PEOPLE = '/api/v1/users?page=0&size=100&sort=createdAt,asc'
const INVITED = '/api/v1/users/invitations?status=PENDING&page=0&size=50'
const INVITE = '/api/v1/users/invitations'
const RESEND = '/api/v1/users/invitations/i-1/resend'
const REVOKE = '/api/v1/users/invitations/i-1/revoke'

const invitation = (extra: Record<string, unknown> = {}) => ({
  id: 'i-1',
  email: 'new@real.example',
  roleCodes: [],
  status: 'PENDING',
  expiresAt: '2026-10-29T08:00:00Z',
  sentCount: 1,
  lastSentAt: null,
  createdAt: '2026-10-22T08:00:00Z',
  ...extra,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const problem = (slug: string, detail: string, extra: Record<string, unknown> = {}) => ({
  type: `https://api.fawtir.om/problems/${slug}`,
  title: 'Conflict',
  status: 409,
  detail,
  ...extra,
})

let answers: Record<string, () => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  forgetSubscriptionStanding()
  answers = {
    [`GET ${PEOPLE}`]: () => json(200, { content: [], totalElements: 0, totalPages: 1, number: 0, size: 100 }),
    [`GET ${INVITED}`]: () => json(200, [invitation()]),
    'GET /api/v1/roles': () => json(200, []),
  }
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me/entitlements') return json(200, ADMIN)
    const answer = answers[`${init?.method ?? 'GET'} ${url}`]
    return answer ? answer() : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const sent = (method: string, url: string) =>
  fetchMock.mock.calls.filter(
    ([u, init]) => u === url && ((init as RequestInit)?.method ?? 'GET') === method,
  )

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/team" element={<TeamPage />} />
        <Route path="/settings/team/invite" element={<InvitePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function openWaiting() {
  renderAt('/settings/team')
  fireEvent.click(await screen.findByRole('button', { name: /Waiting to accept/ }))
  await screen.findByText('new@real.example')
}

async function openMenu() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Actions for the invitation to new@real.example' }),
  )
}

describe('Team members, waiting invitations', () => {
  it('shows the expiry as the app writes a day, not the US style', async () => {
    await openWaiting()
    const row = screen.getByText('new@real.example').closest('tr')!
    expect(within(row).getByText('29 Oct 2026')).toBeTruthy()
    expect(row.textContent).not.toContain('10/29/2026')
  })

  it('sends the invitation again, says so, and reads the list again', async () => {
    answers[`POST ${RESEND}`] = () => json(200, invitation({ sentCount: 2 }))
    await openWaiting()
    const before = sent('GET', INVITED).length
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Resend' }))
    expect(
      await screen.findByText(
        'Invitation to new@real.example sent again. The previous link no longer works.',
      ),
    ).toBeTruthy()
    expect(sent('POST', RESEND)).toHaveLength(1)
    await waitFor(() => expect(sent('GET', INVITED).length).toBeGreaterThan(before))
  })

  it('revokes only after asking, then says so and reads the list again', async () => {
    answers[`POST ${REVOKE}`] = () => json(200, invitation({ status: 'REVOKED' }))
    await openWaiting()
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revoke' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Revoke the invitation to new@real.example?')).toBeTruthy()
    expect(sent('POST', REVOKE)).toHaveLength(0)
    const before = sent('GET', INVITED).length
    answers[`GET ${INVITED}`] = () => json(200, [])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }))
    expect(
      await screen.findByText('Invitation to new@real.example revoked. Its link no longer works.'),
    ).toBeTruthy()
    expect(sent('POST', REVOKE)).toHaveLength(1)
    await waitFor(() => expect(sent('GET', INVITED).length).toBeGreaterThan(before))
    expect(await screen.findByText('No invitations are waiting.')).toBeTruthy()
  })

  it('cancelling the revoke sends nothing', async () => {
    await openWaiting()
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revoke' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(sent('POST', REVOKE)).toHaveLength(0)
  })

  it('says an invitation is no longer waiting when the server refuses, not a generic conflict', async () => {
    answers[`POST ${REVOKE}`] = () =>
      json(409, problem('invitation-closed', 'Invitation is no longer open and cannot be revoked.'))
    await openWaiting()
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revoke' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }))
    expect(await within(dialog).findByText(i18n.t('people.team.invitation.closed'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('apiErrors.conflict'))).toBeNull()
    expect(screen.queryByText(/cannot be revoked/)).toBeNull()
  })

  it('opens on the waiting tab from ?tab=waiting', async () => {
    renderAt('/settings/team?tab=waiting')
    expect(await screen.findByText('new@real.example')).toBeTruthy()
  })
})

describe('Invite someone, refusals', () => {
  async function send(email: string) {
    const box = (await screen.findByRole('textbox', { name: /Email/ })) as HTMLInputElement
    fireEvent.change(box, { target: { value: email } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('people.invite.send') }))
  }

  it('says the address already has an invitation waiting and links to it, not "reload"', async () => {
    answers[`POST ${INVITE}`] = () =>
      json(
        409,
        problem(
          'invitation-already-open',
          'An open invitation already exists for this email; resend or revoke it.',
        ),
      )
    renderAt('/settings/team/invite')
    await send('new@real.example')
    expect(await screen.findByText(i18n.t('people.invite.alreadyOpen'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('apiErrors.conflict'))).toBeNull()
    const link = screen.getByRole('link', { name: i18n.t('people.invite.alreadyOpenLink') })
    expect(link.getAttribute('href')).toBe('/settings/team?tab=waiting')
  })

  it('clears the last "sent" line when the next invitation is refused', async () => {
    answers[`POST ${INVITE}`] = () => json(201, invitation({ id: 'i-2', email: 'x@real.example' }))
    renderAt('/settings/team/invite')
    await send('x@real.example')
    expect(await screen.findByText('Invitation sent to x@real.example.')).toBeTruthy()
    answers[`POST ${INVITE}`] = () =>
      json(
        409,
        problem('extra-place-required', 'English detail', {
          kind: 'USER',
          included: 3,
          inUse: 3,
          capacity: 3,
        }),
      )
    await send('y@real.example')
    expect(await screen.findByText(new RegExp(i18n.t('paidExtras.refusal.extraPlace.USER').slice(0, 20)))).toBeTruthy()
    expect(screen.queryByText('Invitation sent to x@real.example.')).toBeNull()
  })
})
