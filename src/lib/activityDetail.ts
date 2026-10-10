import type {
  ActivityDetailDto,
  ActivityDirectionDto,
  ActivityLinksDto,
  MlsRecordDto,
  TddObligationDto,
} from '../api/compliance/activity'
import { BUSINESS_TIME_ZONE } from './format'
import {
  flowOf,
  outcomeOf,
  refusalCauseOf,
  refusalKindOf,
  TDD_STOPPED_AT_FAWTIR,
  type RefusalCause,
  type RefusalKind,
  type RowFlow,
  type RowOutcome,
} from './activityLedger'

/**
 * One document's reporting record: Compliance › Activity › Detail (Figma 154:111026, drawn for
 * INV-1993), read from `/v1/compliance/activity/{invoice_uuid}`.
 *
 * A document takes two independent journeys and the screen shows both: the Tax Data Document to
 * the Authority via Fawtara (the TDD lineage, oldest first), and the invoice itself to the customer
 * over Peppol (the MLS replies). Either can fail without the other noticing, which is why they are
 * drawn as two timelines rather than one merged history.
 *
 * Everything here is worked out from the record. What the record does not carry yet (the time of
 * a refusal, the plain-language explanation, file sizes, participant IDs, the integrity check) is
 * left out or drawn from what is there, and listed in the backend asks doc, section 2.
 */

/** How a step of a journey ended. */
export type StepState = 'done' | 'failed' | 'waiting'

export type JourneyStep = {
  id: string
  labelKey: string
  /** When it happened, as `8 Jun · 11:20:04`; null when the record does not say. */
  at: string | null
  /** A second line: the reference it produced, the MLS code, the error code. */
  note?: string
  state: StepState
}

export type JourneyTone = 'good' | 'bad' | 'waiting'

export type Journey = {
  id: 'ota' | 'peppol'
  titleKey: string
  subtitleKey: string
  /** The badge on the right of the journey heading. */
  verdictKey: string
  verdictValues?: Record<string, string | number>
  tone: JourneyTone
  steps: JourneyStep[]
}

/** One version of the report as the Authority saw it, newest first. */
export type ReportVersion = {
  id: string
  version: string
  state: 'live' | 'superseded' | 'rejected' | 'waiting' | 'notSent' | 'held'
  headlineKey: string
  at: string | null
  uuid: string | null
  reference: string | null
  bodyKey: string
}

export type ActivityRecord = {
  invoiceUuid: string
  /** RECEIVED: a supplier sent it to us, so the counterparty is the seller and we report receipt. */
  direction: ActivityDirectionDto
  invoice: string | null
  customer: string | null
  issued: string
  amount: number | null
  currency: string
  outcome: RowOutcome
  attempts: number
  supersededCount: number
  journeys: Journey[]
  /**
   * The refusal to explain, newest first: the one that matters. Null when none was refused. `kind`
   * says how it is put right: an error in the invoice itself takes a credit note and a new invoice,
   * an error in the report alone is sent again.
   */
  rejection: {
    code: string | null
    reason: string
    later: 'accepted' | 'open'
    cause: RefusalCause
    kind: RefusalKind
  } | null
  versions: ReportVersion[]
  proof: { reference: string | null; uuid: string | null; acceptedAt: string | null }
  route: {
    flow: RowFlow
    /** We received it and reported it as the receiver (TDT-010 = 02). */
    received: boolean
    /** The TDD scope code (D, IP or INP) when the item carries it (ACTIVITY.md 2.32). */
    scope: string | null
    flowNumber: number | null
    standIn: string | null
    mlsCount: number
    /** The other side's participant ID, when the record carries it (asks row 2.26). */
    theirId: string | null
    /** The PINT-OM specification the document was built to (asks row 2.27). */
    profile: string
  }
  /** Oman VAT Law keeps a tax document ten years from issue. */
  retention: { keptUntil: string; years: number; months: number }
  copies: {
    id: 'accepted' | 'withdrawn' | 'ack' | 'replies' | 'invoice'
    titleKey: string
    metaKey: string
    values?: Record<string, number>
  }[]
  /** "Send it again": only the server's link makes it possible. */
  resend: 'possible' | 'possibleInvoice' | 'accepted' | 'received' | 'waiting' | 'none'
  links: ActivityLinksDto
}

const RETENTION_YEARS = 10

/**
 * The PINT-OM specification a document follows, from its CustomizationID. PINT-OM billing and
 * self-billing are both at v1.0.1; a document that does not say is billing, the default profile.
 */
const PROFILES: Record<string, string> = {
  'urn:peppol:pint:billing-1@om-1': 'PINT-OM billing 1.0.1',
  'urn:peppol:pint:selfbilling-1@om-1': 'PINT-OM self-billing 1.0.1',
}
export const DEFAULT_PROFILE = PROFILES['urn:peppol:pint:billing-1@om-1']

export function profileOf(customizationId: string | null | undefined): string {
  return (customizationId && PROFILES[customizationId.trim()]) || DEFAULT_PROFILE
}

/** `8 Jun · 11:20:04` in the business's time zone. */
export function stampOf(iso: string | null, language = 'en'): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const ar = language.startsWith('ar')
  const part = (options: Intl.DateTimeFormatOptions, locale = ar ? 'ar-OM' : 'en-GB') =>
    new Intl.DateTimeFormat(locale, { timeZone: BUSINESS_TIME_ZONE, ...options }).format(date)
  const month = part({ month: 'short' }, ar ? 'ar-OM' : 'en-US')
  const time = part({ hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  return `${part({ day: 'numeric' })} ${month} · ${time}`
}

/** `9 Jun 2026, 08:43`. */
export function whenOf(iso: string | null, language = 'en'): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const ar = language.startsWith('ar')
  const opts = (o: Intl.DateTimeFormatOptions) => ({ timeZone: BUSINESS_TIME_ZONE, ...o })
  const day = new Intl.DateTimeFormat(ar ? 'ar-OM' : 'en-GB', opts({ day: 'numeric' })).format(date)
  const month = new Intl.DateTimeFormat(ar ? 'ar-OM' : 'en-US', opts({ month: 'short' })).format(
    date,
  )
  const year = new Intl.DateTimeFormat(ar ? 'ar-OM' : 'en-GB', opts({ year: 'numeric' })).format(
    date,
  )
  const time = new Intl.DateTimeFormat(
    ar ? 'ar-OM' : 'en-GB',
    opts({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  ).format(date)
  return `${day} ${month} ${year}, ${time}`
}

/** `8 Jun 2026`. */
function dayOf(iso: string, language: string): string {
  return (whenOf(iso, language) ?? iso).split(',')[0]
}

/** Both statuses carry a `failure_reason`, but it is ours, never the Tax Authority's (N1). */
const stoppedAtFawtir = (obligation: TddObligationDto) =>
  TDD_STOPPED_AT_FAWTIR.has(obligation.status)

const refused = (obligation: TddObligationDto) =>
  !stoppedAtFawtir(obligation) &&
  (Boolean(obligation.failure_reason) || obligation.status === 'REJECTED')

function tddJourney(dto: ActivityDetailDto, outcome: RowOutcome, language: string): Journey | null {
  const lineage = dto.tdd_lineage
  const leg = dto.summary.tdd_leg
  if (lineage.length === 0 && !leg) return null
  const steps: JourneyStep[] = []
  const first = lineage[0]
  const live = lineage[lineage.length - 1]
  const builtAt = first?.validated_at ?? leg?.validated_at ?? null
  steps.push({
    id: 'built',
    labelKey: 'activityDetail.step.reportBuilt',
    at: stampOf(builtAt, language),
    state: builtAt ? 'done' : 'waiting',
  })
  // Only a submission time proves the report left Fawtir; a queued or generated TDD has none.
  const sentAt = first?.submitted_at ?? leg?.submitted_at ?? null
  steps.push(
    sentAt
      ? {
          id: 'sent',
          labelKey: 'activityDetail.step.sentToFawtara',
          at: stampOf(sentAt, language),
          state: 'done',
        }
      : {
          id: 'sent',
          labelKey: 'activityDetail.step.notSentToFawtara',
          at: null,
          state: 'waiting',
        },
  )
  lineage.forEach((obligation, index) => {
    const last = index === lineage.length - 1
    if (index > 0) {
      steps.push(
        obligation.submitted_at
          ? {
              id: `resent-${obligation.id}`,
              labelKey: 'activityDetail.step.correctedAndResent',
              at: stampOf(obligation.submitted_at, language),
              state: 'done',
            }
          : {
              id: `resent-${obligation.id}`,
              labelKey: 'activityDetail.step.notSentToFawtara',
              at: null,
              state: 'waiting',
            },
      )
    }
    if (stoppedAtFawtir(obligation)) {
      steps.push({
        id: `stopped-${obligation.id}`,
        labelKey: 'activityDetail.step.stoppedAtFawtir',
        at: null,
        state: 'failed',
      })
    }
    // A refusal on the last attempt is told by the leg below, which knows when it came back.
    if (refused(obligation) && !(last && leg?.ack === 'RE')) {
      steps.push({
        id: `refused-${obligation.id}`,
        labelKey: 'activityDetail.step.turnedDown',
        // TODO(backend): an obligation carries no refusal time (asks row 2.11).
        at: null,
        note: obligation.error_code ?? undefined,
        state: 'failed',
      })
    }
  })
  const liveStopped = live ? stoppedAtFawtir(live) : false
  // Nobody at the OTA can be waited on for a report that never reached it.
  const liveSubmitted = Boolean(live ? live.submitted_at : leg?.submitted_at)
  if (leg?.ack === 'AP' || leg?.ack === 'AB') {
    steps.push({
      id: 'accepted',
      // AB is delivered without confirmation, never "accepted".
      labelKey:
        leg.ack === 'AB'
          ? 'activityDetail.step.deliveredUnconfirmed'
          : 'activityDetail.step.accepted',
      at: stampOf(leg.ack_at, language),
      note: dto.summary.fawtara_reference ?? live?.fawtara_reference ?? undefined,
      state: 'done',
    })
  } else if (leg?.ack === 'RE') {
    steps.push({
      id: 'refused',
      labelKey: 'activityDetail.step.turnedDown',
      at: stampOf(leg.ack_at, language),
      note: live?.error_code ?? undefined,
      state: 'failed',
    })
  } else if (leg && liveSubmitted && !liveStopped) {
    steps.push({
      id: 'waiting',
      labelKey: 'activityDetail.step.waitingOnOta',
      at: null,
      state: 'waiting',
    })
  }

  const attempts = Math.max(1, lineage.length)
  const verdict: Pick<Journey, 'verdictKey' | 'verdictValues' | 'tone'> =
    outcome === 'accepted'
      ? attempts === 1
        ? { verdictKey: 'activityDetail.verdict.accepted', tone: 'good' }
        : {
            verdictKey: 'activityDetail.verdict.acceptedOnTry',
            verdictValues: { count: attempts },
            tone: 'good',
          }
      : outcome === 'deliveredUnconfirmed'
        ? { verdictKey: 'activityDetail.verdict.deliveredUnconfirmed', tone: 'waiting' }
        : outcome === 'rejected'
          ? { verdictKey: 'activityDetail.verdict.turnedDown', tone: 'bad' }
          : outcome === 'superseded'
            ? // We replaced or cancelled this report ourselves (TDD type R or D).
              { verdictKey: 'activityDetail.verdict.replaced', tone: 'waiting' }
            : outcome === 'notSent'
              ? { verdictKey: 'activityDetail.verdict.notSentYet', tone: 'waiting' }
              : { verdictKey: 'activityDetail.verdict.waiting', tone: 'waiting' }

  return {
    id: 'ota',
    titleKey: 'activityDetail.toTaxAuthority',
    // The receiving side reports that it received the document (TDT-010 = 02 Receiver).
    subtitleKey:
      dto.summary.direction === 'RECEIVED'
        ? 'activityDetail.receiptReportedNote'
        : 'activityDetail.toTaxAuthorityNote',
    ...(outcome === 'stopped' || ((outcome === 'waiting' || outcome === 'notSent') && liveStopped)
      ? { verdictKey: 'activityDetail.verdict.stoppedAtFawtir', tone: 'bad' as const }
      : verdict),
    steps,
  }
}

const MLS_STEP: Record<string, { labelKey: string; state: StepState }> = {
  AB: { labelKey: 'activityDetail.step.confirmedReceipt', state: 'done' },
  AP: { labelKey: 'activityDetail.step.theyAccepted', state: 'done' },
  RE: { labelKey: 'activityDetail.step.theyRefused', state: 'failed' },
}

/**
 * A document a supplier sent us: it arrived over Peppol and was validated here. The receipt moment
 * is the one the receiving side reports on its TDD (PINT-OM TDOM-04 date, TDOM-05 time).
 */
function receivedJourney(dto: ActivityDetailDto, language: string): Journey {
  const item = dto.summary
  // TODO(backend): ACTIVITY.md 2.25. No receipt time on the item yet; the ledger's moment stands in.
  const arrived = item.received_at ?? item.occurred_at
  return {
    id: 'peppol',
    titleKey: 'activityDetail.fromSupplier',
    subtitleKey: 'activityDetail.toCustomerNote',
    verdictKey: 'activityDetail.verdict.received',
    tone: 'good',
    steps: [
      {
        id: 'arrived',
        labelKey: 'activityDetail.step.arrivedOverPeppol',
        at: stampOf(arrived, language),
        state: 'done',
      },
      {
        id: 'validated',
        labelKey: 'activityDetail.step.validated',
        at: stampOf(item.validated_at, language),
        state: item.validated_at ? 'done' : 'waiting',
      },
    ],
  }
}

/**
 * Proof that the invoice left over AS4. QUEUED and SENDING are only a row waiting in our outbox,
 * and `attempts` also counts failures before anything was sent; an MDN (SENT and the delivered
 * states, or SENT_AWAITING_MDN on the row) or a reply from their side is proof.
 */
const SENT_INVOICE_STATES = new Set([
  'SENT',
  'DELIVERED',
  'DELIVERED_UNCONFIRMED',
  'C4_UNREACHABLE',
])
const SENT_TRANSMISSION_STATES = new Set(['SENT_AWAITING_MDN', 'DELIVERED'])

const invoiceTransmissions = (dto: ActivityDetailDto) =>
  (dto.transmissions ?? []).filter(
    (row) => row.channel === 'INVOICE' && row.direction === 'OUTBOUND',
  )

function onTheWire(dto: ActivityDetailDto, replies: number): boolean {
  const state = dto.summary.transport_state?.toUpperCase() ?? ''
  return (
    SENT_INVOICE_STATES.has(state) ||
    replies > 0 ||
    invoiceTransmissions(dto).some((row) => SENT_TRANSMISSION_STATES.has(row.state))
  )
}

/** The transport gave up (UNDELIVERABLE, or its row dead-lettered) without sending it. */
function transportFailed(dto: ActivityDetailDto): boolean {
  return (
    dto.summary.transport_state?.toUpperCase() === 'UNDELIVERABLE' ||
    invoiceTransmissions(dto).some((row) => row.state === 'DEAD_LETTERED')
  )
}

function peppolJourney(dto: ActivityDetailDto, language: string): Journey | null {
  const item = dto.summary
  if (item.direction === 'RECEIVED') return receivedJourney(dto, language)
  // A walk-in sale or a buyer off Peppol is reported only: nothing travels to a customer.
  // An export to a buyer off Peppol is reported under TDD scope INP (ACTIVITY.md 2.32).
  if (item.b2c || item.scenario?.stand_in_id || item.tdd_scope === 'INP') return null
  const replies = [...dto.mls]
    .filter((record: MlsRecordDto) => record.ack !== 'NONE')
    .sort((a, b) => (a.received_at ?? '').localeCompare(b.received_at ?? ''))
  const wire = onTheWire(dto, replies.length)
  const undeliverable = !wire && transportFailed(dto)
  const steps: JourneyStep[] = [
    // The API carries no signing time or state: AS4 signs the message on its way out, so only
    // a message that went on the wire is known to have been signed.
    wire
      ? {
          id: 'signed',
          labelKey: 'activityDetail.step.signed',
          at: stampOf(item.validated_at, language),
          state: 'done',
        }
      : {
          id: 'signed',
          labelKey: 'activityDetail.step.notSigned',
          at: null,
          state: 'waiting',
        },
    wire
      ? {
          id: 'sentPeppol',
          labelKey: 'activityDetail.step.sentOverPeppol',
          at: stampOf(item.occurred_at, language),
          state: 'done',
        }
      : {
          id: 'sentPeppol',
          labelKey: undeliverable
            ? 'activityDetail.step.couldNotSendOverPeppol'
            : 'activityDetail.step.notSentOverPeppol',
          at: null,
          state: undeliverable ? 'failed' : 'waiting',
        },
    // The frame's third step: the buyer's access point took the message (the AS4 receipt).
    // TODO(backend): the item says only that transport finished, not when (asks row 2.23).
    ...(item.transport_state && /^(SENT|DELIVERED)$/i.test(item.transport_state)
      ? [
          {
            id: 'accessPoint',
            labelKey: 'activityDetail.step.accessPointTook',
            at: null,
            state: 'done' as const,
          },
        ]
      : []),
    ...replies.map((record, index) => ({
      id: `mls-${index}`,
      labelKey: MLS_STEP[record.ack].labelKey,
      at: stampOf(record.received_at, language),
      note: `MLS · ${record.ack}`,
      state: MLS_STEP[record.ack].state,
    })),
  ]
  if (replies.length === 0 && wire) {
    steps.push({
      id: 'noReply',
      labelKey: 'activityDetail.step.waitingOnThem',
      at: null,
      state: 'waiting',
    })
  }
  const last = replies[replies.length - 1]?.ack
  const verdict: Pick<Journey, 'verdictKey' | 'tone'> = !wire
    ? undeliverable
      ? { verdictKey: 'activityDetail.verdict.couldNotSend', tone: 'bad' }
      : { verdictKey: 'activityDetail.verdict.notSentYet', tone: 'waiting' }
    : last === 'AP'
      ? { verdictKey: 'activityDetail.deliveredAccepted', tone: 'good' }
      : last === 'AB'
        ? { verdictKey: 'activityDetail.verdict.delivered', tone: 'good' }
        : last === 'RE'
          ? { verdictKey: 'activityDetail.verdict.theyRefused', tone: 'bad' }
          : { verdictKey: 'activityDetail.verdict.noReplyYet', tone: 'waiting' }
  return {
    id: 'peppol',
    titleKey: 'activityDetail.toCustomer',
    subtitleKey: 'activityDetail.toCustomerNote',
    ...verdict,
    steps,
  }
}

function versionsOf(
  dto: ActivityDetailDto,
  outcome: RowOutcome,
  language: string,
): ReportVersion[] {
  const lineage = dto.tdd_lineage
  const leg = dto.summary.tdd_leg
  return lineage
    .map((obligation, index): ReportVersion => {
      const last = index === lineage.length - 1
      const state: ReportVersion['state'] =
        last && (outcome === 'accepted' || outcome === 'deliveredUnconfirmed')
          ? 'live'
          : obligation.status === 'SUPERSEDED'
            ? 'superseded'
            : stoppedAtFawtir(obligation)
              ? 'held'
              : refused(obligation) || (last && leg?.ack === 'RE')
                ? 'rejected'
                : obligation.submitted_at
                  ? 'waiting'
                  : 'notSent'
      return {
        id: obligation.id,
        version: `V${index + 1}`,
        state,
        headlineKey:
          state === 'live'
            ? outcome === 'deliveredUnconfirmed'
              ? 'activityDetail.versions.deliveredOn'
              : 'activityDetail.versions.acceptedOn'
            : !obligation.submitted_at
              ? 'activityDetail.versions.notSent'
              : state === 'waiting' || state === 'held'
                ? 'activityDetail.versions.sentOn'
                : 'activityDetail.versions.turnedDownOn',
        at: whenOf(
          last && state === 'live'
            ? (leg?.ack_at ?? obligation.submitted_at)
            : obligation.submitted_at,
          language,
        ),
        uuid: obligation.tdd_uuid,
        reference:
          obligation.fawtara_reference ?? (last ? (dto.summary.fawtara_reference ?? null) : null),
        bodyKey: `activityDetail.versions.${state}Body`,
      }
    })
    .reverse()
}

export function recordFromDetail(
  dto: ActivityDetailDto,
  language = 'en',
  now = new Date(),
): ActivityRecord {
  const item = dto.summary
  const outcome = outcomeOf(item)
  const lineage = dto.tdd_lineage
  const journeys = [tddJourney(dto, outcome, language), peppolJourney(dto, language)].filter(
    (journey): journey is Journey => journey !== null,
  )

  const refusals = lineage.filter(refused)
  const lastRefusal = refusals[refusals.length - 1]
  const reason =
    lastRefusal?.failure_reason ?? (item.tdd_leg?.ack === 'RE' ? item.tdd_leg.reason : null)
  const code = lastRefusal?.error_code ?? null
  // TODO(backend): ACTIVITY.md 2.30. Classified from the code and the reason until the refusal
  // carries its kind.
  const cause = refusalCauseOf(code, reason)
  const kind = refusalKindOf(cause, lastRefusal?.error_kind ?? item.tdd_leg?.error_kind)
  const rejection = reason
    ? {
        code,
        reason,
        later: outcome === 'accepted' ? ('accepted' as const) : ('open' as const),
        cause,
        kind,
      }
    : null

  const issuedAt = new Date(item.occurred_at)
  const keptUntil = new Date(issuedAt)
  keptUntil.setUTCFullYear(keptUntil.getUTCFullYear() + RETENTION_YEARS)
  const monthsLeft = Math.max(
    0,
    (keptUntil.getUTCFullYear() - now.getUTCFullYear()) * 12 +
      keptUntil.getUTCMonth() -
      now.getUTCMonth(),
  )

  const supersededCount = lineage.filter((obligation) => obligation.status === 'SUPERSEDED').length
  const live = lineage[lineage.length - 1]
  const replies = dto.mls.filter((record) => record.ack !== 'NONE').length

  return {
    invoiceUuid: dto.invoice_uuid,
    direction: item.direction,
    invoice: item.invoice_number,
    customer: item.counterparty,
    issued: dayOf(item.occurred_at, language),
    amount: item.amount ?? null,
    currency: item.currency_code ?? 'OMR',
    outcome,
    attempts: Math.max(1, lineage.length),
    supersededCount,
    journeys,
    rejection,
    versions: versionsOf(dto, outcome, language),
    proof: {
      reference: item.fawtara_reference ?? live?.fawtara_reference ?? null,
      uuid: item.tdd_uuid ?? live?.tdd_uuid ?? null,
      acceptedAt: outcome === 'accepted' ? whenOf(item.tdd_leg?.ack_at ?? null, language) : null,
    },
    route: {
      flow: flowOf(item),
      received: item.direction === 'RECEIVED' || item.reporter_role === '02',
      scope: item.tdd_scope ?? null,
      flowNumber: item.scenario?.flow ?? null,
      standIn: item.scenario?.stand_in_id ?? null,
      mlsCount: replies,
      theirId: item.counterparty_participant_id ?? null,
      profile: profileOf(item.customization_id),
    },
    retention: {
      keptUntil: dayOf(keptUntil.toISOString(), language),
      years: Math.floor(monthsLeft / 12),
      months: monthsLeft % 12,
    },
    copies: [
      ...(live
        ? [
            {
              id: 'accepted' as const,
              titleKey:
                outcome === 'accepted'
                  ? 'activityDetail.copies.accepted'
                  : 'activityDetail.copies.latest',
              metaKey: 'activityDetail.copies.xmlMeta',
              values: { version: lineage.length },
            },
          ]
        : []),
      ...lineage.slice(0, -1).map((_, index) => ({
        id: 'withdrawn' as const,
        titleKey: 'activityDetail.copies.withdrawn',
        metaKey: 'activityDetail.copies.xmlMeta',
        values: { version: index + 1 },
      })),
      ...(outcome === 'accepted'
        ? [
            {
              id: 'ack' as const,
              titleKey: 'activityDetail.copies.ack',
              metaKey: 'activityDetail.copies.ackMeta',
            },
          ]
        : []),
      ...(replies > 0
        ? [
            {
              id: 'replies' as const,
              titleKey: 'activityDetail.copies.replies',
              metaKey: 'activityDetail.copies.repliesMeta',
              values: { count: replies },
            },
          ]
        : []),
      {
        id: 'invoice' as const,
        titleKey: 'activityDetail.copies.invoice',
        metaKey: 'activityDetail.copies.invoiceMeta',
      },
    ],
    resend: item.links.resubmit
      ? rejection?.kind === 'invoice'
        ? 'possibleInvoice'
        : 'possible'
      : outcome === 'accepted' || outcome === 'deliveredUnconfirmed'
        ? // A received document is the supplier's to correct, never ours to reissue.
          item.direction === 'RECEIVED'
          ? 'received'
          : 'accepted'
        : // "Still waiting on the OTA" would be false for a report stopped here or never submitted.
          outcome === 'waiting' && !(live && stoppedAtFawtir(live))
          ? 'waiting'
          : 'none',
    links: item.links,
  }
}
