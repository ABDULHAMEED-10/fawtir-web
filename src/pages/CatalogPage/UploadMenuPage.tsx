import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useReferenceData } from '../../lib/reference/referenceData'
import { selectAllOnFocus, unitOptions } from '../../components/invoice'
import { itemTypeOfUnit } from '../../lib/invoiceDraft'
import { CatalogShell, Kpi } from './CatalogShell'
import { Select, TableCheckbox, type SelectOption } from '../../components/ui'
import { LoadingNotice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { omr } from '../../lib/catalog'
import { describeApiFailure } from '../../lib/apiFailure'
import { NetworkError } from '../../api'
import { getCatalogGroups, type CatalogGroupDto } from '../../api/catalog/groups'
import {
  MENU_SCAN_MAX_BYTES,
  MENU_SCAN_TYPES,
  confirmMenuScan,
  getMenuScanFile,
  newMenuScanKey,
  readMenuScan,
  uploadMenuScan,
  type MenuScanConfirmedDto,
  type MenuScanReadingDto,
} from '../../api/catalog/menuScans'
import {
  SUGGESTED,
  UPLOAD_STEPS,
  blankRow,
  concernKey,
  concernValues,
  confirmPlan,
  isDailyLimit,
  isKeyReused,
  isScanInvalid,
  placeRefusals,
  refusedRows,
  reviewGroups,
  rowProblemKey,
  type ConfirmPlan,
  type ReviewGroup,
  type ReviewRow,
  type RowProblem,
} from '../../lib/menuScan'
import { useCanManageProducts } from './ItemFormPage'
import tickIcon from '../../assets/catalog/check-green.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'
import warnIcon from '../../assets/catalog/alert-amber.svg'
import groupsIcon from '../../assets/catalog/menu-list.svg'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import trashIcon from '../../assets/catalog/trash-danger.svg'
import zoomInIcon from '../../assets/catalog/zoom-in.svg'
import zoomOutIcon from '../../assets/catalog/zoom-out.svg'
import expandIcon from '../../assets/catalog/expand.svg'
import uploadIcon from '../../assets/catalog/upload-brand.svg'

/** Column widths shared by the dark column head and every read line, so each heading sits over its field. */
const COL = {
  check: 'w-[15px] shrink-0',
  price: 'w-[112px] shrink-0',
  soldAs: 'w-[104px] shrink-0',
  tax: 'w-[84px] shrink-0',
  read: 'w-7 shrink-0',
  remove: 'w-8 shrink-0',
}

const SECONDARY_BUTTON =
  'inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25'
const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40'

/** Why nothing came off the menu: the reader's reason, the day's limit, or a read that was lost. */
type Unread = 'READING_UNAVAILABLE' | 'READ_FAILED' | 'DAILY_LIMIT' | 'LOST'

type Phase =
  | { at: 'pick' }
  | { at: 'uploading' }
  | { at: 'reading' }
  | { at: 'unread'; why: Unread }
  | { at: 'review' }
  | { at: 'done'; confirmed: MenuScanConfirmedDto }

type Paper = { url: string; contentType: string; name: string }

/**
 * Catalog › Upload a menu (Figma 135:43158), on the menu-scan API (backend PR #787).
 *
 * The page is a review, not an import: the menu as uploaded (`GET …/file`) stays beside the
 * reading so a doubtful line can be checked against the paper it came from, and nothing is
 * written until the company confirms the rows it kept (`POST …/confirm`, all or nothing, under an
 * Idempotency-Key). Every route needs `product.manage`; without it the page says so.
 */
export function UploadMenuPage() {
  const { t } = useTranslation()
  const canManage = useCanManageProducts()
  if (canManage !== true) {
    return (
      <CatalogShell
        crumbs={[
          { labelKey: 'catalog.title', to: '/catalog' },
          { labelKey: 'uploadMenu.breadcrumb' },
        ]}
        title={t('uploadMenu.title')}
      >
        {canManage === null ? <LoadingNotice /> : <PermissionDeniedNotice />}
      </CatalogShell>
    )
  }
  return <MenuScan />
}

function MenuScan() {
  const { t } = useTranslation()
  const reference = useReferenceData()
  const picker = useRef<HTMLInputElement>(null)
  /** Bumped on every new file, so an answer for a file the page has moved past is dropped. */
  const run = useRef(0)

  const [phase, setPhase] = useState<Phase>({ at: 'pick' })
  const [pickProblem, setPickProblem] = useState<string | null>(null)
  const [fileId, setFileId] = useState<string | null>(null)
  const [paper, setPaper] = useState<Paper | null>(null)
  const [reading, setReading] = useState<MenuScanReadingDto | null>(null)
  const [groups, setGroups] = useState<ReviewGroup[]>([])
  const [catalogGroups, setCatalogGroups] = useState<CatalogGroupDto[]>([])
  const [zoom, setZoom] = useState(1)
  const [elapsed, setElapsed] = useState(0)
  const [added, setAdded] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveProblem, setSaveProblem] = useState<string | null>(null)
  const [rowProblems, setRowProblems] = useState<Record<string, RowProblem[]>>({})
  const [groupProblems, setGroupProblems] = useState<Record<string, RowProblem[]>>({})
  /** The key goes with one list: the same list again replays, an edited list needs a new key. */
  const attempt = useRef<{ key: string; body: string } | null>(null)

  // The company's groups and kinds, for "put this heading into an existing group".
  useEffect(() => {
    let active = true
    getCatalogGroups().then(
      (answer) => active && setCatalogGroups(answer.groups),
      () => undefined,
    )
    return () => {
      active = false
    }
  }, [])

  // A read takes a while (the server waits at least 90 s for the reader): count the seconds.
  // TODO(backend): INCOME.md P.42, the read has no progress of its own.
  useEffect(() => {
    if (phase.at !== 'reading') return
    setElapsed(0)
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [phase.at])

  useEffect(() => () => (paper ? URL.revokeObjectURL(paper.url) : undefined), [paper])

  const read = async (id: string, mine: number) => {
    setPhase({ at: 'reading' })
    try {
      const answer = await readMenuScan(id)
      if (run.current !== mine) return
      setReading(answer)
      if (answer.reason !== null || answer.groups.length === 0) {
        setPhase({ at: 'unread', why: answer.reason ?? 'READ_FAILED' })
        return
      }
      setGroups(reviewGroups(answer.groups))
      setPhase({ at: 'review' })
    } catch (error) {
      if (run.current !== mine) return
      setPhase({
        at: 'unread',
        why: isDailyLimit(error)
          ? 'DAILY_LIMIT'
          : error instanceof NetworkError
            ? 'LOST'
            : 'READ_FAILED',
      })
    }
  }

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!MENU_SCAN_TYPES.includes(file.type)) {
      setPickProblem(t('uploadMenu.pick.wrongType'))
      return
    }
    if (file.size === 0 || file.size > MENU_SCAN_MAX_BYTES) {
      setPickProblem(t('uploadMenu.pick.tooBig'))
      return
    }
    const mine = ++run.current
    setPickProblem(null)
    setReading(null)
    setGroups([])
    setRowProblems({})
    setGroupProblems({})
    setSaveProblem(null)
    attempt.current = null
    setPaper(null)
    setPhase({ at: 'uploading' })
    let id: string
    try {
      id = (await uploadMenuScan(file, file.name)).fileId
    } catch (error) {
      if (run.current !== mine) return
      setPickProblem(
        isScanInvalid(error)
          ? t('uploadMenu.pick.invalid')
          : t(describeApiFailure(error).key, describeApiFailure(error).values),
      )
      setPhase({ at: 'pick' })
      return
    }
    if (run.current !== mine) return
    setFileId(id)
    // The menu as the server keeps it, beside the reading; the read starts at the same time.
    getMenuScanFile(id).then(
      ({ blob }) => {
        if (run.current !== mine) return
        setPaper({
          url: URL.createObjectURL(blob),
          contentType: blob.type || file.type,
          name: file.name,
        })
      },
      // The server's copy could not be fetched: the file the company picked is the same menu.
      () => {
        if (run.current !== mine) return
        setPaper({ url: URL.createObjectURL(file), contentType: file.type, name: file.name })
      },
    )
    void read(id, mine)
  }

  const pickAnother = () => picker.current?.click()

  const setRow = (groupId: string, rowId: string, patch: Partial<ReviewRow>) =>
    setGroups((list) =>
      list.map((group) =>
        group.id === groupId
          ? {
              ...group,
              rows: group.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
            }
          : group,
      ),
    )

  const setGroup = (groupId: string, patch: Partial<ReviewGroup>) =>
    setGroups((list) =>
      list.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    )

  const allRows = groups.flatMap((group) => group.rows)
  const tickedCount = allRows.filter((row) => row.ticked).length

  const kindOptions = useMemo<SelectOption[]>(
    () =>
      catalogGroups.flatMap((group) =>
        group.kinds.map((kind) => ({
          value: `kind:${kind.id}`,
          label: `${group.name} › ${kind.name}`,
        })),
      ),
    [catalogGroups],
  )

  const confirm = async () => {
    if (!fileId) return
    const plan: ConfirmPlan = confirmPlan(groups)
    if (plan.body.groups.length === 0) return
    const body = JSON.stringify(plan.body)
    if (!attempt.current || attempt.current.body !== body) {
      attempt.current = { key: newMenuScanKey(), body }
    }
    setSaving(true)
    setSaveProblem(null)
    setRowProblems({})
    setGroupProblems({})
    try {
      const confirmed = await confirmMenuScan(fileId, plan.body, attempt.current.key)
      setAdded(confirmed.productCount)
      setPhase({ at: 'done', confirmed })
    } catch (error) {
      const refused = refusedRows(error)
      if (refused !== null) {
        const placed = placeRefusals(plan, refused)
        setRowProblems(placed.rows)
        setGroupProblems(placed.groups)
        setSaveProblem(t('uploadMenu.rowsRefused', { count: refused.length }))
      } else if (isKeyReused(error)) {
        attempt.current = null
        setSaveProblem(t('uploadMenu.keyReused'))
      } else {
        const message = describeApiFailure(error)
        const line = t(message.key, message.values)
        setSaveProblem(
          message.reference
            ? `${line} ${t('apiErrors.reference', { id: message.reference })}`
            : line,
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const stepIndex =
    phase.at === 'pick' || phase.at === 'uploading'
      ? 0
      : phase.at === 'reading' || phase.at === 'unread'
        ? 1
        : phase.at === 'review'
          ? 2
          : 4

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'uploadMenu.breadcrumb' },
      ]}
      title={
        phase.at === 'pick' || phase.at === 'uploading'
          ? t('uploadMenu.pick.title')
          : t('uploadMenu.title')
      }
      subtitle={
        phase.at === 'pick' || phase.at === 'uploading'
          ? t('uploadMenu.pick.subtitle')
          : t('uploadMenu.subtitle')
      }
      actions={
        fileId && phase.at !== 'done' && phase.at !== 'uploading' && phase.at !== 'reading' ? (
          <button type="button" onClick={pickAnother} className={SECONDARY_BUTTON}>
            {t('uploadMenu.replaceWithOther')}
          </button>
        ) : undefined
      }
    >
      <input
        ref={picker}
        type="file"
        accept={MENU_SCAN_TYPES.join(',')}
        className="hidden"
        aria-label={t('uploadMenu.pick.choose')}
        data-testid="menu-file"
        onChange={choose}
      />

      {/* Progress */}
      <ol className="flex flex-wrap items-center gap-y-3 rounded-md bg-surface-card px-5 py-4">
        {UPLOAD_STEPS.map((step, index) => {
          const done = index < stepIndex
          const current = index === stepIndex
          return (
            <li
              key={step}
              className={[
                'flex items-center gap-2.5',
                // The last step has no connector after it, so it takes only its own width and
                // the row ends at the card's edge.
                index < UPLOAD_STEPS.length - 1 ? 'min-w-[180px] flex-1' : 'flex-none',
              ].join(' ')}
            >
              <span
                className={[
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done
                    ? 'bg-[#4c6c5a] text-white'
                    : current
                      ? 'bg-primary-700 text-white'
                      : 'border border-border-default text-text-quaternary',
                ].join(' ')}
              >
                {done ? <img src={tickWhiteIcon} alt="" className="size-3.5" /> : index + 1}
              </span>
              <span
                className={[
                  'text-sm font-medium',
                  current
                    ? 'text-primary-800'
                    : done
                      ? 'text-text-primary'
                      : 'text-text-quaternary',
                ].join(' ')}
              >
                {t(`uploadMenu.step.${step}`)}
              </span>
              {index < UPLOAD_STEPS.length - 1 ? (
                <span className="mx-2 hidden h-px flex-1 bg-border-subtle sm:block" />
              ) : null}
            </li>
          )
        })}
      </ol>

      {phase.at === 'pick' || phase.at === 'uploading' ? (
        <section className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border-default bg-surface-card px-5 py-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-md bg-pending-100">
            <img src={uploadIcon} alt="" className="size-5" />
          </span>
          <p className="max-w-[460px] text-sm font-medium leading-[1.5] text-text-tertiary">
            {t('uploadMenu.pick.body')}
          </p>
          <button
            type="button"
            onClick={pickAnother}
            disabled={phase.at === 'uploading'}
            className={PRIMARY_BUTTON}
          >
            {phase.at === 'uploading'
              ? t('uploadMenu.pick.uploading')
              : t('uploadMenu.pick.choose')}
          </button>
          {pickProblem ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {pickProblem}
            </p>
          ) : null}
          <Link
            to="/catalog/new"
            className="text-sm font-semibold text-primary-700 underline-offset-2 hover:underline"
          >
            {t('uploadMenu.addByHand')}
          </Link>
        </section>
      ) : null}

      {phase.at === 'done' ? (
        <section
          role="status"
          className="flex flex-col items-start gap-3 rounded-md bg-success-100 px-5 py-5"
        >
          <p className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <img src={tickIcon} alt="" className="size-4" />
            {t('uploadMenu.addedCount', { count: added })}
          </p>
          <p className="text-sm font-medium text-text-tertiary">{t('uploadMenu.addedNote')}</p>
          <Link to="/catalog" className={PRIMARY_BUTTON}>
            {t('uploadMenu.openCatalog')}
          </Link>
        </section>
      ) : null}

      {phase.at === 'review' && reading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Kpi
            icon={tickIcon}
            tint="bg-success-100"
            label={t('uploadMenu.kpi.clear')}
            value={String(reading.summary.clear)}
            note={t('uploadMenu.kpi.clearNote')}
          />
          <Kpi
            icon={warnIcon}
            highlight
            tone="pending"
            label={t('uploadMenu.kpi.check')}
            value={String(reading.summary.needChecking)}
            note={t('uploadMenu.kpi.checkNote')}
          />
          <Kpi
            icon={groupsIcon}
            label={t('uploadMenu.kpi.headings')}
            value={String(reading.summary.headings)}
            note={t('uploadMenu.kpi.headingsNote')}
          />
        </div>
      ) : null}

      {phase.at === 'reading' || phase.at === 'unread' || phase.at === 'review' ? (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* The paper, as uploaded. TODO(backend): INCOME.md P.43, row positions on the page
              to mark read and doubtful lines and jump to them; the reading has none yet. */}
          <section className="w-full shrink-0 self-start overflow-hidden rounded-md bg-surface-card lg:w-[380px]">
            <div className="flex items-center justify-between gap-3 p-4">
              <h2 className="text-sm font-semibold text-text-primary">
                {t('uploadMenu.yourMenu', { page: 1 })}
              </h2>
              <span className="flex items-center gap-1.5">
                <IconButton
                  icon={zoomOutIcon}
                  label={t('uploadMenu.zoomOut')}
                  onClick={() => setZoom((z) => Math.max(0.8, z - 0.1))}
                />
                <IconButton
                  icon={zoomInIcon}
                  label={t('uploadMenu.zoomIn')}
                  onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
                />
                <IconButton
                  icon={expandIcon}
                  label={t('uploadMenu.fullscreen')}
                  onClick={() => (paper ? window.open(paper.url, '_blank', 'noopener') : undefined)}
                />
              </span>
            </div>

            <div className="overflow-hidden px-4 pb-4">
              {paper ? (
                paper.contentType === 'application/pdf' ? (
                  <object
                    data={paper.url}
                    type="application/pdf"
                    aria-label={t('uploadMenu.paperAlt')}
                    className="h-[480px] w-full rounded-sm border border-border-subtle bg-white"
                  >
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-primary-700"
                    >
                      {t('uploadMenu.fullscreen')}
                    </a>
                  </object>
                ) : (
                  <img
                    src={paper.url}
                    alt={t('uploadMenu.paperAlt')}
                    className="mx-auto w-full origin-top rounded-sm border border-border-subtle bg-white transition-transform"
                    style={{ transform: `scale(${zoom})` }}
                  />
                )
              ) : (
                <div className="flex h-[240px] items-center justify-center rounded-sm border border-border-subtle bg-white text-xs font-medium text-text-quaternary">
                  {t('uploadMenu.paperLoading')}
                </div>
              )}
            </div>

            <p className="flex items-center gap-2 border-t border-border-subtle px-4 py-3 text-[11px] font-medium text-text-quaternary">
              <span className="truncate" dir="auto">
                {paper?.name ?? ''}
              </span>
            </p>
          </section>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {phase.at === 'reading' ? (
              <section role="status" className="rounded-md bg-surface-card p-5">
                <p className="text-sm font-semibold text-text-primary">
                  {t('uploadMenu.reading.title')}
                </p>
                <p className="mt-1 text-sm font-medium leading-[1.5] text-text-tertiary">
                  {t('uploadMenu.reading.body')}
                </p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary-50">
                  <div
                    className="h-full rounded-full bg-primary-700 transition-[width] duration-1000"
                    style={{ width: `${Math.min(95, (elapsed / 90) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-medium text-text-quaternary">
                  {t('uploadMenu.reading.elapsed', { seconds: elapsed })}
                </p>
              </section>
            ) : null}

            {phase.at === 'unread' ? (
              <section role="alert" className="rounded-md bg-pending-100/60 p-5">
                <p className="text-sm font-semibold text-pending-700">
                  {t(`uploadMenu.unread.${phase.why}.title`)}
                </p>
                <p className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">
                  {t(`uploadMenu.unread.${phase.why}.body`)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {(phase.why === 'READ_FAILED' || phase.why === 'LOST') && fileId ? (
                    <button
                      type="button"
                      onClick={() => void read(fileId, run.current)}
                      className={PRIMARY_BUTTON}
                    >
                      {t('uploadMenu.tryAgain')}
                    </button>
                  ) : null}
                  <Link to="/catalog/new" className={SECONDARY_BUTTON}>
                    {t('uploadMenu.addByHand')}
                  </Link>
                  <Link to="/catalog/build" className={SECONDARY_BUTTON}>
                    {t('uploadMenu.buildFromList')}
                  </Link>
                </div>
              </section>
            ) : null}

            {phase.at === 'review'
              ? groups.map((group, groupIndex) => (
                  <ReadGroupCard
                    key={group.id}
                    group={group}
                    first={groupIndex === 0}
                    kindOptions={kindOptions}
                    rowProblems={rowProblems}
                    groupProblems={groupProblems[group.id] ?? []}
                    referenceUnits={(code) => unitOptions(itemTypeOfUnit(code), t, code, reference)}
                    onRow={(rowId, patch) => setRow(group.id, rowId, patch)}
                    onGroup={(patch) => setGroup(group.id, patch)}
                  />
                ))
              : null}
          </div>
        </div>
      ) : null}

      {phase.at === 'review' ? (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-tertiary">
              {t('uploadMenu.tickedOf', { ticked: tickedCount, total: allRows.length })}
            </p>
            {saveProblem ? (
              <p role="alert" className="mt-1 text-sm font-medium text-danger-700">
                {saveProblem}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <Link to="/catalog" className={SECONDARY_BUTTON}>
              {t('uploadMenu.discard')}
            </Link>
            <button
              type="button"
              disabled={tickedCount === 0 || saving}
              onClick={() => void confirm()}
              className={PRIMARY_BUTTON}
            >
              <img src={tickWhiteIcon} alt="" className="size-4" />
              {saving ? t('uploadMenu.adding') : t('uploadMenu.addItems', { count: tickedCount })}
            </button>
          </div>
        </div>
      ) : null}
    </CatalogShell>
  )
}

function ReadGroupCard({
  group,
  first,
  kindOptions,
  rowProblems,
  groupProblems,
  referenceUnits,
  onRow,
  onGroup,
}: {
  group: ReviewGroup
  first: boolean
  kindOptions: SelectOption[]
  rowProblems: Record<string, RowProblem[]>
  groupProblems: RowProblem[]
  referenceUnits: (code: string) => SelectOption[]
  onRow: (rowId: string, patch: Partial<ReviewRow>) => void
  onGroup: (patch: Partial<ReviewGroup>) => void
}) {
  const { t } = useTranslation()
  const added = useRef(0)
  const heading = group.heading ?? group.headingAr ?? t('uploadMenu.noHeading')
  const groupTicked = group.rows.filter((row) => row.ticked).length
  const allOn = group.rows.length > 0 && groupTicked === group.rows.length
  const targetOptions: SelectOption[] = [
    {
      value: SUGGESTED,
      label: group.existingGroupId
        ? t('uploadMenu.groupBecomes', { name: group.becomes })
        : t('uploadMenu.groupNew', { name: group.becomes }),
    },
    ...kindOptions,
  ]

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      {first ? (
        // One dark column head for the whole reading, over the first group.
        <div
          aria-hidden="true"
          className="hidden h-[34px] items-center gap-3 bg-[#151c2d] px-4 text-[11px] font-semibold uppercase tracking-[0.6px] text-white md:flex"
        >
          <span className={COL.check} />
          <span className="min-w-0 flex-1">{t('uploadMenu.col.item')}</span>
          <span className={[COL.price, 'text-end'].join(' ')}>{t('uploadMenu.col.price')}</span>
          <span className={COL.soldAs}>{t('uploadMenu.col.soldAs')}</span>
          <span className={COL.tax}>{t('uploadMenu.col.tax')}</span>
          <span className={[COL.read, 'text-center'].join(' ')}>{t('uploadMenu.col.read')}</span>
          <span className={COL.remove} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle bg-primary-25/70 px-4 py-3">
        <TableCheckbox
          checked={allOn}
          indeterminate={groupTicked > 0 && !allOn}
          onChange={() => onGroup({ rows: group.rows.map((row) => ({ ...row, ticked: !allOn })) })}
          ariaLabel={heading}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text-primary">
            <bdi>{heading}</bdi>
          </span>
          <span className="mt-0.5 block text-[11px] font-medium text-text-quaternary">
            {t('uploadMenu.headingOnYourMenu')}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-text-tertiary">
          {allOn
            ? t('uploadMenu.itemsInGroup', { count: group.rows.length })
            : t('uploadMenu.tickedOf', { ticked: groupTicked, total: group.rows.length })}
        </span>
        <span className="w-full max-w-[260px] shrink-0 sm:w-[220px]">
          <Select
            compact
            quiet
            ariaLabel={t('uploadMenu.groupTarget', { heading })}
            value={group.target}
            onChange={(value) => onGroup({ target: value })}
            options={targetOptions}
            panelWidth={260}
          />
        </span>
        {groupProblems.length > 0 ? (
          <p role="alert" className="w-full text-xs font-medium text-danger-700">
            {groupProblems.map((problem) => t(rowProblemKey(problem))).join(' ')}
          </p>
        ) : null}
      </div>

      <ul>
        {group.rows.map((row) => (
          <ReadLine
            key={row.id}
            row={row}
            problems={rowProblems[row.id] ?? []}
            unitOptionsFor={referenceUnits}
            onChange={(patch) => onRow(row.id, patch)}
            onRemove={() => onGroup({ rows: group.rows.filter((r) => r.id !== row.id) })}
          />
        ))}
      </ul>

      <div className="border-t border-surface-background px-4 py-3">
        <button
          type="button"
          onClick={() => {
            added.current += 1
            onGroup({ rows: [...group.rows, blankRow(group, added.current)] })
          }}
          className="inline-flex h-9 items-center gap-2 rounded-sm border border-dashed border-border-default px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
        >
          <img src={plusIcon} alt="" className="size-4" />
          {t('uploadMenu.addSomethingMissed')}
        </button>
      </div>
    </section>
  )
}

function ReadLine({
  row,
  problems,
  unitOptionsFor,
  onChange,
  onRemove,
}: {
  row: ReviewRow
  problems: RowProblem[]
  unitOptionsFor: (code: string) => SelectOption[]
  onChange: (patch: Partial<ReviewRow>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const needsCheck = row.state === 'check'
  const refused = problems.length > 0
  const [priceText, setPriceText] = useState(row.price === null ? '' : omr(row.price))
  const label = row.name || t('uploadMenu.newLine')

  return (
    <li
      data-row={row.id}
      className={[
        // last:border-b-0, not last:border-0: the latter also wiped the amber bar off a flagged
        // line that closed its group.
        'flex flex-wrap items-center gap-3 border-b border-surface-background px-4 py-3 last:border-b-0',
        refused
          ? 'border-s-[3px] border-s-danger-700 bg-danger-100/40 ps-[13px]'
          : needsCheck
            ? 'border-s-[3px] border-s-pending-500 bg-pending-100/30 ps-[13px]'
            : '',
      ].join(' ')}
    >
      <TableCheckbox
        checked={row.ticked}
        onChange={() => onChange({ ticked: !row.ticked })}
        ariaLabel={label}
      />

      <div className="min-w-[180px] flex-1">
        <input
          value={row.name}
          dir="auto"
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder={t('uploadMenu.namePlaceholder')}
          aria-label={t('uploadMenu.nameOf', { name: label })}
          className="h-9 w-full rounded-sm border border-transparent bg-transparent px-2 text-sm font-medium text-text-primary outline-none hover:border-border-subtle focus:border-border-brand"
        />
        {row.nameAr && row.nameAr !== row.name ? (
          <p className="px-2 text-xs font-medium text-text-quaternary" dir="rtl">
            {row.nameAr}
          </p>
        ) : null}
        {row.sizes.length > 0 ? (
          <p className="px-2 text-xs font-medium text-text-tertiary">
            {row.sizes
              .map((size) => (size.price === null ? size.name : `${size.name} ${omr(size.price)}`))
              .join(' · ')}
          </p>
        ) : null}
        {needsCheck
          ? row.concerns.map((concern, index) => (
              <p
                key={`${concern.code}-${index}`}
                className="mt-1 max-w-[260px] px-2 text-xs font-medium leading-[1.5] text-pending-700"
              >
                {t(concernKey(concern.code), concernValues(row))}
              </p>
            ))
          : null}
        {problems.map((problem, index) => (
          <p
            key={`${problem.code}-${index}`}
            role="alert"
            className="mt-1 max-w-[260px] px-2 text-xs font-medium leading-[1.5] text-danger-700"
          >
            {t(rowProblemKey(problem))}
          </p>
        ))}
      </div>

      <input
        value={priceText}
        onFocus={selectAllOnFocus}
        inputMode="decimal"
        dir="ltr"
        placeholder={t('uploadMenu.noPrice')}
        onChange={(event) => {
          const text = event.target.value.replace(/[^\d.]/g, '')
          setPriceText(text)
          const value = Number(text)
          onChange({ price: text === '' || !Number.isFinite(value) ? null : value })
        }}
        onBlur={() => setPriceText(row.price === null ? '' : omr(row.price))}
        aria-label={t('uploadMenu.priceOf', { name: label })}
        className={[
          'h-[42px] rounded-sm border border-transparent px-3 text-end text-sm font-normal tabular-nums outline-none placeholder:text-pending-700/70 focus:border-border-brand',
          COL.price,
          needsCheck
            ? 'bg-pending-100/70 text-pending-700'
            : 'bg-surface-background text-text-primary',
        ].join(' ')}
      />

      <span className={COL.soldAs}>
        {/* The read line carries a unit code (C62); the options always include the line's own,
            so the closed select shows it even before the code lists load. */}
        <Select
          compact
          quiet
          tight
          ariaLabel={t('uploadMenu.col.soldAs')}
          value={row.soldAs}
          onChange={(value) => onChange({ soldAs: value })}
          options={unitOptionsFor(row.soldAs)}
          panelWidth={180}
        />
      </span>

      <span className={COL.tax}>
        <Select
          compact
          quiet
          tight
          ariaLabel={t('uploadMenu.col.tax')}
          value={String(row.taxPercent)}
          onChange={(value) => onChange({ taxPercent: Number(value) })}
          options={[
            { value: '5', label: '5%' },
            { value: '0', label: '0%' },
          ]}
        />
      </span>

      <span
        className={[
          'flex size-7 items-center justify-center rounded-full',
          COL.read,
          needsCheck ? 'bg-pending-100' : 'bg-success-100',
        ].join(' ')}
        title={needsCheck ? t('uploadMenu.needsChecking') : t('uploadMenu.readClearly')}
      >
        <img src={needsCheck ? warnIcon : tickIcon} alt="" className="size-3.5" />
      </span>

      <button
        type="button"
        onClick={onRemove}
        aria-label={t('uploadMenu.removeRowOf', { name: label })}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-danger-100"
      >
        <img src={trashIcon} alt="" className="size-4" />
      </button>
    </li>
  )
}

function IconButton({
  icon,
  label,
  onClick,
}: {
  icon: string
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
    >
      <img src={icon} alt="" className="size-4" />
    </button>
  )
}
