import { useTranslation } from 'react-i18next'
import { Checkbox } from '../../../components/ui'
import { CATALOGUE, type PlanId } from '../../../lib/plans'
import type { Forms, SectionProps } from './draft'
import {
  DayListField,
  FieldGrid,
  GroupLabel,
  NumberField,
  OptionGroup,
  SelectField,
  SwitchRow,
} from './shared'

const K = 'console.settings.lifecycle.'

export function LifecycleSection({ form, set, errors }: SectionProps<'lifecycle'>) {
  const { t } = useTranslation()
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined)
  const planOptions = CATALOGUE.map((plan) => ({ value: plan.id, label: t(plan.labelKey) }))
  const number =
    (field: 'trialDays' | 'trialDocuments' | 'graceDays') =>
    (value: string) =>
      set((current) => ({ ...current, [field]: value }))
  const flag =
    (field: 'trialAutoConverts' | 'trialNeedsPaymentDetails' | 'autoRenewal') =>
    (checked: boolean) =>
      set((current) => ({ ...current, [field]: checked }))
  /** Kept in catalogue order so the saved list reads Starter · Business · Business Plus. */
  const offerOn = (plan: PlanId, checked: boolean) =>
    set((current) => ({
      ...current,
      trialOfferedOn: CATALOGUE.map((entry) => entry.id).filter((id) =>
        id === plan ? checked : current.trialOfferedOn.includes(id),
      ),
    }))

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
        <OptionGroup
          label={t(`${K}trialOfferedOn`)}
          hint={t(`${K}trialOfferedOnHint`)}
          error={err('trialOfferedOn')}
        >
          {CATALOGUE.map((plan) => (
            <Checkbox
              key={plan.id}
              label={t(plan.labelKey)}
              checked={form.trialOfferedOn.includes(plan.id)}
              onChange={(event) => offerOn(plan.id, event.target.checked)}
            />
          ))}
          {/* Enterprise starts from a contract: shown so the row is complete, never switchable. */}
          <Checkbox
            label={t('plan.planName.enterprise')}
            checked={false}
            disabled
            readOnly
            className="cursor-not-allowed opacity-50"
          />
        </OptionGroup>
        <NumberField
          name="trialDays"
          label={t(`${K}trialDays`)}
          value={form.trialDays}
          onChange={number('trialDays')}
          error={err('trialDays')}
        />
        <NumberField
          name="trialDocuments"
          label={t(`${K}trialDocuments`)}
          hint={t(`${K}trialDocumentsHint`)}
          value={form.trialDocuments}
          onChange={number('trialDocuments')}
          error={err('trialDocuments')}
        />
      </FieldGrid>
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
      <FieldGrid>
        <NumberField
          name="graceDays"
          label={t(`${K}graceDays`)}
          hint={t(`${K}graceDaysHint`)}
          value={form.graceDays}
          onChange={number('graceDays')}
          error={err('graceDays')}
        />
        <DayListField
          label={t(`${K}graceNotices`)}
          hint={t(`${K}graceNoticesHint`)}
          values={form.graceNoticeDays}
          onChange={(values) => set((current) => ({ ...current, graceNoticeDays: values }))}
          format={(day) => t('console.settings.dayList.day', { day })}
          error={err('graceNoticeDays')}
        />
      </FieldGrid>
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
