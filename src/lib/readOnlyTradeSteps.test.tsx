import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../i18n'
import { forgetEntitlements, type Entitlements } from './identity/entitlements'
import { resetSharedRequests } from '../api'
import { answerStanding, settle, standingRead } from '../testing/subscriptionStanding'
import { deliveryNoteRowActions, orderFormRowActions, quotationRowActions } from './rowActions'
import { QuotationsPage } from '../pages/QuotationsPage/QuotationsPage'
import { OrderFormsPage } from '../pages/OrderFormsPage/OrderFormsPage'
import { DeliveryNotesPage } from '../pages/DeliveryNotesPage/DeliveryNotesPage'
import { QuotationDetailPage } from '../pages/QuotationDetailPage/QuotationDetailPage'
import { OrderFormDetailPage } from '../pages/OrderFormDetailPage/OrderFormDetailPage'
import { DeliveryNoteDetailPage } from '../pages/DeliveryNoteDetailPage/DeliveryNoteDetailPage'

/**
 * Owner rule, 23 Oct 2026 (ST-2, CA-3): nothing new is made while the subscription is read-only.
 * On the trade documents that means no step or menu item that opens a composer (an invoice, a
 * delivery note) or copies the document. Viewing, editing what exists, printing and downloading
 * stay.
 */
const OWNER = {
  userId: 'u-1',
  username: 'owner',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['tenant.plan.read', 'invoice.read', 'invoice.draft'],
  scopes: [],
  featureFlags: {},
} as Entitlements

// What makes a new document, and Send, which gives one its number (ST-2, third message).
const CREATES = ['convert', 'delivery', 'invoice', 'duplicate', 'send']
const ids = (items: { id: string }[]) => items.map((item) => item.id)

describe('trade-document row menus', () => {
  it.each([
    ['quotation', quotationRowActions],
    ['order form', orderFormRowActions],
    ['delivery note', deliveryNoteRowActions],
  ])('the %s menu drops every item that makes or sends a document while read-only', (_, menu) => {
    const usable = ids(menu('X-1', undefined, true))
    const readOnly = ids(menu('X-1', undefined, false))
    expect(usable.some((id) => CREATES.includes(id))).toBe(true)
    expect(readOnly.filter((id) => CREATES.includes(id))).toEqual([])
    // What remains is the same list, in the same order.
    expect(readOnly).toEqual(usable.filter((id) => !CREATES.includes(id)))
    expect(readOnly).toContain('view')
  })
})

let fetchMock: ReturnType<typeof vi.fn>

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetSharedRequests()
  forgetEntitlements()
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/v1/me/entitlements') return json(200, OWNER)
    return json(404, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string, route: string, page: () => ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={page()} />
      </Routes>
    </MemoryRouter>,
  )
}

const buttons = (name: string) => screen.queryAllByRole('button', { name })

/** [screen, address, route, page, the buttons that open a composer there]. */
const screens: Array<[string, string, string, () => ReactElement, string[]]> = [
  [
    'Order forms (next steps)',
    '/trade-documents/order-forms',
    '/trade-documents/order-forms',
    () => <OrderFormsPage />,
    ['Issue invoice', 'Log a delivery'],
  ],
  [
    'Delivery notes (next steps)',
    '/trade-documents/delivery-notes',
    '/trade-documents/delivery-notes',
    () => <DeliveryNotesPage />,
    ['Issue invoice'],
  ],
  [
    'an order form',
    '/trade-documents/order-forms/SO-0073',
    '/trade-documents/order-forms/:id',
    () => <OrderFormDetailPage />,
    ['Issue invoice', 'Log a delivery'],
  ],
  [
    'a delivery note',
    '/trade-documents/delivery-notes/DN-0124',
    '/trade-documents/delivery-notes/:id',
    () => <DeliveryNoteDetailPage />,
    [i18n.t('deliveryDetail.sale.convertToInvoice', { lng: 'en' })],
  ],
]

describe.each(screens)('%s', (_, path, route, page, names) => {
  it('offers the steps that make a document while the subscription is usable', async () => {
    answerStanding(fetchMock, null)
    renderAt(path, route, page)
    await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
    for (const name of names) await waitFor(() => expect(buttons(name).length).toBeGreaterThan(0))
  })

  it.each(['SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_CANCELLED'])(
    'offers none of them while %s',
    async (restriction) => {
      answerStanding(fetchMock, restriction)
      renderAt(path, route, page)
      await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
      await settle()
      for (const name of names) await waitFor(() => expect(buttons(name)).toHaveLength(0))
    },
  )
})

describe.each([
  [
    'the quotations list',
    '/trade-documents/quotations',
    '/trade-documents/quotations',
    () => <QuotationsPage />,
    'Quotation actions',
  ],
  [
    'a quotation',
    '/trade-documents/quotations/QUO-0118',
    '/trade-documents/quotations/:id',
    () => <QuotationDetailPage />,
    'More actions',
  ],
])('the menu on %s', (_, path, route, page, menuName) => {
  const openMenu = async () => {
    fireEvent.click((await screen.findAllByRole('button', { name: menuName }))[0])
    await screen.findByRole('menuitem', { name: 'View quotation' })
  }

  it('offers Convert and Duplicate while the subscription is usable', async () => {
    answerStanding(fetchMock, null)
    renderAt(path, route, page)
    await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
    await settle()
    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'Convert to order form' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Send to customer' })).toBeTruthy()
  })

  it.each(['SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_CANCELLED'])(
    'offers neither while %s',
    async (restriction) => {
      answerStanding(fetchMock, restriction)
      renderAt(path, route, page)
      await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
      await settle()
      await openMenu()
      expect(screen.queryByRole('menuitem', { name: 'Convert to order form' })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: 'Send to customer' })).toBeNull()
    },
  )
})

describe('the Send buttons on a quotation (ST-2, owner 23 Oct, third message)', () => {
  const path = '/trade-documents/quotations/QUO-0118'
  const route = '/trade-documents/quotations/:id'
  const SENDS = ['Send reminder', 'Revise & resend']

  it('offers them while the subscription is usable', async () => {
    answerStanding(fetchMock, null)
    renderAt(path, route, () => <QuotationDetailPage />)
    await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
    for (const name of SENDS) await waitFor(() => expect(buttons(name).length).toBeGreaterThan(0))
  })

  it.each(['SUBSCRIPTION_SUSPENDED', 'SUBSCRIPTION_CANCELLED'])(
    'offers neither while %s',
    async (restriction) => {
      answerStanding(fetchMock, restriction)
      renderAt(path, route, () => <QuotationDetailPage />)
      await waitFor(() => expect(standingRead(fetchMock)).toBe(true))
      await settle()
      await screen.findAllByRole('button', { name: 'More actions' })
      for (const name of SENDS) expect(buttons(name)).toHaveLength(0)
    },
  )
})
