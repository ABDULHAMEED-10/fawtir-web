import { useState, type ReactNode } from 'react'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { useTranslation } from 'react-i18next'
import { Select, type SelectOption } from '../../components/ui'
import {
  ClassificationField,
  convertLinePrices,
  unitOptions,
  type useLineTotals,
} from '../../components/invoice'
import { formatAtScale } from '../../lib/invoiceMath'
import {
  blankComposerLine,
  defaultUnitFor,
  lineTaxCode,
  normalisePrice,
  type ComposerLine,
  type LineKind,
} from '../../lib/selfBillCreate'
import { CODED_REASON, NEEDS_EXEMPTION_REASON, reasonRequired } from '../../lib/invoiceDraft'
import { taxReasonsFor } from '../../lib/codeLists/taxReasons'
import { nameOf } from '../../lib/codeLists/codeList'
import type { TaxCategoryDto } from '../../api/reference/referenceData'
import deleteLineIcon from '../../assets/create-invoice/delete.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * The line table the self-billed invoice draws (Figma 154:161180), under the client's composer
 * rules of 25 Sep 2026:
 *
 * - no product code, the description is free text;
 * - each line is goods or a service, and the unit's choices follow that (the invoice draft's
 *   UN/ECE lists, "Other" last);
 * - the price is ex-VAT, three decimals, never negative, 0 by default;
 * - each line picks its own tax category (the header's "Default tax category" sets new lines), and a
 *   zero-rated, exempt or other no-VAT line shows its own reason row (handbook 3.2);
 * - a goods line carries an HS code, a service line a service type (docs/backend-guides/INCOME.md (part C)),
 *   searched by name through the shared `ClassificationField`; a self-billed invoice is always
 *   business-to-business, so every line is asked;
 * - nothing opens a dialog.
 *
 * It sits beside `components/invoice/LineItemsTable` rather than replacing it: that table is the
 * invoice composer's own and carries a catalogue picker, which this screen is told not to have. The
 * arithmetic is the same engine (`useLineTotals`).
 */

export type { ComposerLine, LineKind } from '../../lib/selfBillCreate'

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
  taxCategories,
  defaultTax,
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
  /** The platform's active tax categories, offered on every line. */
  taxCategories: TaxCategoryDto[]
  /** The header's default category: new lines take it, and a line without its own shows it. */
  defaultTax: string
  /** Lines that come from somewhere else are shown, not edited. */
  readOnly?: boolean
  minLines?: number
  footer?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const [nextId, setNextId] = useState(lines.length + 1)

  const categoryOf = (code: string) =>
    taxCategories.find((category) => category.code === code) ?? taxCategories[0]
  const taxName = (code: string) =>
    t(`createInvoice.taxCategories.${code}`, {
      defaultValue: t(`reference.taxCategory.${code}`, { defaultValue: code }),
    })
  // The closed field reads "5% S" in a narrow column; the list names each category in full.
  const taxOptions: SelectOption[] = taxCategories.map((category) => ({
    value: category.code,
    label: taxName(category.code),
    shortLabel: `${Number(category.rate)}% ${category.en16931Category}`,
  }))

  /** One line's category; its no-VAT reason belonged to the old category, so it is cleared. */
  const setLineTax = (line: ComposerLine, code: string) => {
    const tax = categoryOf(code)
    if (!tax || tax.code === lineTaxCode(line, defaultTax)) return
    update(line.id, {
      taxCode: tax.code,
      vatRate: String(Number(tax.rate)),
      exemptionReasonCode: '',
      exemptionReason: '',
    })
  }

  const update = (id: string, patch: Partial<ComposerLine>) =>
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)))

  const remove = (id: string) =>
    onChange(lines.length > minLines ? lines.filter((line) => line.id !== id) : lines)

  const add = () => {
    const tax = categoryOf(defaultTax)
    onChange([
      ...lines,
      blankComposerLine(String(nextId), tax ? String(Number(tax.rate)) : '5', tax?.code),
    ])
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
              const goods = row.kind === 'goods'
              const taxCode = lineTaxCode(row, defaultTax)
              const category = categoryOf(taxCode)?.en16931Category ?? 'S'
              const coded = CODED_REASON.has(category)
              const needsReason = coded || NEEDS_EXEMPTION_REASON.has(category)
              return (
                <div key={row.id} className="flex flex-col gap-2">
                  <div className="grid grid-cols-[2fr_0.55fr_0.5fr_0.6fr_0.55fr_0.55fr_0.7fr] items-start gap-2">
                    <div className="flex flex-col gap-1.5">
                      <FieldShell readOnly={readOnly}>
                        <input
                          value={row.description}
                          disabled={readOnly}
                          onChange={(event) => update(row.id, { description: event.target.value })}
                          maxLength={1000}
                          placeholder={t('lineComposer.descriptionPlaceholder')}
                          aria-label={`${t('lineComposer.col.description')} ${index + 1}`}
                          className={INPUT}
                        />
                        <KindToggle
                          value={row.kind}
                          disabled={readOnly}
                          label={`${t('lineComposer.col.description')} ${index + 1}: ${t('lineComposer.kindLabel')}`}
                          onChange={(kind) =>
                            update(row.id, {
                              kind,
                              unit: defaultUnitFor(kind),
                              hsCode: undefined,
                              serviceType: undefined,
                            })
                          }
                        />
                      </FieldShell>
                      {/* PINT-OM: the product's HS code or the service's type, searched by name; every self-bill is B2B. */}
                      <ClassificationField
                        kind={row.kind}
                        compact
                        disabled={readOnly}
                        value={(goods ? row.hsCode : row.serviceType) ?? ''}
                        onChange={(code) =>
                          update(row.id, goods ? { hsCode: code } : { serviceType: code })
                        }
                        ariaLabel={`${t(goods ? 'classification.hsCode' : 'classification.serviceType')} ${index + 1}`}
                      />
                    </div>
                    <FieldShell readOnly={readOnly}>
                      <input
                        value={row.unitPrice}
                        disabled={readOnly}
                        onChange={(event) => update(row.id, { unitPrice: event.target.value })}
                        onBlur={(event) =>
                          update(row.id, { unitPrice: normalisePrice(event.target.value) })
                        }
                        inputMode="decimal"
                        onFocus={selectAllOnFocus}
                        aria-label={`${t(exclVat ? 'lineComposer.col.excl' : 'lineComposer.col.incl')} ${index + 1}`}
                        className={INPUT}
                      />
                    </FieldShell>
                    {/* Each line takes its own category, so one document can mix standard-rated and
                      zero-rated or exempt lines; the header sets the default for new lines. */}
                    <Select
                      value={taxCode}
                      disabled={readOnly}
                      onChange={(code) => setLineTax(row, code)}
                      options={taxOptions}
                      panelWidth={240}
                      tight
                      ariaLabel={`${t('lineComposer.col.vat')} ${index + 1}`}
                    />
                    <FieldShell readOnly={readOnly}>
                      <input
                        value={row.quantity}
                        disabled={readOnly}
                        onChange={(event) => update(row.id, { quantity: event.target.value })}
                        inputMode="decimal"
                        onFocus={selectAllOnFocus}
                        aria-label={`${t('lineComposer.col.qty')} ${index + 1}`}
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
                            <img
                              src={chevronIcon}
                              alt=""
                              className="size-3 -rotate-90 opacity-70"
                            />
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
                      options={unitOptions(row.kind, t, row.unit)}
                      ariaLabel={`${t('lineComposer.col.unit')} ${index + 1}`}
                    />
                    <FieldShell readOnly={readOnly}>
                      <input
                        value={row.discountValue}
                        disabled={readOnly}
                        onChange={(event) => update(row.id, { discountValue: event.target.value })}
                        inputMode="decimal"
                        onFocus={selectAllOnFocus}
                        aria-label={`${t('lineComposer.col.discount')} ${index + 1}`}
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
                          aria-label={`${t('lineComposer.remove')} ${index + 1}`}
                        >
                          <img src={deleteLineIcon} alt="" className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Why this line carries no VAT: its own row, wide enough to read the reason. */}
                  {needsReason ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 ps-1">
                      <span className="text-xs font-medium text-text-tertiary">
                        {t('invoiceDraft.exemptionReason')}
                        {reasonRequired(category) ? (
                          <span className="ms-0.5 text-danger-700">*</span>
                        ) : null}
                      </span>
                      <div className="w-full max-w-[560px]">
                        {coded ? (
                          <Select
                            value={row.exemptionReasonCode ?? ''}
                            disabled={readOnly}
                            onChange={(exemptionReasonCode) =>
                              update(row.id, { taxCode, exemptionReasonCode })
                            }
                            options={(taxReasonsFor(category) ?? []).map((reason) => ({
                              value: reason.code,
                              label: nameOf(reason, i18n.language),
                              hint: reason.code,
                            }))}
                            placeholder={t('invoiceDraft.exemptionReasonChoose')}
                            ariaLabel={`${t('invoiceDraft.exemptionReason')} ${index + 1}`}
                          />
                        ) : (
                          <FieldShell readOnly={readOnly}>
                            <input
                              value={row.exemptionReason ?? ''}
                              disabled={readOnly}
                              onChange={(event) =>
                                update(row.id, { taxCode, exemptionReason: event.target.value })
                              }
                              maxLength={500}
                              placeholder={t('invoiceDraft.exemptionReasonType')}
                              aria-label={`${t('invoiceDraft.exemptionReason')} ${index + 1}`}
                              className={INPUT}
                            />
                          </FieldShell>
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
