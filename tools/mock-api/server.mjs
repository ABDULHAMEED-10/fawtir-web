/**
 * A stand-in for the Fawtir gateway, for rendering the app without a backend.
 *
 * `vite preview` (and `vite dev`) proxy `/api` to `http://localhost:8080`; this answers there with
 * just enough for the shells to open: a signed-in operator's entitlements (with the tenant
 * permissions the sidebar gates on), the plan catalogue, an empty verification queue — plus
 * whatever the route modules in `routes/*.mjs` add per area (invoices, notes, reminders…), in the
 * shapes `src/api/**` expects. Everything else is 404, so a screen that needs more says so
 * honestly rather than pretending.
 *
 *   node tools/mock-api/server.mjs            # port 8080
 *   MOCK_API_PORT=8090 node tools/mock-api/server.mjs
 *
 * Used by the responsive harness and the screenshot checks; never by a build.
 */
import { createServer } from 'node:http'
import { readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = Number(process.env.MOCK_API_PORT ?? 8080)

const ENTITLEMENTS = {
  userId: 'u-nasser',
  username: 'nasser.alhabsi',
  tenantId: 't-fawtir',
  roles: [
    {
      id: 'r-1',
      code: 'PLATFORM_TENANT_ADMIN',
      name: 'Platform tenant administrator',
      systemRole: true,
    },
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
    // The tenant shell's sidebar hides Income, Expenditure, Customers, Suppliers and Catalogue
    // without these, so the same mock session opens both shells.
    'invoice.read',
    'invoice.write',
    'invoice.approve',
    'customer.read',
    'supplier.read',
    'product.read',
  ],
  scopes: ['platform.tenants.manage', 'platform.operators.manage', 'platform.support'],
  featureFlags: {},
}

/** The launch catalogue (src/lib/plans.ts) in the backend's shape. */
const PLANS = [
  plan('STARTER', 'Starter', 35, 200, 2, 3, 1, false, true, 0.15, 10),
  plan('BUSINESS', 'Business', 80, 1000, 5, 2.5, 2, false, true, 0.06, 20),
  plan('BUSINESS_PLUS', 'Business Plus', 150, 3000, 10, 2.5, 5, true, true, 0.04, 30),
]

function plan(
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
) {
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

/**
 * Route modules — tools/mock-api/routes/*.mjs, one per area (see routes/README.md). Each exports
 * an array of { method?, match: string | RegExp, reply({ params, query, body }) }.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const modules = []
try {
  const files = readdirSync(join(HERE, 'routes'))
    .filter((f) => f.endsWith('.mjs'))
    .sort()
  for (const file of files) {
    const mod = await import(pathToFileURL(join(HERE, 'routes', file)).href)
    for (const route of mod.default ?? []) modules.push({ file, ...route })
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

function findModuleRoute(method, path) {
  for (const route of modules) {
    if ((route.method ?? 'GET') !== method) continue
    if (typeof route.match === 'string') {
      if (route.match === path) return { route, params: [] }
    } else {
      const m = path.match(route.match)
      if (m) return { route, params: m.slice(1) }
    }
  }
  return undefined
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = ''
    request.on('data', (chunk) => (raw += chunk))
    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : undefined)
      } catch {
        resolve(undefined)
      }
    })
  })
}

const isAnswer = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof value.status === 'number' &&
  Object.keys(value).every((k) => k === 'status' || k === 'body' || k === 'raw' || k === 'headers')

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const path = url.pathname
  const method = request.method ?? 'GET'

  const found = findModuleRoute(method, path)
  if (found) {
    const body = method === 'GET' ? undefined : await readBody(request)
    const answer = found.route.reply({ params: found.params, query: url.searchParams, body })
    if (isAnswer(answer) && typeof answer.raw === 'string') {
      // A literal body (an XML file, a CSV): written as it is, under the route's own headers.
      response.writeHead(answer.status, { 'Content-Type': 'text/plain', ...(answer.headers ?? {}) })
      response.end(answer.raw)
    } else if (isAnswer(answer)) {
      response.writeHead(answer.status, {
        'Content-Type': 'application/json',
        ...(answer.headers ?? {}),
      })
      response.end(answer.body === undefined ? '' : JSON.stringify(answer.body))
    } else {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(answer ?? null))
    }
    return
  }

  const body = method === 'GET' ? routes.get(path) : undefined
  if (body === undefined) {
    response.writeHead(404, { 'Content-Type': 'application/problem+json' })
    response.end(
      JSON.stringify({
        type: 'https://api.fawtir.om/problems/resource-not-found',
        title: 'Not found',
        status: 404,
        detail: `The mock API has nothing at ${method} ${path}.`,
      }),
    )
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}).listen(PORT, () => {
  console.log(
    `mock API on http://localhost:${PORT} — ${routes.size} static routes, ${modules.length} module routes`,
  )
})
