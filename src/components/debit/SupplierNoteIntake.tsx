import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DateField, withRial } from '../ui'
import { Notice } from '../feedback/ApiNotice'
import { FieldLabel, TextField } from '../form'
import { SupplierPicker } from '../bills'
import { LineTaxSelect } from '../bills/BillIntakeForm'
import { selectAllOnFocus } from '../invoice'
import { DebitChecks } from './DebitChecks'
import { InfoNote, SignedAmount, TONE } from './NoteParts'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import { ApiError } from '../../api/errors'
import {
  confirmIntake,
  discardIntake,
  possibleDuplicateOf,
  type ConfirmedBillDto,
  type IntakeDto,
  type PossibleDuplicateDto,
} from '../../api/expenditure/billIntake'
import { billListPath, loadBillPage, type BillRowDto } from '../../api/expenditure/bills'
import { acceptDebitNote, refuseDebitNote } from '../../api/expenditure/notes'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  CONFIRM_REFUSALS,
  billProblems,
  blankLine,
  fileKindOf,
  fromIntake,
  linesTotals,
  toConfirmation,
  type BillField,
  type BillForm,
  type BillLine,
  type BillProblems,
} from '../../lib/billIntake'
import type { CreditUse, NoteFormat } from '../../lib/supplierCreditNotes'
import { creditEffect, vatEffect } from '../../lib/supplierCreditNotes'
import {
  REFUSAL_REASONS,
  billStateKey,
  intakeChecks,
  type DebitDecision,
} from '../../lib/supplierDebitNotes'
import { formatAmount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import fileIcon from '../../assets/bill-capture/file.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import matchOkIcon from '../../assets/bills/match-ok.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import billIcon from '../../assets/invoice-details/credit-note.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'

const SHELL = 'border-primary-300 bg-surface-tab-bar'
const ZOOM_STEPS = [0.75, 1, 1.25, 1.5]
const SEARCH_DELAY_MS = 250
/** A supplier's debit note (UNCL1001 383), listed among the bills by `GET /bills`. */
const DEBIT_NOTE_CODE = '383'

const REQUEST_FIELDS: Record<string, BillField> = {
  supplierName: 'supplier',
  supplierId: 'supplier',
  billNumber: 'billNumber',
  issueDate: 'issueDate',
  dueDate: 'dueDate',
  currency: 'currency',
  vat: 'vat',
  total: 'total',
}

export type NoteKind = 'credit' | 'debit'

/**
 * A supplier's credit or debit note, typed beside its file and confirmed through bill intake
 * (Figma 163:19080 "Upload a credit note", 163:20010 "Upload a debit note").
 *
 * Both frames draw the same composer, one green and one sand: the file, who sent it, which bill
 * it corrects or adds to and what that changes, the lines, and then the choice the note calls
 * for: how to use a credit, or whether to accept a charge. It is confirmed exactly as a bill is
 * (`POST /v1/bills/intake/{id}/confirm`, `documentTypeCode` 381 or 383). A credit set against
 * the chosen bill is applied by that same request (`relatedBillId`); held as credit, the bill is
 * sent with `holdAsCredit` and kept only as the note's reference. A charge's decision is then
 * carried out with the note's own endpoints, `POST /debit-notes/{id}/accept` / `/refuse`. The
 * total and the VAT sent are the lines' own figures, through the same engine every invoice uses.
 *
 * Nothing is read out of a PDF or a photo; only a Peppol/UBL XML file fills fields in.
 */
export function SupplierNoteIntake({
  kind,
  intake,
  file,
  cancelTo,
  onReplace,
  onSaved,
}: {
  kind: NoteKind
  intake: IntakeDto
  file: File
  cancelTo: string
  /** After the intake is discarded, so the picker can be shown again. */
  onReplace: () => void
  /** The confirmed note, and the key (and values) of the sentence that says what was done. */
  onSaved: (note: ConfirmedBillDto, doneKey: string, doneValues?: Record<string, string>) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canDecide = can(session, 'invoice.approve')
  const tone = TONE[kind]
  const ns = kind === 'credit' ? 'supplierCreditNotes.upload' : 'supplierDebitNotes.upload'
  const sign = kind === 'credit' ? '−' : '+'

  const [form, setForm] = useState<BillForm>(() => fromIntake(intake))
  const [vatNumber, setVatNumber] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<BillProblems>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<PossibleDuplicateDto | null>(null)
  const [saved, setSaved] = useState<ConfirmedBillDto | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const [chosenBill, setChosenBill] = useState<BillRowDto | null>(null)
  const [use, setUse] = useState<CreditUse>('setAgainst')
  const [decision, setDecision] = useState<DebitDecision>('hold')
  const [preset, setPreset] = useState<string>(REFUSAL_REASONS[0].id)
  const [otherReason, setOtherReason] = useState('')
  const [zoomIndex, setZoomIndex] = useState(1)

  const set = (patch: Partial<BillForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    // A changed supplier or number is a different question: the duplicate warning no longer applies.
    if ('supplierId' in patch || 'supplierName' in patch || 'billNumber' in patch)
      setDuplicate(null)
  }
  const setLine = (id: string, patch: Partial<BillLine>) =>
    set({ lines: form.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)) })

  const totals = useMemo(() => linesTotals(form.lines), [form.lines])
  const money = (value: number | string) => formatAmount(value, form.currency, language)
  const fmt: NoteFormat = {
    money: (value) => money(value),
    date: (iso) => formatDate(iso, language),
    when: (iso) => iso,
  }
  const error = (field: BillField) => (errors[field] ? t(errors[field]!) : undefined)

  const printedTotal =
    intake.extractionStatus === 'EXTRACTED' ? (intake.extracted?.total ?? null) : null
  const linesTotal = totals ? Number(totals.total) : null
  const addsUp =
    printedTotal !== null && linesTotal !== null && Math.abs(printedTotal - linesTotal) <= 0.001

  const effect = creditEffect(linesTotal ?? 0, chosenBill)
  // A credit note may correct one of the supplier's debit notes; its sentences then name the debit
  // note rather than "the bill". A refused one is closed by the credit whichever choice is made, so
  // the choice is not offered for it.
  const debitNoteChosen = kind === 'credit' && chosenBill?.documentTypeCode === DEBIT_NOTE_CODE
  const refusedDebitNote = debitNoteChosen && chosenBill?.debitNoteDecision === 'REFUSED'
  const vat = vatEffect(chosenBill?.vatAmount ?? null, totals ? Number(totals.vat) : null)
  const checks =
    kind === 'debit'
      ? intakeChecks({
          supplierId: form.supplierId,
          supplierName: form.supplierName,
          bill: chosenBill,
          printedTotal,
          linesTotal,
          fmt,
        })
      : []
  const worries = checks.filter((check) => check.verdict === 'check').length
  // The credit footer reads "Everything checked" in the frame; until the four required fields are
  // filled it says how many are left, so an empty form never claims to be checked.
  const toFill = [
    form.supplierId || form.supplierName.trim(),
    form.billNumber.trim(),
    form.issueDate,
    reason.trim(),
  ].filter((value) => !value).length

  const refusalReason =
    preset === 'other' ? otherReason.trim() : t(`supplierDebitNotes.refuse.${preset}`)
  const followUp =
    kind === 'credit'
      ? use === 'setAgainst' && chosenBill
        ? 'apply'
        : 'none'
      : decision === 'accept' && canDecide
        ? 'accept'
        : decision === 'refuse' && canDecide
          ? 'refuse'
          : 'none'

  // A debit note chosen, the button names it (owner, 9 Oct 2026); a refused one is closed by the
  // credit whatever was picked before it was chosen.
  const primaryLabel =
    debitNoteChosen && (followUp === 'apply' || refusedDebitNote)
      ? t('supplierCreditNotes.upload.saveAndSetDebitNote')
      : followUp === 'apply'
        ? t('supplierCreditNotes.upload.saveAndSet')
        : followUp === 'accept'
          ? t('supplierDebitNotes.upload.saveAndAccept')
          : followUp === 'refuse'
            ? t('supplierDebitNotes.upload.saveAndRefuse')
            : t(`${ns}.save`)

  const save = async (notDuplicateOf: string | null) => {
    if (inFlight.current || saved) return
    const submitted: BillForm = { ...form, total: totals?.total ?? '', vat: totals?.vat ?? '' }
    const problems = billProblems(submitted, { needsNumber: true })
    if (form.lines.length === 0) problems.lines = 'supplierNotes.error.needLine'
    if (kind === 'credit' && !reason.trim()) problems.dueDate = undefined
    setErrors(problems)
    const reasonMissing = kind === 'credit' && !reason.trim()
    if (Object.keys(problems).some((key) => problems[key as BillField]) || reasonMissing) {
      setNotice(t('billIntake.fixFirst'))
      return
    }
    if (followUp === 'refuse' && refusalReason === '') {
      setNotice(t('supplierNotes.error.needReason'))
      return
    }
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      // A credit note sends the reason as typed (`reasonDetail`; the form has no CL-02-OM code
      // to pick, so no `reasonCode`) and the chosen bill, if any. Set against it, the server
      // takes the credit off that bill in the same request (the largest amount that fits) or
      // refuses the whole save. Held as credit (`holdAsCredit`), the bill is kept as the note's
      // reference and nothing is applied. A debit note's form has no reason box, so it sends no
      // reason, and never `holdAsCredit`; its chosen bill is sent too, and the server only
      // records it as the bill the charge adds to, so the note can link to it.
      const note = await confirmIntake(
        intake.id,
        toConfirmation(submitted, {
          notDuplicateOf,
          documentTypeCode: kind === 'credit' ? '381' : '383',
          ...(kind === 'credit' ? { reasonDetail: reason } : {}),
          ...(chosenBill ? { relatedBillId: chosenBill.id } : {}),
          ...(kind === 'credit' && chosenBill && use === 'hold' ? { holdAsCredit: true } : {}),
        }),
      )
      setSaved(note)
      // Whether any credit came off the bill is the confirm answer's to say (`creditApplied`):
      // a bill that already owed nothing takes none, so the credit is held. An older server
      // does not say; then the bill as listed decides.
      const applied =
        note.creditApplied !== undefined
          ? note.creditApplied !== null
          : followUp === 'apply' && chosenBill!.outstandingAmount > 0
      let doneKey =
        kind === 'credit'
          ? refusedDebitNote
            ? 'supplierCreditNotes.upload.savedClosesRefusedDebitNote'
            : applied
              ? debitNoteChosen
                ? 'supplierCreditNotes.upload.savedAppliedDebitNote'
                : 'supplierCreditNotes.upload.savedApplied'
              : 'supplierCreditNotes.upload.savedHeld'
          : 'supplierDebitNotes.upload.savedHeld'
      const doneValues = refusedDebitNote
        ? { note: chosenBill?.supplierBillNumber ?? '' }
        : undefined
      try {
        if (followUp === 'accept') {
          await acceptDebitNote(note.id)
          doneKey = 'supplierDebitNotes.upload.savedAccepted'
        } else if (followUp === 'refuse') {
          await refuseDebitNote(note.id, refusalReason)
          doneKey = 'supplierDebitNotes.upload.savedRefused'
        }
      } catch (failure) {
        // The note is saved; only the choice after it failed. Say so and open the note, where
        // the same choice can be made again.
        const described = describeApiFailure(failure)
        setNotice(`${t('supplierNotes.savedButNot')} ${t(described.key, described.values)}`)
        return
      }
      onSaved(note, doneKey, doneValues)
    } catch (failure) {
      refuse(failure)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const refuse = (failure: unknown) => {
    const same = possibleDuplicateOf(failure)
    if (same) {
      setDuplicate(same)
    } else if (failure instanceof ApiError && failure.code && CONFIRM_REFUSALS[failure.code]) {
      const refusal = CONFIRM_REFUSALS[failure.code]
      if (refusal.field) setErrors({ [refusal.field]: refusal.key })
      setNotice(refusal.field ? t('billIntake.fixFirst') : t(refusal.key))
    } else if (failure instanceof ApiError && failure.fieldErrors.length > 0) {
      const placed: BillProblems = {}
      for (const entry of failure.fieldErrors) {
        const path = entry.field.replace(/^extracted\./, '')
        const field = path.startsWith('lines') ? 'lines' : REQUEST_FIELDS[path.split('.')[0]]
        if (field)
          placed[field] = field === 'lines' ? 'billIntake.error.lines' : 'billIntake.error.refused'
      }
      setErrors(placed)
      setNotice(t('billIntake.fixFirst'))
    } else {
      const described = describeApiFailure(failure)
      setNotice(t(described.key, described.values))
    }
  }

  const discard = async () => {
    // Best effort: an intake left behind is listed as unconfirmed, not lost.
    await discardIntake(intake.id).catch(() => undefined)
  }

  const replace = async () => {
    await discard()
    onReplace()
  }

  const zoom = ZOOM_STEPS[zoomIndex]
  const sizeKb = Math.max(1, Math.round(intake.byteSize / 1024))

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save(null)
      }}
      className="flex flex-col gap-4"
    >
      {/* The file: a credit note's banner is blue, a charge's is sand. */}
      <div
        className={[
          'flex flex-wrap items-center justify-between gap-4 rounded-sm border p-4',
          kind === 'credit'
            ? 'border-primary-300 bg-primary-25'
            : 'border-pending-200 bg-pending-100',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
            <img src={fileIcon} alt="" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-[1.2] text-text-primary">
              {file.name}
            </p>
            <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
              {t(`${ns}.fileMetaRead`, {
                size: `${sizeKb} KB`,
                read: t(
                  intake.extractionStatus === 'EXTRACTED'
                    ? 'supplierNotes.file.readXml'
                    : 'supplierNotes.file.notRead',
                ),
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void replace()}
          disabled={busy || saved !== null}
          className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70 disabled:opacity-50"
        >
          {t('uploadBill.replaceFile')}
        </button>
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={
            saved
              ? {
                  label: t('supplierNotes.openSaved'),
                  to:
                    kind === 'credit'
                      ? `/expenditure/credit-notes/${saved.id}`
                      : `/expenditure/debit-notes/${saved.id}`,
                }
              : { label: t('common.close'), onClick: () => setNotice(null) }
          }
        />
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row">
        <FilePane
          file={file}
          intake={intake}
          zoom={zoom}
          zoomIndex={zoomIndex}
          onZoom={setZoomIndex}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Who sent it */}
          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t(`${ns}.whoSentIt`)}
            </h2>
            <div className="mt-4 flex flex-col gap-1.5">
              <FieldLabel label={t(`${ns}.supplier`)} required htmlFor="note-supplier" />
              <SupplierPicker
                id="note-supplier"
                value={{ id: form.supplierId, name: form.supplierName, vatNumber }}
                onPick={(picked) => {
                  setVatNumber(picked.vatNumber)
                  setChosenBill(null)
                  set({ supplierId: picked.id, supplierName: picked.name })
                }}
                error={error('supplier')}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField
                id="note-number"
                name="billNumber"
                label={t(`${ns}.number`)}
                required
                maxLength={200}
                value={form.billNumber}
                onChange={(billNumber) => set({ billNumber })}
                error={error('billNumber')}
              />
              <div className="flex flex-col gap-1.5">
                <FieldLabel label={t(`${ns}.issued`)} required />
                <DateField
                  value={form.issueDate}
                  onChange={(issueDate) => set({ issueDate })}
                  ariaLabel={t(`${ns}.issued`)}
                />
                {error('issueDate') ? (
                  <p role="alert" className="text-xs font-medium text-text-danger">
                    {error('issueDate')}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Which bill */}
          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t(`${ns}.whichBill`)}
            </h2>
            <BillChooser
              kind={kind}
              supplierId={form.supplierId}
              supplierName={form.supplierName}
              excludeId={intake.confirmedBillId}
              chosen={chosenBill}
              onChoose={setChosenBill}
              language={language}
            />
            {chosenBill ? (
              <div className={['mt-4 rounded-sm border p-4', tone.banner].join(' ')}>
                <p
                  className={[
                    'text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px]',
                    tone.figure,
                  ].join(' ')}
                >
                  {t(
                    kind === 'credit'
                      ? 'supplierCreditNotes.upload.whatThisChanges'
                      : 'supplierDebitNotes.upload.whatWouldChange',
                  )}
                </p>
                <div className="mt-3 flex items-stretch gap-2.5 max-md:flex-col">
                  {[
                    {
                      key: kind === 'credit' ? 'theyBilled' : 'theyBilled',
                      value: effect.billed ?? 0,
                      op: sign,
                    },
                    {
                      key: kind === 'credit' ? 'thisCredit' : 'thisCharge',
                      value: linesTotal ?? 0,
                      op: '=',
                    },
                    {
                      key: kind === 'credit' ? 'youllPay' : 'youdPay',
                      value:
                        kind === 'credit'
                          ? (effect.willPay ?? 0)
                          : (effect.outstanding ?? 0) + (linesTotal ?? 0),
                    },
                  ].map((tile) => (
                    <div
                      key={tile.key}
                      className="flex min-w-0 flex-1 items-center gap-2.5 max-md:flex-col max-md:items-stretch"
                    >
                      <div
                        className={[
                          'min-w-0 flex-1 rounded-sm border bg-white px-3.5 py-3',
                          tone.tile,
                        ].join(' ')}
                      >
                        <p className="text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.5px] text-text-tertiary">
                          {t(`${ns}.${tile.key}`)}
                        </p>
                        <p className="mt-2 text-lg font-semibold leading-[1.2] text-text-primary">
                          <SignedAmount value={money(tile.value)} />
                        </p>
                      </div>
                      {tile.op ? (
                        <span className="flex size-6 shrink-0 items-center justify-center self-center rounded-full bg-white text-sm font-semibold text-text-tertiary">
                          {tile.op}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {kind === 'debit' ? (
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('supplierDebitNotes.upload.looksRight')}
              </h2>
              <DebitChecks
                checks={checks}
                fineLabel={t('supplierDebitNotes.upload.fine')}
                checkLabel={t('supplierDebitNotes.upload.check')}
                summaryTitle={
                  worries === 0
                    ? t('supplierDebitNotes.checks.summaryFine')
                    : t('supplierDebitNotes.checks.summaryBeforeAccept', { count: worries })
                }
                summaryBody={
                  worries === 0
                    ? t('supplierDebitNotes.checks.summaryFineBody')
                    : t('supplierDebitNotes.checks.summaryBeforeAcceptBody')
                }
              />
            </section>
          ) : null}

          {/* Lines */}
          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t(
                kind === 'credit'
                  ? 'supplierCreditNotes.upload.whatsCredited'
                  : 'supplierDebitNotes.upload.charging',
              )}
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                    {(
                      [
                        'description',
                        'qty',
                        'rate',
                        'vat',
                        kind === 'credit' ? 'credit' : 'charge',
                      ] as const
                    ).map((key, index) => (
                      <th
                        key={key}
                        className={[
                          'pb-2 font-semibold',
                          index === 0 ? 'text-start' : 'text-end',
                        ].join(' ')}
                      >
                        {t(`${ns}.col.${key}`)}
                      </th>
                    ))}
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, index) => (
                    <tr key={line.id}>
                      <td className="py-1.5 pe-2">
                        <input
                          value={line.description}
                          onChange={(event) =>
                            setLine(line.id, { description: event.target.value })
                          }
                          aria-label={t(`${ns}.col.description`)}
                          maxLength={500}
                          className={[
                            'h-[42px] w-full rounded-sm border px-3 text-sm font-medium text-text-secondary outline-none',
                            SHELL,
                          ].join(' ')}
                        />
                      </td>
                      {(['quantity', 'unitPrice'] as const).map((key) => (
                        <td key={key} className="px-1 py-1.5">
                          <input
                            value={line[key]}
                            inputMode="decimal"
                            onFocus={selectAllOnFocus}
                            onChange={(event) => setLine(line.id, { [key]: event.target.value })}
                            aria-label={t(`billIntake.lineField.${key}`)}
                            className={[
                              'h-[42px] w-[72px] rounded-sm border px-2 text-end text-sm font-medium text-text-secondary outline-none',
                              SHELL,
                            ].join(' ')}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1.5">
                        <span className="block w-[72px]">
                          <LineTaxSelect
                            line={line}
                            onChange={(patch) => setLine(line.id, patch)}
                            ariaLabel={t('billIntake.lineField.vatRate')}
                          />
                        </span>
                      </td>
                      <td className="py-1.5 ps-1">
                        <span
                          className={[
                            'flex h-[42px] w-[86px] items-center justify-end rounded-sm border px-2 text-sm font-semibold text-text-secondary tabular-nums',
                            SHELL,
                          ].join(' ')}
                        >
                          {totals ? money(totals.lineNets[index]) : '0.000'}
                        </span>
                      </td>
                      <td className="py-1.5 ps-1">
                        <button
                          type="button"
                          onClick={() =>
                            set({ lines: form.lines.filter((other) => other.id !== line.id) })
                          }
                          aria-label={t(`${ns}.removeLine`)}
                          className="inline-flex size-8 items-center justify-center rounded-sm hover:bg-surface-background"
                        >
                          <img src={deleteIcon} alt="" className="size-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error('lines') ? (
              <p role="alert" className="mt-2 text-xs font-medium text-text-danger">
                {error('lines')}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => set({ lines: [...form.lines, blankLine()] })}
              className="mt-3 inline-flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t(`${ns}.addLine`)}
            </button>

            {kind === 'credit' ? (
              <div className="mt-4 flex flex-col gap-1.5">
                <FieldLabel
                  label={t('supplierCreditNotes.upload.reason')}
                  required
                  htmlFor="note-reason"
                />
                <input
                  id="note-reason"
                  value={reason}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  className={[
                    'h-[50px] rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none',
                    SHELL,
                  ].join(' ')}
                />
                {notice && !reason.trim() ? (
                  <p role="alert" className="text-xs font-medium text-text-danger">
                    {t('validation.required')}
                  </p>
                ) : null}
              </div>
            ) : null}

            <dl className="ms-auto mt-5 w-full max-w-[320px]">
              <div className="flex items-center justify-between gap-4 py-1.5">
                <dt className="text-sm font-medium text-text-tertiary">
                  {t(
                    kind === 'credit'
                      ? 'supplierCreditNotes.upload.netCredited'
                      : 'supplierDebitNotes.upload.netCharged',
                  )}
                </dt>
                <dd className="text-sm font-semibold text-text-secondary">
                  <SignedAmount sign={sign} value={money(totals?.net ?? 0)} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-1.5">
                <dt className="text-sm font-medium text-text-tertiary">
                  {t('supplierNotes.vatRow')}
                </dt>
                <dd className="text-sm font-semibold text-text-secondary">
                  <SignedAmount sign={sign} value={money(totals?.vat ?? 0)} />
                </dd>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3">
                <dt className="text-base font-semibold text-text-primary">
                  {t(
                    kind === 'credit'
                      ? 'supplierCreditNotes.upload.totalCredit'
                      : 'supplierDebitNotes.upload.totalCharged',
                  )}
                </dt>
                <dd className={['text-[22px] font-semibold leading-[1.2]', tone.figure].join(' ')}>
                  <SignedAmount sign={sign} value={money(totals?.total ?? 0)} />
                </dd>
              </div>
            </dl>

            <div
              className={[
                'mt-4 rounded-sm px-3.5 py-3',
                printedTotal === null || addsUp ? 'bg-success-100' : 'bg-[#faf5ea]',
              ].join(' ')}
            >
              <p
                className={[
                  'flex items-start gap-1.5 text-xs font-medium leading-[1.4]',
                  printedTotal === null || addsUp ? 'text-success-700' : 'text-[#887147]',
                ].join(' ')}
              >
                <img
                  src={printedTotal === null || addsUp ? matchOkIcon : warnIcon}
                  alt=""
                  className="mt-px size-4 shrink-0"
                />
                {printedTotal === null
                  ? t('supplierNotes.linesAsTyped')
                  : addsUp
                    ? t(`${ns}.addsUp`)
                    : t(`${ns}.doesNotAddUp`, { printed: money(printedTotal) })}
              </p>
            </div>
          </section>

          {kind === 'credit' ? (
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('supplierCreditNotes.upload.howToUse')}
              </h2>
              {refusedDebitNote ? (
                <InfoNote plain>{t('supplierCreditNotes.upload.refusedDebitNoteCloses')}</InfoNote>
              ) : null}
              <div
                className="mt-4 flex flex-col gap-3"
                role="radiogroup"
                aria-label={t('supplierCreditNotes.upload.howToUse')}
              >
                {(
                  [
                    {
                      id: 'setAgainst' as const,
                      title: chosenBill
                        ? t('supplierCreditNotes.upload.setNow', {
                            bill: chosenBill.supplierBillNumber ?? '',
                          })
                        : t('supplierCreditNotes.upload.setNowNoBill'),
                      note: chosenBill
                        ? t(
                            debitNoteChosen
                              ? 'supplierCreditNotes.upload.setNowNoteDebitNote'
                              : 'supplierCreditNotes.upload.setNowNote',
                            { amount: money(linesTotal ?? 0) },
                          )
                        : t('supplierCreditNotes.upload.setNowPick'),
                      disabled: !chosenBill || chosenBill.outstandingAmount <= 0,
                    },
                    {
                      id: 'hold' as const,
                      title: t('supplierCreditNotes.upload.hold'),
                      note: form.supplierName
                        ? t('supplierCreditNotes.upload.holdNote', { supplier: form.supplierName })
                        : t('supplierCreditNotes.upload.holdNoteAny'),
                      disabled: false,
                    },
                    {
                      // A refund is only possible once the money has actually left, and that is
                      // recorded on the note itself, so the option is present but not reachable here.
                      id: 'refund' as const,
                      title: t('supplierCreditNotes.upload.refund'),
                      note: t('supplierCreditNotes.upload.refundNote'),
                      disabled: true,
                    },
                  ] as const
                )
                  // A refused debit note leaves nothing to choose: the two ways to use the credit
                  // give way to the line above.
                  .filter((option) => !refusedDebitNote || option.id === 'refund')
                  .map((option) => {
                    const active =
                      use === option.id ||
                      (option.id === 'hold' && use === 'setAgainst' && !chosenBill)
                    return (
                      <ChoiceRow
                        key={option.id}
                        active={active}
                        disabled={option.disabled}
                        onPick={() => setUse(option.id)}
                        title={option.title}
                        note={withRial(option.note)}
                        trailing={
                          option.disabled && option.id === 'refund'
                            ? t('supplierCreditNotes.upload.notYet')
                            : undefined
                        }
                      />
                    )
                  })}
              </div>
            </section>
          ) : (
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('supplierDebitNotes.upload.decision')}
              </h2>
              {!canDecide ? (
                <InfoNote plain>{t('supplierDebitNotes.upload.noDecisionRight')}</InfoNote>
              ) : null}
              <div
                className="mt-4 flex flex-col gap-3"
                role="radiogroup"
                aria-label={t('supplierDebitNotes.upload.decision')}
              >
                <ChoiceRow
                  active={decision === 'accept'}
                  disabled={!canDecide}
                  onPick={() => setDecision('accept')}
                  title={t('supplierDebitNotes.upload.accept')}
                  note={withRial(
                    chosenBill
                      ? t('supplierDebitNotes.upload.acceptNote', {
                          amount: money(linesTotal ?? 0),
                          bill: chosenBill.supplierBillNumber ?? '',
                          total: money((effect.outstanding ?? 0) + (linesTotal ?? 0)),
                        })
                      : t('supplierDebitNotes.upload.acceptNoteNoBill', {
                          amount: money(linesTotal ?? 0),
                        }),
                  )}
                />
                <div>
                  <ChoiceRow
                    active={decision === 'refuse'}
                    disabled={!canDecide}
                    danger
                    attached={decision === 'refuse'}
                    onPick={() => setDecision('refuse')}
                    title={t('supplierDebitNotes.upload.refuse')}
                    note={t('supplierDebitNotes.upload.refuseNote')}
                  />
                  {decision === 'refuse' ? (
                    <div className="rounded-b-sm border border-t-0 border-danger-700 bg-danger-100/40 px-4 pb-4">
                      <div
                        className="flex flex-wrap gap-2"
                        role="radiogroup"
                        aria-label={t('supplierDebitNotes.detail.pickReason')}
                      >
                        {REFUSAL_REASONS.map((option) => {
                          const active = preset === option.id
                          return (
                            <label
                              key={option.id}
                              className={[
                                'inline-flex h-[36px] cursor-pointer items-center rounded-sm border bg-white px-3 text-sm font-medium transition-colors',
                                active
                                  ? 'border-danger-700 text-danger-700'
                                  : 'border-border-subtle text-text-secondary hover:border-danger-700',
                              ].join(' ')}
                            >
                              <input
                                type="radio"
                                name="intakeRefusalReason"
                                value={option.id}
                                checked={active}
                                onChange={() => setPreset(option.id)}
                                className="sr-only"
                              />
                              {t(option.labelKey)}
                            </label>
                          )
                        })}
                      </div>
                      {preset === 'other' ? (
                        <input
                          value={otherReason}
                          maxLength={200}
                          onChange={(event) => setOtherReason(event.target.value)}
                          placeholder={t('supplierDebitNotes.refuse.otherPlaceholder')}
                          aria-label={t('supplierDebitNotes.refuse.other')}
                          className="mt-2.5 h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-medium text-text-secondary outline-none focus:border-danger-700"
                        />
                      ) : null}
                      <p className="mt-2.5 flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-tertiary">
                        <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                        {t('supplierDebitNotes.upload.reasonNote')}
                      </p>
                    </div>
                  ) : null}
                </div>
                <ChoiceRow
                  active={decision === 'hold'}
                  onPick={() => setDecision('hold')}
                  title={t('supplierDebitNotes.upload.hold')}
                  note={t('supplierDebitNotes.upload.holdNote')}
                />
              </div>
            </section>
          )}

          {kind === 'credit' ? (
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('supplierCreditNotes.upload.vatEffect')}
              </h2>
              <dl className="mt-4 flex flex-col">
                {[
                  {
                    label: t('supplierCreditNotes.upload.inputVat', {
                      bill: chosenBill?.supplierBillNumber ?? t('supplierNotes.theBill'),
                    }),
                    value: vat.claimed === null ? '—' : <SignedAmount value={money(vat.claimed)} />,
                  },
                  {
                    label: t('supplierCreditNotes.upload.reducedBy'),
                    value: <SignedAmount sign={'−'} value={money(vat.reduced)} />,
                  },
                  {
                    label: t('supplierCreditNotes.upload.reclaimable'),
                    value:
                      vat.reclaimable === null ? (
                        '—'
                      ) : (
                        <SignedAmount value={money(vat.reclaimable)} />
                      ),
                  },
                ].map((row, index) => (
                  <div
                    key={row.label}
                    className={[
                      'flex items-center justify-between gap-4 py-3',
                      index < 2 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <dt className="text-sm font-medium text-text-tertiary">{row.label}</dt>
                    <dd className="text-sm font-semibold text-text-primary">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <InfoNote plain>{t('supplierCreditNotes.upload.vatNote')}</InfoNote>
            </section>
          ) : null}

          {duplicate ? (
            <section role="alert" className="rounded-md border border-[#d8c9a8] bg-[#faf5ea] p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <img src={warnIcon} alt="" className="size-5" />
                {t('billIntake.duplicate.title')}
              </h2>
              <p className="mt-2 text-sm font-medium leading-[1.5] text-text-secondary">
                {withRial(
                  t('billIntake.duplicate.body', {
                    number: duplicate.supplierBillNumber,
                    date: duplicate.issueDate ? formatDate(duplicate.issueDate, language) : '—',
                    total:
                      duplicate.total === null
                        ? '—'
                        : `${money(duplicate.total)} ${duplicate.currencyCode ?? form.currency}`,
                    source: t(`billIntake.duplicate.source.${duplicate.source}`),
                  }),
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to={`/expenditure/bills/${duplicate.billId}`}
                  className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
                >
                  {t('billIntake.duplicate.open')}
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(duplicate.billId)}
                  className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
                >
                  {t('billIntake.duplicate.different')}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* The bar the frame closes with: what stands, then Discard and the one primary action. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3 max-md:flex-col max-md:items-stretch">
        <p className="text-sm font-medium leading-[1.4] text-text-tertiary">
          {kind === 'credit' ? (
            <>
              <span className="font-semibold text-text-primary">
                {toFill === 0
                  ? t('supplierCreditNotes.upload.footerLead')
                  : t('supplierCreditNotes.upload.footerToFill', { count: toFill })}
              </span>
              {' · '}
              {t('supplierCreditNotes.upload.footerNote')}
            </>
          ) : (
            <>
              <span className="font-semibold text-text-primary">
                {worries === 0
                  ? t('supplierDebitNotes.upload.footerFine')
                  : t('supplierDebitNotes.upload.footerLead', { count: worries })}
              </span>
              {' · '}
              {t('supplierDebitNotes.upload.footerNote')}
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-3 max-md:flex-col">
          <Link
            to={cancelTo}
            onClick={() => void discard()}
            className="inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('billIntake.discard')}
          </Link>
          <button
            type="submit"
            disabled={busy || saved !== null}
            className={[
              'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm px-5 text-sm font-semibold text-white transition-colors disabled:opacity-60',
              followUp === 'refuse'
                ? 'bg-danger-700 hover:opacity-90'
                : 'bg-primary-700 hover:bg-primary-800',
            ].join(' ')}
          >
            {followUp === 'apply' || followUp === 'accept' ? (
              <img src={tickIcon} alt="" className="size-4 brightness-0 invert" />
            ) : null}
            {busy ? t('billIntake.saving') : primaryLabel}
          </button>
        </div>
      </div>
    </form>
  )
}

/** One radio row of "How to use it" / "Your decision". */
function ChoiceRow({
  active,
  disabled = false,
  danger = false,
  attached = false,
  onPick,
  title,
  note,
  trailing,
}: {
  active: boolean
  disabled?: boolean
  danger?: boolean
  /** Squared bottom corners, for the reasons panel that hangs off a chosen refusal. */
  attached?: boolean
  onPick: () => void
  title: string
  note: ReactNode
  trailing?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onPick}
      className={[
        'flex w-full items-center gap-3 rounded-sm border p-4 text-start transition-colors',
        active
          ? danger
            ? 'border-danger-700 bg-danger-100/40'
            : 'border-primary-700 bg-primary-25'
          : 'border-border-subtle bg-white hover:border-primary-300',
        disabled ? 'cursor-not-allowed opacity-50 hover:border-border-subtle' : '',
        attached ? 'rounded-b-none' : '',
      ].join(' ')}
    >
      <span
        className={[
          'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
          active ? (danger ? 'border-danger-700' : 'border-primary-700') : 'border-border-default',
        ].join(' ')}
      >
        {active ? (
          <span
            className={['size-2.5 rounded-full', danger ? 'bg-danger-700' : 'bg-primary-700'].join(
              ' ',
            )}
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={[
            'text-base font-semibold leading-[1.2]',
            active && danger ? 'text-danger-700' : 'text-text-primary',
          ].join(' ')}
        >
          {title}
        </span>{' '}
        <span className="text-sm font-medium leading-[1.3] text-text-quaternary">{note}</span>
      </span>
      {trailing ? (
        <span className="shrink-0 text-xs font-medium text-text-quaternary">{trailing}</span>
      ) : null}
    </button>
  )
}

/**
 * The bill this note corrects or adds to: searched among the supplier's bills (narrowed by the
 * server via `supplier_id`), shown as the frame's bill card once chosen. A credit note's list also
 * offers the supplier's debit notes, each named "Debit note".
 *
 * TODO(backend): an e-invoice file carries the bill reference (IBT-025), but `ExtractedFields`
 * does not, so nothing is pre-chosen from the file (row 5.12).
 */
function BillChooser({
  kind,
  supplierId,
  supplierName,
  excludeId,
  chosen,
  onChoose,
  language,
}: {
  kind: NoteKind
  supplierId: string | null
  supplierName: string
  excludeId: string | null
  chosen: BillRowDto | null
  onChoose: (bill: BillRowDto | null) => void
  language: string
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])

  const path =
    !chosen && (supplierId || supplierName.trim())
      ? billListPath({
          filter: 'ALL',
          q: supplierId ? query.trim() : `${supplierName} ${query}`.trim(),
          source: null,
          sort: 'NEWEST',
          supplierId,
          page: 0,
          pageSize: 10,
        })
      : null
  const bills = useApiRead<Page<BillRowDto>>(path, () => loadBillPage(path!))

  const CREDIT_NOTE_CODES = ['381', '261']
  // A credit note may correct one of the supplier's debit notes as well as a bill (owner, 8 Oct
  // 2026); a debit note adds to a bill only, and the server refuses another debit note for it.
  const offerable = (bill: BillRowDto) =>
    bill.id !== excludeId &&
    (supplierId
      ? bill.supplierId === supplierId
      : (bill.supplierName ?? '').trim().toLowerCase() === supplierName.trim().toLowerCase()) &&
    !CREDIT_NOTE_CODES.includes(bill.documentTypeCode ?? '') &&
    (kind === 'credit' || bill.documentTypeCode !== DEBIT_NOTE_CODE) &&
    (kind === 'debit' || bill.outstandingAmount > 0)
  const found = bills.read.status === 'ready' ? bills.read.data.items.filter(offerable) : null
  const money = (value: number, currency: string) => formatAmount(value, currency, language)

  if (chosen) {
    return (
      <>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white">
              <img src={billIcon} alt="" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-[1.2] text-text-primary">
                {chosen.supplierBillNumber ?? t('supplierCreditNotes.rows.unnumbered')} ·{' '}
                <SignedAmount value={money(chosen.totalIncludingVat ?? 0, chosen.currencyCode)} />
              </p>
              <p className="mt-1 text-sm font-medium leading-[1.3] text-text-tertiary">
                {t('supplierNotes.billCard', {
                  state: t(billStateKey(chosen)),
                  outstanding: money(chosen.outstandingAmount, chosen.currencyCode),
                  due: chosen.dueDate ? formatDate(chosen.dueDate, language) : '—',
                })}
                {chosen.paymentRunReference
                  ? ` · ${t('supplierNotes.inRun', { run: chosen.paymentRunReference })}`
                  : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChoose(null)}
            className="inline-flex h-[42px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t(
              kind === 'credit'
                ? 'supplierCreditNotes.upload.chooseAnother'
                : 'supplierDebitNotes.upload.chooseAnother',
            )}
          </button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-tertiary">
          <img src={tickIcon} alt="" className="mt-px size-4 shrink-0" />
          {t('supplierNotes.billChosenByHand')}
        </p>
      </>
    )
  }

  return (
    <div className="mt-4">
      <label className="block">
        <span className="text-xs font-semibold text-text-quaternary">
          {t('supplierNotes.findBill')}
        </span>
        <input
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={!supplierId && !supplierName.trim()}
          placeholder={
            supplierId || supplierName.trim()
              ? t('supplierNotes.findBillPlaceholder')
              : t('supplierNotes.pickSupplierFirst')
          }
          className={[
            'mt-1 h-[46px] w-full rounded-sm border px-3 text-sm font-medium text-text-secondary outline-none disabled:opacity-60',
            SHELL,
          ].join(' ')}
        />
      </label>
      {found ? (
        found.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-text-quaternary">
            {t('supplierCreditNoteDetail.noBillsForSupplier', {
              supplier: supplierName || t('supplierNotes.thisSupplier'),
            })}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {found.map((bill) => (
              <li key={bill.id}>
                <button
                  type="button"
                  onClick={() => onChoose(bill)}
                  className="w-full rounded-sm px-3 py-2 text-start text-sm font-medium text-text-secondary hover:bg-primary-25"
                >
                  {bill.supplierBillNumber ?? t('supplierCreditNotes.rows.unnumbered')}
                  <span className="block text-xs text-text-quaternary">
                    {bill.documentTypeCode === DEBIT_NOTE_CODE
                      ? `${t('billsPage.debitNote.type')} · `
                      : null}
                    {/* What it still owes, with the rial sign before the figure (owner, 9 Oct 2026). */}
                    {t(billStateKey(bill))} ·{' '}
                    {withRial(
                      `${bill.currencyCode} ${money(bill.outstandingAmount, bill.currencyCode)}`,
                    )}{' '}
                    {t('supplierCreditNoteDetail.stillOwed')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : bills.read.status === 'loading' ? (
        <p className="mt-2 text-sm font-medium text-text-quaternary">{t('billIntake.searching')}</p>
      ) : null}
    </div>
  )
}

/** The supplier's file beside the form, at the frame's zoom steps. */
function FilePane({
  file,
  intake,
  zoom,
  zoomIndex,
  onZoom,
}: {
  file: File
  intake: IntakeDto
  zoom: number
  zoomIndex: number
  onZoom: (index: number) => void
}) {
  const { t } = useTranslation()
  const kind = fileKindOf(file)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (kind === 'xml') return
    const created = URL.createObjectURL(file)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [file, kind])

  return (
    <section className="flex w-full flex-col self-start overflow-hidden rounded-md bg-surface-card xl:w-[440px] xl:shrink-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-secondary">
          <img src={fileIcon} alt="" className="size-5 shrink-0" />
          <span className="truncate">{file.name}</span>
        </p>
        <div className="flex items-center gap-1.5">
          {[
            { icon: zoomOutIcon, label: t('invoiceDetails.zoomOut'), step: -1 },
            { icon: zoomInIcon, label: t('invoiceDetails.zoomIn'), step: 1 },
          ].map((button) => (
            <button
              key={button.label}
              type="button"
              aria-label={button.label}
              disabled={button.step < 0 ? zoomIndex === 0 : zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() =>
                onZoom(Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex + button.step)))
              }
              className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
            >
              <img src={button.icon} alt="" className="size-5" />
            </button>
          ))}
          <button
            type="button"
            aria-label={t('invoiceDetails.fullscreen')}
            onClick={() => onZoom(ZOOM_STEPS.length - 1)}
            className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white"
          >
            <img src={fullscreenIcon} alt="" className="size-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-[420px] flex-1 justify-center overflow-auto bg-surface-background p-5">
        {kind === 'xml' ? (
          <p className="max-w-[360px] self-center text-center text-sm font-medium leading-[1.5] text-text-tertiary">
            {t(
              intake.extractionStatus === 'EXTRACTED'
                ? 'billIntake.xmlFilled'
                : 'billIntake.xmlNotRead',
            )}
          </p>
        ) : url === null ? null : kind === 'pdf' ? (
          <iframe
            src={url}
            title={file.name}
            style={{
              width: `${100 / zoom}%`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            className="h-[640px] border-0"
          />
        ) : (
          <img
            src={url}
            alt={file.name}
            style={{ width: `${360 * zoom}px` }}
            className="h-auto self-start rounded-sm shadow-card"
          />
        )}
      </div>
    </section>
  )
}
