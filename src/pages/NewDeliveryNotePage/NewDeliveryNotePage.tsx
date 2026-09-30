import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ChoiceCards,
  Field,
  FieldLabel,
  FormFooter,
  NotesAndAttachments,
  SectionCard,
} from '../../components/trade/TradeFormKit'
import { NEW_DELIVERY_NOTE, NEW_PURCHASE_RECEIPT } from '../../lib/tradeCreate'
import { orderProgress, overDeliveredLines } from '../../lib/tradeLedger'
import { ORDER_ROWS } from '../../lib/orderForms'
import { selectAllOnFocus } from '../../components/invoice'
import { useTradeNotice } from '../../components/trade/TradeNotice'
import backIcon from '../../assets/trade-create/back.svg'
import noteTextIcon from '../../assets/trade-create/note-text.svg'
import linkIcon from '../../assets/trade-create/link.svg'
import printIcon from '../../assets/trade-create/print.svg'
import uploadIcon from '../../assets/trade-create/upload.svg'
import warningIcon from '../../assets/trade-create/warning.svg'
import warningRedIcon from '../../assets/trade-create/warning-red.svg'
import tickIcon from '../../assets/trade-create/tick.svg'
import tickCircleIcon from '../../assets/trade-create/tick-circle.svg'
import plusIcon from '../../assets/trade-create/plus.svg'
import arrowNextIcon from '../../assets/trade-create/arrow-next.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import modeSalesIcon from '../../assets/order-forms-v2/mode-sales.svg'
import modePurchaseIcon from '../../assets/order-forms-v2/mode-purchase.svg'

type NoteMode = 'sales' | 'purchase'

function ModePicker({ mode, onChange }: { mode: NoteMode; onChange: (m: NoteMode) => void }) {
  const { t } = useTranslation()
  const options: { id: NoteMode; titleKey: string; hintKey: string; icon: string }[] = [
    {
      id: 'sales',
      titleKey: 'tradeCreate.deliveryNote.modeSales',
      hintKey: 'tradeCreate.deliveryNote.modeSalesHint',
      icon: modeSalesIcon,
    },
    {
      id: 'purchase',
      titleKey: 'tradeCreate.deliveryNote.modePurchase',
      hintKey: 'tradeCreate.deliveryNote.modePurchaseHint',
      icon: modePurchaseIcon,
    },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map((option) => {
        const active = option.id === mode
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={[
              'flex items-center justify-between gap-2 rounded-sm px-4 py-3 text-start transition-colors',
              active
                ? 'border-2 border-[#5671c5] bg-[#eaedf8]'
                : 'border border-[#e8e8ea] bg-white',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <img src={option.icon} alt="" className="size-6 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base font-medium leading-[1.2] text-[#151c2d]">
                  {t(option.titleKey)}
                </span>
                <span className="mt-1 truncate text-xs font-medium leading-[1.2] text-[#444957]">
                  {t(option.hintKey)}
                </span>
              </span>
            </span>
            {active ? <img src={tickCircleIcon} alt="" className="size-5 shrink-0" /> : null}
          </button>
        )
      })}
    </div>
  )
}

/** "Against which order" — or go standalone and match it to an invoice later. */
function AgainstOrder({
  title,
  meta,
  standaloneKey,
  onUnavailable,
}: {
  title: string
  meta: string
  standaloneKey: string
  onUnavailable: () => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#d5dcf1] bg-[#f4f6fb]/60 p-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
            <img src={noteTextIcon} alt="" className="size-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
              {title}
            </span>
            <span className="mt-1 block text-xs font-medium leading-[1.2] text-[#5b606c]">
              {meta}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={onUnavailable}
          className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#444957]"
        >
          {t('tradeCreate.change')}
          <img src={chevronIcon} alt="" className="size-5 rotate-90" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-sm bg-[#fafafa] px-3 py-2.5">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#5b606c]">
          <img src={linkIcon} alt="" className="size-5" />
          {t(standaloneKey)}
        </span>
        <button
          type="button"
          onClick={onUnavailable}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#233e92]"
        >
          {t('tradeCreate.goStandalone')}
          <img src={arrowNextIcon} alt="" className="size-4 rtl:rotate-180" />
        </button>
      </div>
    </>
  )
}

function SummaryRail({
  titleKey,
  rows,
  effectLabel,
  beforePct,
  afterPct,
  percent,
  note,
}: {
  titleKey: string
  rows: { label: string; value: string; alert?: boolean }[]
  effectLabel: string
  beforePct: string
  afterPct: string
  percent: number
  note: string
}) {
  const { t } = useTranslation()

  return (
    <section className="rounded-sm bg-surface-card p-4">
      <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">{t(titleKey)}</h2>
      <div className="mt-3 h-px w-full bg-border-subtle" />
      <dl className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="text-sm font-medium leading-[1.2] text-[#5b606c]">{row.label}</dt>
            <dd
              className={[
                'text-sm font-semibold leading-[1.2]',
                row.alert ? 'text-[#98140b]' : 'text-[#2c3342]',
              ].join(' ')}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#737781]">
        {effectLabel}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-2xl font-semibold leading-[1.2] text-[#2c3342]">{beforePct}</span>
        <img src={arrowNextIcon} alt="" className="size-4 rtl:rotate-180" />
        <span className="text-2xl font-semibold leading-[1.2] text-[#2c3342]">{afterPct}</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#e6efea]">
        <span className="block h-full rounded-full bg-[#3d5648]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2.5 text-sm font-medium leading-[1.3] text-[#444957]">{note}</p>
    </section>
  )
}

/** What the sales form is shipping: quantities per order line, and which lines are ticked. */
type Shipment = { qty: Record<number, string>; checked: Record<number, boolean> }

/** The quantities that actually go out: unticked lines ship nothing. */
function shippedQty(shipment: Shipment): Record<number, number> {
  return Object.fromEntries(
    Object.entries(shipment.qty).map(([lineNo, value]) => [
      Number(lineNo),
      shipment.checked[Number(lineNo)] ? Number(value) || 0 : 0,
    ]),
  )
}

/** Short names for the summary rail, as the design printed them. */
const shortName = (description: string) => description.split(',')[0]

function SalesDeliveryForm({
  orderId,
  shipment,
  setShipment,
  onUnavailable,
}: {
  orderId: string
  shipment: Shipment
  setShipment: (next: Shipment) => void
  onUnavailable: () => void
}) {
  const { t } = useTranslation()
  const doc = NEW_DELIVERY_NOTE
  const [proof, setProof] = useState('signature')
  // The order's lines and what each still owes come from the quantity ledger; an order the ledger
  // does not hold has no lines here yet (TRADE_DOCUMENTS.md row T.13).
  const progress = orderProgress(orderId)
  const row = ORDER_ROWS.find((candidate) => candidate.id === orderId)
  const party = progress?.order.party ?? row?.party ?? ''
  const shipped = shippedQty(shipment)
  const over = progress ? overDeliveredLines(orderId, shipped) : []
  const firstOver = progress?.lines.find((line) => over.includes(line.lineNo))
  const value = (qty: Record<number, number>) =>
    (progress?.lines ?? []).reduce(
      (total, line) => total + (qty[line.lineNo] ?? 0) * line.unitPrice,
      0,
    )
  const pct = (amount: number) =>
    progress && progress.net > 0 ? Math.min(100, Math.round((amount / progress.net) * 100)) : 0
  const afterPct = pct((progress?.deliveredValue ?? 0) + value(shipped))
  const outstanding = (progress?.lines ?? [])
    .map((line) => ({ line, left: line.toDeliver - (shipped[line.lineNo] ?? 0) }))
    .filter((entry) => entry.left > 0)
    .map((entry) => `${entry.left} ${entry.line.unitLabel} ${shortName(entry.line.description)}`)

  const setQty = (lineNo: number, value: string) =>
    setShipment({ ...shipment, qty: { ...shipment.qty, [lineNo]: value } })
  const toggle = (lineNo: number) =>
    setShipment({
      ...shipment,
      checked: { ...shipment.checked, [lineNo]: !shipment.checked[lineNo] },
    })
  const fillAllRemaining = () => {
    if (!progress) return
    setShipment({
      qty: Object.fromEntries(progress.lines.map((line) => [line.lineNo, String(line.toDeliver)])),
      checked: Object.fromEntries(progress.lines.map((line) => [line.lineNo, line.toDeliver > 0])),
    })
  }

  return (
    <>
      <div className="grid items-start gap-4 xl:grid-cols-[1fr_332px]">
        <SectionCard step={1} title={t('tradeCreate.deliveryNote.againstTitle')}>
          <AgainstOrder
            title={`${orderId} · ${party}`}
            meta={
              progress
                ? t('tradeCreate.deliveryNote.againstMetaPct', { pct: progress.deliveredPct })
                : t('tradeDocs.notRecorded')
            }
            standaloneKey="tradeCreate.deliveryNote.noOrder"
            onUnavailable={onUnavailable}
          />
        </SectionCard>
        <SummaryRail
          titleKey={doc.summary.titleKey}
          rows={(progress?.lines ?? [])
            .filter((line) => (shipped[line.lineNo] ?? 0) > 0)
            .map((line) => ({
              label: shortName(line.description),
              value: `${shipped[line.lineNo]} ${line.unitLabel}`,
              alert: over.includes(line.lineNo),
            }))}
          effectLabel={t('tradeCreate.deliveryNote.effectOnOrder', { id: orderId })}
          beforePct={`${progress?.deliveredPct ?? 0}%`}
          afterPct={`${afterPct}%`}
          percent={afterPct}
          note={
            outstanding.length > 0
              ? t('tradeCreate.deliveryNote.stillOutstanding', { list: outstanding.join(', ') })
              : t('tradeCreate.deliveryNote.nothingOutstanding')
          }
        />
      </div>

      <SectionCard
        step={2}
        title={t('tradeCreate.deliveryNote.whatsGoingOut')}
        hint={t('tradeCreate.deliveryNote.quantitiesOnly')}
        action={
          <button
            type="button"
            onClick={fillAllRemaining}
            className="text-sm font-semibold text-[#233e92]"
          >
            {t('tradeCreate.deliveryNote.fillAllRemaining')}
          </button>
        }
      >
        <div className="grid grid-cols-[1fr_140px_160px] max-md:grid-cols-[1fr_84px_96px] max-md:gap-2 gap-3 border-b border-[#f3f3f3] pb-2 text-xs font-semibold uppercase tracking-[0.02em] text-[#5b606c]">
          <span>{t('tradeCreate.cols.item')}</span>
          <span>{t('tradeCreate.deliveryNote.remaining')}</span>
          <span>{t('tradeCreate.deliveryNote.shippingNow')}</span>
        </div>
        {progress === null ? (
          <p className="py-4 text-sm font-medium text-[#5b606c]">
            {t('tradeDocs.notAvailableShort')}
          </p>
        ) : null}
        {(progress?.lines ?? []).map((line) => {
          const qty = shipped[line.lineNo] ?? 0
          const isOver = over.includes(line.lineNo)
          const hint =
            !shipment.checked[line.lineNo] || qty === 0
              ? { text: t('tradeCreate.deliveryNote.notOnThisDrop'), tone: 'muted' }
              : isOver
                ? {
                    text: t('tradeCreate.deliveryNote.moreThanOrderedCount', {
                      count: qty - line.toDeliver,
                    }),
                    tone: 'warn',
                  }
                : qty < line.toDeliver
                  ? {
                      text: t('tradeCreate.deliveryNote.shipAllCount', { count: line.toDeliver }),
                      tone: 'link',
                    }
                  : { text: t('tradeCreate.deliveryNote.shipsTheRest'), tone: 'muted' }
          return (
            <div key={line.lineNo}>
              <div className="grid grid-cols-[1fr_140px_160px] max-md:grid-cols-[1fr_84px_96px] max-md:gap-2 items-start gap-3 border-b border-[#f3f3f3] py-4">
                <label className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(shipment.checked[line.lineNo])}
                    onChange={() => toggle(line.lineNo)}
                    className="mt-1 size-5 shrink-0 rounded-[4px] accent-[#2c4eb7]"
                  />
                  <span className="min-w-0">
                    <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
                      {line.description}
                    </span>
                    <span className="mt-1 block text-sm font-medium leading-[1.2] text-[#5b606c]">
                      {t('tradeCreate.deliveryNote.lineMeta', {
                        ordered: `${line.ordered} ${line.unitLabel}`,
                        delivered: line.delivered,
                      })}
                    </span>
                  </span>
                </label>
                <div>
                  <p className="text-base font-semibold leading-[1.2] text-[#2c3342]">
                    {line.toDeliver} {line.unitLabel}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-[1.2] text-[#737781]">
                    {t('tradeCreate.deliveryNote.stillOwed')}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      inputMode="numeric"
                      value={shipment.qty[line.lineNo] ?? '0'}
                      onFocus={selectAllOnFocus}
                      onChange={(event) =>
                        setQty(line.lineNo, event.target.value.replace(/[^0-9]/g, ''))
                      }
                      aria-label={t('tradeCreate.deliveryNote.shippingNow')}
                      className={[
                        'flex h-[42px] w-[62px] items-center justify-center rounded-sm border bg-surface-tab-bar text-center text-sm font-medium text-text-secondary outline-none',
                        isOver ? 'border-[#b99a66]' : 'border-primary-300',
                      ].join(' ')}
                    />
                    <span className="text-sm font-medium text-[#5b606c]">{line.unitLabel}</span>
                  </div>
                  <p
                    className={[
                      'mt-1 text-xs font-medium leading-[1.2]',
                      hint.tone === 'link'
                        ? 'text-[#233e92]'
                        : hint.tone === 'warn'
                          ? 'text-[#6d5a39]'
                          : 'text-[#737781]',
                    ].join(' ')}
                  >
                    {hint.text}
                  </p>
                </div>
              </div>
              {/* Shipping past what the order covers must be resolved before the note can go. */}
              {firstOver?.lineNo === line.lineNo ? (
                <div
                  role="alert"
                  className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#e2d8c2] bg-[#f7f1e6] p-3"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <img src={warningIcon} alt="" className="mt-0.5 size-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-[1.2] text-[#6d5a39]">
                        {t('tradeCreate.deliveryNote.overshipWarningCount', {
                          count: qty - line.toDeliver,
                          unit: line.unitLabel,
                          item: shortName(line.description),
                          id: orderId,
                        })}
                      </span>
                      <span className="mt-1 block text-xs font-medium leading-[1.2] text-[#6d5a39]">
                        {t('tradeCreate.deliveryNote.overshipHintRefused')}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {/* TODO(backend): TRADE_DOCUMENTS.md row T.14 (raise the order, or ship the
                        extra as a goodwill line that is never billed). */}
                    <button
                      type="button"
                      onClick={onUnavailable}
                      className="inline-flex h-9 items-center rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#444957]"
                    >
                      {t('tradeCreate.deliveryNote.raiseOrder')}
                    </button>
                    <button
                      type="button"
                      onClick={onUnavailable}
                      className="inline-flex h-9 items-center rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#444957]"
                    >
                      {t('tradeCreate.deliveryNote.notBillable')}
                    </button>
                  </span>
                </div>
              ) : null}
            </div>
          )
        })}
        <button
          type="button"
          onClick={onUnavailable}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-[#b6c2e4] py-3 text-base font-semibold text-[#2c4eb7]"
        >
          <img src={plusIcon} alt="" className="size-5" />
          {t('tradeCreate.deliveryNote.addItemNotOnOrder')}
        </button>
      </SectionCard>

      <SectionCard step={3} title={t('tradeCreate.deliveryNote.movementDetails')}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label={t('tradeCreate.deliveryNote.noteNumber')}
            required
            value={doc.movement.noteNumber}
            highlighted
          />
          <Field
            label={t('tradeCreate.deliveryNote.dispatchDate')}
            required
            value={doc.movement.dispatchDate}
            suffix="calendar"
          />
          <Field
            label={t('tradeCreate.deliveryNote.dispatchTime')}
            value={doc.movement.dispatchTime}
            suffix="clock"
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            label={t('tradeCreate.deliverTo')}
            required
            value={doc.movement.deliverTo}
            suffix="chevron"
          />
          <Field
            label={t('tradeCreate.deliveryNote.dispatchedFrom')}
            value={doc.movement.dispatchedFrom}
            suffix="chevron"
          />
          <Field
            label={t('tradeCreate.deliveryNote.driver')}
            required
            value={doc.movement.driver}
          />
          <Field
            label={t('tradeCreate.defaultTaxCategory')}
            required
            value={t(doc.movement.taxCategoryKey)}
          />
        </div>
      </SectionCard>

      <SectionCard
        step={4}
        title={t('tradeCreate.deliveryNote.proofTitle')}
        hint={t('tradeCreate.deliveryNote.proofHint')}
      >
        <ChoiceCards options={doc.proofOptions} value={proof} onChange={setProof} />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label={t('tradeCreate.deliveryNote.expectedToSign')} value={doc.expectedToSign} />
          <Field
            label={t('tradeCreate.deliveryNote.contactOnArrival')}
            value={`+968 ${doc.contactOnArrival}`}
          />
        </div>
      </SectionCard>

      <NotesAndAttachments
        step={5}
        noteToCustomer={doc.noteToCustomer}
        internalNote={doc.internalNote}
        uploadIcon={uploadIcon}
      />
    </>
  )
}

function PurchaseReceiptForm({ onUnavailable }: { onUnavailable: () => void }) {
  const { t } = useTranslation()
  const doc = NEW_PURCHASE_RECEIPT
  const [condition, setCondition] = useState('all')

  return (
    <>
      <div className="grid items-start gap-4 xl:grid-cols-[1fr_332px]">
        <SectionCard step={1} title={t('tradeCreate.deliveryNote.againstTitle')}>
          <AgainstOrder
            title={doc.against}
            meta={t(doc.againstMetaKey)}
            standaloneKey="tradeCreate.receipt.noOrder"
            onUnavailable={onUnavailable}
          />
        </SectionCard>
        <SummaryRail
          titleKey={doc.summary.titleKey}
          rows={doc.summary.rows}
          effectLabel={t(doc.summary.effectLabelKey)}
          beforePct={doc.summary.beforePct}
          afterPct={doc.summary.afterPct}
          percent={doc.summary.percent}
          note={t(doc.summary.noteKey)}
        />
      </div>

      <SectionCard
        step={2}
        title={t('tradeCreate.receipt.whatArrived')}
        hint={t('tradeCreate.receipt.countBeforeSign')}
        action={
          <button
            type="button"
            onClick={onUnavailable}
            className="text-sm font-semibold text-[#233e92]"
          >
            {t('tradeCreate.receipt.acceptAll')}
          </button>
        }
      >
        <div className="grid grid-cols-[1fr_140px_180px] gap-3 border-b border-[#f3f3f3] pb-2 text-xs font-semibold uppercase tracking-[0.02em] text-[#5b606c]">
          <span>{t('tradeCreate.cols.item')}</span>
          <span>{t('tradeCreate.receipt.expected')}</span>
          <span>{t('tradeCreate.receipt.actuallyReceived')}</span>
        </div>
        {doc.lines.map((line, index) => (
          <div key={line.id}>
            <div className="grid grid-cols-[1fr_140px_180px] items-start gap-3 border-b border-[#f3f3f3] py-4">
              <label className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  defaultChecked={line.checked}
                  className="mt-1 size-5 shrink-0 rounded-[4px] accent-[#2c4eb7]"
                />
                <span className="min-w-0">
                  <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
                    {line.name}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-[1.2] text-[#5b606c]">
                    {t(line.metaKey)}
                  </span>
                </span>
              </label>
              <div>
                <p className="text-base font-semibold leading-[1.2] text-[#2c3342]">
                  {line.expected}
                </p>
                <p className="mt-1 text-xs font-medium leading-[1.2] text-[#737781]">
                  {t(line.expectedNoteKey)}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      'flex h-[42px] w-[62px] items-center justify-center rounded-sm border bg-surface-tab-bar text-sm font-medium',
                      line.status === 'short'
                        ? 'border-[#98140b] text-[#98140b]'
                        : 'border-primary-300 text-text-secondary',
                    ].join(' ')}
                  >
                    {line.received}
                  </span>
                  <span className="text-sm font-medium text-[#5b606c]">{line.unit}</span>
                </div>
                <p
                  className={[
                    'mt-1 inline-flex items-center gap-1 text-xs font-medium leading-[1.2]',
                    line.status === 'short' ? 'text-[#98140b]' : 'text-[#3d5648]',
                  ].join(' ')}
                >
                  <img
                    src={line.status === 'short' ? warningRedIcon : tickIcon}
                    alt=""
                    className="size-3.5"
                  />
                  {t(line.statusKey)}
                </p>
              </div>
            </div>
            {/* A short line has to be explained — it stays outstanding on the PO. */}
            {index === 1 ? (
              <div className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#e8c4c0] bg-[#fff0f0] p-3">
                <span className="flex min-w-0 flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2">
                    <img src={warningRedIcon} alt="" className="size-5 shrink-0" />
                    <span className="text-sm font-semibold leading-[1.2] text-[#98140b]">
                      {t('tradeCreate.receipt.whyShort')}
                    </span>
                  </span>
                  <span className="flex h-10 min-w-[220px] items-center justify-between gap-2 rounded-sm border border-primary-300 bg-white px-3 text-sm font-medium text-text-secondary">
                    {doc.shortReason}
                    <img src={chevronIcon} alt="" className="size-5 rotate-90" />
                  </span>
                  <span className="text-sm font-medium leading-[1.2] text-[#5b606c]">
                    {t(doc.shortNoteKey)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onUnavailable}
                  className="inline-flex h-9 items-center rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#444957]"
                >
                  {t('tradeCreate.receipt.closeLineShort')}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={onUnavailable}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-[#b6c2e4] py-3 text-base font-semibold text-[#2c4eb7]"
        >
          <img src={plusIcon} alt="" className="size-5" />
          {t('tradeCreate.receipt.deliveredSomethingElse')}
        </button>
      </SectionCard>

      <SectionCard step={3} title={t('tradeCreate.receipt.arrivalDetails')}>
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="min-w-[240px] flex-1 rounded-sm bg-[#fafafa] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#737781]">
              {t(doc.arrival.fromLabelKey)}
            </p>
            <p className="mt-1.5 text-base font-medium leading-[1.2] text-[#151c2d]">
              {doc.arrival.from}
            </p>
            <p className="mt-1 text-xs font-medium leading-[1.2] text-[#5b606c]">
              {doc.arrival.fromMeta}
            </p>
          </div>
          <span className="flex items-center">
            <img src={arrowNextIcon} alt="" className="size-5 rtl:rotate-180" />
          </span>
          <div className="min-w-[240px] flex-1 rounded-sm bg-[#f4f6fb] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#737781]">
              {t(doc.arrival.toLabelKey)}
            </p>
            <p className="mt-1.5 text-base font-medium leading-[1.2] text-[#151c2d]">
              {doc.arrival.to}
            </p>
            <p className="mt-1 text-xs font-medium leading-[1.2] text-[#5b606c]">
              {doc.arrival.toMeta}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field
            label={t('tradeCreate.receipt.receiptNumber')}
            required
            value={doc.arrival.receiptNumber}
            highlighted
          />
          <Field
            label={t('tradeCreate.receipt.arrivalDate')}
            required
            value={doc.arrival.arrivalDate}
            suffix="calendar"
          />
          <Field
            label={t('tradeCreate.receipt.arrivalTime')}
            value={doc.arrival.arrivalTime}
            suffix="clock"
          />
          <Field
            label={t('tradeCreate.receipt.checkedInBy')}
            required
            value={doc.arrival.checkedInBy}
            suffix="chevron"
          />
          <Field
            label={t('tradeCreate.receipt.theirNoteRef')}
            hint={t('tradeCreate.receipt.theirNoteRefHint')}
            value={doc.arrival.theirNoteRef}
          />
          <Field
            label={t('tradeCreate.receipt.driverVehicle')}
            placeholder={t('tradeCreate.receipt.driverVehiclePlaceholder')}
            suffix="chevron"
          />
          <Field label={t('tradeCreate.deliveryNote.driver')} required value={doc.arrival.driver} />
          <Field
            label={t('tradeCreate.defaultTaxCategory')}
            required
            value={t(doc.arrival.taxCategoryKey)}
          />
        </div>
      </SectionCard>

      <SectionCard
        step={4}
        title={t('tradeCreate.receipt.conditionTitle')}
        hint={t('tradeCreate.receipt.conditionHint')}
      >
        <ChoiceCards options={doc.conditionOptions} value={condition} onChange={setCondition} />
        <div className="mt-4">
          <FieldLabel
            label={t('tradeCreate.receipt.whatWasWrong')}
            hint={t('tradeCreate.receipt.whatWasWrongHint')}
          />
          <div className="mt-1 min-h-[70px] rounded-sm border border-primary-300 bg-surface-tab-bar p-3 text-sm font-medium leading-[1.4] text-text-secondary">
            {doc.whatWasWrong}
          </div>
        </div>
        <div className="mt-4 flex flex-col items-center gap-2 rounded-sm border border-dashed border-[#d0d2d5] bg-[#fafafa] px-4 py-8 text-center">
          <img src={printIcon} alt="" className="size-6" />
          <p className="text-base font-medium leading-[1.2] text-[#2c3342]">{t(doc.photosKey)}</p>
          <p className="text-sm font-medium leading-[1.2] text-[#737781]">
            {t('tradeCreate.receipt.photosHint')}
          </p>
        </div>
      </SectionCard>

      <SectionCard step={5} title={t('tradeCreate.receipt.internalNotes')}>
        <div className="min-h-[70px] rounded-sm border border-primary-300 bg-surface-tab-bar p-3 text-sm font-medium leading-[1.4] text-text-secondary">
          {doc.internalNote}
        </div>
      </SectionCard>
    </>
  )
}

export function NewDeliveryNotePage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<NoteMode>(
    params.get('type') === 'purchase' ? 'purchase' : 'sales',
  )
  const sales = mode === 'sales'
  const notice = useTradeNotice()
  // The order the note is against: the address names it (`?order=`), the design's SO-0073 else.
  const orderId =
    params.get('order') && params.get('type') !== 'purchase' ? params.get('order')! : 'SO-0073'
  const initial = NEW_DELIVERY_NOTE.lines
  const [shipment, setShipment] = useState<Shipment>(() =>
    orderId === 'SO-0073'
      ? {
          qty: Object.fromEntries(initial.map((line) => [Number(line.id), line.shipping])),
          checked: Object.fromEntries(initial.map((line) => [Number(line.id), line.checked])),
        }
      : { qty: {}, checked: {} },
  )
  // A note may not ship past what the order still owes (TRADE_DOCUMENTS.md row T.14).
  const overDelivered =
    sales &&
    orderProgress(orderId) !== null &&
    overDeliveredLines(orderId, shippedQty(shipment)).length > 0
  const send = () => {
    if (overDelivered) notice.show('tradeCreate.deliveryNote.overshipRefused', { id: orderId })
    else notice.unavailable()
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/trade-documents/delivery-notes"
              className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
            >
              {t('deliveryDetail.breadcrumb')}
            </Link>
            <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
            <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">
              {t(sales ? 'tradeCreate.deliveryNote.title' : 'tradeCreate.receipt.title')}
            </h1>
            <span className="text-sm font-medium text-[#8f8f8f]">
              {sales ? NEW_DELIVERY_NOTE.displayId : NEW_PURCHASE_RECEIPT.id}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5b606c]">
            <img src={tickCircleIcon} alt="" className="size-5" />
            {t('tradeCreate.savedJustNow')}
          </span>
        </div>

        <ModePicker mode={mode} onChange={setMode} />
        {notice.node}

        {sales ? (
          <SalesDeliveryForm
            orderId={orderId}
            shipment={shipment}
            setShipment={setShipment}
            onUnavailable={notice.unavailable}
          />
        ) : (
          <PurchaseReceiptForm onUnavailable={notice.unavailable} />
        )}
      </div>

      <FormFooter>
        <button
          type="button"
          onClick={notice.unavailable}
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-white px-5 text-base font-medium text-[#3a3a3a]"
        >
          <img src={printIcon} alt="" className="size-5" />
          {t('deliveryDetail.print')}
        </button>
        <button
          type="button"
          onClick={notice.unavailable}
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-white px-5 text-base font-medium text-[#3a3a3a]"
        >
          <img src={noteTextIcon} alt="" className="size-5" />
          {t('tradeCreate.saveDraft')}
        </button>
        <button
          type="button"
          onClick={send}
          aria-disabled={overDelivered || undefined}
          className={[
            'inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-6 text-base font-semibold text-white',
            overDelivered ? 'cursor-not-allowed opacity-50' : '',
          ].join(' ')}
        >
          {t('tradeCreate.deliveryNote.sendWithDriver')}
          <img src={arrowNextIcon} alt="" className="size-5 brightness-0 invert rtl:rotate-180" />
        </button>
      </FormFooter>
    </AppShell>
  )
}
