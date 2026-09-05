import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { Switch, Select } from '../../components/ui'
import { MEMBERS, withoutTwoStep, withLogin } from '../../lib/settingsPeople'
import infoIcon from '../../assets/settings/info.svg'
import onIcon from '../../assets/settings/check-green.svg'
import offIcon from '../../assets/settings/cert-urgent.svg'
import neverIcon from '../../assets/settings/minus-amber.svg'
import tickIcon from '../../assets/settings/check-white.svg'

const STATE = {
  on: { icon: onIcon, tint: 'bg-success-100', labelKey: 'signingIn.on' },
  off: { icon: offIcon, tint: 'bg-danger-100', labelKey: 'signingIn.off' },
  never: { icon: neverIcon, tint: 'bg-surface-background', labelKey: 'signingIn.neverSignedIn' },
}

/**
 * Settings › Signing in.
 *
 * The Settings hub has a card for this — "two-step sign-in, session length, and the one-device
 * rule on mobile" — but the design set has no frame behind it. Rather than leave the card as a
 * dead end, the screen is built from exactly what the card promises, using the same team list
 * the rest of the People group reads. Flagged for review.
 */
export function SigningInPage() {
  const { t } = useTranslation()
  const [requireTwoStep, setRequireTwoStep] = useState(false)
  const [allowSms, setAllowSms] = useState(true)
  const [oneDevice, setOneDevice] = useState(true)
  const [browserSession, setBrowserSession] = useState('week')
  const [tillSession, setTillSession] = useState('shift')
  const [saved, setSaved] = useState(false)

  const change =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setSaved(false)
    }

  return (
    <SettingsShell group="people">
      <SettingsHeader title={t('signingIn.title')} subtitle={t('signingIn.subtitle')} />

      <p className="flex items-start gap-2.5 rounded-sm bg-pending-100 px-4 py-3.5 text-sm font-medium leading-[1.5] text-pending-700">
        <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
        {t('signingIn.note')}
      </p>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="overflow-hidden rounded-md bg-surface-card">
            <div className="p-5">
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('signingIn.twoStep')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {t('signingIn.twoStepNote')}
              </p>
            </div>

            <ul>
              <ToggleRow
                title={t('signingIn.requireEveryone')}
                note={t('signingIn.requireEveryoneNote', {
                  count: withoutTwoStep.length,
                  total: withLogin.length,
                })}
                checked={requireTwoStep}
                onChange={change(setRequireTwoStep)}
              />
              <ToggleRow
                title={t('signingIn.allowSms')}
                note={t('signingIn.allowSmsNote')}
                checked={allowSms}
                onChange={change(setAllowSms)}
              />
            </ul>
          </section>

          <section className="overflow-hidden rounded-md bg-surface-card">
            <div className="p-5">
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('signingIn.sessions')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {t('signingIn.sessionsNote')}
              </p>
            </div>
            <div className="grid gap-4 border-t border-surface-background p-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('signingIn.sessionLength')}
                </span>
                <Select
                  ariaLabel={t('signingIn.sessionLength')}
                  value={browserSession}
                  onChange={change(setBrowserSession)}
                  options={['day', 'week', 'fortnight', 'month'].map((id) => ({
                    value: id,
                    label: t(`signingIn.sessionOption.${id}`),
                  }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('signingIn.tillLength')}
                </span>
                <Select
                  ariaLabel={t('signingIn.tillLength')}
                  value={tillSession}
                  onChange={change(setTillSession)}
                  options={['shift', 'day', 'never'].map((id) => ({
                    value: id,
                    label: t(`signingIn.tillOption.${id}`),
                  }))}
                />
              </label>
            </div>
            <ul className="border-t border-surface-background">
              <ToggleRow
                title={t('signingIn.oneDevice')}
                note={t('signingIn.oneDeviceNote')}
                checked={oneDevice}
                onChange={change(setOneDevice)}
              />
            </ul>
          </section>
        </div>

        <aside className="w-full xl:w-[320px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('signingIn.whoHasIt')}
            </h3>
            <ul className="mt-2">
              {MEMBERS.map((member, index) => {
                const state = STATE[member.twoStep]
                return (
                  <li
                    key={member.id}
                    className={[
                      'flex items-center gap-3 py-3',
                      index < MEMBERS.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[10px] font-semibold text-primary-800">
                      {member.initials}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-text-primary">
                      {member.name}
                    </span>
                    <span
                      className={[
                        'flex size-6 shrink-0 items-center justify-center rounded-full',
                        state.tint,
                      ].join(' ')}
                      title={t(state.labelKey)}
                    >
                      <img src={state.icon} alt={t(state.labelKey)} className="size-3.5" />
                    </span>
                    {member.twoStep === 'off' ? (
                      <button
                        type="button"
                        className="shrink-0 text-xs font-semibold text-primary-700 transition-colors hover:text-primary-800"
                      >
                        {t('signingIn.remind')}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle bg-white px-4 py-3">
        {saved ? (
          <span className="me-auto text-sm font-medium text-[#3d5648]">{t('signingIn.saved')}</span>
        ) : null}
        <button
          type="button"
          onClick={() => setSaved(true)}
          className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={tickIcon} alt="" className="size-4" />
          {t('signingIn.save')}
        </button>
      </div>
    </SettingsShell>
  )
}

function ToggleRow({
  title,
  note,
  checked,
  onChange,
}: {
  title: string
  note: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{title}</p>
        <p className="mt-1 max-w-[560px] text-xs font-medium leading-[1.5] text-text-quaternary">
          {note}
        </p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </li>
  )
}
