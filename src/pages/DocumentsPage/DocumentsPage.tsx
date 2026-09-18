import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  archiveListPath,
  loadArchiveList,
  type ArchiveFilters,
  type ArchiveItemDto,
  type ArchiveListDto,
} from '../../api/compliance/archive'
import { formatDate, formatInstantDay } from '../../lib/format'
import {
  ARCHIVE_TABS,
  DOCUMENT_KINDS,
  TDD_STATUSES,
  artefactRows,
  counterpartyValue,
  directionOf,
  showingNote,
  taxYears,
  visibleItems,
  type ArchiveTabId,
} from '../../lib/documentArchive'
import searchIcon from '../../assets/invoices/search.svg'
import kpiHoldIcon from '../../assets/documents/kpi-hold.svg'
import emptyArt from '../../assets/documents/empty.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const muscatToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

const FIELD = 'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Compliance › Documents (E-07): what Fawtir holds for every document that went out or came in.
 *
 * The archive is a read model. It says which artefacts exist and where each is served, and holds
 * no totals, so the page counts what it was given rather than claiming a figure the API cannot
 * answer. Integrity ticks, secure sharing and ZIP downloads are not drawn: nothing serves them.
 */
export function DocumentsPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const today = muscatToday()
  const [tab, setTab] = useState<ArchiveTabId>('all')
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<ArchiveFilters>({})

  const path = archiveListPath({ ...filters, direction: directionOf(tab) || filters.direction }, page)
  const list = useApiRead<ArchiveListDto>(path, () => loadArchiveList(path))

  const set = (next: Partial<ArchiveFilters>) => {
    setPage(0)
    setFilters((current) => ({ ...current, ...next }))
  }

  const chooseTab = (next: ArchiveTabId) => {
    setPage(0)
    setTab(next)
  }

  const data = list.read.status === 'ready' ? list.read.data : null
  const items = data ? visibleItems(data.items, tab) : []
  const showing = data ? showingNote(items.length, data.page, data.page_size) : null

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[760px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('documents.title')}</h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('documents.subtitle')}</p>
          </div>
          <p className="max-w-[320px] text-sm font-medium leading-[1.5] text-text-quaternary">
            {t('documents.ownPapers')}{' '}
            <Link to="/suppliers" className="font-semibold text-primary-800 hover:underline">
              {t('documents.ownPapersLink')}
            </Link>
          </p>
        </div>

        <section className="rounded-md bg-surface-card p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="relative block">
              <span className="sr-only">{t('documents.searchPlaceholder')}</span>
              <img src={searchIcon} alt="" className="pointer-events-none absolute start-3 top-3.5 size-5" />
              <input
                value={filters.invoiceNumber ?? ''}
                onChange={(event) => set({ invoiceNumber: event.target.value })}
                placeholder={t('documents.searchPlaceholder')}
                className={`${FIELD} ps-10`}
              />
            </label>
            <label className="block">
              <span className="sr-only">{t('documents.filter.kind')}</span>
              <select value={filters.documentKind ?? ''} onChange={(event) => set({ documentKind: event.target.value })} className={FIELD} aria-label={t('documents.filter.kind')}>
                <option value="">{t('documents.allKinds')}</option>
                {DOCUMENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`documents.kind.${kind}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">{t('documents.filter.tdd')}</span>
              <select value={filters.tddStatus ?? ''} onChange={(event) => set({ tddStatus: event.target.value })} className={FIELD} aria-label={t('documents.filter.tdd')}>
                <option value="">{t('documents.allTdd')}</option>
                {TDD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`documents.tdd.${status}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">{t('documents.filter.taxYear')}</span>
              <select value={filters.taxYear ?? ''} onChange={(event) => set({ taxYear: event.target.value })} className={FIELD} aria-label={t('documents.filter.taxYear')}>
                <option value="">{t('documents.allYears')}</option>
                {taxYears(today).map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-quaternary">{t('documents.filter.from')}</span>
              <DateField value={filters.from ?? ''} max={today} ariaLabel={t('documents.filter.from')} onChange={(from) => set({ from })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-text-quaternary">{t('documents.filter.to')}</span>
              <DateField value={filters.to ?? ''} max={today} ariaLabel={t('documents.filter.to')} onChange={(to) => set({ to })} />
            </label>
          </div>
        </section>

        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
            {ARCHIVE_TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={entry === tab}
                onClick={() => chooseTab(entry)}
                className={[
                  'inline-flex h-[54px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                  entry === tab ? 'border-primary-700 text-primary-700' : 'border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(`documents.tab.${entry}`)}
              </button>
            ))}
          </div>

          {list.read.status === 'loading' ? <LoadingNotice /> : null}
          {list.read.status === 'failed' ? <ApiReadFailure error={list.read.error} retry={list.retry} /> : null}

          {data ? (
            items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <img src={emptyArt} alt="" className="h-auto w-[180px]" />
                <p className="text-base font-semibold text-text-primary">{t('documents.empty.title')}</p>
                <p className="max-w-[440px] text-sm font-medium leading-[1.5] text-text-quaternary">
                  {t(tab === 'legalHold' ? 'documents.empty.noHold' : 'documents.empty.note')}
                </p>
              </div>
            ) : (
              <RowsView>
                <table className="w-full min-w-[980px] border-collapse">
                  <thead>
                    <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                      {(['document', 'counterparty', 'when', 'tdd', 'artefacts', 'kept'] as const).map((key) => (
                        <th key={key} className="px-5 py-3 text-start font-semibold">
                          {t(`documents.col.${key}`)}
                        </th>
                      ))}
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <ArchiveRow key={item.invoice_uuid} item={item} language={language} />
                    ))}
                  </tbody>
                </table>
              </RowsView>
            )
          ) : null}

          {data ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
              <p className="text-sm font-medium text-text-quaternary">
                {showing && showing.count > 0 ? t('documents.showingRows', { from: showing.from, to: showing.to }) : t('documents.showingNone')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={data.page === 0}
                  onClick={() => setPage((current) => Math.max(current - 1, 0))}
                  className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary disabled:opacity-40"
                >
                  {t('documents.previousPage')}
                </button>
                <button
                  type="button"
                  disabled={!data.has_more}
                  onClick={() => setPage((current) => current + 1)}
                  className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary disabled:opacity-40"
                >
                  {t('documents.nextPage')}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  )
}

function ArchiveRow({ item, language }: { item: ArchiveItemDto; language: string }) {
  const { t } = useTranslation()
  const held = item.retention.legal_hold.held
  const artefacts = artefactRows(item.artefacts).filter((artefact) => artefact.available)

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-5 py-4 align-top">
        <Link to={`/compliance/documents/${item.invoice_uuid}`} className="text-sm font-semibold text-primary-700 hover:underline">
          {item.invoice_number ?? t('documents.noNumber')}
        </Link>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t(`documents.kind.${item.document_kind}`, { defaultValue: item.document_kind })} · {t(`documents.direction.${item.direction}`)}
          {item.b2c ? ` · ${t('documents.b2c')}` : ''}
        </p>
      </td>
      <td className="px-5 py-4 align-top text-sm font-medium text-text-secondary">{counterpartyValue(item.counterparty) ?? '—'}</td>
      <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">
        {formatInstantDay(item.occurred_at, language)}
        <span className="mt-1 block text-xs text-text-quaternary">{t('documents.taxYear', { year: item.tax_year })}</span>
      </td>
      <td className="px-5 py-4 align-top">
        <span className="text-sm font-medium text-text-secondary">
          {item.tdd.status ? t(`documents.tdd.${item.tdd.status}`, { defaultValue: item.tdd.status }) : t('documents.tdd.none')}
        </span>
      </td>
      <td className="px-5 py-4 align-top">
        <span className="flex flex-wrap gap-1">
          {artefacts.length === 0 ? <span className="text-xs font-medium text-text-quaternary">—</span> : null}
          {artefacts.map((artefact) => (
            <span key={artefact.id} className="rounded-sm bg-surface-background px-2 py-1 text-[11px] font-semibold uppercase text-text-tertiary">
              {t(`documents.artefact.${artefact.id}`)}
              {artefact.id === 'mls' && artefact.count ? ` ${artefact.count}` : ''}
            </span>
          ))}
        </span>
      </td>
      <td className="px-5 py-4 align-top">
        <span className="text-sm font-medium text-text-secondary">{item.retention.retain_until ? formatDate(item.retention.retain_until, language) : '—'}</span>
        {held ? (
          <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-warning-700">
            <img src={kpiHoldIcon} alt="" className="size-3.5" />
            {t('documents.status.legalHold')}
          </span>
        ) : null}
      </td>
      <td className="px-5 py-4 align-top text-end">
        <Link to={`/compliance/documents/${item.invoice_uuid}`} aria-label={t('documents.open')} className="inline-flex items-center text-primary-800">
          <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
        </Link>
      </td>
    </tr>
  )
}
