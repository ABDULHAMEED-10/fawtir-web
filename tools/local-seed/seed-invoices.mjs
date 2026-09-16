#!/usr/bin/env node
/**
 * Seeds a LOCAL stack with real invoices, through the API, so the Invoices list has every state it
 * can show: drafts, awaiting payment, overdue, part-paid, paid, and a credit note.
 *
 *   node tools/local-seed/seed-invoices.mjs
 *
 * Unlike `seed-customers.mjs`, nothing here is written straight to the database. Bare SQL rows
 * cannot be read back: an invoice rehydrates into a full snapshot (buyer, seller, branch, lines,
 * calculation), and a row without those fails the read, which is what the first browser check of
 * the Invoices list ran into. Every document below is drafted and issued exactly as the app does
 * it, so what the screen shows is what the API really holds.
 *
 * Issuing needs `FAWTIR_INVOICE_REFERENCE_CATALOGUE_ENABLED=true` (local-dev.env sets it).
 *
 * Refuses to run against anything but localhost. Safe to re-run: it adds another set.
 *
 * Env: FAWTIR_GATEWAY (default http://localhost:8080), MAILPIT (default http://localhost:8025),
 *      SEED_USERNAME / SEED_PASSWORD (default the LOCAL_SETUP demo admin).
 */
import { randomUUID } from 'node:crypto'

const GATEWAY = process.env.FAWTIR_GATEWAY ?? 'http://localhost:8080'
const MAILPIT = process.env.MAILPIT ?? 'http://localhost:8025'
const ORIGIN = 'http://localhost:5173'
const USERNAME = process.env.SEED_USERNAME ?? 'demo_admin'
const PASSWORD = process.env.SEED_PASSWORD ?? 'Local-Demo-Admin-2026'

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
  if (idempotent) headers['Idempotency-Key'] = `seed-invoice-${randomUUID()}`
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
  await call('POST', '/v1/auth/mfa/verify', { json: { challengeToken, factor: 'EMAIL_OTP', code, portalCookie: true } })
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}

const today = new Date()
const isoDay = (offset) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10)

const line = (description, quantity, unitPrice, productId, productCode) => ({
  lineNumber: 1,
  productId,
  productCode,
  description,
  unitCode: 'EA',
  quantity,
  unitPrice,
  discount: { type: 'PERCENTAGE', value: 0 },
  taxCategory: { code: 'S5', en16931Category: 'S', rate: 5, exemptionReason: null },
})

/** [subject, quantity, unit price, what to do with it] */
const BOOK = [
  ['September supply', 12, 4.5, { issue: -40, dueIn: 30 }],
  ['Roasted beans, 20 kg', 20, 7.4, { issue: -30, dueIn: 14, pay: 'part' }],
  ['Espresso service', 4, 18.25, { issue: -12, dueIn: 30 }],
  ['Packaging run', 200, 0.65, { issue: -8, dueIn: 45, pay: 'full' }],
  ['Cold brew kegs', 6, 22, { issue: -3, dueIn: 21, credit: 2 }],
  ['October retainer', 1, 150, { draft: true }],
  ['Seasonal blend trial', 3, 12.75, { draft: true }],
]

async function main() {
  await signIn()

  const branches = await call('GET', '/v1/branches')
  const branchId = branches[0]?.id
  if (!branchId) throw new Error('This tenant has no branch; seed-customers.mjs creates one.')

  const customers = await call('GET', '/v1/customers?status=ACTIVE&size=10&sort=NAME_ASC')
  const business = customers.content.filter((customer) => customer.type !== 'CONSUMER')
  if (business.length === 0) throw new Error('No customers; run seed-customers.mjs first.')

  const products = await call('GET', '/v1/products?page=0&size=10')
  let product = products.content?.[0]
  if (!product) {
    product = await call('POST', '/v1/products', {
      idempotent: true,
      json: {
        code: `SEED-${randomUUID().slice(0, 6).toUpperCase()}`,
        name: 'Green beans — Yirgacheffe',
        defaultUnitCode: 'EA',
        defaultUnitPrice: 7.4,
        defaultTaxCategory: 'S',
        defaultTaxRate: 5,
      },
    })
  }

  const made = []
  for (const [index, [subject, quantity, unitPrice, plan]] of BOOK.entries()) {
    const customer = business[index % business.length]
    const draft = await call('POST', '/v1/invoice-drafts', {
      idempotent: true,
      json: {
        type: 'INVOICE',
        draft: {
          customerId: customer.id,
          branchId,
          currency: 'OMR',
          vatMode: 'EXCLUSIVE',
          lines: [line(subject, quantity, unitPrice, product.id, product.code)],
          headerDiscount: { type: 'PERCENTAGE', value: 0 },
          details: {
            deliveryDate: null,
            subject,
            purchaseOrderReference: null,
            customerVisibleNote: null,
            internalNote: '',
            paymentTerms: { code: 'NET30', label: 'Net 30 days' },
            transactionType: 'FULL_TAX',
          },
        },
      },
    })

    if (plan.draft) {
      made.push(`draft   ${subject}`)
      continue
    }

    let issued
    try {
      issued = await call('POST', `/v1/invoice-drafts/${draft.id}/issue`, {
        idempotent: true,
        json: { expectedVersion: draft.version, issueDate: isoDay(plan.issue), dueDate: isoDay(plan.issue + plan.dueIn) },
      })
    } catch (error) {
      // Issuing is gated on the tenant being verified end to end (company attestation, business
      // timezone, and a Compliance-verified Peppol participant). A local box without that
      // evidence keeps the draft rather than pretending it was issued.
      made.push(`draft   ${subject} — not issued: ${error.message.replace(/^.*→ /, '')}`)
      continue
    }
    const total = issued.totals.totalAmount
    let note = `issued  ${issued.invoiceNumber} ${total} due ${isoDay(plan.issue + plan.dueIn)}`

    if (plan.pay) {
      const amount = plan.pay === 'full' ? total : Math.round(total * 40) / 100
      await call('POST', `/v1/authored-invoices/${issued.id}/payments`, {
        idempotent: true,
        json: { amount, methodCode: 'BANK', paymentReference: 'SEED-PAY', paymentDate: isoDay(plan.issue + 2) },
      })
      note += ` · paid ${amount}`
    }

    if (plan.credit) {
      const creditNote = await call('POST', `/v1/authored-invoices/${issued.id}/credit-notes`, {
        idempotent: true,
        json: {
          customerId: customer.id,
          branchId,
          currency: 'OMR',
          vatMode: 'EXCLUSIVE',
          lines: [line(`${subject} — returned`, plan.credit, unitPrice, product.id, product.code)],
          headerDiscount: { type: 'PERCENTAGE', value: 0 },
          details: {
            deliveryDate: null,
            subject: `Credit for ${subject}`,
            purchaseOrderReference: null,
            customerVisibleNote: null,
            internalNote: '',
            paymentTerms: null,
            transactionType: 'FULL_TAX',
            correctionReasonCode: 'RETURN',
          },
        },
      })
      const issuedNote = await call('POST', `/v1/invoice-drafts/${creditNote.id}/issue`, {
        idempotent: true,
        json: { expectedVersion: creditNote.version, issueDate: isoDay(plan.issue + 5), dueDate: null },
      })
      note += ` · credit note ${issuedNote.invoiceNumber}`
    }
    made.push(note)
  }

  console.log(made.join('\n'))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
