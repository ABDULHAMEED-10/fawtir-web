import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { RialText } from '../../components/ui'
import { COMPANY, shortDate, longDate, BOOK } from '../../lib/settings'
import {
  CLOSING_BLOCKERS,
  BLOCKING_COUNT,
  CLOSING_STAGES,
  REOPEN_WINDOW_DAYS,
  RETENTION_ENDS,
  ACCOUNT_FACTS,
  MONTHS_WITH_FAWTIR,
  KEEP_LIST,
  LOSE_LIST,
  LAST_EXPORT_ON,
  MONTHS_SINCE_EXPORT,
  EXPORT_PARTS,
  exportSize,
  type Blocker,
} from '../../lib/settingsRecords'
import { MEMBERS } from '../../lib/settingsPeople'
import warnIcon from '../../assets/settings/cert-urgent.svg'
import billIcon from '../../assets/settings/tile-bills.svg'
import quoteIcon from '../../assets/settings/menu-invoice.svg'
import okIcon from '../../assets/settings/check-green.svg'
import tickIcon from '../../assets/settings/check-green.svg'
import crossIcon from '../../assets/settings/cross-danger.svg'
import infoIcon from '../../assets/settings/info.svg'
import clockIcon from '../../assets/settings/clock.svg'
import handoverIcon from '../../assets/settings/handover.svg'
import downloadIcon from '../../assets/settings/download-white.svg'

const BLOCKER_ICON = {
  danger: warnIcon,
  money: billIcon,
  pending: quoteIcon,
  clear: okIcon,
}

const BLOCKER_TINT = {
  danger: 'bg-danger-100',
  money: 'bg-danger-100',
  pending: 'bg-pending-100',
  clear: 'bg-success-100',
}

/**
 * Settings › Closing the account (Figma 135:42365).
 *
 * The destructive button is gated on the blockers above it rather than being drawn disabled by
 * hand, so clearing one in the list is what actually unlocks it. Retention dates are worked out
 * from the first invoice, not typed.
 */
export function ClosingPage() {
  const { t } = useTranslation()
  const defaultSize = exportSize(
    EXPORT_PARTS.filter((part) => part.defaultOn && !part.always).map((part) => part.id),
  )

  return (
    <SettingsShell group="records">
      <SettingsHeader title={t('closing.title')} subtitle={t('closing.subtitle')} />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Blockers */}
          <section className="overflow-hidden rounded-md bg-surface-card">
            <div className="p-5">
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('closing.sortFirst')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {t('closing.sortFirstNote', { count: BLOCKING_COUNT })}
              </p>
            </div>
            <ul>
              {CLOSING_BLOCKERS.map((blocker) => (
                <BlockerRow key={blocker.id} blocker={blocker} />
              ))}
            </ul>
          </section>

          {/* Timeline */}
          <section className="rounded-md bg-surface-card">
            <div className="p-5">
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('closing.whatHappens')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {t('closing.whatHappensNote')}
              </p>
            </div>

            <ol className="flex flex-col px-5 pb-5">
              {CLOSING_STAGES.map((stage, index) => (
                <li key={stage.id} className="flex gap-4">
                  <span className="flex flex-col items-center">
                    <span
                      className={[
                        'mt-1.5 size-3 shrink-0 rounded-full',
                        stage.tone === 'now'
                          ? 'bg-primary-700'
                          : stage.tone === 'final'
                            ? 'bg-danger-700'
                            : 'border-2 border-border-default bg-white',
                      ].join(' ')}
                    />
                    {index < CLOSING_STAGES.length - 1 ? (
                      <span className="my-1 w-px flex-1 bg-border-subtle" />
                    ) : null}
                  </span>

                  <div className={index < CLOSING_STAGES.length - 1 ? 'pb-6' : ''}>
                    <p
                      className={[
                        'text-[10px] font-semibold uppercase tracking-[0.6px]',
                        stage.tone === 'final' ? 'text-danger-700' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {t(`closing.stage.${stage.id}`, { days: REOPEN_WINDOW_DAYS })}
                    </p>
                    <p className="mt-1 text-base font-semibold leading-[1.3] text-text-primary">
                      {t(`closing.stage.${stage.id}Title`)}
                    </p>
                    <p className="mt-1.5 max-w-[620px] text-sm font-medium leading-[1.6] text-text-tertiary">
                      <Trans
                        i18nKey={`closing.stage.${stage.id}Body`}
                        values={{
                          days: REOPEN_WINDOW_DAYS,
                          date: `${shortDate(RETENTION_ENDS).split(' ').slice(1).join(' ')}`,
                        }}
                        components={{ b: <b className="font-semibold text-text-primary" /> }}
                      />
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Keep and lose */}
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t('closing.keepAndLose')}
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-sm bg-success-100/60 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#3d5648]">
                  <img src={tickIcon} alt="" className="size-4" />
                  {t('closing.youdKeep')}
                </p>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {KEEP_LIST.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <img src={tickIcon} alt="" className="mt-0.5 size-3.5 shrink-0" />
                      <span className="text-sm font-medium leading-[1.5] text-[#3d5648]">
                        {t(`closing.keep.${item}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-sm bg-danger-100 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-danger-700">
                  <img src={crossIcon} alt="" className="size-4" />
                  {t('closing.youdLose')}
                </p>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {LOSE_LIST.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <img src={crossIcon} alt="" className="mt-0.5 size-3.5 shrink-0" />
                      <span className="text-sm font-medium leading-[1.5] text-danger-700">
                        {t(`closing.lose.${item}`, {
                          count: MEMBERS.filter((member) => !member.invited).length,
                          days: REOPEN_WINDOW_DAYS,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Danger zone */}
          <section className="rounded-md border border-[#e7c7c2] bg-[#fdf4f2] p-5">
            <h3 className="flex items-center gap-2 text-lg font-semibold leading-[1.2] text-danger-700">
              <img src={warnIcon} alt="" className="size-5" />
              {t('closing.closeTheAccount')}
            </h3>
            <p className="mt-2 max-w-[680px] text-sm font-medium leading-[1.6] text-text-tertiary">
              <Trans
                i18nKey={BLOCKING_COUNT > 0 ? 'closing.closeBody' : 'closing.closeBodyClear'}
                values={{ email: COMPANY.owner.email }}
                components={{ b: <b className="font-semibold text-text-primary" /> }}
              />
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={BLOCKING_COUNT > 0}
                className="inline-flex h-[46px] items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('closing.closeCompany', { company: COMPANY.legalName })}
              </button>
              <button
                type="button"
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
              >
                {t('closing.talkFirst')}
              </button>
              <span className="text-xs font-medium text-text-quaternary">
                {t('closing.ownerOnlyRecorded')}
              </span>
            </div>
          </section>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('closing.beforeYouClose')}
            </h3>
            <p className="mt-3 flex items-start gap-2 rounded-sm bg-pending-100 px-3 py-2.5 text-xs font-medium leading-[1.6] text-pending-700">
              <img src={clockIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              <span>
                <Trans
                  i18nKey="closing.lastDownloadWas"
                  values={{ date: longDate(LAST_EXPORT_ON), months: MONTHS_SINCE_EXPORT }}
                  components={{ b: <b className="font-semibold" /> }}
                />
              </span>
            </p>
            <Link
              to="/settings/export"
              className="mt-3 inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-sm bg-primary-700 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={downloadIcon} alt="" className="size-[18px]" />
              {t('closing.takeACopy')}
            </Link>
            <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.5] text-text-quaternary">
              <img src={clockIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              {t('closing.aboutSize', { size: defaultSize })}
            </p>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('closing.whatsInTheAccount')}
            </h3>
            <dl className="mt-2">
              {ACCOUNT_FACTS.map((fact, index) => (
                <div
                  key={fact.id}
                  className={[
                    'flex items-center justify-between gap-3 py-2.5',
                    index < ACCOUNT_FACTS.length - 1 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t(`closing.fact.${fact.id}`)}
                  </dt>
                  <dd
                    className={[
                      'shrink-0 text-sm font-semibold',
                      fact.danger ? 'text-danger-700' : 'text-text-primary',
                    ].join(' ')}
                  >
                    {fact.value === 'liveSince'
                      ? shortDate(COMPANY.liveSince)
                      : fact.value === 'months'
                        ? t('closing.months', { count: MONTHS_WITH_FAWTIR })
                        : fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('closing.movingProvider')}
            </h3>
            <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-3 text-xs font-medium leading-[1.6] text-text-tertiary">
              <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              <span>
                <Trans
                  i18nKey="closing.movingNote"
                  components={{ b: <b className="font-semibold text-text-primary" /> }}
                />
              </span>
            </p>
            <button
              type="button"
              className="mt-3 inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={handoverIcon} alt="" className="size-4" />
              {t('closing.howHandoverWorks')}
            </button>
          </section>
        </aside>
      </div>
      <span className="sr-only">{BOOK.retentionYears}</span>
    </SettingsShell>
  )
}

function BlockerRow({ blocker }: { blocker: Blocker }) {
  const { t } = useTranslation()

  return (
    <li
      className={[
        'flex flex-wrap items-start gap-4 border-t border-surface-background px-5 py-4',
        blocker.blocking ? 'bg-[#fdf4f2]' : '',
      ].join(' ')}
    >
      <span
        className={[
          'flex size-9 shrink-0 items-center justify-center rounded-md',
          BLOCKER_TINT[blocker.tone],
        ].join(' ')}
      >
        <img src={BLOCKER_ICON[blocker.tone]} alt="" className="size-[18px]" />
      </span>

      <div className="min-w-[260px] flex-1">
        <p
          className={[
            'text-sm font-semibold leading-[1.3]',
            blocker.blocking ? 'text-danger-700' : 'text-text-primary',
          ].join(' ')}
        >
          {t(`closing.blocker.${blocker.id}`, blocker.values)}
        </p>
        <p className="mt-1 max-w-[620px] text-sm font-medium leading-[1.6] text-text-tertiary">
          <Trans
            i18nKey={`closing.blocker.${blocker.id}Note`}
            values={blocker.values}
            components={{ b: <RialText as="b" className="font-semibold text-text-primary" /> }}
          />
        </p>
      </div>

      {blocker.actionKey ? (
        blocker.to ? (
          <Link
            to={blocker.to}
            className="inline-flex h-[38px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t(blocker.actionKey)}
          </Link>
        ) : (
          <button
            type="button"
            className="inline-flex h-[38px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t(blocker.actionKey)}
          </button>
        )
      ) : null}
    </li>
  )
}
