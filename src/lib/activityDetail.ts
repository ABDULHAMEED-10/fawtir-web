/**
 * One invoice's reporting record — Compliance › Activity › Detail (Figma 131:16862).
 *
 * A document takes two independent journeys and the screen shows both: the Tax Data Document to
 * the Authority via Fawtara, and the invoice itself to the customer over Peppol. Either can fail
 * without the other noticing, which is why they are drawn as two separate timelines rather than
 * one merged history.
 *
 * INV-1993 is the interesting case — rejected once, corrected, accepted on the second attempt —
 * so the screen has to explain a rejection, show both versions, and say which one the Authority
 * actually holds.
 */

/** How a step of a journey ended. */
export type StepState = 'done' | 'failed'

export type JourneyStep = {
  id: string
  labelKey: string
  /** When it happened, as the Authority and the network recorded it. */
  at: string
  /** A second line — who did it, or the reference it produced. */
  noteKey?: string
  note?: string
  state: StepState
}

export type Journey = {
  id: string
  titleKey: string
  subtitleKey: string
  /** The badge on the right of the journey heading. */
  verdictKey: string
  /** Whether that badge reads as a success. */
  settled: boolean
  steps: JourneyStep[]
}

const TDD_JOURNEY: Journey = {
  id: 'ota',
  titleKey: 'activityDetail.toTaxAuthority',
  subtitleKey: 'activityDetail.toTaxAuthorityNote',
  verdictKey: 'activityDetail.acceptedOnSecond',
  settled: true,
  steps: [
    {
      id: 'built',
      labelKey: 'activityDetail.step.reportBuilt',
      at: '8 Jun · 11:20:04',
      state: 'done',
    },
    {
      id: 'sent',
      labelKey: 'activityDetail.step.sentToFawtara',
      at: '8 Jun · 11:20:07',
      state: 'done',
    },
    {
      id: 'turnedDown',
      labelKey: 'activityDetail.step.turnedDown',
      at: '8 Jun · 11:22:31',
      note: 'OTA-E-1122',
      state: 'failed',
    },
    {
      id: 'resent',
      labelKey: 'activityDetail.step.correctedAndResent',
      at: '9 Jun · 08:41:12',
      noteKey: 'activityDetail.byPerson',
      state: 'done',
    },
    {
      id: 'accepted',
      labelKey: 'activityDetail.step.accepted',
      at: '9 Jun · 08:43:05',
      note: 'OM-2026-0083907',
      state: 'done',
    },
  ],
}

const PEPPOL_JOURNEY: Journey = {
  id: 'peppol',
  titleKey: 'activityDetail.toCustomer',
  subtitleKey: 'activityDetail.toCustomerNote',
  verdictKey: 'activityDetail.deliveredAccepted',
  settled: true,
  steps: [
    { id: 'signed', labelKey: 'activityDetail.step.signed', at: '8 Jun · 11:20:04', state: 'done' },
    {
      id: 'sentPeppol',
      labelKey: 'activityDetail.step.sentOverPeppol',
      at: '8 Jun · 11:20:09',
      state: 'done',
    },
    {
      id: 'tookIt',
      labelKey: 'activityDetail.step.accessPointTook',
      at: '8 Jun · 11:21:16',
      state: 'done',
    },
    {
      id: 'confirmed',
      labelKey: 'activityDetail.step.confirmedReceipt',
      at: '8 Jun · 11:24:48',
      note: 'MLS · AB',
      state: 'done',
    },
    {
      id: 'acceptedIt',
      labelKey: 'activityDetail.step.theyAccepted',
      at: '9 Jun · 14:02:31',
      note: 'MLS · AP',
      state: 'done',
    },
  ],
}

/** One version of the report as the Authority saw it. */
export type ReportVersion = {
  id: string
  version: string
  headlineKey: string
  at: string
  uuid: string
  reference?: string
  referenceNoteKey?: string
  bodyKey: string
  /** The version the Authority is actually holding. */
  live: boolean
}

export const ACTIVITY_DETAIL = {
  invoice: 'INV-1993',
  customer: 'Barka Beach Resort',
  issued: '8 Jun 2026',
  amount: '1,842.000',
  attempts: 2,
  supersededCount: 1,

  journeys: [TDD_JOURNEY, PEPPOL_JOURNEY],

  /** Why the first attempt failed. */
  rejection: {
    code: 'OTA-E-1122',
    headlineKey: 'activityDetail.rejection.headline',
    bodyKey: 'activityDetail.rejection.body',
    raw: "TAX_CATEGORY_MISMATCH: cac:ClassifiedTaxCategory/cbc:ID = 'Z' with cbc:Percent = 5.00 at line 2, line 4",
  },

  versions: [
    {
      id: 'v2',
      version: 'V2',
      headlineKey: 'activityDetail.versions.acceptedOn',
      at: '9 Jun 2026, 08:43',
      uuid: '6c25-b840-1f97-5b02',
      reference: 'OM-2026-0083907',
      bodyKey: 'activityDetail.versions.v2Body',
      live: true,
    },
    {
      id: 'v1',
      version: 'V1',
      headlineKey: 'activityDetail.versions.turnedDownOn',
      at: '8 Jun 2026, 11:22',
      uuid: '6c25-b840-1f97-4ae3',
      referenceNoteKey: 'activityDetail.versions.noReference',
      bodyKey: 'activityDetail.versions.v1Body',
      live: false,
    },
  ] satisfies ReportVersion[],

  /** Which Peppol scenario carried it. */
  route: {
    scenarioKey: 'activityDetail.route.flowOne',
    documentsKey: 'activityDetail.route.documents',
    ourId: '0248:OM1100392000',
    theirId: '0248:OM1100558840',
    standInKey: 'activityDetail.route.noStandIn',
    profile: 'PINT-OM 1.0',
  },

  /** The Authority's own record, for checking outside Fawtir. */
  proof: {
    reference: 'OM-2026-0083907',
    uuid: '6c25-b840-1f97-5b02',
    acceptedAt: '9 Jun 2026, 08:43',
  },

  /** Oman VAT Law requires ten years; property would be fifteen. */
  retention: {
    keptUntil: '8 Jun 2036',
    remainingKey: 'activityDetail.retention.remaining',
    reasonKey: 'activityDetail.retention.reason',
    integrityKey: 'activityDetail.retention.checkedToday',
  },

  copies: [
    {
      id: 'accepted',
      titleKey: 'activityDetail.copies.accepted',
      metaKey: 'activityDetail.copies.acceptedMeta',
      size: '6 KB',
    },
    {
      id: 'withdrawn',
      titleKey: 'activityDetail.copies.withdrawn',
      metaKey: 'activityDetail.copies.withdrawnMeta',
      size: '6 KB',
    },
    {
      id: 'ack',
      titleKey: 'activityDetail.copies.ack',
      metaKey: 'activityDetail.copies.ackMeta',
      size: '3 KB',
    },
    {
      id: 'replies',
      titleKey: 'activityDetail.copies.replies',
      metaKey: 'activityDetail.copies.repliesMeta',
      size: '3 KB',
    },
    {
      id: 'invoice',
      titleKey: 'activityDetail.copies.invoice',
      metaKey: 'activityDetail.copies.invoiceMeta',
      size: '160 KB',
    },
  ],

  /** Nothing to resend while the accepted version stands. */
  resend: { possible: false, bodyKey: 'activityDetail.resend.body' },
}
