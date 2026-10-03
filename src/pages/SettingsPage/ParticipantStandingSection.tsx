import { useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  PARTICIPANT_STANDING_PATH,
  refusalNeedsReload,
  requestReverification,
  reverificationRefusal,
  type ParticipantIdStanding,
  type ParticipantStandingState,
  type ReverificationRefusal,
} from '../../api/peppol/participantStanding'
import { Button } from '../../components/ui'
import { useApiRead } from '../../hooks/useApiRead'
import { describeApiFailure, isPermissionDenied } from '../../lib/apiFailure'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import type { FormMessage } from '../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../lib/identity/login'
import { shortDate } from '../../lib/settings'

type Tone = 'good' | 'bad' | 'waiting'

// The pill geometry is this page's own "Published" pill; the tone pairs are the ones the activity
// screens already use, so no colour here is new to the app.
const TONE_PILL: Record<Tone, { pill: string; dot: string }> = {
  good: { pill: 'bg-success-100 text-[#3d5648]', dot: 'bg-[#4c6c5a]' },
  bad: { pill: 'bg-danger-100 text-danger-700', dot: 'bg-danger-700' },
  waiting: { pill: 'bg-pending-100 text-pending-700', dot: 'bg-pending-700' },
}

// No pill for the states that ask nothing of the company: a coloured badge there would read as a
// warning or an all-clear that the server did not give.
const STATE_TONE: Record<ParticipantStandingState, Tone | null> = {
  NOT_SUBMITTED: null,
  DRAFT: null,
  AWAITING_REVIEW: 'waiting',
  VERIFIED: 'good',
  REVERIFICATION_REQUIRED: 'waiting',
  NO_POLICY_IN_FORCE: null,
  REJECTED: 'bad',
}

const REFUSAL_KEY: Record<ReverificationRefusal, string> = {
  POLICY_CHANGED: 'peppolTax.participant.refused.policyChanged',
  SUBMISSION_IN_PROGRESS: 'peppolTax.participant.refused.inProgress',
  REVERIFICATION_NOT_REQUIRED: 'peppolTax.participant.refused.notRequired',
  PID_POLICY_NOT_ACTIVE: 'peppolTax.participant.refused.policyNotActive',
}

type Failure = FormMessage & { reference: string | null }

function describeReverificationFailure(error: unknown): Failure {
  const refusal = reverificationRefusal(error)
  const reference = error instanceof ApiError ? error.correlationId : null
  if (refusal !== null) return { key: REFUSAL_KEY[refusal], reference }
  if (isPermissionDenied(error))
    return { key: 'peppolTax.participant.refused.forbidden', reference }
  return describeApiFailure(error)
}

type Outcome = { kind: 'sent' } | { kind: 'failed'; failure: Failure }

/**
 * Settings › Peppol and tax: where the company's Participant ID stands against the validation
 * policy in force, read from the server rather than from the page's design constants.
 *
 * A verification made under an earlier policy version is not shown as "Verified": the server says
 * whether it still counts (`state`), and whether the company may ask again now
 * (`reverificationAvailable`). Nothing here re-derives either.
 */
export function ParticipantStandingSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const titleId = useId()
  const { read, retry } = useApiRead<ParticipantIdStanding>(PARTICIPANT_STANDING_PATH)
  // The standing the 201 answered with. It replaces the read instead of triggering another GET:
  // the server already said where the company stands after the request.
  const [answered, setAnswered] = useState<ParticipantIdStanding | null>(null)
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const inFlight = useRef(false)

  const standing = answered ?? (read.status === 'ready' ? read.data : null)

  const reload = () => {
    setAnswered(null)
    retry()
  }

  const ask = async () => {
    const policy = standing?.policyInForce
    if (inFlight.current || !standing?.reverificationAvailable || !policy) return
    inFlight.current = true
    setSending(true)
    setOutcome(null)
    try {
      const result = await requestReverification(policy.id)
      if (result?.verificationStanding) {
        setAnswered(result.verificationStanding)
      } else {
        // A 201 without the standing would leave the old one on screen, still offering a request
        // that the server now refuses as already open; reading it once is the honest fallback.
        reload()
      }
      setOutcome({ kind: 'sent' })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      setOutcome({ kind: 'failed', failure: describeReverificationFailure(error) })
      // Read once so the screen shows where things now stand. Never resent: after a policy change
      // the company has to see the new policy before asking against it.
      if (refusalNeedsReload(reverificationRefusal(error))) reload()
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  const tone = standing ? STATE_TONE[standing.state] : null

  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h3 id={titleId} className="text-lg font-semibold leading-[1.2] text-text-primary">
            {t('peppolTax.participant.title')}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">
            {t('peppolTax.participant.note')}
          </p>
        </div>
        {standing && tone ? (
          <span
            className={[
              'inline-flex h-[24px] items-center gap-1.5 rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
              TONE_PILL[tone].pill,
            ].join(' ')}
          >
            <span className={['size-1.5 rounded-full', TONE_PILL[tone].dot].join(' ')} />
            {t(`peppolTax.participant.pill.${standing.state}`)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-surface-background px-5 py-4">
        {standing ? (
          <StandingBody standing={standing} sending={sending} onAsk={() => void ask()} />
        ) : read.status === 'failed' ? (
          <ReadFailure error={read.error} retry={reload} />
        ) : (
          <p role="status" className="text-sm font-medium leading-[1.6] text-text-quaternary">
            {t('peppolTax.participant.loading')}
          </p>
        )}

        {outcome?.kind === 'sent' ? (
          <p role="status" className="text-sm font-medium leading-[1.6] text-[#3d5648]">
            {t('peppolTax.participant.sent')}
          </p>
        ) : outcome?.kind === 'failed' ? (
          <p role="alert" className="text-sm font-medium leading-[1.6] text-danger-700">
            <FailureText failure={outcome.failure} />
          </p>
        ) : null}
      </div>
    </section>
  )
}

/** The project's reference line, appended as `ApiNotice` does, so support can find the request. */
function FailureText({ failure }: { failure: Failure }) {
  const { t } = useTranslation()
  const body = t(failure.key, failure.values)
  return (
    <>
      {failure.reference ? `${body} ${t('apiErrors.reference', { id: failure.reference })}` : body}
    </>
  )
}

function StandingBody({
  standing,
  sending,
  onAsk,
}: {
  standing: ParticipantIdStanding
  sending: boolean
  onAsk: () => void
}) {
  const { t } = useTranslation()
  const verification = standing.verification
  const lines = [t(`peppolTax.participant.body.${standing.state}`)]
  // Said whenever a verification is on record but is not the answer in force, so the company is
  // never left thinking that asking again, or being refused, erased what it already had.
  if (verification && standing.state !== 'VERIFIED' && standing.state !== 'NO_POLICY_IN_FORCE') {
    lines.push(t('peppolTax.participant.notDeleted'))
  }
  if (standing.state === 'REJECTED' && standing.reverificationAvailable) {
    lines.push(t('peppolTax.participant.canAskAgain'))
  }
  const version = (number: number | null | undefined) =>
    number === null || number === undefined
      ? t('peppolTax.participant.none')
      : t('peppolTax.participant.policyVersion', { number })

  return (
    <>
      {lines.map((line) => (
        <p key={line} className="text-sm font-medium leading-[1.6] text-text-tertiary">
          {line}
        </p>
      ))}

      {verification ? (
        <dl>
          <Row label={t('peppolTax.participant.participantId')}>
            <span dir="ltr" className="font-mono text-[11px]">
              {`${verification.participantScheme}:${verification.participantValue}`}
            </span>
          </Row>
          <Row label={t('peppolTax.participant.verifiedOn')}>
            {shortDate(new Date(verification.verifiedAt))}
          </Row>
          <Row label={t('peppolTax.participant.verifiedUnder')}>
            {version(verification.policyVersionNumber)}
          </Row>
          <Row label={t('peppolTax.participant.policyInForce')} last>
            {version(standing.policyInForce?.versionNumber)}
          </Row>
        </dl>
      ) : null}

      {standing.reverificationAvailable && standing.policyInForce ? (
        <div>
          <Button type="button" size="md" disabled={sending} aria-busy={sending} onClick={onAsk}>
            {sending ? t('peppolTax.participant.asking') : t('peppolTax.participant.ask')}
          </Button>
        </div>
      ) : null}
    </>
  )
}

function Row({
  label,
  children,
  last = false,
}: {
  label: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold text-text-primary">{children}</dd>
    </div>
  )
}

function ReadFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useTranslation()
  if (isPermissionDenied(error)) {
    return (
      <p role="alert" className="text-sm font-medium leading-[1.6] text-text-tertiary">
        {t('peppolTax.participant.readForbidden')}
      </p>
    )
  }
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
        <FailureText failure={describeApiFailure(error)} />
      </p>
      <Button type="button" size="md" variant="secondary" onClick={retry}>
        {t('appAccess.retry')}
      </Button>
    </div>
  )
}
