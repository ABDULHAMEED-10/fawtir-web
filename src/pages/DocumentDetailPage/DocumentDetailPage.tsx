import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { Rial } from '../../components/ui'
import { useApiRead } from '../../hooks'
import {
  archiveItemPath,
  downloadArtefact,
  loadArchiveItem,
  type ArchiveAccessEntry,
  type ArchiveItemDto,
  type ArchiveRelation,
} from '../../api/compliance/archive'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  formatAmount,
  formatDate,
  formatInstant,
  formatInstantDay,
  initialsOf,
} from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import {
  artefactFileName,
  correctsInvoice,
  counterpartyLabel,
  formatBytes,
  frozenNote,
  heldArtefacts,
  issueDateOf,
  pdfBadge,
  recordBytes,
  recordKind,
  reportsAsReceiver,
  signatureBadge,
  statusChip,
  timeLeft,
  validationLine,
  CHIP_TONE,
  type ArtefactId,
  type BadgeTone,
} from '../../lib/documentArchive'
import { profileLabel, readArchiveXml, type ArchiveSheet } from '../../lib/archiveXml'
import { ShareDocumentModal } from './ShareDocumentModal'
import chevronIcon from '../../assets/invoices/chevron.svg'
import kpiHoldIcon from '../../assets/documents/kpi-hold.svg'
import verifiedIcon from '../../assets/documents/verified.svg'
import recInvoiceIcon from '../../assets/documents/rec-invoice.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import shareIcon from '../../assets/bills/upload.svg'
import copyIcon from '../../assets/invoice-details/copy.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import customerIcon from '../../assets/create-invoice/doc-order.svg'
import deliveryIcon from '../../assets/create-invoice/doc-delivery.svg'
import infoIcon from '../../assets/expenditure-reminders/info.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'

const muscatToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

const BADGE_TONE: Record<BadgeTone, string> = {
  blue: 'bg-primary-50 text-primary-700',
  green: 'bg-success-100 text-[#3d5648]',
  red: 'bg-warning-100 text-warning-700',
  grey: 'bg-surface-background text-text-tertiary',
  amber: 'bg-pending-100 text-pending-700',
}

const RELATES_ICON: Record<ArchiveRelation['kind'], string> = {
  CUSTOMER: customerIcon,
  SUPPLIER: customerIcon,
  ORDER: recInvoiceIcon,
  INVOICE: recInvoiceIcon,
  DELIVERY_NOTE: deliveryIcon,
}

const relationPath = (relation: ArchiveRelation): string | null => {
  switch (relation.kind) {
    case 'CUSTOMER':
      return `/customers/${relation.id}`
    case 'SUPPLIER':
      return `/suppliers/${relation.id}`
    case 'INVOICE':
      return `/income/invoices/${relation.id}`
    default:
      return null
  }
}

/**
 * One archived record (Figma 154:140005): its files on the left, the selected one laid out to be
 * read in the middle, and how long it is kept, its fingerprint, what it belongs to, its tags and
 * who has opened it on the right.
 *
 * Reads `GET /v1/compliance/documents/{uuid}`; the middle panel reads the artefact itself from the
 * address the archive gives (the signed XML is parsed and laid out, the PDF and QR are shown as they
 * are). A download is offered only where the archive gives an address. Placing a legal hold,
 * re-checking the fingerprint, tags, the access log and share links have no route yet: each is
 * drawn and set aside behind a TODO(backend) (asks 3.5 to 3.12).
 */
export function DocumentDetailPage() {
  const { id = '' } = useParams()
  return (
    <AppShell>
      <ArchivedDocument key={id} invoiceUuid={id} />
    </AppShell>
  )
}

type Held = ReturnType<typeof heldArtefacts>[number]

function ArchivedDocument({ invoiceUuid }: { invoiceUuid: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const today = muscatToday()
  const [params, setParams] = useSearchParams()
  const [notice, setNotice] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  // Nothing is shared while the subscription is read-only (owner, 23 Oct; ST-2, CA-3).
  const mayShare = useSubscriptionAllows('SEND_DOCUMENTS')
  const read = useApiRead<ArchiveItemDto>(archiveItemPath(invoiceUuid), () =>
    loadArchiveItem(invoiceUuid),
  )

  if (read.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {read.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={read.read.error} retry={read.retry} />
        )}
      </div>
    )
  }

  const item = read.read.data
  const held = heldArtefacts(item)
  const number = item.invoice_number ?? t('documents.noNumber')
  const fileNumber = item.invoice_number ?? item.invoice_uuid.slice(0, 8)
  const asked = params.get('file') as ArtefactId | null
  const active = held.find((artefact) => artefact.id === asked) ?? held[0] ?? null
  const chip = statusChip(item)
  const tone = CHIP_TONE[chip.tone]
  const bytes = recordBytes(item)
  const party = counterpartyLabel(item)
  const kind = recordKind(item)
  const dated = issueDateOf(item)

  const failure = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    return message.reference
      ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
      : body
  }

  const download = async (artefact: Held) => {
    if (!artefact.href || artefact.opens) return
    setNotice(null)
    try {
      saveDownload(
        await downloadArtefact(artefact.href),
        artefactFileName(fileNumber, artefact.id) ?? `${fileNumber}-${artefact.id}`,
      )
    } catch (error) {
      setNotice(failure(error))
    }
  }

  /** TODO(backend): one ZIP of the record (ask 3.6). Until then, each served file in turn. */
  const downloadAll = async () => {
    for (const artefact of held) await download(artefact)
  }

  const shareable = held
    .filter((artefact) => artefact.id !== 'delivery_notification')
    .sort((a, b) => Number(b.id === 'pdf') - Number(a.id === 'pdf'))
    .map((artefact) => ({
      id: artefact.id,
      label:
        artefact.id === 'qr'
          ? t('documents.share.qrImage')
          : artefact.id === 'mls'
            ? t('documents.share.mlsReplies')
            : artefact.id === 'tdd'
              ? 'TDD.xml'
              : (artefactFileName(fileNumber, artefact.id) as string),
    }))

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/compliance/documents"
          className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
        >
          {t('documents.title')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">{number}</span>
      </div>

      <div className="-mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{number}</h1>
            <span
              className={[
                'inline-flex h-[26px] items-center gap-1.5 rounded-sm border px-2.5 text-xs font-medium',
                tone.bg,
                tone.fg,
                'border-current/30',
              ].join(' ')}
            >
              <span className={['size-1.5 rounded-full', tone.dot].join(' ')} />
              {t(chip.key)}
            </span>
            {item.retention.retain_until ? (
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-sm border border-border-default bg-surface-background px-2.5 text-xs font-medium text-text-secondary">
                <span className="size-1.5 rounded-full bg-text-secondary" />
                {t('documents.detail.keptChip', {
                  date: formatDate(item.retention.retain_until, language),
                })}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-medium leading-[1.4] text-text-quaternary">
            {t(`documents.detail.kindTo.${kind}`)}{' '}
            {party ? <span className="font-medium text-text-primary">{party}</span> : null}
            {' · '}
            {/* TODO(backend): the document's own issue date (DOCUMENTS.md row 3.18); without it a
                received record says when it arrived rather than calling that "issued". */}
            {t(dated.received ? 'documents.detail.received' : 'documents.detail.issued', {
              date: formatInstantDay(dated.date, language),
            })}
            {' · '}
            <span className="font-medium text-text-primary">
              {t('documents.filesCount', { count: held.length })}
            </span>
            {bytes != null ? ` · ${formatBytes(bytes)}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1 max-md:shrink">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-5 text-base font-medium text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={printIcon} alt="" className="size-5" />
            {t('documents.detail.print')}
          </button>
          <button
            type="button"
            onClick={() => void downloadAll()}
            disabled={!held.some((artefact) => artefact.href && !artefact.opens)}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-5 text-base font-medium text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
          >
            <img src={downloadIcon} alt="" className="size-5" />
            {t('documents.detail.zip', { count: held.length })}
          </button>
          {mayShare ? (
            <button
              type="button"
              onClick={() => setSharing(true)}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-base font-medium text-white transition-colors hover:bg-primary-800"
            >
              <img src={shareIcon} alt="" className="size-5 brightness-0 invert" />
              {t('documents.detail.share')}
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      <div className="flex flex-col gap-5 xl:flex-row">
        <section className="w-full self-start overflow-hidden rounded-md bg-surface-card xl:w-[268px] xl:shrink-0">
          <div className="border-b border-border-subtle px-5 py-5">
            <h2 className="text-base font-medium leading-[1.2] text-text-primary">
              {t('documents.detail.filesInRecord', { count: held.length })}
            </h2>
            <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
              {t('documents.detail.everythingBelonging', { number })}
            </p>
          </div>
          <ul className="flex flex-col">
            {held.map((artefact) => {
              const on = artefact.id === active?.id
              const badge = fileBadge(item, artefact)
              return (
                <li key={artefact.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setParams({ file: artefact.id }, { replace: true })}
                    className={[
                      'flex w-full flex-col items-start px-5 py-4 text-start transition-colors',
                      on
                        ? 'border-s-[3px] border-s-primary-700 bg-primary-25 ps-[17px]'
                        : 'hover:bg-surface-tab-bar',
                    ].join(' ')}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span
                        className={[
                          'text-sm font-medium leading-[1.3]',
                          on ? 'text-primary-700' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {artefactFileName(fileNumber, artefact.id) ??
                          t(`documents.fileName.${artefact.id}`)}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium text-text-quaternary">
                        {artefact.bytes != null ? formatBytes(artefact.bytes) : ''}
                      </span>
                    </span>
                    <span className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                      {t(
                        reportsAsReceiver(item) && artefact.id === 'tdd'
                          ? 'documents.detail.fileNote.tddReceived'
                          : item.direction === 'RECEIVED' && artefact.id === 'pdf'
                            ? 'documents.detail.fileNote.pdfReceived'
                            : `documents.detail.fileNote.${artefact.id}`,
                      )}
                    </span>
                    <span
                      className={[
                        'mt-2 inline-flex h-[20px] items-center rounded-[3px] px-1.5 text-[10px] font-semibold uppercase tracking-[0.5px]',
                        BADGE_TONE[badge.tone],
                      ].join(' ')}
                    >
                      {t(badge.key, badge.values)}
                    </span>
                  </button>
                </li>
              )
            })}
            {held.length === 0 ? (
              <li className="px-5 py-4 text-sm font-medium text-text-quaternary">
                {t('documents.detail.noFiles')}
              </li>
            ) : null}
          </ul>
        </section>

        <div className="min-w-0 flex-1">
          {active ? (
            <Preview item={item} artefact={active} onDownload={() => void download(active)} />
          ) : null}
        </div>

        <aside className="flex w-full flex-col gap-5 xl:w-[320px] xl:shrink-0">
          <Retention item={item} today={today} language={language} />
          <Integrity item={item} language={language} onCheck={read.retry} />
          <Relates item={item} />
          <Tags initial={item.tags ?? []} />
          <Opens item={item} language={language} />
        </aside>
      </div>

      <ShareDocumentModal
        open={sharing && mayShare}
        onClose={() => setSharing(false)}
        number={number}
        files={shareable}
        today={today}
      />
    </div>
  )
}

/**
 * The small tag under each file ("SIGNED PINT-OM", "ACCEPTED", "EN & AR", "IMAGE", "2 MESSAGES"),
 * each tied to the field that proves it; a missing field reads "not confirmed" in a neutral tone.
 */
function fileBadge(
  item: ArchiveItemDto,
  artefact: Held,
): { key: string; values?: Record<string, unknown>; tone: BadgeTone } {
  switch (artefact.id) {
    case 'xml':
      // TODO(backend): `signature_valid`, DOCUMENTS.md rows 3.9 and 3.24.
      return signatureBadge(item)
    case 'tdd': {
      const status = item.tdd.status
      const tone =
        status === 'ACCEPTED'
          ? 'green'
          : status === 'REJECTED' || status === 'GENERATION_FAILED' || status === 'DEAD_LETTERED'
            ? 'red'
            : 'grey'
      return { key: status ? `documents.tdd.${status}` : 'documents.tdd.none', tone }
    }
    case 'pdf':
      // TODO(backend): the PDF's languages, DOCUMENTS.md row 3.20.
      return pdfBadge(item)
    case 'qr':
      return { key: 'documents.detail.badge.image', tone: 'grey' }
    case 'mls':
      return {
        key: 'documents.detail.badge.messages',
        values: { count: artefact.count ?? 0 },
        tone: 'amber',
      }
    default:
      return { key: 'documents.detail.badge.receipt', tone: 'amber' }
  }
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
        <h2 className="text-lg font-medium leading-[1.2] text-text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({
  label,
  children,
  tone = 'text-text-primary',
}: {
  label: string
  children: ReactNode
  tone?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 whitespace-nowrap text-sm font-medium leading-[1.3] text-text-tertiary">
        {label}
      </dt>
      <dd className={['text-end text-sm font-medium', tone].join(' ')}>{children}</dd>
    </div>
  )
}

/** The artefact's own bytes, read once per address. */
function useArtefact(href: string | null, asText: boolean) {
  return useApiRead<{ blob: Blob; text: string | null }>(
    href ? `artefact:${href}` : null,
    async () => {
      const file = await downloadArtefact(href as string)
      return { blob: file.blob, text: asText ? await file.blob.text() : null }
    },
  )
}

function useObjectUrl(blob: Blob | null) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url])
  return url
}

function Preview({
  item,
  artefact,
  onDownload,
}: {
  item: ArchiveItemDto
  artefact: Held
  onDownload: () => void
}) {
  const { t } = useTranslation()
  const asText = artefact.id === 'xml' || artefact.id === 'tdd'
  const served = artefact.href && !artefact.opens ? artefact.href : null
  const file = useArtefact(served, asText)
  const ready = file.read.status === 'ready' ? file.read.data : null
  const url = useObjectUrl(ready?.blob ?? null)
  const [copied, setCopied] = useState(false)

  const tools = [
    {
      icon: copyIcon,
      label: t(copied ? 'documents.detail.copied' : 'documents.detail.copy'),
      disabled: !ready?.text,
      onClick: () => {
        if (!ready?.text) return
        navigator.clipboard?.writeText(ready.text).catch(() => {})
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      },
    },
    {
      icon: printIcon,
      label: t('documents.detail.printFile'),
      disabled: false,
      onClick: () => window.print(),
    },
    {
      icon: downloadIcon,
      label: t('documents.detail.download'),
      disabled: !served,
      onClick: onDownload,
    },
    {
      icon: fullscreenIcon,
      label: t('documents.detail.fullscreen'),
      disabled: !url,
      onClick: () => url && window.open(url, '_blank', 'noopener'),
    },
  ]

  let body: ReactNode
  if (artefact.opens) {
    body = (
      <div className="flex flex-col items-start gap-3 p-6">
        <h2 className="text-xl font-medium text-text-primary">{t('documents.artefact.mls')}</h2>
        <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
          {t('documents.detail.mlsNote', { count: artefact.count ?? 0 })}
        </p>
        <Link
          to="/compliance/activity"
          className="text-sm font-medium text-primary-700 hover:underline"
        >
          {t('documents.detail.openActivity')}
        </Link>
      </div>
    )
  } else if (!served) {
    body = (
      <p className="p-6 text-sm font-medium text-text-quaternary">{t('documents.notServed')}</p>
    )
  } else if (file.read.status === 'loading') {
    body = (
      <div className="p-6">
        <LoadingNotice />
      </div>
    )
  } else if (file.read.status === 'failed') {
    body = (
      <div className="p-6">
        <ApiReadFailure error={file.read.error} retry={file.retry} />
      </div>
    )
  } else if (artefact.id === 'xml') {
    const sheet = ready?.text ? readArchiveXml(ready.text) : null
    body = sheet ? <Sheet item={item} sheet={sheet} /> : <RawXml text={ready?.text ?? ''} />
  } else if (artefact.id === 'tdd') {
    body = <RawXml text={ready?.text ?? ''} />
  } else if (artefact.id === 'pdf' && url) {
    body = (
      <iframe
        title={t('documents.artefact.pdf')}
        src={url}
        className="h-[900px] w-full rounded-sm"
      />
    )
  } else if (url) {
    body = (
      <div className="flex justify-center p-10">
        <img src={url} alt={t('documents.artefact.qr')} className="size-[220px]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-md bg-[#e9e9eb]">
      <div className="flex items-center justify-end gap-1.5 rounded-t-md bg-surface-card px-4 py-3">
        {tools.map((tool) => (
          <button
            key={tool.icon}
            type="button"
            aria-label={tool.label}
            title={tool.label}
            disabled={tool.disabled}
            onClick={tool.onClick}
            className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25 disabled:opacity-40"
          >
            <img src={tool.icon} alt="" className="size-[18px]" />
          </button>
        ))}
      </div>
      <div className="p-6 max-md:p-3">
        <article className="rounded-sm bg-white shadow-card">{body}</article>
      </div>
    </div>
  )
}

function RawXml({ text }: { text: string }) {
  return (
    <pre
      dir="ltr"
      className="max-h-[900px] overflow-auto whitespace-pre-wrap break-all p-6 font-mono text-xs leading-[1.6] text-text-secondary"
    >
      {text}
    </pre>
  )
}

function Field({
  label,
  children,
  tone = 'text-text-primary',
}: {
  label: string
  children: ReactNode
  tone?: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium leading-[1.3] text-text-quaternary">{label}</p>
      <div className={['mt-1 text-sm font-medium leading-[1.3]', tone].join(' ')}>
        {children ?? '-'}
      </div>
    </div>
  )
}

/** A value that is a code rather than prose: Peppol IDs, UUIDs. */
function Code({ children }: { children: ReactNode }) {
  return (
    <span
      dir="ltr"
      className="inline-block max-w-full break-all rounded-[3px] bg-surface-background px-1.5 py-0.5 font-mono text-xs font-semibold text-text-primary"
    >
      {children}
    </span>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="border-b border-border-subtle pb-3 text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-text-secondary">
        {title}
      </h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

/** The signed XML, laid out so a person can read it. */
function Sheet({ item, sheet }: { item: ArchiveItemDto; sheet: ArchiveSheet }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const currency = sheet.currency ?? 'OMR'
  const money = (value: string | null) =>
    value == null ? '-' : formatAmount(value, currency, language)
  const date = (value: string | null) => (value ? formatDate(value, language) : null)
  const received = item.direction === 'RECEIVED'
  const profile = profileLabel(sheet.profile)
  // The invoice a credit or debit note corrects (PINT-OM IBR-032-OM for credit notes): from the
  // signed XML's BillingReference first, then from the archive item.
  const corrected =
    correctsInvoice(recordKind({ ...item, type_code: item.type_code ?? sheet.typeCode })) ||
    sheet.preceding
      ? precedingInvoice(item, sheet)
      : null
  const validation = validationLine(item)
  const typeLabel = sheet.typeCode
    ? `${t(`documents.detail.typeCode.${sheet.typeCode}`, { defaultValue: t(sheet.isCredit ? 'documents.detail.creditNote' : 'documents.detail.commercialInvoice') })} · ${sheet.typeCode}`
    : null

  return (
    <div className="p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <h2 className="text-xl font-medium leading-[1.2] text-text-primary">
            {t(
              sheet.isCredit
                ? 'documents.detail.creditNoteTitle'
                : sheet.typeCode === '383'
                  ? 'documents.detail.debitNoteTitle'
                  : 'documents.detail.taxInvoice',
              { number: sheet.number ?? item.invoice_number },
            )}
          </h2>
          <p className="mt-1.5 text-sm font-medium leading-[1.3] text-text-quaternary">
            {t('documents.detail.laidOut')}
          </p>
        </div>
        {/* TODO(backend): `signature_valid` (DOCUMENTS.md rows 3.9 and 3.24). The designed badge
            stays; without the check it reads "not checked yet" in a neutral tone. */}
        <span
          className={[
            'inline-flex h-[28px] items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium',
            item.signature_valid === true
              ? 'bg-success-100 text-[#3d5648]'
              : item.signature_valid === false
                ? 'bg-warning-100 text-warning-700'
                : 'bg-surface-background text-text-tertiary',
          ].join(' ')}
        >
          {item.signature_valid === true ? (
            <img src={verifiedIcon} alt="" className="size-3.5" />
          ) : null}
          {t(
            item.signature_valid === true
              ? 'documents.detail.signatureValid'
              : item.signature_valid === false
                ? 'documents.detail.signatureFailed'
                : 'documents.detail.signatureUnconfirmed',
          )}
        </span>
      </header>

      <Block title={t('documents.detail.theDocument')}>
        <Field
          label={t(
            sheet.isCredit ? 'documents.detail.creditNumber' : 'documents.detail.invoiceNumber',
          )}
        >
          {sheet.number}
        </Field>
        <Field label={t('documents.detail.type')}>{typeLabel}</Field>
        <Field label={t('documents.detail.issuedOn')}>{date(sheet.issueDate)}</Field>
        <Field label={t('documents.detail.paymentDue')}>{date(sheet.dueDate)}</Field>
        <Field label={t('documents.detail.currency')}>
          {/* The frame draws the sign here, not the code. */}
          {currency === 'OMR' ? <Rial /> : currency}
        </Field>
        <Field label={t('documents.detail.uuid')}>
          {sheet.uuid ? <Code>{sheet.uuid}</Code> : null}
        </Field>
        {corrected ? (
          <Field label={t('documents.detail.corrects')}>
            <Link to={corrected.to} className="text-primary-700 hover:underline">
              {corrected.number}
            </Link>
            <span className="mt-1 block text-xs text-text-quaternary">
              {corrected.issueDate
                ? t('documents.detail.issued', { date: formatDate(corrected.issueDate, language) })
                : t('documents.detail.notGivenYet')}
            </span>
            <span className="mt-1 block">
              {corrected.uuid ? (
                <Code>{corrected.uuid}</Code>
              ) : (
                <span className="text-xs text-text-quaternary">
                  {t('documents.detail.correctsNoUuid')}
                </span>
              )}
            </span>
          </Field>
        ) : null}
      </Block>

      <Block title={t('documents.detail.whoSent')}>
        <Field label={t('documents.detail.business')}>{sheet.sender.name}</Field>
        <Field label={t('documents.detail.vatNumber')}>{sheet.sender.vat}</Field>
        <Field label={t('documents.detail.peppolId')}>
          {sheet.sender.endpoint ? <Code>{sheet.sender.endpoint}</Code> : null}
        </Field>
        <Field label={t('documents.detail.address')}>{sheet.sender.address}</Field>
      </Block>

      <Block title={t('documents.detail.whoReceived')}>
        <Field label={t('documents.detail.business')}>{sheet.receiver.name}</Field>
        <Field label={t('documents.detail.vatNumber')}>{sheet.receiver.vat}</Field>
        <Field label={t('documents.detail.peppolId')}>
          {sheet.receiver.endpoint ? <Code>{sheet.receiver.endpoint}</Code> : null}
        </Field>
        <Field label={t(received ? 'documents.detail.ourOrder' : 'documents.detail.theirOrder')}>
          {sheet.orderReference}
        </Field>
      </Block>

      <section className="mt-6">
        <h3 className="border-b border-border-subtle pb-3 text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-text-secondary">
          {t('documents.detail.whatCharged')}
        </h3>
        <div className="mt-2 overflow-x-auto">
          {/* Fixed columns: the figures keep their width and the item name wraps, so the
              amount never runs past the paper at desktop width. */}
          <table className="w-full min-w-[360px] table-fixed border-collapse">
            <colgroup>
              <col />
              <col className="w-[64px]" />
              <col className="w-[64px]" />
              <col className="w-[44px]" />
              <col className="w-[84px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border-subtle text-[10px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
                {(['item', 'qty', 'unit', 'vat', 'amount'] as const).map((key, index) => (
                  <th
                    key={key}
                    className={[
                      'py-3 font-semibold',
                      index === 0
                        ? 'pe-2 text-start'
                        : index === 4
                          ? 'ps-1.5 text-end'
                          : 'px-1.5 text-end',
                    ].join(' ')}
                  >
                    {t(`documents.detail.col.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.lines.map((line, index) => (
                <tr
                  key={index}
                  className="border-b border-surface-background text-sm font-medium text-text-secondary"
                >
                  <td className="break-words py-3.5 pe-2">{line.item}</td>
                  <td className="whitespace-nowrap px-1.5 py-3.5 text-end">
                    {line.quantity
                      ? `${Number(line.quantity)} ${line.unitCode ? unitLabel(line.unitCode) : ''}`.trim()
                      : '-'}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-3.5 text-end tabular-nums">
                    {money(line.price)}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-3.5 text-end">
                    {line.vatPercent ? `${Number(line.vatPercent)}%` : '-'}
                  </td>
                  <td className="whitespace-nowrap py-3.5 ps-1.5 text-end tabular-nums text-text-primary">
                    {money(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ms-auto mt-3 w-full max-w-[290px]">
          <div className="flex items-center justify-between gap-4 py-2 text-sm font-medium text-text-tertiary">
            <dt>{t('documents.detail.net')}</dt>
            <dd className="tabular-nums">{money(sheet.net)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2 text-sm font-medium text-text-tertiary">
            <dt>
              {sheet.vatPercent
                ? t('documents.detail.vatRate', { rate: Number(sheet.vatPercent) })
                : t('documents.detail.vatRow')}
            </dt>
            <dd className="tabular-nums">{money(sheet.vat)}</dd>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 border-t border-border-subtle pt-3 text-lg font-medium text-text-primary">
            <dt className="flex items-center gap-2">
              {t('documents.detail.total')}
              {currency === 'OMR' ? <Rial className="w-6" /> : currency}
            </dt>
            <dd className="tabular-nums">{money(sheet.total)}</dd>
          </div>
        </dl>
      </section>

      <Block title={t('documents.detail.howTravelled')}>
        <Field label={t('documents.detail.sentOver')}>
          {item.artefacts.delivery_notification.available || item.artefacts.mls.available
            ? 'Peppol AS4'
            : null}
        </Field>
        <Field label={t('documents.detail.profile')}>{profile}</Field>
        {/* TODO(backend): the network's delivery time (ask 3.9); the record's own time stands in. */}
        <Field label={t('documents.detail.deliveredAt')}>
          {formatInstant(item.delivered_at ?? item.occurred_at, language)}
        </Field>
        {/* TODO(backend): the validation layers' results (DOCUMENTS.md row 3.19). "All five
            layers passed" is said only when the archive reports it. */}
        <Field
          label={t('documents.detail.validation')}
          tone={
            validation.tone === 'green'
              ? 'text-[#3d5648]'
              : validation.tone === 'red'
                ? 'text-warning-700'
                : 'text-text-tertiary'
          }
        >
          {t(validation.key, validation.values)}
        </Field>
      </Block>
    </div>
  )
}

/**
 * The corrected invoice's number, issue date and UUID, and where it opens: its archive record when
 * the UUID is known, else the archive searched by its number.
 * TODO(backend): `against_issue_date` and `against_uuid`, DOCUMENTS.md row 3.16.
 */
function precedingInvoice(
  item: ArchiveItemDto,
  sheet?: ArchiveSheet | null,
): { number: string; issueDate: string | null; uuid: string | null; to: string } | null {
  const number = sheet?.preceding?.number ?? item.against_number ?? null
  if (!number) return null
  const uuid = item.against_uuid ?? sheet?.preceding?.uuid ?? null
  return {
    number,
    issueDate: sheet?.preceding?.issueDate ?? item.against_issue_date ?? null,
    uuid,
    to: item.against_uuid
      ? `/compliance/documents/${encodeURIComponent(item.against_uuid)}`
      : `/compliance/documents?number=${encodeURIComponent(number)}`,
  }
}

/** UN/ECE Rec 20 codes as the sheet prints them ("24 KG", "18 EA"). */
function unitLabel(code: string) {
  return code === 'C62' || code === 'H87' ? 'EA' : code === 'KGM' ? 'KG' : code
}

function Retention({
  item,
  today,
  language,
}: {
  item: ArchiveItemDto
  today: string
  language: string
}) {
  const { t } = useTranslation()
  const retention = item.retention
  const hold = retention.legal_hold
  const until = retention.retain_until
  const left = until ? timeLeft(until, today) : null
  const frozen = frozenNote(item)

  return (
    <Card title={t('documents.detail.howLongKept')}>
      <dl className="mt-4 flex flex-col">
        <Row label={t('documents.detail.keptUntil')}>
          {until ? formatDate(until, language) : t('documents.youDecide')}
        </Row>
        <Row label={t('documents.detail.timeRemaining')}>
          {left
            ? t('documents.detail.remaining', { years: left.years, months: left.months })
            : until
              ? t('documents.retentionOver')
              : '-'}
        </Row>
        <Row label={t('documents.detail.reason')}>
          {t(`documents.detail.reasonClass.${retention.retention_class}`, {
            defaultValue: retention.retention_class,
          })}
        </Row>
        <Row
          label={t('documents.detail.legalHold')}
          tone={hold.held ? 'text-pending-700' : 'text-text-primary'}
        >
          {t(hold.held ? 'documents.detail.applied' : 'documents.detail.notApplied')}
        </Row>
      </dl>

      {frozen ? (
        <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background p-3 text-xs font-medium leading-[1.5] text-text-tertiary">
          <img src={kpiHoldIcon} alt="" className="mt-px size-4 shrink-0 invert-[.45]" />
          {hold.held
            ? t('documents.frozen.legalHold')
            : t('documents.detail.nobodyCanEdit', { year: (until ?? '').slice(0, 4) })}
        </p>
      ) : null}

      {hold.held ? (
        <div className="mt-3 rounded-sm border border-pending-200 bg-pending-100 p-3">
          <p className="text-xs font-medium text-pending-700">{t('documents.detail.holdReason')}</p>
          <p className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">
            {hold.reason ?? '-'}
          </p>
          {hold.set_at ? (
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {t('documents.detail.holdSetAt', { when: formatInstant(hold.set_at, language) })}
            </p>
          ) : null}
        </div>
      ) : (
        // TODO(backend): a route that places a legal hold on an archived record (ask 3.8).
        <button
          type="button"
          disabled
          title={t('documents.detail.holdNotYet')}
          className="mt-3 inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-default bg-white text-sm font-medium text-text-secondary disabled:cursor-not-allowed"
        >
          {t('documents.detail.placeHold')}
        </button>
      )}
    </Card>
  )
}

function Integrity({
  item,
  language,
  onCheck,
}: {
  item: ArchiveItemDto
  language: string
  onCheck: () => void
}) {
  const { t } = useTranslation()
  const integrity = item.integrity ?? null
  const checked = integrity?.last_checked_at
  return (
    <Card
      title={t('documents.detail.proofTitle')}
      action={
        // TODO(backend): a re-check on demand (ask 3.5); "Check now" re-reads the record.
        <button
          type="button"
          disabled={!integrity}
          onClick={onCheck}
          className="text-sm font-medium text-primary-700 hover:underline disabled:text-text-quaternary disabled:no-underline"
        >
          {t('documents.detail.checkNow')}
        </button>
      }
    >
      <dl className="mt-4 flex flex-col">
        <Row label={t('documents.detail.fingerprintTaken')}>
          {integrity
            ? formatInstant(integrity.taken_at, language)
            : t('documents.detail.notRecorded')}
        </Row>
        <Row
          label={t('documents.detail.lastChecked')}
          tone={
            integrity?.matches
              ? 'text-[#3d5648]'
              : integrity?.matches === false
                ? 'text-warning-700'
                : 'text-text-primary'
          }
        >
          {checked
            ? `${formatInstant(checked, language)} · ${t(integrity?.matches === false ? 'documents.detail.differs' : 'documents.detail.matches')}`
            : t('documents.detail.notRecorded')}
        </Row>
      </dl>
      <div className="mt-3 rounded-sm bg-surface-background p-3">
        <p className="text-[10px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-tertiary">
          {t('documents.detail.shaOf', {
            file: artefactFileName(
              item.invoice_number ?? item.invoice_uuid.slice(0, 8),
              'xml',
            )?.toUpperCase(),
          })}
        </p>
        <p
          dir="ltr"
          className="mt-1.5 break-all font-mono text-[11px] leading-[1.6] text-text-tertiary"
        >
          {integrity ? integrity.sha256 : t('documents.detail.notServedYet')}
        </p>
      </div>
    </Card>
  )
}

function Relates({ item }: { item: ArchiveItemDto }) {
  const { t, i18n } = useTranslation()
  const party = counterpartyLabel(item)
  // TODO(backend): the records this one belongs to (ask 3.10). Until then, the other party alone.
  const relations: ArchiveRelation[] =
    item.related ??
    (party
      ? [
          {
            kind: item.direction === 'RECEIVED' ? 'SUPPLIER' : 'CUSTOMER',
            id: '',
            label: party,
            note: null,
          },
        ]
      : [])
  // A credit or debit note always shows the invoice it corrects (PINT-OM IBR-032-OM), linked to
  // its archive record, unless `related` already names it.
  const corrected = correctsInvoice(recordKind(item)) ? precedingInvoice(item) : null
  const correctedRow =
    corrected && !relations.some((relation) => relation.label === corrected.number)
      ? {
          label: corrected.number,
          to: corrected.to,
          note: corrected.issueDate
            ? t('documents.detail.correctsIssued', {
                date: formatDate(corrected.issueDate, i18n.language),
              })
            : t('documents.detail.corrects'),
        }
      : null

  return (
    <Card title={t('documents.detail.relatesTitle')}>
      <ul className="mt-3 flex flex-col">
        {relations.map((relation, index) => {
          const to = relation.id ? relationPath(relation) : null
          return (
            <li
              key={`${relation.kind}-${relation.id}-${index}`}
              className={[
                'flex items-center gap-3 py-3',
                index < relations.length - 1 ? 'border-b border-surface-background' : '',
              ].join(' ')}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
                <img src={RELATES_ICON[relation.kind]} alt="" className="size-4" />
              </span>
              <div className="min-w-0">
                {to ? (
                  <Link
                    to={to}
                    className="text-sm font-medium leading-[1.3] text-primary-700 hover:underline"
                  >
                    {relation.label}
                  </Link>
                ) : (
                  <p className="text-sm font-medium leading-[1.3] text-primary-700">
                    {relation.label}
                  </p>
                )}
                <p className="mt-0.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                  {relation.note ?? t(`documents.detail.relationKind.${relation.kind}`)}
                </p>
              </div>
            </li>
          )
        })}
        {correctedRow ? (
          <li
            className={[
              'flex items-center gap-3 py-3',
              relations.length > 0 ? 'border-t border-surface-background' : '',
            ].join(' ')}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
              <img src={RELATES_ICON.INVOICE} alt="" className="size-4" />
            </span>
            <div className="min-w-0">
              <Link
                to={correctedRow.to}
                className="text-sm font-medium leading-[1.3] text-primary-700 hover:underline"
              >
                {correctedRow.label}
              </Link>
              <p className="mt-0.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                {correctedRow.note}
              </p>
            </div>
          </li>
        ) : null}
        {relations.length === 0 && !correctedRow ? (
          <li className="py-3 text-sm font-medium text-text-quaternary">
            {t('documents.detail.nothingRelated')}
          </li>
        ) : null}
      </ul>
    </Card>
  )
}

/** TODO(backend): tags are not stored on the archive yet (ask 3.11); edits stay in this view. */
function Tags({ initial }: { initial: string[] }) {
  const { t } = useTranslation()
  const [tags, setTags] = useState(initial)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <Card title={t('documents.detail.tagsTitle')}>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-[32px] items-center gap-2 rounded-sm bg-primary-50 ps-2.5 pe-2 text-sm font-medium text-primary-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => setTags((list) => list.filter((entry) => entry !== tag))}
              aria-label={t('documents.detail.removeTag', { tag })}
              className="inline-flex size-4 items-center justify-center rounded-full text-base leading-none text-primary-700 hover:bg-white"
            >
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setAdding(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draft.trim()) {
                setTags((list) => (list.includes(draft.trim()) ? list : [...list, draft.trim()]))
                setDraft('')
                setAdding(false)
              }
              if (event.key === 'Escape') setAdding(false)
            }}
            placeholder={t('documents.detail.newTagPlaceholder')}
            aria-label={t('documents.detail.newTagPlaceholder')}
            className="h-[32px] w-[130px] rounded-sm border border-primary-300 bg-white px-2 text-sm font-medium text-text-secondary outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-[32px] items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-2.5 text-sm font-medium text-text-tertiary transition-colors hover:border-primary-300 hover:text-primary-700"
          >
            <img src={plusIcon} alt="" className="size-3.5" />
            {t('documents.detail.addTag')}
          </button>
        )}
      </div>
    </Card>
  )
}

function Opens({ item, language }: { item: ArchiveItemDto; language: string }) {
  const { t } = useTranslation()
  // TODO(backend): the record's access log (ask 3.12). Until then, the one event the archive does
  // tell: when Fawtir filed it.
  const entries: ArchiveAccessEntry[] = item.access_log ?? [
    { actor_name: null, action: 'FILED', artefact: null, at: item.occurred_at, channel: null },
  ]
  return (
    <Card
      title={t('documents.detail.opensTitle')}
      action={
        <button
          type="button"
          disabled={!item.access_log}
          className="text-sm font-medium text-primary-700 hover:underline disabled:text-text-quaternary disabled:no-underline"
        >
          {t('documents.detail.fullLog')}
        </button>
      }
    >
      <ul className="mt-3 flex flex-col">
        {entries.map((entry, index) => {
          const who = entry.actor_name
          const title =
            entry.action === 'FILED'
              ? t('documents.detail.log.filed')
              : entry.action === 'SHARED_LINK_OPENED'
                ? t('documents.detail.log.sharedLink')
                : entry.action === 'DOWNLOADED'
                  ? t('documents.detail.log.downloaded', {
                      name: who ?? t('documents.detail.log.someone'),
                      file: entry.artefact ?? t('documents.detail.log.aFile'),
                    })
                  : t('documents.detail.log.opened', {
                      name: who ?? t('documents.detail.log.someone'),
                    })
          const detail = [
            formatInstant(entry.at, language).replace(/\s\d{4},?/, ','),
            entry.action === 'FILED' ? t('documents.detail.log.byFawtir') : entry.channel,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <li
              key={index}
              className={[
                'flex items-start gap-3 py-3',
                index < entries.length - 1 ? 'border-b border-surface-background' : '',
              ].join(' ')}
            >
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-background text-[10px] font-semibold text-text-tertiary">
                {who ? initialsOf(who) : entry.action === 'SHARED_LINK_OPENED' ? 'EX' : '-'}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-[1.3] text-text-primary">{title}</p>
                <p className="mt-0.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                  {detail}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background p-3 text-xs font-medium leading-[1.5] text-text-tertiary">
        <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
        {/* TODO(backend): the access log (DOCUMENTS.md rows 3.12 and 3.25). "The log can't be
            edited" is said only once there is a log. */}
        {t(item.access_log ? 'documents.detail.logNote' : 'documents.detail.logNoteUnconfirmed')}
      </p>
    </Card>
  )
}
