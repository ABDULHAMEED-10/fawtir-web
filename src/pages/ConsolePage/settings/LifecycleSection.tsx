import { useTranslation } from 'react-i18next'
import { CATALOGUE } from '../../../lib/plans'
import type { Forms, SectionProps } from './draft'
import { FieldGrid, GroupLabel, NoteLine, SelectField, SwitchRow } from './shared'

const K = 'console.settings.lifecycle.'

export function LifecycleSection({ form, set }: SectionProps<'lifecycle'>) {
  const { t } = useTranslation()
  const planOptions = CATALOGUE.map((plan) => ({ value: plan.id, label: t(plan.labelKey) }))
  const flag =
    (field: 'trialAutoConverts' | 'trialNeedsPaymentDetails' | 'autoRenewal') =>
    (checked: boolean) =>
      set((current) => ({ ...current, [field]: checked }))
  return (
    <>
      <GroupLabel>{t(`${K}trialGroup`)}</GroupLabel>
      <FieldGrid>
        <SelectField
          label={t(`${K}defaultPlan`)}
          hint={t(`${K}defaultPlanHint`)}
          value={form.defaultForNewTenant}
          onChange={(value) =>
            set((current) => ({
              ...current,
              defaultForNewTenant: value as Forms['lifecycle']['defaultForNewTenant'],
            }))
          }
          options={[{ value: 'trial', label: t(`${K}theTrial`) }, ...planOptions]}
        />
        <SelectField
          label={t(`${K}trialPlan`)}
          hint={t(`${K}trialPlanHint`)}
          value={form.trialPlan}
          onChange={(value) =>
            set((current) => ({
              ...current,
              trialPlan: value as Forms['lifecycle']['trialPlan'],
            }))
          }
          options={[{ value: 'chosen', label: t(`${K}trialPlanChosen`) }, ...planOptions]}
        />
      </FieldGrid>
      {/* Which plans offer the trial and its documents are set per plan; it always runs 14 days
          (TR-1). The copies here never saved and were removed (owner, 24 Oct 2026). */}
      <NoteLine>{t(`${K}trialMovedNote`)}</NoteLine>
      <SwitchRow
        title={t(`${K}trialAutoConverts`)}
        note={t(`${K}trialAutoConvertsNote`)}
        checked={form.trialAutoConverts}
        onChange={flag('trialAutoConverts')}
      />
      <SwitchRow
        title={t(`${K}trialNeedsPaymentDetails`)}
        note={t(`${K}trialNeedsPaymentDetailsNote`)}
        checked={form.trialNeedsPaymentDetails}
        onChange={flag('trialNeedsPaymentDetails')}
      />

      <GroupLabel>{t(`${K}renewalGroup`)}</GroupLabel>
      <SwitchRow
        title={t(`${K}autoRenewal`)}
        note={t(`${K}autoRenewalNote`)}
        checked={form.autoRenewal}
        onChange={flag('autoRenewal')}
      />
      {/* Grace days and the grace reminders are set on Billing rules (owner, 24 Oct 2026). */}
      <NoteLine>{t(`${K}graceMovedNote`)}</NoteLine>
      {/*
        No notice period and no mid-period refund switch: a cancellation always runs to the end
        of the current period, unused days are never refunded, and only a period paid ahead that
        has not started is (Business Rules CA-1, CA-2).
      */}

      <GroupLabel>{t(`${K}changesGroup`)}</GroupLabel>
      <FieldGrid>
        <SelectField
          label={t(`${K}upgrade`)}
          value={form.upgrade}
          onChange={(value) =>
            set((current) => ({ ...current, upgrade: value as Forms['lifecycle']['upgrade'] }))
          }
          options={[
            { value: 'immediateProRata', label: t(`${K}upgradeOption.immediateProRata`) },
            { value: 'periodEnd', label: t(`${K}upgradeOption.periodEnd`) },
          ]}
        />
        <SelectField
          label={t(`${K}downgrade`)}
          value={form.downgrade}
          onChange={(value) =>
            set((current) => ({ ...current, downgrade: value as Forms['lifecycle']['downgrade'] }))
          }
          options={[
            { value: 'periodEnd', label: t(`${K}downgradeOption.periodEnd`) },
            { value: 'immediate', label: t(`${K}downgradeOption.immediate`) },
          ]}
        />
        <SelectField
          label={t(`${K}whileSuspended`)}
          hint={t(`${K}whileSuspendedHint`)}
          value={form.whileSuspended}
          onChange={(value) =>
            set((current) => ({
              ...current,
              whileSuspended: value as Forms['lifecycle']['whileSuspended'],
            }))
          }
          options={[
            { value: 'readOnly', label: t(`${K}suspendedOption.readOnly`) },
            { value: 'locked', label: t(`${K}suspendedOption.locked`) },
          ]}
        />
      </FieldGrid>
    </>
  )
}
