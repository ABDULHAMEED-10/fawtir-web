import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { Input, Switch, Select } from '../../components/ui'
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_TEMPLATES,
  LIMIT_CHOICES,
  templateGrants,
  MEMBERS,
  SEATS,
  type RoleId,
} from '../../lib/settingsPeople'
import tickIcon from '../../assets/settings/check-green.svg'
import circleIcon from '../../assets/settings/minus-amber.svg'
import lockIcon from '../../assets/settings/menu-key.svg'
import tickWhiteIcon from '../../assets/settings/check-white.svg'
import managerIcon from '../../assets/settings/menu-people.svg'
import accountantIcon from '../../assets/settings/menu-invoice.svg'
import tillIcon from '../../assets/settings/menu-device.svg'
import nothingIcon from '../../assets/settings/cross-muted.svg'

const TEMPLATE_ICON: Record<string, string> = {
  till: tillIcon,
  manager: managerIcon,
  accountant: accountantIcon,
  nothing: nothingIcon,
}

/**
 * Settings › Make a role (Figma 135:40069).
 *
 * Sixteen switches with a running count. Everything on the right — the chip summary, the
 * sanity checks, the footer — is derived from those switches, so the screen describes the role
 * being built rather than a fixed example.
 */
export function MakeRolePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [template, setTemplate] = useState<RoleId | 'nothing'>('till')
  const [name, setName] = useState('Delivery driver')
  const [purpose, setPurpose] = useState('Drops orders and takes payment on the doorstep')
  const [grants, setGrants] = useState<Record<string, boolean>>(() => templateGrants('till'))
  const [limits, setLimits] = useState<Record<string, string>>({})

  const pickTemplate = (id: RoleId | 'nothing') => {
    setTemplate(id)
    setGrants(templateGrants(id))
    setLimits({})
  }

  const toggle = (id: string) => {
    const permission = PERMISSIONS.find((entry) => entry.id === id)!
    if (permission.ownerOnly) return
    setGrants((current) => ({ ...current, [id]: !current[id] }))
  }

  const on = useMemo(() => Object.values(grants).filter(Boolean).length, [grants])

  const groupCount = (group: string) => {
    const inGroup = PERMISSIONS.filter((permission) => permission.group === group)
    return {
      on: inGroup.filter((permission) => grants[permission.id]).length,
      total: inGroup.length,
    }
  }

  const named = name.trim().length > 0 && purpose.trim().length > 0
  const reachesBilling = PERMISSIONS.some(
    (permission) => permission.ownerOnly && grants[permission.id],
  )
  /** Approving supplier bills without being able to see the figures is odd, though not wrong. */
  const billsWithoutFigures = Boolean(grants.handleBills) && !grants.seeEarnings
  /** Till work needs a branch; without one the switch would do nothing. */
  const tillWithoutBranch = Boolean(grants.takePayment) && template === 'nothing'

  const placesFree = Math.max(0, SEATS.included - MEMBERS.length)

  return (
    <SettingsShell group="people">
      <SettingsHeader
        title={t('makeRole.title')}
        subtitle={t('makeRole.subtitle')}
        actions={
          <Link
            to="/settings/roles"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('makeRole.cancel')}
          </Link>
        }
      />

      {/* Start from */}
      <section className="rounded-md bg-surface-card p-5">
        <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
          {t('makeRole.startFrom')}
        </h3>
        <p className="mt-0.5 text-xs font-medium text-text-quaternary">
          {t('makeRole.startFromNote')}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ROLE_TEMPLATES.map((entry) => {
            const picked = entry.id === template
            const count = Object.values(templateGrants(entry.id)).filter(Boolean).length
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => pickTemplate(entry.id)}
                aria-pressed={picked}
                className={[
                  'flex flex-col rounded-sm border p-4 text-start transition-colors',
                  picked
                    ? 'border-primary-700 bg-primary-25'
                    : 'border-border-subtle bg-white hover:bg-primary-25',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex size-8 items-center justify-center rounded-md',
                    picked ? 'bg-primary-700' : 'bg-surface-background',
                  ].join(' ')}
                >
                  <img
                    src={TEMPLATE_ICON[entry.id]}
                    alt=""
                    className={picked ? 'size-4 brightness-0 invert' : 'size-4'}
                  />
                </span>
                <span className="mt-2.5 text-sm font-semibold text-text-primary">
                  {t(`makeRole.template.${entry.id}`)}
                </span>
                <span className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t(`makeRole.template.${entry.id}Note`)}
                </span>
                <span className="mt-2 text-xs font-medium text-text-quaternary">
                  {t('makeRole.onOf', { on: count, total: PERMISSIONS.length })}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            bordered
            label={t('makeRole.nameThisRole')}
            requiredMark
            hint={t('makeRole.nameHint')}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            bordered
            label={t('makeRole.whatItsFor')}
            hint={t('makeRole.whatItsForHint')}
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
          />
        </div>
      </section>

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* Switches */}
        <section className="min-w-0 flex-1 overflow-hidden rounded-md bg-surface-card">
          <div className="flex flex-wrap items-start justify-between gap-3 p-5">
            <div>
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('makeRole.whatTheyCanDo')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {template === 'nothing'
                  ? t('makeRole.fromScratch', { on, total: PERMISSIONS.length })
                  : t('makeRole.changedFrom', {
                      on,
                      total: PERMISSIONS.length,
                      template: t(`makeRole.template.${template}`),
                    })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => pickTemplate(template)}
              className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
            >
              {t('makeRole.resetTo', { template: t(`makeRole.template.${template}`) })}
            </button>
          </div>

          {PERMISSION_GROUPS.map((group) => {
            const inGroup = PERMISSIONS.filter((permission) => permission.group === group)
            const counts = groupCount(group)
            const ownerOnly = inGroup.every((permission) => permission.ownerOnly)
            return (
              <div key={group}>
                <p className="flex flex-wrap items-center justify-between gap-3 border-y border-surface-background bg-primary-25 px-5 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.6px] text-primary-800">
                    {t(`roles.group.${group}`)}
                  </span>
                  {ownerOnly ? (
                    <span className="text-xs font-medium text-text-quaternary">
                      {t('makeRole.ownerOnly')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-3">
                      <span className="text-xs font-medium text-text-quaternary">
                        {t('makeRole.groupCount', { on: counts.on, total: counts.total })}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setGrants((current) => {
                            const next = { ...current }
                            const turnOn = counts.on < counts.total
                            for (const permission of inGroup) next[permission.id] = turnOn
                            return next
                          })
                        }
                        className="text-xs font-semibold text-primary-700 transition-colors hover:text-primary-800"
                      >
                        {counts.on < counts.total
                          ? t('makeRole.turnAllOn')
                          : t('makeRole.turnAllOff')}
                      </button>
                    </span>
                  )}
                </p>

                <ul>
                  {inGroup.map((permission) => {
                    const isOn = Boolean(grants[permission.id])
                    const choices = LIMIT_CHOICES[permission.id]
                    const blocked = permission.ownerOnly
                    const tillNote = permission.id === 'takePayment' && tillWithoutBranch
                    return (
                      <li
                        key={permission.id}
                        className={[
                          'flex items-center gap-4 border-b border-surface-background px-5 py-3.5 last:border-0',
                          blocked ? 'opacity-50' : '',
                        ].join(' ')}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-[1.3] text-text-primary">
                            {t(`roles.perm.${permission.id}`)}
                          </p>
                          <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                            {t(`roles.perm.${permission.id}Note`)}
                          </p>
                          {tillNote ? (
                            <p className="mt-1 text-xs font-medium text-pending-700">
                              {t('makeRole.offBecauseNoBranch')}
                            </p>
                          ) : null}
                        </div>

                        {isOn && choices ? (
                          <span className="w-[150px] shrink-0">
                            <Select
                              compact
                              ariaLabel={t(`roles.perm.${permission.id}`)}
                              value={limits[permission.id] ?? choices[0]}
                              onChange={(value) =>
                                setLimits((current) => ({ ...current, [permission.id]: value }))
                              }
                              options={choices.map((key) => ({ value: key, label: t(key) }))}
                            />
                          </span>
                        ) : null}

                        <Switch
                          checked={isOn}
                          disabled={blocked}
                          onChange={() => toggle(permission.id)}
                          label={t(`roles.perm.${permission.id}`)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}

          <p className="flex items-start gap-2 border-t border-surface-background bg-surface-background/50 px-5 py-4 text-xs font-medium leading-[1.6] text-text-tertiary">
            <img src={lockIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-60" />
            <span>
              <Trans
                i18nKey="makeRole.ownerOnlyNote"
                components={{ b: <b className="font-semibold text-text-primary" /> }}
              />
            </span>
          </p>
        </section>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('makeRole.howItReads')}
            </h3>
            {on === 0 ? (
              <p className="mt-3 text-sm font-medium text-text-quaternary">
                {t('makeRole.nothingOnYet')}
              </p>
            ) : (
              <span className="mt-3 flex flex-wrap gap-2">
                {PERMISSIONS.filter((permission) => grants[permission.id]).map((permission) => (
                  <span
                    key={permission.id}
                    className="inline-flex h-[24px] items-center rounded-[3px] bg-success-100 px-2 text-[11px] font-medium text-[#3d5648]"
                  >
                    {t(`roles.perm.${permission.id}`)}
                  </span>
                ))}
              </span>
            )}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('makeRole.worthThinking')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Check
                done={named}
                label={named ? t('makeRole.think.named') : t('makeRole.think.unnamed')}
              />
              <Check
                done={!reachesBilling}
                label={
                  reachesBilling ? t('makeRole.think.hasBilling') : t('makeRole.think.noBilling')
                }
              />
              {billsWithoutFigures ? (
                <Check done={false} label={t('makeRole.think.billsNoFigures')} />
              ) : null}
              <Check done={false} label={t('makeRole.think.nobodyHasIt')} muted />
            </ul>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('makeRole.giveItToSomeone')}
            </h3>
            <dl className="mt-2">
              <Row label={t('makeRole.rightNow')} value={t('makeRole.nobody')} />
              <Row
                label={t('makeRole.placesLeft')}
                value={
                  placesFree === 0
                    ? t('makeRole.noneFree')
                    : t('makeRole.placesFree', { count: placesFree })
                }
                last
              />
            </dl>
            <Link
              to="/settings/team"
              className="mt-3 inline-flex h-[42px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('makeRole.changeSomeone')}
            </Link>
          </section>
        </aside>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {named
            ? t('makeRole.footer', { name, on, total: PERMISSIONS.length })
            : t('makeRole.footerUnnamed')}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/settings/roles"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('makeRole.cancel')}
          </Link>
          <button
            type="button"
            disabled={!named}
            onClick={() => navigate('/settings/roles')}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {t('makeRole.make')}
          </button>
        </div>
      </div>
    </SettingsShell>
  )
}

function Check({ done, label, muted }: { done: boolean; label: string; muted?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <img src={done ? tickIcon : circleIcon} alt="" className="mt-0.5 size-4 shrink-0" />
      <span
        className={[
          'text-sm font-medium leading-[1.4]',
          done && !muted ? 'text-text-secondary' : 'text-text-quaternary',
        ].join(' ')}
      >
        {label}
      </span>
    </li>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  )
}
