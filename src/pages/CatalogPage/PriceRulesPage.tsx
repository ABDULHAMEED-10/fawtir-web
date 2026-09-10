import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { CatalogShell, Kpi } from './CatalogShell'
import { ActionMenu, RialText, Switch, withRial } from '../../components/ui'
import { omr } from '../../lib/catalog'
import {
  RULES,
  RULE_FAMILIES,
  RULES_SUMMARY,
  SHARE_OF_SALES,
  NOW,
  WEEKDAYS,
  isInWindowNow,
  breakSaving,
  type Rule,
} from '../../lib/catalogRules'
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

const FAMILY_ICON: Record<string, string> = {
  volume: bagIcon,
  time: clockIcon,
  customer: usersIcon,
}

/** The hours a schedule strip draws, 7am through 12 midnight. */
const HOURS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]

/**
 * Catalog › Price rules (Figma 135:50361).
 *
 * Whether a rule is on *right now* is asked of the clock rather than stored, so the badge and
 * the card at the top can never disagree about what a customer would be charged this minute.
 */
export function PriceRulesPage() {
  const { t } = useTranslation()
  const [on, setOn] = useState(() => new Set(RULES.filter((rule) => rule.on).map((r) => r.id)))
  const summary = RULES_SUMMARY()

  const toggle = (id: string) =>
    setOn((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { labelKey: 'priceRules.title' }]}
      title={t('priceRules.title')}
      subtitle={t('priceRules.subtitle')}
      actions={
        <Link
          to="/catalog/rules/new"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-4" />
          {t('priceRules.newRule')}
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiPercentIcon}
          label={t('priceRules.kpi.rules')}
          value={String(summary.count)}
          note={t('priceRules.kpi.rulesNote', { running: summary.running, off: summary.off })}
        />
        <Kpi
          icon={kpiUpIcon}
          tint="bg-success-100"
          label={t('priceRules.kpi.givenAway')}
          value={omr(summary.givenAway)}
          currency
          note={t('priceRules.kpi.givenAwayNote', { share: SHARE_OF_SALES })}
        />
        <Kpi
          icon={kpiEarningIcon}
          label={t('priceRules.kpi.broughtIn')}
          value={omr(summary.broughtIn)}
          currency
          note={t('priceRules.kpi.broughtInNote', {
            count: summary.used.toLocaleString('en-US'),
          })}
        />
        <Kpi
          icon={kpiClockIcon}
          tint="bg-pending-100"
          tone="pending"
          label={t('priceRules.kpi.runningNow')}
          value={String(summary.runningNow)}
          note={t('priceRules.kpi.runningNowNote', {
            time: `${String(NOW.hour).padStart(2, '0')}:${String(NOW.minute).padStart(2, '0')}`,
            day: 'Thursday',
          })}
        />
      </div>

      {RULE_FAMILIES.map((family) => {
        const inFamily = RULES.filter((rule) => rule.family === family.id)
        if (inFamily.length === 0) return null
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
                  on={on.has(rule.id)}
                  onToggle={() => toggle(rule.id)}
                />
              ))}
            </div>
          </section>
        )
      })}

      <Link
        to="/catalog/rules/new"
        className="inline-flex h-[62px] w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-default bg-white/50 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-25"
      >
        <img src={plusBrandIcon} alt="" className="size-4" />
        {t('priceRules.addARule')}
      </Link>
    </CatalogShell>
  )
}

function RuleCard({ rule, on, onToggle }: { rule: Rule; on: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const live = on && isInWindowNow(rule)

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
            on ? 'bg-primary-50' : 'bg-surface-background',
          ].join(' ')}
        >
          <img
            src={FAMILY_ICON[rule.family]}
            alt=""
            className={on ? 'size-[18px]' : 'size-[18px] opacity-50'}
          />
        </span>

        <div className="min-w-[240px] flex-1">
          <p
            className={[
              'text-base font-semibold leading-[1.3]',
              on ? 'text-text-primary' : 'text-text-quaternary',
            ].join(' ')}
          >
            {rule.name}
          </p>
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            {t(rule.scopeKey, { ...rule.scopeValues, date: rule.since })}
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
            {live
              ? t('priceRules.onRightNow')
              : on
                ? t('priceRules.running')
                : t('priceRules.switchedOff')}
          </span>
          <Switch checked={on} onChange={onToggle} label={rule.name} />
          <ActionMenu
            size="md"
            label={t('priceRules.menu.thisRule')}
            items={[
              {
                id: 'breaks',
                sectionKey: 'priceRules.menu.thisRule',
                labelKey: 'priceRules.menu.changeTheBreaks',
                icon: menuEditIcon,
                to: '/catalog/rules/new',
              },
              { id: 'copy', labelKey: 'priceRules.menu.copyIt', icon: menuCopyIcon },
              {
                id: 'sales',
                labelKey: 'priceRules.menu.theSalesThatUsedIt',
                icon: menuChartIcon,
                values: { count: rule.used.toLocaleString('en-US') },
                hint: rule.used.toLocaleString('en-US'),
              },
              {
                id: 'export',
                labelKey: 'priceRules.menu.exportWhatItGaveAway',
                icon: menuDownloadIcon,
              },
              {
                id: 'pause',
                sectionKey: 'priceRules.menu.tryThingsOut',
                labelKey: 'priceRules.menu.pauseIt',
                icon: menuPauseIcon,
              },
              { id: 'whatIf', labelKey: 'priceRules.menu.whatIf', icon: menuWhatIfIcon },
              {
                id: 'delete',
                labelKey: 'priceRules.menu.deleteIt',
                icon: menuTrashIcon,
                danger: true,
              },
            ]}
          />
        </span>
      </div>

      {on ? (
        <div className="grid border-t border-surface-background lg:grid-cols-3">
          {/* what it does */}
          <div className="border-e border-surface-background p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {rule.breaks ? t('priceRules.theBreaks') : t('priceRules.whenItRuns')}
            </p>

            {rule.breaks ? (
              <ul className="mt-3 flex flex-col gap-2.5">
                {rule.breaks.map((entry, index) => {
                  const save = breakSaving(rule.breaks!, index)
                  return (
                    <li key={index} className="flex items-center gap-3">
                      <span className="w-[86px] shrink-0 text-xs font-medium text-text-secondary">
                        {entry.labelKey ? t(entry.labelKey) : entry.label}
                      </span>
                      <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-background">
                        <span
                          className="bg-primary-700"
                          style={{ width: `${Math.round(save.share * 100)}%` }}
                        />
                      </span>
                      <span className="w-[48px] shrink-0 text-end text-xs font-semibold text-text-primary tabular-nums">
                        {omr(entry.price)}
                      </span>
                      <span className="w-[38px] shrink-0 text-end text-xs font-medium text-text-quaternary tabular-nums">
                        {index === 0 ? '—' : `${save.percent}%`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : rule.window ? (
              <div className="mt-3">
                <span className="flex flex-wrap gap-1">
                  {HOURS.map((hour, index) => {
                    const hour24 = index < 6 ? hour : hour + 12
                    const inWindow = hour24 >= rule.window!.fromHour && hour24 < rule.window!.toHour
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
                    const inWindow = rule.window!.days.includes(index)
                    return (
                      <span
                        key={day}
                        className={[
                          'flex size-6 items-center justify-center rounded-[3px] text-[10px] font-medium',
                          inWindow
                            ? 'bg-primary-50 text-primary-800'
                            : 'bg-surface-background text-text-quaternary',
                        ].join(' ')}
                      >
                        {day}
                      </span>
                    )
                  })}
                </span>
                <p className="mt-2.5 text-xs font-medium text-text-quaternary">
                  {rule.id === 'afternoon-lull'
                    ? t('priceRules.twoToFive')
                    : t('priceRules.sixToTen')}
                </p>
              </div>
            ) : null}
          </div>

          {/* who gets it */}
          <div className="border-e border-surface-background p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {rule.breaks ? t('priceRules.whoGetsIt') : t('priceRules.whatComesOff')}
            </p>
            <p className="mt-3 text-sm font-medium leading-[1.6] text-text-tertiary">
              <Trans
                i18nKey={rule.whoKey}
                values={rule.whoValues}
                components={{ b: <RialText as="b" className="font-semibold text-text-primary" /> }}
              />
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
                value={t('priceRules.usedTimes', { count: rule.used.toLocaleString('en-US') })}
              />
              <Row label={t('priceRules.givenAway')} value={`OMR ${omr(rule.givenAway)}`} />
              {rule.broughtIn > 0 ? (
                <Row label={t('priceRules.broughtIn')} value={`OMR ${omr(rule.broughtIn)}`} />
              ) : null}
              {rule.extraKey ? (
                <Row
                  label={t(rule.extraKey)}
                  value={
                    rule.extraKey === 'priceRules.afternoonSalesUp'
                      ? t('priceRules.afternoonSalesUpValue', rule.extraValues)
                      : rule.extraKey === 'priceRules.pastriesSoldWithIt'
                        ? t('priceRules.pastriesValue', rule.extraValues)
                        : String(rule.extraValues?.value ?? '')
                  }
                />
              ) : null}
              {rule.since ? <Row label={t('priceRules.since')} value={rule.since} last /> : null}
            </dl>
          </div>
        </div>
      ) : rule.offNoteKey ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background bg-pending-100/50 px-4 py-3.5">
          <p className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-pending-700">
            <img src={warnIcon} alt="" className="mt-0.5 size-4 shrink-0" />
            <span>
              <Trans
                i18nKey={rule.offNoteKey}
                values={rule.offNoteValues}
                components={{ b: <b className="font-semibold" /> }}
              />
            </span>
          </p>
          <Link
            to="/trade-documents/quotations"
            className="inline-flex h-[36px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
          >
            {t('priceRules.seeTheQuotes')}
          </Link>
        </div>
      ) : null}
    </article>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-xs font-medium text-text-tertiary">{label}</dt>
      <dd className="shrink-0 text-xs font-semibold text-text-primary tabular-nums">
        {withRial(value)}
      </dd>
    </div>
  )
}
