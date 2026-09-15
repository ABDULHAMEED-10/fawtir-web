#!/usr/bin/env node
/**
 * Seeds a LOCAL stack with customers and what they owe, so the Customers list has every state to
 * show: owing, overdue, part-paid, settled, never invoiced, on Peppol or not, and more customers
 * than one page holds. See docs/LOCAL_SETUP.md.
 *
 *   node tools/local-seed/seed-customers.mjs
 *
 * Customers go through the public API, as a user would create them. Invoices and payments do not:
 * issuing through the API is the invoice slices' work, so they are written straight into the local
 * database through `docker exec psql`, as bare ISSUED rows that carry only what the receivable
 * figures read. They are not real invoices (no lines, no signature, no QR) and nothing sends them.
 * Peppol "verified" is likewise set in the database, because Discovery owns it.
 *
 * Refuses to run against anything but localhost. Safe to re-run: existing customers and seeded
 * invoice numbers are left as they are.
 *
 * Env: FAWTIR_GATEWAY (default http://localhost:8080), MAILPIT (default http://localhost:8025),
 *      SEED_USERNAME / SEED_PASSWORD (default the LOCAL_SETUP demo admin),
 *      PG_CONTAINER (default fawtir-postgres), PG_DATABASE (default fawtir_web).
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const GATEWAY = process.env.FAWTIR_GATEWAY ?? 'http://localhost:8080'
const MAILPIT = process.env.MAILPIT ?? 'http://localhost:8025'
const ORIGIN = 'http://localhost:5173'
const USERNAME = process.env.SEED_USERNAME ?? 'demo_admin'
const PASSWORD = process.env.SEED_PASSWORD ?? 'Local-Demo-Admin-2026'
const PG_CONTAINER = process.env.PG_CONTAINER ?? 'fawtir-postgres'
const PG_DATABASE = process.env.PG_DATABASE ?? 'fawtir_web'

for (const url of [GATEWAY, MAILPIT]) {
  const { hostname } = new URL(url)
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    console.error(`Refusing to seed ${url}: this script is for a local stack only.`)
    process.exit(2)
  }
}

const jar = new Map()

async function call(method, path, { json, idempotent = false } = {}) {
  const headers = { Origin: ORIGIN, Accept: 'application/json' }
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  if (method !== 'GET' && jar.has('FAWTIR_CSRF')) headers['X-CSRF-Token'] = jar.get('FAWTIR_CSRF')
  if (idempotent) headers['Idempotency-Key'] = `seed-${randomUUID()}`
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }
  const response = await fetch(`${GATEWAY}/api${path}`, { method, headers, body })
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';')
    const index = pair.indexOf('=')
    const name = pair.slice(0, index)
    const value = pair.slice(index + 1)
    if (value) jar.set(name, value)
    else jar.delete(name)
  }
  const text = await response.text()
  const parsed = text ? JSON.parse(text) : undefined
  if (!response.ok) {
    const detail = parsed?.detail ?? parsed?.title ?? text
    throw new Error(`${method} ${path} → ${response.status} ${detail}`)
  }
  return parsed
}

async function signIn() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
  const login = await call('POST', '/v1/auth/login', {
    json: { username: USERNAME, password: PASSWORD, portalCookie: true },
  })
  if (!login.mfaRequired) return
  const challengeToken = login.mfaChallengeToken
  await call('POST', '/v1/auth/mfa/otp/request', { json: { challengeToken, factor: 'EMAIL_OTP' } })
  let code
  for (let attempt = 0; attempt < 20 && !code; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json()
    if (list.total > 0) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json()
      code = /\b(\d{6})\b/.exec(message.Text)?.[1]
    }
  }
  if (!code) throw new Error('No sign-in code arrived in Mailpit. Is notification delivery on?')
  await call('POST', '/v1/auth/mfa/verify', {
    json: { challengeToken, factor: 'EMAIL_OTP', code, portalCookie: true },
  })
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', PG_CONTAINER, 'psql', '-U', 'fawtir', '-d', PG_DATABASE, '-v', 'ON_ERROR_STOP=1', '-qAt'],
    { input: sql, encoding: 'utf8' },
  )
}

const literal = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`)

const today = new Date()
const isoDay = (offset) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10)

/**
 * The book. `invoices` are [total, due in days (negative is past), paid]. Peppol customers carry a
 * participant; `verified` ones are marked reachable afterwards.
 */
const CUSTOMERS = [
  { type: 'BUSINESS', name: 'Salalah Beach Resort', vat: 'OM1100582341', city: 'Salalah', contact: 'Mariam Al Hinai', email: 'mariam@salalahbeach.om', peppol: true, verified: true,
    invoices: [[70.4, -20, 0], [50, -5, 0], [80, -60, 80]] },
  { type: 'BUSINESS', name: 'Qurum Business Center', vat: 'OM1100337812', city: 'Muscat', contact: 'Salim Al Farsi', email: 'accounts@qurumbc.om', peppol: true, verified: true,
    invoices: [[26.2, 10, 0], [20, 25, 0], [30, -40, 30], [18, -70, 18]] },
  { type: 'BUSINESS', name: 'Muscat Grand Hotel LLC', vat: 'OM1100447102', city: 'Muscat', contact: 'Dana Al Balushi', email: 'dana@muscatgrand.om', peppol: true, verified: true,
    invoices: [[48.59, 14, 20], [35, -30, 35], [22, -90, 22]] },
  { type: 'BUSINESS', name: 'Bahla Fort Restaurant', vat: 'OM1100771290', city: 'Bahla', contact: 'Khalid Al Amri', email: 'khalid@bahlafort.om', peppol: false,
    invoices: [[22.3, 30, 0]] },
  { type: 'GOVERNMENT', name: 'Ministry of Tourism', vat: null, city: 'Muscat', contact: 'Procurement Office', email: 'procurement@mot.gov.om', peppol: true, verified: true,
    invoices: [[120, -45, 120], [95, -15, 95]] },
  { type: 'CONSUMER', first: 'Ahmed', last: 'Al Rawahi', city: 'Muscat', email: 'ahmed.r@example.om', invoices: [[12.5, -10, 12.5]] },
  { type: 'BUSINESS', name: 'Sohar Port Logistics', vat: 'OM1100628391', city: 'Sohar', contact: 'Laila Al Harthy', email: 'ap@soharport.om', peppol: true, verified: false,
    invoices: [[410.75, -8, 100]] },
  { type: 'BUSINESS', name: 'Nizwa Dates Company', vat: 'OM1100201477', city: 'Nizwa', contact: 'Hamed Al Kindi', email: 'hamed@nizwadates.om', peppol: false, invoices: [] },
  { type: 'GOVERNMENT', name: 'Muscat Municipality', vat: null, city: 'Muscat', contact: 'Accounts Payable', email: 'ap@mm.gov.om', peppol: true, verified: true,
    invoices: [[640, -35, 0]] },
  { type: 'CONSUMER', first: 'Fatma', last: 'Al Busaidi', city: 'Seeb', email: 'fatma.b@example.om', invoices: [] },
]

// Plain directory entries so the list has more than a page, in both name orders.
const FILLER = [
  'Al Amerat Builders', 'Barka Fisheries', 'Duqm Energy Services', 'Ibra Textiles', 'Jabal Akhdar Farms',
  'Khasab Ferries', 'Liwa Trading', 'Masirah Island Supplies', 'Quriyat Stone', 'Rustaq Medical Centre',
  'Samail Water Co', 'Sur Boatyard', 'Thumrait Motors', 'Wadi Kabir Printing', 'Yanqul Poultry',
  'Adam Cement Works', 'Bidbid Nurseries', 'Haima Transport',
].map((name, index) => ({
  type: 'BUSINESS',
  name,
  vat: `OM11${String(30_000_000 + index * 7919).padStart(8, '0')}`,
  city: ['Muscat', 'Sohar', 'Nizwa', 'Sur', 'Salalah'][index % 5],
  contact: 'Accounts',
  email: `accounts${index}@example.om`,
  peppol: false,
  invoices: [],
}))

function request(entry) {
  const address = { countryCode: 'OM', cityName: entry.city, countrySubentity: `${entry.city} Governorate`, streetName: 'Main Street', buildingNumber: '1', postalCode: '112' }
  const participant = entry.peppol ? { scheme: '0248', value: entry.vat ?? `OM11${String(90_000_000 + entry.name.length * 101).padStart(8, '0')}` } : null
  const details =
    entry.type === 'CONSUMER'
      ? { firstName: entry.first, lastName: entry.last }
      : entry.type === 'GOVERNMENT'
        ? { entityMinistryName: entry.name, registeredForVat: false, peppolParticipantId: participant, registeredOnPeppol: entry.peppol }
        : {
            legalRegisteredName: entry.name,
            vatRegistrationNumber: entry.vat,
            registeredForVat: entry.vat !== null,
            peppolParticipantId: participant,
            registeredOnPeppol: entry.peppol,
          }
  return {
    type: entry.type,
    details,
    contact: {
      contactPerson: entry.contact ?? null,
      emailRecipients: [entry.email],
      preferredLanguage: 'en',
    },
    billingDefaults: { defaultCurrency: 'OMR', defaultTaxCategory: 'S', paymentTerms: 'NET_30', defaultPaymentMethod: 'BANK_TRANSFER' },
    deliveryPreferences: {
      sendingMethod: entry.type === 'CONSUMER' ? 'QR_RECEIPT' : entry.peppol ? 'PEPPOL' : 'EMAIL_PDF',
      emailPdfCopy: false,
      automaticPaymentReminders: false,
    },
    invoiceAddress: address,
    sameAsInvoicingAddress: true,
  }
}

const displayName = (entry) => (entry.type === 'CONSUMER' ? `${entry.first} ${entry.last}` : entry.name)

async function existingCustomers() {
  const byName = new Map()
  for (let page = 0; ; page++) {
    const body = await call('GET', `/v1/customers?size=100&page=${page}`)
    for (const customer of body.content) byName.set(customer.displayName, customer.id)
    if (page + 1 >= body.totalPages) return byName
  }
}

await signIn()
const me = await call('GET', '/v1/me/entitlements')
const tenantId = me.tenantId
const known = await existingCustomers()
const book = [...CUSTOMERS, ...FILLER]
let created = 0
for (const entry of book) {
  const name = displayName(entry)
  if (known.has(name)) continue
  const customer = await call('POST', '/v1/customers', { json: request(entry), idempotent: true })
  known.set(name, customer.id)
  created++
}
console.log(`Customers: ${created} created, ${book.length - created} already there.`)

let sql = `SELECT set_config('app.tenant_id', ${literal(tenantId)}, false);\n`
sql += `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM tenant.branches WHERE tenant_id = ${literal(tenantId)}) THEN
  RAISE EXCEPTION 'The tenant has no branch to put invoices under'; END IF; END $$;\n`
let number = 0
for (const entry of CUSTOMERS) {
  const customerId = known.get(displayName(entry))
  if (entry.verified) {
    sql += `UPDATE customer.customers SET peppol_verification_status = 'VERIFIED', peppol_verified_at = now()
            WHERE tenant_id = ${literal(tenantId)} AND id = ${literal(customerId)};\n`
  }
  for (const [total, due, paid] of entry.invoices) {
    number++
    const invoiceNumber = `SEED-INV-${String(number).padStart(4, '0')}`
    const issued = isoDay(due - 30)
    sql += `WITH inserted AS (
      INSERT INTO invoice.invoices
        (id, tenant_id, invoice_type, state, invoice_number, issue_date, issued_at, due_date, customer_id, branch_id,
         currency, vat_mode, header_discount_type, header_discount_value, total_amount, created_by, updated_by, created_at, updated_at)
      SELECT gen_random_uuid(), ${literal(tenantId)}, 'INVOICE', 'ISSUED', ${literal(invoiceNumber)}, ${literal(issued)},
             ${literal(issued)}::timestamp, ${literal(isoDay(due))}, ${literal(customerId)},
             (SELECT id FROM tenant.branches WHERE tenant_id = ${literal(tenantId)} ORDER BY created_at LIMIT 1),
             'OMR', 'EXCLUSIVE', 'FIXED_AMOUNT', 0, ${total}, ${literal(me.userId)}, ${literal(me.userId)}, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM invoice.invoices WHERE tenant_id = ${literal(tenantId)} AND invoice_number = ${literal(invoiceNumber)})
      RETURNING id)
    INSERT INTO invoice.invoice_payments
      (id, tenant_id, invoice_id, entry_type, amount, currency, method_code, payment_reference, payment_date, actor_id, occurred_at)
    SELECT gen_random_uuid(), ${literal(tenantId)}, inserted.id, 'PAYMENT', ${paid}, 'OMR', 'BANK', ${literal(`PAY-${invoiceNumber}`)},
           ${literal(isoDay(Math.min(due, 0)))}, ${literal(me.userId)}, now()
      FROM inserted WHERE ${paid} > 0;\n`
  }
}
psql(sql)
console.log(`Invoices: ${number} seeded (existing numbers skipped). Peppol verified: ${CUSTOMERS.filter((c) => c.verified).length}.`)
