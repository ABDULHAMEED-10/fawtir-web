/**
 * A cut of Oman's zero-rated lists for the mock API (INCOME.md Z.1, Z.8): a few food codes
 * (VATZR-OM-01) and medical codes (VATZR-OM-02), effective 2026-10-01, matched exactly or, for an
 * annex code ending 0000, by its first eight digits. Enough for the screens to show a suggestion
 * and each warning; the real lists are the backend's.
 */
export const EFFECTIVE_FROM = '2026-10-01'

export const LISTS = [
  {
    id: 'zr-food-2026',
    listKey: 'FOOD',
    reasonCode: 'VATZR-OM-01',
    title: 'قائمة السلع الغذائية المعفاة',
    decisionRef: null,
    sourceDocument: 'food-annex.pdf',
    sourceSha256: '0'.repeat(64),
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo: null,
    codes: ['080410000000', '040110100000', '090121000000', '190110000000'],
  },
  {
    id: 'zr-medical-2026',
    listKey: 'MEDICAL',
    reasonCode: 'VATZR-OM-02',
    title: 'قائمة الأدوية والمعدات الطبية',
    decisionRef: null,
    sourceDocument: 'medical-annex.pdf',
    sourceSha256: '0'.repeat(64),
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo: null,
    codes: ['300490000000', '901839000000'],
  },
]

export const today = () => new Date().toISOString().slice(0, 10)

/** The lists in force on `date` that carry `hsCode`, with how it matched. */
export function matchesFor(hsCode, date = today()) {
  if (!/^\d{12}$/.test(hsCode ?? '')) return []
  return LISTS.filter(
    (list) => list.effectiveFrom <= date && (!list.effectiveTo || date <= list.effectiveTo),
  ).flatMap((list) => {
    const exact = list.codes.find((code) => code === hsCode)
    const prefix = list.codes.find(
      (code) => code.endsWith('0000') && code.slice(0, 8) === hsCode.slice(0, 8),
    )
    const matched = exact ?? prefix
    return matched
      ? [
          {
            listKey: list.listKey,
            reasonCode: list.reasonCode,
            listId: list.id,
            effectiveFrom: list.effectiveFrom,
            effectiveTo: list.effectiveTo,
            decisionRef: list.decisionRef,
            matchedCode: matched,
            matchedBy: exact ? 'EXACT' : 'FIRST_EIGHT_DIGITS',
          },
        ]
      : []
  })
}

/** Z.11: the warning for one goods line or product, or null. */
export function warningFor({ hsCode, category, reasonCode }, date = today()) {
  const matches = matchesFor(hsCode, date)
  const food = matches.find((m) => m.listKey === 'FOOD')
  const medical = matches.find((m) => m.listKey !== 'FOOD')
  const base = {
    severity: 'warning',
    hsCode: hsCode ?? null,
    reasonCode: reasonCode ?? null,
    judgedOn: date,
  }
  if (category === 'Z' && reasonCode === 'VATZR-OM-01' && !food) {
    return {
      ...base,
      code: 'ZR_FOOD_NOT_LISTED',
      listKey: 'FOOD',
      effectiveFrom: null,
      message: 'HS code not on the food list.',
    }
  }
  if (category === 'Z' && reasonCode === 'VATZR-OM-02' && !medical) {
    return {
      ...base,
      code: 'ZR_MEDICAL_NOT_LISTED',
      listKey: 'MEDICAL',
      effectiveFrom: null,
      message: 'HS code not on the medical lists.',
    }
  }
  if (category === 'S' && food) {
    return {
      ...base,
      code: 'ZR_FOOD_CHARGED_STANDARD',
      listKey: 'FOOD',
      effectiveFrom: food.effectiveFrom,
      message: 'Listed food charged at the standard rate.',
    }
  }
  if (category === 'S' && medical) {
    return {
      ...base,
      code: 'ZR_MEDICAL_CHARGED_STANDARD',
      listKey: medical.listKey,
      effectiveFrom: medical.effectiveFrom,
      message: 'Listed medical item charged at the standard rate.',
    }
  }
  return null
}

/** The draft preview's `warnings`: goods lines only (services are skipped). */
export function lineWarnings(lines, date = today()) {
  return lines.flatMap((line) => {
    if (line.classification?.goodsOrService === 'S') return []
    const warning = warningFor(
      {
        hsCode: line.classification?.hsCode ?? null,
        category: line.taxCategory?.en16931Category,
        reasonCode: line.taxCategory?.exemptionReasonCode ?? null,
      },
      date,
    )
    if (!warning || !warning.hsCode) return []
    return [{ line: line.lineNumber, hsCodeSource: 'LINE', ...warning }]
  })
}
