import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { archiveItemPath, downloadArtefact, loadArchiveItem, type ArchiveItemDto } from '../../api/compliance/archive'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatDate, formatInstant } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import { artefactRows, counterpartyValue, frozenNote, type ArtefactRow } from '../../lib/documentArchive'
import chevronIcon from '../../assets/invoices/chevron.svg'
import kpiHoldIcon from '../../assets/documents/kpi-hold.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import viewIcon from '../../assets/actions/view.svg'

/**
 * One archived document (E-07): what it is, who it was between, how long it must be kept, and
 * which artefacts exist.
 *
 * Every artefact the archive names is listed, but a download is offered only where the archive
 * gives an address — an AS4 delivery notification exists with nothing serving it, and saying so is
 * more honest than a button that cannot work. A legal hold is shown and never set from here: holds
 * are placed on the invoice itself, which the archive row does not identify.
 */
export function DocumentDetailPage() {
  const { id = '' } = useParams()
  return (
    <AppShell>
      <ArchivedDocument key={id} invoiceUuid={id} />
    </AppShell>
  )
}

function ArchivedDocument({ invoiceUuid }: { invoiceUuid: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [notice, setNotice] = useState<string | null>(null)
  const read = useApiRead<ArchiveItemDto>(archiveItemPath(invoiceUuid), () => loadArchiveItem(invoiceUuid))

  if (read.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {read.read.status === 'loading' ? <LoadingNotice /> : <ApiReadFailure error={read.read.error} retry={read.retry} />}
      </div>
    )
  }

  const item = read.read.data
  const hold = item.retention.legal_hold
  const frozen = frozenNote(item)

  const download = async (artefact: ArtefactRow) => {
    if (!artefact.href) return
    setNotice(null)
    try {
      saveDownload(await downloadArtefact(artefact.href), `${item.invoice_number ?? item.invoice_uuid}-${artefact.id}`)
    } catch (error) {
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setNotice(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/compliance/documents" className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700">
          {t('documents.title')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">{item.invoice_number ?? t('documents.noNumber')}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{item.invoice_number ?? t('documents.noNumber')}</h1>
        <span className="inline-flex items-center rounded-sm bg-neutral-25 px-2.5 py-1 text-xs font-semibold text-text-secondary">
          {t(`documents.kind.${item.document_kind}`, { defaultValue: item.document_kind })}
        </span>
        <span className="inline-flex items-center rounded-sm bg-surface-background px-2.5 py-1 text-xs font-semibold text-text-tertiary">
          {t(`documents.direction.${item.direction}`)}
        </span>
        {hold.held ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-700 px-3 py-1 text-sm font-semibold text-warning-700">
            <img src={kpiHoldIcon} alt="" className="size-4" />
            {t('documents.status.legalHold')}
          </span>
        ) : null}
      </div>

      {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('documents.detail.theDocument')}</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t('documents.detail.counterparty')} value={counterpartyValue(item.counterparty) ?? '—'} />
          <Fact label={t('documents.detail.occurredAt')} value={formatInstant(item.occurred_at, language)} />
          <Fact label={t('documents.detail.taxYear')} value={String(item.tax_year)} />
          <Fact label={t('documents.detail.tdd')} value={item.tdd.status ? t(`documents.tdd.${item.tdd.status}`, { defaultValue: item.tdd.status }) : t('documents.tdd.none')} />
          <Fact label={t('documents.detail.ack')} value={item.tdd.ack} />
          <Fact label={t('documents.detail.audience')} value={t(item.b2c ? 'documents.b2c' : 'documents.b2b')} />
          <Fact label={t('documents.detail.uuid')} value={item.invoice_uuid} mono />
        </div>
      </section>

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('documents.detail.kept')}</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t('documents.detail.retentionClass')} value={t(`documents.retentionClass.${item.retention.retention_class}`, { defaultValue: item.retention.retention_class })} />
          <Fact label={t('documents.detail.keptUntil')} value={item.retention.retain_until ? formatDate(item.retention.retain_until, language) : '—'} />
          <Fact label={t('documents.detail.canBeRemoved')} value={t(item.retention.frozen ? 'documents.detail.no' : 'documents.detail.yes')} />
        </div>
        {frozen ? <p className="mt-4 text-sm font-medium leading-[1.5] text-text-tertiary">{t(frozen.key, frozen.values)}</p> : null}
        {hold.held ? (
          <div className="mt-4 rounded-sm border border-warning-700/40 bg-warning-100/40 p-4">
            <p className="text-sm font-semibold text-warning-700">{t('documents.detail.holdReason')}</p>
            <p className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">{hold.reason ?? '—'}</p>
            {hold.set_at ? <p className="mt-1 text-xs font-medium text-text-quaternary">{t('documents.detail.holdSetAt', { when: formatInstant(hold.set_at, language) })}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('documents.detail.filesInRecord')}</h2>
        <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">{t('documents.detail.filesNote')}</p>
        <ul className="mt-4 flex flex-col gap-3">
          {artefactRows(item.artefacts)
            .filter((artefact) => artefact.available)
            .map((artefact) => (
              <li key={artefact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-subtle px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {t(`documents.artefact.${artefact.id}`)}
                    {artefact.id === 'mls' && artefact.count ? ` · ${t('documents.mlsCount', { count: artefact.count })}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-text-quaternary">{t(`documents.artefactNote.${artefact.id}`)}</p>
                </div>
                {artefact.opens && item.links.activity ? (
                  <Link
                    to="/compliance/activity"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-800"
                  >
                    <img src={viewIcon} alt="" className="size-5" />
                    {t('documents.detail.openActivity')}
                  </Link>
                ) : artefact.href ? (
                  <button type="button" onClick={() => void download(artefact)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-800">
                    <img src={downloadIcon} alt="" className="size-5" />
                    {t('documents.detail.download')}
                  </button>
                ) : (
                  <span className="text-xs font-medium text-text-quaternary">{t('documents.detail.notServed')}</span>
                )}
              </li>
            ))}
          {artefactRows(item.artefacts).every((artefact) => !artefact.available) ? (
            <li className="text-sm font-medium text-text-quaternary">{t('documents.detail.noFiles')}</li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">{label}</p>
      <p className={['mt-1 break-words text-sm font-semibold text-text-primary', mono ? 'font-mono text-xs' : ''].join(' ')} dir={mono ? 'ltr' : undefined}>
        {value}
      </p>
    </div>
  )
}
