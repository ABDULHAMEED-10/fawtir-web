/**
 * One shape for every server-paged list, whatever envelope the endpoint answers with.
 *
 * The backend has several list shapes, and they were not converged on the server because renaming a
 * field in any of them would break a published contract:
 * - `{content, page, size, totalElements, totalPages}`: invoices, customers
 * - `{content, page, size, totalElements}`: products
 * - `{items, page, pageSize, count, total?, truncated?}`: suppliers, bills and the other Expenditure
 *   lists. There `count` is the number of rows on *this* page, not a total.
 * - `{items, page, page_size, has_more}`: compliance activity
 * - bare arrays: quotations, order forms, periodic schedules, the reminder log
 *
 * Screens read {@link Page} and never an envelope, so a list does not care which module it
 * comes from.
 */
export type Page<T> = {
  items: T[]
  /** Zero-based, as the API counts. The pager shows `page + 1`. */
  page: number
  size: number
  /** Every matching row across all pages, or `null` when the endpoint does not say. */
  total: number | null
  /** Whether a further page exists. Exact when `total` is known, inferred from a full page otherwise. */
  hasMore: boolean
  /** The server stopped counting at a cap (the Bills tabs), so `total` is a floor, not a count. */
  truncated: boolean
}

export type SpringPage<T> = {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages?: number
}

export type ItemsPage<T> = {
  items: T[]
  page: number
  pageSize: number
  count: number
  total?: number | null
  truncated?: boolean
}

export type SnakePage<T> = {
  items: T[]
  page: number
  page_size: number
  has_more: boolean
}

export function fromSpringPage<T>(body: SpringPage<T>): Page<T> {
  const seen = (body.page + 1) * body.size
  return {
    items: body.content,
    page: body.page,
    size: body.size,
    total: body.totalElements,
    hasMore: seen < body.totalElements,
    truncated: false,
  }
}

export function fromItemsPage<T>(body: ItemsPage<T>): Page<T> {
  const total = typeof body.total === 'number' ? body.total : null
  return {
    items: body.items,
    page: body.page,
    size: body.pageSize,
    total,
    // Without a total, a full page is the only hint that another may follow. It can be wrong by
    // one page (an exactly full last page), which costs an empty page, never a hidden row.
    hasMore: total === null ? body.items.length === body.pageSize : (body.page + 1) * body.pageSize < total,
    truncated: body.truncated === true,
  }
}

export function fromSnakePage<T>(body: SnakePage<T>): Page<T> {
  return {
    items: body.items,
    page: body.page,
    size: body.page_size,
    total: null,
    hasMore: body.has_more,
    truncated: false,
  }
}

/** An unpaged list, shown as one page holding everything. */
export function fromArray<T>(items: T[]): Page<T> {
  return { items, page: 0, size: items.length, total: items.length, hasMore: false, truncated: false }
}

/** How many pages the pager should offer: exact with a total, "this one and the next" without. */
export function pageCountOf(page: Page<unknown>): number {
  if (page.total !== null) return Math.max(1, Math.ceil(page.total / Math.max(1, page.size)))
  return page.page + (page.hasMore ? 2 : 1)
}

/** Rewrites each row, keeping the paging facts. */
export function mapPage<T, U>(page: Page<T>, map: (item: T) => U): Page<U> {
  return { ...page, items: page.items.map(map) }
}
