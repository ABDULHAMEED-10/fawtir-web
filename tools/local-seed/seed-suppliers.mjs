#!/usr/bin/env node
/**
 * Seeds a LOCAL stack with suppliers, bills, holds and payments, through the public API only,
 * so the Suppliers screens have something real to show. See docs/LOCAL_SETUP.md.
 *
 *   node tools/local-seed/seed-suppliers.mjs
 *
 * Signs in as the seeded `demo_admin` and reads the email code from Mailpit. Refuses to run
 * against anything but localhost: it creates data and uses the local seed credentials.
 * Safe to re-run; existing suppliers are left as they are and only missing ones are added.
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

async function call(method, path, { json, form, idempotent = false } = {}) {
  const headers = { Origin: ORIGIN, Accept: 'application/json' }
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  if (method !== 'GET' && jar.has('FAWTIR_CSRF')) headers['X-CSRF-Token'] = jar.get('FAWTIR_CSRF')
  if (idempotent) headers['Idempotency-Key'] = `seed-${randomUUID()}`
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form
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

/** An Omani IBAN (OM + 2 check digits + 19 characters) whose mod-97 check digits are right. */
function omaniIban(seed) {
  const bban = `018${String(seed).padStart(16, '0')}`
  const numeric = `${bban}OM00`.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))
  let remainder = 0
  for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97
  return `OM${String(98 - remainder).padStart(2, '0')}${bban}`
}

const today = new Date()
const isoDay = (offset) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10)

/**
 * The book: every state the list distinguishes appears at least once, and there are more
 * suppliers than one page holds, so paging is exercised too.
 */
const SUPPLIERS = [
  { name: 'Qalhat Marine Supplies LLC', vat: 'OM1100447102', channel: 'PEPPOL', terms: 'NET_30', discount: [2, 10], bank: 1,
    bills: [{ total: 1450.5, due: 12 }, { total: 980.75, due: 20, hold: 'Quantity disputed on delivery' }, { total: 312, due: -30, paid: 'onTime' }, { total: 640.2, due: -60, paid: 'onTime' }, { total: 210, due: -90, paid: 'late' }] },
  { name: 'Sohar Packaging LLC', vat: 'OM1100628391', channel: 'PEPPOL', terms: 'NET_10', bank: 2,
    bills: [{ total: 3140, due: 4 }, { total: 1200, due: -20, paid: 'onTime' }, { total: 860.5, due: -50, paid: 'onTime' }, { total: 410, due: -80, paid: 'late' }] },
  { name: 'Nizwa Hardware Store', vat: null, channel: 'PAPER', terms: 'DUE_ON_RECEIPT', bank: 3, bills: [{ total: 191.72, due: -2 }] },
  { name: 'Al Bahja Properties', vat: 'OM1100201477', channel: 'EMAIL_PDF', terms: 'NET_30', bank: 4, bills: [] },
  { name: 'Gulf Cold Logistics', vat: 'OM1100554027', channel: 'PEPPOL', terms: 'NET_30', bank: 5, bankChanged: 55, bills: [{ total: 699.9, due: 9 }] },
  { name: 'Muttrah Roasters', vat: 'OM1100733014', channel: 'EMAIL_PDF', terms: 'NET_30', bank: 6, switchedOff: true, bills: [] },
  { name: 'Salalah Spice House', vat: 'OM1100300218', channel: 'PEPPOL', terms: 'NET_45', bank: null, bills: [{ total: 455.125, due: 30 }] },
  { name: 'Barka Glass Works', vat: 'OM1100300355', channel: 'PAPER', terms: 'NET_45', bank: 8, bills: [] },
  { name: 'Ibri Motors', vat: null, channel: 'MANUAL', terms: null, bank: null, bills: [] },
  { name: 'Duqm Steel Fabrication', vat: 'OM1100300492', channel: 'PEPPOL', terms: 'NET_60', bank: 10, bills: [{ total: 12850, due: 45 }] },
  { name: 'Rustaq Textiles', vat: 'OM1100300629', channel: 'PEPPOL', terms: 'NET_30', bank: 11, bills: [] },
  { name: 'Sur Marine Engines', vat: 'OM1100300766', channel: 'PEPPOL', terms: 'NET_30', bank: 12, bills: [{ total: 2275.4, due: 15 }] },
  { name: 'Bahla Pottery', vat: 'OM1100300903', channel: 'EMAIL_PDF', terms: 'NET_15', bank: 13, bills: [] },
  { name: 'Khasab Cold Store', vat: 'OM1100301040', channel: 'PEPPOL', terms: 'NET_30', discount: [1.5, 7], bank: 14, bills: [] },
]

async function existingNames() {
  const names = new Set()
  for (let page = 0; ; page++) {
    const result = await call('GET', `/v1/suppliers?page=${page}&page_size=200`)
    for (const row of result.items) names.add(row.displayName)
    if (result.items.length < result.pageSize) return names
  }
}

async function addBills(supplierId, spec) {
  for (const [index, bill] of spec.bills.entries()) {
    const form = new FormData()
    // Intake keeps the original file; a one-line PDF is enough, since no OCR reads it.
    form.append('file', new Blob(['%PDF-1.4\n% seed bill\n'], { type: 'application/pdf' }), 'bill.pdf')
    form.append('source', 'UPLOADED')
    const intake = await call('POST', '/v1/bills/intake', { form })
    const issue = bill.due - 30
    const vat = Math.round((bill.total / 1.05) * 0.05 * 1000) / 1000
    const confirmed = await call('POST', `/v1/bills/intake/${intake.id}/confirm`, {
      json: {
        supplierId,
        documentTypeCode: '380',
        billNumber: `${spec.name.split(' ')[0].toUpperCase()}-${1001 + index}`,
        issueDate: isoDay(issue),
        dueDate: isoDay(bill.due),
        currency: 'OMR',
        vat,
        total: bill.total,
      },
    })
    if (bill.hold) await call('POST', `/v1/bills/${confirmed.id}/hold`, { json: { reason: bill.hold } })
    if (bill.paid) {
      // A bill is paid only once approved (READY); the approval policy asks for one approver.
      await call('POST', `/v1/bills/${confirmed.id}/approval/approve`, { json: {} })
      await call('POST', `/v1/bills/${confirmed.id}/payments`, {
        idempotent: true,
        json: {
          amount: bill.total,
          currency: 'OMR',
          methodCode: '30',
          paymentReference: `TRF-${confirmed.id.slice(0, 8)}`,
          paymentDate: isoDay(bill.paid === 'onTime' ? bill.due - 2 : bill.due + 12),
        },
      })
    }
  }
}

/**
 * Seeds from before the script confirmed bank details left every account unconfirmed. Confirms
 * those, except for the supplier whose change is meant to stay unconfirmed.
 */
async function confirmEarlierSeeds() {
  const wanted = new Map(SUPPLIERS.filter((spec) => spec.bank && !spec.bankChanged).map((spec) => [spec.name, spec]))
  const result = await call('GET', '/v1/suppliers?filter=NEEDS_FIX&page_size=200')
  for (const row of result.items) {
    if (wanted.has(row.displayName) && row.record.health.includes('BANK_CHANGED_UNCONFIRMED')) {
      await call('POST', `/v1/suppliers/${row.id}/bank-details/confirm`)
      console.log(`confirmed bank details: ${row.displayName}`)
    }
  }
}

async function main() {
  await signIn()
  const have = await existingNames()
  let created = 0
  for (const [index, spec] of SUPPLIERS.entries()) {
    if (have.has(spec.name)) continue
    const body = {
      type: 'BUSINESS',
      legalName: spec.name,
      contactPerson: 'Accounts team',
      vatNumber: spec.vat ?? undefined,
      registeredForVat: spec.vat !== null,
      registeredOnPeppol: spec.channel === 'PEPPOL',
      participantScheme: spec.channel === 'PEPPOL' ? '0248' : undefined,
      participantValue: spec.channel === 'PEPPOL' ? spec.vat : undefined,
      defaultCurrency: 'OMR',
      paymentTerms: spec.terms ?? undefined,
      receivingChannel: spec.channel === 'MANUAL' ? undefined : spec.channel,
      earlyPaymentDiscountPercent: spec.discount?.[0],
      earlyPaymentDiscountDays: spec.discount?.[1],
      bankDetails: spec.bank
        ? { beneficiaryName: spec.name, iban: omaniIban(spec.bank), bic: 'BMUSOMRX', bankName: 'Bank Muscat' }
        : undefined,
    }
    const supplier = await call('POST', '/v1/suppliers', { json: body, idempotent: true })
    const id = supplier.profile?.id ?? supplier.id
    // The first IBAN counts as a change that needs confirming (V149), as it should: nobody has
    // called the supplier yet. A settled book has confirmed its suppliers' accounts, so confirm.
    if (spec.bank) await call('POST', `/v1/suppliers/${id}/bank-details/confirm`)
    if (spec.bankChanged) {
      await call('PUT', `/v1/suppliers/${id}/bank-details`, {
        json: { beneficiaryName: spec.name, iban: omaniIban(spec.bankChanged), bic: 'NBOMOMRX', bankName: 'National Bank of Oman' },
      })
    }
    await addBills(id, spec)
    if (spec.switchedOff) await call('POST', `/v1/suppliers/${id}/switch-off`)
    created++
    console.log(`${String(index + 1).padStart(2)}. ${spec.name}`)
  }
  await confirmEarlierSeeds()
  const summary = await call('GET', '/v1/suppliers/summary')
  console.log(`Added ${created} supplier(s). Directory now: ${summary.total} suppliers, ${summary.owedTotal} OMR owed across ${summary.openBills} open bills.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
