import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, type SelectOption } from '../../components/ui'
import { convertLinePrices, type LineItem, type useLineTotals } from '../../components/invoice'
import { formatAmount, formatAtScale, parseAmount } from '../../lib/invoiceMath'
import deleteLineIcon from '../../assets/create-invoice/delete.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * The line table the self-billed invoice and the periodic schedule draw (Figma 154:161180,
 * 154:164555), under the client's composer rules of 25 Sep 2026:
 *
 * - no product code, the description is free text;
 * - each line is goods or a service, and the unit's choices follow that;
 * - the price is ex-VAT, three decimals, never negative, 0 by default;
 * - the tax category is text only — it is the document's, not a per-line choice;
 * - nothing opens a dialog.
 *
 * It sits beside `components/invoice/LineItemsTable` rather than replacing it: that table is the
 * invoice composer's own and carries a catalogue picker and per-line tax categories, which these
 * two screens are told not to have. The arithmetic is the same engine (`useLineTotals`).
 */

export type LineKind = 'goods' | 'service'

export type ComposerLine = LineItem & { kind: LineKind }

/** UN/ECE Rec 20 codes, split by what a line is. */
const GOODS_UNITS: SelectOption[] = [
  { value: 'EA', label: 'EA', hint: 'Each' },
  { value: 'KGM', label: 'KG', hint: 'Kilogram' },
  { value: 'LTR', label: 'L', hint: 'Litre' },
  { value: 'BG', label: 'BG', hint: 'Bag' },
  { value: 'BX', label: 'BX', hint: 'Box' },
  { value: 'SA', label: 'SA', hint: 'Sack' },
  { value: 'PK', label: 'PK', hint: 'Pack' },
  { value: 'MTR', label: 'M', hint: 'Metre' },
]

const SERVICE_UNITS: SelectOption[] = [
  { value: 'HUR', label: 'HR', hint: 'Hour' },
  { value: 'DAY', label: 'DAY', hint: 'Day' },
  { value: 'MON', label: 'MO', hint: 'Month' },
  { value: 'E48', label: 'SVC', hint: 'Service unit' },
]

export const UNITS_BY_KIND: Record<LineKind, SelectOption[]> = {
  goods: GOODS_UNITS,
  service: SERVICE_UNITS,
}

/** A unit code says which kind of line it belongs to, when a line arrives without one. */
export function kindOfUnit(unit: string): LineKind {
  return SERVICE_UNITS.some((option) => option.value === unit) ? 'service' : 'goods'
}

export function blankComposerLine(id: string, vatRate = '5'): ComposerLine {
  return {
    id,
    kind: 'goods',
    description: '',
    unitPrice: '0.000',
    vatRate,
    quantity: '1',
    unit: 'EA',
    discountType: 'PERCENTAGE',
    discountValue: '0',
  }
}

/** Three decimals, never below zero, and 0 when nothing readable was typed. */
export function normalisePrice(raw: string): string {
  const value = parseAmount(raw)
  return formatAmount(value < 0n ? 0n : value, 3).replace(/,/g, '')
}

function FieldShell({ children, readOnly }: { children: ReactNode; readOnly?: boolean }) {
  return (
    <div
      className={[
        'flex h-[50px] w-full items-center justify-between gap-1 rounded-sm border px-4',
        readOnly
          ? 'border-border-subtle bg-surface-tab-bar'
          : 'border-primary-300 bg-surface-tab-bar',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

const INPUT =
  'w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder disabled:text-text-secondary'

function KindToggle({
  value,
  onChange,
  disabled,
  label,
}: {
  value: LineKind
  onChange: (next: LineKind) => void
  disabled?: boolean
  label: string
}) {
  const { t } = useTranslation()
  return (
    <span
      role="group"
      aria-label={label}
      className="inline-flex h-8 shrink-0 items-center rounded-sm border border-primary-300 bg-white p-0.5"
    >
      {(['goods', 'service'] as LineKind[]).map((kind) => (
        <button
          key={kind}
          type="button"
          disabled={disabled}
          onClick={() => onChange(kind)}
          aria-pressed={kind === value}
          className={[
            'inline-flex h-7 items-center rounded-[2px] px-2 text-[11px] font-semibold transition-colors disabled:cursor-default',
            kind === value
              ? 'bg-primary-700 text-white'
              : 'text-text-tertiary hover:text-text-secondary',
          ].join(' ')}
        >
          {t(`lineComposer.kind.${kind}`)}
        </button>
      ))}
    </span>
  )
}

export function LineComposer({
  lines,
  onChange,
  exclVat,
  onExclVatChange,
  totals,
  titleSlot,
  taxLabel,
  readOnly = false,
  minLines = 1,
  footer,
}: {
  lines: ComposerLine[]
  onChange: (next: ComposerLine[]) => void
  exclVat: boolean
  onExclVatChange: (next: boolean) => void
  totals: ReturnType<typeof useLineTotals>
  titleSlot: ReactNode
  /** The document's tax category, printed on every line — never chosen per line. */
  taxLabel: string
  /** Lines that come from somewhere else (a periodic schedule copies an invoice) are shown, not edited. */
  readOnly?: boolean
  minLines?: number
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const [nextId, setNextId] = useState(lines.length + 1)

  const update = (id: string, patch: Partial<ComposerLine>) =>
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)))

  const remove = (id: string) =>
    onChange(lines.length > minLines ? lines.filter((line) => line.id !== id) : lines)

  const add = () => {
    onChange([...lines, blankComposerLine(String(nextId), lines[0]?.vatRate ?? '5')])
    setNextId((value) => value + 1)
  }

  const switchVatMode = (toExclusive: boolean) => {
    if (toExclusive === exclVat) return
    onChange(convertLinePrices(lines, toExclusive))
    onExclVatChange(toExclusive)
  }

  const step = (line: ComposerLine, delta: number) => {
    const current = Number(line.quantity) || 0
    update(line.id, { quantity: String(Math.max(0, current + delta)) })
  }

  const columns = ['description', 'excl', 'vat', 'qty', 'unit', 'discount', 'total'] as const

  return (
    <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {titleSlot}
        <div className="inline-flex rounded-md border border-border-subtle p-0.5">
          {[true, false].map((exclusive) => (
            <button
              key={String(exclusive)}
              type="button"
              onClick={() => switchVatMode(exclusive)}
              aria-pressed={exclVat === exclusive}
              className={[
                'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
                exclVat === exclusive ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary',
              ].join(' ')}
            >
              {t(exclusive ? 'lineComposer.exclVat' : 'lineComposer.inclVat')}
            </button>
          ))}
        </div>
      </div>
      <div className="h-px w-full bg-border-subtle" />

      <div className="overflow-x-auto">
        <div className="min-w-[1040px]">
          <div className="grid grid-cols-[2fr_0.55fr_0.5fr_0.6fr_0.55fr_0.55fr_0.7fr] gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.6px] text-text-tertiary">
            {columns.map((key) => (
              <span key={key}>
                {t(exclVat || key !== 'excl' ? `lineComposer.col.${key}` : 'lineComposer.col.incl')}
              </span>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {lines.map((row, index) => {
              const amounts = totals.lines[index]
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[2fr_0.55fr_0.5fr_0.6fr_0.55fr_0.55fr_0.7fr] items-start gap-2"
                >
                  <FieldShell readOnly={readOnly}>
                    <input
                      value={row.description}
                      disabled={readOnly}
                      onChange={(event) => update(row.id, { description: event.target.value })}
                      maxLength={1000}
                      placeholder={t('lineComposer.descriptionPlaceholder')}
                      aria-label={t('lineComposer.col.description')}
                      className={INPUT}
                    />
                    <KindToggle
                      value={row.kind}
                      disabled={readOnly}
                      label={`${t('lineComposer.col.description')} ${index + 1} — ${t('lineComposer.kindLabel')}`}
                      onChange={(kind) =>
                        update(row.id, { kind, unit: UNITS_BY_KIND[kind][0].value })
                      }
                    />
                  </FieldShell>
                  <FieldShell readOnly={readOnly}>
                    <input
                      value={row.unitPrice}
                      disabled={readOnly}
                      onChange={(event) => update(row.id, { unitPrice: event.target.value })}
                      onBlur={(event) =>
                        update(row.id, { unitPrice: normalisePrice(event.target.value) })
                      }
                      inputMode="decimal"
                      aria-label={t(exclVat ? 'lineComposer.col.excl' : 'lineComposer.col.incl')}
                      className={INPUT}
                    />
                  </FieldShell>
                  {/* The document's category, shown so the rate is never a surprise — not a per-line choice. */}
                  <FieldShell readOnly>
                    <span
                      className="truncate text-sm font-medium text-text-secondary"
                      title={taxLabel}
                    >
                      {row.vatRate}%
                    </span>
                  </FieldShell>
                  <FieldShell readOnly={readOnly}>
                    <input
                      value={row.quantity}
                      disabled={readOnly}
                      onChange={(event) => update(row.id, { quantity: event.target.value })}
                      inputMode="decimal"
                      aria-label={t('lineComposer.col.qty')}
                      className={INPUT}
                    />
                    {readOnly ? null : (
                      <span className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          onClick={() => step(row, 1)}
                          aria-label={t('lineComposer.qtyUp')}
                          className="flex size-4 items-center justify-center"
                        >
                          <img src={chevronIcon} alt="" className="size-3 -rotate-90 opacity-70" />
                        </button>
                        <button
                          type="button"
                          onClick={() => step(row, -1)}
                          aria-label={t('lineComposer.qtyDown')}
                          className="flex size-4 items-center justify-center"
                        >
                          <img src={chevronIcon} alt="" className="size-3 rotate-90 opacity-70" />
                        </button>
                      </span>
                    )}
                  </FieldShell>
                  <Select
                    value={row.unit}
                    disabled={readOnly}
                    onChange={(unit) => update(row.id, { unit })}
                    options={UNITS_BY_KIND[row.kind]}
                    ariaLabel={t('lineComposer.col.unit')}
                  />
                  <FieldShell readOnly={readOnly}>
                    <input
                      value={row.discountValue}
                      disabled={readOnly}
                      onChange={(event) => update(row.id, { discountValue: event.target.value })}
                      inputMode="decimal"
                      aria-label={t('lineComposer.col.discount')}
                      className={INPUT}
                    />
                    <span className="text-xs font-semibold text-text-quaternary">%</span>
                  </FieldShell>
                  <div className="flex items-center justify-between gap-2 pe-1 pt-3">
                    <span className="text-base font-semibold text-text-secondary tabular-nums">
                      {formatAtScale(amounts?.afterLineDiscount ?? 0n)}
                    </span>
                    {readOnly ? null : (
                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle hover:bg-neutral-25"
                        aria-label={t('lineComposer.remove')}
                      >
                        <img src={deleteLineIcon} alt="" className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {readOnly ? null : (
        <button
          type="button"
          onClick={add}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm border border-dashed border-primary-300 text-sm font-semibold text-primary-800"
        >
          <span className="text-xl leading-none">+</span>
          {t('lineComposer.addLine')}
        </button>
      )}

      {footer}
    </section>
  )
}
