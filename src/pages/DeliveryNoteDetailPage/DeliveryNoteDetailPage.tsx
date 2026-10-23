import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, withRial } from '../../components/ui'
import { Notice } from '../../components/feedback/ApiNotice'
import { useTradeNotice } from '../../components/trade/TradeNotice'
import { deliveryNoteRowActions } from '../../lib/rowActions'
import { deliveryById, type DeliveryDetail, type MetaRow } from '../../lib/deliveryNoteDetail'
import type { LifecycleStep, TimelineEvent } from '../../lib/orderFormDetail'
import backIcon from '../../assets/delivery-detail/back.svg'
import printIcon from '../../assets/delivery-detail/print.svg'
import downloadIcon from '../../assets/delivery-detail/download.svg'
import downloadSmIcon from '../../assets/delivery-detail/download-sm.svg'
import pdfIcon from '../../assets/delivery-detail/pdf.svg'
import tickIcon from '../../assets/delivery-detail/tick.svg'
import metaUserIcon from '../../assets/delivery-detail/meta-user.svg'
import metaPinIcon from '../../assets/delivery-detail/meta-pin.svg'
import metaTruckIcon from '../../assets/delivery-detail/meta-truck.svg'
import chipSalesIcon from '../../assets/order-detail/chip-sales.svg'
import chipPurchaseIcon from '../../assets/order-detail/chip-purchase.svg'
import issueInvoiceIcon from '../../assets/order-detail/issue-invoice.svg'
import lifeTickIcon from '../../assets/order-detail/life-tick.svg'
import lifeInvoicedIcon from '../../assets/order-detail/life-invoiced.svg'
import infoIcon from '../../assets/order-detail/info.svg'
import timelineDoneIcon from '../../assets/quotation-detail/timeline-done.svg'
import timelineOpenIcon from '../../assets/quotation-detail/timeline-open.svg'
import proofClockIcon from '../../assets/delivery-notes-v2/proof-clock.svg'
import omrIcon from '../../assets/order-forms-v2/omr.svg'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'

const LIFECYCLE_GLYPHS = {
  tick: lifeTickIcon,
  doc: lifeInvoicedIcon,
  invoiced: lifeInvoicedIcon,
  clock: proofClockIcon,
} as const

const META_ICONS: Record<MetaRow['icon'], string> = {
  user: metaUserIcon,
  clock: infoIcon,
  pin: metaPinIcon,
  truck: metaTruckIcon,
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  )
}

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

function DeliveryNoteDetail({ doc }: { doc: DeliveryDetail }) {
  const { t } = useTranslation()
  // Nothing new is made while the subscription is read-only (owner, 23 Oct; ST-2, CA-3).
  const mayCreate = useSubscriptionAllows('CREATE_DRAFTS')
  const navigate = useNavigate()
  const notice = useTradeNotice()
  const sales = doc.direction === 'sales'
  /** Only the sales side captures a signature; the purchase side keeps their paperwork instead. */
  const signature = doc.proof.signature
  const signatureLabelKey = 'deliveryDetail.sale.signature'
  // Converting opens the invoice composer filled from this note: its lines, the customer, the
  // order and despatch references (TRADE_DOCUMENTS.md rows T.10 to T.12).
  const convert = () =>
    doc.action.kind === 'convert'
      ? navigate(`/invoices/new?from=${encodeURIComponent(doc.id)}`)
      : notice.unavailable()
  const onAction = (itemId: string) =>
    itemId === 'invoice' && sales ? convert() : notice.unavailable()

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      {/* Delivery notes › DN-0124 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/trade-documents/delivery-notes"
              className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
            >
              {t('deliveryDetail.breadcrumb')}
            </Link>
            <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
            <span className="text-2xl font-medium leading-[1.2] text-[#5b606c]">{doc.id}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">{doc.id}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6efea] px-3 py-[5px] text-sm font-semibold text-[#3d5648]">
              <span className="size-1.5 rounded-full bg-[#3d5648]" />
              {t(doc.status.key, doc.status.values)}
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
            <span className="font-medium">{t(doc.leadKey)} </span>
            <span className="font-semibold text-[#151c2d]">{doc.party}</span>
            <span className="font-medium">
              {' '}
              • {t(doc.date.key, doc.date.values)} •{' '}
              {doc.against ? `${t('deliveryDetail.against')} ` : t('deliveryDetail.standalone')}
            </span>
            {doc.against ? (
              <span className="font-semibold text-[#151c2d]">{doc.against}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ActionMenu
            items={deliveryNoteRowActions(doc.id, onAction, mayCreate)}
            label={t('orderDetail.moreActions')}
            variant="bordered"
          />
          <button
            type="button"
            onClick={notice.unavailable}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
          >
            <img src={printIcon} alt="" className="size-6" />
            {t('deliveryDetail.print')}
          </button>
          <button
            type="button"
            onClick={notice.unavailable}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
          >
            <img src={downloadIcon} alt="" className="size-6" />
            {t('orderDetail.download')}
          </button>
          {mayCreate ? (
            <button
              type="button"
              onClick={convert}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-4 text-sm font-semibold text-white"
            >
              <img src={issueInvoiceIcon} alt="" className="size-6" />
              {t(doc.action.buttonKey)}
            </button>
          ) : null}
        </div>
      </div>

      <Card>
        <LifecycleStrip steps={doc.steps} />
        <p className="mt-6 border-t border-[#f3f3f3] pt-4 text-sm font-medium leading-[1.2] text-[#444957]">
          {doc.lifecycleNote
            ? withRial(t(doc.lifecycleNote.key, doc.lifecycleNote.values))
            : t('tradeDocs.notRecorded')}
        </p>
      </Card>
      {notice.node}

      {/* Proof (796) | action + progress + details (332) */}
      <div className="grid items-start gap-4 xl:grid-cols-[796fr_332px]">
        <div className="flex flex-col gap-4">
          {/* The proof card is tinted green — this is the "it arrived and was accepted" panel. */}
          <section className="rounded-sm bg-[#eef4f0] p-4">
            <div className="flex items-center gap-2.5 border-b border-[#dbe6df] pb-4">
              <img src={tickIcon} alt="" className="size-6" />
              <h2 className="text-xl font-medium leading-[1.2] text-[#2c3342]">
                {t(doc.proof.title.key, doc.proof.title.values)}
              </h2>
            </div>
            <div className="mt-4 flex flex-wrap gap-6">
              <dl className="flex min-w-[280px] flex-1 flex-col gap-4">
                {doc.proof.rows.map((row) => (
                  <div key={row.labelKey} className="flex items-start gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/70">
                      <img src={META_ICONS[row.icon]} alt="" className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-xs font-medium leading-[1.2] text-[#444957]">
                        {t(row.labelKey)}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold leading-[1.2] text-[#151c2d]">
                        {t(row.value.key, row.value.values)}
                      </dd>
                    </div>
                  </div>
                ))}
              </dl>
              {signature ? (
                <div className="flex h-[120px] w-[160px] shrink-0 flex-col justify-between rounded-sm bg-white p-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#737781]">
                    {t(signatureLabelKey)}
                  </span>
                  {/* Captured signature, rendered as script type rather than a bitmap. */}
                  <span className="pb-2 text-center font-serif text-2xl italic text-[#2c3342]">
                    {signature}
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          <Card>
            <h2 className="mb-4 text-xl font-medium leading-[1.2] text-[#2c3342]">
              {t(doc.linesTitleKey)}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-start">
                <thead>
                  <tr className="border-b border-[#f3f3f3]">
                    <th className="pb-2 text-start text-xs font-semibold uppercase leading-[1.2] text-[#5b606c]">
                      {t('orderDetail.sale.cols.item')}
                    </th>
                    <th className="pb-2 text-start text-xs font-semibold uppercase leading-[1.2] text-[#5b606c]">
                      {t('deliveryDetail.onTheOrder')}
                    </th>
                    <th className="pb-2 text-start text-xs font-semibold uppercase leading-[1.2] text-[#5b606c]">
                      {t(doc.thisColumnKey)}
                    </th>
                    <th className="pb-2 text-start text-xs font-semibold uppercase leading-[1.2] text-[#5b606c]">
                      {t('deliveryDetail.stillToCome')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines === null ? (
                    <tr>
                      <td colSpan={4} className="py-5 text-sm font-medium text-[#5b606c]">
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
                          {t(line.noteKey)}
                        </p>
                      </td>
                      <td className="py-5 text-base font-medium text-[#2c3342]">{line.onOrder}</td>
                      <td className="py-5 text-base font-medium text-[#2c3342]">{line.thisDrop}</td>
                      <td className="py-5 text-base font-medium text-[#2c3342]">
                        {line.stillToCome}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-xl font-medium leading-[1.2] text-[#2c3342]">
              {t('orderDetail.activity')}
            </h2>
            {doc.activity ? (
              <Timeline events={doc.activity} />
            ) : (
              <p className="text-sm font-medium text-[#5b606c]">{t('tradeDocs.notRecorded')}</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-xl font-medium leading-[1.2] text-[#2c3342]">
              {t(doc.filesTitleKey)}
            </h2>
            <div className="flex flex-col gap-3">
              {doc.files.length === 0 ? (
                <p className="text-sm font-medium text-[#5b606c]">{t('tradeDocs.notRecorded')}</p>
              ) : null}
              {doc.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between gap-4 rounded-sm border border-[#f3f3f3] p-4"
                >
                  <span className="flex items-center gap-4">
                    <img src={pdfIcon} alt="" className="size-10 shrink-0" />
                    <span>
                      <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
                        {t(file.titleKey)}
                      </span>
                      <span className="mt-1.5 block text-sm font-medium leading-[1.2] text-[#444957]">
                        {withRial(t(file.metaKey))}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={notice.unavailable}
                    aria-label={t('orderDetail.download')}
                    className="flex size-9 items-center justify-center rounded-sm border border-[#e8e8ea]"
                  >
                    <img src={downloadSmIcon} alt="" className="size-5" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="border border-[#f3f3f3]">
            <span className="inline-flex items-center gap-2">
              <img src={lifeInvoicedIcon} alt="" className="size-5 brightness-0" />
              <h2 className="text-base font-medium leading-[1.2] text-[#2c3342]">
                {t(doc.action.titleKey)}
              </h2>
            </span>
            <div className="mt-4 flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-7 shrink-0" />
              <span className="text-[28px] font-semibold leading-[1.2] text-[#2c3342]">
                {doc.action.amount ?? '—'}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium leading-[1.3] text-[#444957]">
              {withRial(t(doc.action.noteKey ?? 'tradeDocs.notRecorded'))}
            </p>
            {mayCreate ? (
              <button
                type="button"
                onClick={convert}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-sm bg-[#2c4eb7] px-3 text-sm font-semibold text-white"
              >
                <img src={issueInvoiceIcon} alt="" className="size-5" />
                {t(doc.action.buttonKey)}
              </button>
            ) : null}
          </Card>

          <Card className="border border-[#f3f3f3]">
            <h2 className="text-base font-medium leading-[1.2] text-[#2c3342]">
              {t(doc.progress.title.key, doc.progress.title.values)}
            </h2>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#737781]">
              {t(doc.progress.barLabelKey)}
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e6efea]">
              <span
                className="block h-full rounded-full bg-[#3d5648]"
                style={{ width: `${doc.progress.percent ?? 0}%` }}
              />
            </div>
            <p className="mt-2.5 text-sm font-medium leading-[1.3] text-[#444957]">
              {doc.progress.note
                ? t(doc.progress.note.key, doc.progress.note.values)
                : t('tradeDocs.notRecorded')}
            </p>
          </Card>

          <Card className="border border-[#f3f3f3]">
            <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">
              {t(doc.details.titleKey)}
            </h2>
            <dl className="mt-4 flex flex-col gap-3">
              {doc.details.rows.map((row) => (
                <div key={row.labelKey} className="flex items-center justify-between gap-3">
                  <dt className="text-sm font-medium leading-[1.2] text-[#151c2d]/70">
                    {t(row.labelKey)}
                  </dt>
                  <dd className="text-sm font-semibold leading-[1.2] text-[#2c3342]">
                    {row.value ?? t('tradeDocs.notRecorded')}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}

export function DeliveryNoteDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  // The record the address names; its own direction decides the layout, not the id's prefix.
  const doc = deliveryById(id)

  return (
    <AppShell>
      {doc ? (
        <DeliveryNoteDetail doc={doc} />
      ) : (
        <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
          <Notice
            badge={t('appAccess.notFound')}
            body={t('tradeDocs.notFound', { kind: t('tradeDocs.kind.delivery'), id })}
            action={{
              label: t('deliveryDetail.breadcrumb'),
              to: '/trade-documents/delivery-notes',
            }}
          />
        </div>
      )}
    </AppShell>
  )
}
