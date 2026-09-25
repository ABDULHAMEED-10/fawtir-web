import { useState, type ReactNode } from 'react'
import { selectAllOnFocus } from './numericInput'
import { useTranslation } from 'react-i18next'
import { Select, withRial } from '../ui'
import { blankLine, convertLinePrices, type LineItem, type useLineTotals } from './lineItems'
import { TAX_CATEGORIES, TAX_CATEGORY_OPTIONS, UNIT_OPTIONS } from '../../lib/catalogues'
import { formatAtScale, type DiscountType } from '../../lib/invoiceMath'
import deleteLineIcon from '../../assets/create-invoice/delete.svg'
import omrIcon from '../../assets/create-invoice/omr.svg'

/**
 * The document line table — Create invoice, self-billing, credit and debit notes, periodic.
 *
 * Every document these five screens produce is priced the same way: a description, a unit price,
 * a tax category, a quantity, a unit and a line discount, all resolving through the same
 * fixed-point engine. The invoice screen had this working and the other four had painted copies
 * of it, which is how they drifted — a picker where the description should be free text, no
 * discount at all, and line totals that did not follow their own inputs.
 *
 * The description is deliberately a text box, not a picker: a line can be ad-hoc and never appear
 * in the catalogue.
 */

const GRID = 'grid-cols-[1.5fr_0.5fr_0.6fr_0.5fr_0.5fr_0.85fr_0.7fr]'

/**
 * The line total's OMR figure.
 *
 * The shared `ui/OmAmount` takes its sizing from the caller; this keeps the exact weight and
 * gap the invoice screen already uses, so moving that screen onto this component changes nothing
 * about how it looks.
 */
function LineAmount({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-text-secondary">
      <img src={omrIcon} alt="" className="h-auto w-4" />
      <span className="text-base font-semibold">{value}</span>
    </span>
  )
}

function FieldShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[50px] w-full items-center justify-between rounded-sm border border-primary-300 px-4">
      {children}
    </div>
  )
}

function DiscountTypeToggle({
  value,
  onChange,
  label,
}: {
  value: DiscountType
  onChange: (next: DiscountType) => void
  label: string
}) {
  const { t } = useTranslation()
  const options: { id: DiscountType; text: string }[] = [
    { id: 'PERCENTAGE', text: '%' },
    { id: 'FIXED_AMOUNT', text: t('createInvoice.items.omr') },
  ]

  return (
    <span
      role="group"
      aria-label={`${label}, ${t('createInvoice.items.discountType')}`}
      className="inline-flex h-9 shrink-0 items-center rounded-sm border border-primary-300 bg-white p-0.5"
    >
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={[
              'inline-flex h-8 min-w-[34px] items-center justify-center rounded-[2px] px-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-primary-700 text-white' : 'text-text-tertiary hover:text-text-secondary',
            ].join(' ')}
          >
            {withRial(option.text)}
          </button>
        )
      })}
    </span>
  )
}

/** Line discount cell: type, value, and — when a percentage — the OMR it resolves to, live. */
function DiscountField({
  type,
  value,
  onTypeChange,
  onValueChange,
  resolved,
}: {
  type: DiscountType
  value: string
  onTypeChange: (next: DiscountType) => void
  onValueChange: (next: string) => void
  resolved: bigint
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-[50px] items-center gap-1 rounded-sm border border-primary-300 bg-surface-tab-bar px-1.5">
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          inputMode="decimal"
          onFocus={selectAllOnFocus}
          aria-label={t('createInvoice.items.discount')}
          className="w-full min-w-0 border-0 bg-transparent px-1 text-sm font-medium text-text-secondary outline-none"
        />
        <DiscountTypeToggle
          value={type}
          onChange={onTypeChange}
          label={t('createInvoice.items.discount')}
        />
      </div>
      {/* A percentage is meaningless to check without the money it comes to. */}
      {type === 'PERCENTAGE' && resolved > 0n ? (
        <span className="ps-1 text-xs font-medium leading-[1.2] text-text-tertiary">
          = {formatAtScale(resolved)} {withRial(t('createInvoice.items.omr'))}
        </span>
      ) : null}
    </div>
  )
}

export function LineItemsTable({
  lines,
  onChange,
  exclVat,
  onExclVatChange,
  totals,
  titleSlot,
  descriptionPlaceholder,
  minLines = 1,
  footer,
}: {
  lines: LineItem[]
  onChange: (next: LineItem[]) => void
  exclVat: boolean
  onExclVatChange: (next: boolean) => void
  /** The projection from `useLineTotals`, so the caller can also read it for its summary. */
  totals: ReturnType<typeof useLineTotals>
  /** The numbered section heading, which differs per document. */
  titleSlot: ReactNode
  descriptionPlaceholder?: string
  /** The last line cannot be removed on documents that need at least one. */
  minLines?: number
  /** The document's own totals, which sit inside this card rather than below it. */
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const [nextId, setNextId] = useState(lines.length + 1)

  const update = (id: string, patch: Partial<LineItem>) =>
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)))

  const remove = (id: string) =>
    onChange(lines.length > minLines ? lines.filter((line) => line.id !== id) : lines)

  const add = () => {
    onChange([...lines, blankLine(String(nextId))])
    setNextId((value) => value + 1)
  }

  const switchVatMode = (toExclusive: boolean) => {
    if (toExclusive === exclVat) return
    onChange(convertLinePrices(lines, toExclusive))
    onExclVatChange(toExclusive)
  }

  return (
    <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {titleSlot}
        <div className="inline-flex rounded-md border border-border-subtle p-0.5">
          <button
            type="button"
            onClick={() => switchVatMode(true)}
            className={[
              'rounded-sm px-3 py-1.5 text-sm font-medium',
              exclVat ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary',
            ].join(' ')}
          >
            {t('createInvoice.items.exclVat')}
          </button>
          <button
            type="button"
            onClick={() => switchVatMode(false)}
            className={[
              'rounded-sm px-3 py-1.5 text-sm font-medium',
              !exclVat ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary',
            ].join(' ')}
          >
            {t('createInvoice.items.inclVat')}
          </button>
        </div>
      </div>
      <div className="h-px w-full bg-border-subtle" />

      <div className="overflow-x-auto">
        <div className="min-w-[1040px]">
          <div className={`grid ${GRID} gap-2 px-1 text-sm font-medium text-text-tertiary`}>
            <span>{t('createInvoice.items.description')}</span>
            <span>{t(exclVat ? 'createInvoice.items.excl' : 'createInvoice.items.incl')}</span>
            <span>{t('createInvoice.items.vat')}</span>
            <span>{t('createInvoice.items.qty')}</span>
            <span>{t('createInvoice.items.unit')}</span>
            <span>{t('createInvoice.items.discount')}</span>
            <span>{t('createInvoice.items.totExcl')}</span>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {lines.map((row, index) => {
              const amounts = totals.lines[index]
              return (
                <div key={row.id} className={`grid ${GRID} items-start gap-2`}>
                  {/* Free text, not a picker — a line may be ad-hoc. */}
                  <FieldShell>
                    <input
                      value={row.description}
                      onChange={(event) => update(row.id, { description: event.target.value })}
                      maxLength={1000}
                      placeholder={
                        descriptionPlaceholder ?? t('createInvoice.items.descriptionPlaceholder')
                      }
                      aria-label={t('createInvoice.items.description')}
                      className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
                    />
                  </FieldShell>
                  <FieldShell>
                    <input
                      value={row.unitPrice}
                      onChange={(event) => update(row.id, { unitPrice: event.target.value })}
                      inputMode="decimal"
                      onFocus={selectAllOnFocus}
                      aria-label={t('createInvoice.items.excl')}
                      className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                    />
                  </FieldShell>
                  {/* Catalogue-resolved: the rate is never typed. */}
                  <Select
                    value={TAX_CATEGORIES.find((c) => c.rate === row.vatRate)?.code ?? 'S5'}
                    onChange={(code) =>
                      update(row.id, {
                        vatRate: TAX_CATEGORIES.find((c) => c.code === code)?.rate ?? '5',
                      })
                    }
                    options={TAX_CATEGORY_OPTIONS}
                    ariaLabel={t('createInvoice.items.vat')}
                  />
                  <FieldShell>
                    <input
                      value={row.quantity}
                      onChange={(event) => update(row.id, { quantity: event.target.value })}
                      inputMode="decimal"
                      onFocus={selectAllOnFocus}
                      aria-label={t('createInvoice.items.qty')}
                      className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                    />
                  </FieldShell>
                  <Select
                    value={row.unit}
                    onChange={(unit) => update(row.id, { unit })}
                    options={UNIT_OPTIONS}
                    ariaLabel={t('createInvoice.items.unit')}
                  />
                  <DiscountField
                    type={row.discountType}
                    value={row.discountValue}
                    onTypeChange={(discountType) => update(row.id, { discountType })}
                    onValueChange={(discountValue) => update(row.id, { discountValue })}
                    resolved={amounts?.lineDiscount ?? 0n}
                  />
                  <div className="flex items-center justify-between gap-2 pe-1 pt-3">
                    <LineAmount value={formatAtScale(amounts?.afterLineDiscount ?? 0n)} />
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      className="inline-flex size-8 items-center justify-center rounded-sm hover:bg-neutral-25"
                      aria-label={t('createInvoice.items.remove')}
                    >
                      <img src={deleteLineIcon} alt="" className="size-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={add}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm border border-dashed border-primary-300 text-sm font-semibold text-primary-800"
      >
        <span className="text-xl leading-none">+</span>
        {t('createInvoice.items.addLine')}
      </button>

      {footer}
    </section>
  )
}
