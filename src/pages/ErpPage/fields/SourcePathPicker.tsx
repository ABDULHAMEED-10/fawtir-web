import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Input, Popover } from '../../../components/ui'
import { SOURCE_PATH, SOURCE_PATH_MAX } from '../../../lib/erpCatalogue'
import type { SampleKey } from '../../../lib/erp/sample'
import searchIcon from '../../../assets/order-forms-v2/search.svg'
import chevronIcon from '../../../assets/create-invoice/chevron.svg'

/**
 * The source-path field (docs/erp-and-console-plan.md §2.2, A.2 "Row: source path").
 *
 * An ordinary text field — the path grammar is small enough to type — with a popover that lists
 * every key the chosen sample carries, each with its example value, so nobody has to remember
 * whether Odoo calls it `partner.vat` or `partner_vat`. The keys are flattened on the client
 * (`flattenKeys`); no endpoint is involved. The grammar is checked as it is typed.
 */
export function SourcePathPicker({
  id,
  value,
  onChange,
  keys,
  hasSample,
  error,
  defaultOpen = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  keys: SampleKey[]
  hasSample: boolean
  /** A server-side error for this term; the live grammar check takes precedence. */
  error?: string
  defaultOpen?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const anchorRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const malformed = value !== '' && (!SOURCE_PATH.test(value) || value.length > SOURCE_PATH_MAX)
  const message = malformed ? t('erp.error.MALFORMED_SOURCE_PATH') : error

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return keys
    return keys.filter(
      (key) =>
        key.path.toLowerCase().includes(needle) || key.example.toLowerCase().includes(needle),
    )
  }, [keys, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  return (
    <div ref={anchorRef} className="w-full">
      <Input
        bordered
        id={id}
        label={t('erp.fields.sourcePath')}
        value={value}
        dir="ltr"
        spellCheck={false}
        autoComplete="off"
        placeholder={t('erp.fields.sourcePathPlaceholder')}
        onChange={(event) => onChange(event.target.value.trim())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className="font-mono"
        error={message}
        trailingIcon={
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={t('erp.fields.pickPath')}
            className="-me-2 inline-flex size-8 items-center justify-center rounded-sm transition-colors hover:bg-primary-25"
          >
            <img
              src={chevronIcon}
              alt=""
              aria-hidden="true"
              className={['size-5', open ? '-rotate-90' : 'rotate-90'].join(' ')}
            />
          </button>
        }
      />

      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)}>
        {hasSample ? (
          <>
            <label className="flex h-11 items-center gap-2 border-b border-border-subtle px-3">
              <img src={searchIcon} alt="" className="size-5 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('erp.fields.searchPaths')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <ul role="listbox" className="max-h-[260px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-sm font-medium text-text-quaternary">
                  {t('erp.fields.noPaths')}
                </li>
              ) : (
                filtered.map((key) => {
                  const isSelected = key.path === value
                  return (
                    <li key={key.path}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange(key.path)
                          setOpen(false)
                        }}
                        className={[
                          'flex w-full items-start justify-between gap-3 px-4 py-2 text-start transition-colors hover:bg-primary-25',
                          isSelected ? 'bg-primary-25' : '',
                        ].join(' ')}
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span
                            dir="ltr"
                            className={[
                              'truncate font-mono text-[13px] leading-[1.3]',
                              isSelected ? 'font-semibold text-primary-800' : 'text-text-secondary',
                            ].join(' ')}
                          >
                            {key.path}
                          </span>
                          <span
                            dir="ltr"
                            className="truncate text-xs font-medium leading-[1.2] text-text-quaternary"
                          >
                            {key.example}
                          </span>
                        </span>
                        <span className="mt-0.5 inline-flex h-[18px] shrink-0 items-center rounded-[3px] bg-surface-background px-1.5 text-[10px] font-semibold text-text-quaternary">
                          {t(`erp.fields.type.${key.type}`)}
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </>
        ) : (
          <p className="px-4 py-3 text-sm font-medium leading-[1.5] text-text-quaternary">
            {t('erp.fields.pickerNeedsSample')}{' '}
            <Link
              to="/settings/erp-mapping/samples"
              className="font-semibold text-primary-700 hover:text-primary-800"
            >
              {t('erp.fields.uploadSample')}
            </Link>
          </p>
        )}
      </Popover>
    </div>
  )
}
