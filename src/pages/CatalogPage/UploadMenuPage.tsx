import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { unitOptions, useReferenceData } from '../../lib/reference/referenceData'
import { CatalogShell, Kpi } from './CatalogShell'
import { Select, TableCheckbox, withRial } from '../../components/ui'
import { omr } from '../../lib/catalog'
import {
  READ_GROUPS,
  READ_BOOK,
  READ_TOTAL,
  DEFAULT_TICKS,
  tickedTotal,
  MENU_PAGE,
  UPLOAD_STEPS,
  type ReadRow,
} from '../../lib/catalogBuild'
import tickIcon from '../../assets/catalog/check-green.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'
import warnIcon from '../../assets/catalog/alert-amber.svg'
import groupsIcon from '../../assets/catalog/menu-list.svg'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import trashIcon from '../../assets/catalog/trash-danger.svg'
import zoomInIcon from '../../assets/catalog/zoom-in.svg'
import zoomOutIcon from '../../assets/catalog/zoom-out.svg'
import expandIcon from '../../assets/catalog/expand.svg'

const VAT_PERCENT = 5

/**
 * Catalog › Upload a menu (Figma 135:43158).
 *
 * The page is a review, not an import: the picture stays beside the reading so a doubtful line
 * can be checked against the paper it came from, and nothing is written until the count in the
 * footer is the one the reader wants.
 */
export function UploadMenuPage() {
  const { t } = useTranslation()
  const reference = useReferenceData()
  const navigate = useNavigate()

  const [ticked, setTicked] = useState<Set<string>>(new Set(DEFAULT_TICKS))
  const [rows, setRows] = useState(READ_GROUPS)
  const [zoom, setZoom] = useState(1)
  const [focus, setFocus] = useState<string | null>(null)

  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const setRow = (groupId: string, rowId: string, patch: Partial<ReadRow>) =>
    setRows((list) =>
      list.map((group) =>
        group.id === groupId
          ? {
              ...group,
              rows: group.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
            }
          : group,
      ),
    )

  const total = useMemo(() => tickedTotal(ticked), [ticked])

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'uploadMenu.breadcrumb' },
      ]}
      title={t('uploadMenu.title')}
      subtitle={t('uploadMenu.subtitle')}
      actions={
        <button
          type="button"
          className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('uploadMenu.replaceWithOther')}
        </button>
      }
    >
      {/* Progress */}
      <ol className="flex flex-wrap items-center gap-y-3 rounded-md bg-surface-card px-5 py-4">
        {UPLOAD_STEPS.map((step, index) => {
          const done = index < 2
          const current = index === 2
          return (
            <li key={step} className="flex min-w-[180px] flex-1 items-center gap-2.5">
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
                <span className="ms-2 hidden h-px flex-1 bg-border-subtle sm:block" />
              ) : null}
            </li>
          )
        })}
      </ol>

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi
          icon={tickIcon}
          tint="bg-success-100"
          label={t('uploadMenu.kpi.clear')}
          value={String(READ_BOOK.clear)}
          note={t('uploadMenu.kpi.clearNote')}
        />
        <Kpi
          icon={warnIcon}
          highlight
          tone="pending"
          label={t('uploadMenu.kpi.check')}
          value={String(READ_BOOK.needChecking)}
          note={t('uploadMenu.kpi.checkNote')}
        />
        <Kpi
          icon={groupsIcon}
          label={t('uploadMenu.kpi.headings')}
          value={String(READ_BOOK.headings)}
          note={t('uploadMenu.kpi.headingsNote')}
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* The paper */}
        <section className="w-full shrink-0 overflow-hidden rounded-md bg-surface-card lg:w-[380px]">
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
              <IconButton icon={expandIcon} label={t('uploadMenu.fullscreen')} />
            </span>
          </div>

          <div className="px-4 pb-4">
            <div
              className="mx-auto max-w-[320px] origin-top rounded-sm border border-border-subtle bg-white p-5 transition-transform"
              style={{ transform: `scale(${zoom})` }}
            >
              <p className="text-center text-sm font-semibold tracking-[0.08em] text-text-primary">
                {MENU_PAGE.business}
              </p>
              <p className="mt-1 text-center text-[9px] font-medium tracking-[0.14em] text-text-quaternary">
                {MENU_PAGE.place}
              </p>

              {MENU_PAGE.sections.map((section) => (
                <div key={section.heading} className="mt-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                    {section.heading}
                  </p>
                  <ul className="mt-1.5">
                    {section.lines.map((line) => (
                      <li key={line.name}>
                        <button
                          type="button"
                          onClick={() => setFocus(line.name)}
                          dir={line.rtl ? 'rtl' : undefined}
                          className={[
                            'flex w-full items-baseline justify-between gap-3 border-b border-dotted border-border-subtle px-1 py-1 text-start text-[10px] transition-colors',
                            line.check
                              ? 'bg-pending-100/60 text-pending-700'
                              : 'text-text-secondary hover:bg-primary-25',
                            focus === line.name ? 'ring-1 ring-primary-700' : '',
                          ].join(' ')}
                        >
                          <span>{line.name}</span>
                          <span className="shrink-0 tabular-nums">{line.price}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <p className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-4 py-3">
            <span className="flex flex-wrap items-center gap-3 text-xs font-medium text-text-quaternary">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px] bg-primary-300" />
                {t('uploadMenu.readClearly')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px] bg-pending-500" />
                {t('uploadMenu.needsChecking')}
              </span>
            </span>
            <span className="text-xs font-medium text-text-quaternary">
              {t('uploadMenu.tapLineToJump')}
            </span>
          </p>
        </section>

        {/* The reading */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {rows.map((group) => {
            const groupTicked = group.rows.filter((row) => ticked.has(row.id)).length
            const allOn = groupTicked === group.rows.length
            return (
              <section key={group.id} className="overflow-hidden rounded-md bg-surface-card">
                <div className="flex flex-wrap items-center gap-3 bg-[#151c2d] px-4 py-3">
                  <TableCheckbox
                    checked={allOn}
                    indeterminate={groupTicked > 0 && !allOn}
                    onChange={() =>
                      setTicked((current) => {
                        const next = new Set(current)
                        if (allOn) group.rows.forEach((row) => next.delete(row.id))
                        else group.rows.forEach((row) => next.add(row.id))
                        return next
                      })
                    }
                    ariaLabel={group.heading}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{group.heading}</span>
                    <span className="mt-0.5 block text-[11px] font-medium text-white/60">
                      {t('uploadMenu.headingOnYourMenu')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-white/70">
                    {allOn
                      ? t('uploadMenu.itemsInGroup', { count: group.rows.length })
                      : t('uploadMenu.tickedOf', {
                          ticked: groupTicked,
                          total: group.rows.length,
                        })}
                  </span>
                  <span className="inline-flex h-[28px] shrink-0 items-center gap-1.5 rounded-[3px] bg-white/10 px-2 text-xs font-medium text-white">
                    <img src={groupsIcon} alt="" className="size-3.5 brightness-0 invert" />
                    {t('uploadMenu.groupBecomes', { name: group.becomes })}
                  </span>
                </div>

                <ul>
                  {group.rows.map((row) => {
                    const on = ticked.has(row.id)
                    const needsCheck = row.state === 'check'
                    return (
                      <li
                        key={row.id}
                        className={[
                          'flex flex-wrap items-center gap-3 border-b border-surface-background px-4 py-3 last:border-0',
                          needsCheck ? 'border-s-4 border-s-pending-500 bg-pending-100/30' : '',
                        ].join(' ')}
                      >
                        <TableCheckbox
                          checked={on}
                          onChange={() => toggle(row.id)}
                          ariaLabel={row.name}
                        />

                        <div className="min-w-[180px] flex-1">
                          <p
                            dir={/[؀-ۿ]/.test(row.name) ? 'rtl' : undefined}
                            className="text-sm font-medium text-text-primary"
                          >
                            {row.name}
                          </p>
                          {needsCheck && row.concernKey ? (
                            <p className="mt-1 max-w-[220px] text-xs font-medium leading-[1.5] text-pending-700">
                              {t(row.concernKey, row.concernValues)}
                            </p>
                          ) : null}
                        </div>

                        <input
                          value={row.price === null ? '' : omr(row.price)}
                          placeholder={t('uploadMenu.noPrice')}
                          onChange={(event) =>
                            setRow(group.id, row.id, {
                              price: Number(event.target.value.replace(/[^\d.]/g, '')) || null,
                            })
                          }
                          aria-label={t('uploadMenu.col.price')}
                          className={[
                            'h-[38px] w-[110px] shrink-0 rounded-sm border px-3 text-end text-sm font-semibold outline-none',
                            needsCheck
                              ? 'border-pending-200 bg-pending-100/60 text-pending-700'
                              : 'border-border-default bg-white text-text-primary focus:border-border-brand',
                          ].join(' ')}
                        />

                        <span className="w-[110px] shrink-0">
                          <Select
                            compact
                            ariaLabel={t('uploadMenu.col.soldAs')}
                            value={row.soldAs}
                            onChange={(value) => setRow(group.id, row.id, { soldAs: value })}
                            options={unitOptions(reference, t)}
                          />
                        </span>

                        <span className="w-[90px] shrink-0">
                          <Select
                            compact
                            ariaLabel={t('uploadMenu.col.tax')}
                            value={String(row.taxPercent)}
                            onChange={(value) =>
                              setRow(group.id, row.id, { taxPercent: Number(value) })
                            }
                            options={[
                              { value: '5', label: '5%' },
                              { value: '0', label: '0%' },
                            ]}
                          />
                        </span>

                        <span
                          className={[
                            'flex size-7 shrink-0 items-center justify-center rounded-full',
                            needsCheck ? 'bg-pending-100' : 'bg-success-100',
                          ].join(' ')}
                          title={
                            needsCheck ? t('uploadMenu.needsChecking') : t('uploadMenu.readClearly')
                          }
                        >
                          <img src={needsCheck ? warnIcon : tickIcon} alt="" className="size-3.5" />
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setRows((list) =>
                              list.map((entry) =>
                                entry.id === group.id
                                  ? { ...entry, rows: entry.rows.filter((r) => r.id !== row.id) }
                                  : entry,
                              ),
                            )
                          }
                          aria-label={t('uploadMenu.removeRow')}
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-danger-100"
                        >
                          <img src={trashIcon} alt="" className="size-4" />
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-t border-surface-background px-4 py-3 text-start text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  <img src={plusIcon} alt="" className="size-4" />
                  {t('uploadMenu.addSomethingMissed')}
                </button>
              </section>
            )
          })}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {withRial(
            t('uploadMenu.footer', {
              ticked: total,
              total: READ_TOTAL,
              rate: VAT_PERCENT,
              currency: 'OMR',
            }),
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/catalog"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('uploadMenu.discard')}
          </Link>
          <button
            type="button"
            disabled={total === 0}
            onClick={() => navigate('/catalog')}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {t('uploadMenu.addItems', { count: total })}
          </button>
        </div>
      </div>
    </CatalogShell>
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
