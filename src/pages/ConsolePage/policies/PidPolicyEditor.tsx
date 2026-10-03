import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Button, DateField, Input, Modal, Select } from '../../../components/ui'
import { localeFor } from '../../../lib/console/format'
import {
  EMPTY_PID_FORM,
  NORMALIZATIONS,
  PID_FIELD_ORDER,
  PID_POLICY_TYPE,
  VATIN_RELATIONSHIPS,
  createDraft,
  describeDraftFailure,
  pidFormFromDraft,
  pidFormFromVersion,
  pidFormToDraft,
  updateDraft,
  validatePidForm,
  type BlockerVersionView,
  type Normalization,
  type PidPolicyErrors,
  type PidPolicyField,
  type PidPolicyForm,
  type PolicyFailure,
  type VatinRelationship,
  type YesNo,
} from '../../../lib/console/validationPolicies'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { isClean } from '../../../lib/validation'
import { Field, TextArea, focusFirstInvalidField } from '../subscriptions/modalFields'
import { PolicyFailureNotice } from './PolicyFailureNotice'

/**
 * `edit` changes the draft it names. `create` starts a new one, empty or filled from `source`,
 * which is how an earlier version's wording is reused without the form inventing any of it.
 */
export type EditorTarget =
  | { mode: 'create'; source: BlockerVersionView | null }
  | { mode: 'edit'; source: BlockerVersionView }

const FORM_ID = 'pid-policy-editor'

type InputField = Extract<
  PidPolicyField,
  | 'participantIdentifierScheme'
  | 'valueSource'
  | 'validationPattern'
  | 'allowedCharactersPattern'
  | 'minimumLength'
  | 'maximumLength'
  | 'canonicalRepresentation'
  | 'uniquenessRule'
  | 'evidenceReference'
>

/**
 * Authors a draft of the taxpayer Participant ID validation policy.
 *
 * Saving only ever stores a draft: nothing takes effect until it has been submitted, reviewed,
 * approved and activated by the operators those steps belong to. No field has a default the author
 * did not choose, because whatever is saved here is what companies' Participant IDs are eventually
 * checked against.
 */
export function PidPolicyEditor({
  target,
  onClose,
  onSaved,
  onMoved,
}: {
  target: EditorTarget
  onClose: () => void
  onSaved: (saved: BlockerVersionView, mode: EditorTarget['mode']) => void
  /** The draft changed under the author, or another draft appeared: the page must be read again. */
  onMoved: () => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { mode, source } = target
  const [values, setValues] = useState<PidPolicyForm>(() =>
    source === null
      ? EMPTY_PID_FORM
      : mode === 'edit'
        ? pidFormFromDraft(source)
        : pidFormFromVersion(source),
  )
  const [errors, setErrors] = useState<PidPolicyErrors>({})
  const [failure, setFailure] = useState<PolicyFailure | null>(null)
  const [saving, setSaving] = useState(false)
  // Set once the server says the page is out of date. The form stays open so what was typed can
  // still be read, but it cannot be sent: its lock version no longer names the stored draft.
  const [moved, setMoved] = useState(false)
  const inFlight = useRef(false)

  const set = <F extends PidPolicyField>(field: F, value: PidPolicyForm[F]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
    if (!moved) setFailure(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current || moved) return
    const form = event.currentTarget
    const next = validatePidForm(values)
    setErrors(next)
    setFailure(null)
    if (!isClean(next)) {
      focusFirstInvalidField(form, PID_FIELD_ORDER, next)
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      const draft = pidFormToDraft(values)
      const saved =
        mode === 'edit'
          ? await updateDraft(PID_POLICY_TYPE, source, draft)
          : await createDraft(PID_POLICY_TYPE, draft)
      onSaved(saved, mode)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      const refusal = describeDraftFailure(error)
      setErrors(refusal.fieldErrors)
      setFailure(refusal.failure)
      focusFirstInvalidField(form, PID_FIELD_ORDER, refusal.fieldErrors)
      if (refusal.failure?.reload) {
        setMoved(true)
        onMoved()
      }
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const label = (name: PidPolicyField) => t(`console.policies.pid.field.${name}`)
  const hint = (name: string) => t(`console.policies.pid.hint.${name}`)
  const errorOf = (name: PidPolicyField) => (errors[name] ? t(errors[name]) : undefined)

  const input = (
    name: InputField,
    extra: {
      required?: boolean
      hint?: string
      code?: boolean
      numeric?: boolean
      wide?: boolean
    } = {},
  ) => (
    <div data-field={name} className={extra.wide ? 'md:col-span-2' : ''}>
      <Input
        bordered
        name={name}
        label={label(name)}
        requiredMark={extra.required}
        hint={extra.hint}
        dir={extra.code || extra.numeric ? 'ltr' : undefined}
        className={extra.code ? 'font-mono' : ''}
        inputMode={extra.numeric ? 'numeric' : undefined}
        autoComplete="off"
        spellCheck={false}
        value={values[name]}
        onChange={(event) => set(name, event.target.value)}
        error={errorOf(name)}
      />
    </div>
  )

  const number = source
    ? new Intl.NumberFormat(localeFor(i18n.language)).format(source.versionNumber)
    : ''
  const title =
    mode === 'edit'
      ? t('console.policies.editor.editTitle', { number })
      : source
        ? t('console.policies.editor.fromTitle', { number })
        : t('console.policies.editor.createTitle')

  return (
    <Modal
      open
      width={760}
      onClose={() => {
        if (!saving) onClose()
      }}
      title={title}
      subtitle={t('console.policies.editor.note')}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button type="button" size="md" variant="secondary" disabled={saving} onClick={onClose}>
            {t(moved ? 'common.close' : 'common.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} size="md" disabled={saving || moved}>
            {saving ? t('console.policies.editor.saving') : t('console.policies.editor.save')}
          </Button>
        </div>
      }
    >
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {input('participantIdentifierScheme', {
            required: true,
            code: true,
            hint: hint('scheme'),
          })}
          {input('valueSource', { required: true, hint: hint('valueSource') })}
          {input('validationPattern', {
            required: true,
            code: true,
            wide: true,
            hint: hint('pattern'),
          })}
          {input('allowedCharactersPattern', {
            code: true,
            wide: true,
            hint: hint('allowedCharacters'),
          })}
          {input('minimumLength', { required: true, numeric: true, hint: hint('length') })}
          {input('maximumLength', { required: true, numeric: true, hint: hint('length') })}

          <Field
            name="normalization"
            label={label('normalization')}
            required
            error={errorOf('normalization')}
          >
            <Select
              value={values.normalization}
              ariaLabel={label('normalization')}
              placeholder={t('console.policies.pid.choose')}
              disabled={saving}
              onChange={(value) => set('normalization', value as Normalization)}
              options={NORMALIZATIONS.map((option) => ({
                value: option,
                label: t(`console.policies.pid.option.normalization.${option}`),
              }))}
            />
          </Field>
          <Field
            name="caseSensitive"
            label={label('caseSensitive')}
            required
            error={errorOf('caseSensitive')}
          >
            <Select
              value={values.caseSensitive}
              ariaLabel={label('caseSensitive')}
              placeholder={t('console.policies.pid.choose')}
              disabled={saving}
              onChange={(value) => set('caseSensitive', value as YesNo)}
              options={[
                { value: 'yes', label: t('common.yes') },
                { value: 'no', label: t('common.no') },
              ]}
            />
          </Field>
          <div className="md:col-span-2">
            <Field
              name="vatinRelationship"
              label={label('vatinRelationship')}
              required
              error={errorOf('vatinRelationship')}
            >
              <Select
                value={values.vatinRelationship}
                ariaLabel={label('vatinRelationship')}
                placeholder={t('console.policies.pid.choose')}
                disabled={saving}
                onChange={(value) => set('vatinRelationship', value as VatinRelationship)}
                options={VATIN_RELATIONSHIPS.map((option) => ({
                  value: option,
                  label: t(`console.policies.pid.option.vatin.${option}`),
                }))}
              />
            </Field>
          </div>

          {input('canonicalRepresentation', {
            required: true,
            hint: hint('canonicalRepresentation'),
          })}
          {input('uniquenessRule', { required: true, hint: hint('uniquenessRule') })}

          <TextArea
            name="positiveFixtures"
            dir="ltr"
            className="font-mono"
            label={label('positiveFixtures')}
            required
            hint={hint('fixtures')}
            spellCheck={false}
            value={values.positiveFixtures}
            onChange={(event) => set('positiveFixtures', event.target.value)}
            error={errorOf('positiveFixtures')}
          />
          <TextArea
            name="negativeFixtures"
            dir="ltr"
            className="font-mono"
            label={label('negativeFixtures')}
            required
            hint={hint('fixtures')}
            spellCheck={false}
            value={values.negativeFixtures}
            onChange={(event) => set('negativeFixtures', event.target.value)}
            error={errorOf('negativeFixtures')}
          />

          {input('evidenceReference', { wide: true, hint: hint('evidence') })}

          <Field
            name="effectiveFrom"
            label={label('effectiveFrom')}
            required
            hint={hint('effectiveFrom')}
            error={errorOf('effectiveFrom')}
          >
            <DateField
              value={values.effectiveFrom}
              ariaLabel={label('effectiveFrom')}
              placeholder={t('console.policies.pid.chooseDay')}
              disabled={saving}
              onChange={(value) => set('effectiveFrom', value)}
            />
          </Field>
          <Field
            name="effectiveTo"
            label={label('effectiveTo')}
            hint={hint('effectiveTo')}
            error={errorOf('effectiveTo')}
          >
            <DateField
              value={values.effectiveTo}
              ariaLabel={label('effectiveTo')}
              placeholder={t('console.policies.pid.chooseDay')}
              disabled={saving}
              onChange={(value) => set('effectiveTo', value)}
            />
          </Field>
        </div>

        {failure ? <PolicyFailureNotice failure={failure} /> : null}
      </form>
    </Modal>
  )
}
