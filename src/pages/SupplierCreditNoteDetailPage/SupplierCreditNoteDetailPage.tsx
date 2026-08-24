import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { CREDIT_DETAIL, type CreditUse } from '../../lib/supplierCreditNotes'
import chevronIcon from '../../assets/invoices/chevron.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import setIcon from '../../assets/supplier-credit-notes/act-set.svg'
import decisionIcon from '../../assets/bill-detail/decision.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import stepDoneIcon from '../../assets/supplier-credit-notes/step-done.svg'
import billIcon from '../../assets/invoice-details/credit-note.svg'
import receiptIcon from '../../assets/create-invoice/doc-delivery.svg'
import fileIcon from '../../assets/bill-capture/file.svg'

const LINKED_ICON = { bill: billIcon, receipt: receiptIcon, file: fileIcon }

/** Stands in for the receipt reference while the sentence is split around it. */
const RECEIPT_SLOT = '\u0000'

/** OMR is set small and uppercase before every figure on this screen. */
function Omr({ className = '' }: { className?: string }) {
  return (
    <span
      className={['text-[11px] font-semibold uppercase text-text-tertiary', className].join(' ')}
    >
      OMR
    </span>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

export function SupplierCreditNoteDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const note = CREDIT_DETAIL

  /** Undecided until someone picks — that is what the whole right column is for. */
  const [decision, setDecision] = useState<CreditUse | null>(null)

  const DECISIONS: { id: CreditUse; labelKey: string; doneKey: string }[] = [
    {
      id: 'setAgainst',
      labelKey: 'supplierCreditNotes.detail.setAgainst',
      doneKey: 'supplierCreditNotes.detail.setDone',
    },
    {
      id: 'hold',
      labelKey: 'supplierCreditNotes.detail.keepAsCredit',
      doneKey: 'supplierCreditNotes.detail.keptDone',
    },
    {
      id: 'refund',
      labelKey: 'supplierCreditNotes.detail.askRefund',
      doneKey: 'supplierCreditNotes.detail.refundDone',
    },
  ]

  const decided = DECISIONS.find((option) => option.id === decision)

  /**
   * The reason sentence names the purchase receipt, and that name has to be a link.
   *
   * Splitting the sentence into two keys would leave translators guessing where the link goes,
   * so the one key keeps its {{receipt}} placeholder and the two halves are recovered here.
   */
  const whyParts = t('supplierCreditNotes.detail.whyBody', { receipt: RECEIPT_SLOT }).split(
    RECEIPT_SLOT,
  )

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/expenditure/credit-notes"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {t('supplierCreditNotes.title')}
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
                {t('supplierCreditNotes.state.notUsed')}
              </span>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-border-subtle px-2.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
                <span className="h-[1.5px] w-2.5 rounded-full bg-text-tertiary" />
                {t('supplierCreditNotes.detail.creditNotePeppol')}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium leading-[1.4] text-text-tertiary">
              {t('supplierCreditNotes.detail.from')}{' '}
              <span className="font-semibold text-text-secondary">{note.supplier}</span> ·{' '}
              {t('supplierCreditNotes.detail.issuedOn', { date: '' }).trim()}{' '}
              <span className="font-semibold text-text-secondary">{note.issued}</span> ·{' '}
              {t('supplierCreditNotes.detail.corrects')}{' '}
              <Link
                to={`/expenditure/bills/${note.corrects}`}
                className="font-semibold text-text-secondary underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
              >
                {note.corrects}
              </Link>
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={downloadIcon} alt="" className="size-5" />
              {t('supplierCreditNotes.detail.download')}
            </button>
            <button
              type="button"
              onClick={() => setDecision('setAgainst')}
              disabled={decision !== null}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:bg-success-700 disabled:opacity-100"
            >
              <img src={setIcon} alt="" className="size-5" />
              {decided ? t(decided.doneKey) : t('supplierCreditNotes.detail.setAgainst')}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-[22px] xl:flex-row">
          {/* Main column */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* The effect, up front */}
            <section className="rounded-md border border-[#cfe0d5] bg-[#eef5f0] p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white">
                  <span className="h-[2.5px] w-3.5 rounded-full bg-[#3d5648]" />
                </span>
                <div>
                  <h2 className="text-xl font-medium leading-[1.2] text-[#2f4438]">
                    {t('supplierCreditNotes.detail.youllPayLess', { amount: note.credit })}
                  </h2>
                  <p className="mt-1.5 text-sm font-medium leading-[1.4] text-[#4f6857]">
                    {t('supplierCreditNotes.detail.youllPayLessNote')}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-stretch gap-2.5">
                {[
                  {
                    key: 'theyBilled',
                    value: note.effect.billed,
                    noteKey: note.effect.billedNoteKey,
                    op: '−',
                  },
                  {
                    key: 'thisCredit',
                    value: note.credit,
                    noteKey: note.effect.creditNoteKey,
                    op: '=',
                  },
                  {
                    key: 'youllPay',
                    value: note.effect.willPay,
                    noteKey: note.effect.willPayNoteKey,
                  },
                ].map((tile) => (
                  <div key={tile.key} className="flex min-w-0 flex-1 items-center gap-2.5">
                    <div className="min-w-0 flex-1 rounded-sm border border-[#cfe0d5] bg-white px-4 py-3.5">
                      <p className="text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.5px] text-text-tertiary">
                        {t(`supplierCreditNotes.detail.${tile.key}`)}
                      </p>
                      <p className="mt-2 flex items-baseline gap-1 whitespace-nowrap text-[22px] font-semibold leading-[1.2] text-text-primary">
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

            {/* Why */}
            <Card title={t('supplierCreditNotes.detail.whyTitle')}>
              <p className="mt-3 text-sm font-medium leading-[1.6] text-text-secondary">
                {whyParts[0]}
                <Link
                  to={`/trade-documents/delivery-notes/${note.receiptRef}`}
                  className="text-primary-700 hover:underline"
                >
                  {note.receiptRef}
                </Link>
                {whyParts[1]}
              </p>
              <blockquote className="mt-4 border-s-2 border-border-subtle ps-3 text-sm font-medium italic leading-[1.5] text-text-tertiary">
                {t('supplierCreditNotes.detail.whyQuote')}
              </blockquote>
            </Card>

            {/* Lines */}
            <Card title={t('supplierCreditNotes.detail.whatsCredited')}>
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
                          {t(`supplierCreditNotes.detail.col.${key}`)}
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
                          −<Omr className="me-1" />
                          {line.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="ms-auto mt-2 w-full max-w-[360px]">
                {[
                  [t('supplierCreditNotes.detail.netCredited'), note.totals.net],
                  [t('supplierCreditNotes.detail.vatRow'), note.totals.vat],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-1.5">
                    <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                    <dd className="text-sm font-semibold text-text-secondary tabular-nums">
                      −<Omr className="me-1" />
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3.5">
                  <dt className="text-base font-semibold text-text-primary">
                    {t('supplierCreditNotes.detail.totalCredit')}
                  </dt>
                  <dd className="flex items-baseline gap-1 text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                    −<Omr />
                    {note.totals.total}
                  </dd>
                </div>
              </dl>
            </Card>

            {/* Linked */}
            <Card title={t('supplierCreditNotes.detail.linkedTitle')}>
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
                          <Link
                            to={doc.to}
                            className="font-semibold text-primary-700 hover:underline"
                          >
                            {doc.title}
                          </Link>
                        ) : (
                          <span className="font-semibold text-text-primary">{doc.title}</span>
                        )}
                        {doc.to ? (
                          <span className="font-semibold text-text-primary">
                            {' '}
                            · {t(doc.kindKey)}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                        {t(doc.detailKey)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Activity */}
            <Card title={t('supplierCreditNotes.detail.activityTitle')}>
              <ol className="mt-3 flex flex-col">
                {note.activity.map((entry, index) => (
                  <li key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={[
                          'flex size-6 shrink-0 items-center justify-center rounded-full',
                          entry.tone === 'current' ? 'bg-primary-50' : 'bg-success-100',
                        ].join(' ')}
                      >
                        {entry.tone === 'current' ? (
                          <span className="h-[2px] w-2.5 rounded-full bg-primary-700" />
                        ) : (
                          <img src={stepDoneIcon} alt="" className="size-3" />
                        )}
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
            <section className="rounded-md border border-primary-300 bg-primary-25 p-5">
              <p className="flex items-center gap-2 text-base font-semibold leading-[1.2] text-primary-700">
                <img src={decisionIcon} alt="" className="size-5" />
                {t('supplierCreditNotes.detail.yourDecision')}
              </p>
              <p className="mt-3 flex items-baseline gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary">
                −<Omr />
                {note.credit}
              </p>
              <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                {decided
                  ? t('supplierCreditNotes.detail.decisionTaken', { what: t(decided.doneKey) })
                  : t('supplierCreditNotes.detail.decisionNote', { bill: note.corrects })}
              </p>

              {decided ? (
                <button
                  type="button"
                  onClick={() => setDecision(null)}
                  className="mt-4 inline-flex h-[46px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('supplierCreditNotes.detail.undo')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDecision('setAgainst')}
                    className="mt-4 inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-sm bg-primary-700 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    <img src={setIcon} alt="" className="size-5" />
                    {t('supplierCreditNotes.detail.setAgainst')}
                  </button>
                  <div className="mt-2.5 flex gap-2.5">
                    {DECISIONS.slice(1).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setDecision(option.id)}
                        className="inline-flex h-[42px] flex-1 items-center justify-center rounded-sm border border-border-subtle bg-white px-2 text-sm font-medium text-text-secondary transition-colors hover:border-primary-300 hover:bg-white"
                      >
                        {t(option.labelKey)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* VAT */}
            <Card title={t('supplierCreditNotes.detail.vatEffect')}>
              <dl className="mt-3 flex flex-col">
                {[
                  [t('supplierCreditNotes.detail.vatClaimed'), note.vat.claimed, false],
                  [t('supplierCreditNotes.detail.vatReduced'), note.vat.reduced, true],
                  [t('supplierCreditNotes.detail.vatReclaimable'), note.vat.reclaimable, false],
                ].map(([label, value, negative], index) => (
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
                      {negative ? '−' : null}
                      <Omr className="me-1" />
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background p-3 text-xs font-medium leading-[1.4] text-text-tertiary">
                <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                {t('supplierCreditNotes.detail.vatNote')}
              </p>
            </Card>

            {/* Compliance */}
            <Card title={t('supplierCreditNotes.detail.complianceTitle')}>
              <ul className="mt-3 flex flex-col gap-2.5">
                {note.compliance.map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <img src={tickIcon} alt="" className="mt-px size-4 shrink-0" />
                    <span className="text-sm font-medium leading-[1.4] text-text-secondary">
                      {t(key)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Supplier */}
            <Card title={t('supplierCreditNotes.detail.supplierTitle')}>
              <dl className="mt-3 flex flex-col">
                {[
                  [t('supplierCreditNotes.detail.supplierName'), note.supplierCard.name],
                  [t('supplierCreditNotes.detail.supplierVat'), note.supplierCard.vat],
                  [t('supplierCreditNotes.detail.openBills'), note.supplierCard.openBills],
                  [t('supplierCreditNotes.detail.creditNotes'), t(note.supplierCard.creditNotes)],
                  [
                    t('supplierCreditNotes.detail.shortDeliveries'),
                    note.supplierCard.shortDeliveries,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">
                      {label}
                    </dt>
                    <dd className="shrink-0 text-sm font-semibold text-text-primary">{value}</dd>
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
