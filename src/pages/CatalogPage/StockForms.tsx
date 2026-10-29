import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Combobox,
  DateField,
  Input,
  Modal,
  Rial,
  Select,
  type SelectOption,
} from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { planIncludes } from '../../lib/planAccess'
import { describeApiFailure } from '../../lib/apiFailure'
import { muscatToday } from '../../lib/invoiceIssue'
import type { Page } from '../../api'
import {
  STOCK_ADJUST,
  STOCK_MANAGE,
  STOCK_READ,
  WRITE_OFF_REASONS,
  loadStockPage,
  newStockKey,
  postStockCount,
  postStockDelivery,
  postStockWriteOff,
  putReorderLevel,
  putReorderLevels,
  stockListPath,
  type StockAdjustmentResponse,
  type StockRowDto,
  type WriteOffReason,
} from '../../api/stock/stock'
import {
  loadSupplierPage,
  supplierListPath,
  type SupplierListRowDto,
} from '../../api/expenditure/suppliers'
import {
  quantityText,
  readQuantity,
  stockItemName,
  stockKey,
  stockRefusalKey,
  stockUnitName,
} from '../../lib/catalogStock'
import tickIcon from '../../assets/catalog/check-white.svg'

/**
 * What the session may do with stock, from the entitlement snapshot. Display only: the server
 * still decides. Counting, writing off and recording what came in need `stock.adjust`; reorder
 * levels need `stock.manage`; both also need the plan's `stock` switch (PL-8). None of them is
 * hidden while the subscription is read-only: they send nothing out (ST-2, Abdul's answer 9).
 */
export function useStockAccess(): {
  ready: boolean
  canRead: boolean
  canAdjust: boolean
  canManage: boolean
  /**
   * Holds `stock.adjust` whatever the plan: tells a reader apart from someone whose plan has the
   * `stock` switch off, so only the latter is told the plan is why nothing can be set.
   */
  holdsAdjust: boolean
} {
  const { entitlements, ready } = useEntitlements()
  if (!ready || entitlements === null) {
    return { ready, canRead: false, canAdjust: false, canManage: false, holdsAdjust: false }
  }
  const plan = planIncludes(entitlements, 'stock')
  const adjust = hasPermission(entitlements, STOCK_ADJUST)
  return {
    ready,
    canRead: hasPermission(entitlements, STOCK_READ),
    canAdjust: plan && adjust,
    canManage: plan && hasPermission(entitlements, STOCK_MANAGE),
    holdsAdjust: adjust,
  }
}

/** A failed stock write in words: the route's own refusal first, then the shared sentence. */
function useFailureText() {
  const { t } = useTranslation()
  return (error: unknown) => {
    const own = stockRefusalKey(error)
    if (own) return t(own)
    const shared = describeApiFailure(error)
    return t(shared.key, shared.values)
  }
}

const SECONDARY =
  'inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25'
const PRIMARY =
  'inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60'
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary'

function Footer({
  problem,
  busy,
  onCancel,
  onSave,
  saveLabel,
}: {
  problem: string | null
  busy: boolean
  onCancel: () => void
  onSave: () => void
  saveLabel: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        role={problem ? 'alert' : undefined}
        className="min-w-0 text-sm font-medium text-danger-700"
      >
        {problem}
      </p>
      <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
        <button type="button" onClick={onCancel} className={SECONDARY}>
          {t('stock.forms.cancel')}
        </button>
        <button type="button" onClick={onSave} disabled={busy} className={PRIMARY}>
          <img src={tickIcon} alt="" className="size-4" />
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

/** A figure field in a table cell, as the catalogue forms draw them. */
function FigureCell({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <input
      value={value}
      inputMode="decimal"
      dir="ltr"
      aria-label={label}
      onFocus={selectAllOnFocus}
      onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ''))}
      className="h-[38px] w-[110px] rounded-sm border border-border-subtle bg-white px-3 text-end text-sm font-medium text-text-primary tabular-nums outline-none focus:border-primary-700"
    />
  )
}

function ItemCell({ row }: { row: StockRowDto }) {
  const { i18n } = useTranslation()
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-text-primary">
        {stockItemName(row, i18n.language)}
      </p>
      <p className="mt-0.5 text-xs font-medium text-text-quaternary" dir="ltr">
        {row.code}
      </p>
    </div>
  )
}

function LinesTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-border-subtle">
      <table className="w-full min-w-[480px] border-collapse">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-background/60 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/* ----------------------------------------------------------------------- count */

/**
 * Count the shelves / Correct the count: `POST /v1/stock/counts`. Each counted line writes the
 * difference against what was on hand, so sales made while counting are kept.
 */
export function StockCountModal({
  open,
  onClose,
  branchId,
  rows,
  onDone,
}: {
  open: boolean
  onClose: () => void
  branchId: string
  rows: StockRowDto[]
  onDone: (result: StockAdjustmentResponse) => void
}) {
  const { t, i18n } = useTranslation()
  const failureText = useFailureText()
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(newStockKey)

  const save = () => {
    const lines = []
    for (const row of rows) {
      const typed = counts[stockKey(row)] ?? ''
      if (typed.trim() === '') continue
      const counted = readQuantity(typed, { positive: false })
      if (counted === null) return setProblem(t('stock.forms.quantityInvalid'))
      lines.push({ productId: row.productId, variantId: row.variantId, countedQuantity: counted })
    }
    if (lines.length === 0) return setProblem(t('stock.count.nothing'))
    setBusy(true)
    setProblem(null)
    postStockCount(key, {
      branchId,
      ...(note.trim() ? { note: note.trim() } : {}),
      lines,
    }).then(
      (result) => {
        setBusy(false)
        setCounts({})
        setNote('')
        setKey(newStockKey())
        onDone(result)
      },
      (error) => {
        setBusy(false)
        setProblem(failureText(error))
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={720}
      title={rows.length === 1 ? t('stockItem.correctTheCount') : t('stock.countTheShelves')}
      subtitle={t('stock.count.subtitle')}
      footer={
        <Footer
          problem={problem}
          busy={busy}
          onCancel={onClose}
          onSave={save}
          saveLabel={t('stock.count.save')}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <LinesTable
          head={
            <>
              <th className="h-[36px] px-3 text-start font-semibold">{t('stock.col.item')}</th>
              <th className="h-[36px] px-3 text-end font-semibold">{t('stock.count.expected')}</th>
              <th className="h-[36px] px-3 text-end font-semibold">{t('stock.count.counted')}</th>
            </>
          }
        >
          {rows.map((row) => (
            <tr key={stockKey(row)} className="border-b border-surface-background last:border-0">
              <td className="max-w-[260px] px-3 py-2.5 align-middle">
                <ItemCell row={row} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-end align-middle text-sm font-medium text-text-tertiary tabular-nums">
                {row.onHand === null
                  ? t('stock.live.notCountedYet')
                  : `${quantityText(row.onHand, i18n.language)} ${stockUnitName(t, row.unitCode, i18n.language)}`}
              </td>
              <td className="px-3 py-2.5 text-end align-middle">
                <FigureCell
                  label={t('stock.count.countedOf', { name: stockItemName(row, i18n.language) })}
                  value={counts[stockKey(row)] ?? ''}
                  onChange={(value) => setCounts((all) => ({ ...all, [stockKey(row)]: value }))}
                />
              </td>
            </tr>
          ))}
        </LinesTable>
        <Input
          bordered
          label={t('stock.forms.note')}
          labelNote={t('stock.forms.optional')}
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------- write off */

/**
 * Write stock off: `POST /v1/stock/write-offs`, at the average cost. The reasons are the
 * guide's: damaged, expired, lost, stolen, own use, sample or tasting, other (with a note).
 */
export function StockWriteOffModal({
  open,
  onClose,
  branchId,
  rows,
  onDone,
}: {
  open: boolean
  onClose: () => void
  branchId: string
  rows: StockRowDto[]
  onDone: (result: StockAdjustmentResponse) => void
}) {
  const { t, i18n } = useTranslation()
  const failureText = useFailureText()
  const [reason, setReason] = useState<WriteOffReason>('DAMAGED')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(newStockKey)

  const save = () => {
    const lines = []
    for (const row of rows) {
      const typed = quantities[stockKey(row)] ?? ''
      if (typed.trim() === '') continue
      const quantity = readQuantity(typed, { positive: true })
      if (quantity === null) return setProblem(t('stock.forms.quantityInvalid'))
      lines.push({ productId: row.productId, variantId: row.variantId, quantity })
    }
    if (lines.length === 0) return setProblem(t('stock.writeOff.nothing'))
    if (reason === 'OTHER' && note.trim() === '') return setProblem(t('stock.refused.noteRequired'))
    setBusy(true)
    setProblem(null)
    postStockWriteOff(key, {
      branchId,
      reasonCode: reason,
      ...(note.trim() ? { note: note.trim() } : {}),
      lines,
    }).then(
      (result) => {
        setBusy(false)
        setQuantities({})
        setNote('')
        setKey(newStockKey())
        onDone(result)
      },
      (error) => {
        setBusy(false)
        setProblem(failureText(error))
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={720}
      title={t('stock.writeStockOff')}
      subtitle={t('stock.writeOff.subtitle')}
      footer={
        <Footer
          problem={problem}
          busy={busy}
          onCancel={onClose}
          onSave={save}
          saveLabel={t('stock.writeOff.save')}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t('stock.writeOff.reason')}
            </span>
            <Select
              quiet
              ariaLabel={t('stock.writeOff.reason')}
              value={reason}
              onChange={(value) => setReason(value as WriteOffReason)}
              options={WRITE_OFF_REASONS.map((code) => ({
                value: code,
                label: t(`stock.writeOff.reasons.${code}`),
              }))}
            />
          </label>
          <Input
            bordered
            label={t('stock.forms.note')}
            labelNote={reason === 'OTHER' ? undefined : t('stock.forms.optional')}
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <LinesTable
          head={
            <>
              <th className="h-[36px] px-3 text-start font-semibold">{t('stock.col.item')}</th>
              <th className="h-[36px] px-3 text-end font-semibold">{t('stock.col.onHand')}</th>
              <th className="h-[36px] px-3 text-end font-semibold">
                {t('stock.writeOff.quantity')}
              </th>
            </>
          }
        >
          {rows.map((row) => (
            <tr key={stockKey(row)} className="border-b border-surface-background last:border-0">
              <td className="max-w-[260px] px-3 py-2.5 align-middle">
                <ItemCell row={row} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-end align-middle text-sm font-medium text-text-tertiary tabular-nums">
                {row.onHand === null
                  ? t('stock.live.notCountedYet')
                  : `${quantityText(row.onHand, i18n.language)} ${stockUnitName(t, row.unitCode, i18n.language)}`}
              </td>
              <td className="px-3 py-2.5 text-end align-middle">
                <FigureCell
                  label={t('stock.writeOff.quantityOf', {
                    name: stockItemName(row, i18n.language),
                  })}
                  value={quantities[stockKey(row)] ?? ''}
                  onChange={(value) => setQuantities((all) => ({ ...all, [stockKey(row)]: value }))}
                />
              </td>
            </tr>
          ))}
        </LinesTable>
        <p className="text-xs font-medium text-text-quaternary">{t('stock.writeOff.atCost')}</p>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------- what came in */

type DeliveryLine = { id: number; row: StockRowDto | null; quantity: string; unitCost: string }

const SEARCH_DELAY_MS = 250

/** A typed search that waits for a pause, then names the request. */
function useDelayedSearch(): [string | null, (typed: string) => void] {
  const [typed, setTyped] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  useEffect(() => {
    if (typed === null) return
    const timer = window.setTimeout(() => setQuery(typed), typed === '' ? 0 : SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])
  return [query, setTyped]
}

function SupplierPick({
  value,
  onChange,
}: {
  value: SupplierListRowDto | null
  onChange: (supplier: SupplierListRowDto | null) => void
}) {
  const { t } = useTranslation()
  const [query, search] = useDelayedSearch()
  const path =
    query === null
      ? null
      : supplierListPath({ filter: 'ACTIVE', q: query, sort: 'NAME', page: 0, pageSize: 20 })
  const found = useApiRead<Page<SupplierListRowDto>>(path, () => loadSupplierPage(path!))
  const suppliers = useMemo(
    () => (found.read.status === 'ready' ? found.read.data.items : []),
    [found.read],
  )
  const options: SelectOption[] = [
    ...(value && !suppliers.some((s) => s.id === value.id)
      ? [{ value: value.id, label: value.displayName }]
      : []),
    ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.displayName })),
  ]
  return (
    <Combobox
      value={value?.id ?? ''}
      onChange={(id) => onChange(suppliers.find((s) => s.id === id) ?? value)}
      options={options}
      onSearch={search}
      ariaLabel={t('stock.delivery.supplier')}
      placeholder={t('stock.delivery.pickSupplier')}
      searchPlaceholder={t('stock.delivery.searchSupplier')}
      emptyText={
        found.read.status === 'failed'
          ? t(describeApiFailure(found.read.error).key)
          : found.read.status === 'loading' || query === null
            ? t('productPicker.searching')
            : t('productPicker.none')
      }
    />
  )
}

function StockItemPick({
  branchId,
  value,
  line,
  onChange,
}: {
  branchId: string
  value: StockRowDto | null
  line: number
  onChange: (row: StockRowDto) => void
}) {
  const { t, i18n } = useTranslation()
  const [query, search] = useDelayedSearch()
  const path = query === null ? null : stockListPath({ branchId, q: query, sort: 'NAME', size: 20 })
  const found = useApiRead<Page<StockRowDto>>(path, () => loadStockPage(path!))
  const rows = useMemo(
    () => (found.read.status === 'ready' ? found.read.data.items : []),
    [found.read],
  )
  const options: SelectOption[] = [
    ...(value && !rows.some((row) => stockKey(row) === stockKey(value))
      ? [{ value: stockKey(value), label: stockItemName(value, i18n.language) }]
      : []),
    ...rows.map((row) => ({
      value: stockKey(row),
      label: stockItemName(row, i18n.language),
      hint: row.code,
    })),
  ]
  return (
    <Combobox
      compact
      value={value ? stockKey(value) : ''}
      onChange={(id) => {
        const row = rows.find((candidate) => stockKey(candidate) === id)
        if (row) onChange(row)
      }}
      options={options}
      onSearch={search}
      ariaLabel={t('stock.delivery.itemOf', { line })}
      placeholder={t('stock.delivery.pickItem')}
      searchPlaceholder={t('stock.search')}
      emptyText={
        found.read.status === 'failed'
          ? t(describeApiFailure(found.read.error).key)
          : found.read.status === 'loading' || query === null
            ? t('productPicker.searching')
            : t('productPicker.none')
      }
    />
  )
}

/**
 * Record what came in: `POST /v1/stock/deliveries`, goods in without a purchase order (supplier,
 * quantity and cost before VAT). Each line updates the weighted average cost; no bill is raised.
 */
export function StockDeliveryModal({
  open,
  onClose,
  branchId,
  initial,
  onDone,
}: {
  open: boolean
  onClose: () => void
  branchId: string
  /** Items to start the lines with (the selection), or none. */
  initial: StockRowDto[]
  onDone: (result: StockAdjustmentResponse) => void
}) {
  const { t, i18n } = useTranslation()
  const failureText = useFailureText()
  const startLines = (rows: StockRowDto[]): DeliveryLine[] =>
    (rows.length ? rows : [null]).map((row, index) => ({
      id: index,
      row,
      quantity: '',
      unitCost:
        row?.lastCost !== null && row?.lastCost !== undefined ? row.lastCost.toFixed(3) : '',
    }))
  const [supplier, setSupplier] = useState<SupplierListRowDto | null>(null)
  const [reference, setReference] = useState('')
  const [receivedOn, setReceivedOn] = useState(() => muscatToday())
  const [lines, setLines] = useState<DeliveryLine[]>(() => startLines(initial))
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(newStockKey)
  const [opened, setOpened] = useState(false)

  // A fresh opening starts from the rows it was opened with.
  if (open !== opened) {
    setOpened(open)
    if (open) setLines(startLines(initial))
  }

  const patch = (id: number, change: Partial<DeliveryLine>) =>
    setLines((all) => all.map((line) => (line.id === id ? { ...line, ...change } : line)))

  const save = () => {
    if (!supplier) return setProblem(t('stock.delivery.pickSupplier'))
    const body = []
    for (const line of lines) {
      if (!line.row) continue
      const quantity = readQuantity(line.quantity, { positive: true })
      if (quantity === null) return setProblem(t('stock.forms.quantityInvalid'))
      const unitCost = readQuantity(line.unitCost, { positive: false })
      if (unitCost === null) return setProblem(t('stock.refused.unitCostInvalid'))
      body.push({
        productId: line.row.productId,
        variantId: line.row.variantId,
        quantity,
        unitCost,
      })
    }
    if (body.length === 0) return setProblem(t('stock.delivery.pickItem'))
    setBusy(true)
    setProblem(null)
    postStockDelivery(key, {
      branchId,
      supplierId: supplier.id,
      ...(reference.trim() ? { supplierReference: reference.trim() } : {}),
      receivedOn,
      lines: body,
    }).then(
      (result) => {
        setBusy(false)
        setReference('')
        setKey(newStockKey())
        onDone(result)
      },
      (error) => {
        setBusy(false)
        setProblem(failureText(error))
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={820}
      title={t('stock.recordWhatCameIn')}
      subtitle={t('stock.delivery.subtitle')}
      footer={
        <Footer
          problem={problem}
          busy={busy}
          onCancel={onClose}
          onSave={save}
          saveLabel={t('stock.delivery.save')}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 md:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t('stock.delivery.supplier')}
            </span>
            <SupplierPick value={supplier} onChange={setSupplier} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t('stock.delivery.receivedOn')}
            </span>
            <DateField
              ariaLabel={t('stock.delivery.receivedOn')}
              value={receivedOn}
              max={muscatToday()}
              onChange={setReceivedOn}
            />
          </label>
          <Input
            bordered
            label={t('stock.delivery.reference')}
            labelNote={t('stock.forms.optional')}
            value={reference}
            dir="ltr"
            maxLength={100}
            onChange={(event) => setReference(event.target.value)}
          />
        </div>
        <div>
          <p className={LABEL}>{t('stock.delivery.whatCameIn')}</p>
          <div className="mt-2">
            <LinesTable
              head={
                <>
                  <th className="h-[36px] px-3 text-start font-semibold">{t('stock.col.item')}</th>
                  <th className="h-[36px] px-3 text-end font-semibold">
                    {t('stock.delivery.quantity')}
                  </th>
                  <th className="h-[36px] px-3 text-end font-semibold">
                    {t('stock.delivery.unitCost')}
                  </th>
                  <th className="h-[36px] w-[40px] px-3" />
                </>
              }
            >
              {lines.map((line, index) => (
                <tr key={line.id} className="border-b border-surface-background last:border-0">
                  <td className="min-w-[220px] px-3 py-2.5 align-middle">
                    <StockItemPick
                      branchId={branchId}
                      value={line.row}
                      line={index + 1}
                      onChange={(row) =>
                        patch(line.id, {
                          row,
                          unitCost:
                            line.unitCost || row.lastCost === null
                              ? line.unitCost
                              : row.lastCost.toFixed(3),
                        })
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-end align-middle">
                    <FigureCell
                      label={t('stock.delivery.quantityOf', { line: index + 1 })}
                      value={line.quantity}
                      onChange={(value) => patch(line.id, { quantity: value })}
                    />
                    {line.row ? (
                      <p className="mt-1 text-xs font-medium text-text-quaternary">
                        {stockUnitName(t, line.row.unitCode, i18n.language)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-end align-middle">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-sm font-medium text-text-quaternary">
                        <Rial />
                      </span>
                      <FigureCell
                        label={t('stock.delivery.unitCostOf', { line: index + 1 })}
                        value={line.unitCost}
                        onChange={(value) => patch(line.id, { unitCost: value })}
                      />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-end align-middle">
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setLines((all) => all.filter((x) => x.id !== line.id))}
                        className="text-sm font-semibold text-danger-700 hover:underline"
                      >
                        {t('stock.delivery.remove')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </LinesTable>
          </div>
          <button
            type="button"
            onClick={() =>
              setLines((all) => [
                ...all,
                {
                  id: Math.max(0, ...all.map((x) => x.id)) + 1,
                  row: null,
                  quantity: '',
                  unitCost: '',
                },
              ])
            }
            className="mt-3 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
          >
            {t('stock.delivery.addLine')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- reorder level */

/**
 * Change the reorder level: one item with `PUT .../reorder-level` (with its version), several
 * with `PUT /v1/stock/reorder-levels`. An empty level clears it.
 */
export function StockReorderModal({
  open,
  onClose,
  branchId,
  rows,
  suggested,
  onDone,
}: {
  open: boolean
  onClose: () => void
  branchId: string
  rows: StockRowDto[]
  /** The level to start the field at, such as the safer one the item page works out. */
  suggested?: number | null
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const failureText = useFailureText()
  const single = rows.length === 1 ? rows[0] : null
  const [level, setLevel] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(false)
  if (open !== opened) {
    setOpened(open)
    if (open) {
      const start = suggested ?? single?.reorderLevel ?? null
      setLevel(start === null ? '' : String(start))
      setProblem(null)
    }
  }

  const save = () => {
    let reorderLevel: number | null = null
    if (level.trim() !== '') {
      reorderLevel = readQuantity(level, { positive: false })
      if (reorderLevel === null) return setProblem(t('stock.refused.reorderLevelInvalid'))
    }
    setBusy(true)
    setProblem(null)
    const request = single
      ? putReorderLevel(single.productId, branchId, single.variantId, {
          reorderLevel,
          expectedVersion: single.version,
        })
      : putReorderLevels({
          branchId,
          items: rows.map((row) => ({
            productId: row.productId,
            variantId: row.variantId,
            reorderLevel,
          })),
        })
    request.then(
      () => {
        setBusy(false)
        onDone()
      },
      (error) => {
        setBusy(false)
        setProblem(failureText(error))
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title={
        single ? t('stock.changeReorder') : t('stock.reorder.titleMany', { count: rows.length })
      }
      subtitle={single ? stockItemName(single, i18n.language) : undefined}
      footer={
        <Footer
          problem={problem}
          busy={busy}
          onCancel={onClose}
          onSave={save}
          saveLabel={t('stock.reorder.save')}
        />
      }
    >
      <Input
        bordered
        label={t('stockItem.warnMeAt')}
        value={level}
        inputMode="decimal"
        dir="ltr"
        hint={t('stock.reorder.hint')}
        onFocus={selectAllOnFocus}
        onChange={(event) => setLevel(event.target.value.replace(/[^\d.]/g, ''))}
        trailingIcon={
          single ? (
            <span className="text-sm font-medium text-text-quaternary">
              {stockUnitName(t, single.unitCode, i18n.language)}
            </span>
          ) : undefined
        }
      />
    </Modal>
  )
}
