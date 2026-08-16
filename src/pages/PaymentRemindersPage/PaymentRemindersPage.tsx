import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { TemplateEditorModal } from '../../components/reminders/ReminderModals'
import {
  BEFORE_SENT_RULES,
  CUSTOMER_SEES,
  RIGHT_NOW,
  SCHEDULE_STEPS,
  SENDING_SETTINGS,
  STOP_RULES,
  TONE_CHIP,
  TONE_LABEL_KEY as TONE_LABEL,
} from '../../lib/reminders'
import backIcon from '../../assets/trade-create/back.svg'
import editIcon from '../../assets/trade-create/edit-msg.svg'
import deleteIcon from '../../assets/trade-create/delete-msg.svg'
import plusIcon from '../../assets/trade-create/plus.svg'
import arrowNextIcon from '../../assets/trade-create/arrow-next.svg'
import clockIcon from '../../assets/trade-create/clock.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import tickCircleIcon from '../../assets/trade-create/tick-circle.svg'
import bellIcon from '../../assets/dashboard/bell.svg'

function SectionCard({
  step,
  title,
  hint,
  children,
}: {
  step: number
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-sm bg-surface-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
          {step}
        </span>
        <h2 className="text-xl font-medium leading-[1.2] text-[#2c3342]">{title}</h2>
        {hint ? (
          <span className="text-xs font-medium leading-[1.2] text-[#5b606c]">{hint}</span>
        ) : null}
      </div>
      <div className="mt-3 h-px w-full bg-border-subtle" />
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** A checkbox rule with its explanation underneath — used by sections 2 and 4. */
function RuleRow({
  titleKey,
  noteKey,
  defaultOn,
  boxed,
}: {
  titleKey: string
  noteKey: string
  defaultOn: boolean
  boxed?: boolean
}) {
  const { t } = useTranslation()
  const [on, setOn] = useState(defaultOn)

  return (
    <label
      className={[
        'flex cursor-pointer items-start gap-3',
        boxed
          ? [
              'rounded-sm border p-3',
              on ? 'border-[#2c4eb7] bg-[#f4f6fb]/60' : 'border-[#e8e8ea]',
            ].join(' ')
          : 'py-3',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={() => setOn((v) => !v)}
        className="mt-0.5 size-5 shrink-0 rounded-[4px] accent-[#2c4eb7]"
      />
      <span className="min-w-0">
        <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
          {t(titleKey)}
        </span>
        <span className="mt-1 block text-sm font-medium leading-[1.3] text-[#5b606c]">
          {t(noteKey)}
        </span>
      </span>
    </label>
  )
}

function SelectField({
  label,
  required,
  value,
  suffix = 'chevron',
}: {
  label: string
  required?: boolean
  value: string
  suffix?: 'chevron' | 'clock'
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-[#151c2d]">
        {label}
        {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      </span>
      <div className="flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-secondary">
          {value}
        </span>
        {suffix === 'clock' ? (
          <img src={clockIcon} alt="" className="size-6" />
        ) : (
          <img src={chevronIcon} alt="" className="size-6 rotate-90" />
        )}
      </div>
    </div>
  )
}

export function PaymentRemindersPage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(true)
  const [templateOpen, setTemplateOpen] = useState(false)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/income/reminders"
                className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
              >
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
            <img src={tickCircleIcon} alt="" className="size-5" />
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
                    {t('reminders.bannerTitle')}
                  </span>
                  <span className="mt-1 block text-sm font-medium leading-[1.2] text-[#5b606c]">
                    {t('reminders.bannerNote')}
                  </span>
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={t('reminders.bannerTitle')}
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

            <SectionCard
              step={1}
              title={t('reminders.scheduleTitle')}
              hint={t('reminders.scheduleHint')}
            >
              <div className="flex flex-col gap-3">
                {SCHEDULE_STEPS.map((step) => (
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
                              TONE_CHIP[step.tone],
                            ].join(' ')}
                          >
                            {t(TONE_LABEL[step.tone])}
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
                        onClick={() => setTemplateOpen(true)}
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
            </SectionCard>
          </div>

          <div className="flex flex-col gap-4">
            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">
                {t('reminders.customerSeesTitle')}
              </h2>
              <div className="mt-3 h-px w-full bg-border-subtle" />
              <ol className="mt-4 flex flex-col gap-4">
                {CUSTOMER_SEES.map((row) => (
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
                  {t('reminders.rightNowTitle')}
                </h2>
                <Link
                  to="/income/reminders"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#233e92]"
                >
                  {t('reminders.viewQueue')}
                  <img src={arrowNextIcon} alt="" className="size-4 rtl:rotate-180" />
                </Link>
              </div>
              <div className="mt-3 h-px w-full bg-border-subtle" />
              <dl className="mt-4 flex flex-col gap-3">
                {RIGHT_NOW.map((row) => (
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

        <SectionCard step={2} title={t('reminders.stopTitle')}>
          <div className="flex flex-col">
            {STOP_RULES.map((rule) => (
              <RuleRow
                key={rule.id}
                titleKey={rule.titleKey}
                noteKey={rule.noteKey}
                defaultOn={rule.on}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard step={3} title={t('reminders.sendingTitle')}>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label={t('reminders.sending.sendFrom')}
              required
              value={SENDING_SETTINGS.sendFrom}
            />
            <SelectField label={t('reminders.sending.replyTo')} value={SENDING_SETTINGS.replyTo} />
            <SelectField
              label={t('reminders.sending.sendAt')}
              value={SENDING_SETTINGS.sendAt}
              suffix="clock"
            />
            <SelectField
              label={t('reminders.sending.attachPdf')}
              value={SENDING_SETTINGS.attachPdf}
            />
          </div>
        </SectionCard>

        {/* Figma numbers this "3" as well — kept as 4 so the sequence reads correctly. */}
        <SectionCard step={4} title={t('reminders.beforeTitle')}>
          <div className="flex flex-col gap-3">
            {BEFORE_SENT_RULES.map((rule) => (
              <RuleRow
                key={rule.id}
                titleKey={rule.titleKey}
                noteKey={rule.noteKey}
                defaultOn={rule.on}
                boxed
              />
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="fixed bottom-0 end-0 start-0 z-30 border-t border-border-subtle bg-white px-4 py-3 md:start-[248px]">
        <div className="mx-auto flex max-w-[1144px] flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-[#e8e8ea] bg-white px-6 text-base font-medium text-[#3a3a3a]"
          >
            {t('reminders.sendMyselfTest')}
          </button>
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm bg-[#2c4eb7] px-6 text-base font-semibold text-white"
          >
            {t('reminders.saveChanges')}
          </button>
        </div>
      </div>

      <TemplateEditorModal open={templateOpen} onClose={() => setTemplateOpen(false)} />
    </AppShell>
  )
}
