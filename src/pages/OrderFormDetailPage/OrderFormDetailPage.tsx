import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, RowsView, withRial } from '../../components/ui'
import { orderFormRowActions } from '../../lib/rowActions'
import {
  orderById,
  type LifecycleStep,
  type PurchaseOrderDetail,
  type SaleOrderDetail,
  type TimelineEvent,
} from '../../lib/orderFormDetail'
import { Notice } from '../../components/feedback/ApiNotice'
import { useTradeNotice } from '../../components/trade/TradeNotice'
import backIcon from '../../assets/order-detail/back.svg'
import downloadIcon from '../../assets/order-detail/download.svg'
import logDeliveryIcon from '../../assets/order-detail/log-delivery.svg'
import issueInvoiceIcon from '../../assets/order-detail/issue-invoice.svg'
import issueInvoiceSmIcon from '../../assets/order-detail/issue-invoice-sm.svg'
import lifeTickIcon from '../../assets/order-detail/life-tick.svg'
import lifeDocIcon from '../../assets/order-detail/life-doc.svg'
import lifeInvoicedIcon from '../../assets/order-detail/life-invoiced.svg'
import infoIcon from '../../assets/order-detail/info.svg'
import pdfIcon from '../../assets/order-detail/pdf.svg'
import uploadIcon from '../../assets/order-detail/upload.svg'
import chipSalesIcon from '../../assets/order-detail/chip-sales.svg'
import chipPurchaseIcon from '../../assets/order-detail/chip-purchase.svg'
import timelineDoneIcon from '../../assets/quotation-detail/timeline-done.svg'
import timelineOpenIcon from '../../assets/quotation-detail/timeline-open.svg'
import proofClockIcon from '../../assets/delivery-notes-v2/proof-clock.svg'
import omrIcon from '../../assets/order-forms-v2/omr.svg'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'

const TONE_FILL = {
  invoiced: 'bg-[#2c4eb7]',
  delivered: 'bg-[#b99a66]',
  track: 'bg-[#f3f3f3]',
} as const

const LIFECYCLE_GLYPHS = {
  tick: lifeTickIcon,
  doc: lifeDocIcon,
  invoiced: lifeInvoicedIcon,
  clock: proofClockIcon,
} as const

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  )
}

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-medium leading-[1.2] text-[#2c3342]">{title}</h2>
      {action}
    </div>
  )
}

function Amount({
  value,
  size = 'md',
  className = '',
}: {
  value: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { t } = useTranslation()
  if (value === null) {
    return <span className="text-sm font-medium text-[#5b606c]">{t('tradeDocs.notRecorded')}</span>
  }
  const mark = { xs: 'w-3.5', sm: 'w-4', md: 'w-5', lg: 'w-7' }[size]
  return (
    <span className="inline-flex items-center gap-1">
      <img src={omrIcon} alt="" className={['h-auto shrink-0', mark].join(' ')} />
      <span className={className}>{value}</span>
    </span>
  )
}

/** Six 46px stations joined by hairlines; more than one can be live at a time. */
function LifecycleStrip({ steps }: { steps: LifecycleStep[] }) {
  const { t } = useTranslation()

  return (
    <div className="flex items-start justify-between">
      {steps.map((step, i) => (
        <div key={step.labelKey} className="flex flex-1 items-start last:flex-none">
          <div className="flex min-w-[46px] flex-col items-center gap-[5px] px-1">
            <span
              className={[
                'flex size-[46px] shrink-0 items-center justify-center rounded-full',
                step.state === 'active'
                  ? 'bg-[#2c4eb7]'
                  : step.state === 'done'
                    ? 'border border-[#b7c4bd] bg-[#e6efea]'
                    : step.state === 'pending'
                      ? 'border border-[#cfc6b5] bg-[#f7f1e6]'
                      : 'border border-[#d0d2d5]',
              ].join(' ')}
            >
              {step.glyph ? (
                <img src={LIFECYCLE_GLYPHS[step.glyph]} alt="" className="size-6" />
              ) : null}
            </span>
            <span className="whitespace-pre-line text-center text-xs font-semibold uppercase leading-[1.5] tracking-[0.02em] text-[#444957]">
              {t(step.labelKey)}
            </span>
            {step.noteKey ? (
              <span className="text-center text-[10px] font-medium leading-[1.2] text-[#5b606c]">
                {t(step.noteKey, step.noteValues)}
              </span>
            ) : null}
          </div>
          {i < steps.length - 1 ? (
            <span aria-hidden="true" className="mx-1 mt-[23px] h-px flex-1 bg-[#e8e8ea]" />
          ) : null}
        </div>
      ))}
    </div>
  )
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  const { t } = useTranslation()

  return (
    <ol className="flex flex-col">
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-3 pb-6 last:pb-0">
          {index < events.length - 1 ? (
            <span
              aria-hidden="true"
              className={[
                'absolute start-[13px] top-7 -bottom-1 w-px',
                event.tone === 'open' ? 'bg-[#cfc6b5]' : 'bg-[#b7c4bd]',
              ].join(' ')}
            />
          ) : null}
          <img
            src={event.tone === 'open' ? timelineOpenIcon : timelineDoneIcon}
            alt=""
            className="relative z-10 size-7 shrink-0"
          />
          <div className="min-w-0 pt-0.5">
            <p className="text-base font-medium leading-[1.2] text-[#2c3342]">
              {t(event.titleKey)}
            </p>
            <p className="mt-1.5 text-sm font-medium leading-[1.2] text-[#444957]">
              {withRial(t(event.detailKey, event.detailValues))}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function FileRow({
  titleKey,
  metaKey,
  metaValues,
}: {
  titleKey: string
  metaKey: string
  metaValues?: Record<string, string | number>
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-4 rounded-sm border border-[#f3f3f3] p-4">
      <img src={pdfIcon} alt="" className="size-10 shrink-0" />
      <div className="min-w-0">
        <p className="text-base font-medium leading-[1.2] text-[#151c2d]">{t(titleKey)}</p>
        <p className="mt-1.5 text-sm font-medium leading-[1.2] text-[#444957]">
          {withRial(t(metaKey, metaValues))}
        </p>
      </div>
    </div>
  )
}

function DetailHeader({
  id,
  statusKey,
  statusTone,
  direction,
  leadKey,
  party,
  tail,
  actions,
}: {
  id: string
  statusKey: string
  statusTone: 'progress' | 'part'
  direction: 'sales' | 'purchase'
  leadKey: string
  party: string
  tail: { key: string; values?: Record<string, string | number> }
  actions: ReactNode
}) {
  const { t } = useTranslation()
  const sales = direction === 'sales'

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-medium leading-[1.2] text-[#5b606c]">
            {t('orderDetail.breadcrumbParent')}
          </span>
          <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
          <Link
            to="/trade-documents/order-forms"
            className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
          >
            {t('orderDetail.breadcrumbOrderForms')}
          </Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">{id}</h1>
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-sm font-semibold',
              statusTone === 'progress'
                ? 'bg-[#f4f6fb] text-[#2c4eb7]'
                : 'bg-[#f3f3f3] text-[#5b606c]',
            ].join(' ')}
          >
            <span
              className={[
                'size-1.5 rounded-full',
                statusTone === 'progress' ? 'bg-[#2c4eb7]' : 'bg-[#5b606c]',
              ].join(' ')}
            />
            {t(statusKey)}
          </span>
          <span
            className={[
              'inline-flex items-center gap-1 rounded-sm px-2 py-1',
              sales ? 'bg-[#f4f6fb]' : 'bg-[#eaedf8]',
            ].join(' ')}
          >
            <img src={sales ? chipSalesIcon : chipPurchaseIcon} alt="" className="size-3.5" />
            <span className="text-sm font-semibold uppercase leading-[1.2] text-[#2c4eb7]">
              {t(sales ? 'orderForms.chip.sales' : 'orderForms.chip.purchase')}
            </span>
          </span>
        </div>
        <p className="mt-1.5 text-base leading-[1.2] text-[#5b606c]">
          <span className="font-medium">• {t(leadKey)} </span>
          <span className="font-semibold text-[#151c2d]">{party}</span>
          <span className="font-medium"> · {t(tail.key, tail.values)}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{actions}</div>
    </div>
  )
}

/* --------------------------------------------------------------- sales */

/** A timeline or a list the server has not given: one quiet line in its place. */
function NotRecorded() {
  const { t } = useTranslation()
  return <p className="text-sm font-medium text-[#5b606c]">{t('tradeDocs.notRecorded')}</p>
}

function SaleDetail({ doc }: { doc: SaleOrderDetail }) {
  const { t } = useTranslation()
  // Nothing new is made while the subscription is read-only (owner, 23 Oct; ST-2, CA-3).
  const mayCreate = useSubscriptionAllows('CREATE_DRAFTS')
  const navigate = useNavigate()
  const notice = useTradeNotice()
  const f = doc.fulfilment
  const invoice = () => navigate(`/invoices/new?from=${encodeURIComponent(doc.id)}`)
  const deliver = () =>
    navigate(`/trade-documents/delivery-notes/new?order=${encodeURIComponent(doc.id)}`)
  const onAction = (itemId: string) =>
    itemId === 'invoice' ? invoice() : itemId === 'delivery' ? deliver() : notice.unavailable()

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <DetailHeader
        id={doc.id}
        statusKey={doc.statusKey}
        statusTone="progress"
        direction="sales"
        leadKey="orderDetail.sale.for"
        party={doc.customer}
        tail={doc.tail}
        actions={
          <>
            <ActionMenu
              items={orderFormRowActions(doc.id, onAction, mayCreate)}
              label={t('orderDetail.moreActions')}
              variant="bordered"
            />
            <button
              type="button"
              onClick={notice.unavailable}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
            >
              <img src={downloadIcon} alt="" className="size-6" />
              {t('orderDetail.download')}
            </button>
            {mayCreate ? (
              <>
                <button
                  type="button"
                  onClick={deliver}
                  className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
                >
                  <img src={logDeliveryIcon} alt="" className="size-6" />
                  {t('orderForms.action.logDelivery')}
                </button>
                <button
                  type="button"
                  onClick={invoice}
                  className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-4 text-sm font-semibold text-white"
                >
                  <img src={issueInvoiceIcon} alt="" className="size-6" />
                  {t('orderForms.action.issueInvoice')}
                </button>
              </>
            ) : null}
          </>
        }
      />

      <Card>
        <LifecycleStrip steps={doc.steps} />
        <p className="mt-6 border-t border-[#f3f3f3] pt-4 text-sm font-medium leading-[1.2] text-[#444957]">
          {doc.lifecycleNote
            ? withRial(t(doc.lifecycleNote.key, doc.lifecycleNote.values))
            : t('tradeDocs.notRecorded')}
        </p>
      </Card>
      {notice.node}

      {/* Fulfilment (795) | Order value (332) */}
      <div className="grid gap-4 xl:grid-cols-[795fr_332px]">
        <Card className="pb-6">
          <SectionTitle title={t('orderDetail.sale.fulfilmentTitle')} />
          <div className="grid gap-4 md:grid-cols-3">
            {f.stats.map((stat) => (
              <div
                key={stat.id}
                className={[
                  'flex flex-col rounded-sm border p-4',
                  stat.accent ? 'border-[#d5dcf1] bg-[#f4f6fb]' : 'border-[#e8e8ea] bg-[#fafafa]',
                ].join(' ')}
              >
                <p className="text-xs font-semibold uppercase leading-[1.2] tracking-[0.02em] text-[#5b606c]">
                  {t(stat.labelKey)}
                </p>
                <div className="mt-3">
                  <Amount
                    value={stat.amount}
                    size="lg"
                    className="text-[28px] font-semibold leading-[1.2] text-[#2c3342]"
                  />
                </div>
                <p className="mt-2 text-sm font-medium leading-[1.2] text-[#5b606c]">
                  {stat.note ? t(stat.note.key, stat.note.values) : t('tradeDocs.notRecorded')}
                </p>
                {stat.actionKey && mayCreate ? (
                  <button
                    type="button"
                    onClick={invoice}
                    className="mt-3 inline-flex h-9 items-center justify-center gap-1 rounded-sm bg-[#2c4eb7] px-2.5 text-sm font-semibold text-white"
                  >
                    <img src={issueInvoiceSmIcon} alt="" className="size-5" />
                    {t(stat.actionKey)}
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="relative mt-6 h-3 w-full overflow-hidden rounded-[2px] bg-[#f3f3f3]">
            {f.segments.map((segment, index) => (
              <span
                key={index}
                className={[
                  'absolute inset-y-0 start-0 rounded-[2px]',
                  TONE_FILL[segment.tone],
                ].join(' ')}
                style={{ width: `${segment.pct}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            {f.legend.map((entry) => (
              <span key={entry.labelKey} className="inline-flex items-center gap-1.5">
                <span
                  className={[
                    'h-[7px] w-[18px] shrink-0 rounded-[2px]',
                    TONE_FILL[entry.tone],
                  ].join(' ')}
                />
                <span className="text-xs font-medium leading-[1.2] text-[#444957]">
                  {t(entry.labelKey)}
                </span>
                <Amount
                  value={entry.amount}
                  size="xs"
                  className="text-xs font-semibold leading-[1.2] text-[#2c3342]"
                />
              </span>
            ))}
          </div>
        </Card>

        <Card className="border border-[#f3f3f3]">
          <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">
            {t('orderDetail.sale.orderValue')}
          </h2>
          <dl className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sm font-medium leading-[1.2] text-[#151c2d]/70">
                {t('orderDetail.sale.net')}
              </dt>
              <dd>
                <Amount
                  value={doc.value.net}
                  size="sm"
                  className="text-sm font-semibold leading-[1.2] text-[#2c3342]"
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sm font-medium leading-[1.2] text-[#2c3342]">
                {t('orderDetail.sale.vat')}
              </dt>
              <dd>
                <Amount
                  value={doc.value.vat}
                  size="sm"
                  className="text-sm font-semibold leading-[1.2] text-[#2c3342]"
                />
              </dd>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 border-t border-[#f3f3f3] pt-4">
              <dt className="text-base font-medium leading-[1.2] text-[#151c2d]">
                {t('orderDetail.sale.customerWillPay')}
              </dt>
              <dd>
                <Amount
                  value={doc.value.total}
                  size="md"
                  className="text-[22px] font-semibold leading-[1.2] text-[#151c2d]"
                />
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex gap-2 rounded-sm bg-[#f3f4f5] px-3 py-2">
            <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
            <p className="text-sm font-medium leading-[1.3] text-[#5b606c]">
              {t(doc.value.noteKey)}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title={t('orderDetail.sale.lines')} />
        <RowsView>
          <table className="w-full min-w-[900px] border-collapse text-start">
            <thead>
              <tr className="border-b border-[#f3f3f3]">
                {[
                  'orderDetail.sale.cols.item',
                  'orderDetail.sale.cols.ordered',
                  'orderDetail.sale.cols.delivered',
                  'orderDetail.sale.cols.invoiced',
                  'orderDetail.sale.cols.toInvoice',
                  'orderDetail.sale.cols.toDeliver',
                  'orderDetail.sale.cols.total',
                ].map((key, i) => (
                  <th
                    key={key}
                    className={[
                      'pb-2 text-xs font-semibold uppercase leading-[1.2] text-[#5b606c]',
                      i === 0 ? 'text-start' : 'text-start',
                    ].join(' ')}
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doc.lines === null ? (
                <tr>
                  <td colSpan={7} className="py-5 text-sm font-medium text-[#5b606c]">
                    {t('tradeDocs.notAvailableShort')}
                  </td>
                </tr>
              ) : null}
              {(doc.lines ?? []).map((line) => (
                <tr key={line.id} className="border-b border-[#f3f3f3] last:border-b-0">
                  <td className="py-5 pe-4">
                    <p className="text-base font-medium leading-[1.2] text-[#151c2d]">
                      {line.name}
                    </p>
                    <p className="mt-1.5 text-sm font-medium leading-[1.2] text-[#5b606c]">
                      {line.rate}
                    </p>
                  </td>
                  <td className="py-5 text-base font-medium text-[#2c3342]">{line.ordered}</td>
                  <td className="py-5 text-base font-medium text-[#2c3342]">{line.delivered}</td>
                  <td className="py-5 text-base font-medium text-[#2c3342]">{line.invoiced}</td>
                  <td className="py-5 text-base font-medium text-[#2c3342]">{line.toInvoice}</td>
                  <td className="py-5 text-base font-medium text-[#2c3342]">{line.toDeliver}</td>
                  <td className="py-5 text-xl font-semibold text-[#151c2d]">{line.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </RowsView>
      </Card>

      <Card>
        <SectionTitle title={t('orderDetail.activity')} />
        {doc.activity ? <Timeline events={doc.activity} /> : <NotRecorded />}
      </Card>

      <Card>
        <SectionTitle title={t('orderDetail.attachments')} />
        <div className="flex flex-col gap-3">
          {doc.attachments.map((file) => (
            <FileRow
              key={file.id}
              titleKey={file.titleKey}
              metaKey={file.metaKey}
              metaValues={file.metaValues}
            />
          ))}
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-sm bg-[#fafafa] px-4 py-5">
            <img src={uploadIcon} alt="" className="size-6" />
            <span className="text-base font-medium leading-[1.2] text-[#2c3342]">
              {t('orderDetail.dropFiles')}
            </span>
            <span className="text-sm font-medium leading-[1.2] text-[#737781]">
              {t('orderDetail.dropFilesHint')}
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------ purchase */

function PurchaseDetail({ doc }: { doc: PurchaseOrderDetail }) {
  const { t } = useTranslation()
  // Nothing new is made while the subscription is read-only (owner, 23 Oct; ST-2, CA-3).
  const mayCreate = useSubscriptionAllows('CREATE_DRAFTS')
  const notice = useTradeNotice()
  const unavailable = notice.unavailable
  const onAction = () => unavailable()

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <DetailHeader
        id={doc.id}
        statusKey={doc.statusKey}
        statusTone="part"
        direction="purchase"
        leadKey="orderDetail.purchase.placedWith"
        party={doc.supplier}
        tail={doc.tail}
        actions={
          <>
            <ActionMenu
              items={orderFormRowActions(doc.id, onAction, mayCreate)}
              label={t('orderDetail.moreActions')}
              variant="bordered"
            />
            <button
              type="button"
              onClick={unavailable}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
            >
              <img src={downloadIcon} alt="" className="size-6" />
              {t('orderDetail.download')}
            </button>
            <button
              type="button"
              onClick={unavailable}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-4 text-sm font-semibold text-white"
            >
              <img src={issueInvoiceIcon} alt="" className="size-6" />
              {t('orderDetail.purchase.schedulePayment')}
            </button>
          </>
        }
      />

      <Card>
        <LifecycleStrip steps={doc.steps} />
        <p className="mt-6 border-t border-[#f3f3f3] pt-4 text-sm font-medium leading-[1.2] text-[#444957]">
          {doc.lifecycleNote
            ? withRial(t(doc.lifecycleNote.key, doc.lifecycleNote.values))
            : t('tradeDocs.notRecorded')}
        </p>
      </Card>
      {notice.node}

      {/* Three-way match (796) | Due to pay + What this costs (332) */}
      <div className="grid items-start gap-4 xl:grid-cols-[796fr_332px]">
        <div className="flex flex-col gap-4">
          <Card className="pb-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2">
                <img src={lifeTickIcon} alt="" className="size-6" />
                <h2 className="text-xl font-medium leading-[1.2] text-[#2c3342]">
                  {t(doc.match.titleKey)}
                </h2>
              </span>
              <button
                type="button"
                onClick={unavailable}
                className="text-sm font-semibold text-[#2c4eb7]"
              >
                {t(doc.match.linkKey)}
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {doc.match.stats.map((stat) => (
                <div
                  key={stat.id}
                  className="flex flex-col rounded-sm border border-[#e8e8ea] bg-[#fafafa] p-4"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <img src={lifeTickIcon} alt="" className="size-3.5" />
                    <span className="text-xs font-semibold uppercase leading-[1.2] tracking-[0.02em] text-[#5b606c]">
                      {t(stat.labelKey)}
                    </span>
                  </span>
                  <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-[#2c3342]">
                    {stat.value ?? '—'}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-sm font-medium leading-[1.2] text-[#5b606c]">
                    {stat.rate ? (
                      <Amount
                        value={stat.rate}
                        size="xs"
                        className="text-sm font-semibold text-[#5b606c]"
                      />
                    ) : null}
                    {t(stat.noteKey)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle title={t('orderDetail.sale.lines')} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-start">
                <thead>
                  <tr className="border-b border-[#f3f3f3]">
                    {[
                      'orderDetail.sale.cols.item',
                      'orderDetail.sale.cols.ordered',
                      'orderDetail.purchase.cols.received',
                      'orderDetail.purchase.cols.theyBilled',
                      'orderDetail.purchase.cols.toReceive',
                    ].map((key) => (
                      <th
                        key={key}
                        className="pb-2 text-start text-xs font-semibold uppercase leading-[1.2] text-[#5b606c]"
                      >
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {doc.lines === null ? (
                    <tr>
                      <td colSpan={5} className="py-5 text-sm font-medium text-[#5b606c]">
                        {t('tradeDocs.notAvailableShort')}
                      </td>
                    </tr>
                  ) : null}
                  {(doc.lines ?? []).map((line) => (
                    <tr key={line.id} className="border-b border-[#f3f3f3] last:border-b-0">
                      <td className="py-5 pe-4">
                        <p className="text-base font-medium leading-[1.2] text-[#151c2d]">
                          {line.name}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-sm font-medium leading-[1.2] text-[#5b606c]">
                          <Amount
                            value={line.rate}
                            size="xs"
                            className="text-sm font-semibold text-[#5b606c]"
                          />
                          {t(line.rateUnitKey)} · {t('orderDetail.purchase.lineValue')}
                          <Amount
                            value={line.lineValue}
                            size="xs"
                            className="text-sm font-semibold text-[#5b606c]"
                          />
                        </p>
                      </td>
                      <td className="py-5 text-base font-medium text-[#2c3342]">{line.ordered}</td>
                      <td className="py-5 text-base font-medium text-[#2c3342]">{line.received}</td>
                      <td className="py-5 text-base font-medium text-[#2c3342]">{line.billed}</td>
                      <td className="py-5 text-base font-medium text-[#2c3342]">
                        {line.toReceive}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="border border-[#f3f3f3]">
            <span className="inline-flex items-center gap-2">
              <img src={issueInvoiceIcon} alt="" className="size-5 brightness-0" />
              <h2 className="text-base font-medium leading-[1.2] text-[#2c3342]">
                {t(doc.due.titleKey)}
              </h2>
            </span>
            <div className="mt-4">
              <Amount
                value={doc.due.amount}
                size="lg"
                className="text-[28px] font-semibold leading-[1.2] text-[#2c3342]"
              />
            </div>
            <p className="mt-2 text-sm font-medium leading-[1.3] text-[#444957]">
              {t(doc.due.noteKey ?? 'tradeDocs.notRecorded')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={unavailable}
                className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-[#2c4eb7] px-3 text-sm font-semibold text-white"
              >
                <img src={issueInvoiceIcon} alt="" className="size-5" />
                {t(doc.due.primaryKey)}
              </button>
              <button
                type="button"
                onClick={unavailable}
                className="inline-flex h-9 items-center rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#3a3a3a]"
              >
                {t(doc.due.secondaryKey)}
              </button>
            </div>
          </Card>

          <Card className="border border-[#f3f3f3]">
            <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">
              {t(doc.cost.titleKey)}
            </h2>
            <dl className="mt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-sm font-medium leading-[1.2] text-[#151c2d]/70">
                  {t('orderDetail.sale.net')}
                </dt>
                <dd>
                  <Amount
                    value={doc.cost.net}
                    size="sm"
                    className="text-sm font-semibold leading-[1.2] text-[#2c3342]"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-sm font-medium leading-[1.2] text-[#2c3342]">
                  {t('orderDetail.purchase.vat5')}
                </dt>
                <dd>
                  <Amount
                    value={doc.cost.vat}
                    size="sm"
                    className="text-sm font-semibold leading-[1.2] text-[#2c3342]"
                  />
                </dd>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-[#f3f3f3] pt-4">
                <dt className="text-base font-medium leading-[1.2] text-[#151c2d]">
                  {t('orderDetail.purchase.youOwe')}
                </dt>
                <dd>
                  <Amount
                    value={doc.cost.total}
                    size="md"
                    className="text-[22px] font-semibold leading-[1.2] text-[#151c2d]"
                  />
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex gap-2 rounded-sm bg-[#f3f4f5] px-3 py-2">
              <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              <p className="text-sm font-medium leading-[1.3] text-[#5b606c]">
                {t(doc.cost.noteKey ?? 'tradeDocs.notRecorded')}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-medium leading-[1.2] text-[#2c3342]">
            {t(doc.approval.titleKey)}
          </h2>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-[#5b606c]">
            {t(doc.approval.thresholdKey)}
            <Amount
              value={doc.approval.threshold}
              size="xs"
              className="text-sm font-semibold text-[#5b606c]"
            />
          </span>
        </div>
        <div className="flex flex-col gap-4">
          {doc.approval.rows.length === 0 ? <NotRecorded /> : null}
          {doc.approval.rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="size-10 shrink-0 rounded-full bg-[#eaedf8]" aria-hidden="true" />
                <div>
                  <p className="text-base font-medium leading-[1.2] text-[#2c3342]">
                    {t(row.titleKey)}
                  </p>
                  <p className="mt-1.5 text-sm font-medium leading-[1.2] text-[#444957]">
                    {t(row.metaKey)}
                  </p>
                </div>
              </div>
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] text-sm font-semibold',
                  row.tone === 'success'
                    ? 'bg-[#e6efea] text-[#3d5648]'
                    : 'bg-[#f4f6fb] text-[#5b606c]',
                ].join(' ')}
              >
                {row.tone === 'success' ? (
                  <img src={lifeTickIcon} alt="" className="size-4" />
                ) : null}
                {t(row.chipKey)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title={t('orderDetail.activity')} />
        {doc.activity ? <Timeline events={doc.activity} /> : <NotRecorded />}
      </Card>

      <Card>
        <SectionTitle title={t('orderDetail.purchase.documentsTitle')} />
        <div className="flex flex-col gap-3">
          {doc.documents.length === 0 ? <NotRecorded /> : null}
          {doc.documents.map((file) => (
            <FileRow key={file.id} titleKey={file.titleKey} metaKey={file.metaKey} />
          ))}
        </div>
      </Card>
    </div>
  )
}

export function OrderFormDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  // The record the address names; its own direction decides the layout, not the id's prefix.
  const doc = orderById(id)

  return (
    <AppShell>
      {doc === null ? (
        <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
          <Notice
            badge={t('appAccess.notFound')}
            body={t('tradeDocs.notFound', { kind: t('tradeDocs.kind.order'), id })}
            action={{
              label: t('orderDetail.breadcrumbOrderForms'),
              to: '/trade-documents/order-forms',
            }}
          />
        </div>
      ) : doc.direction === 'purchase' ? (
        <PurchaseDetail doc={doc} />
      ) : (
        <SaleDetail doc={doc} />
      )}
    </AppShell>
  )
}
