/**
 * Price rules (`/v1/price-rules*`, `src/api/catalog/priceRules.ts`; backend PRs #795, #796, #799,
 * #800), in the `PriceRuleResponse`, `PriceRuleReportResponse` and `PriceRuleLinesResponse` shapes of
 * openapi.yaml. Writes change the rules in memory for the life of the server: a new rule is saved
 * off, an edit, switch or archive checks `expectedVersion`, a create replays its Idempotency-Key,
 * and a tier or offer below 1.330 on the beans sells below cost (422 PRICE_RULE_BELOW_COST until
 * acknowledged). For screenshots and the responsive harness only.
 */

const problem = (status, code, extra = {}, slug) => ({
  status,
  headers: { 'Content-Type': 'application/problem+json' },
  body: {
    type: `https://api.fawtir.om/problems/${
      slug ??
      (status === 404 ? 'not-found' : status === 409 ? 'resource-conflict' : 'validation-failed')
    }`,
    title: code,
    status,
    code,
    ...extra,
  },
})

const NOW = '2026-10-20T08:00:00Z'
const COST = { productId: 'p-beans', variantId: null, branchId: 'b-main', averageCost: 7.4 }

const rule = (id, name, kind, extra = {}) => ({
  id,
  name,
  kind,
  enabled: true,
  archived: false,
  archivedAt: null,
  validFrom: '2026-08-01',
  validTo: null,
  priority: 100,
  targets: [{ type: 'ALL', id: null, productId: null }],
  countedAs: kind === 'VOLUME' ? 'ACROSS_TARGETS' : null,
  countPer: 'INVOICE',
  tiers: [],
  extrasOnly: false,
  windows: [],
  customers: null,
  offer: null,
  branchIds: [],
  atTheTill: true,
  showOnInvoice: true,
  stacks: false,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  runningNow: false,
  used: 0,
  givenAway: 0,
  broughtIn: 0,
  pausedUntil: null,
  belowCostAcknowledged: null,
  belowCost: null,
  ...extra,
})

const RULES = [
  rule('r-wholesale', 'Wholesale beans', 'VOLUME', {
    targets: [{ type: 'GROUP', id: 'g-beans', productId: null }],
    tiers: [
      { fromQty: 1, toQty: 4, priceEach: 9.5, percentOff: null },
      { fromQty: 5, toQty: 9, priceEach: 8.7, percentOff: null },
      { fromQty: 10, toQty: 24, priceEach: 8.0, percentOff: null },
      { fromQty: 25, toQty: null, priceEach: 7.6, percentOff: null },
    ],
    atTheTill: false,
    runningNow: true,
    used: 88,
    givenAway: 612.4,
    broughtIn: 4118,
  }),
  rule('r-roast', 'Roast a batch, then another', 'VOLUME', {
    targets: [{ type: 'PRODUCT', id: 'p-roast', productId: 'p-roast' }],
    tiers: [
      { fromQty: 1, toQty: 1, priceEach: null, percentOff: 0 },
      { fromQty: 2, toQty: 5, priceEach: null, percentOff: 15 },
      { fromQty: 6, toQty: null, priceEach: null, percentOff: 25 },
    ],
    extrasOnly: true,
    runningNow: true,
    used: 147,
    givenAway: 398.2,
    broughtIn: 1864.5,
  }),
  rule('r-lull', 'Afternoon lull', 'TIME', {
    targets: [{ type: 'KIND', id: 'k-milk', productId: null }],
    windows: [{ days: [0, 1, 2, 3, 4], from: '14:00', to: '17:00' }],
    offer: { percentOff: 20, priceEach: null },
    validFrom: '2026-02-04',
    used: 1104,
    givenAway: 274.1,
    broughtIn: 683.4,
  }),
  rule('r-evening', 'Evening roast', 'TIME', {
    windows: [{ days: [4, 5], from: '20:00', to: '01:00' }],
    offer: { percentOff: 10, priceEach: null },
    enabled: false,
    pausedUntil: '2026-11-15',
    used: 12,
    givenAway: 8.6,
    broughtIn: 77.4,
  }),
  rule('r-hotels', 'Hotel accounts', 'CUSTOMER', {
    customers: { customerIds: ['c-grand', 'c-alila'], tags: ['hotel'] },
    offer: { percentOff: 12, priceEach: null },
    enabled: false,
    atTheTill: false,
    validFrom: '2026-07-01',
    used: 5,
  }),
]

/** The rules a till sale may name now (for the POS mock's mismatch check). */
export const liveRuleIds = () => RULES.filter((r) => r.enabled && !r.archived).map((r) => r.id)

const keys = new Map()
let seq = 1

const find = (id) => RULES.find((r) => r.id === id)

/** Below 1.330 a kilo of beans loses money in the mock (average cost 7.400 at Main). */
function belowCost(body) {
  const prices = [
    ...(body.tiers ?? []).filter((t) => t.priceEach != null).map((t) => [t.fromQty, t.priceEach]),
    ...(body.offer?.priceEach != null ? [[null, body.offer.priceEach]] : []),
  ].filter(([, price]) => price < COST.averageCost)
  if (prices.length === 0) return []
  const lowest = Math.min(...prices.map(([, p]) => p))
  return [
    {
      ...COST,
      price: lowest,
      lossEach: Math.round((COST.averageCost - lowest) * 1000) / 1000,
      fromQtys: prices.filter(([q]) => q != null).map(([q]) => q),
    },
  ]
}

function validate(body) {
  if (!body?.name?.trim()) return problem(400, 'PRICE_RULE_NAME_REQUIRED')
  if (body.kind === 'BUY_ONE_GET' || body.kind === 'buyOneGet')
    return problem(422, 'PRICE_RULE_KIND_NOT_AVAILABLE')
  if (!['VOLUME', 'TIME', 'CUSTOMER'].includes(body.kind))
    return problem(400, 'PRICE_RULE_KIND_INVALID')
  if (body.stacks === true) return problem(422, 'PRICE_RULE_STACKING_NOT_AVAILABLE')
  if (body.countPer && !['INVOICE', 'oneInvoice'].includes(body.countPer))
    return problem(422, 'PRICE_RULE_COUNT_PER_NOT_AVAILABLE')
  if (!Array.isArray(body.targets) || body.targets.length === 0)
    return problem(400, 'PRICE_RULE_TARGETS_INVALID')
  if (body.kind !== 'VOLUME' && (body.tiers || body.countedAs))
    return problem(400, 'PRICE_RULE_INVALID', { field: 'tiers' })
  if (body.kind === 'VOLUME' && (body.offer || body.windows || body.customers))
    return problem(400, 'PRICE_RULE_INVALID', { field: 'offer' })
  const clash = RULES.find(
    (r) =>
      !r.archived && r.name.toLowerCase() === body.name.trim().toLowerCase() && r.id !== body.__id,
  )
  if (clash) return problem(409, 'PRICE_RULE_NAME_DUPLICATE')
  return null
}

const fromBody = (body) => ({
  name: body.name.trim(),
  kind: body.kind,
  validFrom: body.validFrom ?? '2026-10-29',
  validTo: body.validTo ?? null,
  priority: body.priority ?? 100,
  targets: body.targets.map((t) => ({
    type: t.type,
    id: t.id ?? null,
    productId: t.productId ?? null,
  })),
  countedAs: body.kind === 'VOLUME' ? (body.countedAs ?? 'ACROSS_TARGETS') : null,
  tiers: body.tiers ?? [],
  extrasOnly: Boolean(body.extrasOnly),
  windows: body.windows ?? [],
  customers: body.customers ?? null,
  offer: body.offer ?? null,
  branchIds: body.branchIds ?? [],
  atTheTill: body.atTheTill ?? true,
  showOnInvoice: body.showOnInvoice ?? true,
  stacks: false,
})

const written = (r, items) => ({
  ...r,
  used: null,
  givenAway: null,
  broughtIn: null,
  belowCost: items,
})

const versioned = (query, r) => {
  if (!r) return problem(404, 'PRICE_RULE_NOT_FOUND')
  if (r.archived) return problem(409, 'PRICE_RULE_ARCHIVED')
  if (Number(query.get('expectedVersion')) !== r.version)
    return problem(409, 'PRICE_RULE_VERSION_CONFLICT')
  return null
}

function report(query) {
  const branch = query.get('branchId')
  const rows = RULES.filter(
    (r) => !branch || r.branchIds.length === 0 || r.branchIds.includes(branch),
  )
    .filter((r) => r.used > 0)
    .map((r) => ({
      ruleId: r.id,
      name: r.name,
      kind: r.kind,
      enabled: r.enabled,
      archived: r.archived,
      runningNow: r.runningNow,
      used: r.used,
      givenAway: r.givenAway,
      broughtIn: r.broughtIn,
    }))
    .sort((a, b) => b.givenAway - a.givenAway)
  const sum = (key) => Math.round(rows.reduce((t, r) => t + r[key], 0) * 1000) / 1000
  return {
    from: query.get('from') ?? '2026-07-31',
    to: query.get('to') ?? '2026-10-28',
    branchId: branch,
    currency: 'OMR',
    rules: rows,
    totals: {
      rules: RULES.filter((r) => !r.archived).length,
      runningNow: RULES.filter((r) => r.runningNow).length,
      used: 1291,
      givenAway: sum('givenAway'),
      broughtIn: sum('broughtIn'),
      taxableSales: 36580.25,
      shareOfSalesPercent: 3.6,
    },
  }
}

export default [
  {
    match: '/api/v1/price-rules/active',
    reply: ({ query }) => {
      const items = RULES.filter((r) => r.enabled && !r.archived)
      return {
        branchId: query.get('branchId'),
        version: items.map((r) => `${r.id}:${r.version}`).join('|'),
        items,
      }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/price-rules/evaluate',
    reply: ({ body }) => {
      const live = RULES.filter(
        (r) =>
          r.enabled &&
          !r.archived &&
          r.kind !== 'CUSTOMER' &&
          (body?.channel !== 'TILL' || r.atTheTill),
      )
      return {
        at: NOW,
        lines: (body?.lines ?? []).map((line) => {
          const hit = line.productId
            ? live.find((r) =>
                r.targets.some(
                  (t) => t.type === 'ALL' || (t.type === 'PRODUCT' && t.id === line.productId),
                ),
              )
            : null
          const percent = hit?.offer?.percentOff ?? hit?.tiers?.at(-1)?.percentOff ?? null
          if (!hit || percent == null) {
            return {
              lineNumber: line.lineNumber,
              source: 'NONE',
              reason: line.productId ? 'NO_RULE' : 'NOT_A_CATALOGUE_LINE',
              priceRuleIds: [],
              ruleName: null,
              ruleKind: null,
              showOnInvoice: false,
              discountType: null,
              discountValue: null,
              saving: 0,
            }
          }
          return {
            lineNumber: line.lineNumber,
            source: 'RULE',
            reason: 'RULE_APPLIED',
            priceRuleIds: [hit.id],
            ruleName: hit.name,
            ruleKind: hit.kind,
            showOnInvoice: hit.showOnInvoice,
            discountType: 'PERCENTAGE',
            discountValue: percent,
            saving: Math.round(line.quantity * line.unitPrice * percent * 10) / 1000,
          }
        }),
      }
    },
  },
  { match: '/api/v1/price-rules/report', reply: ({ query }) => report(query) },
  {
    match: '/api/v1/price-rules/report.csv',
    reply: ({ query }) => {
      const data = report(query)
      const lines = [
        'Rule,Kind,State,Invoices,Given away,Brought in',
        ...data.rules.map(
          (r) =>
            `${r.name},${r.kind},${r.enabled ? 'On' : 'Off'},${r.used},${r.givenAway},${r.broughtIn}`,
        ),
        `Total,,,${data.totals.used},${data.totals.givenAway},${data.totals.broughtIn}`,
      ]
      return {
        status: 200,
        raw: lines.join('\n'),
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="price-rules.csv"',
          'X-Fawtir-Export-Rows': String(data.rules.length),
        },
      }
    },
  },
  {
    match: '/api/v1/price-rules',
    reply: ({ query }) => {
      const kind = query.get('kind')
      const enabled = query.get('enabled')
      const archived = query.get('includeArchived') === 'true'
      const branch = query.get('branchId')
      const order = { VOLUME: 0, TIME: 1, CUSTOMER: 2 }
      return {
        from: query.get('from') ?? '2026-07-31',
        to: query.get('to') ?? '2026-10-28',
        items: RULES.filter(
          (r) =>
            (archived || !r.archived) &&
            (!kind || r.kind === kind) &&
            (enabled === null || String(r.enabled) === enabled) &&
            (!branch || r.branchIds.length === 0 || r.branchIds.includes(branch)),
        ).sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name)),
      }
    },
  },
  {
    method: 'POST',
    match: '/api/v1/price-rules',
    reply: ({ body, headers }) => {
      const key = headers['idempotency-key']
      if (!key || !/^[A-Za-z0-9._:-]{16,128}$/.test(key)) return problem(400, 'VALIDATION_FAILED')
      const replay = keys.get(key)
      if (replay) {
        if (replay.body !== JSON.stringify({ ...body, acknowledgeBelowCost: undefined }))
          return problem(409, 'PRICE_RULE_KEY_REUSED')
        return { status: 201, headers: { 'Idempotent-Replayed': 'true' }, body: replay.answer }
      }
      const refused = validate(body)
      if (refused) return refused
      const items = belowCost(body)
      const created = rule(`r-new-${seq++}`, body.name, body.kind, {
        ...fromBody(body),
        enabled: false,
        runningNow: false,
        belowCostAcknowledged:
          items.length && body.acknowledgeBelowCost
            ? { by: 'u-nasser', at: new Date().toISOString() }
            : null,
      })
      RULES.push(created)
      const answer = written(created, items)
      keys.set(key, { body: JSON.stringify({ ...body, acknowledgeBelowCost: undefined }), answer })
      return { status: 201, body: answer }
    },
  },
  {
    match: /^\/api\/v1\/price-rules\/([^/]+)\/lines$/,
    reply: ({ params, query }) => {
      const r = find(params[0])
      if (!r) return problem(404, 'PRICE_RULE_NOT_FOUND')
      const size = Number(query.get('size') ?? 50)
      const page = Number(query.get('page') ?? 0)
      const all = Array.from({ length: Math.min(r.used, 60) }, (_, i) => ({
        invoiceId: `inv-${r.id}-${i}`,
        invoiceNumber: `INV-2026-${String(4200 - i).padStart(6, '0')}`,
        invoiceType: i === 3 ? 'CREDIT_NOTE' : 'INVOICE',
        issueDate: `2026-10-${String(28 - (i % 27)).padStart(2, '0')}`,
        branchId: 'b-main',
        branchName: 'Al Bahja Coffee (Main)',
        lineNumber: 1 + (i % 3),
        description: i % 2 ? 'Coffee Beans 1kg - House Blend' : 'Green Beans - Yirgacheffe',
        givenAway: i === 3 ? -1.5 : 4.5,
        taxable: i === 3 ? -8.0 : 40.5,
      }))
      return {
        ruleId: r.id,
        from: query.get('from') ?? '2026-07-31',
        to: query.get('to') ?? '2026-10-28',
        currency: 'OMR',
        page,
        size,
        total: all.length,
        items: all.slice(page * size, page * size + size),
      }
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/price-rules\/([^/]+)\/switch$/,
    reply: ({ params, query, body }) => {
      const r = find(params[0])
      const refused = versioned(query, r)
      if (refused) return refused
      if (body?.pauseUntil && (body.enabled || body.pauseUntil <= '2026-10-29'))
        return problem(400, 'PRICE_RULE_PAUSE_INVALID')
      const items = belowCost(r)
      const goingLive = body?.enabled || body?.pauseUntil
      if (goingLive && items.length && !r.belowCostAcknowledged && !body.acknowledgeBelowCost)
        return problem(422, 'PRICE_RULE_BELOW_COST', { items })
      Object.assign(r, {
        enabled: Boolean(body?.enabled),
        pausedUntil: body?.pauseUntil ?? null,
        runningNow: Boolean(body?.enabled) && r.kind !== 'TIME',
        version: r.version + 1,
        updatedAt: new Date().toISOString(),
        ...(items.length && body?.acknowledgeBelowCost
          ? { belowCostAcknowledged: { by: 'u-nasser', at: new Date().toISOString() } }
          : {}),
      })
      return written(r, items)
    },
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/price-rules\/([^/]+)\/archive$/,
    reply: ({ params, query }) => {
      const r = find(params[0])
      const refused = versioned(query, r)
      if (refused) return refused
      Object.assign(r, {
        archived: true,
        archivedAt: new Date().toISOString(),
        enabled: false,
        pausedUntil: null,
        runningNow: false,
        version: r.version + 1,
      })
      return written(r, null)
    },
  },
  {
    match: /^\/api\/v1\/price-rules\/([^/]+)$/,
    reply: ({ params }) => find(params[0]) ?? problem(404, 'PRICE_RULE_NOT_FOUND'),
  },
  {
    method: 'PUT',
    match: /^\/api\/v1\/price-rules\/([^/]+)$/,
    reply: ({ params, query, body }) => {
      const r = find(params[0])
      const stale = versioned(query, r)
      if (stale) return stale
      const refused = validate({ ...body, __id: r.id })
      if (refused) return refused
      const items = belowCost(body)
      const live = r.enabled || r.pausedUntil
      if (live && items.length && !body.acknowledgeBelowCost)
        return problem(422, 'PRICE_RULE_BELOW_COST', { items })
      Object.assign(r, fromBody(body), {
        version: r.version + 1,
        updatedAt: new Date().toISOString(),
        belowCostAcknowledged:
          items.length && body.acknowledgeBelowCost
            ? { by: 'u-nasser', at: new Date().toISOString() }
            : null,
      })
      return written(r, items)
    },
  },
]
