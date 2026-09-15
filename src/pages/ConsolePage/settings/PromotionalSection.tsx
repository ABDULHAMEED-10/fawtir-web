import { useTranslation } from 'react-i18next'
import type { SectionProps } from './draft'
import { NoteLine, SwitchRow } from './shared'

const K = 'console.settings.promotional.'

const FLAGS = ['discountCodes', 'referralCommission', 'introductoryPricing'] as const

/** All off at launch; the switches are here so the rules exist before the first campaign does. */
export function PromotionalSection({ form, set }: SectionProps<'promotional'>) {
  const { t } = useTranslation()
  return (
    <>
      {FLAGS.map((flag) => (
        <SwitchRow
          key={flag}
          title={t(`${K}${flag}`)}
          note={t(`${K}${flag}Note`)}
          checked={form[flag]}
          onChange={(checked) => set((current) => ({ ...current, [flag]: checked }))}
        />
      ))}
      <NoteLine>{t(`${K}noneAtLaunch`)}</NoteLine>
    </>
  )
}
