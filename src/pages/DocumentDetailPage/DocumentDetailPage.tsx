import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ShareDocumentModal } from '../../components/documents/ShareDocumentModal'
import {
  DOC_DETAIL,
  DOC_RECORDS,
  FILE_BADGE,
  formatSize,
  totalKb,
  type DocFile,
} from '../../lib/documents'
import verifiedIcon from '../../assets/documents/verified.svg'
import kpiHoldIcon from '../../assets/documents/kpi-hold.svg'
import recInvoiceIcon from '../../assets/documents/rec-invoice.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import sendIcon from '../../assets/invoice-details/send.svg'
import copyIcon from '../../assets/invoice-details/copy.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import customerIcon from '../../assets/create-invoice/doc-order.svg'
import deliveryIcon from '../../assets/create-invoice/doc-delivery.svg'
import infoIcon from '../../assets/expenditure-reminders/info.svg'

const BADGE_TONE = {
  blue: 'bg-primary-50 text-primary-700',
  green: 'bg-success-100 text-[#3d5648]',
  grey: 'bg-surface-background text-text-tertiary',
}

const RELATES_ICON = {
  customer: customerIcon,
  order: recInvoiceIcon,
  delivery: deliveryIcon,
}

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium leading-[1.3] text-text-quaternary">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-[1.3] text-text-primary">{children}</p>
    </div>
  )
}

/** A value that is a code rather than prose — Peppol IDs, UUIDs. */
function Code({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-[3px] bg-surface-background px-1.5 py-0.5 font-mono text-xs font-medium text-text-secondary">
      {children}
    </span>
  )
}

export function DocumentDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const detail = DOC_DETAIL

  /** The record carries the files; the detail carries what the XML says. */
  const record = useMemo(
    () => DOC_RECORDS.find((entry) => entry.id === (id ?? detail.id)) ?? DOC_RECORDS[0],
    [detail.id, id],
  )

  const [activeFile, setActiveFile] = useState(record.files[0].id)
  const [onHold, setOnHold] = useState(detail.legalHoldApplied)
  const [checked, setChecked] = useState(false)
  const [tags, setTags] = useState(detail.tags)
  const [newTag, setNewTag] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [sharing, setSharing] = useState(false)

  const size = formatSize(totalKb(record))
  const sheet = detail.sheet
  const keptYear = record.keptUntil.split(' ').at(-1) ?? ''

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/compliance/documents"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {t('documents.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {record.title}
          </span>
        </div>

        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {record.title}
              </h1>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
                <span className="size-1.5 rounded-full bg-[#3d5648]" />
                {t('documents.status.tddAccepted')}
              </span>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-surface-background px-2.5 text-xs font-medium text-text-tertiary">
                <span className="size-1.5 rounded-full bg-text-quaternary" />
                {t('documents.detail.keptChip', { date: record.keptUntil })}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium leading-[1.4] text-text-tertiary">
              {t('documents.detail.salesInvoiceTo')}{' '}
              <span className="font-semibold text-text-secondary">{record.party}</span> ·{' '}
              {t('documents.detail.issued', { date: detail.issued })} ·{' '}
              <span className="font-semibold text-text-secondary">
                {t('documents.filesCount', { count: record.files.length })}
              </span>{' '}
              · {size}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={printIcon} alt="" className="size-5" />
              {t('documents.detail.print')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={downloadIcon} alt="" className="size-5" />
              {t('documents.detail.zip', { count: record.files.length })}
            </button>
            <button
              type="button"
              onClick={() => setSharing(true)}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={sendIcon} alt="" className="size-5 brightness-0 invert" />
              {t('documents.detail.share')}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          {/* The files in this record */}
          <section className="w-full self-start overflow-hidden rounded-md bg-surface-card xl:w-[268px] xl:shrink-0">
            <div className="border-b border-surface-background p-4">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('documents.detail.filesInRecord', { count: record.files.length })}
              </h2>
              <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                {t('documents.detail.everythingBelonging', { id: record.title })}
              </p>
            </div>
            <ul className="flex flex-col">
              {record.files.map((file: DocFile) => {
                const active = file.id === activeFile
                const badge = FILE_BADGE[file.icon]
                return (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => setActiveFile(file.id)}
                      className={[
                        'flex w-full flex-col items-start border-b border-surface-background p-4 text-start transition-colors last:border-0',
                        active
                          ? 'border-s-[3px] border-s-primary-700 bg-primary-25 ps-[13px]'
                          : 'hover:bg-surface-tab-bar',
                      ].join(' ')}
                    >
                      <span className="flex w-full items-start justify-between gap-2">
                        <span
                          className={[
                            'text-sm font-semibold leading-[1.3]',
                            active ? 'text-primary-700' : 'text-text-primary',
                          ].join(' ')}
                        >
                          {file.name}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-text-quaternary">
                          {formatSize(file.kb)}
                        </span>
                      </span>
                      <span className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                        {t(file.noteKey)}
                      </span>
                      {badge ? (
                        <span
                          className={[
                            'mt-2 inline-flex h-[20px] items-center rounded-[3px] px-1.5 text-[10px] font-semibold uppercase tracking-[0.5px]',
                            BADGE_TONE[badge.tone],
                          ].join(' ')}
                        >
                          {t(badge.labelKey)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {/* The document, laid out to be read */}
          <div className="flex min-w-0 flex-1 flex-col rounded-md bg-surface-card p-4">
            <div className="flex items-center justify-end gap-1.5">
              {[
                { icon: copyIcon, label: t('documents.detail.copy') },
                { icon: printIcon, label: t('documents.detail.printFile') },
                { icon: downloadIcon, label: t('documents.detail.download') },
                { icon: fullscreenIcon, label: t('documents.detail.fullscreen') },
              ].map((button) => (
                <button
                  key={button.label}
                  type="button"
                  aria-label={button.label}
                  className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
                >
                  <img src={button.icon} alt="" className="size-[18px]" />
                </button>
              ))}
            </div>

            <article className="mt-3 rounded-sm border border-border-subtle bg-white p-6">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold leading-[1.2] text-text-primary">
                    {t('documents.detail.taxInvoice', { id: sheet.number })}
                  </h2>
                  <p className="mt-1.5 text-sm font-medium leading-[1.3] text-text-quaternary">
                    {t('documents.detail.laidOut')}
                  </p>
                </div>
                <span className="inline-flex h-[28px] items-center gap-1.5 rounded-sm bg-success-100 px-2.5 text-xs font-semibold text-[#3d5648]">
                  <img src={verifiedIcon} alt="" className="size-3.5" />
                  {t('documents.detail.signatureValid')}
                </span>
              </header>

              {[
                {
                  title: t('documents.detail.theDocument'),
                  fields: [
                    [t('documents.detail.invoiceNumber'), sheet.number],
                    [t('documents.detail.type'), t(sheet.typeKey)],
                    [t('documents.detail.issuedOn'), sheet.issued],
                    [t('documents.detail.paymentDue'), sheet.due],
                    [t('documents.detail.currency'), sheet.currency],
                    [t('documents.detail.uuid'), <Code key="uuid">{sheet.uuid}</Code>],
                  ],
                },
                {
                  title: t('documents.detail.whoSent'),
                  fields: [
                    [t('documents.detail.business'), sheet.sender.name],
                    [t('documents.detail.vatNumber'), sheet.sender.vat],
                    [t('documents.detail.peppolId'), <Code key="sp">{sheet.sender.peppol}</Code>],
                    [t('documents.detail.address'), sheet.sender.address],
                  ],
                },
                {
                  title: t('documents.detail.whoReceived'),
                  fields: [
                    [t('documents.detail.business'), sheet.receiver.name],
                    [t('documents.detail.vatNumber'), sheet.receiver.vat],
                    [t('documents.detail.peppolId'), <Code key="rp">{sheet.receiver.peppol}</Code>],
                    [t('documents.detail.theirOrder'), sheet.receiver.order],
                  ],
                },
              ].map((block) => (
                <section key={block.title} className="mt-6 border-t border-surface-background pt-4">
                  <h3 className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-text-quaternary">
                    {block.title}
                  </h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {block.fields.map(([label, value]) => (
                      <Field key={String(label)} label={String(label)}>
                        {value}
                      </Field>
                    ))}
                  </div>
                </section>
              ))}

              <section className="mt-6 border-t border-surface-background pt-4">
                <h3 className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-text-quaternary">
                  {t('documents.detail.whatCharged')}
                </h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[440px] border-collapse">
                    <thead>
                      <tr className="border-b border-surface-background text-[10px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
                        {['item', 'qty', 'unit', 'vat', 'amount'].map((key, index) => (
                          <th
                            key={key}
                            className={[
                              'pb-2 font-semibold',
                              index === 0 ? 'text-start' : 'text-end',
                            ].join(' ')}
                          >
                            {t(`documents.detail.col.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.lines.map((line) => (
                        <tr key={line.item} className="border-b border-surface-background">
                          <td className="py-3 pe-4 text-sm font-medium text-text-secondary">
                            {line.item}
                          </td>
                          <td className="py-3 text-end text-sm font-medium text-text-secondary">
                            {line.qty}
                          </td>
                          <td className="py-3 text-end text-sm font-medium text-text-secondary">
                            {line.unit}
                          </td>
                          <td className="py-3 text-end text-sm font-medium text-text-secondary">
                            {line.vat}
                          </td>
                          <td className="py-3 text-end text-sm font-semibold text-text-primary">
                            {line.amount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <dl className="ms-auto mt-3 w-full max-w-[300px]">
                  {[
                    [t('documents.detail.net'), sheet.net],
                    [t('documents.detail.vatRow'), sheet.vat],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-1.5">
                      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                      <dd className="text-sm font-medium text-text-secondary tabular-nums">
                        {value}
                      </dd>
                    </div>
                  ))}
                  <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-[#151c2d] pt-3">
                    <dt className="text-base font-semibold text-text-primary">
                      {t('documents.detail.totalOmr')}
                    </dt>
                    <dd className="text-base font-semibold text-text-primary tabular-nums">
                      {sheet.total}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="mt-6 border-t border-surface-background pt-4">
                <h3 className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-text-quaternary">
                  {t('documents.detail.howTravelled')}
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label={t('documents.detail.sentOver')}>{sheet.transport.sentOver}</Field>
                  <Field label={t('documents.detail.profile')}>{sheet.transport.profile}</Field>
                  <Field label={t('documents.detail.deliveredAt')}>
                    {sheet.transport.deliveredAt}
                  </Field>
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-[1.3] text-text-quaternary">
                      {t('documents.detail.validation')}
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-[1.3] text-success-700">
                      {t(sheet.transport.validationKey)}
                    </p>
                  </div>
                </div>
              </section>
            </article>
          </div>

          {/* Right column */}
          <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
            <Card title={t('documents.detail.howLongKept')}>
              <dl className="mt-3 flex flex-col">
                {[
                  [t('documents.detail.keptUntil'), record.keptUntil],
                  [t('documents.detail.timeRemaining'), t(detail.remainingKey)],
                  [t('documents.detail.reason'), t(detail.reasonKey)],
                  [
                    t('documents.detail.legalHold'),
                    t(onHold ? 'documents.detail.applied' : 'documents.detail.notApplied'),
                  ],
                ].map(([label, value], index) => (
                  <div
                    key={String(label)}
                    className={[
                      'flex items-center justify-between gap-3 py-2.5',
                      index < 3 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">
                      {String(label)}
                    </dt>
                    <dd className="shrink-0 text-sm font-semibold text-text-primary">
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background p-3 text-xs font-medium leading-[1.5] text-text-tertiary">
                <img src={kpiHoldIcon} alt="" className="mt-px size-4 shrink-0 invert-[.45]" />
                {t('documents.detail.nobodyCanEdit', { year: keptYear })}
              </p>

              <button
                type="button"
                onClick={() => setOnHold((value) => !value)}
                className={[
                  'mt-3 inline-flex h-[44px] w-full items-center justify-center rounded-sm border text-sm font-semibold transition-colors',
                  onHold
                    ? 'border-pending-200 bg-pending-100 text-pending-700 hover:bg-pending-100/70'
                    : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                ].join(' ')}
              >
                {t(onHold ? 'documents.detail.liftHold' : 'documents.detail.placeHold')}
              </button>
            </Card>

            <Card
              title={t('documents.detail.proofTitle')}
              action={
                <button
                  type="button"
                  onClick={() => setChecked(true)}
                  className="text-sm font-semibold text-primary-700 hover:underline"
                >
                  {t('documents.detail.checkNow')}
                </button>
              }
            >
              <dl className="mt-3 flex flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-surface-background py-2.5">
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t('documents.detail.fingerprintTaken')}
                  </dt>
                  <dd className="shrink-0 text-sm font-semibold text-text-primary">
                    {detail.fingerprint.takenAt}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t('documents.detail.lastChecked')}
                  </dt>
                  <dd className="shrink-0 text-sm font-semibold text-text-primary">
                    {checked
                      ? t('documents.detail.justNowMatches')
                      : t(detail.fingerprint.lastCheckedKey, {
                          time: detail.fingerprint.lastCheckedAt,
                        })}
                  </dd>
                </div>
              </dl>

              <div className="mt-2 rounded-sm bg-surface-background p-3">
                <p className="text-[10px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
                  {t('documents.detail.shaOf', { file: detail.fingerprint.ofFile })}
                </p>
                <p className="mt-1.5 whitespace-pre-line break-all font-mono text-[11px] leading-[1.5] text-text-tertiary">
                  {detail.fingerprint.sha}
                </p>
              </div>
            </Card>

            <Card title={t('documents.detail.relatesTitle')}>
              <ul className="mt-2 flex flex-col">
                {detail.relates.map((entry, index) => (
                  <li
                    key={entry.id}
                    className={[
                      'flex items-center gap-3 py-3',
                      index < detail.relates.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
                      <img src={RELATES_ICON[entry.icon]} alt="" className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        to={entry.to}
                        className="text-sm font-semibold leading-[1.3] text-primary-700 hover:underline"
                      >
                        {entry.title}
                      </Link>
                      <p className="mt-0.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                        {t(entry.noteKey)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title={t('documents.detail.tagsTitle')}>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex h-[30px] items-center gap-1.5 rounded-sm bg-primary-50 ps-2.5 pe-1.5 text-xs font-medium text-primary-700"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags((list) => list.filter((entry) => entry !== tag))}
                      aria-label={t('documents.detail.removeTag', { tag })}
                      className="inline-flex size-4 items-center justify-center rounded-full text-sm leading-none text-primary-700/70 hover:bg-white hover:text-primary-800"
                    >
                      ×
                    </button>
                  </span>
                ))}

                {addingTag ? (
                  <input
                    autoFocus
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    onBlur={() => setAddingTag(false)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && newTag.trim()) {
                        setTags((list) =>
                          list.includes(newTag.trim()) ? list : [...list, newTag.trim()],
                        )
                        setNewTag('')
                        setAddingTag(false)
                      }
                      if (event.key === 'Escape') setAddingTag(false)
                    }}
                    placeholder={t('documents.detail.newTagPlaceholder')}
                    aria-label={t('documents.detail.newTagPlaceholder')}
                    className="h-[30px] w-[120px] rounded-sm border border-primary-300 bg-white px-2 text-xs font-medium text-text-secondary outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingTag(true)}
                    className="inline-flex h-[30px] items-center gap-1 rounded-sm border border-border-subtle bg-white px-2.5 text-xs font-medium text-text-tertiary transition-colors hover:border-primary-300 hover:text-primary-700"
                  >
                    + {t('documents.detail.addTag')}
                  </button>
                )}
              </div>
            </Card>

            <Card
              title={t('documents.detail.opensTitle')}
              action={
                <button
                  type="button"
                  className="text-sm font-semibold text-primary-700 hover:underline"
                >
                  {t('documents.detail.fullLog')}
                </button>
              }
            >
              <ul className="mt-3 flex flex-col">
                {detail.opens.map((entry, index) => (
                  <li
                    key={entry.id}
                    className={[
                      'flex items-start gap-3 py-3',
                      index < detail.opens.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-background text-[10px] font-semibold text-text-tertiary">
                      {entry.initials || '—'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                        {t(entry.titleKey)}
                      </p>
                      <p className="mt-0.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                        {t(entry.detailKey)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background p-3 text-xs font-medium leading-[1.5] text-text-tertiary">
                <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                {t('documents.detail.logNote')}
              </p>
            </Card>
          </aside>
        </div>
      </div>

      <ShareDocumentModal
        open={sharing}
        onClose={() => setSharing(false)}
        recordId={record.title}
        files={record.files}
        uuid={sheet.uuid}
      />
    </AppShell>
  )
}
