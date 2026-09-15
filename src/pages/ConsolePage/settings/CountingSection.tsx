import { useTranslation } from 'react-i18next'
import { Switch } from '../../../components/ui'
import { COUNTING_RULES } from '../../../lib/platformSettings'
import type { Forms, SectionProps } from './draft'
import { FieldGrid, SelectField, SwitchRow } from './shared'

const K = 'console.settings.counting.'

/**
 * Which documents draw on the allowance. Each kind is a row, so a rule changed here reads the
 * same way it does in the defaults document: this kind counts, that one does not.
 */
export function CountingSection({ form, set }: SectionProps<'counting'>) {
  const { t } = useTranslation()

  return (
    <>
      <div className="border-t border-surface-background">
        <div className="flex items-center justify-between gap-4 bg-surface-background px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.04em] text-text-quaternary">
          <span>{t(`${K}kind`)}</span>
          <span>{t(`${K}counts`)}</span>
        </div>
        {COUNTING_RULES.map((rule) => {
          const counts = form.rules[rule]
          const label = t(`${K}rule.${rule}`)
          return (
            <div
              key={rule}
              className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-[1.3] text-text-primary">{label}</p>
                <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                  {t(`${K}ruleNote.${rule}`)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={[
                    'text-xs font-semibold max-md:hidden',
                    counts ? 'text-success-700' : 'text-text-quaternary',
                  ].join(' ')}
                >
                  {counts ? t(`${K}counts`) : t(`${K}doesNotCount`)}
                </span>
                <Switch
                  checked={counts}
                  label={label}
                  onChange={(checked) =>
                    set((current) => ({
                      ...current,
                      rules: { ...current.rules, [rule]: checked },
                    }))
                  }
                />
              </div>
            </div>
          )
        })}
      </div>
      <FieldGrid>
        <SelectField
          label={t(`${K}consumedAt`)}
          hint={t(`${K}consumedAtHint`)}
          value={form.consumedAt}
          onChange={(value) =>
            set((current) => ({
              ...current,
              consumedAt: value as Forms['counting']['consumedAt'],
            }))
          }
          options={[
            { value: 'transmission', label: t(`${K}consumed.transmission`) },
            { value: 'creation', label: t(`${K}consumed.creation`) },
          ]}
        />
      </FieldGrid>
      <SwitchRow
        title={t(`${K}pools`)}
        note={t(`${K}poolsNote`)}
        checked={form.poolsAcrossPeriod}
        onChange={(checked) => set((current) => ({ ...current, poolsAcrossPeriod: checked }))}
      />
    </>
  )
}
