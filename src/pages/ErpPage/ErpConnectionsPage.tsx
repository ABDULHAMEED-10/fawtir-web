import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { Rial, withRial } from '../../components/ui'
import { PRIMARY_BUTTON, TEXT_BUTTON } from './overview/idiom'
import { usePlatformSettings } from '../../lib/platformSettings'
import { SOURCE_SYSTEMS, type SourceSystem } from '../../lib/erpMapping'
import connectIcon from '../../assets/settings/tile-connect.svg'
import tickIcon from '../../assets/settings/check-green.svg'
import infoIcon from '../../assets/settings/info.svg'

/** The systems the connector ships adapters for today; the rest are on the way. */
const AVAILABLE: SourceSystem[] = ['ODOO', 'ERPNEXT']
const STEPS = ['collect', 'map', 'writeBack'] as const

/**
 * Settings › Integration › Connected systems (docs/erp-and-console-plan.md §3).
 *
 * The add-on is not active, so the list of connections is the add-on card alone: what automatic
 * extraction does, what it costs (from the console's platform settings, never typed here), which
 * systems it speaks to, and one button that asks the Fawtir team to switch it on. Field mapping
 * itself is part of every plan and lives one screen over.
 */
export function ErpConnectionsPage() {
  const { t } = useTranslation()
  const { settings } = usePlatformSettings()
  const addon = settings.addons.erpExtraction
  const [requested, setRequested] = useState(false)

  return (
    <SettingsShell group="integration">
      <SettingsHeader title={t('erp.connections.title')} subtitle={t('erp.connections.subtitle')} />

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-start gap-4 p-5">
          <span className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-primary-50">
            <img src={connectIcon} alt="" className="size-6" />
          </span>
          <div className="min-w-[240px] flex-1">
            <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t('erp.connections.card.title')}
            </h3>
            <p className="mt-1 max-w-[680px] text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('erp.connections.card.body')}
            </p>
          </div>
        </div>

        {/* What it does, in three steps */}
        <ol className="grid border-t border-surface-background md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="flex gap-3 border-b border-surface-background px-5 py-4 md:border-b-0 md:border-e md:last:border-e-0"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-background text-xs font-semibold text-text-secondary">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-primary">
                  {t(`erp.connections.steps.${step}.title`)}
                </span>
                <span className="mt-0.5 block text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t(`erp.connections.steps.${step}.body`)}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {/* The price, from the console */}
        <div className="grid border-t border-surface-background lg:grid-cols-[1fr_320px]">
          <div className="p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('erp.connections.price.title')}
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[32px] font-semibold leading-[1.1] text-text-primary">
                <Rial />
              </span>
              <span className="text-[32px] font-semibold leading-[1.1] text-text-primary tabular-nums">
                {addon.monthly.toFixed(3)}
              </span>
              <span className="text-sm font-medium text-text-quaternary">
                {t('erp.connections.price.perMonth')}
              </span>
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              <li className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {t('erp.connections.price.documents', {
                    count: addon.documents,
                    formatted: addon.documents.toLocaleString('en-US'),
                  })}
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {withRial(
                    t('erp.connections.price.overage', { amount: addon.overage.toFixed(3) }),
                  )}
                </span>
              </li>
              {addon.includedAt === 'enterprise' ? (
                <li className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                  <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                  <span>{t('erp.connections.price.enterprise')}</span>
                </li>
              ) : null}
            </ul>

            <div className="mt-5">
              {requested ? (
                <p className="flex items-start gap-2 rounded-sm bg-success-100 px-3 py-2.5 text-sm font-medium leading-[1.6] text-[#3d5648]">
                  <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                  <span>{t('erp.connections.activate.requested')}</span>
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRequested(true)}
                    className={PRIMARY_BUTTON}
                  >
                    {t('erp.connections.activate.button')}
                  </button>
                  <span className="text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('erp.connections.activate.note')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Supported systems */}
          <div className="border-t border-surface-background p-5 lg:border-s lg:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('erp.connections.systems.title')}
            </p>
            <ul className="mt-3 flex flex-col">
              {SOURCE_SYSTEMS.filter((system) => system !== 'CUSTOM').map((system, index, all) => {
                const available = AVAILABLE.includes(system)
                return (
                  <li
                    key={system}
                    className={[
                      'flex items-center justify-between gap-3 py-2.5',
                      index < all.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'text-sm font-semibold',
                        available ? 'text-text-primary' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {t(`erp.sourceSystem.${system}`)}
                    </span>
                    <span
                      className={[
                        'inline-flex h-[24px] items-center gap-1.5 rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
                        available
                          ? 'bg-success-100 text-[#3d5648]'
                          : 'bg-surface-background text-text-tertiary',
                      ].join(' ')}
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      {available
                        ? t('erp.connections.systems.available')
                        : t('erp.connections.systems.coming')}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* Mapping is included */}
        <div className="flex flex-wrap items-center gap-3 border-t border-surface-background bg-surface-background/60 px-5 py-4">
          <img src={infoIcon} alt="" className="size-4 shrink-0" />
          <p className="min-w-0 flex-1 text-sm font-medium leading-[1.5] text-text-secondary">
            {t('erp.connections.mapping.note')}
          </p>
          <Link to="/settings/erp-mapping" className={TEXT_BUTTON}>
            {t('erp.connections.mapping.link')}
          </Link>
        </div>
      </section>
    </SettingsShell>
  )
}
