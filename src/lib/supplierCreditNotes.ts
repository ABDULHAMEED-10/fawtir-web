import type { CreditNoteRowDto, CreditNoteSettlementDto } from '../api/expenditure/notes'
import type { BillRowDto } from '../api/expenditure/bills'
import { receiptReportNote } from './billDetail'
import { creditStateOf } from './supplierNoteList'

/**
 * Credit notes a supplier issued to us: Expenditure > Credit notes (Figma 163:18691, 163:19080,
 * 163:19560).
 *
 * The mirror of the income credit notes: money owed *back* to us for a short delivery, damage,
 * an overcharge or a return. A note either comes off a bill we have not paid, sits as credit
 * until a later bill, or is refunded once the bill is settled, and that three-way choice is what
 * every screen here is organised around. Everything below derives what the frames print from
 * what the API carries; nothing is asserted.
 */

export type CreditUse = 'setAgainst' | 'hold' | 'refund'

/** The formatters a screen hands in, so the sentences come back ready to print. */
export type NoteFormat = {
  money: (value: number) => string
  date: (iso: string) => string
  /** A timestamp as day and time. */
  when: (iso: string) => string
}

export type NoteActivity = {
  id: string
  titleKey: string
  detailKey: string
  values?: Record<string, string | number>
  tone: 'current' | 'done'
}

/** The three tiles of the banner: what they billed, this credit, what you now pay. */
export type CreditEffect = {
  billed: number | null
  credit: number
  willPay: number | null
  outstanding: number | null
}

/**
 * "They billed − this credit = you'll pay". The bill's total is what they billed.
 *
 * What is left to pay starts from what the bill still owes, and the server already takes off
 * that figure every credit it has applied. So only the part of the credit not yet on the bill
 * comes off it here: once this note reduces the bill (`appliedHere`), nothing more does, and the
 * tile shows what it took off; before that, what is left of the note would. Taking the whole
 * credit off `outstandingAmount` again counted it twice (They billed 50 − 10.5 = 29).
 */
export function creditEffect(
  note: { credited: number; applied: number; remaining: number; appliedHere: boolean },
  bill: BillRowDto | null,
): CreditEffect {
  const pending = note.appliedHere ? 0 : Math.max(note.remaining, 0)
  const credit = note.appliedHere ? note.applied : pending > 0 ? pending : note.credited
  if (!bill) return { billed: null, credit, willPay: null, outstanding: null }
  return {
    billed: bill.totalIncludingVat,
    credit,
    willPay: Math.max(bill.outstandingAmount - pending, 0),
    outstanding: bill.outstandingAmount,
  }
}

/** Input VAT already claimed on the bill, less what this note takes off it. */
export function vatEffect(billVat: number | null, noteVat: number | null) {
  const reduced = noteVat ?? 0
  return {
    claimed: billVat,
    reduced,
    reclaimable: billVat === null ? null : Math.max(billVat - reduced, 0),
  }
}

export type ComplianceLine = {
  id: string
  key: string
  values?: Record<string, string | number>
  ok: boolean
}

/**
 * The Compliance card, from what the row states: whether it names the bill it corrects, whether
 * the network validated it, and our own receipt report to the Tax Authority. Validation over
 * Peppol is not a report: under PINT-OM the receiving side reports each document it received as
 * a Tax Data Document with reporter role 02 Receiver (om-tdd), and only `receiptReport` says
 * whether that happened. An uploaded note is neither validated nor reported, and the card says so.
 *
 * TODO(backend): EXPENDITURE.md R.1. `receiptReport` on GET /v1/credit-notes/{id}.
 */
export function creditCompliance(
  row: CreditNoteRowDto,
  day: (iso: string) => string = (iso) => iso.slice(0, 10),
): ComplianceLine[] {
  const verified = row.networkVerified
  const receipt = receiptReportNote(row.receiptReport, day)
  return [
    {
      id: 'valid',
      key: row.credits.billNumber
        ? 'supplierCreditNotes.detail.compliance.valid'
        : 'supplierCreditNotes.detail.compliance.noBill',
      ok: row.credits.billNumber !== null,
    },
    {
      id: 'pintOm',
      key: verified
        ? 'supplierCreditNotes.detail.compliance.pintOm'
        : 'supplierCreditNotes.detail.compliance.notValidated',
      ok: verified,
    },
    row.source === 'PEPPOL'
      ? { id: 'tdd', key: receipt.key, values: receipt.values, ok: receipt.ok }
      : { id: 'tdd', key: 'supplierCreditNotes.detail.compliance.notReported', ok: false },
  ]
}

const SOURCE_ARRIVAL: Record<CreditNoteRowDto['source'], string> = {
  PEPPOL: 'supplierNotes.activity.arrivedPeppol',
  UPLOADED: 'supplierNotes.activity.arrivedUploaded',
  SCANNED: 'supplierNotes.activity.arrivedScanned',
  RECURRING: 'supplierNotes.activity.arrivedRecurring',
  SELF_BILLED: 'supplierNotes.activity.arrivedSelfBilled',
}

/**
 * The Activity list, newest first: where the note stands now, what has been done with it (the
 * settlement rows), whether it was reported, and how it arrived.
 */
export function creditActivity(
  row: CreditNoteRowDto,
  settlements: CreditNoteSettlementDto[],
  fmt: NoteFormat,
): NoteActivity[] {
  const bill = row.credits.billNumber ?? ''
  const credited = row.creditedAmount ?? 0
  const state = creditStateOf(row)
  const current: NoteActivity =
    state === 'PARTLY_USED'
      ? {
          // Part of it is used or refunded (the rows below say which): what is left waits.
          id: 'now',
          titleKey: 'supplierCreditNotes.state.partlyUsed',
          detailKey: 'supplierCreditNotes.detail.activity.waitingNoBill',
          values: { left: fmt.money(row.balance.remaining) },
          tone: 'current',
        }
      : state === 'UNAPPLIED'
        ? {
            id: 'now',
            titleKey: 'supplierCreditNotes.detail.activity.waiting',
            detailKey: bill
              ? 'supplierCreditNotes.detail.activity.waitingDetail'
              : 'supplierCreditNotes.detail.activity.waitingNoBill',
            values: { bill, amount: fmt.money(credited), left: fmt.money(row.balance.remaining) },
            tone: 'current',
          }
        : state === 'WAITING_FOR_BILL'
          ? {
              id: 'now',
              titleKey: 'supplierCreditNotes.detail.activity.waitingBill',
              detailKey: 'supplierCreditNotes.detail.activity.waitingBillDetail',
              values: { amount: fmt.money(row.balance.remaining) },
              tone: 'current',
            }
          : state === 'APPLIED'
            ? {
                id: 'now',
                titleKey: 'supplierCreditNotes.detail.activity.applied',
                detailKey: bill
                  ? settlements.length === 0
                    ? 'supplierCreditNotes.detail.activity.appliedLinked'
                    : 'supplierCreditNotes.detail.activity.appliedDetail'
                  : 'supplierCreditNotes.detail.activity.appliedNoBill',
                values: { bill, amount: fmt.money(row.balance.applied) },
                tone: 'current',
              }
            : {
                id: 'now',
                titleKey: 'supplierCreditNotes.detail.activity.refunded',
                detailKey: 'supplierCreditNotes.detail.activity.refundedDetail',
                values: { amount: fmt.money(row.balance.refunded) },
                tone: 'current',
              }

  const done: NoteActivity[] = [...settlements]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((settlement) => ({
      id: settlement.id,
      titleKey:
        settlement.kind === 'APPLIED'
          ? 'supplierCreditNotes.detail.activity.settledApplied'
          : 'supplierCreditNotes.detail.activity.settledRefunded',
      detailKey:
        settlement.kind === 'APPLIED'
          ? 'supplierCreditNotes.detail.activity.settledAppliedDetail'
          : settlement.paymentReference
            ? 'supplierCreditNotes.detail.activity.settledRefundedRef'
            : 'supplierCreditNotes.detail.activity.settledRefundedDetail',
      values: {
        amount: fmt.money(settlement.amount),
        date: fmt.date(settlement.settledOn),
        reference: settlement.paymentReference ?? '',
        when: fmt.when(settlement.occurredAt),
      },
      tone: 'done' as const,
    }))

  const issued = row.issueDate ? fmt.date(row.issueDate) : ''
  // Only an accepted receipt report is an event to list; validation over Peppol is not one.
  if (row.receiptReport?.status === 'ACCEPTED') {
    done.push({
      id: 'reported',
      titleKey: 'supplierCreditNotes.detail.activity.reported',
      detailKey: 'supplierCreditNotes.detail.activity.reportedDetail',
      values: { date: row.receiptReport.reportedAt ? fmt.when(row.receiptReport.reportedAt) : '' },
      tone: 'done',
    })
  }
  done.push({
    id: 'arrived',
    titleKey: SOURCE_ARRIVAL[row.source],
    detailKey: bill
      ? 'supplierCreditNotes.detail.activity.arrivedDetail'
      : 'supplierCreditNotes.detail.activity.arrivedNoBill',
    values: { bill, date: issued },
    tone: 'done',
  })

  return [current, ...done]
}
