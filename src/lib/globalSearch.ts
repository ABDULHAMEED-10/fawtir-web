import { customerListPath, loadCustomerPage } from '../api/customers/customers'
import { invoiceListPath, loadInvoicePage } from '../api/invoices/list'
import { loadSupplierPage, supplierListPath } from '../api/expenditure/suppliers'
import { formatAmount } from './format'
import type { Hit } from './shell'

const PER_KIND = 4

/**
 * The topbar search, asked of the server: the invoice, customer and supplier lists' own `q` /
 * `search` filters, a few rows each. It used to search a built-in index of a sample company's
 * invoices, customers, suppliers and catalogue, so it found records that do not exist.
 *
 * Each list answers on its own: a list the reader may not see (403) or that fails adds nothing
 * rather than failing the whole search. `failed` says when no list answered, so the box can say
 * "search is not available" instead of "nothing found".
 */
export async function searchEverywhere(
  query: string,
  language: string,
): Promise<{ hits: Hit[]; failed: boolean }> {
  const q = query.trim()
  const [invoices, customers, suppliers] = await Promise.allSettled([
    loadInvoicePage(
      invoiceListPath({
        state: null,
        payment: null,
        type: null,
        from: null,
        to: null,
        search: q,
        sort: 'UPDATED',
        page: 0,
        size: PER_KIND,
      }),
    ),
    loadCustomerPage(
      customerListPath({ type: null, search: q, sort: 'RECENT', page: 0, size: 10 }),
    ),
    loadSupplierPage(supplierListPath({ filter: 'ALL', q, sort: 'NAME', page: 0, pageSize: PER_KIND })),
  ])

  const hits: Hit[] = []
  if (invoices.status === 'fulfilled') {
    for (const row of invoices.value.items.slice(0, PER_KIND)) {
      hits.push({
        id: row.id,
        kind: 'invoice',
        title: row.invoiceNumber ?? '—',
        subtitle: row.customerName ?? '',
        to: `/invoices/${row.id}`,
        trailing: row.totals
          ? `${row.currency} ${formatAmount(row.totals.totalAmount, row.currency, language)}`
          : undefined,
      })
    }
  }
  if (customers.status === 'fulfilled') {
    for (const row of customers.value.items.slice(0, PER_KIND)) {
      hits.push({
        id: row.id,
        kind: 'customer',
        title: row.displayName,
        subtitle: row.profile?.details?.vatRegistrationNumber ?? '',
        to: `/customers/${row.id}/edit`,
      })
    }
  }
  if (suppliers.status === 'fulfilled') {
    for (const row of suppliers.value.items.slice(0, PER_KIND)) {
      hits.push({
        id: row.id,
        kind: 'supplier',
        title: row.displayName,
        subtitle: row.vatNumber ?? '',
        to: `/suppliers/${row.id}`,
      })
    }
  }
  const failed = [invoices, customers, suppliers].every((result) => result.status === 'rejected')
  return { hits, failed }
}
