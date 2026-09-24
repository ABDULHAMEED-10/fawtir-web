import { useTranslation } from 'react-i18next'
import { OmAmount, Select, TableCheckbox } from '../../components/ui'
import {
  UNITS_BY_KIND,
  type NoteLine,
  type NoteLineKind,
  type NoteTotals,
} from '../../lib/salesNote'
import { formatAmount } from '../../lib/format'
import deleteLineIcon from '../../assets/create-invoice/delete.svg'

/**
 * The lines of a credit or debit note, as the "Create debit note" frame draws them and as the
 * client set the rules for every composer: a free-text description (no product code), a goods /
 * service toggle whose choice narrows the unit list, a VAT-exclusive price at three decimals, and
 * the tax category as text. The whole-invoice credit is read-only, so it collapses to a list of
 * the lines and what each reverses.
 */

const GRID = 'grid-cols-[1.5fr_0.85fr_0.7fr_0.5fr_0.62fr_0.62fr_0.62fr_0.8fr]'

const SHELL = 'flex h-[50px] w-full items-center rounded-sm border border-primary-300 bg-white px-3'
const INPUT =
  'w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder disabled:opacity-50'

function KindToggle({
  value,
  onChange,
  label,
}: {
  value: NoteLineKind
  onChange: (next: NoteLineKind) => void
  label: string
}) {
  const { t } = useTranslation()
  return (
    <span
      role="group"
      aria-label={label}
      className="inline-flex h-[50px] w-full items-center rounded-sm border border-primary-300 bg-white p-1"
    >
      {(['goods', 'service'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => onChange(kind)}
          aria-pressed={value === kind}
          className={[
            'inline-flex h-full flex-1 items-center justify-center rounded-[2px] px-1.5 text-xs font-semibold transition-colors',
            value === kind
              ? 'bg-primary-700 text-white'
              : 'text-text-tertiary hover:text-text-secondary',
          ].join(' ')}
        >
          {t(`salesNote.lines.${kind}`)}
        </button>
      ))}
    </span>
  )
}

export function NoteLinesTable({
  lines,
  totals,
  currency,
  invoiceNumber,
  selectable,
  editable,
  growable,
  tone,
  onChange,
  onAdd,
  onRemove,
}: {
  lines: NoteLine[]
  totals: NoteTotals
  currency: string
  invoiceNumber: string
  /** Rows are ticked in or out: the line pickers. */
  selectable: boolean
  /** Figures can be changed; the whole-invoice credit is read-only. */
  editable: boolean
  /** Lines can be added and removed: additional items. */
  growable: boolean
  tone: 'credit' | 'debit'
  onChange: (lineNumber: number, patch: Partial<NoteLine>) => void
  onAdd?: () => void
  onRemove?: (lineNumber: number) => void
}) {
  const { t, i18n } = useTranslation()
  const money = (value: number | string) => formatAmount(value, currency, i18n.language)
  const sign = tone === 'credit' ? '−' : '+'
  const colour = tone === 'credit' ? 'text-danger-700' : 'text-success-700'

  if (!editable) {
    return (
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <li
            key={line.lineNumber}
            className="flex items-center justify-between gap-4 rounded-sm border border-border-subtle bg-white px-4 py-3.5"
          >
            <span className="text-base font-medium text-text-primary">{line.description}</span>
            <OmAmount
              size="sm"
              amount={`${sign} ${money(totals.lines.get(line.lineNumber) ?? '0')}`}
              amountClassName={`text-lg font-semibold ${colour} tabular-nums`}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div className="min-w-[1040px]">
          <div
            className={`grid ${GRID} gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.8px] text-text-quaternary`}
          >
            <span>{t('salesNote.lines.description')}</span>
            <span>{t('salesNote.lines.kind')}</span>
            <span>{t('salesNote.lines.excl')}</span>
            <span>{t('salesNote.lines.vat')}</span>
            <span>{t('salesNote.lines.qty')}</span>
            <span>{t('salesNote.lines.unit')}</span>
            <span>{t('salesNote.lines.discount')}</span>
            <span className="text-end">{t('salesNote.lines.totExcl')}</span>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {lines.map((line) => {
              const off = selectable && !line.include
              return (
                <div
                  key={line.lineNumber}
                  className={['grid items-start gap-2', GRID, off ? 'opacity-60' : ''].join(' ')}
                >
                  <div className="flex items-start gap-2">
                    {selectable ? (
                      <span className="flex h-[50px] items-center">
                        <TableCheckbox
                          checked={line.include}
                          onChange={() => onChange(line.lineNumber, { include: !line.include })}
                          ariaLabel={t('salesNote.includeLine', {
                            item: line.description || t('salesNote.lines.untitled'),
                          })}
                        />
                      </span>
                    ) : null}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className={SHELL}>
                        <input
                          value={line.description}
                          disabled={off}
                          onChange={(event) =>
                            onChange(line.lineNumber, { description: event.target.value })
                          }
                          maxLength={1000}
                          placeholder={t('salesNote.lines.descriptionPlaceholder')}
                          aria-label={
                            t('salesNote.lines.description') +
                            (line.fromInvoice ? ' · ' + line.description : '')
                          }
                          className={INPUT}
                        />
                      </div>
                      {line.fromInvoice ? (
                        <span className="ps-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                          {t('salesNote.lines.onInvoice', {
                            invoice: invoiceNumber,
                            qty: line.invoiceQuantity,
                            price: money(line.invoiceUnitPrice ?? 0),
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <KindToggle
                    value={line.kind}
                    label={`${t('salesNote.lines.kind')} · ${line.description || t('salesNote.lines.untitled')}`}
                    onChange={(kind) =>
                      onChange(line.lineNumber, {
                        kind,
                        unitCode: UNITS_BY_KIND[kind].some((unit) => unit.value === line.unitCode)
                          ? line.unitCode
                          : UNITS_BY_KIND[kind][0].value,
                      })
                    }
                  />
                  <div className={SHELL}>
                    <input
                      value={line.unitPrice}
                      disabled={off}
                      inputMode="decimal"
                      onChange={(event) =>
                        onChange(line.lineNumber, {
                          unitPrice: event.target.value.replace(/[^\d.]/g, ''),
                        })
                      }
                      onBlur={() => {
                        const value = Number(line.unitPrice)
                        onChange(line.lineNumber, {
                          unitPrice:
                            Number.isFinite(value) && line.unitPrice.trim() !== ''
                              ? Math.max(0, value).toFixed(3)
                              : '0.000',
                        })
                      }}
                      aria-label={`${t('salesNote.col.unitPrice')} · ${line.description || t('salesNote.lines.untitled')}`}
                      className={`${INPUT} text-end tabular-nums`}
                    />
                  </div>
                  {/* Text only, as the client asked: the rate is the invoice's, never typed. */}
                  <div className={`${SHELL} bg-surface-tab-bar`}>
                    <span className="text-sm font-medium text-text-secondary">
                      {line.taxCategory.rate}%
                    </span>
                  </div>
                  <div className={SHELL}>
                    <input
                      value={line.quantity}
                      disabled={off}
                      inputMode="decimal"
                      onChange={(event) =>
                        onChange(line.lineNumber, {
                          quantity: event.target.value.replace(/[^\d.]/g, ''),
                        })
                      }
                      aria-label={`${t('salesNote.col.quantity')} · ${line.description || t('salesNote.lines.untitled')}`}
                      className={`${INPUT} text-end tabular-nums`}
                    />
                  </div>
                  <Select
                    value={line.unitCode}
                    onChange={(unitCode) => onChange(line.lineNumber, { unitCode })}
                    options={UNITS_BY_KIND[line.kind]}
                    disabled={off}
                    ariaLabel={`${t('salesNote.lines.unit')} · ${line.description || t('salesNote.lines.untitled')}`}
                  />
                  <div className={`${SHELL} gap-1`}>
                    <input
                      value={line.discountValue}
                      disabled={off}
                      inputMode="decimal"
                      onChange={(event) =>
                        onChange(line.lineNumber, {
                          discountValue: event.target.value.replace(/[^\d.]/g, ''),
                        })
                      }
                      aria-label={`${t('salesNote.lines.discount')} · ${line.description || t('salesNote.lines.untitled')}`}
                      className={`${INPUT} text-end tabular-nums`}
                    />
                    <span className="text-xs font-semibold text-text-quaternary">
                      {line.discountType === 'PERCENTAGE' ? '%' : currency}
                    </span>
                  </div>
                  <div className="flex h-[50px] items-center justify-end gap-2">
                    <OmAmount
                      size="xs"
                      amount={money(
                        line.include ? (totals.lines.get(line.lineNumber) ?? '0') : '0',
                      )}
                      amountClassName="text-lg font-semibold text-text-primary tabular-nums"
                    />
                    {growable && onRemove ? (
                      <button
                        type="button"
                        onClick={() => onRemove(line.lineNumber)}
                        className="inline-flex size-8 items-center justify-center rounded-sm hover:bg-neutral-25"
                        aria-label={t('salesNote.lines.remove')}
                      >
                        <img src={deleteLineIcon} alt="" className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {growable && onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm border border-dashed border-primary-300 text-sm font-semibold text-primary-800"
        >
          <span className="text-xl leading-none">+</span>
          {t('salesNote.lines.addLine')}
        </button>
      ) : null}
    </div>
  )
}
