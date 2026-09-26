import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox, type SelectOption } from '../ui'
import { nameOf } from '../../lib/codeLists/codeList'
import { SERVICE_TYPES } from '../../lib/codeLists/serviceTypes'
import { searchHs, type HsEntryDto } from '../../api/codeLists/hs'

/**
 * The PINT-OM classification of one line, shared by every composer (invoice, credit and debit
 * note, periodic schedule, self-billed invoice): the Oman 12-digit HS code of a goods line
 * (IBR-079-OM) or the CL-12-OM service type of a service line (IBR-155-OM), both searched by name
 * and stored as the code.
 *
 * The HS list is the published one, 14,313 codes, so it is searched on the server as the person
 * types (`GET /v1/code-lists/hs`); an option shows the last two levels of the heading path with
 * the code beneath, so "Coffee cups" and "Coffee, roasted" are told apart. The service types are
 * the published 21, held here. See docs/backend-guides/INCOME.md (part C).
 */
const HS_DEBOUNCE_MS = 250

/** The last two levels of a heading path: enough to tell one entry from its neighbours. */
export function hsOptionLabel(name: string): string {
  const levels = name.split(' > ')
  return levels.slice(-2).join(' > ')
}

/** The option in the interface language: the Arabic name when it is Arabic and the server sent one. */
const hsOption = (entry: HsEntryDto, language: string): SelectOption => ({
  value: entry.code,
  label: hsOptionLabel(language.startsWith('ar') && entry.nameAr ? entry.nameAr : entry.name),
  hint: entry.code,
})

/**
 * "Other" (000000000000): the published fallback for a product that fits no heading. It is always
 * offered, at the foot of whatever the search found, so a person is never stuck for a code.
 */
export const HS_OTHER: HsEntryDto = { code: '000000000000', name: 'Other', nameAr: 'أخرى' }

/** What the picker lists: the chosen entry kept in view, the search results, then "Other". */
export function hsPickerEntries(found: HsEntryDto[], chosen?: HsEntryDto): HsEntryDto[] {
  const entries = chosen && !found.some((entry) => entry.code === chosen.code) ? [chosen, ...found] : found
  return entries.some((entry) => entry.code === HS_OTHER.code) ? entries : [...entries, HS_OTHER]
}

/** What has been seen for each code, so a chosen entry keeps its name while the list changes. */
const SEEN = new Map<string, HsEntryDto>([[HS_OTHER.code, HS_OTHER]])

export function ClassificationField({
  kind,
  value,
  onChange,
  disabled,
  ariaLabel,
  compact,
}: {
  kind: 'goods' | 'service'
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  ariaLabel: string
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const goods = kind === 'goods'
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<HsEntryDto[]>([])
  const [seen, remember] = useState(0)

  // The list follows what is typed, after a short pause; a slow answer never overwrites a newer one.
  useEffect(() => {
    if (!goods) return
    const controller = new AbortController()
    const id = window.setTimeout(
      () => {
        searchHs(query, 20, controller.signal).then(
          (result) => {
            result.items.forEach((entry) => SEEN.set(entry.code, entry))
            setFound(result.items)
          },
          () => undefined,
        )
      },
      query ? HS_DEBOUNCE_MS : 0,
    )
    return () => {
      window.clearTimeout(id)
      controller.abort()
    }
  }, [goods, query])

  // A stored code (a reopened draft) is named by asking for it once.
  useEffect(() => {
    if (!goods || !value || SEEN.has(value)) return
    let live = true
    searchHs(value, 5).then(
      (result) => {
        const entry = result.items.find((item) => item.code === value)
        if (entry && live) {
          SEEN.set(value, entry)
          remember((n) => n + 1)
        }
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [goods, value])

  const options = useMemo<SelectOption[]>(() => {
    if (!goods) {
      return SERVICE_TYPES.map((entry) => ({
        value: entry.code,
        label: nameOf(entry, language),
        hint: `CL-12-OM ${entry.code}`,
      }))
    }
    const chosen = value ? SEEN.get(value) : undefined
    return hsPickerEntries(found, chosen).map((entry) => hsOption(entry, language))
    // `seen` changes when a stored code has been named, so the list is rebuilt to include it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goods, found, value, language, seen])

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      // The HS list is searched on the server as the person types; the services filter in the box.
      onSearch={goods ? setQuery : undefined}
      disabled={disabled}
      compact={compact}
      placeholder={t(goods ? 'classification.hsPlaceholder' : 'classification.servicePlaceholder')}
      searchPlaceholder={t(goods ? 'classification.hsSearch' : 'classification.serviceSearch')}
      emptyText={t(goods ? 'classification.hsNone' : 'classification.serviceNone')}
      ariaLabel={ariaLabel}
    />
  )
}
