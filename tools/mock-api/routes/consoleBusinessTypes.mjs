/**
 * Console › Settings › Business types and the template editor (`src/api/platform/businessTypes.ts`),
 * over the shared store in `../data/businessTypes.mjs`, so a type opened here shows on sign-up in
 * the same run. Changes last until the mock restarts.
 *
 * The spreadsheet import cannot read the uploaded file (the mock parses JSON bodies only), so it
 * always answers the refusal with row errors, which is the state worth screenshotting; the
 * successful import is covered by the screen's tests.
 */
import { itemCount, problem, store, templateSummary } from '../data/businessTypes.mjs'

const NOW = () => new Date().toISOString()
const CODE = /^[A-Z][A-Z0-9_]{1,39}$/

const subView = (sub) => ({ ...sub, template: templateSummary(sub.code) })
const typeView = (type) => ({ ...type, subTypes: type.subTypes.map(subView) })
const list = () => [...store.types].sort((a, b) => a.displayOrder - b.displayOrder).map(typeView)

const findType = (code) => store.types.find((type) => type.code === code)
function findSub(code) {
  for (const type of store.types) {
    const sub = type.subTypes.find((entry) => entry.code === code)
    if (sub) return { type, sub }
  }
  return undefined
}
const taken = (code) => Boolean(findType(code) || findSub(code))
const notFound = () => problem(404, 'resource-not-found', 'Not found')
const activeSubs = (type) => type.subTypes.filter((sub) => !sub.retiredAt).length

function patchNames(target, body) {
  if (typeof body?.nameEn === 'string' && body.nameEn.trim()) target.nameEn = body.nameEn.trim()
  if (typeof body?.nameAr === 'string') target.nameAr = body.nameAr.trim() || null
  if (typeof body?.icon === 'string') target.icon = body.icon || null
  if (typeof body?.displayOrder === 'number') target.displayOrder = body.displayOrder
  target.updatedAt = NOW()
}

function reorder(entries, codes) {
  const listed = codes.filter((code) => entries.some((entry) => entry.code === code))
  listed.forEach((code, index) => {
    entries.find((entry) => entry.code === code).displayOrder = index + 1
  })
  const rest = entries
    .filter((entry) => !listed.includes(entry.code))
    .sort((a, b) => a.displayOrder - b.displayOrder)
  rest.forEach((entry, index) => (entry.displayOrder = listed.length + index + 1))
}

function templateView(code) {
  const entry = store.templates.get(code)
  const versions = [...(entry?.versions ?? [])].reverse()
  const latest = versions[0]
  return {
    subBusinessTypeCode: code,
    draft: entry?.draft ? { ...entry.draft, itemCount: itemCount(entry.draft.groups) } : null,
    published: latest ? { ...latest, itemCount: itemCount(latest.groups) } : null,
    versions: versions.map((version) => ({
      version: version.version,
      publishedAt: version.publishedAt,
      itemCount: itemCount(version.groups),
    })),
  }
}

const SUB = /^\/api\/v1\/platform\/sub-business-types\/([^/]+)/
const TYPE = /^\/api\/v1\/platform\/business-types\/([^/]+)/

const FORMAT_CSV = [
  'group,group_ar,kind,kind_ar,item,item_ar,goods_or_service,unit,vat_category,vat_reason_code,vat_reason_text,hs_code,service_type_code,barcode,sizes,options,add_ons',
  'Hot drinks,مشروبات ساخنة,Coffee,قهوة,Cappuccino,كابتشينو,G,C62,S,,,"000000000000",,,Small=صغير|Large=كبير,Oat milk,Extra shot',
].join('\n')

export default [
  { match: '/api/v1/platform/business-types', reply: () => list() },
  {
    method: 'POST',
    match: '/api/v1/platform/business-types',
    reply: ({ body }) => {
      if (!CODE.test(body?.code ?? '') || !body?.nameEn?.trim())
        return problem(400, 'validation-failed', 'Validation failed')
      if (taken(body.code)) return problem(409, 'catalogue-code-taken', 'Code taken')
      const type = {
        code: body.code,
        nameEn: body.nameEn.trim(),
        nameAr: body.nameAr?.trim() || null,
        icon: body.icon || null,
        displayOrder: body.displayOrder ?? store.types.length + 1,
        openForSignup: false,
        retiredAt: null,
        updatedAt: NOW(),
        subTypes: [],
      }
      store.types.push(type)
      return { status: 201, body: typeView(type) }
    },
  },
  {
    method: 'PUT',
    match: '/api/v1/platform/business-types/order',
    reply: ({ body }) => {
      reorder(store.types, body?.codes ?? [])
      return list()
    },
  },
  {
    method: 'PATCH',
    match: new RegExp(`${TYPE.source}$`),
    reply: ({ params, body }) => {
      const type = findType(decodeURIComponent(params[0]))
      if (!type) return notFound()
      patchNames(type, body)
      return typeView(type)
    },
  },
  {
    method: 'PUT',
    match: new RegExp(`${TYPE.source}/signup$`),
    reply: ({ params, body }) => {
      const type = findType(decodeURIComponent(params[0]))
      if (!type) return notFound()
      if (body?.open) {
        if (type.retiredAt) return problem(409, 'business-type-retired', 'Retired')
        if (activeSubs(type) === 0)
          return problem(409, 'business-type-has-no-active-sub-type', 'No active sub type')
      }
      type.openForSignup = Boolean(body?.open)
      type.updatedAt = NOW()
      return typeView(type)
    },
  },
  {
    method: 'POST',
    match: new RegExp(`${TYPE.source}/(retire|restore)$`),
    reply: ({ params }) => {
      const type = findType(decodeURIComponent(params[0]))
      if (!type) return notFound()
      if (params[1] === 'retire') {
        type.retiredAt = NOW()
        type.openForSignup = false
      } else type.retiredAt = null
      type.updatedAt = NOW()
      return typeView(type)
    },
  },
  {
    method: 'POST',
    match: new RegExp(`${TYPE.source}/sub-types$`),
    reply: ({ params, body }) => {
      const type = findType(decodeURIComponent(params[0]))
      if (!type) return notFound()
      if (!CODE.test(body?.code ?? '') || !body?.nameEn?.trim())
        return problem(400, 'validation-failed', 'Validation failed')
      if (taken(body.code)) return problem(409, 'catalogue-code-taken', 'Code taken')
      const sub = {
        code: body.code,
        businessTypeCode: type.code,
        nameEn: body.nameEn.trim(),
        nameAr: body.nameAr?.trim() || null,
        icon: body.icon || null,
        displayOrder: body.displayOrder ?? type.subTypes.length + 1,
        retiredAt: null,
        updatedAt: NOW(),
        suggestedIsic: body.suggestedIsicCode
          ? { code: body.suggestedIsicCode, nameEn: body.suggestedIsicCode, nameAr: null }
          : null,
        companies: 0,
      }
      type.subTypes.push(sub)
      return { status: 201, body: subView(sub) }
    },
  },
  {
    method: 'PUT',
    match: new RegExp(`${TYPE.source}/sub-types/order$`),
    reply: ({ params, body }) => {
      const type = findType(decodeURIComponent(params[0]))
      if (!type) return notFound()
      reorder(type.subTypes, body?.codes ?? [])
      return list()
    },
  },
  {
    method: 'PATCH',
    match: new RegExp(`${SUB.source}$`),
    reply: ({ params, body }) => {
      const found = findSub(decodeURIComponent(params[0]))
      if (!found) return notFound()
      const { type, sub } = found
      if (body?.businessTypeCode && body.businessTypeCode !== type.code) {
        const target = findType(body.businessTypeCode)
        if (!target) return notFound()
        if (type.openForSignup && !sub.retiredAt && activeSubs(type) === 1)
          return problem(409, 'business-type-has-no-active-sub-type', 'No active sub type')
        type.subTypes = type.subTypes.filter((entry) => entry !== sub)
        sub.businessTypeCode = target.code
        sub.displayOrder = target.subTypes.length + 1
        target.subTypes.push(sub)
      }
      patchNames(sub, body)
      return subView(sub)
    },
  },
  {
    method: 'PUT',
    match: new RegExp(`${SUB.source}/suggested-isic$`),
    reply: ({ params, body }) => {
      const found = findSub(decodeURIComponent(params[0]))
      if (!found) return notFound()
      const code = body?.code ?? null
      if (code !== null && !/^\d{6}$/.test(code))
        return problem(400, 'validation-failed', 'Not on CL-08-OM-ISIC')
      found.sub.suggestedIsic = code ? { code, nameEn: code, nameAr: null } : null
      found.sub.updatedAt = NOW()
      return subView(found.sub)
    },
  },
  {
    method: 'POST',
    match: new RegExp(`${SUB.source}/(retire|restore)$`),
    reply: ({ params }) => {
      const found = findSub(decodeURIComponent(params[0]))
      if (!found) return notFound()
      const { type, sub } = found
      if (params[1] === 'retire') {
        if (type.openForSignup && !sub.retiredAt && activeSubs(type) === 1)
          return problem(409, 'business-type-has-no-active-sub-type', 'No active sub type')
        sub.retiredAt = NOW()
      } else sub.retiredAt = null
      sub.updatedAt = NOW()
      return subView(sub)
    },
  },
  {
    match: new RegExp(`${SUB.source}/template$`),
    reply: ({ params }) => {
      const code = decodeURIComponent(params[0])
      if (!findSub(code)) return notFound()
      return templateView(code)
    },
  },
  {
    match: new RegExp(`${SUB.source}/template/versions/(\\d+)$`),
    reply: ({ params }) => {
      const version = store.templates
        .get(decodeURIComponent(params[0]))
        ?.versions.find((entry) => entry.version === Number(params[1]))
      if (!version) return notFound()
      return { ...version, itemCount: itemCount(version.groups) }
    },
  },
  {
    method: 'PUT',
    match: new RegExp(`${SUB.source}/template/draft$`),
    reply: ({ params, body }) => {
      const code = decodeURIComponent(params[0])
      if (!findSub(code)) return notFound()
      const entry = store.templates.get(code) ?? { draft: null, versions: [] }
      const revision = entry.draft?.revision ?? 0
      if (typeof body?.expectedRevision === 'number' && body.expectedRevision !== revision)
        return problem(409, 'catalogue-template-draft-conflict', 'Draft changed')
      const groups = Array.isArray(body?.groups) ? body.groups : []
      const errors = []
      groups.forEach((group, g) =>
        group.kinds?.forEach((kind, k) =>
          kind.items?.forEach((item, i) => {
            if (!item.name?.trim())
              errors.push({
                row: null,
                path: `groups[${g}].kinds[${k}].items[${i}].name`,
                field: 'name',
                message: 'Name is required.',
              })
            if (item.defaultTaxCategory === 'Z' && !item.defaultTaxReasonCode)
              errors.push({
                row: null,
                path: `groups[${g}].kinds[${k}].items[${i}].defaultTaxReasonCode`,
                field: 'defaultTaxReasonCode',
                message: 'A zero-rated item needs a VATZR-OM reason.',
              })
          }),
        ),
      )
      if (errors.length > 0)
        return problem(400, 'catalogue-template-invalid', 'Template invalid', {
          code: 'CATALOGUE_TEMPLATE_INVALID',
          errors,
        })
      entry.draft = { revision: revision + 1, updatedAt: NOW(), groups }
      store.templates.set(code, entry)
      return templateView(code)
    },
  },
  {
    method: 'POST',
    match: new RegExp(`${SUB.source}/template/import$`),
    reply: () =>
      problem(400, 'catalogue-template-invalid', 'Template invalid', {
        code: 'CATALOGUE_TEMPLATE_INVALID',
        errors: [
          {
            row: 4,
            path: null,
            field: 'hs_code',
            message: 'HS code 1234 is not 12 digits on the Oman HS list.',
          },
          {
            row: 9,
            path: null,
            field: 'vat_reason_code',
            message: 'VATZR-OM-10 is an export reason and cannot be an item default.',
          },
          { row: 12, path: null, field: 'unit', message: 'Unit HUR is not a goods unit.' },
        ],
      }),
  },
  {
    method: 'POST',
    match: new RegExp(`${SUB.source}/template/publish$`),
    reply: ({ params }) => {
      const code = decodeURIComponent(params[0])
      const entry = store.templates.get(code)
      if (!entry?.draft || itemCount(entry.draft.groups) === 0)
        return problem(409, 'catalogue-template-no-draft', 'No draft')
      entry.versions.push({
        version: (entry.versions.at(-1)?.version ?? 0) + 1,
        publishedAt: NOW(),
        groups: entry.draft.groups,
      })
      return templateView(code)
    },
  },
  {
    match: '/api/v1/platform/catalogue-templates/import-format',
    reply: () => ({
      status: 200,
      raw: FORMAT_CSV,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="catalogue-template.csv"',
      },
    }),
  },
]
