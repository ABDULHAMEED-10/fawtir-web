import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox, type SelectOption } from '../ui'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import { loadSupplierPage, supplierListPath, type SupplierListRowDto } from '../../api/expenditure/suppliers'
import { describeApiFailure } from '../../lib/apiFailure'
import chevronIcon from '../../assets/create-invoice/chevron.svg'

const SEARCH_DELAY_MS = 250

export type PickedSupplier = { id: string | null; name: string; vatNumber: string | null }

/**
 * Who a bill is owed to: a supplier on the company's list, searched on the server, or — for a
 * one-off counter purchase — the name as written on the bill, with no record behind it.
 */
export function SupplierPicker({
  value,
  onPick,
  error,
  id,
}: {
  value: PickedSupplier
  onPick: (supplier: PickedSupplier) => void
  /** Already translated. */
  error?: string
  id?: string
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)

  useEffect(() => {
    if (typed === null) return
    const timer = window.setTimeout(() => setQuery(typed), typed === '' ? 0 : SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])

  const path = query === null ? null : supplierListPath({ filter: 'ACTIVE', q: query, sort: 'NAME', page: 0, pageSize: 20 })
  const found = useApiRead<Page<SupplierListRowDto>>(path, () => loadSupplierPage(path!))
  const rows = found.read.status === 'ready' ? found.read.data.items : []

  const options: SelectOption[] = rows.map((row) => ({
    value: row.id,
    label: row.displayName,
    hint: row.vatNumber ? t('billIntake.supplierVat', { vat: row.vatNumber }) : undefined,
  }))

  const emptyText =
    found.read.status === 'failed'
      ? t(describeApiFailure(found.read.error).key)
      : found.read.status === 'loading' || query === null
        ? t('billIntake.searching')
        : t('billIntake.noSupplierFound')

  return (
    <div className="flex flex-col gap-1">
      <Combobox
        value={value.id ?? ''}
        onChange={(picked) => {
          const row = rows.find((candidate) => candidate.id === picked)
          if (row) onPick({ id: row.id, name: row.displayName, vatNumber: row.vatNumber })
        }}
        options={options}
        onSearch={setTyped}
        searchPlaceholder={t('billIntake.searchSupplier')}
        ariaLabel={t('billIntake.supplier')}
        emptyText={emptyText}
        renderTrigger={({ open }) => (
          <span
            id={id}
            className={[
              'flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4',
              error ? 'ring-1 ring-border-danger' : '',
            ].join(' ')}
          >
            <span className={['min-w-0 flex-1 truncate text-start text-sm font-medium', value.name ? 'text-text-secondary' : 'text-text-placeholder'].join(' ')}>
              {value.name ? (value.id ? value.name : t('billIntake.asWritten', { name: value.name })) : t('billIntake.chooseSupplier')}
            </span>
            <img src={chevronIcon} alt="" aria-hidden="true" className={['size-6 shrink-0', open ? '-rotate-90' : 'rotate-90'].join(' ')} />
          </span>
        )}
        footer={({ query: text, close }) =>
          text.trim() ? (
            <button
              type="button"
              onClick={() => {
                close()
                onPick({ id: null, name: text.trim(), vatNumber: null })
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-25"
            >
              {t('billIntake.useAsWritten', { name: text.trim() })}
            </button>
          ) : null
        }
      />
      {error ? (
        <p className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
