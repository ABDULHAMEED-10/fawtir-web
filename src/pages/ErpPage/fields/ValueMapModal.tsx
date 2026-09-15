import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox, Modal, Select, SelectionCard, type SelectOption } from '../../../components/ui'
import type { Target } from '../../../lib/erpCatalogue'
import { CODE_LISTS, EXEMPTION_LISTS, type CodeValue } from '../../../lib/erpCodeLists'
import { codesSeen, type Entry, type OnUnmapped, type Sample } from '../../../lib/erpMapping'
import { useTermName } from './model'
import trashIcon from '../../../assets/catalog/trash-danger.svg'
import plusIcon from '../../../assets/catalog/plus-brand.svg'
import tickIcon from '../../../assets/settings/check-white.svg'

const MAX_PAIRS = 200
const MAX_LENGTH = 128
const ON_UNMAPPED: OnUnmapped[] = ['FAIL', 'USE_DEFAULT', 'PASS_THROUGH']
const LOOKUP_DIGITS = { HS: 12, ISIC: 6 } as const

type Pair = { key: string; value: string; seen: boolean }

/**
 * The value map for one code target (docs/erp-and-console-plan.md §2.2, A.2 "ValueMapModal").
 *
 * Left: the codes the ERP sends — collected from the chosen sample at the row's source path,
 * plus any the reader adds. Right: the PINT-OM code each becomes, picked from the list the
 * target is validated against (both exemption lists for IBT-121, the rate rule beside each VAT
 * category; a digit rule for the HS and ISIC lookups). Under it, what happens to a code that is
 * not listed. Saved as the entry's `valueMap`, `valueMapDefault` and `onUnmapped`, nothing else.
 */
export function ValueMapModal({
  open,
  onClose,
  target,
  entry,
  sample,
  onSave,
}: {
  open: boolean
  onClose: () => void
  target: Target
  entry?: Entry
  sample?: Sample
  onSave: (patch: Pick<Entry, 'valueMap' | 'valueMapDefault' | 'onUnmapped'>) => void
}) {
  const { t, i18n } = useTranslation()
  const termName = useTermName()
  const arabic = i18n.language.startsWith('ar')

  const seen = useMemo(
    () => (sample && entry?.sourcePath ? codesSeen([sample], entry.sourcePath) : []),
    [sample, entry?.sourcePath],
  )

  const [pairs, setPairs] = useState<Pair[]>(() => {
    const current = entry?.valueMap ?? {}
    const existing = Object.entries(current).map(([key, value]) => ({
      key,
      value,
      seen: seen.includes(key),
    }))
    const fresh = seen
      .filter((code) => !(code in current))
      .map((key) => ({ key, value: '', seen: true }))
    return [...existing, ...fresh]
  })
  const [onUnmapped, setOnUnmapped] = useState<OnUnmapped>(entry?.onUnmapped ?? 'FAIL')
  const [fallback, setFallback] = useState(entry?.valueMapDefault ?? '')
  const [newKey, setNewKey] = useState('')

  const lists = target.id === 'IBT-121' ? EXEMPTION_LISTS : target.codeList ? [target.codeList] : []
  const listNames = lists.map((id) => CODE_LISTS[id])
  const lookup = target.lookup
  const digits = lookup ? LOOKUP_DIGITS[lookup] : 0

  /** The right-hand options: one flat list, or both exemption lists with a heading each. */
  const label = (code: CodeValue) => {
    const name = arabic ? (code.nameAr ?? code.name) : code.name
    return name ? `${code.code} — ${name}` : code.code
  }
  const rows = (id: (typeof lists)[number]): SelectOption[] =>
    CODE_LISTS[id].values.map((code) => ({ value: code.code, label: label(code), hint: code.hint }))
  const options: SelectOption[] =
    lists.length <= 1
      ? lists.flatMap(rows)
      : lists.flatMap((id) => [
          {
            value: `__${id}`,
            label: t(
              id === 'VAT_EXEMPTION_REASON' ? 'erp.fields.modal.groupE' : 'erp.fields.modal.groupZ',
            ),
            disabled: true,
          },
          ...rows(id),
        ])

  const searchable = options.length > 10
  const hintFor = (value: string) =>
    listNames.flatMap((list) => list.values).find((code) => code.code === value)?.hint

  const complete = pairs.filter((pair) => pair.key.trim() && pair.value.trim())
  const unmatched = pairs.length - complete.length
  const badLookup = (value: string) =>
    Boolean(lookup) && value !== '' && !new RegExp(`^\\d{${digits}}$`).test(value)
  const tooLong = pairs.some((p) => p.key.length > MAX_LENGTH || p.value.length > MAX_LENGTH)
  const invalid =
    tooLong ||
    pairs.length > MAX_PAIRS ||
    complete.some((p) => badLookup(p.value)) ||
    (onUnmapped === 'USE_DEFAULT' && (!fallback || badLookup(fallback)))

  const setPair = (index: number, patch: Partial<Pair>) =>
    setPairs((list) => list.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)))

  const addPair = () => {
    const key = newKey.trim()
    if (!key || pairs.some((p) => p.key === key) || pairs.length >= MAX_PAIRS) return
    setPairs((list) => [...list, { key, value: '', seen: false }])
    setNewKey('')
  }

  const save = () => {
    const valueMap = Object.fromEntries(complete.map((p) => [p.key.trim(), p.value.trim()]))
    onSave({
      valueMap: Object.keys(valueMap).length ? valueMap : undefined,
      valueMapDefault: onUnmapped === 'USE_DEFAULT' ? fallback : undefined,
      onUnmapped,
    })
    onClose()
  }

  const listLabel = lookup ? lookup : listNames.map((l) => l.id).join(' / ')

  const codePicker = (value: string, onChange: (v: string) => void, ariaLabel: string) =>
    lookup ? (
      <input
        value={value}
        dir="ltr"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-invalid={badLookup(value) ? true : undefined}
        placeholder={t(`erp.fields.modal.lookup${lookup}`)}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
        className={[
          'h-[42px] w-full rounded-sm border bg-white px-3 font-mono text-sm text-text-primary outline-none transition-colors placeholder:font-sans placeholder:text-text-placeholder',
          badLookup(value)
            ? 'border-border-danger'
            : 'border-border-default focus:border-border-brand',
        ].join(' ')}
      />
    ) : searchable ? (
      <Combobox
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={ariaLabel}
        placeholder={t('erp.fields.modal.chooseCode')}
        searchPlaceholder={t('erp.fields.modal.searchCodes')}
        emptyText={t('erp.fields.modal.noCodes')}
      />
    ) : (
      <Select
        compact
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={ariaLabel}
        placeholder={t('erp.fields.modal.chooseCode')}
      />
    )

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      title={t('erp.fields.modal.title', { term: `${target.id} · ${termName(target)}` })}
      subtitle={t('erp.fields.modal.subtitle', { list: listLabel })}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-text-tertiary">
            {t('erp.fields.modal.pairs', { count: complete.length })}
            {unmatched > 0 ? (
              <span className="text-pending-700">
                {' · '}
                {t('erp.fields.modal.unmappedRows', { count: unmatched })}
              </span>
            ) : null}
          </p>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={invalid}
              onClick={save}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <img src={tickIcon} alt="" className="size-4" />
              {t('erp.fields.modal.save')}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* The pairs */}
        <div>
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
              {t('erp.fields.modal.fromErp')} → {t('erp.fields.modal.becomes')}
            </span>
            <span className="text-xs font-medium text-text-quaternary">
              {entry?.sourcePath ? (
                <>
                  {t('erp.fields.modal.sourceIs')}{' '}
                  <span dir="ltr" className="font-mono">
                    {entry.sourcePath}
                  </span>
                </>
              ) : (
                t('erp.fields.modal.noPath')
              )}
            </span>
          </p>

          {pairs.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-2">
              {pairs.map((pair, index) => (
                <li
                  key={index}
                  className="grid items-start gap-2 rounded-sm border border-border-subtle bg-white p-2 sm:grid-cols-[minmax(0,1fr)_16px_minmax(0,1.3fr)_36px]"
                >
                  <div className="min-w-0">
                    <input
                      value={pair.key}
                      dir="ltr"
                      aria-label={t('erp.fields.modal.fromErp')}
                      onChange={(event) => setPair(index, { key: event.target.value, seen: false })}
                      className="h-[42px] w-full rounded-sm border border-border-default bg-white px-3 font-mono text-sm text-text-primary outline-none transition-colors focus:border-border-brand"
                    />
                    {pair.seen ? (
                      <span className="mt-1 inline-flex h-[18px] items-center rounded-[3px] bg-primary-50 px-1.5 text-[10px] font-semibold text-primary-800">
                        {t('erp.fields.modal.seenInSample')}
                      </span>
                    ) : null}
                  </div>
                  <span
                    aria-hidden="true"
                    className="pt-3 text-center text-sm text-text-quaternary max-sm:hidden rtl:-scale-x-100"
                  >
                    →
                  </span>
                  <div className="min-w-0">
                    {codePicker(
                      pair.value,
                      (value) => setPair(index, { value }),
                      t('erp.fields.modal.becomes'),
                    )}
                    {lookup && badLookup(pair.value) ? (
                      <p className="mt-1 text-xs font-medium text-text-danger">
                        {t('erp.fields.modal.lookupBad', { digits })}
                      </p>
                    ) : target.codeList === 'VAT_CATEGORY' && hintFor(pair.value) ? (
                      <p className="mt-1 text-[10px] font-medium leading-[1.4] text-text-tertiary">
                        {hintFor(pair.value)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPairs((list) => list.filter((_, i) => i !== index))}
                    aria-label={t('erp.fields.modal.remove')}
                    className="inline-flex size-9 items-center justify-center justify-self-end rounded-sm transition-colors hover:bg-danger-100 sm:mt-0.5"
                  >
                    <img src={trashIcon} alt="" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-sm border border-dashed border-border-default px-4 py-3 text-sm font-medium text-text-quaternary">
              {t('erp.fields.modal.empty')}
            </p>
          )}

          {/* Add one */}
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newKey}
              dir="ltr"
              aria-label={t('erp.fields.modal.addCode')}
              placeholder={t('erp.fields.modal.addPlaceholder')}
              disabled={pairs.length >= MAX_PAIRS}
              onChange={(event) => setNewKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addPair()
                }
              }}
              className="h-[42px] min-w-0 flex-1 rounded-sm border border-dashed border-border-default bg-white px-3 font-mono text-sm text-text-primary outline-none transition-colors placeholder:font-sans placeholder:text-text-placeholder focus:border-border-brand disabled:opacity-50"
            />
            <button
              type="button"
              onClick={addPair}
              disabled={!newKey.trim() || pairs.length >= MAX_PAIRS}
              className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-sm border border-border-brand-subtle bg-surface-card px-3 text-sm font-semibold text-text-brand transition-colors hover:bg-primary-25 disabled:opacity-40"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t('erp.fields.modal.add')}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] font-medium text-text-tertiary">
            {t('erp.fields.modal.limit')}
            {listNames.some((l) => l.size > l.values.length)
              ? ` · ${t('erp.fields.modal.listSize', {
                  shown: listNames.reduce((n, l) => n + l.values.length, 0),
                  size: listNames.reduce((n, l) => n + l.size, 0),
                })}`
              : ''}
          </p>
        </div>

        {/* If a code is not listed */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
            {t('erp.fields.modal.onUnmapped')}
          </p>
          <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
            {ON_UNMAPPED.map((choice) => (
              <SelectionCard
                key={choice}
                title={t(`erp.onUnmapped.${choice}`)}
                description={t(`erp.fields.modal.onUnmappedNote.${choice}`)}
                selected={onUnmapped === choice}
                onSelect={() => setOnUnmapped(choice)}
                icon={
                  <span
                    aria-hidden="true"
                    className={[
                      'inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                      choice === 'FAIL'
                        ? 'bg-danger-100 text-danger-700'
                        : choice === 'USE_DEFAULT'
                          ? 'bg-primary-50 text-primary-800'
                          : 'bg-surface-background text-text-tertiary',
                    ].join(' ')}
                  >
                    {choice === 'FAIL' ? '×' : choice === 'USE_DEFAULT' ? '=' : '→'}
                  </span>
                }
              />
            ))}
          </div>
          {onUnmapped === 'USE_DEFAULT' ? (
            <div className="mt-3 sm:max-w-[360px]">
              <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                {t('erp.fields.modal.defaultCode')}
              </span>
              {codePicker(fallback, setFallback, t('erp.fields.modal.defaultCode'))}
              {!fallback ? (
                <p className="mt-1 text-xs font-medium text-text-danger">
                  {t('erp.error.VALUE_MAP_DEFAULT_REQUIRED')}
                </p>
              ) : lookup && badLookup(fallback) ? (
                <p className="mt-1 text-xs font-medium text-text-danger">
                  {t('erp.fields.modal.lookupBad', { digits })}
                </p>
              ) : hintFor(fallback) ? (
                <p className="mt-1 text-[10px] font-medium leading-[1.4] text-text-tertiary">
                  {hintFor(fallback)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
