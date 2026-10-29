import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Modal, Rial } from '../../components/ui'
import { BillStatusChip } from '../../components/bills'
import { ApiReadFailure } from '../../components/feedback/ApiNotice'
import type { ApiRead } from '../../hooks/useApiRead'
import {
  DUPLICATE_NOTE_MAX_LENGTH,
  resolveDuplicateBill,
  type BillDetailDto,
  type DuplicateResolutionDto,
} from '../../api/expenditure/bills'
import { isCreditNote } from '../../lib/billDetail'
import {
  duplicateActionsOf,
  duplicateCheckOf,
  isNoteRefusal,
  refusalMeansStale,
  type DuplicateCheck,
} from '../../lib/billDuplicate'
import { toBillListItem } from '../../lib/billList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstant } from '../../lib/format'
import { Card, PRIMARY_BUTTON, QUIET_BUTTON } from './parts'

const TITLE: Record<DuplicateCheck['state'], string> = {
  suspected: 'billDetail.duplicate.title.suspected',
  confirmed: 'billDetail.duplicate.title.confirmed',
  notDuplicate: 'billDetail.duplicate.title.notDuplicate',
}

const BODY: Record<DuplicateCheck['state'], string> = {
  suspected: 'billDetail.duplicate.body.suspected',
  confirmed: 'billDetail.duplicate.body.confirmed',
  notDuplicate: 'billDetail.duplicate.body.notDuplicate',
}

const DONE: Record<DuplicateResolutionDto, string> = {
  CONFIRMED_DUPLICATE: 'billDetail.duplicate.done.confirmed',
  NOT_DUPLICATE: 'billDetail.duplicate.done.notDuplicate',
}

type DialogError = { text: string; field: boolean }

/**
 * A later Peppol copy beside the document already on file, and the decision on it (V493). The
 * page reads the earlier document, so the read outlives the page's own re-read after a decision.
 * The document UUID is the row's `documentUuid`; a server before that field leaves it to the
 * delivery record. The holds and decisions over time are the Activity card's steps, which the
 * server writes from the same hold history.
 *
 * A held credit note (381, 261) is decided the same way, but it is never approved or paid: its
 * sentences say what a credit note is withheld from, being set against a bill.
 */
export function DuplicateCheckCard({
  detail,
  check,
  original,
  retryOriginal,
  originalUuid,
  thisUuid,
  canApprove,
  userId,
  onDecided,
  onStale,
}: {
  detail: BillDetailDto
  check: DuplicateCheck
  /** The earlier document, `GET /bills/{duplicateOfBillId}`. */
  original: ApiRead<BillDetailDto>
  retryOriginal: () => void
  /** The earlier document's UUID from its delivery record, for a server before `documentUuid`. */
  originalUuid: string | null
  /** This copy's document UUID from its delivery record, for a server before `documentUuid`. */
  thisUuid: string | null
  canApprove: boolean
  userId: string | null
  /** The decision was recorded: the page says so and reads the bill again. */
  onDecided: (doneKey: string) => void
  /** The decision was refused because the bill moved on: the page says why and reads it again. */
  onStale: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const billId = detail.bill.id
  const kind = isCreditNote(detail) ? 'CreditNote' : ''

  const actions = duplicateActionsOf(check, canApprove)
  const [deciding, setDeciding] = useState<DuplicateResolutionDto | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<DialogError | null>(null)
  const [busy, setBusy] = useState(false)
  // A second click can land before the disabled button re-renders: one decision, one request.
  const sending = useRef(false)

  const close = () => {
    setDeciding(null)
    setNote('')
    setError(null)
  }

  const failureText = (failure: unknown) => {
    const message = describeApiFailure(failure)
    const body = t(message.key, message.values)
    return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
  }

  const submit = async () => {
    const text = note.trim()
    if (!deciding || text === '' || sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await resolveDuplicateBill(billId, deciding, text)
      const done = DONE[deciding]
      close()
      onDecided(done)
    } catch (failure) {
      if (refusalMeansStale(failure)) {
        close()
        onStale(failureText(failure))
      } else {
        setError({ text: failureText(failure), field: isNoteRefusal(failure) })
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const noteError = error?.field ? error.text : null
  const decided =
    check.state !== 'suspected' && check.hold?.duplicateResolvedAt ? check.hold : null

  return (
    <Card id="duplicate-check" title={t(TITLE[check.state])}>
      <p className="text-sm font-medium leading-[1.5] text-text-tertiary">{t(`${BODY[check.state]}${kind}`)}</p>
      {decided?.duplicateResolvedAt ? (
        <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
          <span className="font-semibold text-text-primary">
            {t('billDetail.duplicate.decided', {
              date: formatInstant(decided.duplicateResolvedAt, language),
            })}
          </span>
          {userId !== null && decided.duplicateResolvedBy === userId
            ? ` · ${t('billDetail.activity.byYou')}`
            : null}
          {decided.duplicateResolutionNote ? `: “${decided.duplicateResolutionNote}”` : null}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <BillSide
          heading={t('billDetail.duplicate.thisBill')}
          detail={detail}
          uuid={detail.bill.documentUuid ?? thisUuid}
          language={language}
        />
        {original.status === 'ready' ? (
          <BillSide
            heading={t('billDetail.duplicate.original')}
            detail={original.data}
            uuid={original.data.bill.documentUuid ?? originalUuid}
            language={language}
            link={`/expenditure/bills/${encodeURIComponent(check.originalId)}`}
          />
        ) : (
          <div className="rounded-sm border border-border-subtle bg-white p-3.5">
            <SideHeading text={t('billDetail.duplicate.original')} />
            <div className="mt-3">
              {original.status === 'loading' ? (
                <p role="status" className="text-sm font-medium text-text-quaternary">
                  {t('appAccess.loading')}
                </p>
              ) : (
                <ApiReadFailure error={original.error} retry={retryOriginal} />
              )}
            </div>
          </div>
        )}
      </div>

      {check.sameDocumentUuid ? (
        <p className="mt-4 text-sm font-medium leading-[1.5] text-text-tertiary">
          {t(`billDetail.duplicate.sameUuid${kind}`)}
        </p>
      ) : null}

      {actions.confirm ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setDeciding('CONFIRMED_DUPLICATE')}
            disabled={busy}
            className={PRIMARY_BUTTON}
          >
            {t('billDetail.duplicate.confirm')}
          </button>
          {actions.notDuplicate ? (
            <button
              type="button"
              onClick={() => setDeciding('NOT_DUPLICATE')}
              disabled={busy}
              className={QUIET_BUTTON}
            >
              {t('billDetail.duplicate.notDuplicate')}
            </button>
          ) : null}
        </div>
      ) : check.state === 'suspected' && !canApprove ? (
        <p className="mt-4 text-sm font-medium leading-[1.5] text-text-tertiary">
          {t('billDetail.duplicate.needsApprover')}
        </p>
      ) : null}

      <Modal
        open={deciding !== null}
        onClose={close}
        title={t(
          deciding === 'NOT_DUPLICATE'
            ? 'billDetail.duplicate.dialog.notTitle'
            : 'billDetail.duplicate.dialog.confirmTitle',
        )}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={close} className={QUIET_BUTTON}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || note.trim() === ''}
              className={PRIMARY_BUTTON}
            >
              {t(
                deciding === 'NOT_DUPLICATE'
                  ? 'billDetail.duplicate.notDuplicate'
                  : 'billDetail.duplicate.confirm',
              )}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t(
            `${
              deciding === 'NOT_DUPLICATE'
                ? 'billDetail.duplicate.dialog.notBody'
                : 'billDetail.duplicate.dialog.confirmBody'
            }${kind}`,
          )}
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">
            {t('billDetail.duplicate.dialog.note')}
          </span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={DUPLICATE_NOTE_MAX_LENGTH}
            rows={3}
            required
            aria-invalid={noteError ? true : undefined}
            aria-describedby={noteError ? 'duplicate-note-error' : undefined}
            className="mt-1.5 w-full rounded-sm border border-border-subtle p-3 text-sm text-text-primary outline-none focus:border-primary-500"
          />
        </label>
        {error ? (
          <p
            id={noteError ? 'duplicate-note-error' : undefined}
            role="alert"
            className="mt-2 text-sm font-medium leading-[1.5] text-danger-700"
          >
            {error.text}
          </p>
        ) : null}
      </Modal>
    </Card>
  )
}

function SideHeading({ text }: { text: string }) {
  return (
    <span className="text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.5px] text-text-tertiary">
      {text}
    </span>
  )
}

/** One copy's facts, in the same order on both sides so they read across. */
function BillSide({
  heading,
  detail,
  uuid,
  language,
  link,
}: {
  heading: string
  detail: BillDetailDto
  uuid: string | null
  language: string
  link?: string
}) {
  const { t } = useTranslation()
  const row = detail.bill
  const notStated = t('billDetail.notStated')
  const money = (value: number | null): ReactNode =>
    value === null ? (
      notStated
    ) : row.currencyCode === 'OMR' ? (
      <>
        <span className="me-1">
          <Rial />
        </span>
        {formatAmount(value, row.currencyCode, language)}
      </>
    ) : (
      `${formatAmount(value, row.currencyCode, language)} ${row.currencyCode}`
    )
  // A copy decided not a duplicate is released, so it reads as any bill not on hold.
  const check = duplicateCheckOf(detail)
  const held = check && check.state !== 'notDuplicate' ? check : null
  const holdText = held
    ? t(held.state === 'confirmed' ? 'billsPage.state.confirmedDuplicate' : 'billsPage.state.suspectedDuplicate')
    : detail.hold
      ? (detail.hold.reason ?? t('billsPage.state.onHold'))
      : t('billDetail.duplicate.notHeld')
  const facts: [string, ReactNode][] = [
    ['billDetail.duplicate.field.supplier', row.supplierName ?? t('billDetail.supplierUnknown')],
    ['billDetail.duplicate.field.number', row.supplierBillNumber ?? notStated],
    [
      'billDetail.duplicate.field.uuid',
      uuid ? (
        <span dir="ltr" className="break-all">
          {uuid}
        </span>
      ) : (
        notStated
      ),
    ],
    ['billDetail.duplicate.field.issued', row.issueDate ? formatDate(row.issueDate, language) : notStated],
    ['billDetail.duplicate.field.total', money(row.totalIncludingVat)],
    ['billDetail.duplicate.field.vat', money(row.vatAmount)],
    ['billDetail.duplicate.field.source', t(`billDetail.steps.via.${row.source}`)],
    ['billDetail.duplicate.field.hold', holdText],
  ]
  return (
    <div className="rounded-sm border border-border-subtle bg-white p-3.5">
      <div className="flex items-center justify-between gap-3">
        <SideHeading text={heading} />
        {link ? (
          <Link to={link} className="text-sm font-semibold text-primary-700 hover:underline">
            {t('billDetail.duplicate.openOriginal')}
          </Link>
        ) : null}
      </div>
      <dl className="mt-3 flex flex-col gap-2.5">
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-sm font-medium text-text-tertiary">{t(label)}</dt>
            <dd className="min-w-0 text-end text-sm font-semibold text-text-primary">{value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm font-medium text-text-tertiary">
            {t('billDetail.duplicate.field.status')}
          </dt>
          <dd>
            <BillStatusChip item={toBillListItem(row)} />
          </dd>
        </div>
      </dl>
    </div>
  )
}
