import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PID_POLICY_TYPE,
  dataEntries,
  isNormalization,
  isVatinRelationship,
  pidPolicySummary,
  type BlockerVersionView,
} from '../../../lib/console/validationPolicies'
import { ReviewLine } from '../verification/ReviewCard'

/**
 * A stored token: a pattern, a code, a fixture. Never mirrored. A long one wraps after an
 * underscore when it can, and mid-word only when nothing else fits.
 */
function Code({ children }: { children: string }) {
  const parts = children.split(/(?<=_)/)
  return (
    <span dir="ltr" className="break-words font-mono">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
    </span>
  )
}

/**
 * A server code shown by its meaning when one is known, with the code itself underneath for an
 * operator who needs to quote it. An unknown code is shown as it is.
 */
export function NamedCode({ value, labelKey }: { value: string; labelKey: string }) {
  const { t, i18n } = useTranslation()
  if (!/^[A-Z0-9_]+$/.test(value) || !i18n.exists(labelKey)) return <Code>{value}</Code>
  return (
    <>
      {t(labelKey)}
      <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
        <Code>{value}</Code>
      </span>
    </>
  )
}

/** A value too long or too structured for a label/value line, under its own label. */
function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-border-subtle py-2.5 last:border-b-0">
      <p className="text-sm font-medium text-text-tertiary">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

const MONO_BLOCK =
  'block whitespace-pre-wrap break-words rounded-sm bg-surface-background px-3 py-2 font-mono text-xs font-medium leading-[1.6] text-text-secondary'

function Fixtures({ values, none }: { values: string[]; none: string }) {
  if (values.length === 0) return <p className="text-sm font-semibold text-text-primary">{none}</p>
  return (
    <ul dir="ltr" className="flex flex-col gap-1">
      {values.map((value, index) => (
        <li key={`${index}-${value}`} className={MONO_BLOCK}>
          {value}
        </li>
      ))}
    </ul>
  )
}

/**
 * What a policy version holds, read-only.
 *
 * The taxpayer Participant ID policy has named fields, shown under the same labels its editor
 * uses. The other seven types have no form in this console, so their contents are listed as the
 * keys and values the server stores, without interpretation: there is deliberately no way to edit
 * them from here.
 */
export function PolicyContents({ version }: { version: BlockerVersionView }) {
  const { t } = useTranslation()
  const none = t('console.policies.none')
  const yesNo = (value: boolean) => t(value ? 'common.yes' : 'common.no')

  if (version.type !== PID_POLICY_TYPE) {
    const entries = dataEntries(version.data)
    if (entries.length === 0) {
      return (
        <p className="py-2.5 text-sm font-medium text-text-tertiary">
          {t('console.policies.detail.noContents')}
        </p>
      )
    }
    return (
      <>
        {entries.map((entry) =>
          entry.kind === 'json' ? (
            <Block key={entry.key} label={entry.key}>
              <code dir="ltr" className={MONO_BLOCK}>
                {entry.text}
              </code>
            </Block>
          ) : (
            <ReviewLine
              key={entry.key}
              label={entry.key}
              value={
                entry.kind === 'boolean' ? (
                  yesNo(entry.flag)
                ) : entry.kind === 'empty' ? (
                  none
                ) : (
                  <Code>{entry.text}</Code>
                )
              }
            />
          ),
        )}
      </>
    )
  }

  const policy = pidPolicySummary(version.data)
  const field = (name: string) => t(`console.policies.pid.field.${name}`)
  const code = (value: string) => (value ? <Code>{value}</Code> : none)
  // Free text the server stores; the values it uses most are named, anything else is shown as is.
  const named = (value: string) =>
    value ? <NamedCode value={value} labelKey={`console.policies.pid.value.${value}`} /> : none

  return (
    <>
      <ReviewLine
        label={field('participantIdentifierScheme')}
        value={code(policy.participantIdentifierScheme)}
      />
      <Block label={field('validationPattern')}>
        {policy.validationPattern ? (
          <code dir="ltr" className={MONO_BLOCK}>
            {policy.validationPattern}
          </code>
        ) : (
          <p className="text-sm font-semibold text-text-primary">{none}</p>
        )}
      </Block>
      <ReviewLine
        label={field('allowedCharactersPattern')}
        value={code(policy.allowedCharactersPattern)}
      />
      <ReviewLine label={field('minimumLength')} value={code(policy.minimumLength)} />
      <ReviewLine label={field('maximumLength')} value={code(policy.maximumLength)} />
      <ReviewLine
        label={field('normalization')}
        value={
          isNormalization(policy.normalization)
            ? t(`console.policies.pid.option.normalization.${policy.normalization}`)
            : code(policy.normalization)
        }
      />
      <ReviewLine
        label={field('vatinRelationship')}
        value={
          isVatinRelationship(policy.vatinRelationship)
            ? t(`console.policies.pid.option.vatin.${policy.vatinRelationship}`)
            : code(policy.vatinRelationship)
        }
      />
      <ReviewLine
        label={field('caseSensitive')}
        value={policy.caseSensitive === null ? none : yesNo(policy.caseSensitive)}
      />
      <ReviewLine label={field('valueSource')} value={named(policy.valueSource)} />
      <ReviewLine
        label={field('canonicalRepresentation')}
        value={named(policy.canonicalRepresentation)}
      />
      <ReviewLine label={field('uniquenessRule')} value={named(policy.uniquenessRule)} />
      <Block label={field('positiveFixtures')}>
        <Fixtures values={policy.positiveFixtures} none={none} />
      </Block>
      <Block label={field('negativeFixtures')}>
        <Fixtures values={policy.negativeFixtures} none={none} />
      </Block>
    </>
  )
}
