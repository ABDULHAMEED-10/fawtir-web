import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Rial, withRial } from '../../components/ui'
import { DebitChecks } from '../../components/debit/DebitChecks'
import { DEBIT_DETAIL, REFUSAL_REASONS, type DebitDecision } from '../../lib/supplierDebitNotes'
import chevronIcon from '../../assets/invoices/chevron.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import acceptIcon from '../../assets/supplier-credit-notes/act-set.svg'
import refuseIcon from '../../assets/supplier-debit-notes/refuse-x.svg'
import eyeIcon from '../../assets/supplier-debit-notes/eye-dark.svg'
import stepDoneIcon from '../../assets/supplier-credit-notes/step-done.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import billIcon from '../../assets/invoice-details/credit-note.svg'
import receiptIcon from '../../assets/create-invoice/doc-delivery.svg'
import fileIcon from '../../assets/bill-capture/file.svg'

const LINKED_ICON = { bill: billIcon, receipt: receiptIcon, file: fileIcon }

/** The rial sign before every figure on this screen, in the figure's own size and colour. */
function Omr({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      <Rial />
    </span>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

export function SupplierDebitNoteDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const note = DEBIT_DETAIL

  /** Nothing is owed until somebody decides, so this starts empty. */
  const [decision, setDecision] = useState<DebitDecision | null>(null)
  /** Refusing asks for a reason first — the panel switches rather than acting straight away. */
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState(REFUSAL_REASONS[0].id)

  const doneKey =
    decision === 'accept'
      ? 'supplierDebitNotes.detail.acceptDone'
      : decision === 'refuse'
        ? 'supplierDebitNotes.detail.refuseDone'
        : 'supplierDebitNotes.detail.holdDone'

  const decisionText = decision
    ? t(doneKey, { bill: note.addsTo, total: note.effect.wouldPay })
    : t('supplierDebitNotes.detail.decisionNote', { bill: note.addsTo })

  const reset = () => {
    setDecision(null)
    setRefusing(false)
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/expenditure/debit-notes"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {t('supplierDebitNotes.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {id ?? note.id}
          </span>
        </div>

        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {id ?? note.id}
              </h1>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-pending-100 px-2.5 text-xs font-medium text-pending-700">
                <span className="size-1.5 rounded-full bg-pending-700" />
                {decision
                  ? t(
                      `supplierDebitNotes.state.${decision === 'accept' ? 'acceptedPlain' : decision === 'refuse' ? 'refused' : 'onHold'}`,
                    )
                  : t('supplierDebitNotes.state.unchecked')}
              </span>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border-subtle px-2.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
                <span aria-hidden="true">+</span>
                {t('supplierDebitNotes.detail.debitNotePeppol')}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium leading-[1.4] text-text-tertiary">
              {t('supplierDebitNotes.detail.from')}{' '}
              <span className="font-semibold text-text-secondary">{note.supplier}</span> ·{' '}
              {t('supplierDebitNotes.detail.issuedOn', { date: '' }).trim()}{' '}
              <span className="font-semibold text-text-secondary">{note.issued}</span> ·{' '}
              {t('supplierDebitNotes.detail.addsTo')}{' '}
              <Link
                to={`/expenditure/bills/${note.addsTo}`}
                className="font-semibold text-text-secondary underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
              >
                {note.addsTo}
              </Link>
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={downloadIcon} alt="" className="size-5" />
              {t('supplierDebitNotes.detail.download')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDecision('refuse')
                setRefusing(false)
              }}
              disabled={decision !== null}
              className="inline-flex h-[46px] items-center rounded-sm border border-warning-700 bg-white px-4 text-sm font-semibold text-warning-700 transition-colors hover:bg-warning-100/60 disabled:opacity-40"
            >
              {t('supplierDebitNotes.upload.refuse')}
            </button>
            <button
              type="button"
              onClick={() => setDecision('accept')}
              disabled={decision !== null}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-pending-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-pending-500 disabled:opacity-40"
            >
              <img src={acceptIcon} alt="" className="size-5" />
              {t('supplierDebitNotes.detail.accept')}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-[22px] xl:flex-row">
          {/* Main column */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* What it would cost */}
            <section className="rounded-md border border-pending-200 bg-pending-100 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white">
                  <span className="relative block size-3.5">
                    <span className="absolute inset-x-0 top-1/2 h-[2.5px] -translate-y-1/2 rounded-full bg-pending-700" />
                    <span className="absolute inset-y-0 left-1/2 w-[2.5px] -translate-x-1/2 rounded-full bg-pending-700" />
                  </span>
                </span>
                <div>
                  <h2 className="text-xl font-medium leading-[1.2] text-pending-700">
                    {withRial(t('supplierDebitNotes.detail.theyWantMore', { amount: note.extra }))}
                  </h2>
                  <p className="mt-1.5 text-sm font-medium leading-[1.4] text-pending-500">
                    {t('supplierDebitNotes.detail.theyWantMoreNote')}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-stretch gap-2.5">
                {[
                  {
                    key: 'theyBilled',
                    value: note.effect.billed,
                    noteKey: note.effect.billedNoteKey,
                    op: '+',
                  },
                  {
                    key: 'thisCharge',
                    value: note.extra,
                    noteKey: note.effect.chargeNoteKey,
                    op: '=',
                  },
                  {
                    key: 'youdPay',
                    value: note.effect.wouldPay,
                    noteKey: note.effect.wouldPayNoteKey,
                  },
                ].map((tile) => (
                  <div key={tile.key} className="flex min-w-0 flex-1 items-center gap-2.5">
                    <div className="min-w-0 flex-1 rounded-sm border border-pending-200 bg-white px-4 py-3.5">
                      <p className="text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.5px] text-text-tertiary">
                        {t(`supplierDebitNotes.detail.${tile.key}`)}
                      </p>
                      <p className="mt-2 flex items-baseline gap-1 whitespace-nowrap text-[22px] font-semibold leading-[1.2] text-text-primary max-md:text-lg">
                        <Omr />
                        {tile.value}
                      </p>
                      <p className="mt-1.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                        {t(tile.noteKey)}
                      </p>
                    </div>
                    {tile.op ? (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-text-tertiary">
                        {tile.op}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            {/* The automatic read */}
            <Card title={t('supplierDebitNotes.detail.looksRight')}>
              <DebitChecks
                checks={note.checks}
                fineLabel={t('supplierDebitNotes.detail.fine')}
                checkLabel={t('supplierDebitNotes.detail.check')}
                summaryTitle={t('supplierDebitNotes.detail.summaryTitle')}
                summaryBody={t('supplierDebitNotes.detail.summaryBody')}
              />
            </Card>

            {/* Lines */}
            <Card title={t('supplierDebitNotes.detail.charging')}>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                      {['item', 'qty', 'unitPrice', 'vat', 'lineTotal'].map((key, index) => (
                        <th
                          key={key}
                          className={[
                            'pb-2.5 font-semibold',
                            index === 0 ? 'text-start' : 'text-end',
                          ].join(' ')}
                        >
                          {t(`supplierDebitNotes.detail.col.${key}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {note.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-4 pe-4">
                          <p className="text-base font-semibold leading-[1.2] text-text-primary">
                            {line.item}
                          </p>
                          <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                            {t(line.noteKey)}
                          </p>
                        </td>
                        <td className="py-4 text-end text-sm font-medium text-text-secondary">
                          {line.qty}
                        </td>
                        <td className="py-4 text-end text-sm font-medium text-text-secondary">
                          <Omr className="me-1" />
                          {line.unitPrice}
                        </td>
                        <td className="py-4 text-end text-sm font-medium text-text-secondary">
                          {line.vat}
                        </td>
                        <td className="py-4 text-end text-sm font-semibold text-text-primary">
                          +<Omr className="me-1" />
                          {line.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="ms-auto mt-2 w-full max-w-[360px]">
                {[
                  [t('supplierDebitNotes.detail.netCharged'), note.totals.net],
                  [t('supplierDebitNotes.detail.vatRow'), note.totals.vat],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-1.5">
                    <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                    <dd className="text-sm font-semibold text-text-secondary tabular-nums">
                      +<Omr className="me-1" />
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3.5">
                  <dt className="text-base font-semibold text-text-primary">
                    {t('supplierDebitNotes.detail.totalCharged')}
                  </dt>
                  <dd className="flex items-baseline gap-1 text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                    +<Omr />
                    {note.totals.total}
                  </dd>
                </div>
              </dl>
            </Card>

            {/* Linked */}
            <Card title={t('supplierDebitNotes.detail.linkedTitle')}>
              <ul className="mt-2 flex flex-col">
                {note.linked.map((doc, index) => (
                  <li
                    key={doc.id}
                    className={[
                      'flex items-center gap-3 py-3.5',
                      index < note.linked.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background">
                      <img src={LINKED_ICON[doc.icon]} alt="" className="size-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-[1.3]">
                        {doc.to ? (
                          <>
                            <Link
                              to={doc.to}
                              className="font-semibold text-primary-700 hover:underline"
                            >
                              {doc.title}
                            </Link>
                            <span className="font-semibold text-text-primary">
                              {' '}
                              · {t(doc.kindKey)}
                            </span>
                          </>
                        ) : (
                          <span className="font-semibold text-text-primary">{doc.title}</span>
                        )}
                      </p>
                      <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                        {withRial(t(doc.detailKey))}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Activity */}
            <Card title={t('supplierDebitNotes.detail.activityTitle')}>
              <ol className="mt-3 flex flex-col">
                {note.activity.map((entry, index) => (
                  <li key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={[
                          'flex size-6 shrink-0 items-center justify-center rounded-full',
                          entry.tone === 'current' ? 'bg-pending-100' : 'bg-success-100',
                        ].join(' ')}
                      >
                        <img
                          src={entry.tone === 'current' ? eyeIcon : stepDoneIcon}
                          alt=""
                          className={entry.tone === 'current' ? 'size-3.5' : 'size-3'}
                        />
                      </span>
                      {index < note.activity.length - 1 ? (
                        <span className="w-px flex-1 bg-border-subtle" />
                      ) : null}
                    </div>
                    <div className={index < note.activity.length - 1 ? 'pb-5' : ''}>
                      <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                        {t(entry.titleKey)}
                      </p>
                      <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {t(entry.detailKey)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          {/* Right column */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            {/* The decision */}
            <section className="rounded-md border border-pending-200 bg-pending-100 p-5">
              <p className="flex items-center gap-2 text-base font-semibold leading-[1.2] text-pending-700">
                <img src={eyeIcon} alt="" className="size-5" />
                {t('supplierDebitNotes.detail.yourDecision')}
              </p>
              <p className="mt-3 flex items-baseline gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary">
                +<Omr />
                {note.extra}
              </p>
              <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                {withRial(decisionText)}
              </p>

              {decision ? (
                <button
                  type="button"
                  onClick={reset}
                  className="mt-4 inline-flex h-[46px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
                >
                  {t('supplierDebitNotes.detail.undo')}
                </button>
              ) : refusing ? (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-text-primary">
                    {t('supplierDebitNotes.detail.pickReason')}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {REFUSAL_REASONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setReason(option.id)}
                        className={[
                          'inline-flex h-[34px] items-center rounded-sm border px-3 text-xs font-medium transition-colors',
                          reason === option.id
                            ? 'border-warning-700 bg-white text-warning-700'
                            : 'border-border-subtle bg-white text-text-secondary hover:border-warning-700',
                        ].join(' ')}
                      >
                        {t(option.labelKey)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDecision('refuse')}
                    className="mt-3 inline-flex h-[46px] w-full items-center justify-center rounded-sm bg-warning-700 text-sm font-semibold text-white transition-colors hover:opacity-90"
                  >
                    {t('supplierDebitNotes.detail.send')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefusing(false)}
                    className="mt-2 inline-flex h-[38px] w-full items-center justify-center rounded-sm text-sm font-medium text-text-tertiary hover:text-text-secondary"
                  >
                    {t('supplierDebitNotes.detail.cancel')}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setRefusing(true)}
                    className="mt-4 inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-sm border border-warning-700 bg-white text-sm font-semibold text-warning-700 transition-colors hover:bg-warning-100/60"
                  >
                    <img src={refuseIcon} alt="" className="size-4" />
                    {t('supplierDebitNotes.detail.refuseAndTell')}
                  </button>
                  <div className="mt-2.5 flex gap-2.5">
                    {(
                      [
                        { id: 'accept' as const, labelKey: 'supplierDebitNotes.detail.accept' },
                        { id: 'hold' as const, labelKey: 'supplierDebitNotes.detail.hold' },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setDecision(option.id)}
                        className="inline-flex h-[42px] flex-1 items-center justify-center rounded-sm border border-border-subtle bg-white px-2 text-sm font-medium text-text-secondary transition-colors hover:border-pending-200"
                      >
                        {t(option.labelKey)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* The rate card it is measured against */}
            <Card title={t('supplierDebitNotes.detail.rateCardTitle')}>
              <dl className="mt-3 flex flex-col">
                {[
                  {
                    label: t('supplierDebitNotes.detail.rateCard.perDelivery'),
                    value: (
                      <>
                        <Omr className="me-1" />
                        {note.rateCard.perDelivery}
                      </>
                    ),
                  },
                  {
                    label: t('supplierDebitNotes.detail.rateCard.normalHours'),
                    value: note.rateCard.normalHours,
                  },
                  {
                    label: t('supplierDebitNotes.detail.rateCard.surcharges'),
                    value: t(note.rateCard.surchargesKey),
                    /* "None" is the whole reason to push back, so it is not set as plain text. */
                    tone: 'warning' as const,
                  },
                  {
                    label: t('supplierDebitNotes.detail.rateCard.signedAt'),
                    value: note.rateCard.signedAt,
                  },
                  {
                    label: t('supplierDebitNotes.detail.rateCard.cardSigned'),
                    value: note.rateCard.cardSigned,
                  },
                ].map((row, index, all) => (
                  <div
                    key={row.label}
                    className={[
                      'flex items-center justify-between gap-3 py-2.5',
                      index < all.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">
                      {row.label}
                    </dt>
                    <dd
                      className={[
                        'shrink-0 text-sm font-semibold tabular-nums',
                        row.tone === 'warning' ? 'text-warning-700' : 'text-text-primary',
                      ].join(' ')}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background p-3 text-xs font-medium leading-[1.4] text-text-tertiary">
                <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                {t('supplierDebitNotes.detail.rateCardNote')}
              </p>
            </Card>

            {/* VAT */}
            <Card title={t('supplierDebitNotes.detail.vatEffect')}>
              <dl className="mt-3 flex flex-col">
                {[
                  [
                    t('supplierDebitNotes.detail.vatOnBill', { bill: note.addsTo }),
                    note.vat.onBill,
                    false,
                  ],
                  [t('supplierDebitNotes.detail.vatAdded'), note.vat.added, true],
                  [t('supplierDebitNotes.detail.vatReclaimable'), note.vat.reclaimable, false],
                ].map(([label, value, positive], index) => (
                  <div
                    key={String(label)}
                    className={[
                      'flex items-center justify-between gap-3 py-2.5',
                      index < 2 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">
                      {String(label)}
                    </dt>
                    <dd className="shrink-0 text-sm font-semibold text-text-primary tabular-nums">
                      {positive ? '+' : null}
                      <Omr className="me-1" />
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background p-3 text-xs font-medium leading-[1.4] text-text-tertiary">
                <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                {t('supplierDebitNotes.detail.vatNote')}
              </p>
            </Card>

            {/* Supplier */}
            <Card title={t('supplierDebitNotes.detail.supplierTitle')}>
              <dl className="mt-3 flex flex-col">
                {[
                  {
                    label: t('supplierDebitNotes.detail.supplierName'),
                    value: note.supplierCard.name,
                  },
                  {
                    label: t('supplierDebitNotes.detail.supplierVat'),
                    value: note.supplierCard.vat,
                  },
                  {
                    label: t('supplierDebitNotes.detail.openBills'),
                    value: note.supplierCard.openBills,
                  },
                  {
                    label: t('supplierDebitNotes.detail.debitNotes'),
                    value: t(note.supplierCard.debitNotes),
                  },
                  {
                    label: t('supplierDebitNotes.detail.refusedBefore'),
                    value: t(note.supplierCard.refusedBefore),
                    tone: 'warning' as const,
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">
                      {row.label}
                    </dt>
                    <dd
                      className={[
                        'shrink-0 text-sm font-semibold',
                        row.tone === 'warning' ? 'text-warning-700' : 'text-text-primary',
                      ].join(' ')}
                    >
                      {withRial(row.value)}
                    </dd>
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
