import { useState } from 'react'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { Rial, withRial } from '../../components/ui'
import { PosFootNote } from './PosFootNote'
import { CashIcon, CheckIcon, ClockIcon } from './posIcons'
import type { ReactNode } from 'react'
import { TILL, omr, omrSigned } from '../../lib/pos'
import {
  AVERAGE_SALE,
  CASH_SHARE,
  COUNTED,
  COUNTED_BY_NOTE,
  DISCOUNTS_TODAY,
  DRAWER,
  LOOSE_ENDS,
  REFUNDS_TODAY,
  SALES_TODAY,
  SHIFT,
  SHORT_REASONS,
  SHOULD_HOLD,
  TAKEN_TODAY,
  TAKINGS,
  TIPS_TODAY,
  VAT_WITHIN,
} from '../../lib/posClose'

function Line({
  label,
  note,
  value,
  tone,
  icon,
}: {
  label: string
  note?: string
  value: string
  tone?: 'add' | 'take' | 'sum'
  icon?: ReactNode
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 border-b border-border-subtle px-5 last:border-b-0',
        // The total sits on a grey band, a step larger, as the frame draws it.
        tone === 'sum' ? 'rounded-b-md bg-surface-tab-bar py-4' : 'py-3.5',
      ].join(' ')}
    >
      <span
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-sm text-sm',
          tone === 'take'
            ? 'bg-danger-100 text-danger-700'
            : tone === 'add'
              ? 'bg-success-100 text-success-700'
              : tone === 'sum'
                ? 'bg-white text-text-tertiary'
                : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        {icon ?? (tone === 'take' ? '−' : tone === 'add' ? '+' : '=')}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={[
            'block font-medium text-text-primary',
            tone === 'sum' ? 'text-base' : 'text-sm',
          ].join(' ')}
        >
          {label}
        </span>
        {note ? (
          <span className="mt-0.5 block text-xs font-medium text-text-quaternary">{note}</span>
        ) : null}
      </span>
      <span
        dir="ltr"
        className={[
          'shrink-0 font-semibold tabular-nums',
          tone === 'sum' ? 'text-lg' : 'text-base',
          tone === 'take'
            ? 'text-danger-700'
            : tone === 'add'
              ? 'text-success-700'
              : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}

export function PosClosePage() {
  const { t, i18n } = useTranslation()
  // The till's branch is the one chosen in the sidebar; the sample's until branches load.
  const branchName = useWorkingBranch().name ?? TILL.branch
  const [counted, setCounted] = useState(COUNTED)
  const [reason, setReason] = useState(SHORT_REASONS[0].id)
  const [byNote, setByNote] = useState(false)

  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const day = TILL.now.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const gap = counted - SHOULD_HOLD
  const share = Math.abs(gap) / TAKINGS.cash

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <Link
          to="/pos"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
        >
          ‹ {t('pos.backToTill')}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('pos.close.title')}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              {t('pos.close.subtitle', {
                branch: branchName,
                till: TILL.number,
                who: SHIFT.cashier,
                from: SHIFT.from,
                to: SHIFT.to,
                day,
              })}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-11 shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('pos.close.printSummary')}
          </button>
        </div>

        <div className="flex flex-wrap gap-4">
          <Kpi
            title={t('pos.close.takenToday')}
            value={omr(TAKEN_TODAY)}
            note={t('pos.close.takenNote', { sales: SALES_TODAY, average: omr(AVERAGE_SALE) })}
          />
          <Kpi
            title={t('pos.close.cash')}
            value={omr(TAKINGS.cash)}
            note={t('pos.close.cashNote', {
              percent: Math.round(CASH_SHARE * 100),
              sales: TAKINGS.cashSales,
            })}
          />
          <Kpi
            title={t('pos.close.card')}
            value={omr(TAKINGS.card)}
            note={t('pos.close.cardNote', { sales: TAKINGS.cardSales })}
          />
          <Kpi
            title={t('pos.close.onCompany')}
            value={omr(TAKINGS.company)}
            note={t('pos.close.companyNote', { count: TAKINGS.companyInvoices })}
          />
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-[320px] flex-1 flex-col gap-4">
            <section className="rounded-md bg-surface-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
                <div>
                  <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('pos.close.countDrawer')}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-text-quaternary">
                    {t('pos.close.cashOnly')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setByNote((v) => !v)}
                  className="text-sm font-semibold text-primary-700"
                >
                  {byNote ? t('pos.close.enterTotal') : t('pos.close.byDenomination')}
                </button>
              </div>

              <div className="flex flex-wrap gap-4 px-5 py-4">
                <div className="min-w-[260px] flex-1">
                  <p className="text-xs font-semibold text-text-tertiary">
                    {t('pos.close.actuallyIn')}
                  </p>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={(counted / 1000).toFixed(3)}
                    onChange={(event) => {
                      const next = Number(event.target.value.replace(/[^0-9.]/g, '')) * 1000
                      setCounted(Number.isFinite(next) ? Math.round(next) : 0)
                    }}
                    aria-label={t('pos.close.actuallyIn')}
                    className="mt-2 h-[60px] w-full rounded-sm border-2 border-primary-700 bg-primary-25 px-4 text-end text-2xl font-semibold text-text-primary outline-none"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COUNTED_BY_NOTE.map((note) => (
                      <span
                        key={note.value}
                        className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-tertiary"
                      >
                        {omr(note.value).replace(/\.000$/, '')}
                        <span className="text-xs text-text-quaternary">×{note.count}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  className={[
                    'min-w-[260px] flex-1 rounded-sm p-4',
                    gap === 0 ? 'bg-success-100' : 'bg-pending-100',
                  ].join(' ')}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                    {gap === 0
                      ? t('pos.close.balances')
                      : gap < 0
                        ? t('pos.close.shortBy')
                        : t('pos.close.overBy')}
                  </p>
                  <p className="mt-1 inline-flex items-baseline gap-1.5 text-[30px] font-semibold leading-none text-pending-700">
                    <Rial />
                    {omr(Math.abs(gap))}
                  </p>
                  {gap !== 0 ? (
                    <p className="mt-2 text-xs font-medium leading-[1.6] text-text-tertiary">
                      {t('pos.close.shortStory', {
                        expected: omr(SHOULD_HOLD),
                        counted: omr(counted),
                        percent: (share * 100).toFixed(1),
                      })}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-border-subtle">
                <Line
                  label={t('pos.close.float')}
                  note={t('pos.close.floatNote', { time: DRAWER.floatSetAt })}
                  value={omr(DRAWER.float)}
                  icon={<CashIcon className="size-4" />}
                />
                <Line
                  label={t('pos.close.cashTaken')}
                  note={t('pos.close.cashTakenNote', { sales: TAKINGS.cashSales })}
                  value={`+${omr(TAKINGS.cash)}`}
                  tone="add"
                />
                <Line
                  label={t('pos.close.refundedInCash')}
                  note={t(DRAWER.refundedNoteKey, DRAWER.refundedValues)}
                  value={omrSigned(-DRAWER.refunded)}
                  tone="take"
                />
                <Line
                  label={t('pos.close.paidOut')}
                  note={t(DRAWER.paidOutNoteKey, DRAWER.paidOutValues)}
                  value={omrSigned(-DRAWER.paidOut)}
                  tone="take"
                />
                <Line label={t('pos.close.shouldHold')} value={omr(SHOULD_HOLD)} tone="sum" />
              </div>
            </section>

            {gap !== 0 ? (
              <section className="rounded-md bg-surface-card">
                <div className="border-b border-border-subtle px-5 py-4">
                  <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('pos.close.whyShort')}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-text-quaternary">
                    {t('pos.close.guessIsFine')}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 px-5 py-4 max-md:grid-cols-1">
                  {SHORT_REASONS.map((option) => {
                    const chosen = option.id === reason
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setReason(option.id)}
                        aria-pressed={chosen}
                        className={[
                          'flex items-start gap-3 rounded-md border px-4 py-3.5 text-start transition-colors',
                          chosen
                            ? 'border-primary-700 bg-primary-25'
                            : 'border-border-subtle bg-white hover:border-primary-300',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                            chosen ? 'border-primary-700' : 'border-border-default',
                          ].join(' ')}
                        >
                          {chosen ? <span className="size-2 rounded-full bg-primary-700" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={[
                              'text-sm',
                              chosen
                                ? 'font-semibold text-primary-800'
                                : 'font-semibold text-text-primary',
                            ].join(' ')}
                          >
                            {t(option.labelKey)}
                          </span>{' '}
                          <span className="text-xs font-medium text-text-quaternary">
                            {t(option.noteKey)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="px-5 pb-5">
                  <textarea
                    rows={3}
                    placeholder={t('pos.close.anythingToAdd')}
                    className="w-full resize-none rounded-sm border border-border-subtle bg-white px-4 py-3 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand"
                  />
                </div>
              </section>
            ) : null}

            <section className="rounded-md bg-surface-card">
              <div className="border-b border-border-subtle px-5 py-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.close.looseEnds')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('pos.close.beforeClosing')}
                </p>
              </div>
              <ul>
                {LOOSE_ENDS.map((end) => (
                  <li
                    key={end.id}
                    className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-4 last:border-b-0"
                  >
                    <span
                      className={[
                        'flex size-8 shrink-0 items-center justify-center rounded-sm text-sm',
                        end.state === 'done'
                          ? 'bg-success-100 text-success-700'
                          : 'bg-pending-100 text-pending-700',
                      ].join(' ')}
                    >
                      {end.state === 'done' ? (
                        <CheckIcon className="size-4" />
                      ) : (
                        <ClockIcon className="size-4" />
                      )}
                    </span>
                    <span className="min-w-[200px] flex-1">
                      <span className="block text-sm font-semibold text-text-primary">
                        {t(end.titleKey, end.titleValues)}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium leading-[1.5] text-text-quaternary">
                        {withRial(t(end.noteKey, end.noteValues))}
                      </span>
                    </span>
                    {end.actionKey ? (
                      <button
                        type="button"
                        className="inline-flex h-10 shrink-0 items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                      >
                        {t(end.actionKey)}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.close.shiftInShort')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('pos.close.savedAndPrinted')}
              </p>
            </div>
            <div className="px-5">
              <Sum label={t('pos.close.sales')} value={String(SALES_TODAY)} />
              <Sum label={t('pos.close.taken')} value={omr(TAKEN_TODAY)} money />
              <Sum label={t('pos.close.vatWithin')} value={omr(VAT_WITHIN)} money />
              <Sum label={t('pos.close.discountsGiven')} value={omr(DISCOUNTS_TODAY)} money />
              <Sum label={t('pos.close.tips')} value={omr(TIPS_TODAY)} money />
              <Sum
                label={t('pos.close.refunds')}
                value={`${REFUNDS_TODAY.count} · ${omr(REFUNDS_TODAY.amount)}`}
              />
              <Sum
                label={t('pos.close.drawer')}
                value={
                  gap === 0
                    ? t('pos.close.balances')
                    : t('pos.close.shortValue', { amount: omr(Math.abs(gap)) })
                }
                tone={gap === 0 ? undefined : 'watch'}
              />
              <Sum label={t('pos.close.toBank')} value={omr(counted - DRAWER.float)} money />
              <Sum label={t('pos.close.floatTomorrow')} value={omr(DRAWER.float)} money />
            </div>
            <div className="border-t border-border-subtle px-5 py-5">
              <button
                type="button"
                className="inline-flex h-[52px] w-full items-center justify-center rounded-sm bg-primary-700 text-base font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t('pos.close.closeTill')}
              </button>
            </div>
            <PosFootNote icon="lock">
              {t('pos.close.onceClosed', { owner: SHIFT.ownerName, float: omr(DRAWER.float) })}
            </PosFootNote>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function Kpi({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <article className="flex min-w-[240px] flex-1 flex-col gap-2 rounded-md bg-surface-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
        {title}
      </p>
      <p className="inline-flex items-baseline gap-1.5 text-[30px] font-semibold leading-[1.2] text-text-primary">
        <Rial />
        {value}
      </p>
      <p className="text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

function Sum({
  label,
  value,
  tone,
  money,
}: {
  label: string
  value: string
  tone?: 'watch'
  /** An amount of money: the rial sign goes before it. */
  money?: boolean
}) {
  return (
    <div className="flex min-h-[35px] items-center justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0">
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      <span
        className={[
          'inline-flex items-baseline gap-1 text-sm font-semibold tabular-nums',
          tone === 'watch' ? 'text-pending-700' : 'text-text-primary',
        ].join(' ')}
      >
        {money ? <Rial /> : null}
        {value}
      </span>
    </div>
  )
}
