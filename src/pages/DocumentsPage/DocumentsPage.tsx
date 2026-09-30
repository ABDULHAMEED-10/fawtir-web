import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, Pager, RialText, Select, SortMenu, TableCheckbox } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  archiveListPath,
  downloadArtefact,
  loadArchiveList,
  type ArchiveFilters,
  type ArchiveItemDto,
  type ArchiveListDto,
  type ArchiveSummary,
} from '../../api/compliance/archive'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate, formatInstantDay } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import {
  ARCHIVE_TABS,
  FORMAT_TAG,
  KIND_CHOICES,
  TDD_STATUSES,
  artefactFileName,
  counterpartyLabel,
  directionOf,
  formatBytes,
  hasFilters,
  heldArtefacts,
  issueDateOf,
  kindQuery,
  narrowByType,
  narrowedOnPage,
  recordBytes,
  recordKind,
  reportsAsReceiver,
  retentionShortKey,
  showingNote,
  statusChip,
  taxYears,
  timeLeft,
  CHIP_TONE,
  visibleItems,
  type ArchiveTabId,
  type ArtefactId,
  type KindChoice,
  type RecordKind,
} from '../../lib/documentArchive'
import kpiArchiveIcon from '../../assets/documents/kpi-archive.svg'
import kpiSpaceIcon from '../../assets/documents/kpi-space.svg'
import kpiIntegrityIcon from '../../assets/documents/kpi-integrity.svg'
import kpiHoldIcon from '../../assets/documents/kpi-hold.svg'
import recInvoiceIcon from '../../assets/documents/rec-invoice.svg'
import recBillIcon from '../../assets/documents/rec-bill.svg'
import recCreditIcon from '../../assets/documents/rec-credit.svg'
import recDebitIcon from '../../assets/documents/rec-debit.svg'
import fileXmlIcon from '../../assets/documents/file-xml.svg'
import fileTddIcon from '../../assets/documents/file-tdd.svg'
import fileQrIcon from '../../assets/documents/file-qr.svg'
import fileMlsIcon from '../../assets/documents/file-mls.svg'
import verifiedIcon from '../../assets/documents/verified.svg'
import emptyArt from '../../assets/documents/empty.svg'
import uploadIcon from '../../assets/bills/upload.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/bills/filter.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import viewIcon from '../../assets/actions/view.svg'

const muscatToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

const KIND_ICON: Record<RecordKind, string> = {
  salesInvoice: recInvoiceIcon,
  billReceived: recBillIcon,
  creditIssued: recCreditIcon,
  creditReceived: recCreditIcon,
  debitIssued: recDebitIcon,
  debitReceived: recDebitIcon,
  prepaymentIssued: recInvoiceIcon,
  prepaymentReceived: recBillIcon,
  selfBilledInvoice: recDebitIcon,
  selfBilledCredit: recCreditIcon,
}

const KIND_TILE: Record<RecordKind, string> = {
  salesInvoice: 'bg-primary-50',
  billReceived: 'bg-surface-background',
  creditIssued: 'bg-success-100',
  creditReceived: 'bg-success-100',
  debitIssued: 'bg-pending-100',
  debitReceived: 'bg-pending-100',
  prepaymentIssued: 'bg-primary-50',
  prepaymentReceived: 'bg-surface-background',
  selfBilledInvoice: 'bg-pending-100',
  selfBilledCredit: 'bg-success-100',
}

const FILE_ICON: Record<ArtefactId, string> = {
  xml: fileXmlIcon,
  tdd: fileTddIcon,
  pdf: fileXmlIcon,
  qr: fileQrIcon,
  mls: fileMlsIcon,
  delivery_notification: fileMlsIcon,
}

const FORMAT_TONE: Record<ArtefactId, string> = {
  xml: 'bg-primary-50 text-primary-700',
  tdd: 'bg-success-100 text-[#3d5648]',
  pdf: 'bg-warning-100 text-warning-700',
  qr: 'bg-surface-background text-text-tertiary',
  mls: 'bg-pending-100 text-pending-700',
  delivery_notification: 'bg-pending-100 text-pending-700',
}

type SortKey = 'natural' | 'newest' | 'oldest' | 'keptSoonest' | 'keptLatest'

const SORT_OPTIONS: { value: SortKey; labelKey: string }[] = [
  { value: 'natural', labelKey: 'documents.sortOptions.natural' },
  { value: 'newest', labelKey: 'documents.sortOptions.newest' },
  { value: 'oldest', labelKey: 'documents.sortOptions.oldest' },
  { value: 'keptSoonest', labelKey: 'documents.sortOptions.keptSoonest' },
  { value: 'keptLatest', labelKey: 'documents.sortOptions.keptLatest' },
]

/**
 * The archive has no sort parameter, so the page it was given is ordered here, and the footer
 * says so. TODO(backend): a sort parameter on the list, DOCUMENTS.md row 3.22.
 */
function sortItems(items: ArchiveItemDto[], sort: SortKey): ArchiveItemDto[] {
  if (sort === 'natural') return items
  const kept = (item: ArchiveItemDto) => item.retention.retain_until ?? '9999-12-31'
  return [...items].sort((a, b) => {
    if (sort === 'newest') return b.occurred_at.localeCompare(a.occurred_at)
    if (sort === 'oldest') return a.occurred_at.localeCompare(b.occurred_at)
    const diff = kept(a).localeCompare(kept(b))
    return sort === 'keptSoonest' ? diff : -diff
  })
}

/**
 * Compliance › Documents (Figma 154:139382 with records, 154:139158 before the first one).
 *
 * Reads `GET /v1/compliance/documents`: direction by tab, number by the search, kind, reporting
 * status, tax year and a date range from the filters, paged on `has_more`. The four figures, the
 * tab counts, sizes and integrity ticks are drawn from optional fields the archive does not answer
 * yet (backend asks 3.1 to 3.5); until it does, each says it is not known rather than inventing a
 * figure. "Download zip" saves each served file of the picked records, one by one (ask 3.6).
 */
export function DocumentsPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const today = muscatToday()
  const [tab, setTab] = useState<ArchiveTabId>('all')
  const [page, setPage] = useState(0)
  const [params] = useSearchParams()
  // A credit or debit note links here with `?number=` when the corrected invoice has no archive id.
  const [filters, setFilters] = useState<ArchiveFilters>(() => {
    const number = params.get('number')
    return number ? { invoiceNumber: number } : {}
  })
  const [kindChoice, setKindChoice] = useState<KindChoice | ''>('')
  const typeCode = kindQuery(kindChoice).typeCode
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState<SortKey>('natural')
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const path = archiveListPath(
    { ...filters, direction: directionOf(tab) || filters.direction },
    page,
  )
  const list = useApiRead<ArchiveListDto>(path, () => loadArchiveList(path))

  /** The figures and counts stay on screen while the next page loads. */
  const lastReady = useRef<ArchiveListDto | null>(null)
  if (list.read.status === 'ready') lastReady.current = list.read.data
  const data = list.read.status === 'ready' ? list.read.data : null
  const known = data ?? lastReady.current

  const set = (next: Partial<ArchiveFilters>) => {
    setPage(0)
    setFilters((current) => ({ ...current, ...next }))
  }

  const chooseTab = (next: ArchiveTabId) => {
    setPage(0)
    setTab(next)
  }

  const items = useMemo(
    () => (data ? sortItems(narrowByType(visibleItems(data.items, tab), typeCode), sort) : []),
    [data, tab, sort, typeCode],
  )
  /** The legal-hold tab and a debit or prepayment kind narrow this page only. */
  const pageOnly = narrowedOnPage(tab, typeCode)
  const filtered = hasFilters({ ...filters, direction: undefined } as Record<
    string,
    string | undefined
  >)
  /** Figma 154:139158: an archive with nothing in it at all, not a search that found nothing. */
  const archiveEmpty = Boolean(
    data && data.items.length === 0 && tab === 'all' && page === 0 && !filtered,
  )

  const picked = (data?.items ?? []).filter((item) => selected.includes(item.invoice_uuid))
  const pickedFiles = picked.reduce((sum, item) => sum + heldArtefacts(item).length, 0)
  const pickedBytes = picked.every((item) => recordBytes(item) != null)
    ? picked.reduce((sum, item) => sum + (recordBytes(item) ?? 0), 0)
    : null

  const toggle = (current: string[], id: string) =>
    current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]

  const failure = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    return message.reference
      ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
      : body
  }

  const download = async (item: ArchiveItemDto, id: ArtefactId) => {
    const href = item.artefacts[id]?.href
    if (!href) return
    setNotice(null)
    try {
      const number = item.invoice_number ?? item.invoice_uuid
      saveDownload(await downloadArtefact(href), artefactFileName(number, id) ?? `${number}-${id}`)
    } catch (error) {
      setNotice(failure(error))
    }
  }

  /** TODO(backend): one ZIP for the picked records (ask 3.6). Until then, each served file in turn. */
  const downloadPicked = async () => {
    for (const item of picked) {
      for (const artefact of heldArtefacts(item)) {
        if (artefact.href && !artefact.opens) await download(item, artefact.id)
      }
    }
  }

  const totals = known?.totals ?? null
  const tabCount = (entry: ArchiveTabId): number | null => {
    if (!totals) return null
    return entry === 'all'
      ? totals.all
      : entry === 'issued'
        ? totals.issued
        : entry === 'received'
          ? totals.received
          : totals.legal_hold
  }

  const showing = data ? showingNote(items.length, data.page, data.page_size) : null
  // The totals count a whole tab, not what a filter or this page narrowed it to, so they are
  // quoted only when nothing narrowed it. TODO(backend): totals under the filters, DOCUMENTS.md
  // row 3.27.
  const tabTotal = filtered || pageOnly ? null : tabCount(tab)
  const pageCount =
    tabTotal != null && data
      ? Math.max(1, Math.ceil(tabTotal / data.page_size))
      : data
        ? data.page + 1 + (data.has_more ? 1 : 0)
        : 1

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-5 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[820px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('documents.title')}
            </h1>
            <p className="mt-2 text-sm font-medium leading-[1.6] text-[#8f8f8f]">
              {/* The no-edit, no-delete rule covers Peppol documents; uploads are filed on the
                  supplier. TODO(backend): uploads in the archive, DOCUMENTS.md row 3.26. */}
              {t(archiveEmpty ? 'documents.subtitleEmpty' : 'documents.subtitleFull')}
            </p>
          </div>
          {archiveEmpty ? null : (
            <Link
              to="/compliance/documents/upload"
              className="inline-flex h-[46px] shrink-0 items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-5 text-base font-medium text-[#3a3a3a] transition-colors hover:bg-white"
            >
              <img src={uploadIcon} alt="" className="size-5" />
              {t('documents.uploadCta')}
            </Link>
          )}
        </div>

        <Figures summary={known?.summary ?? null} archiveEmpty={archiveEmpty} language={language} />

        {notice ? (
          <Notice
            body={notice}
            action={{ label: t('common.close'), onClick: () => setNotice(null) }}
          />
        ) : null}

        {list.read.status === 'failed' ? (
          <ApiReadFailure error={list.read.error} retry={list.retry} />
        ) : null}

        {archiveEmpty ? (
          <section className="flex min-h-[632px] flex-col items-center justify-center rounded-md bg-surface-card px-5 py-16 text-center">
            <img src={emptyArt} alt="" className="h-[124px] w-auto" />
            <h2 className="mt-12 text-2xl font-medium leading-[1.2] text-text-primary">
              {t('documents.empty.title')}
            </h2>
            <p className="mt-3 max-w-[520px] text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('documents.empty.note')}
            </p>
            <Link
              to="/compliance/documents/upload"
              className="mt-8 inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-base font-medium text-white transition-colors hover:bg-primary-800"
            >
              <img src={uploadIcon} alt="" className="size-5 brightness-0 invert" />
              {t('documents.uploadCta')}
            </Link>
          </section>
        ) : list.read.status === 'failed' ? null : (
          <section className="rounded-md bg-surface-card">
            <div
              role="tablist"
              className="flex flex-wrap items-center gap-1 overflow-x-auto border-b border-border-subtle px-3"
            >
              {ARCHIVE_TABS.map((entry) => {
                const active = entry === tab
                const count = tabCount(entry)
                return (
                  <button
                    key={entry}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => chooseTab(entry)}
                    className={[
                      'inline-flex h-[57px] shrink-0 items-center gap-2 border-b-2 px-4 text-base font-medium transition-colors',
                      active
                        ? 'border-primary-700 text-primary-700'
                        : 'border-transparent text-text-secondary hover:text-text-primary',
                    ].join(' ')}
                  >
                    {t(`documents.tab.${entry}`)}
                    {count != null ? (
                      <span
                        className={[
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
                          active
                            ? 'bg-primary-50 text-primary-700'
                            : 'bg-surface-background text-text-tertiary',
                        ].join(' ')}
                      >
                        {formatCount(count, language)}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <label className="relative flex h-[44px] w-full max-w-[346px] items-center max-md:max-w-none">
                <span className="sr-only">{t('documents.searchLabel')}</span>
                <img
                  src={searchIcon}
                  alt=""
                  className="pointer-events-none absolute start-3.5 size-5 opacity-60"
                />
                {/* TODO(backend): search by the other party's name too (DOCUMENTS.md row 3.23);
                    the archive filters by number only, and the placeholder says so. */}
                <input
                  value={filters.invoiceNumber ?? ''}
                  onChange={(event) => set({ invoiceNumber: event.target.value })}
                  placeholder={t('documents.searchPlaceholder')}
                  className="h-full w-full rounded-sm border border-border-subtle bg-surface-tab-bar ps-11 pe-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-300"
                />
              </label>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((open) => !open)}
                  className={[
                    'inline-flex h-[46px] shrink-0 items-center gap-2 rounded-sm border px-4 text-sm font-medium transition-colors',
                    filtered
                      ? 'border-primary-700 bg-primary-25 text-primary-800'
                      : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                  ].join(' ')}
                >
                  <img src={filterIcon} alt="" className="size-5" />
                  {t('documents.filters')}
                </button>
                <SortMenu value={sort} options={SORT_OPTIONS} onChange={setSort} width={240} />
              </div>
            </div>

            {filtersOpen ? (
              <div className="grid gap-3 border-t border-surface-background px-4 py-4 md:grid-cols-3 xl:grid-cols-5">
                <FilterField label={t('documents.filter.kind')}>
                  <Select
                    value={kindChoice}
                    onChange={(choice) => {
                      setKindChoice(choice as KindChoice | '')
                      set({ documentKind: kindQuery(choice as KindChoice | '').documentKind })
                    }}
                    ariaLabel={t('documents.filter.kind')}
                    compact
                    options={[
                      { value: '', label: t('documents.allKinds') },
                      ...KIND_CHOICES.map((kind) => ({
                        value: kind,
                        label: t(`documents.kind.${kind}`),
                      })),
                    ]}
                  />
                </FilterField>
                <FilterField label={t('documents.filter.tdd')}>
                  <Select
                    value={filters.tddStatus ?? ''}
                    onChange={(tddStatus) => set({ tddStatus })}
                    ariaLabel={t('documents.filter.tdd')}
                    compact
                    options={[
                      { value: '', label: t('documents.allTdd') },
                      ...TDD_STATUSES.map((status) => ({
                        value: status,
                        label: t(`documents.tdd.${status}`),
                      })),
                    ]}
                  />
                </FilterField>
                <FilterField label={t('documents.filter.taxYear')}>
                  <Select
                    value={filters.taxYear ?? ''}
                    onChange={(taxYear) => set({ taxYear })}
                    ariaLabel={t('documents.filter.taxYear')}
                    compact
                    options={[
                      { value: '', label: t('documents.allYears') },
                      ...taxYears(today).map((year) => ({
                        value: String(year),
                        label: String(year),
                      })),
                    ]}
                  />
                </FilterField>
                <FilterField label={t('documents.filter.from')}>
                  <DateField
                    value={filters.from ?? ''}
                    max={filters.to || today}
                    ariaLabel={t('documents.filter.from')}
                    onChange={(from) => set({ from })}
                  />
                </FilterField>
                <FilterField label={t('documents.filter.to')}>
                  <DateField
                    value={filters.to ?? ''}
                    min={filters.from || undefined}
                    max={today}
                    ariaLabel={t('documents.filter.to')}
                    onChange={(to) => set({ to })}
                  />
                </FilterField>
              </div>
            ) : null}

            {picked.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-y border-primary-100 bg-primary-25 px-5 py-3">
                <div className="flex items-center gap-3">
                  <TableCheckbox
                    checked
                    onChange={() => setSelected([])}
                    ariaLabel={t('documents.clearSelection')}
                  />
                  <p className="text-sm font-medium text-primary-700">
                    {t('documents.selected', { count: picked.length, files: pickedFiles })}
                    {pickedBytes != null ? ` · ${formatBytes(pickedBytes)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void downloadPicked()}
                    className="inline-flex h-[38px] items-center gap-2 rounded-sm bg-primary-700 px-3.5 text-sm font-medium text-white transition-colors hover:bg-primary-800"
                  >
                    <img src={downloadIcon} alt="" className="size-4 brightness-0 invert" />
                    {t('documents.downloadZip')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    className="inline-flex h-[38px] items-center rounded-sm border border-warning-700 bg-white px-3.5 text-sm font-medium text-warning-700 transition-colors hover:bg-warning-100/50"
                  >
                    {t('documents.clear')}
                  </button>
                </div>
              </div>
            ) : null}

            {list.read.status === 'loading' ? (
              <div className="border-t border-surface-background p-5">
                <LoadingNotice />
              </div>
            ) : null}

            {data && items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 border-t border-surface-background px-6 py-14 text-center">
                <img src={emptyArt} alt="" className="h-[90px] w-auto" />
                <p className="mt-3 text-base font-medium text-text-primary">
                  {t('documents.noMatch.title')}
                </p>
                <p className="max-w-[440px] text-sm font-medium leading-[1.5] text-text-quaternary">
                  {t(
                    tab === 'legalHold'
                      ? data.has_more || data.page > 0 || filtered
                        ? 'documents.noMatch.noHoldOnPage'
                        : 'documents.noMatch.noHold'
                      : typeCode && (data.has_more || data.page > 0)
                        ? 'documents.noMatch.noTypeOnPage'
                        : 'documents.noMatch.note',
                  )}
                </p>
              </div>
            ) : null}

            {data && items.length > 0 ? (
              <ul className="flex flex-col border-t border-surface-background">
                {items.map((item) => (
                  <RecordRow
                    key={item.invoice_uuid}
                    item={item}
                    today={today}
                    language={language}
                    checked={selected.includes(item.invoice_uuid)}
                    onCheck={() => setSelected((current) => toggle(current, item.invoice_uuid))}
                    open={expanded.includes(item.invoice_uuid)}
                    onToggle={() => setExpanded((current) => toggle(current, item.invoice_uuid))}
                    onDownload={(id) => void download(item, id)}
                  />
                ))}
              </ul>
            ) : null}

            {data ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
                <p className="text-sm font-medium text-text-secondary">
                  {showing && showing.count > 0
                    ? pageOnly
                      ? t('documents.showingOnPage', { count: showing.count })
                      : tabTotal != null
                        ? t('documents.showingOf', {
                            shown: formatCount(showing.count, language),
                            total: formatCount(tabTotal, language),
                          })
                        : t('documents.showingRows', { from: showing.from, to: showing.to })
                    : t('documents.showingNone')}
                  {showing && showing.count > 1 && sort !== 'natural'
                    ? ` · ${t('documents.sortedOnPage')}`
                    : ''}
                </p>
                <Pager
                  page={data.page + 1}
                  pageCount={pageCount}
                  onChange={(next) => setPage(Math.max(0, Math.min(next, pageCount) - 1))}
                  labels={{
                    nav: t('documents.pages'),
                    previous: t('documents.previousPage'),
                    next: t('documents.nextPage'),
                  }}
                />
              </div>
            ) : null}
          </section>
        )}
      </div>
    </AppShell>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-text-quaternary">{label}</span>
      {children}
    </div>
  )
}

/**
 * The four cards. TODO(backend): `summary` on the list (ask 3.1). An empty archive is the one case
 * the page can answer itself (nothing kept, nothing on hold); otherwise an unknown figure says so.
 */
function Figures({
  summary,
  archiveEmpty,
  language,
}: {
  summary: ArchiveSummary | null
  archiveEmpty: boolean
  language: string
}) {
  const { t } = useTranslation()
  const na = t('documents.kpi.na')
  const kept = summary
    ? formatCount(summary.documents, language)
    : archiveEmpty
      ? formatCount(0, language)
      : na
  const across = summary ? summary.invoices_and_bills : archiveEmpty ? 0 : null
  const space = summary ? formatGb(summary.bytes_used) : archiveEmpty ? formatGb(0) : na
  const quotaGb = summary?.quota_bytes ? Math.round(summary.quota_bytes / 1024 ** 3) : null
  const spacePercent = summary?.quota_bytes
    ? Math.min(100, (summary.bytes_used / summary.quota_bytes) * 100)
    : 0
  const integrity = summary?.integrity ?? null
  const holds = summary
    ? formatCount(summary.legal_hold.count, language)
    : archiveEmpty
      ? formatCount(0, language)
      : na

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Figure
        icon={kpiArchiveIcon}
        tile="bg-primary-50"
        title={t('documents.kpi.kept')}
        value={kept}
      >
        {across != null
          ? t('documents.kpi.keptNote', { count: across, formatted: formatCount(across, language) })
          : t('documents.kpi.notCounted')}
      </Figure>
      <Figure
        icon={kpiSpaceIcon}
        tile="bg-surface-background"
        title={t('documents.kpi.space')}
        value={space}
      >
        <span
          className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-surface-background"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-text-primary"
            style={{ width: `${spacePercent}%` }}
          />
        </span>
        <span className="mt-2.5 block">
          {quotaGb != null
            ? t('documents.kpi.spaceNote', { quota: quotaGb })
            : t('documents.kpi.noQuota')}
        </span>
      </Figure>
      <Figure
        icon={kpiIntegrityIcon}
        tile="bg-success-100"
        title={t('documents.kpi.integrity')}
        value={
          integrity
            ? t(integrity.all_passing ? 'documents.kpi.allPassing' : 'documents.kpi.someFailing')
            : na
        }
      >
        {t('documents.kpi.integrityNote', {
          date: integrity?.last_sweep_at
            ? formatInstantDay(integrity.last_sweep_at, language).replace(/\s\d{4}$/, '')
            : '--/--',
        })}
        {integrity?.all_passing ? ` · ${t('documents.kpi.nothingAltered')}` : ''}
      </Figure>
      <article className="rounded-md border border-pending-200 bg-pending-100 p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pending-500">
            <img src={kpiHoldIcon} alt="" className="size-5" />
          </span>
          <h3 className="text-base font-medium leading-[1.2] text-text-primary">
            {t('documents.kpi.hold')}
          </h3>
        </div>
        <p className="mt-5 text-2xl font-medium leading-[1.2] text-pending-700">{holds}</p>
        <p className="mt-3 text-xs font-medium leading-[1.4] text-pending-500">
          {summary?.legal_hold.reason
            ? t('documents.kpi.holdNote', { reason: summary.legal_hold.reason })
            : t('documents.kpi.holdNoReason')}
        </p>
      </article>
    </div>
  )
}

function Figure({
  icon,
  tile,
  title,
  value,
  children,
}: {
  icon: string
  tile: string
  title: string
  value: string
  children: ReactNode
}) {
  return (
    <article className="rounded-md bg-surface-card p-5">
      <div className="flex items-center gap-3">
        <span
          className={['flex size-9 shrink-0 items-center justify-center rounded-full', tile].join(
            ' ',
          )}
        >
          <img src={icon} alt="" className="size-5" />
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-primary">{title}</h3>
      </div>
      <p className="mt-5 text-2xl font-medium leading-[1.2] text-text-primary">
        <bdi dir="ltr">{value}</bdi>
      </p>
      <div className="mt-3 text-xs font-medium leading-[1.4] text-text-quaternary">{children}</div>
    </article>
  )
}

function RecordRow({
  item,
  today,
  language,
  checked,
  onCheck,
  open,
  onToggle,
  onDownload,
}: {
  item: ArchiveItemDto
  today: string
  language: string
  checked: boolean
  onCheck: () => void
  open: boolean
  onToggle: () => void
  onDownload: (id: ArtefactId) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const kind = recordKind(item)
  const chip = statusChip(item)
  const tone = CHIP_TONE[chip.tone]
  const held = heldArtefacts(item)
  const party = counterpartyLabel(item)
  const number = item.invoice_number ?? t('documents.noNumber')
  const detailPath = `/compliance/documents/${item.invoice_uuid}`
  const retainUntil = item.retention.retain_until
  const left = retainUntil ? timeLeft(retainUntil, today) : null
  const hold = item.retention.legal_hold.held

  const dated = issueDateOf(item)
  const meta = [
    `${t(`documents.recordKindLabel.${kind}`)} · ${t(
      dated.received ? 'documents.metaReceived' : 'documents.metaIssued',
      { date: formatInstantDay(dated.date, language) },
    )}`,
    item.total_amount != null
      ? `OMR ${formatAmount(item.total_amount, item.currency ?? 'OMR', language)}`
      : null,
    item.against_number
      ? // Isolated so "INV-1993" keeps its order inside an Arabic line.
        t('documents.metaCorrects', { number: `⁨${item.against_number}⁩` })
      : null,
    t('documents.filesCount', { count: held.length }),
  ].filter(Boolean)

  const keptNote = hold
    ? `${t(retentionShortKey(item.retention.retention_class))} · ${t('documents.keptOnHold')}`
    : left
      ? left.months > 0
        ? t('documents.yearsMonthsLeft', { years: left.years, months: left.months })
        : t('documents.yearsLeft', { count: left.years })
      : retainUntil
        ? t('documents.retentionOver')
        : t('documents.noFixedTerm')

  return (
    <li className="border-b border-surface-background last:border-0">
      <div
        className={[
          'flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 md:flex-nowrap',
          checked ? 'border-s-[3px] border-s-primary-700 ps-[17px]' : '',
        ].join(' ')}
      >
        <TableCheckbox
          checked={checked}
          onChange={onCheck}
          ariaLabel={t('documents.pick', { number })}
        />
        <span
          className={[
            'flex size-10 shrink-0 items-center justify-center rounded-sm',
            KIND_TILE[kind],
          ].join(' ')}
        >
          <img src={KIND_ICON[kind]} alt="" className="size-5" />
        </span>

        <div className="min-w-0 flex-1 max-md:basis-[calc(100%-120px)]">
          <p className="text-base font-medium leading-[1.3] text-text-primary">
            <Link to={detailPath} className="hover:text-primary-700">
              {number}
            </Link>
            {party ? <span> · {party}</span> : null}
          </p>
          <p className="mt-1 text-[13px] font-medium leading-[1.3] text-text-quaternary">
            <RialText>{meta.join(' · ')}</RialText>
          </p>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          {held.map((artefact) => (
            <span
              key={artefact.id}
              className={[
                'inline-flex h-[24px] items-center rounded-[3px] px-2 text-[10px] font-semibold tracking-[0.5px]',
                FORMAT_TONE[artefact.id],
              ].join(' ')}
            >
              {FORMAT_TAG[artefact.id]}
            </span>
          ))}
        </div>

        <div className="w-[160px] shrink-0 max-md:ms-[88px]">
          <p className="text-[10px] font-medium uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
            {t('documents.keptUntil')}
          </p>
          <p className="mt-0.5 text-sm font-medium leading-[1.3] text-text-primary">
            {retainUntil ? formatDate(retainUntil, language) : t('documents.youDecide')}
          </p>
          <p
            className={[
              'mt-0.5 text-xs font-medium leading-[1.3]',
              hold ? 'text-pending-700' : 'text-text-quaternary',
            ].join(' ')}
          >
            {keptNote}
          </p>
        </div>

        <span className="min-w-[150px] shrink-0">
          <span
            className={[
              'inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-xs font-medium',
              tone.bg,
              tone.fg,
            ].join(' ')}
          >
            <span className={['size-1.5 shrink-0 rounded-full', tone.dot].join(' ')} />
            {t(chip.key)}
          </span>
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={t(open ? 'documents.collapse' : 'documents.expand', { number })}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-surface-background"
        >
          <img
            src={chevronIcon}
            alt=""
            className={['size-5 transition-transform', open ? '-rotate-90' : 'rotate-90'].join(' ')}
          />
        </button>
      </div>

      {open ? (
        <ul className="border-t border-surface-background bg-surface-tab-bar/60">
          {held.map((artefact) => {
            const name =
              artefactFileName(item.invoice_number ?? item.invoice_uuid.slice(0, 8), artefact.id) ??
              t(`documents.fileName.${artefact.id}`)
            return (
              <li
                key={artefact.id}
                className="flex flex-wrap items-center gap-3 border-b border-surface-background px-5 py-3 ps-[60px] last:border-0 max-md:ps-5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-subtle bg-white">
                  <img src={FILE_ICON[artefact.id]} alt="" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-[1.3] text-text-primary">{name}</p>
                  <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                    {t(fileNoteKey(item, artefact.id))}
                    {artefact.id === 'tdd'
                      ? ` · ${t(item.tdd.status ? `documents.tdd.${item.tdd.status}` : 'documents.tdd.none')}`
                      : ''}
                  </p>
                </div>
                {artefact.verified ? (
                  <p className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#3d5648]">
                    <img src={verifiedIcon} alt="" className="size-3.5" />
                    {t('documents.verified')}
                  </p>
                ) : null}
                <p className="w-[70px] shrink-0 text-end text-xs font-medium text-text-quaternary">
                  {artefact.bytes != null ? formatBytes(artefact.bytes) : ''}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={t('documents.viewFile', { name })}
                    onClick={() =>
                      navigate(
                        artefact.opens
                          ? '/compliance/activity'
                          : `${detailPath}?file=${artefact.id}`,
                      )
                    }
                    className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white hover:bg-primary-25"
                  >
                    <img src={viewIcon} alt="" className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('documents.downloadFile', { name })}
                    disabled={!artefact.href || artefact.opens}
                    title={!artefact.href ? t('documents.notServed') : undefined}
                    onClick={() => onDownload(artefact.id)}
                    className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white hover:bg-primary-25 disabled:opacity-40"
                  >
                    <img src={downloadIcon} alt="" className="size-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </li>
  )
}

/** A received record's tax document is ours as receiver (role 02), and its PDF is the supplier's. */
function fileNoteKey(item: ArchiveItemDto, id: ArtefactId): string {
  if (reportsAsReceiver(item) && id === 'tdd') return 'documents.fileNote.tddReceived'
  if (item.direction === 'RECEIVED' && id === 'pdf') return 'documents.fileNote.pdfReceived'
  return `documents.fileNote.${id}`
}

/** The space card reads in gigabytes: "2.8 GB", and "0 GB" for an empty archive. */
function formatGb(bytes: number): string {
  const gb = bytes / 1024 ** 3
  return gb === 0 ? '0 GB' : `${gb.toFixed(1)} GB`
}
