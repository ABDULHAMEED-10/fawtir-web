import { describe, expect, it } from 'vitest'
import { fromArray, fromItemsPage, fromSnakePage, fromSpringPage, mapPage, pageCountOf } from './page'
import { withQuery } from './query'
import { toApiError } from './errors'

describe('page adapters', () => {
  it('reads the Spring envelope (invoices, customers) with an exact total', () => {
    const page = fromSpringPage({ content: ['a', 'b'], page: 0, size: 2, totalElements: 5, totalPages: 3 })
    expect(page).toMatchObject({ items: ['a', 'b'], page: 0, size: 2, total: 5, hasMore: true })
    expect(pageCountOf(page)).toBe(3)
    expect(fromSpringPage({ content: ['e'], page: 2, size: 2, totalElements: 5 }).hasMore).toBe(false)
  })

  it('does not mistake the Expenditure `count` for a total', () => {
    const page = fromItemsPage({ items: [1, 2, 3], page: 0, pageSize: 3, count: 3 })
    expect(page.total).toBeNull()
    // A full page without a total can only say "there may be one more".
    expect(page.hasMore).toBe(true)
    expect(pageCountOf(page)).toBe(2)
    expect(fromItemsPage({ items: [1], page: 1, pageSize: 3, count: 1 }).hasMore).toBe(false)
  })

  it('uses the Expenditure total once the server sends one', () => {
    const page = fromItemsPage({ items: [1, 2], page: 1, pageSize: 2, count: 2, total: 4 })
    expect(page).toMatchObject({ total: 4, hasMore: false })
    expect(pageCountOf(page)).toBe(2)
  })

  it('carries the Bills truncation flag', () => {
    expect(fromItemsPage({ items: [], page: 0, pageSize: 50, count: 0, truncated: true }).truncated).toBe(true)
  })

  it('reads the snake_case envelope and bare arrays', () => {
    expect(fromSnakePage({ items: ['x'], page: 0, page_size: 25, has_more: true })).toMatchObject({
      size: 25,
      total: null,
      hasMore: true,
    })
    expect(fromArray(['x', 'y'])).toMatchObject({ total: 2, hasMore: false, page: 0 })
    expect(pageCountOf(fromArray([]))).toBe(1)
  })

  it('maps rows and keeps the paging facts', () => {
    const page = mapPage(fromSpringPage({ content: [1, 2], page: 0, size: 2, totalElements: 9 }), (n) => n * 10)
    expect(page).toMatchObject({ items: [10, 20], total: 9 })
  })
})

describe('withQuery', () => {
  it('leaves out absent and blank values', () => {
    expect(withQuery('/v1/suppliers', { filter: 'OWED', q: '', page: 0, page_size: undefined, x: null })).toBe(
      '/v1/suppliers?filter=OWED&page=0',
    )
    expect(withQuery('/v1/suppliers', {})).toBe('/v1/suppliers')
  })

  it('encodes what the reader typed', () => {
    expect(withQuery('/v1/suppliers', { q: 'Al Noor & Sons' })).toBe('/v1/suppliers?q=Al+Noor+%26+Sons')
  })
})

describe('toApiError', () => {
  const respond = (status: number, body: unknown) =>
    toApiError(new Response(null, { status }), body)

  it('keeps the invoice module code and the correlation id', () => {
    const error = respond(503, {
      type: 'https://api.fawtir.om/problems/reference-catalogue-not-available',
      code: 'REFERENCE_CATALOGUE_NOT_AVAILABLE',
      correlationId: 'c-1',
    })
    expect(error).toMatchObject({ code: 'REFERENCE_CATALOGUE_NOT_AVAILABLE', correlationId: 'c-1' })
  })

  it("reads Expenditure's `error` and `trace_id` the same way", () => {
    const error = respond(400, { type: 'https://api.fawtir.om/problems/expenditure-refused', error: 'BILL_ON_HOLD', trace_id: 't-9' })
    expect(error).toMatchObject({ problemType: 'expenditure-refused', code: 'BILL_ON_HOLD', correlationId: 't-9' })
  })

  it('has neither when the body has neither', () => {
    expect(respond(500, undefined)).toMatchObject({ code: null, correlationId: null, problemType: null })
  })
})
