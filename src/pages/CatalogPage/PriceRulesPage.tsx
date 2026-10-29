import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi, Pill } from './CatalogShell'
import { ActionMenu, FilterMenu, Modal, Switch, withRial } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { useApiRead } from '../../hooks'
import { formatDate } from '../../lib/format'
import {
  RULE_FAMILIES,
  WEEKDAYS,
  belowCostItems,
  lastDays,
  muscatNow,
  omr,
  tierShare,
  tierText,
} from '../../lib/catalogRules'
import { muscatToday } from '../../lib/pos'
import { minutesOf } from '../../lib/priceRuleEvaluator'
import { saveDownload } from '../../lib/supplierRecord'
import { weekdayName } from '../../lib/catalogStock'
import {
  archivePriceRule,
  downloadPriceRuleReport,
  loadPriceRuleReport,
  loadPriceRules,
  priceRuleListPath,
  priceRuleReportPath,
  switchPriceRule,
  type PriceRuleBelowCostItem,
  type PriceRuleDto,
  type PriceRuleKind,
  type PriceRuleListDto,
  type PriceRuleReportDto,
  type PriceRuleSwitchRequest,
} from '../../api/catalog/priceRules'
import { getCatalogGroups, type CatalogGroupsDto } from '../../api/catalog/groups'
import { BelowCostDialog, DANGER, PauseDialog, SECONDARY } from './PriceRuleParts'
import { usePriceRuleAccess, usePriceRuleFailureText } from './priceRuleAccess'
import plusIcon from '../../assets/catalog/plus-white.svg'
import plusBrandIcon from '../../assets/catalog/plus-brand.svg'
import kpiPercentIcon from '../../assets/catalog/kpi-percent.svg'
import kpiUpIcon from '../../assets/catalog/arrow-up.svg'
import kpiEarningIcon from '../../assets/catalog/kpi-earning.svg'
import kpiClockIcon from '../../assets/catalog/clock.svg'
import bagIcon from '../../assets/catalog/kind-bag.svg'
import clockIcon from '../../assets/catalog/kind-hour.svg'
import usersIcon from '../../assets/catalog/kpi-customers.svg'
import warnIcon from '../../assets/catalog/alert-amber.svg'
import menuEditIcon from '../../assets/catalog/pencil-ink.svg'
import menuCopyIcon from '../../assets/catalog/copy-ink.svg'
import menuChartIcon from '../../assets/catalog/menu-chart.svg'
import menuDownloadIcon from '../../assets/catalog/download-ink.svg'
import menuPauseIcon from '../../assets/catalog/menu-pause.svg'
import menuWhatIfIcon from '../../assets/catalog/menu-refresh.svg'
import menuTrashIcon from '../../assets/catalog/trash-danger.svg'

const FAMILY_ICON: Record<PriceRuleKind, string> = {
  VOLUME: bagIcon,
  TIME: clockIcon,
  CUSTOMER: usersIcon,
}

/** The hours a schedule strip draws, 7am through 7pm. */
const HOURS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]

type KindFilter = 'ALL' | PriceRuleKind
type StateFilter = 'all' | 'on' | 'off' | 'archived'
type PeriodFilter = '30' | '90' | '365'

type Pending =
  | {
      kind: 'switch'
      rule: PriceRuleDto
      body: PriceRuleSwitchRequest
      items: PriceRuleBelowCostItem[]
    }
  | { kind: 'pause'; rule: PriceRuleDto }
  | { kind: 'archive'; rule: PriceRuleDto }
  | null

/**
 * Catalog › Price rules (Figma 135:50361), wired to `GET /v1/price-rules` and
 * `GET /v1/price-rules/report` (the last 90 days by default, Asia/Muscat).
 *
 * The cards at the top are the report's totals (`used` counts invoices once however many rules
 * they used; the share of sales is the server's). Each rule's badge is its `runningNow`, so the
 * badge and the card agree with what a sale this minute would be charged.
 */
export function PriceRulesPage() {
  const { t, i18n } = useTranslation()
  const access = usePriceRuleAccess()
  const failureText = usePriceRuleFailureText()
  const { branches } = useWorkingBranch()
  const [kind, setKind] = useState<KindFilter>('ALL')
  const [state, setState] = useState<StateFilter>('all')
  const [period, setPeriod] = useState<PeriodFilter>('90')
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; body: string } | null>(null)
  const [pauseProblem, setPauseProblem] = useState<string | null>(null)

  const { from, to } = lastDays(Number(period), muscatToday())
  const listPath = access.canRead
    ? priceRuleListPath({
        kind: kind === 'ALL' ? null : kind,
        enabled: state === 'on' ? true : state === 'off' ? false : null,
        includeArchived: state === 'archived',
        from,
        to,
      })
    : null
  const list = useApiRead<PriceRuleListDto>(listPath, () => loadPriceRules(listPath!))
  const reportPath = access.canRead ? priceRuleReportPath({ from, to }) : null
  const report = useApiRead<PriceRuleReportDto>(reportPath, () => loadPriceRuleReport(reportPath!))
  const groups = useApiRead<CatalogGroupsDto>(
    access.canRead ? '/v1/catalog/groups' : null,
    getCatalogGroups,
  )

  const shown = (list.read.status === 'ready' ? list.read.data.items : []).filter((rule) =>
    state === 'archived' ? rule.archived : !rule.archived,
  )
  const totals = report.read.status === 'ready' ? report.read.data.totals : null
  const refresh = () => {
    list.retry()
    report.retry()
  }

  const send = async (rule: PriceRuleDto, body: PriceRuleSwitchRequest) => {
    setBusy(true)
    setNotice(null)
    try {
      const saved = await switchPriceRule(rule.id, rule.version, body)
      setPending(null)
      setPauseProblem(null)
      setNotice({
        tone: 'success',
        body: saved.pausedUntil
          ? t('priceRules.done.paused', {
              name: saved.name,
              date: formatDate(saved.pausedUntil, i18n.language),
            })
          : saved.enabled
            ? t('priceRules.done.on', { name: saved.name })
            : t('priceRules.done.off', { name: saved.name }),
      })
      refresh()
    } catch (error) {
      const items = belowCostItems(error)
      if (items) {
        setPending({ kind: 'switch', rule, body, items })
      } else if (body.pauseUntil) {
        setPauseProblem(failureText(error))
      } else {
        setPending(null)
        setNotice({ tone: 'error', body: failureText(error) })
      }
    } finally {
      setBusy(false)
    }
  }

  const archive = async (rule: PriceRuleDto) => {
    setBusy(true)
    setNotice(null)
    try {
      await archivePriceRule(rule.id, rule.version)
      setNotice({ tone: 'success', body: t('priceRules.done.archived', { name: rule.name }) })
      refresh()
    } catch (error) {
      setNotice({ tone: 'error', body: failureText(error) })
    } finally {
      setPending(null)
      setBusy(false)
    }
  }

  const exportReport = async () => {
    setNotice(null)
    try {
      saveDownload(await downloadPriceRuleReport({ from, to }), `price-rules-${from}-${to}.csv`)
    } catch (error) {
      setNotice({ tone: 'error', body: failureText(error) })
    }
  }

  const now = muscatNow()
  const shell = (body: React.ReactNode) => (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { labelKey: 'priceRules.title' }]}
      title={t('priceRules.title')}
      subtitle={t('priceRules.subtitle')}
      wideHeading
      actions={
        access.canManage ? (
          <Link
            to="/catalog/rules/new"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4" />
            {t('priceRules.newRule')}
          </Link>
        ) : undefined
      }
    >
      {body}
    </CatalogShell>
  )

  if (!access.ready) return shell(<LoadingNotice />)
  if (!access.canRead) return shell(<PermissionDeniedNotice />)
  if (list.read.status === 'failed')
    return shell(<ApiReadFailure error={list.read.error} retry={list.retry} />)

  const families = RULE_FAMILIES.filter((family) => shown.some((rule) => rule.kind === family.id))
  const lastFamily = families[families.length - 1]?.id

  return shell(
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiPercentIcon}
          label={t('priceRules.kpi.rules')}
          value={totals ? String(totals.rules) : '–'}
          note={
            list.read.status === 'ready'
              ? t('priceRules.kpi.rulesNote', {
                  running: shown.filter((rule) => rule.enabled).length,
                  off: shown.filter((rule) => !rule.enabled).length,
                })
              : ''
          }
        />
        <Kpi
          icon={kpiUpIcon}
          tint="bg-success-100"
          label={t('priceRules.kpi.givenAway')}
          value={totals ? omr(totals.givenAway) : '–'}
          currency
          note={
            totals
              ? totals.shareOfSalesPercent === null
                ? t('priceRules.kpi.givenAwayNoSales')
                : t('priceRules.kpi.givenAwayNote', {
                    share: Number(totals.shareOfSalesPercent.toFixed(1)),
                  })
              : ''
          }
        />
        <Kpi
          icon={kpiEarningIcon}
          label={t('priceRules.kpi.broughtIn')}
          value={totals ? omr(totals.broughtIn) : '–'}
          currency
          note={
            totals
              ? t('priceRules.kpi.broughtInNote', { count: totals.used.toLocaleString('en-US') })
              : ''
          }
        />
        <Kpi
          icon={kpiClockIcon}
          solidIcon
          tone="pending"
          label={t('priceRules.kpi.runningNow')}
          value={totals ? String(totals.runningNow) : '–'}
          note={t('priceRules.kpi.runningNowNote', {
            time: `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`,
            day: weekdayName(now.weekday, i18n.language),
          })}
        />
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu<KindFilter>
            label={t('priceRules.filter.kind')}
            value={kind}
            defaultValue="ALL"
            onChange={setKind}
            options={[
              { value: 'ALL', label: t('priceRules.filter.allKinds') },
              ...RULE_FAMILIES.map((family) => ({ value: family.id, label: t(family.titleKey) })),
            ]}
          />
          <FilterMenu<StateFilter>
            label={t('priceRules.filter.state')}
            value={state}
            defaultValue="all"
            onChange={setState}
            options={(['all', 'on', 'off', 'archived'] as StateFilter[]).map((value) => ({
              value,
              label: t(`priceRules.filter.${value}`),
            }))}
          />
          <FilterMenu<PeriodFilter>
            label={t('priceRules.filter.period')}
            value={period}
            defaultValue="90"
            onChange={setPeriod}
            options={(['30', '90', '365'] as PeriodFilter[]).map((value) => ({
              value,
              label: t('priceRules.filter.lastDays', { count: Number(value) }),
            }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/catalog/rules/report" className={SECONDARY}>
            {t('priceRules.report.open')}
          </Link>
          <button type="button" onClick={exportReport} className={SECONDARY}>
            {t('priceRules.report.export')}
          </button>
        </div>
      </section>

      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={[
            'rounded-sm px-4 py-3 text-sm font-medium',
            notice.tone === 'error'
              ? 'bg-danger-100 text-danger-700'
              : 'bg-success-100 text-[#3d5648]',
          ].join(' ')}
        >
          {notice.body}
        </p>
      ) : null}

      {list.read.status === 'loading' ? <LoadingNotice /> : null}
      {list.read.status === 'ready' && shown.length === 0 ? (
        <section className="rounded-md bg-surface-card p-8 text-center">
          <p className="text-sm font-medium text-text-tertiary">{t('priceRules.empty')}</p>
          {access.canManage ? (
            <Link
              to="/catalog/rules/new"
              className="mt-4 inline-flex h-[46px] items-center gap-2 rounded-sm border border-dashed border-border-default bg-white px-4 text-sm font-semibold text-primary-700 hover:bg-primary-25"
            >
              <img src={plusBrandIcon} alt="" className="size-4" />
              {t('priceRules.addARule')}
            </Link>
          ) : null}
        </section>
      ) : null}

      {families.map((family) => {
        const inFamily = shown.filter((rule) => rule.kind === family.id)
        /** "Add a rule" closes the last card on the page, as the design draws it. */
        const last = family.id === lastFamily && access.canManage
        return (
          <section key={family.id} className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t(family.titleKey)}
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              {inFamily.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  groups={groups.read.status === 'ready' ? groups.read.data : null}
                  canManage={access.canManage}
                  busy={busy}
                  onToggle={(enabled) => send(rule, { enabled })}
                  onPause={() => {
                    setPauseProblem(null)
                    setPending({ kind: 'pause', rule })
                  }}
                  onArchive={() => setPending({ kind: 'archive', rule })}
                  onExport={exportReport}
                />
              ))}
              {last ? (
                <Link
                  to="/catalog/rules/new"
                  className="inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-sm border border-dashed border-border-default bg-white text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-25"
                >
                  <img src={plusBrandIcon} alt="" className="size-4" />
                  {t('priceRules.addARule')}
                </Link>
              ) : null}
            </div>
          </section>
        )
      })}

      <BelowCostDialog
        items={pending?.kind === 'switch' ? pending.items : null}
        branches={branches}
        busy={busy}
        onCancel={() => setPending(null)}
        onGoLive={() =>
          pending?.kind === 'switch' &&
          send(pending.rule, { ...pending.body, acknowledgeBelowCost: true })
        }
      />
      <PauseDialog
        key={pending?.kind === 'pause' ? pending.rule.id : 'none'}
        open={pending?.kind === 'pause'}
        name={pending?.kind === 'pause' ? pending.rule.name : ''}
        busy={busy}
        problem={pauseProblem}
        onCancel={() => setPending(null)}
        onPause={(until) =>
          pending?.kind === 'pause' && send(pending.rule, { enabled: false, pauseUntil: until })
        }
      />
      <Modal
        open={pending?.kind === 'archive'}
        onClose={() => setPending(null)}
        title={t('priceRules.archive.title', {
          name: pending?.kind === 'archive' ? pending.rule.name : '',
        })}
        subtitle={t('priceRules.archive.subtitle')}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={() => setPending(null)} className={SECONDARY}>
              {t('priceRules.cancel')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => pending?.kind === 'archive' && archive(pending.rule)}
              className={DANGER}
            >
              {t('priceRules.archive.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
          {t('priceRules.archive.body')}
        </p>
      </Modal>
    </>,
  )
}

/** "Everything", or the groups, kinds and items a rule names. */
function useTargetText() {
  const { t, i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  return (rule: PriceRuleDto, groups: CatalogGroupsDto | null) => {
    if (rule.targets.some((target) => target.type === 'ALL'))
      return t('priceRules.scope.everything')
    const names: string[] = []
    let items = 0
    for (const target of rule.targets) {
      const group = groups?.groups.find((g) => g.id === target.id)
      const kind = groups?.groups.flatMap((g) => g.kinds).find((k) => k.id === target.id)
      const found = target.type === 'GROUP' ? group : target.type === 'KIND' ? kind : null
      if (found) names.push(ar && found.nameAr ? found.nameAr : found.name)
      else if (target.type === 'PRODUCT' || target.type === 'VARIANT') items += 1
    }
    const parts = [...names]
    if (items > 0) parts.push(t('priceRules.scope.items', { count: items }))
    return parts.join(', ') || t('priceRules.scope.items', { count: rule.targets.length })
  }
}

function RuleCard({
  rule,
  groups,
  canManage,
  busy,
  onToggle,
  onPause,
  onArchive,
  onExport,
}: {
  rule: PriceRuleDto
  groups: CatalogGroupsDto | null
  canManage: boolean
  busy: boolean
  onToggle: (enabled: boolean) => void
  onPause: () => void
  onArchive: () => void
  onExport: () => void
}) {
  const { t, i18n } = useTranslation()
  const targetText = useTargetText()
  const on = rule.enabled && !rule.archived
  const live = rule.runningNow
  const timed = rule.kind === 'TIME'
  /** Two-letter days in English as drawn; other languages get their own short names. */
  const dayLabel = (index: number) =>
    i18n.language.startsWith('en') ? WEEKDAYS[index] : weekdayName(index, i18n.language, 'short')
  const date = (value: string) => formatDate(value, i18n.language)
  const offerText = rule.offer
    ? rule.offer.priceEach !== null && rule.offer.priceEach !== undefined
      ? t('priceRules.offer.priceEach', { price: omr(rule.offer.priceEach) })
      : t('priceRules.offer.percentOff', {
          percent: Number((rule.offer.percentOff ?? 0).toFixed(2)),
        })
    : ''
  const status = rule.archived
    ? t('priceRules.archived')
    : rule.pausedUntil
      ? t('priceRules.pausedUntil', { date: date(rule.pausedUntil) })
      : live
        ? t('priceRules.onRightNow')
        : on
          ? t('priceRules.running')
          : t('priceRules.switchedOff')

  return (
    <article
      className={[
        'overflow-hidden rounded-sm border',
        on ? 'border-border-subtle bg-white' : 'border-border-subtle bg-surface-background/40',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-4 p-4">
        <span
          className={[
            'flex size-9 shrink-0 items-center justify-center rounded-md',
            !on ? 'bg-surface-background' : timed ? 'bg-pending-100' : 'bg-primary-50',
          ].join(' ')}
        >
          {timed ? (
            <AmberClock className={on ? 'size-[18px]' : 'size-[18px] opacity-50'} />
          ) : (
            <img
              src={FAMILY_ICON[rule.kind]}
              alt=""
              className={on ? 'size-[18px]' : 'size-[18px] opacity-50'}
            />
          )}
        </span>

        <div className="min-w-0 flex-1 sm:min-w-[240px]">
          <p
            className={[
              'break-words text-base font-semibold leading-[1.3]',
              on ? 'text-text-primary' : 'text-text-quaternary',
            ].join(' ')}
          >
            {rule.name}
          </p>
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            {targetText(rule, groups)}
            {' · '}
            {rule.branchIds.length
              ? t('priceRules.scope.branches', { count: rule.branchIds.length })
              : t('priceRules.scope.everyBranch')}
            {rule.atTheTill ? '' : ` · ${t('priceRules.scope.invoicesOnly')}`}
          </p>
        </div>

        <span className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <span
            className={[
              'inline-flex h-[24px] items-center gap-1.5 rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
              live
                ? 'bg-pending-700 text-white'
                : on
                  ? 'bg-success-100 text-[#3d5648]'
                  : 'bg-surface-background text-text-tertiary',
            ].join(' ')}
          >
            <span
              className={[
                'size-1.5 rounded-full',
                live ? 'bg-white' : on ? 'bg-[#4c6c5a]' : 'bg-[#a8abb2]',
              ].join(' ')}
            />
            {status}
          </span>
          {rule.archived ? null : (
            <Switch
              checked={on}
              onChange={onToggle}
              label={rule.name}
              disabled={!canManage || busy}
            />
          )}
          <ActionMenu
            size="md"
            label={t('priceRules.menu.thisRule')}
            items={[
              ...(canManage && !rule.archived
                ? [
                    {
                      id: 'edit',
                      sectionKey: 'priceRules.menu.thisRule',
                      labelKey: 'priceRules.menu.changeIt',
                      icon: menuEditIcon,
                      to: `/catalog/rules/${rule.id}/edit`,
                    },
                  ]
                : []),
              ...(canManage
                ? [
                    {
                      id: 'copy',
                      labelKey: 'priceRules.menu.copyIt',
                      icon: menuCopyIcon,
                      to: `/catalog/rules/new?copy=${rule.id}`,
                    },
                  ]
                : []),
              {
                id: 'sales',
                labelKey: 'priceRules.menu.theSalesThatUsedIt',
                icon: menuChartIcon,
                values: { count: (rule.used ?? 0).toLocaleString('en-US') },
                hint: (rule.used ?? 0).toLocaleString('en-US'),
                to: `/catalog/rules/${rule.id}/sales`,
              },
              {
                id: 'export',
                labelKey: 'priceRules.menu.exportWhatItGaveAway',
                icon: menuDownloadIcon,
                onSelect: onExport,
              },
              ...(canManage && !rule.archived
                ? [
                    {
                      id: 'pause',
                      sectionKey: 'priceRules.menu.tryThingsOut',
                      labelKey: 'priceRules.menu.pauseIt',
                      icon: menuPauseIcon,
                      onSelect: onPause,
                    },
                  ]
                : []),
              // TODO(backend): "What if" has no route to price past sales under a changed rule
              // (INCOME.md row P.36); drawn as Coming later.
              {
                id: 'whatIf',
                labelKey: 'priceRules.menu.whatIf',
                icon: menuWhatIfIcon,
                hintKey: 'priceRules.comingLater',
              },
              ...(canManage && !rule.archived
                ? [
                    {
                      id: 'archive',
                      labelKey: 'priceRules.menu.archiveIt',
                      icon: menuTrashIcon,
                      danger: true,
                      onSelect: onArchive,
                    },
                  ]
                : []),
            ]}
          />
        </span>
      </div>

      {on || rule.archived ? (
        <div className="grid border-t border-surface-background lg:grid-cols-3">
          {/* what it does */}
          <div className="border-surface-background p-4 lg:border-e">
            <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {rule.kind === 'VOLUME'
                ? t('priceRules.theBreaks')
                : rule.kind === 'TIME'
                  ? t('priceRules.whenItRuns')
                  : t('priceRules.whoGetsIt')}
            </p>

            {rule.kind === 'VOLUME' ? (
              <ul className="mt-3 flex flex-col gap-2.5">
                {rule.tiers.map((tier, index) => {
                  const save = tierShare(rule, index)
                  const price = tierText(tier)
                  return (
                    <li key={index} className="flex items-center gap-3">
                      <span className="w-[86px] shrink-0 text-xs font-medium text-text-secondary">
                        {tier.toQty === null
                          ? t('priceRules.tierOrMore', { from: tier.fromQty })
                          : t('priceRules.tierRange', { from: tier.fromQty, to: tier.toQty })}
                      </span>
                      <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-background">
                        <span
                          className="bg-primary-700"
                          style={{ width: `${Math.round(Math.max(save.share, 0) * 100)}%` }}
                        />
                      </span>
                      <span className="w-[56px] shrink-0 text-end text-xs font-semibold text-text-primary tabular-nums">
                        {price.amount ?? price.percent}
                      </span>
                      <span
                        className={[
                          'w-[38px] shrink-0 text-end text-xs font-medium tabular-nums',
                          save.percent === 0 ? 'text-text-quaternary' : 'text-[#3d5648]',
                        ].join(' ')}
                      >
                        {save.percent === 0 ? '–' : `${save.percent}%`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : rule.kind === 'TIME' ? (
              <div className="mt-3">
                <span className="grid w-max grid-cols-6 gap-1 sm:grid-cols-12">
                  {HOURS.map((hour, index) => {
                    const start = (index < 6 ? hour : hour + 12) * 60
                    const inWindow = rule.windows.some((window) => {
                      const from = minutesOf(window.from)
                      const to = minutesOf(window.to)
                      return to > from
                        ? start + 60 > from && start < to
                        : start + 60 > from || start < to
                    })
                    return (
                      <span
                        key={index}
                        className={[
                          'flex size-6 items-center justify-center rounded-[3px] text-[10px] font-medium',
                          inWindow
                            ? 'bg-pending-500 text-white'
                            : 'bg-surface-background text-text-quaternary',
                        ].join(' ')}
                      >
                        {hour}
                      </span>
                    )
                  })}
                </span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {WEEKDAYS.map((day, index) => {
                    const inWindow = rule.windows.some((window) => window.days.includes(index))
                    return (
                      <span
                        key={day}
                        className={[
                          'flex h-6 min-w-6 items-center justify-center whitespace-nowrap rounded-[3px] px-1 text-[10px] font-medium',
                          inWindow
                            ? 'bg-primary-50 text-primary-800'
                            : 'bg-surface-background text-text-quaternary',
                        ].join(' ')}
                      >
                        {dayLabel(index)}
                      </span>
                    )
                  })}
                </span>
                <ul className="mt-2.5 flex flex-col gap-0.5 text-xs font-medium text-text-quaternary">
                  {rule.windows.map((window, index) => (
                    <li key={index} dir="auto">
                      {t('priceRules.window', {
                        days: window.days.map((d) => dayLabel(d)).join(' '),
                        from: window.from,
                        to: window.to,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-sm font-medium leading-[1.6] text-text-tertiary">
                {t('priceRules.who.customers', { count: rule.customers?.customerIds.length ?? 0 })}
                {rule.customers?.tags.length
                  ? ` · ${t('priceRules.who.tags', { tags: rule.customers.tags.join(', ') })}`
                  : ''}
              </p>
            )}
          </div>

          {/* what comes off */}
          <div className="border-surface-background p-4 lg:border-e">
            <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {rule.kind === 'VOLUME' ? t('priceRules.howItCounts') : t('priceRules.whatComesOff')}
            </p>
            <p className="mt-3 text-sm font-medium leading-[1.6] text-text-tertiary">
              {rule.kind === 'VOLUME'
                ? [
                    rule.countedAs === 'PER_ITEM'
                      ? t('priceRules.counted.perItem')
                      : t('priceRules.counted.across'),
                    rule.extrasOnly
                      ? t('priceRules.counted.extrasOnly')
                      : t('priceRules.counted.whole'),
                  ].join(' ')
                : withRial(offerText)}
            </p>
          </div>

          {/* how it's gone */}
          <div className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('priceRules.howItsGone')}
            </p>
            <dl className="mt-2">
              <Row
                label={t('priceRules.used')}
                value={t('priceRules.usedTimes', {
                  count: (rule.used ?? 0).toLocaleString('en-US'),
                })}
              />
              <Row
                label={t('priceRules.givenAway')}
                value={`OMR ${omr(rule.givenAway ?? 0)}`}
                tone="pending"
              />
              <Row label={t('priceRules.broughtIn')} value={`OMR ${omr(rule.broughtIn ?? 0)}`} />
              <Row
                label={t('priceRules.since')}
                value={
                  rule.validTo
                    ? t('priceRules.fromTo', { from: date(rule.validFrom), to: date(rule.validTo) })
                    : date(rule.validFrom)
                }
              />
            </dl>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-surface-background bg-pending-100/50 px-4 py-3.5 md:flex-row md:items-center md:justify-between">
          <p className="flex min-w-0 items-start gap-2 text-sm font-medium leading-[1.5] text-pending-700">
            <img src={warnIcon} alt="" className="mt-0.5 size-4 shrink-0" />
            <span>
              {rule.pausedUntil
                ? t('priceRules.pausedNote', { date: date(rule.pausedUntil) })
                : t('priceRules.switchedOffNote')}
            </span>
          </p>
          {rule.used ? (
            <Pill tone="neutral">{t('priceRules.usedTimes', { count: rule.used })}</Pill>
          ) : null}
        </div>
      )}
    </article>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'pending' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-xs font-medium text-text-tertiary">{label}</dt>
      <dd
        className={[
          'shrink-0 text-xs font-semibold tabular-nums',
          tone === 'pending' ? 'text-pending-700' : 'text-text-primary',
        ].join(' ')}
      >
        {withRial(value)}
      </dd>
    </div>
  )
}

/** The clock the time rules wear, drawn in the amber of their tile. */
function AmberClock({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
      <circle cx="9" cy="9" r="6.4" stroke="#887147" strokeWidth="1.4" />
      <path
        d="M9 5.4V9l2.5 1.6"
        stroke="#887147"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
