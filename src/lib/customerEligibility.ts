/**
 * Why a customer cannot be invoiced yet, in words.
 *
 * The server answers `missingInvoiceFields` as stable client field paths
 * (`invoiceAddress.countryCode`, `details.vatRegistrationNumber`) — good for a client to branch on,
 * wrong to print at someone. Each path becomes a phrase, and the three parts of one address are
 * gathered into a single phrase rather than listed as three faults. A path this build does not
 * know is shown as it came, because saying nothing would hide a real gap.
 */

export type Phrase = { key: string; values?: Record<string, string> }

/** `invoiceAddress` and `deliveryAddress` name an address; `details` names a field of its own. */
const ADDRESS_PARTS: Record<string, string> = {
  countryCode: 'invoiceDraft.missing.part.country',
  cityName: 'invoiceDraft.missing.part.city',
  streetName: 'invoiceDraft.missing.part.street',
}

const ADDRESSES: Record<string, string> = {
  invoiceAddress: 'invoiceDraft.missing.invoiceAddress',
  deliveryAddress: 'invoiceDraft.missing.deliveryAddress',
}

const FIELDS: Record<string, string> = {
  'details.vatRegistrationNumber': 'invoiceDraft.missing.vatNumber',
  'details.peppolParticipantId': 'invoiceDraft.missing.peppolId',
}

/**
 * @param list joins the parts of one address in the reader's language
 * @returns one phrase per gap, in the order the server reported them
 */
export function missingCustomerFields(
  paths: readonly string[],
  translate: (key: string) => string,
  list: (items: string[]) => string,
): Phrase[] {
  const addressParts = new Map<string, string[]>()
  const phrases: Phrase[] = []

  for (const path of paths) {
    const [head, tail] = path.split('.')
    if (Object.hasOwn(ADDRESSES, head) && Object.hasOwn(ADDRESS_PARTS, tail)) {
      const parts = addressParts.get(head)
      if (parts) {
        parts.push(translate(ADDRESS_PARTS[tail]))
        continue
      }
      addressParts.set(head, [translate(ADDRESS_PARTS[tail])])
      // Held in place: the address keeps the position of the first part reported for it.
      phrases.push({ key: ADDRESSES[head], values: { parts: '' } })
      continue
    }
    phrases.push(Object.hasOwn(FIELDS, path) ? { key: FIELDS[path] } : { key: 'invoiceDraft.missing.unknown', values: { path } })
  }

  let seen = 0
  return phrases.map((phrase) => {
    if (phrase.values && 'parts' in phrase.values) {
      const head = [...addressParts.keys()][seen++]
      return { ...phrase, values: { parts: list(addressParts.get(head) ?? []) } }
    }
    return phrase
  })
}

/** The gaps as one sentence part, joined in the reader's language ("the invoice address (city and street)"). */
export function missingFieldsSentence(
  paths: readonly string[],
  translate: (key: string, values?: Record<string, string>) => string,
  language: string,
): string {
  const join = (items: string[]) =>
    new Intl.ListFormat(language, { type: 'conjunction' }).format(items)
  return join(
    missingCustomerFields(paths, (key) => translate(key), join).map((phrase) =>
      translate(phrase.key, phrase.values),
    ),
  )
}

/**
 * The paths a `CUSTOMER_NOT_INVOICE_ELIGIBLE` refusal names, from its `missingInvoiceFields`
 * (backend #810, on a sale and on `POST /v1/pos/customers`). Fixed by #810: an older server sent
 * them only inside the `detail` sentence ("Customer is missing invoice fields:
 * invoiceAddress.cityName, ..."), so until #810 is deployed the stable paths are picked out of it.
 * Null for any other refusal.
 */
export function notEligiblePaths(problem: {
  code?: string | null
  detail?: unknown
  missingInvoiceFields?: unknown
}): string[] | null {
  if (problem.code !== 'CUSTOMER_NOT_INVOICE_ELIGIBLE') return null
  if (Array.isArray(problem.missingInvoiceFields)) {
    return problem.missingInvoiceFields.filter((path): path is string => typeof path === 'string')
  }
  const detail = typeof problem.detail === 'string' ? problem.detail : ''
  return detail.match(/\b(?:invoiceAddress|deliveryAddress|details)\.[A-Za-z]+/g) ?? []
}
