import { useTranslation } from 'react-i18next'
import { FIXED_BY_DESIGN } from '../../../lib/platformSettings'
import { SettingsSectionCard } from './shared'
import lockIcon from '../../../assets/settings/menu-key.svg'

const K = 'console.settings.fixed.'

/**
 * The four positions the platform cannot be configured out of. They are legal obligations, not
 * choices: a setting would let a plan be sold that cannot meet the mandate — so this card has
 * no switches and no Save.
 */
export function FixedSection() {
  const { t } = useTranslation()
  return (
    <SettingsSectionCard title={t(`${K}title`)} note={t(`${K}note`)}>
      {FIXED_BY_DESIGN.map((item) => (
        <div
          key={item}
          className="flex items-start gap-4 border-t border-surface-background px-5 py-4"
        >
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary-50">
            <img src={lockIcon} alt="" className="size-3.5 opacity-70" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-[1.3] text-text-primary">
              {t(`${K}item.${item}`)}
            </p>
            <p className="mt-1 max-w-[640px] text-xs font-medium leading-[1.5] text-text-quaternary">
              {t(`${K}position.${item}`)}
            </p>
          </div>
        </div>
      ))}
      <p className="border-t border-border-subtle px-5 py-4 text-xs font-medium leading-[1.6] text-text-tertiary">
        {t(`${K}why`)}
      </p>
    </SettingsSectionCard>
  )
}
