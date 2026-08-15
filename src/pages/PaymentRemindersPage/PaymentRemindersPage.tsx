import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { PAYMENT_REMINDERS, type ReminderStep } from '../../lib/tradeCreate'
import backIcon from '../../assets/trade-create/back.svg'
import editIcon from '../../assets/trade-create/edit-msg.svg'
import deleteIcon from '../../assets/trade-create/delete-msg.svg'
import plusIcon from '../../assets/trade-create/plus.svg'
import arrowNextIcon from '../../assets/trade-create/arrow-next.svg'
import bellIcon from '../../assets/dashboard/bell.svg'

/** The tone chip escalates with the step — polite, then direct, then firm. */
const TONE_STYLES: Record<ReminderStep['tone'], string> = {
  polite: 'bg-[#eaedf8] text-[#2c4eb7]',
  direct: 'bg-[#f7f1e6] text-[#6d5a39]',
  firm: 'bg-[#fff0f0] text-[#98140b]',
}

export function PaymentRemindersPage() {
  const { t } = useTranslation()
  const doc = PAYMENT_REMINDERS
  const [enabled, setEnabled] = useState(doc.enabled)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/dashboard" className="text-2xl font-medium leading-[1.2] text-[#5b606c]">
                {t('reminders.breadcrumb')}
              </Link>
              <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
              <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">
                {t('reminders.title')}
              </h1>
            </div>
            <p className="mt-1 max-w-[520px] text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('reminders.subtitle')}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5b606c]">
            {t('tradeCreate.savedJustNow')}
          </span>
        </div>

        {/* Schedule (left) | what the customer sees + live counts (right) */}
        <div className="grid items-start gap-4 xl:grid-cols-[1fr_332px]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#d5dcf1] bg-[#f4f6fb]/60 p-4">
              <span className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
                  <img src={bellIcon} alt="" className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
                    {t(doc.bannerTitleKey)}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-[1.2] text-[#5b606c]">
                    {t(doc.bannerNoteKey)}
                  </span>
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={t(doc.bannerTitleKey)}
                onClick={() => setEnabled((v) => !v)}
                className={[
                  'relative h-[23px] w-[42px] shrink-0 rounded-full transition-colors',
                  enabled ? 'bg-[#2c4eb7]' : 'bg-[#d0d2d5]',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute top-[2.5px] size-[18px] rounded-full bg-white transition-all',
                    enabled ? 'start-[21px]' : 'start-[2.5px]',
                  ].join(' ')}
                />
              </button>
            </div>

            <section className="rounded-sm bg-surface-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
                  1
                </span>
                <h2 className="text-xl font-medium leading-[1.2] text-[#2c3342]">
                  {t(doc.scheduleTitleKey)}
                </h2>
                <span className="text-xs font-medium leading-[1.2] text-[#5b606c]">
                  {t(doc.scheduleHintKey)}
                </span>
              </div>
              <div className="mt-3 h-px w-full bg-border-subtle" />

              <div className="mt-4 flex flex-col gap-3">
                {doc.steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#e8e8ea] p-3"
                  >
                    <span className="flex min-w-0 items-center gap-4">
                      <span className="flex size-[62px] shrink-0 flex-col items-center justify-center rounded-sm bg-[#f4f6fb]">
                        <span className="text-xl font-semibold leading-[1.2] text-[#2c3342]">
                          {step.days}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-[0.04em] text-[#5b606c]">
                          {t('reminders.daysLate')}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-medium leading-[1.2] text-[#151c2d]">
                            {t(step.titleKey)}
                          </span>
                          <span
                            className={[
                              'inline-flex items-center rounded-full px-2.5 py-[3px] text-xs font-semibold',
                              TONE_STYLES[step.tone],
                            ].join(' ')}
                          >
                            {t(step.toneKey)}
                          </span>
                        </span>
                        <span className="mt-1.5 block text-sm font-medium leading-[1.2] text-[#444957]">
                          {t(step.subjectKey)}
                        </span>
                        <span className="mt-1 block text-xs font-medium leading-[1.2] text-[#737781]">
                          {t(step.metaKey)}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#444957]"
                      >
                        <img src={editIcon} alt="" className="size-4" />
                        {t('reminders.editMessage')}
                      </button>
                      <button
                        type="button"
                        aria-label={t('reminders.deleteStep')}
                        className="flex size-9 items-center justify-center rounded-sm border border-[#e8e8ea] bg-white"
                      >
                        <img src={deleteIcon} alt="" className="size-4" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-[#b6c2e4] py-3 text-base font-semibold text-[#2c4eb7]"
              >
                <img src={plusIcon} alt="" className="size-5" />
                {t('reminders.addStep')}
              </button>
            </section>
          </div>

          <div className="flex flex-col gap-4">
            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">
                {t(doc.customerSees.titleKey)}
              </h2>
              <div className="mt-3 h-px w-full bg-border-subtle" />
              <ol className="mt-4 flex flex-col gap-4">
                {doc.customerSees.rows.map((row) => (
                  <li key={row.n} className="flex items-start gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f3f3f3] text-xs font-semibold text-[#5b606c]">
                      {row.n}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-[1.2] text-[#151c2d]">
                        {t(row.titleKey)}
                      </span>
                      <span className="mt-1 block text-xs font-medium leading-[1.3] text-[#5b606c]">
                        {t(row.noteKey)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-sm bg-surface-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">
                  {t(doc.rightNow.titleKey)}
                </h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#233e92]"
                >
                  {t(doc.rightNow.linkKey)}
                  <img src={arrowNextIcon} alt="" className="size-4 rtl:rotate-180" />
                </button>
              </div>
              <div className="mt-3 h-px w-full bg-border-subtle" />
              <dl className="mt-4 flex flex-col gap-3">
                {doc.rightNow.rows.map((row) => (
                  <div key={row.labelKey} className="flex items-center justify-between gap-3">
                    <dt className="text-sm font-medium leading-[1.2] text-[#5b606c]">
                      {t(row.labelKey)}
                    </dt>
                    <dd className="text-sm font-semibold leading-[1.2] text-[#2c3342]">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
