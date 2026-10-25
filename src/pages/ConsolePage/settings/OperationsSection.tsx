import { useTranslation } from 'react-i18next'
import type { SectionProps } from './draft'
import { NoteLine, SwitchRow } from './shared'

const K = 'console.settings.operations.'

// A temporary quota grant is given from the company's own page in Tenants, against the platform
// API; the switch here never saved (owner, 24 Oct 2026).
const FLAGS = ['overageWaiver', 'grandfathering'] as const

/** What an operator may do for one tenant — each action lands on the tenant's record with a reason. */
export function OperationsSection({ form, set }: SectionProps<'operations'>) {
  const { t } = useTranslation()
  return (
    <>
      <NoteLine>{t(`${K}grantMovedNote`)}</NoteLine>
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
