import { customerListPath, loadCustomerPage } from '../api/customers/customers'
import { invoiceListPath, loadInvoicePage } from '../api/invoices/list'
import { loadSupplierPage, supplierListPath } from '../api/expenditure/suppliers'
import { productSearchPath, searchProducts } from '../api/catalog/products'
import { archiveListPath, loadArchiveList } from '../api/compliance/archive'
import { formatAmount } from './format'
import type { Hit } from './shell'

const PER_KIND = 4

/**
 * The topbar search, asked of the server: the invoice, customer, supplier and catalogue lists' own
 * `q` / `search` filters and the document archive's number filter, a few rows each. It used to search a built-in index of a sample company's
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
  const [invoices, customers, suppliers, documents, items] = await Promise.allSettled([
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
    // The archive filters by document number only. TODO(backend): a free-text search on the archive
    // (counterparty name, amount), REPORTS.md row 2.4.
    loadArchiveList(archiveListPath({ invoiceNumber: q }, 0, PER_KIND)),
    searchProducts(productSearchPath(q, PER_KIND)),
  ])

  const hits: Hit[] = []
  if (invoices.status === 'fulfilled') {
    for (const row of invoices.value.items.slice(0, PER_KIND)) {
      hits.push({
        id: row.id,
        kind: 'invoice',
        title: row.invoiceNumber ?? row.customerName ?? '',
        subtitle: row.invoiceNumber ? (row.customerName ?? '') : '',
        to: `/invoices/${row.id}`,
        // The currency code leads the figure; the search box swaps "OMR" for the rial sign.
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
  if (documents.status === 'fulfilled') {
    for (const row of documents.value.items.slice(0, PER_KIND)) {
      hits.push({
        id: row.invoice_uuid,
        kind: 'document',
        title: row.invoice_number ?? row.counterparty_name ?? '',
        subtitle: row.invoice_number ? (row.counterparty_name ?? '') : '',
        to: `/compliance/documents/${row.invoice_uuid}`,
        trailing:
          row.total_amount != null && row.currency
            ? `${row.currency} ${formatAmount(row.total_amount, row.currency, language)}`
            : undefined,
      })
    }
  }
  if (items.status === 'fulfilled') {
    for (const row of items.value.items.slice(0, PER_KIND)) {
      hits.push({
        id: row.id,
        kind: 'item',
        title: row.name,
        subtitle: row.code,
        to: `/catalog/${row.id}`,
      })
    }
  }
  const failed = [invoices, customers, suppliers, documents, items].every(
    (result) => result.status === 'rejected',
  )
  return { hits, failed }
}
