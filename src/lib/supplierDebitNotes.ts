import type { DebitNoteDecisionDto, DebitNoteRowDto } from '../api/expenditure/notes'
import type { BillRowDto } from '../api/expenditure/bills'
import type { NoteActivity, NoteFormat } from './supplierCreditNotes'

/**
 * Debit notes a supplier issued to us: Expenditure > Debit notes (Figma 163:21057, 163:20010,
 * 163:20528).
 *
 * The opposite of a credit note: an extra charge added after the original bill, a surcharge, a
 * price correction, a late fee. Nothing is owed until somebody here accepts it, which is why
 * every screen is built around one decision: accept, refuse with a reason, or hold.
 */

/** What someone can do with an unchecked charge. */
export type DebitDecision = 'accept' | 'refuse' | 'hold'

export const REFUSAL_REASONS: { id: string; labelKey: string }[] = [
  { id: 'notInRates', labelKey: 'supplierDebitNotes.refuse.notInRates' },
  { id: 'alreadyCharged', labelKey: 'supplierDebitNotes.refuse.alreadyCharged' },
  { id: 'neverAuthorised', labelKey: 'supplierDebitNotes.refuse.neverAuthorised' },
  { id: 'other', labelKey: 'supplierDebitNotes.refuse.other' },
]

/** One line of "Does this look right": the automatic read of the charge against what we hold. */
export type DebitCheck = {
  id: string
  titleKey: string
  detailKey: string
  values?: Record<string, string | number>
  /** `fine` passed, `check` is worth a human's eye before accepting. */
  verdict: 'fine' | 'check'
  /** References inside the detail sentence that should be links. */
  refs?: { token: string; to: string }[]
}

const STATE_KEY: Record<BillRowDto['workflowState'], string> = {
  DRAFT: 'supplierNotes.billState.draft',
  NEW: 'supplierNotes.billState.new',
  MISMATCH: 'supplierNotes.billState.mismatch',
  AWAITING_APPROVAL: 'supplierNotes.billState.awaitingApproval',
  APPROVED: 'supplierNotes.billState.approved',
  ON_HOLD: 'supplierNotes.billState.onHold',
  REJECTED: 'supplierNotes.billState.rejected',
  IN_PAYMENT_RUN: 'supplierNotes.billState.inPaymentRun',
  PAID: 'supplierNotes.billState.paid',
}

export function billStateKey(bill: BillRowDto): string {
  return STATE_KEY[bill.workflowState]
}

/** VAT at Oman's standard rate on a gross figure, to the rial's three places. */
function standardVatOf(total: number): number {
  return Math.round((total * 5 * 1000) / 105) / 1000
}

/**
 * The checks a debit note can be read against from what the API carries: the bill it names, the
 * supplier it came from, whether the network vouched for it, and whether its own VAT adds up.
 *
 * TODO(backend): the frame also reads the charge against the supplier's rate card (agreed price,
 * normal hours, surcharges listed) and the goods receipt's sign-in time, and looks for a repeat of
 * the same charge in the last twelve months. None of that is answered by any endpoint yet: rows
 * 5.9 and 5.10 in docs/backend-guides/EXPENDITURE.md.
 */
export function debitNoteChecks(
  row: DebitNoteRowDto,
  bill: BillRowDto | null,
  fmt: NoteFormat,
): DebitCheck[] {
  const named = row.relatesTo?.billNumber ?? null
  const checks: DebitCheck[] = []

  if (bill) {
    checks.push({
      id: 'realBill',
      titleKey: 'supplierDebitNotes.checks.realBill',
      detailKey:
        bill.outstandingAmount > 0
          ? 'supplierDebitNotes.checks.realBillOpen'
          : 'supplierDebitNotes.checks.realBillPaid',
      values: {
        bill: bill.supplierBillNumber ?? named ?? '',
        outstanding: fmt.money(bill.outstandingAmount),
      },
      verdict: 'fine',
      refs: bill.supplierBillNumber
        ? [{ token: bill.supplierBillNumber, to: `/expenditure/bills/${bill.id}` }]
        : [],
    })
  } else if (named) {
    checks.push({
      id: 'realBill',
      titleKey: 'supplierDebitNotes.checks.billNotFound',
      detailKey: 'supplierDebitNotes.checks.billNotFoundDetail',
      values: { bill: named },
      verdict: 'check',
    })
  } else {
    checks.push({
      id: 'realBill',
      titleKey: 'supplierDebitNotes.checks.noBill',
      detailKey: 'supplierDebitNotes.checks.noBillDetail',
      verdict: 'check',
    })
  }

  checks.push(
    row.supplierId
      ? {
          id: 'supplier',
          titleKey: 'supplierDebitNotes.checks.supplierKnown',
          detailKey: 'supplierDebitNotes.checks.supplierKnownDetail',
          values: { supplier: row.supplierName ?? '' },
          verdict: 'fine',
        }
      : {
          id: 'supplier',
          titleKey: 'supplierDebitNotes.checks.supplierUnknown',
          detailKey: 'supplierDebitNotes.checks.supplierUnknownDetail',
          values: { supplier: row.supplierName ?? '' },
          verdict: 'check',
        },
  )

  // Validated over Peppol is one fact; our own receipt report to the Tax Authority (om-tdd,
  // reporter role 02 Receiver) is another, read only from `receiptReport`.
  // TODO(backend): EXPENDITURE.md R.1. `receiptReport` on GET /v1/debit-notes/{id}.
  const receipt = row.receiptReport ?? null
  checks.push(
    row.networkVerified
      ? {
          id: 'validated',
          titleKey: 'supplierDebitNotes.checks.validated',
          detailKey: !receipt
            ? 'supplierDebitNotes.checks.validatedReceipt.unavailable'
            : receipt.status === 'ACCEPTED'
              ? receipt.reportedAt
                ? 'supplierDebitNotes.checks.validatedReceipt.accepted'
                : 'supplierDebitNotes.checks.validatedReceipt.acceptedUndated'
              : receipt.status === 'SUBMITTED'
                ? 'supplierDebitNotes.checks.validatedReceipt.submitted'
                : receipt.status === 'REJECTED'
                  ? 'supplierDebitNotes.checks.validatedReceipt.rejected'
                  : 'supplierDebitNotes.checks.validatedReceipt.notSubmitted',
          values: { date: receipt?.reportedAt ? fmt.when(receipt.reportedAt) : '' },
          verdict: receipt?.status === 'REJECTED' ? 'check' : 'fine',
        }
      : {
          id: 'validated',
          titleKey: 'supplierDebitNotes.checks.notValidated',
          detailKey: 'supplierDebitNotes.checks.notValidatedDetail',
          verdict: 'check',
        },
  )

  if (row.totalIncludingVat !== null && row.vatAmount !== null) {
    const expected = standardVatOf(row.totalIncludingVat)
    const fine = Math.abs(expected - row.vatAmount) <= 0.001 || row.vatAmount === 0
    checks.push({
      id: 'vat',
      titleKey: fine ? 'supplierDebitNotes.checks.vatAddsUp' : 'supplierDebitNotes.checks.vatOdd',
      detailKey: fine
        ? 'supplierDebitNotes.checks.vatAddsUpDetail'
        : 'supplierDebitNotes.checks.vatOddDetail',
      values: { vat: fmt.money(row.vatAmount), expected: fmt.money(expected) },
      verdict: fine ? 'fine' : 'check',
    })
  } else {
    checks.push({
      id: 'vat',
      titleKey: 'supplierDebitNotes.checks.vatMissing',
      detailKey: 'supplierDebitNotes.checks.vatMissingDetail',
      verdict: 'check',
    })
  }

  return checks
}

/**
 * The same read on an upload, before it is saved: from the supplier chosen, the bill chosen and
 * what the file itself carried.
 */
export function intakeChecks({
  supplierId,
  supplierName,
  bill,
  printedTotal,
  linesTotal,
  fmt,
}: {
  supplierId: string | null
  supplierName: string
  bill: BillRowDto | null
  /** The total the e-invoice file stated, or null for a PDF or photo nothing was read from. */
  printedTotal: number | null
  linesTotal: number | null
  fmt: NoteFormat
}): DebitCheck[] {
  const checks: DebitCheck[] = []
  checks.push(
    bill
      ? {
          id: 'realBill',
          titleKey: 'supplierDebitNotes.checks.realBill',
          detailKey:
            bill.outstandingAmount > 0
              ? 'supplierDebitNotes.checks.realBillOpen'
              : 'supplierDebitNotes.checks.realBillPaid',
          values: {
            bill: bill.supplierBillNumber ?? '',
            outstanding: fmt.money(bill.outstandingAmount),
          },
          verdict: 'fine',
          refs: bill.supplierBillNumber
            ? [{ token: bill.supplierBillNumber, to: `/expenditure/bills/${bill.id}` }]
            : [],
        }
      : {
          id: 'realBill',
          titleKey: 'supplierDebitNotes.checks.noBill',
          detailKey: 'supplierDebitNotes.checks.noBillPick',
          verdict: 'check',
        },
  )
  checks.push(
    supplierId
      ? {
          id: 'supplier',
          titleKey: 'supplierDebitNotes.checks.supplierKnown',
          detailKey: 'supplierDebitNotes.checks.supplierKnownDetail',
          values: { supplier: supplierName },
          verdict: 'fine',
        }
      : !supplierName.trim()
        ? {
            // Nothing chosen or typed yet: say so, rather than quote an empty name.
            id: 'supplier',
            titleKey: 'supplierDebitNotes.checks.supplierNone',
            detailKey: 'supplierDebitNotes.checks.supplierNoneDetail',
            verdict: 'check',
          }
        : {
            id: 'supplier',
            titleKey: 'supplierDebitNotes.checks.supplierUnknown',
            detailKey: 'supplierDebitNotes.checks.supplierUnknownDetail',
            values: { supplier: supplierName },
            verdict: 'check',
          },
  )
  if (printedTotal === null) {
    checks.push({
      id: 'printed',
      titleKey: 'supplierDebitNotes.checks.nothingRead',
      detailKey: 'supplierDebitNotes.checks.nothingReadDetail',
      verdict: 'check',
    })
  } else {
    const fine = linesTotal !== null && Math.abs(linesTotal - printedTotal) <= 0.001
    checks.push({
      id: 'printed',
      titleKey: fine
        ? 'supplierDebitNotes.checks.addsUp'
        : 'supplierDebitNotes.checks.doesNotAddUp',
      detailKey: fine
        ? 'supplierDebitNotes.checks.addsUpDetail'
        : 'supplierDebitNotes.checks.doesNotAddUpDetail',
      values: { printed: fmt.money(printedTotal), lines: fmt.money(linesTotal ?? 0) },
      verdict: fine ? 'fine' : 'check',
    })
  }
  checks.push({
    id: 'repeat',
    titleKey: 'supplierDebitNotes.checks.notRepeat',
    detailKey: 'supplierDebitNotes.checks.notRepeatOnSave',
    verdict: 'fine',
  })
  return checks
}

const SOURCE_ARRIVAL: Record<DebitNoteRowDto['source'], string> = {
  PEPPOL: 'supplierNotes.activity.arrivedPeppolDebit',
  UPLOADED: 'supplierNotes.activity.arrivedUploadedDebit',
  SCANNED: 'supplierNotes.activity.arrivedScannedDebit',
  RECURRING: 'supplierNotes.activity.arrivedRecurringDebit',
  SELF_BILLED: 'supplierNotes.activity.arrivedSelfBilledDebit',
}

/**
 * The Activity list, newest first: the decision that stands, every decision recorded (the server
 * sends them newest first, so a reversal reads before what it reversed), the report, the arrival.
 */
export function debitActivity(
  row: DebitNoteRowDto,
  decisions: DebitNoteDecisionDto[],
  fmt: NoteFormat,
): NoteActivity[] {
  const bill = row.relatesTo?.billNumber ?? ''
  const current: NoteActivity =
    row.status === 'UNCHECKED'
      ? {
          id: 'now',
          titleKey: 'supplierDebitNotes.detail.activity.waiting',
          detailKey: 'supplierDebitNotes.detail.activity.waitingDetail',
          values: { amount: fmt.money(row.totalIncludingVat ?? 0) },
          tone: 'current',
        }
      : row.status === 'ACCEPTED'
        ? {
            id: 'now',
            titleKey: 'supplierDebitNotes.detail.activity.accepted',
            detailKey:
              row.outstandingAmount > 0
                ? 'supplierDebitNotes.detail.activity.acceptedDetail'
                : 'supplierDebitNotes.detail.activity.acceptedSettled',
            values: {
              amount: fmt.money(row.outstandingAmount),
              when: row.decidedAt ? fmt.when(row.decidedAt) : '',
            },
            tone: 'current',
          }
        : {
            id: 'now',
            titleKey: 'supplierDebitNotes.detail.activity.refused',
            detailKey: row.decisionReason
              ? 'supplierDebitNotes.detail.activity.refusedDetail'
              : 'supplierDebitNotes.detail.activity.refusedPlain',
            values: {
              reason: row.decisionReason ?? '',
              when: row.decidedAt ? fmt.when(row.decidedAt) : '',
            },
            tone: 'current',
          }

  const history: NoteActivity[] = decisions.map((decision, index) => ({
    id: `decision-${index}`,
    titleKey:
      decision.decision === 'ACCEPTED'
        ? 'supplierDebitNotes.detail.activity.decidedAccepted'
        : decision.decision === 'REFUSED'
          ? 'supplierDebitNotes.detail.activity.decidedRefused'
          : 'supplierDebitNotes.detail.activity.decidedUnchecked',
    detailKey: decision.reason
      ? 'supplierDebitNotes.detail.activity.decidedWithReason'
      : 'supplierDebitNotes.detail.activity.decidedAt',
    values: { reason: decision.reason ?? '', when: fmt.when(decision.decidedAt) },
    tone: 'done',
  }))

  const issued = row.issueDate ? fmt.date(row.issueDate) : ''
  const done: NoteActivity[] = [...history]
  // Only an accepted receipt report is an event to list; validation over Peppol is not one.
  if (row.receiptReport?.status === 'ACCEPTED') {
    done.push({
      id: 'reported',
      titleKey: 'supplierDebitNotes.detail.activity.reported',
      detailKey: 'supplierDebitNotes.detail.activity.reportedDetail',
      values: { date: row.receiptReport.reportedAt ? fmt.when(row.receiptReport.reportedAt) : '' },
      tone: 'done',
    })
  }
  done.push({
    id: 'arrived',
    titleKey: SOURCE_ARRIVAL[row.source],
    detailKey: bill
      ? 'supplierDebitNotes.detail.activity.arrivedDetail'
      : 'supplierDebitNotes.detail.activity.arrivedNoBill',
    values: { bill, date: issued },
    tone: 'done',
  })
  return [current, ...done]
}
