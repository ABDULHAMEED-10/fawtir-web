import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { resetSharedRequests } from '../../api'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { roleLabel } from '../../lib/roleLabels'
import { useBranchName } from './useBranchName'

/** Business Rules BR-1: a branch reads by its Arabic name in Arabic (E25). */

const OVERVIEW = '/api/v1/branches/overview'
const HEAD = { id: 'b-head', name: 'Gulf Test LLC Head Branch' }
const SOHAR = { id: 'b-sohar', name: 'Sohar' }

let fetchMock: ReturnType<typeof vi.fn>

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>

beforeEach(() => {
  resetSharedRequests()
  forgetEntitlements()
  fetchMock = vi.fn(async (url: string) =>
    url === OVERVIEW
      ? new Response(
          JSON.stringify({
            openCount: 2,
            everCount: 2,
            peopleAcross: 0,
            invoicesThisMonth: 0,
            branches: [
              { ...HEAD, nameAr: 'شركة اختبار الخليج ش م م - الفرع الرئيسي' },
              { ...SOHAR, nameAr: null },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      : new Response(null, { status: 404 }),
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await i18n.changeLanguage('en')
})

describe('useBranchName', () => {
  it('names a branch in English, and reads nothing more', async () => {
    await i18n.changeLanguage('en')
    const { result } = renderHook(() => useBranchName(), { wrapper })
    expect(result.current.label({ ...HEAD, nameAr: 'الفرع الرئيسي' })).toBe(HEAD.name)
    expect(fetchMock.mock.calls.some(([url]) => url === OVERVIEW)).toBe(false)
  })

  it('names a branch by its own Arabic name in Arabic', async () => {
    await i18n.changeLanguage('ar')
    const { result } = renderHook(() => useBranchName(), { wrapper })
    expect(result.current.label({ ...SOHAR, nameAr: 'فرع صحار' })).toBe('فرع صحار')
  })

  it('takes the Arabic name from the overview for a read that carries none, else the name', async () => {
    await i18n.changeLanguage('ar')
    const { result } = renderHook(() => useBranchName(), { wrapper })
    await waitFor(() =>
      expect(result.current.label(HEAD)).toBe('شركة اختبار الخليج ش م م - الفرع الرئيسي'),
    )
    expect(result.current.label(SOHAR)).toBe('Sohar')
    expect(result.current.byId('b-head', HEAD.name)).toBe(
      'شركة اختبار الخليج ش م م - الفرع الرئيسي',
    )
    expect(result.current.byId('b-x', null)).toBeNull()
  })
})

describe('roleLabel', () => {
  const t = (key: string) => i18n.t(key)

  it('names built-in roles by their label in either language, custom roles by their own name', async () => {
    await i18n.changeLanguage('en')
    expect(roleLabel({ code: 'FINANCE_MANAGER', name: 'Finance Manager', systemRole: true }, t)).toBe(
      'Finance manager',
    )
    expect(roleLabel({ code: 'SALES_MANAGER', name: 'Sales Manager' }, t)).toBe('Sales manager')
    expect(roleLabel({ code: 'SALES_MANAGER', name: 'Our sales', systemRole: false }, t)).toBe(
      'Our sales',
    )
    expect(roleLabel({ code: 'NIGHT_SHIFT', name: 'Night shift', systemRole: false }, t)).toBe(
      'Night shift',
    )
    await i18n.changeLanguage('ar')
    expect(roleLabel({ code: 'FINANCE_MANAGER', name: 'Finance Manager', systemRole: true }, t)).toBe(
      'مدير مالي',
    )
    expect(roleLabel({ code: 'SALES_MANAGER', name: 'Sales Manager', systemRole: true }, t)).toBe(
      'مدير المبيعات',
    )
  })
})
