import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Rial, withRial } from '../../components/ui'
import { BILL_DETAIL, type BillLinkedDoc, type BillStepState } from '../../lib/billDetail'
import stepIcon from '../../assets/bill-detail/step.svg'
import hdrBtnIcon from '../../assets/bill-detail/hdr-btn.svg'
import activityIcon from '../../assets/bill-detail/activity.svg'
import complianceIcon from '../../assets/bill-detail/tick.svg'
import decisionIcon from '../../assets/bill-detail/decision.svg'
import matchOkIcon from '../../assets/bills/match-ok.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import peppolBadgeIcon from '../../assets/invoice-details/peppol-badge.svg'
import docOrderIcon from '../../assets/create-invoice/doc-order.svg'
import docDeliveryIcon from '../../assets/create-invoice/doc-delivery.svg'
import pdfIcon from '../../assets/invoice-details/pdf.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

/** Step circles: completed is a filled grey disc, the one you are on is brand blue. */
const STEP_CIRCLE: Record<BillStepState, string> = {
  done: 'bg-neutral-50 border-border-default',
  current: 'bg-primary-700 border-primary-700',
  upcoming: 'bg-white border-border-default',
}

const LINKED_ICONS: Record<BillLinkedDoc['icon'], string> = {
  order: docOrderIcon,
  receipt: docDeliveryIcon,
  file: pdfIcon,
}

function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={['rounded-md bg-surface-card p-5 shadow-card', className].join(' ')}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** ARRIVED · MATCHED · APPROVED · SCHEDULED · PAID, with the rule between each pair. */
function BillStepper() {
  const { t } = useTranslation()
  const steps = BILL_DETAIL.steps

  return (
    <div className="rounded-md bg-surface-card px-6 py-5 shadow-card">
      <div className="flex items-start overflow-x-auto">
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            {index > 0 ? (
              <span
                className={[
                  'mt-4 h-0.5 min-w-[24px] flex-1 shrink',
                  // The rule is only "lit" up to the step you are on.
                  index <= steps.findIndex((s) => s.state === 'current')
                    ? 'bg-border-default'
                    : 'bg-neutral-50',
                ].join(' ')}
              />
            ) : null}
            <div className="flex w-[104px] shrink-0 flex-col items-center gap-[7px]">
              <span
                className={[
                  'flex size-8 items-center justify-center rounded-full border',
                  STEP_CIRCLE[step.state],
                ].join(' ')}
              >
                {step.state === 'upcoming' ? null : (
                  <img
                    src={step.state === 'current' ? hdrBtnIcon : stepIcon}
                    alt=""
                    className="size-[15px]"
                  />
                )}
              </span>
              <span
                className={[
                  'text-center text-[10.5px] font-semibold uppercase leading-[13.65px] tracking-[0.52px]',
                  step.state === 'upcoming' ? 'text-[#8a8e96]' : 'text-text-quaternary',
                ].join(' ')}
              >
                {t(step.labelKey)}
              </span>
              <span
                className={[
                  'text-center text-[11.5px] leading-[14.95px]',
                  step.state === 'current'
                    ? 'font-semibold text-primary-700'
                    : 'font-medium text-text-quaternary',
                ].join(' ')}
              >
                {step.detail.startsWith('billDetail.') ? t(step.detail) : step.detail}
              </span>
            </div>
          </Fragment>
        ))}
      </div>

      <p className="mt-5 text-sm font-medium leading-[1.5] text-text-tertiary">
        {t('billDetail.stepperNote')}{' '}
        <span className="font-semibold text-text-primary">{t('billDetail.stepperNoteBold')}</span>
      </p>
    </div>
  )
}

export function BillDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const bill = BILL_DETAIL
  const billId = id ?? bill.id
  const [decision, setDecision] = useState<'pending' | 'approved' | 'queried' | 'held'>('pending')

  const decisionNoticeKey =
    decision === 'approved'
      ? 'billDetail.decision.approvedNotice'
      : decision === 'queried'
        ? 'billDetail.decision.queriedNotice'
        : 'billDetail.decision.heldNotice'

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-5 pb-10">
        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/expenditure/bills"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
          >
            {t('billDetail.breadcrumb')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">{billId}</span>
        </div>

        {/* Title row: identity, state and the three decisions */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{billId}</h1>
            <span className="inline-flex h-[31px] items-center gap-2 rounded-full bg-primary-50 px-3 text-sm font-semibold text-primary-900">
              <span className="size-1.5 rounded-full bg-primary-900" />
              {t('billsPage.status.newNotReviewed')}
            </span>
            <span className="inline-flex h-[31px] items-center gap-1.5 rounded-full bg-success-100 px-3 text-xs font-semibold uppercase tracking-[0.5px] text-success-700">
              <img src={peppolBadgeIcon} alt="" className="size-4" />
              {t('billDetail.arrivedOverPeppol')}
            </span>

            <div className="ms-auto flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
              >
                <img src={downloadIcon} alt="" className="size-5" />
                {t('billDetail.actions.download')}
              </button>
              <button
                type="button"
                onClick={() => setDecision('queried')}
                className="inline-flex h-[46px] items-center rounded-sm border border-danger-700 bg-white px-4 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100"
              >
                {t('billDetail.actions.reject')}
              </button>
              <button
                type="button"
                onClick={() => setDecision('approved')}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                <img src={hdrBtnIcon} alt="" className="size-[17px]" />
                {t('billDetail.actions.approve')}
              </button>
            </div>
          </div>

          <p className="flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
            <span className="font-medium text-text-quaternary">{t('billDetail.from')}</span>
            <span className="font-semibold text-text-primary">{bill.supplier}</span>
            <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            <span className="font-medium text-text-quaternary">
              {t('billDetail.issuedOn', { date: bill.issued })}
            </span>
            <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            <span className="font-medium text-text-quaternary">
              {t('billDetail.dueOn', { date: bill.due })}
            </span>
            <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            <span className="font-medium text-text-quaternary">{t('billDetail.against')}</span>
            <span className="font-semibold text-text-primary">{bill.order}</span>
          </p>
        </div>

        <BillStepper />

        <div className="flex flex-col gap-5 xl:flex-row">
          {/* Left: the evidence */}
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            {/* Three-way match */}
            <section className="rounded-md border border-[#cfe0d5] bg-[#eef5f0] p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white">
                  <img src={matchOkIcon} alt="" className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold leading-[1.2] text-success-700">
                    {t('billDetail.match.title')}
                  </h2>
                  <p className="mt-1 text-sm font-medium leading-[1.4] text-text-tertiary">
                    {t('billDetail.match.note')}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {(
                  [
                    ['ordered', bill.threeWay.ordered],
                    ['received', bill.threeWay.received],
                    ['billed', bill.threeWay.billed],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="rounded-sm border border-[#cfe0d5] bg-white p-3.5">
                    <div className="flex items-center gap-1.5">
                      <img src={matchOkIcon} alt="" className="size-4" />
                      <span className="text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.5px] text-text-tertiary">
                        {t(`billDetail.match.${key}`)}
                      </span>
                    </div>
                    <p className="mt-2 text-xl font-semibold leading-[1.2] text-text-primary">
                      {value.qty}
                    </p>
                    <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-quaternary">
                      {withRial(value.note)}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Lines */}
            <Card>
              <div className="mb-4 flex flex-wrap items-baseline gap-2">
                <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {t('billDetail.lines.title')}
                </h2>
                <span className="text-sm font-medium text-text-quaternary">
                  {t('billDetail.lines.asSent')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-start">
                  <thead>
                    <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.8px] text-text-quaternary">
                      <th className="py-2 text-start font-semibold">
                        {t('billDetail.lines.item')}
                      </th>
                      <th className="py-2 text-end font-semibold">{t('billDetail.lines.qty')}</th>
                      <th className="py-2 text-end font-semibold">
                        {t('billDetail.lines.unitPrice')}
                      </th>
                      <th className="py-2 text-end font-semibold">{t('billDetail.lines.vat')}</th>
                      <th className="py-2 text-end font-semibold">
                        {t('billDetail.lines.lineTotal')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.lines.map((line) => (
                      <tr key={line.id} className="border-b border-surface-background">
                        <td className="py-3.5">
                          <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                            {line.item}
                          </p>
                          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                            {line.note}
                          </p>
                        </td>
                        <td className="py-3.5 text-end text-sm font-medium text-text-secondary">
                          {line.qty}
                        </td>
                        <td className="py-3.5 text-end text-sm font-medium text-text-secondary">
                          <span className="me-1">
                            <Rial />
                          </span>
                          {line.unitPrice}
                        </td>
                        <td className="py-3.5 text-end text-sm font-medium text-text-secondary">
                          {line.vat}
                        </td>
                        <td className="py-3.5 text-end text-base font-semibold text-text-primary">
                          <span className="me-1">
                            <Rial />
                          </span>
                          {line.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end">
                <dl className="w-full max-w-[340px]">
                  {[
                    ['billDetail.lines.net', bill.totals.net],
                    [t('billDetail.lines.vatRate', { rate: bill.totals.vatRate }), bill.totals.vat],
                  ].map(([label, value], index) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 border-b border-surface-background py-2.5"
                    >
                      <dt className="text-sm font-medium text-text-tertiary">
                        {index === 0 ? t(label) : label}
                      </dt>
                      <dd className="text-sm font-semibold text-text-secondary tabular-nums">
                        <span className="me-1">
                          <Rial />
                        </span>
                        {value}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 pt-3.5">
                    <dt className="text-base font-semibold text-text-primary">
                      {t('billDetail.lines.theyreCharging')}
                    </dt>
                    <dd className="text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                      <span className="me-1">
                        <Rial />
                      </span>
                      {bill.totals.total}
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>

            {/* Linked documents */}
            <Card
              title={t('billDetail.linked.title')}
              action={
                <button
                  type="button"
                  className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                >
                  {t('billDetail.linked.changeMatch')}
                </button>
              }
            >
              <ul className="flex flex-col">
                {bill.linked.map((doc, index) => (
                  <li
                    key={doc.id}
                    className={[
                      'flex items-center gap-3 py-3',
                      index < bill.linked.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background">
                      <img src={LINKED_ICONS[doc.icon]} alt="" className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-[1.2]">
                        {doc.to ? (
                          <Link
                            to={doc.to}
                            className="font-semibold text-primary-700 hover:underline"
                          >
                            {doc.title}
                          </Link>
                        ) : (
                          <span className="font-semibold text-text-primary">{doc.title}</span>
                        )}
                        <span className="font-medium text-text-quaternary">
                          {' · '}
                          {t(doc.kindKey)}
                        </span>
                      </p>
                      <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                        {doc.detail.startsWith('billDetail.') ? t(doc.detail) : doc.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Activity */}
            <Card title={t('billDetail.activity.title')}>
              <ol className="flex flex-col">
                {bill.activity.map((event, index) => (
                  <li key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={[
                          'flex size-7 shrink-0 items-center justify-center rounded-full',
                          event.tone === 'current' ? 'bg-primary-50' : 'bg-success-100',
                        ].join(' ')}
                      >
                        <img
                          src={event.tone === 'current' ? activityIcon : matchOkIcon}
                          alt=""
                          className="size-3.5"
                        />
                      </span>
                      {index < bill.activity.length - 1 ? (
                        <span className="w-px flex-1 bg-border-subtle" />
                      ) : null}
                    </div>
                    <div className="pb-5">
                      <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                        {t(event.title)}
                      </p>
                      <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {withRial(t(event.detail))}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          {/* Right: the decision and the reference */}
          <aside className="flex w-full shrink-0 flex-col gap-5 xl:w-[340px]">
            <section className="rounded-md border border-primary-300 bg-primary-25 p-5">
              <div className="flex items-center gap-2">
                <img src={decisionIcon} alt="" className="size-4" />
                <h2 className="text-base font-semibold leading-[1.2] text-primary-800">
                  {t('billDetail.decision.title')}
                </h2>
              </div>
              <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary">
                <span className="me-1.5">
                  <Rial />
                </span>
                {bill.total}
              </p>
              <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                {t('billDetail.decision.note')}
              </p>

              {decision === 'pending' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setDecision('approved')}
                    className="mt-4 inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-sm bg-primary-700 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    <img src={hdrBtnIcon} alt="" className="size-[17px]" />
                    {t('billDetail.decision.approveForPayment')}
                  </button>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDecision('queried')}
                      className="inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                    >
                      {t('billDetail.decision.queryIt')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecision('held')}
                      className="inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                    >
                      {t('billDetail.decision.putOnHold')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-sm border border-border-subtle bg-white p-3.5">
                  <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                    {t(decisionNoticeKey)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDecision('pending')}
                    className="mt-2 text-sm font-semibold text-primary-700 hover:text-primary-800"
                  >
                    {t('billDetail.decision.undo')}
                  </button>
                </div>
              )}
            </section>

            <Card title={t('billDetail.terms.title')}>
              <dl className="flex flex-col gap-3">
                {[
                  ['billDetail.terms.due', bill.terms.due, ''],
                  ['billDetail.terms.terms', bill.terms.terms, ''],
                  ['billDetail.terms.earlyPayment', bill.terms.earlyPayment, 'text-success-700'],
                  ['billDetail.terms.payTo', bill.terms.payTo, ''],
                ].map(([label, value, tone]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="text-sm font-medium text-text-tertiary">{t(label)}</dt>
                    <dd
                      className={['text-sm font-semibold', tone || 'text-text-primary'].join(' ')}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 flex items-center gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.3] text-text-tertiary">
                <span>{withRial(t(bill.terms.saving))}</span>
              </p>
            </Card>

            <Card title={t('billDetail.compliance.title')}>
              <ul className="flex flex-col gap-2.5">
                {bill.compliance.map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <img src={complianceIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                    <span className="text-sm font-medium leading-[1.3] text-text-tertiary">
                      {t(key)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title={t('billDetail.supplier.title')}>
              <dl className="flex flex-col gap-3">
                {[
                  ['billDetail.supplier.name', bill.supplierCard.name],
                  ['billDetail.supplier.vat', bill.supplierCard.vat],
                  ['billDetail.supplier.theirRef', bill.supplierCard.theirRef],
                  ['billDetail.supplier.openBills', bill.supplierCard.openBills],
                  ['billDetail.supplier.paidOnTime', bill.supplierCard.paidOnTime],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="text-sm font-medium text-text-tertiary">{t(label)}</dt>
                    <dd className="text-sm font-semibold text-text-primary">{withRial(value)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
