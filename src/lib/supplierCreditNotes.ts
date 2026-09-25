import type { CreditNoteRowDto, CreditNoteSettlementDto } from '../api/expenditure/notes'
import type { BillRowDto } from '../api/expenditure/bills'

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
 * "They billed − this credit = you'll pay". The bill's total is what they billed; what is left to
 * pay comes off what is still outstanding, which is the same figure until something has been
 * paid on it.
 */
export function creditEffect(credit: number, bill: BillRowDto | null): CreditEffect {
  if (!bill) return { billed: null, credit, willPay: null, outstanding: null }
  return {
    billed: bill.totalIncludingVat,
    credit,
    willPay: Math.max(bill.outstandingAmount - credit, 0),
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

export type ComplianceLine = { id: string; key: string; ok: boolean }

/**
 * The Compliance card, from the two facts the row states: whether the platform vouched for the
 * document (validated and reported over Peppol) and whether it names the bill it corrects. An
 * uploaded note is neither validated nor reported, and the card says so rather than ticking it.
 */
export function creditCompliance(row: CreditNoteRowDto): ComplianceLine[] {
  const verified = row.networkVerified
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
    {
      id: 'tdd',
      key: verified
        ? 'supplierCreditNotes.detail.compliance.tdd'
        : 'supplierCreditNotes.detail.compliance.notReported',
      ok: verified,
    },
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
  const current: NoteActivity =
    row.status === 'UNAPPLIED'
      ? {
          id: 'now',
          titleKey: 'supplierCreditNotes.detail.activity.waiting',
          detailKey: bill
            ? 'supplierCreditNotes.detail.activity.waitingDetail'
            : 'supplierCreditNotes.detail.activity.waitingNoBill',
          values: { bill, amount: fmt.money(credited), left: fmt.money(row.balance.remaining) },
          tone: 'current',
        }
      : row.status === 'WAITING_FOR_BILL'
        ? {
            id: 'now',
            titleKey: 'supplierCreditNotes.detail.activity.waitingBill',
            detailKey: 'supplierCreditNotes.detail.activity.waitingBillDetail',
            values: { amount: fmt.money(row.balance.remaining) },
            tone: 'current',
          }
        : row.status === 'APPLIED'
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
  if (row.networkVerified) {
    done.push({
      id: 'reported',
      titleKey: 'supplierCreditNotes.detail.activity.reported',
      detailKey: 'supplierCreditNotes.detail.activity.reportedDetail',
      values: { date: issued },
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
