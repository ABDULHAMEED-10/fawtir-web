import { useTranslation } from 'react-i18next'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { OmAmount, Rial, Select, TableCheckbox } from '../../components/ui'
import { ClassificationField, unitOptions } from '../../components/invoice'
import {
  CODED_REASON,
  NEEDS_EXEMPTION_REASON,
  reasonRequired,
  unitsFor,
} from '../../lib/invoiceDraft'
import { taxReasonsFor } from '../../lib/codeLists/taxReasons'
import { nameOf } from '../../lib/codeLists/codeList'
import type { TaxCategoryDto } from '../../api/reference/referenceData'
import { type NoteLine, type NoteLineKind, type NoteTotals } from '../../lib/salesNote'
import { formatAmount } from '../../lib/format'
import deleteLineIcon from '../../assets/create-invoice/delete.svg'

/**
 * The lines of a credit or debit note, as the "Create debit note" frame draws them and as the
 * client set the rules for every composer: a free-text description (no product code), a goods /
 * service toggle whose choice narrows the unit list, a VAT-exclusive price at three decimals, and
 * the tax category as text. A goods line names its product by HS code and a service line its
 * service type, searched by name, for business and government customers only. The whole-invoice
 * credit is read-only, so it collapses to a list of the lines and what each reverses.
 */

const GRID = 'grid-cols-[1.5fr_0.85fr_0.7fr_0.5fr_0.7fr_0.62fr_0.62fr_0.8fr]'

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

/** The frame's quantity field: a number with an up / down stepper at its end. */
function Stepper({ disabled, onStep }: { disabled: boolean; onStep: (delta: number) => void }) {
  const { t } = useTranslation()
  return (
    <span className="flex shrink-0 flex-col justify-center">
      {[1, -1].map((delta) => (
        <button
          key={delta}
          type="button"
          disabled={disabled}
          onClick={() => onStep(delta)}
          aria-label={t(delta > 0 ? 'salesNote.lines.more' : 'salesNote.lines.fewer')}
          className="flex h-3.5 w-5 items-center justify-center text-text-quaternary hover:text-text-secondary disabled:opacity-40"
        >
          <svg viewBox="0 0 12 8" className="h-2 w-3 fill-none stroke-current" strokeWidth="1.6">
            <path d={delta > 0 ? 'M1 6.5 6 1.5l5 5' : 'M1 1.5l5 5 5-5'} strokeLinecap="round" />
          </svg>
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
  classified,
  tone,
  onChange,
  onAdd,
  onRemove,
  taxCategories,
}: {
  lines: NoteLine[]
  totals: NoteTotals
  currency: string
  invoiceNumber: string
  /** Rows are ticked in or out: the credit note's line picker. */
  selectable: boolean
  /** Figures can be changed; the whole-invoice credit is read-only. */
  editable: boolean
  /** Lines can be added and removed: additional items. */
  growable: boolean
  /** The customer is a business or government body, so each line names its HS code or service type. */
  classified: boolean
  tone: 'credit' | 'debit'
  onChange: (lineNumber: number, patch: Partial<NoteLine>) => void
  onAdd?: () => void
  onRemove?: (lineNumber: number) => void
  /**
   * Offered on a line added on the note itself (an extra item, a charge): it picks its own tax
   * category, as an invoice line does. A line copied from the invoice keeps the invoice's.
   */
  taxCategories?: TaxCategoryDto[]
}) {
  const { t, i18n } = useTranslation()
  const money = (value: number | string) => formatAmount(value, currency, i18n.language)
  const sign = tone === 'credit' ? '−' : '+'
  const colour = tone === 'credit' ? 'text-danger-700' : 'text-success-700'
  const name = (line: NoteLine) => line.description || t('salesNote.lines.untitled')

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
              prefix={sign}
              amount={money(totals.lines.get(line.lineNumber) ?? '0')}
              amountClassName={`text-lg font-semibold ${colour} tabular-nums`}
              className="shrink-0"
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
              const classificationLabel = t(
                line.kind === 'goods' ? 'classification.hsCode' : 'classification.serviceType',
              )
              return (
                <div key={line.lineNumber} className={off ? 'opacity-60' : ''}>
                  <div className={['grid items-start gap-2', GRID].join(' ')}>
                    <div className="flex items-start gap-2">
                      {selectable ? (
                        <span className="flex h-[50px] items-center">
                          <TableCheckbox
                            checked={line.include}
                            onChange={() => onChange(line.lineNumber, { include: !line.include })}
                            ariaLabel={t('salesNote.includeLine', { item: name(line) })}
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
                      label={`${t('salesNote.lines.kind')} · ${name(line)}`}
                      onChange={(kind) =>
                        onChange(line.lineNumber, {
                          kind,
                          classification: null,
                          unitCode: unitsFor(kind).includes(line.unitCode)
                            ? line.unitCode
                            : unitsFor(kind)[0],
                        })
                      }
                    />
                    <div className={SHELL}>
                      <input
                        value={line.unitPrice}
                        disabled={off}
                        inputMode="decimal"
                        onFocus={selectAllOnFocus}
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
                        aria-label={`${t('salesNote.col.unitPrice')} · ${name(line)}`}
                        className={`${INPUT} text-end tabular-nums`}
                      />
                    </div>
                    {/* A line from the invoice keeps the invoice's rate, shown as text. A line added on
                        the note picks its own category, as an invoice line does. */}
                    {!line.fromInvoice && taxCategories?.length ? (
                      <Select
                        value={line.taxCategory.code}
                        disabled={off}
                        onChange={(code) => {
                          const tax = taxCategories.find((category) => category.code === code)
                          if (!tax || tax.code === line.taxCategory.code) return
                          onChange(line.lineNumber, {
                            taxCategory: {
                              code: tax.code,
                              en16931Category: tax.en16931Category,
                              rate: Number(tax.rate),
                              exemptionReason: null,
                              exemptionReasonCode: null,
                            },
                          })
                        }}
                        options={taxCategories.map((category) => ({
                          value: category.code,
                          label: t(`createInvoice.taxCategories.${category.code}`, {
                            defaultValue: category.code,
                          }),
                          shortLabel: t('salesNote.lines.vatShort', {
                            rate: Number(category.rate),
                            category: category.en16931Category,
                          }),
                        }))}
                        panelWidth={240}
                        tight
                        ariaLabel={`${t('salesNote.lines.vat')} · ${name(line)}`}
                      />
                    ) : (
                      <div className={`${SHELL} bg-surface-tab-bar`}>
                        <span className="text-sm font-medium text-text-secondary">
                          {t('salesNote.lines.vatRate', { rate: line.taxCategory.rate })}
                        </span>
                      </div>
                    )}
                    <div className={`${SHELL} gap-1 pe-1.5`}>
                      <input
                        value={line.quantity}
                        disabled={off}
                        inputMode="decimal"
                        onFocus={selectAllOnFocus}
                        onChange={(event) =>
                          onChange(line.lineNumber, {
                            quantity: event.target.value.replace(/[^\d.]/g, ''),
                          })
                        }
                        aria-label={`${t('salesNote.col.quantity')} · ${name(line)}`}
                        className={`${INPUT} tabular-nums`}
                      />
                      <Stepper
                        disabled={off}
                        onStep={(delta) => {
                          const current = Number(line.quantity) || 0
                          const next = Math.max(
                            0,
                            Math.round((current + delta) * 1_000_000) / 1_000_000,
                          )
                          onChange(line.lineNumber, { quantity: String(next) })
                        }}
                      />
                    </div>
                    <Select
                      value={line.unitCode}
                      onChange={(unitCode) => onChange(line.lineNumber, { unitCode })}
                      options={unitOptions(line.kind, t, line.unitCode)}
                      disabled={off}
                      ariaLabel={`${t('salesNote.lines.unit')} · ${name(line)}`}
                    />
                    <div className={`${SHELL} gap-1`}>
                      <input
                        value={line.discountValue}
                        disabled={off}
                        inputMode="decimal"
                        onFocus={selectAllOnFocus}
                        onChange={(event) =>
                          onChange(line.lineNumber, {
                            discountValue: event.target.value.replace(/[^\d.]/g, ''),
                          })
                        }
                        aria-label={`${t('salesNote.lines.discount')} · ${name(line)}`}
                        className={`${INPUT} text-end tabular-nums`}
                      />
                      <span className="text-xs font-semibold text-text-quaternary">
                        {line.discountType === 'PERCENTAGE' ? (
                          '%'
                        ) : currency === 'OMR' ? (
                          <Rial />
                        ) : (
                          currency
                        )}
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
                  {/* PINT-OM: the product's HS code or the service's type, by name; consumers are not asked. */}
                  {classified && !off ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 ps-1">
                      <span className="w-[96px] shrink-0 text-xs font-medium text-text-tertiary">
                        {classificationLabel}
                      </span>
                      <div className="w-full max-w-[420px]">
                        <ClassificationField
                          kind={line.kind}
                          value={line.classification ?? ''}
                          onChange={(classification) =>
                            onChange(line.lineNumber, { classification })
                          }
                          ariaLabel={`${classificationLabel} · ${name(line)}`}
                        />
                      </div>
                    </div>
                  ) : null}
                  {/* Why an added line carries no VAT: its own row, as on the invoice composer. */}
                  {!line.fromInvoice &&
                  !off &&
                  taxCategories?.length &&
                  (CODED_REASON.has(line.taxCategory.en16931Category) ||
                    NEEDS_EXEMPTION_REASON.has(line.taxCategory.en16931Category)) ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 ps-1">
                      <span className="shrink-0 text-xs font-medium text-text-tertiary">
                        {t('invoiceDraft.exemptionReason')}
                        {reasonRequired(line.taxCategory.en16931Category) ? (
                          <span className="ms-0.5 text-danger-700">*</span>
                        ) : null}
                      </span>
                      <div className="w-full max-w-[560px]">
                        {CODED_REASON.has(line.taxCategory.en16931Category) ? (
                          <Select
                            value={line.taxCategory.exemptionReasonCode ?? ''}
                            onChange={(exemptionReasonCode) =>
                              onChange(line.lineNumber, {
                                taxCategory: { ...line.taxCategory, exemptionReasonCode },
                              })
                            }
                            options={(taxReasonsFor(line.taxCategory.en16931Category) ?? []).map(
                              (reason) => ({
                                value: reason.code,
                                label: nameOf(reason, i18n.language),
                                hint: reason.code,
                              }),
                            )}
                            placeholder={t('invoiceDraft.exemptionReasonChoose')}
                            ariaLabel={`${t('invoiceDraft.exemptionReason')} · ${name(line)}`}
                          />
                        ) : (
                          <div className={SHELL}>
                            <input
                              value={line.taxCategory.exemptionReason ?? ''}
                              onChange={(event) =>
                                onChange(line.lineNumber, {
                                  taxCategory: {
                                    ...line.taxCategory,
                                    exemptionReason: event.target.value,
                                  },
                                })
                              }
                              maxLength={500}
                              placeholder={t('invoiceDraft.exemptionReasonType')}
                              aria-label={`${t('invoiceDraft.exemptionReason')} · ${name(line)}`}
                              className={INPUT}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
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
