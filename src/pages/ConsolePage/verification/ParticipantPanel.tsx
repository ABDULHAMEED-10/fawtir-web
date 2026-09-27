import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '../../../components/ui'
import type { CompanyDetail } from '../../../lib/console/companyVerification'
import { ReviewCard, ReviewLine } from './ReviewCard'

/** Oman's Peppol scheme: a company is addressed as `0248:` followed by its VAT number. */
const OMAN_SCHEME = '0248'

/** A scheme of four digits, a colon, then the identifier itself. */
const PARTICIPANT_ID = /^\d{4}:[A-Za-z0-9._-]{1,120}$/

/** The ID the company would carry by default: the scheme and the VAT number, upper-cased. */
export function proposedParticipantId(taxNumber: string | null): string {
  const vat = taxNumber?.trim().toUpperCase()
  return vat ? `${OMAN_SCHEME}:${vat}` : ''
}

/**
 * The company's Peppol Participant ID, reviewed on the same screen as the company itself.
 *
 * A company cannot issue until its Participant ID is verified (`SELLER_PARTICIPANT_NOT_VERIFIED`),
 * and that review is separate from the company verification beside it. The card shows the ID the
 * company would carry (`0248:` + VAT number, which the Company card beside it shows), and lets the
 * reviewer type another one for the exceptions: an OM12 group VAT number, or an ID already
 * registered with another provider.
 *
 * TODO(backend): there is no route to read a company's Participant ID and its review status, or
 * to approve or reject it (docs/backend-guides/INCOME.md, "Update 2026-09-27 (Participant ID)").
 * Until one exists the status reads "Not reviewed" and both buttons stay disabled, so nothing
 * here claims a decision the server never recorded.
 */
export function ParticipantPanel({ company }: { company: CompanyDetail }) {
  const { t } = useTranslation()
  const proposed = proposedParticipantId(company.taxNumber)
  const [participantId, setParticipantId] = useState(proposed)
  const [touched, setTouched] = useState(false)
  const none = t('console.verification.detail.none')
  const invalid = !PARTICIPANT_ID.test(participantId.trim())
  const groupVat = company.taxNumber?.trim().toUpperCase().startsWith('OM12') ?? false

  return (
    <ReviewCard title={t('console.verification.participant.title')}>
      <p className="pb-3 text-sm font-medium leading-[1.6] text-text-tertiary">
        {t('console.verification.participant.intro')}
      </p>

      {/* The VAT number it comes from is on the Company card beside this one. */}
      <ReviewLine
        label={t('console.verification.participant.proposed')}
        value={
          <span dir="ltr" className="font-mono">
            {proposed || none}
          </span>
        }
      />
      <ReviewLine
        label={t('console.verification.participant.status')}
        value={t('console.verification.participant.notReviewed')}
      />

      {groupVat ? (
        <p role="note" className="mt-3 text-sm font-medium leading-[1.6] text-warning-700">
          {t('console.verification.participant.groupVat')}
        </p>
      ) : null}

      <div className="mt-4">
        <Input
          bordered
          requiredMark
          name="participantId"
          dir="ltr"
          label={t('console.verification.participant.idLabel')}
          hint={t('console.verification.participant.idHint')}
          value={participantId}
          maxLength={125}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setParticipantId(event.target.value)}
          onBlur={() => setTouched(true)}
          error={touched && invalid ? t('console.verification.participant.idInvalid') : undefined}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        <Button type="button" size="md" fullWidth disabled>
          {t('console.verification.participant.approve')}
        </Button>
        <Button
          type="button"
          size="md"
          variant="secondary"
          fullWidth
          disabled
          className="opacity-50"
        >
          {t('console.verification.participant.reject')}
        </Button>
      </div>
      <p role="status" className="mt-2 text-xs font-medium leading-[1.5] text-text-quaternary">
        {t('console.verification.participant.notConnected')}
      </p>
    </ReviewCard>
  )
}
