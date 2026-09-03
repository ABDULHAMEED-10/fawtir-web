import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { CONNECTION_CHECKS } from '../../lib/activity'
import shieldIcon from '../../assets/activity/connected-shield.svg'
import checkIcon from '../../assets/activity/check-filled.svg'
import emptyIcon from '../../assets/activity/empty.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'

/**
 * Activity before the first invoice (Figma 131:16292).
 *
 * The screen's real job here is reassurance: the connection to the Authority is already working,
 * so nothing is missing except a document to report. That is why the readiness banner stays and
 * only the table is replaced.
 */
export function ActivityEmptyState() {
  const { t } = useTranslation()

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[720px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('activity.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('activity.subtitle')}
            </p>
          </div>
          <Link
            to="/compliance/activity/call-log"
            className="inline-flex h-[46px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('activity.callLog')}
          </Link>
        </div>

        {/* Readiness */}
        <section className="rounded-md border border-[#cfe0d5] bg-[#eef5f0] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-3 text-base font-medium leading-[1.2] text-[#2f4438]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-white">
                <img src={shieldIcon} alt="" className="size-5" />
              </span>
              {t('activity.ready.headline')}
            </p>
            <button
              type="button"
              className="inline-flex h-[38px] shrink-0 items-center rounded-sm bg-[#4c6c5a] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#3d5648]"
            >
              {t('activity.ready.testConnection')}
            </button>
          </div>

          <div className="mt-4 grid gap-4 border-t border-[#cfe0d5] pt-4 md:grid-cols-3">
            {CONNECTION_CHECKS.map((check) => (
              <div key={check.id} className="flex items-start gap-2.5">
                <img src={checkIcon} alt="" className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                    {t(`activity.ready.${check.id}`)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] leading-[1.5] text-text-tertiary">
                    {t(`activity.ready.${check.id}Note`, check.values)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-[620px] flex-col items-center justify-center rounded-md bg-surface-card px-6 py-20 text-center">
          <img src={emptyIcon} alt="" className="h-auto w-[190px]" />
          <h2 className="mt-9 text-2xl font-medium leading-[1.2] text-text-primary">
            {t('activity.emptyState.title')}
          </h2>
          <p className="mt-3 max-w-[620px] text-sm font-medium leading-[1.6] text-text-quaternary">
            {t('activity.emptyState.body')}
          </p>
          <Link
            to="/invoices/new"
            className="mt-7 inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
            {t('activity.emptyState.action')}
          </Link>
        </section>
      </div>
    </AppShell>
  )
}
