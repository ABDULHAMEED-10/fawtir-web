/**
 * A stand-in for the Fawtir gateway, for rendering the app without a backend.
 *
 * `vite preview` (and `vite dev`) proxy `/api` to `http://localhost:8080`; this answers there with
 * just enough for the shells to open: a signed-in platform operator's entitlements, the plan
 * catalogue at the launch prices, and an empty verification queue. Everything else is 404, so a
 * screen that needs more says so honestly rather than pretending.
 *
 *   node tools/mock-api/server.mjs            # port 8080
 *   MOCK_API_PORT=8090 node tools/mock-api/server.mjs
 *
 * Used by the responsive harness and the screenshot checks; never by a build.
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_API_PORT ?? 8080)

const ENTITLEMENTS = {
  userId: 'u-nasser',
  username: 'nasser.alhabsi',
  tenantId: 't-fawtir',
  roles: [
    { id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform tenant administrator', systemRole: true },
    { id: 'r-2', code: 'PLATFORM_SUPPORT', name: 'Platform support', systemRole: true },
  ],
  permissions: [
    'platform.tenants.manage',
    'platform.operators.manage',
    'platform.support',
    'admin.users.manage',
    'admin.roles.manage',
    'role.read',
    'role.list',
  ],
  scopes: ['platform.tenants.manage', 'platform.operators.manage', 'platform.support'],
  featureFlags: {},
}

/** The launch catalogue (src/lib/plans.ts) in the backend's shape. */
const PLANS = [
  plan('STARTER', 'Starter', 12, 200, 2, 3, 1, false, false, 0.09, 10),
  plan('BUSINESS', 'Business', 28, 1000, 5, 2.5, 2, true, false, 0.04, 20),
  plan('BUSINESS_PLUS', 'Business Plus', 55, 3000, 10, 2.5, 5, true, true, 0.026, 30),
]

function plan(code, name, monthlyPrice, invoicesPerMonth, peopleIncluded, extraPersonPrice, branchesIncluded, apiAccess, prioritySupport, overagePricePerInvoice, sortOrder) {
  return {
    code,
    name,
    monthlyPrice,
    invoicesPerMonth,
    peopleIncluded,
    extraPersonPrice,
    branchesIncluded,
    apiAccess,
    prioritySupport,
    overagePricePerInvoice,
    sortOrder,
    active: true,
  }
}

const EMPTY_PAGE = { items: [], page: 0, size: 25, totalElements: 0, totalPages: 0 }

const routes = new Map([
  ['/api/v1/me/entitlements', ENTITLEMENTS],
  ['/api/v1/platform/plans', PLANS],
  ['/api/v1/platform/companies', EMPTY_PAGE],
  ['/api/v1/users', { content: [], totalElements: 0, totalPages: 0, number: 0, size: 25 }],
  ['/api/v1/users/invitations', { items: [] }],
])

createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  const body = request.method === 'GET' ? routes.get(path) : undefined
  if (body === undefined) {
    response.writeHead(404, { 'Content-Type': 'application/problem+json' })
    response.end(
      JSON.stringify({
        type: 'https://api.fawtir.om/problems/resource-not-found',
        title: 'Not found',
        status: 404,
        detail: `The mock API has nothing at ${request.method} ${path}.`,
      }),
    )
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}).listen(PORT, () => {
  console.log(`mock API on http://localhost:${PORT} — ${routes.size} routes`)
})
