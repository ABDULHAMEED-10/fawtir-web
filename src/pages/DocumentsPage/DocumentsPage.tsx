import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { FilterMenu, Popover, TableCheckbox } from '../../components/ui'
import {
  DOC_RECORDS,
  DOC_STATS,
  DOC_TABS,
  DOC_TAB_KINDS,
  PAGE_SIZE,
  formatSize,
  totalKb,
  type DocKind,
  type DocRecord,
  type DocStatus,
  type DocTabId,
} from '../../lib/documents'
import kpiArchiveIcon from '../../assets/documents/kpi-archive.svg'
import kpiSpaceIcon from '../../assets/documents/kpi-space.svg'
import kpiIntegrityIcon from '../../assets/documents/kpi-integrity.svg'
import kpiHoldIcon from '../../assets/documents/kpi-hold.svg'
import recInvoiceIcon from '../../assets/documents/rec-invoice.svg'
import recBillIcon from '../../assets/documents/rec-bill.svg'
import recCreditIcon from '../../assets/documents/rec-credit.svg'
import recDebitIcon from '../../assets/documents/rec-debit.svg'
import recContractIcon from '../../assets/documents/rec-contract.svg'
import fileXmlIcon from '../../assets/documents/file-xml.svg'
import fileTddIcon from '../../assets/documents/file-tdd.svg'
import fileQrIcon from '../../assets/documents/file-qr.svg'
import fileMlsIcon from '../../assets/documents/file-mls.svg'
import verifiedIcon from '../../assets/documents/verified.svg'
import emptyArt from '../../assets/documents/empty.svg'
import uploadIcon from '../../assets/bills/upload.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/bills/sort.svg'
import filterIcon from '../../assets/bills/filter.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import viewIcon from '../../assets/actions/view.svg'

const KIND_ICON: Record<DocKind, string> = {
  salesInvoice: recInvoiceIcon,
  billReceived: recBillIcon,
  creditNote: recCreditIcon,
  debitNote: recDebitIcon,
  contract: recContractIcon,
}

const KIND_TILE: Record<DocKind, string> = {
  salesInvoice: 'bg-primary-50',
  billReceived: 'bg-surface-background',
  creditNote: 'bg-success-100',
  debitNote: 'bg-pending-100',
  contract: 'bg-surface-background',
}

const FILE_ICON = {
  xml: fileXmlIcon,
  tdd: fileTddIcon,
  pdf: fileXmlIcon,
  qr: fileQrIcon,
  mls: fileMlsIcon,
}

const STATUS_CHIP: Record<DocStatus, { bg: string; fg: string; dot: string; labelKey: string }> = {
  tddAccepted: {
    bg: 'bg-success-100',
    fg: 'text-[#3d5648]',
    dot: 'bg-[#3d5648]',
    labelKey: 'documents.status.tddAccepted',
  },
  tddRejected: {
    bg: 'bg-warning-100',
    fg: 'text-warning-700',
    dot: 'bg-warning-700',
    labelKey: 'documents.status.tddRejected',
  },
  legalHold: {
    bg: 'bg-pending-100',
    fg: 'text-pending-700',
    dot: 'bg-pending-700',
    labelKey: 'documents.status.legalHold',
  },
  contract: {
    bg: 'bg-surface-background',
    fg: 'text-text-tertiary',
    dot: 'bg-text-quaternary',
    labelKey: 'documents.status.contract',
  },
}

/** The little format tags on the right of a record's title. */
const FORMAT_TAG: Record<string, string> = {
  XML: 'bg-primary-50 text-primary-700',
  TDD: 'bg-success-100 text-[#3d5648]',
  PDF: 'bg-warning-100 text-warning-700',
  QR: 'bg-surface-background text-text-tertiary',
  MLS: 'bg-surface-background text-text-tertiary',
  MDN: 'bg-surface-background text-text-tertiary',
  V2: 'bg-pending-100 text-pending-700',
}

type SortKey = 'natural' | 'keptSoonest' | 'keptLatest' | 'largest'

const SORT_OPTIONS: { value: SortKey; labelKey: string }[] = [
  { value: 'natural', labelKey: 'recurringBills.sortOptions.natural' },
  { value: 'keptSoonest', labelKey: 'documents.sortOptions.keptSoonest' },
  { value: 'keptLatest', labelKey: 'documents.sortOptions.keptLatest' },
  { value: 'largest', labelKey: 'documents.sortOptions.largest' },
]

/** `23 Jun 2036` → a sortable number, so "kept until" can order without a date library. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const keptValue = (kept: string) => {
  if (!kept) return Infinity
  const [day, month, year] = kept.split(' ')
  return Number(year) * 10000 + (MONTHS.indexOf(month) + 1) * 100 + Number(day)
}

export function DocumentsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<DocTabId>('all')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [sort, setSort] = useState<SortKey>('natural')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>(['INV-2038', 'INV-1842'])
  const [expanded, setExpanded] = useState<string[]>(['INV-2038'])

  const records = DOC_RECORDS

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = records.filter((record) => {
      const inTab = DOC_TAB_KINDS[activeTab](record)
      const inKind = kind === 'all' || record.kind === kind
      const matches =
        needle === '' ||
        record.title.toLowerCase().includes(needle) ||
        record.party.toLowerCase().includes(needle)
      return inTab && inKind && matches
    })
    if (sort === 'natural') return filtered
    return [...filtered].sort((a, b) => {
      if (sort === 'largest') return totalKb(b) - totalKb(a)
      const diff = keptValue(a.keptUntil) - keptValue(b.keptUntil)
      return sort === 'keptSoonest' ? diff : -diff
    })
  }, [activeTab, kind, query, records, sort])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const counts = (tab: DocTabId) => records.filter(DOC_TAB_KINDS[tab]).length

  /** The selection bar reports real totals, summed from the records it holds. */
  const picked = records.filter((record) => selected.includes(record.id))
  const pickedFiles = picked.reduce((sum, record) => sum + record.files.length, 0)
  const pickedKb = picked.reduce((sum, record) => sum + totalKb(record), 0)

  const spacePercent = Math.round((DOC_STATS.spaceUsedGb / DOC_STATS.quotaGb) * 100)

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]

  const empty = rows.length === 0

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[700px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('documents.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.5] text-[#8f8f8f]">
              {t('documents.subtitle')}
            </p>
          </div>
          <Link
            to="/compliance/documents/upload"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
          >
            <img src={uploadIcon} alt="" className="size-6" />
            {t('documents.upload.cta')}
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-50">
                <img src={kpiArchiveIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('documents.kpi.kept')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary">
              {DOC_STATS.kept}
            </p>
            <p className="mt-2 text-sm font-medium leading-[1.3] text-text-quaternary">
              {t('documents.kpi.keptNote', { count: DOC_STATS.acrossDocuments })}
            </p>
          </article>

          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-50">
                <img src={kpiSpaceIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('documents.kpi.space')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary">
              {DOC_STATS.spaceUsedGb} GB
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-background">
              <div
                className="h-full rounded-full bg-primary-700"
                style={{ width: `${spacePercent}%` }}
              />
            </div>
            <p className="mt-2 text-sm font-medium leading-[1.3] text-text-quaternary">
              {t('documents.kpi.spaceNote', { quota: DOC_STATS.quotaGb })}
            </p>
          </article>

          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-success-100">
                <img src={kpiIntegrityIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('documents.kpi.integrity')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary">
              {t('documents.kpi.allPassing')}
            </p>
            <p className="mt-2 text-sm font-medium leading-[1.3] text-text-quaternary">
              {t('documents.kpi.integrityNote', { date: DOC_STATS.lastSweep })}
            </p>
          </article>

          <article className="rounded-md border border-pending-200 bg-pending-100 p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-pending-500">
                <img src={kpiHoldIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('documents.kpi.hold')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-pending-700">
              {DOC_STATS.onHold}
            </p>
            <p className="mt-2 text-sm font-medium leading-[1.3] text-pending-500">
              {t('documents.kpi.holdNote', { period: DOC_STATS.auditPeriod })}
            </p>
          </article>
        </div>

        {/* The archive */}
        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
            {DOC_TABS.map((tab) => {
              const active = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id)
                    setPage(1)
                  }}
                  className={[
                    'inline-flex h-[54px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary-700 text-primary-700'
                      : 'border-transparent text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(tab.labelKey)}
                  <span
                    className={[
                      'text-xs font-semibold',
                      active ? 'text-primary-700' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {counts(tab.id)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <label className="relative flex h-[46px] w-full max-w-[344px] items-center max-md:max-w-none max-md:basis-full">
              <img
                src={searchIcon}
                alt=""
                className="pointer-events-none absolute start-3.5 size-5 opacity-60"
              />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
                placeholder={t('documents.searchPlaceholder')}
                className="h-full w-full rounded-sm border border-border-subtle bg-white ps-11 pe-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-300"
              />
            </label>

            <div className="flex items-center gap-2.5">
              <FilterMenu
                label={t('billsPage.filters')}
                value={kind}
                defaultValue="all"
                icon={filterIcon}
                options={[
                  { value: 'all', label: t('documents.allKinds') },
                  { value: 'salesInvoice', label: t('documents.kinds.salesInvoice') },
                  { value: 'billReceived', label: t('documents.kinds.billReceived') },
                  { value: 'creditNote', label: t('documents.kinds.creditNote') },
                  { value: 'debitNote', label: t('documents.kinds.debitNote') },
                  { value: 'contract', label: t('documents.kinds.contract') },
                ]}
                onChange={(value) => {
                  setKind(value)
                  setPage(1)
                }}
              />
              <button
                ref={sortRef}
                type="button"
                onClick={() => setSortOpen((open) => !open)}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
              >
                <img src={sortIcon} alt="" className="size-5" />
                {t('billsPage.sort')}
              </button>
              <Popover anchorRef={sortRef} open={sortOpen} onClose={() => setSortOpen(false)}>
                <ul className="w-[230px] py-1.5">
                  {SORT_OPTIONS.map((option) => (
                    <li key={option.value}>
                      <button
                        type="button"
                        onClick={() => {
                          setSort(option.value)
                          setSortOpen(false)
                        }}
                        className={[
                          'flex w-full px-4 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25',
                          option.value === sort ? 'text-primary-700' : 'text-text-secondary',
                        ].join(' ')}
                      >
                        {t(option.labelKey)}
                      </button>
                    </li>
                  ))}
                </ul>
              </Popover>
            </div>
          </div>

          {/* Selection bar — only while something is picked. */}
          {selected.length > 0 && !empty ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-y border-surface-background bg-primary-25 px-5 py-3">
              <div className="flex items-center gap-3">
                <TableCheckbox
                  checked
                  onChange={() => setSelected([])}
                  ariaLabel={t('documents.clearSelection')}
                />
                <p className="text-sm font-semibold text-primary-700">
                  {t('documents.selected', {
                    count: picked.length,
                    files: pickedFiles,
                    size: formatSize(pickedKb),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  className="inline-flex h-[38px] items-center gap-2 rounded-sm bg-primary-700 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                >
                  <img src={downloadIcon} alt="" className="size-4 brightness-0 invert" />
                  {t('documents.downloadZip')}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="inline-flex h-[38px] items-center rounded-sm border border-warning-700 bg-white px-3.5 text-sm font-semibold text-warning-700 transition-colors hover:bg-warning-100/50"
                >
                  {t('documents.clear')}
                </button>
              </div>
            </div>
          ) : null}

          {empty ? (
            <div className="flex flex-col items-center px-5 py-20 text-center">
              <img src={emptyArt} alt="" className="h-[120px] w-auto" />
              <h2 className="mt-6 text-2xl font-medium leading-[1.2] text-text-primary">
                {t('documents.empty.title')}
              </h2>
              <p className="mt-2 max-w-[520px] text-sm font-medium leading-[1.5] text-text-quaternary">
                {t('documents.empty.note')}
              </p>
              <Link
                to="/compliance/documents/upload"
                className="mt-6 inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                <img src={uploadIcon} alt="" className="size-5 brightness-0 invert" />
                {t('documents.upload.cta')}
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col">
              {shown.map((record) => (
                <RecordRow
                  key={record.id}
                  record={record}
                  checked={selected.includes(record.id)}
                  onCheck={() => setSelected((list) => toggle(list, record.id))}
                  open={expanded.includes(record.id)}
                  onToggle={() => setExpanded((list) => toggle(list, record.id))}
                />
              ))}
            </ul>
          )}

          {!empty ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
              <p className="text-sm font-medium text-text-quaternary">
                {t('documents.showingOf', { shown: shown.length, total: rows.length })}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={current === 1}
                  aria-label={t('documents.previousPage')}
                  className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={chevronIcon} alt="" className="size-5 rotate-180" />
                </button>
                {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
                  <button
                    key={number}
                    type="button"
                    onClick={() => setPage(number)}
                    aria-current={number === current ? 'page' : undefined}
                    className={[
                      'inline-flex size-9 items-center justify-center rounded-sm text-sm font-medium transition-colors',
                      number === current
                        ? 'bg-primary-700 text-white'
                        : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                    ].join(' ')}
                  >
                    {number}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(pages, value + 1))}
                  disabled={current === pages}
                  aria-label={t('documents.nextPage')}
                  className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={chevronIcon} alt="" className="size-5" />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  )
}

function RecordRow({
  record,
  checked,
  onCheck,
  open,
  onToggle,
}: {
  record: DocRecord
  checked: boolean
  onCheck: () => void
  open: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const chip = STATUS_CHIP[record.status]

  return (
    <li className="border-b border-surface-background last:border-0">
      <div
        className={[
          'flex items-center gap-3 px-5 py-4',
          checked ? 'border-s-[3px] border-s-primary-700 bg-primary-25/40 ps-[17px]' : '',
        ].join(' ')}
      >
        <TableCheckbox checked={checked} onChange={onCheck} ariaLabel={record.title} />

        <span
          className={[
            'flex size-9 shrink-0 items-center justify-center rounded-sm',
            KIND_TILE[record.kind],
          ].join(' ')}
        >
          <img src={KIND_ICON[record.kind]} alt="" className="size-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-[1.3] text-text-primary">
            <Link to={`/compliance/documents/${record.id}`} className="hover:text-primary-700">
              {record.title}
            </Link>
            {/* An uploaded contract is already named after its supplier. */}
            {record.title.includes(record.party) ? null : (
              <span className="text-text-tertiary"> · {record.party}</span>
            )}
          </p>
          <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
            {t(record.metaKey, record.meta)} ·{' '}
            {record.versions
              ? t('documents.versions', { count: record.versions })
              : t('documents.filesCount', { count: record.files.length })}
          </p>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          {record.formats.map((format) => (
            <span
              key={format}
              className={[
                'inline-flex h-[22px] items-center rounded-[3px] px-1.5 text-[10px] font-semibold tracking-[0.5px]',
                FORMAT_TAG[format],
              ].join(' ')}
            >
              {format}
            </span>
          ))}
        </div>

        <div className="hidden w-[170px] shrink-0 md:block">
          <p className="text-[10px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
            {t('documents.keptUntil')}
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-[1.2] text-text-primary">
            {record.keptUntil || t('documents.kept.youDecide')}
          </p>
          <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
            {t(record.keptNoteKey, record.keptNote)}
          </p>
        </div>

        <span
          className={[
            'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
            chip.bg,
            chip.fg,
          ].join(' ')}
        >
          <span className={['size-1.5 rounded-full', chip.dot].join(' ')} />
          {t(chip.labelKey)}
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={t(open ? 'documents.collapse' : 'documents.expand')}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-surface-background"
        >
          <img
            src={chevronIcon}
            alt=""
            className={['size-5 transition-transform', open ? '-rotate-90' : 'rotate-90'].join(' ')}
          />
        </button>
      </div>

      {/* The files themselves, one row each, with their fingerprint result. */}
      {open ? (
        <ul className="bg-surface-tab-bar/60">
          {record.files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 border-t border-surface-background px-5 py-3 ps-[68px]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-white">
                <img src={FILE_ICON[file.icon]} alt="" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-[1.3] text-text-primary">{file.name}</p>
                <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                  {t(file.noteKey)}
                </p>
              </div>
              <p className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-text-tertiary sm:flex">
                <img src={verifiedIcon} alt="" className="size-3.5" />
                {t('documents.hashVerified')}
              </p>
              <p className="w-[70px] shrink-0 text-end text-xs font-medium text-text-quaternary">
                {formatSize(file.kb)}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  aria-label={t('documents.viewFile', { name: file.name })}
                  className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white hover:bg-primary-25"
                >
                  <img src={viewIcon} alt="" className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t('documents.downloadFile', { name: file.name })}
                  className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white hover:bg-primary-25"
                >
                  <img src={downloadIcon} alt="" className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
