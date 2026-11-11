import type { Entitlements } from '../lib/identity/entitlements'

/**
 * The built-in Viewer and Cashier as the backend grants them (`DefaultRoleCatalogue`: VIEWER is
 * read-only invoices, suppliers, reports, stock and till; CASHIER is the till, its pickers and
 * stock, with no `invoice.*`), for tests that check a restricted role asks only for what it may read.
 */
const restricted = (code: string, name: string, permissions: string[]): Entitlements => ({
  userId: `u-${code.toLowerCase()}`,
  username: `${code.toLowerCase()}_user`,
  tenantId: 't-1',
  roles: [{ id: `r-${code.toLowerCase()}`, code, name, systemRole: true }],
  permissions,
  scopes: [],
  featureFlags: {},
})

export const VIEWER_ROLE: Entitlements = restricted('VIEWER', 'Viewer', [
  'invoice.read',
  'supplier.read',
  'reports.read',
  'reports.sales.read',
  'stock.read',
  'pos.read',
])

export const CASHIER_ROLE: Entitlements = restricted('CASHIER', 'Cashier', [
  'pos.read',
  'pos.sell',
  'pos.close',
  'pos.cash.pay_out',
  'product.read',
  'customer.read',
  'branch.read',
  'stock.read',
])
