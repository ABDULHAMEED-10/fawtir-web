import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Pill, TabStrip } from './CatalogShell'
import { useStockAccess } from './StockForms'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { FileDropzone, Modal, OmAmount, Pager, RowsView } from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { pageCountOf, type Page } from '../../api'
import { describeApiFailure } from '../../lib/apiFailure'
import { omr } from '../../lib/catalog'
import { formatInstantDay } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import {
  STOCK_OPENING_IMPORT_MAX_BYTES,
  STOCK_OPENING_MAX_ITEMS,
  downloadStockOpeningFormat,
  loadStockOpeningPage,
  newStockKey,
  postStockOpening,
  postStockOpeningImport,
  stockOpeningPath,
  stockOpeningProblems,
  type StockAdjustmentResponse,
  type StockOpeningProblem,
  type StockOpeningRowDto,
  type StockOpeningState,
} from '../../api/stock/stock'
import {
  OPENING_TABS,
  openingItems,
  quantityText,
  readQuantity,
  stockItemHref,
  stockItemName,
  stockKey,
  stockRefusalKey,
  stockRefusalKeyOf,
  stockUnitName,
  type OpeningEntry,
} from '../../lib/catalogStock'
import tickIcon from '../../assets/catalog/check-white.svg'
import uploadIcon from '../../assets/catalog/upload-ink.svg'
import kindProductIcon from '../../assets/catalog/kind-product.svg'

/** Rows to a page; the server pages, up to 500. */
const OPENING_PAGE_SIZE = 50

const SECONDARY =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-60'
const PRIMARY =
  'inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60'
const FIGURE =
  'h-[38px] w-[110px] rounded-sm border border-border-subtle bg-white px-3 text-end text-sm font-medium text-text-primary tabular-nums outline-none focus:border-primary-700'
const DROP_ZONE =
  'flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-sm border border-dashed border-border-default bg-surface-tab-bar px-4 py-3.5 transition-colors hover:bg-primary-25'

type Edit = { row: StockOpeningRowDto; entry: OpeningEntry }

/** A failed opening in words: the route's own refusal first, then the shared sentence. */
function useFailureText() {
  const { t } = useTranslation()
  return (error: unknown) => {
    const own = stockRefusalKey(error)
    if (own) return t(own)
    const shared = describeApiFailure(error)
    return t(shared.key, shared.values)
  }
}

/** One refused line in words, from its code; the server's English sentence is never shown. */
function problemText(t: (key: string) => string, problem: StockOpeningProblem): string {
  const key = stockRefusalKeyOf(problem.code)
  return key ? t(key) : t('stock.opening.lineProblem')
}

/**
 * Opening stock (Abdul Hameed, 29 Oct 2026): what each counted item had on the shelf when the
 * company started, and optionally what one cost before VAT, for the branch chosen in the sidebar.
 * Read with `stock.read` from `GET /v1/stock/opening`; typing, saving and importing need
 * `stock.adjust` and the plan's `stock` switch. Saved all at once with `POST /v1/stock/opening` or imported
 * from the catalogue's spreadsheet (`POST /v1/stock/opening/import`). Once anything else has
 * moved an item, its opening is locked and the row says to use a count.
 *
 * No frame exists: the screen copies the Stock list's shell, tabs, table and figure cells
 * (handbook section 3.3).
 */
export function StockOpeningPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const access = useStockAccess()
  const failureText = useFailureText()
  const branchRead = useWorkingBranch()
  const branchName = branchRead.name
  const branchId = branchRead.branch?.id ?? null
  const [tab, setTabState] = useState<StockOpeningState>('NOT_SET')
  const [page, setPage] = useState(0)
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [lineProblems, setLineProblems] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  // The key belongs to one body: sending the same figures again (a retry after a lost answer)
  // reuses it and counts once; changed figures get a new key.
  const [attempt, setAttempt] = useState<{ key: string; body: string } | null>(null)
  const [seenBranch, setSeenBranch] = useState(branchId)

  // Another branch is another shelf: what was typed for this one does not carry over.
  if (seenBranch !== branchId) {
    setSeenBranch(branchId)
    setEdits({})
    setLineProblems({})
    setProblem(null)
    setDone(null)
    setAttempt(null)
  }

  const canEdit = access.canAdjust
  const readable = access.canRead && branchId !== null
  const listPath = readable
    ? stockOpeningPath({ branchId, state: tab, page, size: OPENING_PAGE_SIZE })
    : null
  const list = useApiRead<Page<StockOpeningRowDto>>(listPath, () => loadStockOpeningPage(listPath!))
  // The tabs' counts: one row of each state is enough to learn the total.
  const countPath = (state: StockOpeningState) =>
    readable ? stockOpeningPath({ branchId, state, size: 1 }) : null
  const notSetPath = countPath('NOT_SET')
  const setPath = countPath('SET')
  const lockedPath = countPath('LOCKED')
  const notSetCount = useApiRead<Page<StockOpeningRowDto>>(notSetPath, () =>
    loadStockOpeningPage(notSetPath!),
  )
  const setCount = useApiRead<Page<StockOpeningRowDto>>(setPath, () =>
    loadStockOpeningPage(setPath!),
  )
  const lockedCount = useApiRead<Page<StockOpeningRowDto>>(lockedPath, () =>
    loadStockOpeningPage(lockedPath!),
  )
  const totalOf = (read: typeof notSetCount) =>
    read.read.status === 'ready' ? (read.read.data.total ?? read.read.data.items.length) : 0
  const tabCount = (state: StockOpeningState) =>
    totalOf(state === 'NOT_SET' ? notSetCount : state === 'SET' ? setCount : lockedCount)

  const loaded = list.read.status === 'ready' ? list.read.data : null
  const rows = loaded?.items ?? []
  const total = loaded ? (loaded.total ?? rows.length) : 0
  const changed = Object.values(edits).filter(
    ({ entry }) => entry.quantity.trim() !== '' || entry.unitCost.trim() !== '',
  )

  const setTab = (next: StockOpeningState) => {
    setTabState(next)
    setPage(0)
  }
  const refresh = () => {
    list.retry()
    notSetCount.retry()
    setCount.retry()
    lockedCount.retry()
  }

  /** What the row shows in its fields: what was typed, else the opening already set. */
  const entryOf = (row: StockOpeningRowDto): OpeningEntry =>
    edits[stockKey(row)]?.entry ?? {
      quantity: row.opening ? String(row.opening.quantity) : '',
      unitCost: row.opening && row.opening.unitCost !== null ? row.opening.unitCost.toFixed(3) : '',
    }
  const patch = (row: StockOpeningRowDto, change: Partial<OpeningEntry>) => {
    setEdits((all) => ({
      ...all,
      [stockKey(row)]: { row, entry: { ...entryOf(row), ...change } },
    }))
    setLineProblems((all) => {
      if (!(stockKey(row) in all)) return all
      const next = { ...all }
      delete next[stockKey(row)]
      return next
    })
  }

  const finished = (result: StockAdjustmentResponse) => {
    setDone(t('stock.opening.done', { number: result.number, count: result.lines.length }))
    refresh()
  }

  const save = () => {
    setDone(null)
    const read = openingItems(
      changed.map(({ row, entry }) => ({
        productId: row.productId,
        variantId: row.variantId,
        entry,
      })),
    )
    if (read.problem !== null) return setProblem(t(`stock.opening.problem.${read.problem}`))
    if (read.items.length > STOCK_OPENING_MAX_ITEMS)
      return setProblem(t('stock.opening.problem.tooMany', { count: STOCK_OPENING_MAX_ITEMS }))
    const body = { branchId: branchId!, items: read.items }
    const text = JSON.stringify(body)
    const key = attempt && attempt.body === text ? attempt.key : newStockKey()
    setAttempt({ key, body: text })
    setBusy(true)
    setProblem(null)
    setLineProblems({})
    postStockOpening(key, body).then(
      (result) => {
        setBusy(false)
        setEdits({})
        setAttempt(null)
        finished(result)
      },
      (error) => {
        setBusy(false)
        const lines = stockOpeningProblems(error)
        const byRow: Record<string, string> = {}
        for (const line of lines) {
          const item = line.row !== null ? read.items[line.row - 1] : undefined
          const productId = line.productId ?? item?.productId
          if (!productId) continue
          const variantId = line.variantId ?? item?.variantId ?? null
          byRow[stockKey({ productId, variantId })] = problemText(t, line)
        }
        setLineProblems(byRow)
        setProblem(lines.length ? t('stock.opening.nothingSaved') : failureText(error))
      },
    )
  }

  const shell = (body: React.ReactNode, actions?: React.ReactNode) => (
    <CatalogShell
      crumbs={[{ labelKey: 'stock.title', to: '/stock' }, { labelKey: 'stock.opening.title' }]}
      title={t('stock.opening.title')}
      subtitle={t('stock.opening.subtitle')}
      pills={
        branchName ? (
          <Pill tone="brand">
            {t('stock.atBranch')} <bdi>{branchName}</bdi>
          </Pill>
        ) : undefined
      }
      actions={actions}
    >
      {body}
    </CatalogShell>
  )

  if (!access.ready || branchRead.read.status === 'loading') return shell(<LoadingNotice />)
  if (!access.canRead) return shell(<PermissionDeniedNotice />)
  if (branchRead.read.status === 'failed')
    return shell(
      <ApiReadFailure error={branchRead.read.error} retry={() => window.location.reload()} />,
    )

  return shell(
    <>
      {!canEdit && access.holdsAdjust ? (
        <p className="rounded-md bg-surface-card p-5 text-sm font-medium text-text-tertiary">
          {t('stock.opening.planOff')}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={OPENING_TABS} value={tab} onChange={setTab} count={tabCount} />

        <p className="px-5 pt-4 text-sm font-medium leading-[1.4] text-text-tertiary">
          {t(`stock.opening.tabNote.${tab}`)}
        </p>

        {done ? (
          <p role="status" className="px-5 pt-3 text-sm font-semibold text-[#3d5648]">
            {done}
          </p>
        ) : null}

        {list.read.status === 'failed' ? (
          <div className="p-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : list.read.status === 'loading' ? (
          <div className="p-5">
            <LoadingNotice />
          </div>
        ) : (
          <div className="pt-4">
            <RowsView>
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="whitespace-nowrap bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                    <th className="h-[46px] ps-5 pe-3 text-start font-semibold">
                      {t('stock.col.item')}
                    </th>
                    <th className="h-[46px] px-3 text-end font-semibold">
                      {t('stock.col.onHand')}
                    </th>
                    <th className="h-[46px] px-3 text-end font-semibold">
                      {t('stock.opening.col.quantity')}
                    </th>
                    <th className="h-[46px] px-3 text-end font-semibold">
                      {t('stock.opening.col.unitCost')}
                    </th>
                    <th className="h-[46px] px-3 text-end font-semibold">
                      {t('stock.opening.col.value')}
                    </th>
                    <th className="h-[46px] ps-3 pe-5 text-start font-semibold">
                      {t('stock.opening.col.state')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-12 text-center text-sm font-medium text-text-quaternary"
                      >
                        {t(`stock.opening.empty.${tab}`)}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <OpeningRow
                        key={stockKey(row)}
                        row={row}
                        entry={entryOf(row)}
                        editable={canEdit && row.state !== 'LOCKED'}
                        problem={lineProblems[stockKey(row)] ?? null}
                        onChange={(change) => patch(row, change)}
                        language={language}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </RowsView>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm font-medium text-text-quaternary">
            {t('stock.live.showing', { shown: rows.length, total })}
          </p>
          <Pager
            page={page + 1}
            pageCount={loaded ? Math.max(1, pageCountOf(loaded)) : 1}
            onChange={(next) => setPage(next - 1)}
            disabled={!loaded}
            labels={{
              nav: t('appList.pager.label'),
              previous: t('appList.pager.previous'),
              next: t('appList.pager.next'),
            }}
          />
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-tertiary">
                {t('stock.opening.changed', { count: changed.length })}
              </p>
              {problem ? (
                <p role="alert" className="mt-1 text-sm font-medium text-danger-700">
                  {problem}
                </p>
              ) : null}
            </div>
            <button type="button" onClick={save} disabled={busy} className={PRIMARY}>
              <img src={tickIcon} alt="" className="size-4" />
              {t('stock.opening.save')}
            </button>
          </div>
        ) : null}
      </section>

      {branchId && canEdit ? (
        <StockOpeningImportModal
          open={importing}
          onClose={() => setImporting(false)}
          branchId={branchId}
          onDone={(result) => {
            setImporting(false)
            setEdits({})
            setLineProblems({})
            setProblem(null)
            finished(result)
          }}
        />
      ) : null}
    </>,
    canEdit ? (
      <button type="button" onClick={() => setImporting(true)} className={SECONDARY}>
        <img src={uploadIcon} alt="" className="size-[18px]" />
        {t('stock.opening.import')}
      </button>
    ) : undefined,
  )
}

/** The words for the movement that locked an opening. */
const LOCKED_BY_KEY: Record<string, string> = {
  SALE: 'stock.opening.lockedBy.SALE',
  RECEIPT: 'stock.opening.lockedBy.RECEIPT',
  WRITE_OFF: 'stock.opening.lockedBy.WRITE_OFF',
  COUNT_CORRECTION: 'stock.opening.lockedBy.COUNT_CORRECTION',
  REFUND_RETURN: 'stock.opening.lockedBy.REFUND_RETURN',
}

function OpeningRow({
  row,
  entry,
  editable,
  problem,
  onChange,
  language,
}: {
  row: StockOpeningRowDto
  entry: OpeningEntry
  editable: boolean
  problem: string | null
  onChange: (change: Partial<OpeningEntry>) => void
  language: string
}) {
  const { t } = useTranslation()
  const name = stockItemName(row, language)
  const unit = stockUnitName(t, row.unitCode, language)
  const opening = row.opening
  // The value follows what is typed: quantity times the cost each, before VAT.
  const typedQuantity = readQuantity(entry.quantity, { positive: false })
  const typedCost = readQuantity(entry.unitCost, { positive: false })
  const value =
    editable && typedQuantity !== null && typedCost !== null
      ? Math.round(typedQuantity * typedCost * 1000) / 1000
      : editable
        ? null
        : (opening?.value ?? null)

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="ps-5 pe-3 py-4 align-middle">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-50">
            <img src={kindProductIcon} alt="" className="size-[18px]" />
          </span>
          <div className="min-w-0 max-w-[260px]">
            <p title={name} className="truncate text-sm font-semibold text-text-primary">
              {name}
            </p>
            <p className="mt-1 truncate text-xs font-medium text-text-quaternary">
              <span dir="ltr">
                {row.variantCode ? `${row.code} / ${row.variantCode}` : row.code}
              </span>
              {row.variantRetired ? ` · ${t('stock.live.retired')}` : ''}
            </p>
            {problem ? (
              <p role="alert" className="mt-1 text-xs font-semibold text-danger-700">
                {problem}
              </p>
            ) : null}
          </div>
        </div>
      </td>

      <td className="px-3 py-4 align-middle text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums" dir="ltr">
          {row.onHand === null ? '—' : quantityText(row.onHand, language)}
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {row.onHand === null ? t('stock.live.notCountedYet') : unit}
        </p>
      </td>

      <td className="px-3 py-4 align-middle text-end">
        {editable ? (
          <>
            <input
              value={entry.quantity}
              inputMode="decimal"
              dir="ltr"
              aria-label={t('stock.opening.quantityOf', { name })}
              onFocus={selectAllOnFocus}
              onChange={(event) =>
                onChange({ quantity: event.target.value.replace(/[^\d.]/g, '') })
              }
              className={FIGURE}
            />
            <p className="mt-1 text-xs font-medium text-text-quaternary">{unit}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-text-primary tabular-nums" dir="ltr">
              {opening ? quantityText(opening.quantity, language) : '—'}
            </p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">{unit}</p>
          </>
        )}
      </td>

      <td className="px-3 py-4 align-middle text-end">
        {editable ? (
          <span className="inline-flex items-center gap-1.5">
            <OmAmount
              size="xs"
              amount={
                <input
                  value={entry.unitCost}
                  inputMode="decimal"
                  dir="ltr"
                  placeholder="0.000"
                  aria-label={t('stock.opening.unitCostOf', { name })}
                  onFocus={selectAllOnFocus}
                  onChange={(event) =>
                    onChange({ unitCost: event.target.value.replace(/[^\d.]/g, '') })
                  }
                  onBlur={() => {
                    const cost = readQuantity(entry.unitCost, { positive: false })
                    if (cost !== null) onChange({ unitCost: cost.toFixed(3) })
                  }}
                  className={FIGURE}
                />
              }
            />
          </span>
        ) : opening && opening.unitCost !== null ? (
          <OmAmount
            size="xs"
            amount={omr(opening.unitCost)}
            amountClassName="text-sm font-semibold text-text-primary tabular-nums"
            className="justify-end"
          />
        ) : (
          <p className="text-sm font-semibold text-text-quaternary">—</p>
        )}
        {editable ? (
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            {t('stock.opening.costOptional')}
          </p>
        ) : null}
      </td>

      <td className="px-3 py-4 align-middle text-end">
        {value === null ? (
          <p className="text-sm font-semibold text-text-quaternary">—</p>
        ) : (
          <OmAmount
            size="xs"
            amount={omr(value)}
            amountClassName="text-sm font-semibold text-text-primary tabular-nums"
            className="justify-end"
          />
        )}
      </td>

      <td className="ps-3 pe-5 py-4 align-middle">
        {row.state === 'LOCKED' ? (
          <div className="max-w-[260px]">
            <p className="text-sm font-semibold text-pending-700">
              {t('stock.opening.locked', {
                movement: t(LOCKED_BY_KEY[row.lockedBy ?? ''] ?? 'stock.opening.lockedBy.OTHER'),
              })}
            </p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {row.lockedAt ? `${formatInstantDay(row.lockedAt, language)} · ` : ''}
              <Link
                to={stockItemHref(row)}
                className="font-semibold text-primary-700 transition-colors hover:text-primary-800"
              >
                {t('stock.opening.useACount')}
              </Link>
            </p>
          </div>
        ) : opening ? (
          <div className="max-w-[260px]">
            <p className="text-sm font-semibold text-text-primary">
              {t('stock.opening.setOn', { date: formatInstantDay(opening.setAt, language) })}
            </p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              <span dir="ltr">{opening.number}</span>
              {opening.setBy.name ? ` · ${opening.setBy.name}` : ''}
            </p>
          </div>
        ) : (
          <p className="text-sm font-medium text-text-quaternary">{t('stock.opening.notSet')}</p>
        )}
      </td>
    </tr>
  )
}

/**
 * Import opening stock from the catalogue's spreadsheet: the example from
 * `GET /v1/stock/opening/import-format`, then the file to `POST /v1/stock/opening/import`. All
 * rows or none: a refusal lists each row and column at fault, and nothing is set.
 */
export function StockOpeningImportModal({
  open,
  onClose,
  branchId,
  onDone,
}: {
  open: boolean
  onClose: () => void
  branchId: string
  onDone: (result: StockAdjustmentResponse) => void
}) {
  const { t } = useTranslation()
  const failureText = useFailureText()
  const [file, setFile] = useState<File | null>(null)
  // One key per chosen file, so uploading the same file again after a lost answer counts once.
  const [key, setKey] = useState(newStockKey)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [rows, setRows] = useState<StockOpeningProblem[]>([])

  const pick = (picked: File) => {
    setFile(picked)
    setKey(newStockKey())
    setProblem(null)
    setRows([])
  }

  const example = () => {
    setProblem(null)
    downloadStockOpeningFormat().then(
      (download) => saveDownload(download, 'opening-stock.csv'),
      (error) => setProblem(failureText(error)),
    )
  }

  const upload = () => {
    if (!file) return setProblem(t('stock.opening.importForm.pickFile'))
    setBusy(true)
    setProblem(null)
    setRows([])
    postStockOpeningImport(key, branchId, file).then(
      (result) => {
        setBusy(false)
        setFile(null)
        setKey(newStockKey())
        onDone(result)
      },
      (error) => {
        setBusy(false)
        const lines = stockOpeningProblems(error)
        setRows(lines)
        setProblem(
          lines.length ? t('stock.opening.importForm.nothingImported') : failureText(error),
        )
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={720}
      title={t('stock.opening.importForm.title')}
      subtitle={t('stock.opening.importForm.subtitle')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            role={problem ? 'alert' : undefined}
            className="min-w-0 text-sm font-medium text-danger-700"
          >
            {problem}
          </p>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <button type="button" onClick={onClose} className={SECONDARY}>
              {t('stock.forms.cancel')}
            </button>
            <button type="button" onClick={upload} disabled={busy} className={PRIMARY}>
              <img src={tickIcon} alt="" className="size-4" />
              {t('stock.opening.importForm.save')}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-[260px] text-sm font-medium leading-[1.4] text-text-tertiary">
            {t('stock.opening.importForm.columns')}
          </p>
          <button type="button" onClick={example} className={SECONDARY}>
            {t('stock.opening.importForm.example')}
          </button>
        </div>
        <FileDropzone
          accept=".csv"
          maxBytes={STOCK_OPENING_IMPORT_MAX_BYTES}
          onFiles={(picked) => (picked[0] ? pick(picked[0]) : undefined)}
          onReject={(reason) =>
            setProblem(
              t(
                reason === 'size'
                  ? 'stock.opening.importForm.tooLarge'
                  : 'stock.opening.importForm.wrongType',
              ),
            )
          }
          className={DROP_ZONE}
        >
          {() => (
            <>
              <img src={uploadIcon} alt="" className="size-5" />
              <span className="min-w-0 break-all text-sm font-medium text-text-secondary">
                {file ? file.name : t('stock.opening.importForm.drop')}
              </span>
            </>
          )}
        </FileDropzone>
        {rows.length > 0 ? (
          <div className="overflow-x-auto rounded-sm border border-border-subtle">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-background/60 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                  <th className="h-[36px] px-3 text-start font-semibold">
                    {t('stock.opening.importForm.row')}
                  </th>
                  <th className="h-[36px] px-3 text-start font-semibold">
                    {t('stock.opening.importForm.column')}
                  </th>
                  <th className="h-[36px] px-3 text-start font-semibold">
                    {t('stock.opening.importForm.problem')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((line, index) => (
                  <tr key={index} className="border-b border-surface-background last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 align-top text-sm font-semibold text-text-primary tabular-nums">
                      {line.row ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top text-sm font-medium text-text-tertiary">
                      <span dir="ltr">{line.column ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 align-top text-sm font-medium text-text-primary">
                      {problemText(t, line)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
