import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox, type SelectOption } from '../ui'
import { nameOf } from '../../lib/codeLists/codeList'
import { HS_CODES, OTHER_HS_CODE, hsHeading } from '../../lib/codeLists/hs'
import { SERVICE_TYPES } from '../../lib/codeLists/serviceTypes'

/**
 * The PINT-OM classification of one line, shared by every composer (invoice, credit and debit
 * note, periodic schedule, self-billed invoice): the Oman 12-digit HS code of a goods line
 * (IBR-079-OM) or the CL-12-OM service type of a service line (IBR-155-OM), both searched by name
 * and stored as the code. "Other" (000000000000) stays at the end of the HS list whatever is
 * typed, so a product that fits no heading can still be classified. One list each, from
 * `lib/codeLists`; see docs/backend-guides/INCOME.md (part C).
 */
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
  const [query, setQuery] = useState('')
  const goods = kind === 'goods'

  const options = useMemo<SelectOption[]>(() => {
    if (!goods) {
      return SERVICE_TYPES.map((entry) => ({
        value: entry.code,
        label: nameOf(entry, language),
        hint: `CL-12-OM ${entry.code}`,
      }))
    }
    const needle = query.trim().toLowerCase()
    const matches = HS_CODES.filter((entry) => {
      if (entry.code === OTHER_HS_CODE) return false
      if (!needle) return true
      return [entry.en, entry.ar, hsHeading(entry.code) ?? '', entry.code].some((part) =>
        part.toLowerCase().includes(needle),
      )
    })
    const other = HS_CODES.find((entry) => entry.code === OTHER_HS_CODE)!
    return [...matches, other].map((entry) => {
      const heading = hsHeading(entry.code)
      const name = nameOf(entry, language)
      return {
        value: entry.code,
        label: heading ? `${heading} · ${name}` : name,
        hint: entry.code,
      }
    })
  }, [goods, query, language])

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      // The HS list keeps "Other" last whatever is typed, so it filters here; services filter in the box.
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
