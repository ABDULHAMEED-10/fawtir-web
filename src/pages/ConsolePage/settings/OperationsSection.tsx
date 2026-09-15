import { useTranslation } from 'react-i18next'
import type { SectionProps } from './draft'
import { NoteLine, SwitchRow } from './shared'

const K = 'console.settings.operations.'

const FLAGS = ['temporaryQuotaGrant', 'overageWaiver', 'grandfathering'] as const

/** What an operator may do for one tenant — each action lands on the tenant's record with a reason. */
export function OperationsSection({ form, set }: SectionProps<'operations'>) {
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
      <NoteLine>{t(`${K}recordedNote`)}</NoteLine>
    </>
  )
}
