import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { dropLoginChallenge } from '../../lib/identity/loginChallenge'
import { noteQueueSender, queuedFor, resetPosQueue, type QueuedSale } from '../../lib/posQueue'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { resetSharedRequests } from '../../api'
import type { PosTillDto } from '../../api/pos/pos'
import { CashierPicker } from '../../pages/PosPage/CashierPicker'
import { UserMenu } from './UserMenu'

// NOT RUN (batch 42, static only). OFF-4: sign-out and Switch user with sales still queued on the
// device. One bounded send first; what is left is said, and the next press signs out. Sign-out is
// never stopped (OFFSEC41 §6.3 item 4; owner batch 42 prompt, OFF-4).

const LOGOUT = '/api/v1/auth/logout'
const CSRF = 'csrf-token-value'

const queued: QueuedSale = {
  key: 'pos-sale-key-49',
  tillId: 'till-1',
  number: 'NZW-T01-INV-2026-000049',
  body: {
    tillId: 'till-1',
    soldAt: '2026-10-29T10:00:00Z',
    queuedOffline: true,
    invoiceNumber: 'NZW-T01-INV-2026-000049',
    customer: { kind: 'WALK_IN' },
    draft: { lines: [] } as never,
    lineRefs: [],
    payments: [{ method: 'CASH', amount: 1.5 }],
    tip: null,
  },
  refusal: null,
  madeBy: { userId: 'u-1', name: 'Maryam' },
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let order: string[]
let salesAnswer: boolean

function Probe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  localStorage.clear()
  dropLoginChallenge()
  forgetEntitlements()
  resetSharedRequests()
  resetPosQueue()
  // The person signed in on this device: only the sales they queue go by themselves (round 5, P3b).
  noteQueueSender('u-1')
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  order = []
  salesAnswer = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/v1/pos/sales' && init?.method === 'POST') {
        if (!salesAnswer) throw new TypeError('Failed to fetch')
        order.push(`sale ${new Headers(init.headers).get('Idempotency-Key')}`)
        const body = JSON.parse(String(init.body))
        return json({ saleId: 's-1', invoiceNumber: body.invoiceNumber, warnings: [] }, 201)
      }
      if (url === LOGOUT) {
        order.push('logout')
        return new Response(null, { status: 204 })
      }
      if (url === '/api/v1/me/entitlements') {
        return json({ userId: 'u-1', username: 'maryam', tenantId: 't-1', roles: [], permissions: [], scopes: [], featureFlags: {} })
      }
      return new Response('', { status: 404 })
    }),
  )
  localStorage.setItem('fawtir.pos.queue', JSON.stringify([queued]))
  expect(queuedFor('till-1')).toHaveLength(1)
})

afterEach(() => {
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
})

const renderMenu = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route
          path="/dashboard"
          element={<UserMenu name="Maryam" roleKey={null} initials="M" />}
        />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )

const menuItem = (label: string) => screen.getByRole('menuitem', { name: label })

describe('the user menu with sales still on this device (OFF-4, PRV42W-1)', () => {
  // The menu knows no till, so it never sends: a LEGACY sale would be filed as the signer's.
  it('online, it sends nothing, says what is left, and the next press signs out', async () => {
    salesAnswer = true
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /Maryam/ }))
    fireEvent.click(menuItem(i18n.t('shell.user.signOut')))

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        i18n.t('pos.pendingSync.signOutLeft', { count: 1 }),
      ),
    )
    expect(order).toEqual([])
    const again = menuItem(i18n.t('pos.pendingSync.signOutAnyway'))
    expect(again.getAttribute('title')).toBe(i18n.t('pos.pendingSync.signOutLeft', { count: 1 }))

    fireEvent.click(again)
    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(order).toEqual(['logout'])
    // Signing out anyway discards nothing.
    expect(queuedFor('till-1').map((sale) => sale.key)).toEqual(['pos-sale-key-49'])
  })
})

describe('Switch user on the till with sales still on this device (OFF-4, PRV42W-1)', () => {
  const TILL = {
    id: 'till-1',
    name: 'Till 1',
    code: 'T01',
    openShift: {
      shiftId: 'sh-1',
      cashier: { userId: 'u-1', name: 'Maryam' },
      openedAt: '2026-10-29T03:00:00Z',
    },
  } as unknown as PosTillDto
  const OTHER = { ...TILL, id: 'till-2', name: 'Till 2', code: 'T02' } as PosTillDto

  const renderPicker = (till: PosTillDto, mine: boolean) =>
    render(
      <MemoryRouter initialEntries={['/pos']}>
        <Routes>
          <Route path="/pos" element={<CashierPicker till={till} mine={mine} />} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )

  const switchUser = (label = i18n.t('pos.till.switchUser')) => {
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.whoIsOnTill') }))
    fireEvent.click(screen.getByRole('button', { name: label }))
  }

  it('on their own shift and online, it sends this till\'s sale before signing out', async () => {
    salesAnswer = true
    renderPicker(TILL, true)
    switchUser()
    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(order).toEqual(['sale pos-sale-key-49', 'logout'])
  })

  it('offline: warns, keeps the sale, and switches on the next press', async () => {
    renderPicker(TILL, true)
    switchUser()
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.signOutLeft', { count: 1 })),
    ).toBeTruthy()
    expect(order).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.pendingSync.switchAnyway') }))
    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(order).toEqual(['logout'])
    expect(queuedFor('till-1')).toHaveLength(1)
  })

  it('on another till, it never sends the sale queued for till 1, only warns', async () => {
    salesAnswer = true
    renderPicker(OTHER, true)
    switchUser()
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.signOutLeft', { count: 1 })),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.pendingSync.switchAnyway') }))
    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(order).toEqual(['logout'])
    expect(queuedFor('till-1').map((sale) => sale.key)).toEqual(['pos-sale-key-49'])
  })

  it("on a till whose open shift is someone else's, it sends nothing, only warns", async () => {
    salesAnswer = true
    renderPicker(TILL, false)
    switchUser()
    expect(
      await screen.findByText(i18n.t('pos.pendingSync.signOutLeft', { count: 1 })),
    ).toBeTruthy()
    expect(order).toEqual([])
    expect(queuedFor('till-1')).toHaveLength(1)
  })

  // NOT RUN (batch 43, static only). Owner round 5, P3b: on their own shift a person signing out sends
  // only the sales they made; a colleague's, or one queued before makers were kept, stays and is warned of.
  for (const [label, madeBy] of [
    ['a colleague', { userId: 'u-2', name: 'Salim' }],
    ['nobody recorded', undefined],
  ] as const) {
    it(`on their own shift, a sale made by ${label} is not sent, only warned of`, async () => {
      localStorage.setItem('fawtir.pos.queue', JSON.stringify([{ ...queued, madeBy }]))
      salesAnswer = true
      renderPicker(TILL, true)
      switchUser()
      expect(
        await screen.findByText(i18n.t('pos.pendingSync.signOutLeft', { count: 1 })),
      ).toBeTruthy()
      expect(order).toEqual([])
      expect(queuedFor('till-1').map((sale) => sale.key)).toEqual(['pos-sale-key-49'])
    })
  }
})
