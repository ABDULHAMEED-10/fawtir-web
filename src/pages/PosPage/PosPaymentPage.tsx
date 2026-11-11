import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Rial, Select, withRial } from '../../components/ui'
import { TillMoneyInput } from './TillMoneyInput'
import {
  holdUncertainSale,
  setFinishedSale,
  settleHeldKey,
  settleUncertainSale,
  startNewSale,
  useOpenSale,
  useUncertainSale,
  type NewHold,
  type UncertainSale,
} from '../../lib/posSale'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { BUSINESS_TIME_ZONE, formatAmount, formatInstantDay } from '../../lib/format'
import { AppShell } from '../../layouts/AppShell'
import { PosFootNote } from './PosFootNote'
import { PosQuotaNextStep } from './PosQuotaNextStep'
import { PosTillGate } from './PosTillGate'
import {
  BuildingIcon,
  CardIcon,
  CashIcon,
  CheckIcon,
  DocumentIcon,
  PencilIcon,
  ShieldIcon,
} from './posIcons'
import {
  VAT_RATE,
  omr,
  omrSigned,
  saleLineDetail,
  totalsFor,
  unitPrice,
  LULL,
  toBaisa,
  toRials,
} from '../../lib/pos'
import {
  METHODS,
  TIP_CHOICES,
  changeDue,
  paymentsRequest,
  quickCash,
  stillToCollect,
  tipFor,
  toPay,
  qrRefusalKeys,
  type MethodId,
  type Taken,
  type TipChoice,
} from '../../lib/posPayment'
import { checkHeldWithServer } from '../../lib/posHeldCheck'
import { posSaleBody, type TillBuyer } from '../../lib/posInvoice'
import {
  PosTenantZoneUnavailable,
  keyMayBeQueued,
  useQueueDecision,
  useQueuedSales,
  refusesTheSale,
  saleOutcomeUncertain,
  submitSale,
  useSellingBlock,
} from '../../lib/posQueue'
import { refusalCode, refusalSentence } from '../../lib/posRefusals'
import { shrinkSlip, slipReading, type SlipReading } from '../../lib/posSlip'
import { useReferenceData } from '../../lib/reference/referenceData'
import { DESIGN_REFERENCE } from '../../lib/invoiceDraft'
import {
  newPosKey,
  readPosSlip,
  uploadPosSlip,
  type PosSaleDto,
  type PosSaleRequest,
} from '../../api/pos/pos'
import { ApiError, NetworkError } from '../../api'
import { MAX_SLIP_BYTES } from '../../lib/posSlipOutbox'
import { BUYER_IDENTIFIER_SCHEMES } from '../../api/customers/customers'
import { tillContact } from '../../lib/posContact'
import { overSimplifiedLimit, useBuyerMatch } from '../../lib/posBuyerMatch'
import { missingFieldsSentence, notEligiblePaths } from '../../lib/customerEligibility'
import { useTillQrProfile, type TillState } from '../../lib/posTill'
import { containsCardNumber } from '../../lib/cardNumbers'

type Ready = Extract<TillState, { status: 'ready' }>

/** The slip on the card being taken: uploaded (`fileId`), or kept on the device while offline. */
type HeldSlip = {
  fileId: string | null
  photo: { blob: Blob; name: string } | null
  reading: SlipReading
}

/** One picture per way of paying, on the tiles and on the payments already taken. */
function MethodIcon({ id, className }: { id: MethodId; className?: string }) {
  if (id === 'cash') return <CashIcon className={className} />
  if (id === 'card') return <CardIcon className={className} />
  if (id === 'transfer') return <DocumentIcon className={className} />
  return <BuildingIcon className={className} />
}

function MethodTile({
  id,
  label,
  hotkey,
  chosen,
  disabled,
  onPick,
}: {
  id: MethodId
  label: string
  hotkey: string
  chosen: boolean
  disabled?: boolean
  onPick: (id: MethodId) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      aria-pressed={chosen}
      disabled={disabled}
      className={[
        'flex min-w-0 flex-col items-center gap-2 rounded-md border px-2 py-6 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        chosen
          ? 'border-primary-700 bg-primary-25'
          : 'border-border-subtle bg-surface-card hover:border-primary-300',
      ].join(' ')}
    >
      <span
        className={[
          'flex size-10 items-center justify-center rounded-sm',
          chosen ? 'bg-primary-700 text-white' : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        <MethodIcon id={id} className="size-5" />
      </span>
      <span
        className={[
          'text-base',
          chosen ? 'font-semibold text-primary-800' : 'font-medium text-text-secondary',
        ].join(' ')}
      >
        {label}
      </span>
      <span className="text-xs font-medium text-text-quaternary">{hotkey}</span>
    </button>
  )
}

/** The till's text field, as the close and refund screens draw theirs. */
const FIELD =
  'h-11 w-full rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 basis-[180px] flex-col gap-1.5">
      <span className="text-xs font-medium text-text-tertiary">{label}</span>
      {children}
    </label>
  )
}

export function PosPaymentPage() {
  return (
    <AppShell>
      <PosTillGate>{(till) => <Payment till={till} />}</PosTillGate>
    </AppShell>
  )
}

function Payment({ till }: { till: Ready }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const reference = useReferenceData() ?? DESIGN_REFERENCE
  // The sale and its discount as the sale screen left them.
  const { lines, saleDiscount, company } = useOpenSale()
  const totals = totalsFor(lines, saleDiscount)

  // No tip is added until the customer asks for one.
  const [tipChoice, setTipChoice] = useState<TipChoice>('none')
  const [taken, setTaken] = useState<Taken[]>([])
  const [method, setMethod] = useState<MethodId>('cash')
  const [handedOver, setHandedOver] = useState<number | null>(null)
  const [partTyped, setPartTyped] = useState<number | null>(null)
  const [approval, setApproval] = useState('')
  // FIN-5: a card number in the approval field is stopped here, before it can be taken into the
  // sale body that an offline till keeps in local storage until it is filed.
  const approvalHoldsCard = method === 'card' && containsCardNumber(approval)
  const [reference2, setReference2] = useState('')
  const [slip, setSlip] = useState<HeldSlip | null>(null)
  const [slipState, setSlipState] = useState<'idle' | 'reading' | 'failed'>('idle')
  const [slipError, setSlipError] = useState<unknown>(null)
  const slipInput = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState(false)
  // The till's notices say why (PosTabLockNotice, PosStorageNotice); the sell controls are off for
  // as long as any of them blocks selling, online or offline (DES43 rev 4.7 D.9).
  const sellingBlocked = useSellingBlock(till.till.id) !== null
  const qrProfileNow = useTillQrProfile(till.till.id)
  const [refusal, setRefusal] = useState<unknown>(null)
  const [buyerAsked, setBuyerAsked] = useState(false)
  const [buyer, setBuyer] = useState({ name: '', scheme: 'CID', value: '', contact: '' })
  /** Why the buyer's phone or email cannot be filed, said under the field (F-2). */
  const [contactError, setContactError] = useState<'phone' | 'email' | null>(null)
  /** A retried sale is the same sale: same key, same time, same body (P.12). */
  const attempt = useRef<{ fingerprint: string; key: string; soldAt: string } | null>(null)
  const uncertain = useUncertainSale(till.till.id)
  const [heldCheck, setHeldCheck] = useState<HeldCheckState>('idle')
  /** What the server decided for a lock-only hold, shown once the hold is released. */
  const [decided, setDecided] = useState<Decided | null>(null)
  const retryCheck = useRef<number | null>(null)

  const tip = company ? 0 : tipFor(tipChoice, totals.sale)
  const owed = toPay(totals.sale, tip)
  const left = stillToCollect(owed, taken)
  const change = changeDue(taken)
  const covered = left === 0 && lines.length > 0
  const cash = handedOver ?? left
  const partAmount = partTyped === null ? left : Math.min(partTyped, left)

  const take = (entry: Omit<Taken, 'id'>) => {
    if (entry.amount <= 0) return
    setTaken((current) => [...current, { ...entry, id: `p${Date.now()}` }])
    setPartTyped(null)
    setApproval('')
    setReference2('')
    setSlip(null)
    setSlipState('idle')
    setHandedOver(null)
  }

  const scanSlip = async (file: File) => {
    setSlipState('reading')
    setSlipError(null)
    let kept: { blob: Blob; name: string } | null = null
    try {
      const { blob, name } = await shrinkSlip(file)
      kept = { blob, name }
      const uploaded = await uploadPosSlip(till.till.id, blob, name)
      let reading: SlipReading = { unread: true, fields: {}, unsure: [] }
      try {
        reading = slipReading(await readPosSlip(uploaded.fileId))
      } catch {
        // Reading is a help, never a step: the slip is kept and the cashier types what they need.
      }
      setSlip({ fileId: uploaded.fileId, photo: null, reading })
      if (reading.fields.authCode && !approval) setApproval(reading.fields.authCode)
      setSlipState('idle')
    } catch (error) {
      // Offline: the shrunk photo waits with the sale and is uploaded once it is filed.
      if (error instanceof NetworkError && kept && kept.blob.size <= MAX_SLIP_BYTES) {
        setSlip({ fileId: null, photo: kept, reading: { unread: true, fields: {}, unsure: [] } })
        setSlipState('idle')
        return
      }
      setSlipError(error)
      setSlipState('failed')
    }
  }

  const buyerOf = (named: boolean): TillBuyer =>
    company
      ? { kind: 'company', customerId: company.id, customerKind: company.kind }
      : named
        ? {
            kind: 'named',
            name: buyer.name.trim(),
            // An Omani number typed as eight digits goes as +968 (E.164), as the server files it.
            contact: (() => {
              const contact = tillContact(buyer.contact)
              return contact.ok ? contact.value : buyer.contact.trim() || null
            })(),
            identifierScheme: schemes.includes(buyer.scheme) ? buyer.scheme : schemes[0],
            identifierValue: buyer.value.trim(),
          }
        : { kind: 'walkIn' }

  /**
   * Sends the sale and shows its receipt, or says why not. An answer that leaves the outcome
   * unknown holds the sale exactly as sent (E-01): the screen then offers only the same sale again,
   * under the same key, or today's sales, until an answer is definite.
   */
  const send = async (held: NewHold) => {
    const sending = held.send
    try {
      const qrProfile = await qrProfileNow()
      const result = await submitSale(
        // Only a sale the till queues reads the profile (`offlinePrintedQr`); an online one never does.
        qrProfile ? { ...till.till, qrProfile } : till.till,
        sending.request,
        held.key,
        sending.slipPhotos,
        sending.printed,
        sending.maker,
      )
      settleUncertainSale()
      setFinishedSale({
        ...sending.receipt,
        sale: 'sale' in result ? result.sale : null,
        queuedNumber: 'queued' in result ? result.queued.number : null,
        ...('queued' in result && result.queued.body.printedQr
          ? { queuedQr: result.queued.body.printedQr.payload }
          : {}),
        ...('queued' in result && qrProfile
          ? { queuedSeller: { name: qrProfile.sellerName, vatNumber: qrProfile.sellerVatin } }
          : {}),
        queuedBehind: 'queued' in result && result.behind === true,
        finishedAt: sending.request.soldAt,
      })
      attempt.current = null
      till.retry()
      navigate('/pos/done')
    } catch (error) {
      setRefusal(error)
      if (saleOutcomeUncertain(error)) holdUncertainSale(held)
      // The server answered this key with its own code: nothing is recorded under it, so the sale
      // may be changed again. A refusal made here before anything was sent leaves it held.
      else if (refusesTheSale(error)) settleUncertainSale()
      // The till's zone came from the till as last read: read it again, so a zone restored in the
      // company settings is verified on the next press (XT2-ZONE-UNREADABLE).
      if (error instanceof PosTenantZoneUnavailable) till.retry()
      const code = refusalCode(error)
      if (code === 'SIMPLIFIED_INVOICE_LIMIT' || code === 'BUYER_IDENTIFIER_REQUIRED') {
        setBuyerAsked(true)
      }
      // RESEND-AUTH: the key is closed for good, so the same body must not be sent under it again
      // by Finish; the next Finish is a new sale with a new key, and the sentence says to check the
      // terminal first.
      if (code === 'POS_SALE_KEY_ABANDONED') attempt.current = null
    }
  }

  const finish = async (named = false) => {
    if (busy || uncertain) return
    setBusy(true)
    setRefusal(null)
    const { payments, tip: tipPart, slipPhotos } = paymentsRequest(taken, tip)
    const body: Omit<PosSaleRequest, 'soldAt'> = {
      tillId: till.till.id,
      queuedOffline: false,
      invoiceNumber: null,
      ...posSaleBody(reference, {
        lines,
        saleDiscount,
        branchId: till.branchId,
        buyer: buyerOf(named),
      }),
      payments,
      tip: tipPart,
    }
    const fingerprint = JSON.stringify(body)
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: newPosKey('sale'), soldAt: new Date().toISOString() }
    }
    try {
      await send({
        tenantId: till.tenantId ?? null,
        tillId: till.till.id,
        shiftId: till.till.openShift?.shiftId ?? null,
        tillLabel: till.till.name || till.till.code,
        key: attempt.current.key,
        send: {
          request: { ...body, soldAt: attempt.current.soldAt },
          slipPhotos,
          // What the receipt prints, signed with a queued sale (V530 `printed`).
          printed: {
            taxable: toRials(totals.beforeVat),
            vat: toRials(totals.vat),
            total: toRials(totals.sale),
          },
          // Kept on this device only, so only this person's session sends it by itself (P3b).
          maker: till.userId
            ? {
                userId: till.userId,
                name: (till.mine ? till.till.openShift?.cashier.name : null) ?? till.userName ?? null,
              }
            : null,
          receipt: {
            lines,
            totals,
            tip,
            change,
            company,
            buyer:
              named && !company
                ? {
                    name: buyer.name.trim(),
                    identifierScheme: schemes.includes(buyer.scheme) ? buyer.scheme : schemes[0],
                    identifierValue: buyer.value.trim(),
                  }
                : null,
            payments: taken.map((entry) => ({
              method: entry.method,
              amount: entry.amount,
              approvalCode: entry.approvalCode,
            })),
          },
        },
      })
    } finally {
      setBusy(false)
    }
  }

  const retrySame = async () => {
    if (busy || !uncertain?.send) return
    setBusy(true)
    setRefusal(null)
    try {
      await send({ ...uncertain, send: uncertain.send })
    } finally {
      setBusy(false)
    }
  }

  /**
   * A lock-only hold has no body to send again, so the server decides it (RESEND-AUTH). Only a
   * person's press asks: NOT_RECORDED closes the key, which must never follow from a page load.
   */
  const checkHeld = async () => {
    if (!uncertain || uncertain.send !== null || uncertain.restoring) return
    const held = uncertain
    setHeldCheck('checking')
    const result = await checkHeldWithServer(held)
    if (result.outcome === 'recorded' || result.outcome === 'notRecorded') {
      setHeldCheck('idle')
      if (!result.released) return
      attempt.current = null
      setDecided(
        result.outcome === 'recorded' ? { kind: 'recorded', sale: result.sale } : { kind: 'notRecorded' },
      )
    } else if (result.outcome === 'inProgress') {
      setHeldCheck('inProgress')
      retryCheck.current = window.setTimeout(() => {
        retryCheck.current = null
        void checkAgain.current()
      }, result.retryAfterSeconds * 1000)
    } else {
      setHeldCheck(result.outcome)
    }
  }
  const checkAgain = useRef(checkHeld)
  checkAgain.current = checkHeld
  // RW6-1: a held key the till's queue also has is decided by the queue's own send. Read on every
  // queue change, so the panel's button and note follow it; filed or refused for good by the server
  // releases the hold, anything that waits (offline, 401, 403, 408, 429, 5xx) does not.
  useQueuedSales(till.till.id)
  const queueDecided = useQueueDecision(uncertain?.key ?? null)
  useEffect(() => {
    if (!uncertain || !queueDecided) return
    // RW7-2: refused only on the entry's own final mark, filed only on a real sale; anything else
    // decides nothing and the hold stays.
    const refused = 'key' in queueDecided && queueDecided.final === true ? queueDecided : null
    const filed =
      !refused && 'saleId' in queueDecided && typeof queueDecided.saleId === 'string' ? queueDecided : null
    if (!refused && !filed) return
    if (!settleHeldKey(uncertain.key)) return
    attempt.current = null
    setDecided(
      filed
        ? { kind: 'recorded', sale: filed }
        : // RW7-1: a sale is already recorded under the key, with other contents: not a refusal.
          refused!.refusal === 'POS_SALE_KEY_REUSED'
          ? { kind: 'keyReused', number: refused!.number }
          : { kind: 'queueRefused', number: refused!.number },
    )
  }, [uncertain, queueDecided])
  useEffect(
    () => () => {
      if (retryCheck.current !== null) window.clearTimeout(retryCheck.current)
    },
    [],
  )

  const schemes =
    refusal instanceof ApiError && Array.isArray(refusal.problem.buyerIdentifierSchemes)
      ? (refusal.problem.buyerIdentifierSchemes as string[])
      : [...BUYER_IDENTIFIER_SCHEMES]
  const buyerReady = buyer.name.trim() && buyer.value.trim()
  // The customer on file this ID (and phone) would file the invoice against, when it is stored
  // under another name: a mistyped ID shows before the invoice is filed. Never blocks.
  // RB-1 STUCK-QR: a full tax sale this customer cannot get a QR on is refused here, before it is
  // sent, in the server's own words; the basket and the buyer stay as they are, and nothing else
  // (a simplified sale, another customer) is chosen for the cashier.
  //
  // STUCKQR-1 (owner: "refuse before payment capture"): a card is taken on the bank's terminal
  // before Finish, so a named full tax sale (the cashier chose it, or the sale is over the
  // simplified limit) asks for the buyer first, and no payment is taken until the buyer is typed
  // and the lookup has not refused them. A lookup still waiting or failed does not block: it is
  // said, and the server checks again when the sale is sent.
  const buyerFirst = !company && (buyerAsked || overSimplifiedLimit(totals.beforeVat))
  const {
    hint: onFile,
    qrRefused,
    asked: buyerTyped,
    answered: buyerChecked,
  } = useBuyerMatch(
    till.till.id,
    { ...buyer, scheme: schemes.includes(buyer.scheme) ? buyer.scheme : schemes[0] },
    buyerFirst,
  )
  const tenderLocked = buyerFirst && (!buyerTyped || qrRefused)
  // STUCKQR-2 / STQ-1: wherever the QR refusal is said, the inline alert as much as the refusal
  // after Finish, it says what to give back for the payments already taken.
  const qrRefusal = qrRefusalKeys(taken)
    .map((key) => t(key))
    .join(' ')
  /** The buyer's phone or email is checked before the full invoice goes (F-2). */
  const finishNamed = () => {
    const contact = tillContact(buyer.contact)
    setContactError(contact.ok ? null : contact.reason)
    if (contact.ok) void finish(true)
  }
  // The server's own check of the phone (`contact.mobilePhone`, E.164) is said on the field,
  // not as the general failure.
  const contactRefused =
    refusal instanceof ApiError &&
    refusal.fieldErrors.some((field) => field.field.startsWith('contact.'))
  const contactProblem = contactError ?? (contactRefused ? 'phone' : null)
  // A company without the address a full invoice needs (F-1): what is missing, and where to add it.
  const notEligible =
    refusal instanceof ApiError
      ? notEligiblePaths({ code: refusal.code, ...refusal.problem })
      : null

  if (decided && !uncertain) {
    return (
      <HeldDecidedPanel
        decided={decided}
        onNewSale={() => {
          setDecided(null)
          startNewSale()
          navigate('/pos')
        }}
      />
    )
  }

  if (uncertain) {
    return (
      <UncertainSalePanel
        held={uncertain}
        refusal={refusal}
        busy={busy || sellingBlocked}
        onRetry={() => void retrySame()}
        check={heldCheck}
        onCheck={() => void checkHeld()}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <Link
        to="/pos"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
      >
        ‹ {t('pos.backToSale')}
      </Link>

      <section className="flex flex-wrap items-center justify-between gap-6 rounded-md bg-surface-card px-6 py-5">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
              {t('pos.pay.toPay')}
            </p>
            <p className="mt-1 inline-flex items-baseline gap-2 text-[34px] font-semibold leading-none text-text-primary">
              <Rial />
              {omr(owed)}
            </p>
          </div>
          <div className="flex gap-6 border-s border-border-subtle ps-6 max-md:border-s-0 max-md:ps-0">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                {t('pos.pay.sale')}
              </p>
              <p className="mt-1 text-xl font-medium text-text-secondary">{omr(totals.sale)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                {t('pos.pay.tip')}
              </p>
              <p className="mt-1 text-xl font-medium text-text-secondary">{omr(tip)}</p>
            </div>
          </div>
        </div>
        {/* On a phone a plain row across the card, label then figure, so neither drifts in. */}
        <div className="text-end max-md:flex max-md:w-full max-md:items-baseline max-md:justify-between max-md:gap-3">
          <p className="text-sm font-medium text-text-quaternary">{t('pos.pay.stillToCollect')}</p>
          <p
            className={[
              'mt-1 inline-flex items-baseline gap-1.5 text-2xl font-semibold',
              covered ? 'text-success-700' : 'text-text-primary',
            ].join(' ')}
          >
            <Rial />
            {omr(left)}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[320px] flex-1 flex-col gap-4">
          <section className="flex flex-col rounded-md bg-surface-card">
            <div className="border-b border-border-subtle px-6 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.pay.howPaying')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('pos.pay.splitIt')}
              </p>
            </div>

            {tenderLocked && !qrRefused ? (
              <p role="status" className="mx-6 mt-4 rounded-sm bg-warning-100 px-4 py-3 text-sm font-medium text-text-primary">
                {t('pos.buyer.firstNeeded')}
              </p>
            ) : null}
            {!company && !buyerFirst && taken.length === 0 ? (
              <button
                type="button"
                onClick={() => setBuyerAsked(true)}
                className="mx-6 mt-4 self-start text-sm font-semibold text-primary-700"
              >
                {t('pos.buyer.chooseFull')}
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-3 px-6 py-4 sm:grid-cols-4">
              {METHODS.map((entry) => (
                <MethodTile
                  key={entry.id}
                  id={entry.id}
                  label={t(entry.labelKey)}
                  hotkey={entry.hotkey}
                  // On account is for a company customer only (POS_ON_ACCOUNT_NEEDS_COMPANY).
                  disabled={entry.id === 'account' && !company}
                  chosen={
                    method === entry.id || taken.some((payment) => payment.method === entry.id)
                  }
                  onPick={(id) => {
                    setMethod(id)
                    setPartTyped(null)
                  }}
                />
              ))}
            </div>

            {method === 'cash' && !covered ? (
              <div className="flex flex-wrap gap-4 px-6 pb-4">
                <div className="min-w-[260px] flex-1">
                  <p className="text-xs font-medium text-text-tertiary">
                    {t('pos.pay.handedOver', { amount: omr(left) })}
                  </p>
                  <TillMoneyInput
                    baisa={cash}
                    onBaisa={(typed) => setHandedOver(typed ?? 0)}
                    aria-label={t('pos.pay.handedOverLabel')}
                    className="mt-2 h-[60px] w-full rounded-sm border-2 border-primary-700 bg-primary-25 px-4 text-end text-2xl font-semibold text-text-primary outline-none"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {quickCash(left).map((amount, index) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setHandedOver(amount)}
                        className={[
                          'inline-flex h-10 items-center rounded-sm border px-3 text-sm font-semibold transition-colors',
                          cash === amount
                            ? 'border-primary-700 bg-primary-25 text-primary-800'
                            : 'border-border-subtle bg-white text-text-secondary hover:border-primary-300',
                        ].join(' ')}
                      >
                        {index === 0 ? t('pos.pay.exact', { amount: omr(amount) }) : omr(amount)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-w-[240px] flex-1 rounded-sm bg-success-100 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                    {t('pos.pay.changeToGive')}
                  </p>
                  <p className="mt-1 text-[30px] font-semibold leading-none text-success-700">
                    {omr(Math.max(0, cash - left))}
                  </p>
                  <p className="mt-2 text-xs font-medium leading-[1.5] text-text-tertiary">
                    {t('pos.pay.drawerOpens')}
                  </p>
                  <button
                    type="button"
                    disabled={cash <= 0 || tenderLocked}
                    onClick={() =>
                      // Less than owed is part of a split; the rest is taken another way.
                      take({ method: 'cash', amount: Math.min(cash, left), handedOver: cash })
                    }
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-sm bg-success-700 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {t('pos.pay.takeCash', { amount: omr(Math.min(cash, left)) })}
                  </button>
                </div>
              </div>
            ) : null}

            {method !== 'cash' && !covered ? (
              <div className="flex flex-col gap-4 px-6 pb-4">
                <div className="flex flex-wrap gap-4">
                  <Field label={t('pos.pay.amount')}>
                    <TillMoneyInput
                      baisa={partTyped ?? left}
                      onBaisa={setPartTyped}
                      className={`${FIELD} text-end`}
                    />
                  </Field>
                  {method === 'card' ? (
                    <Field label={t('pos.pay.approvalCode')}>
                      <input
                        value={approval}
                        maxLength={40}
                        dir="ltr"
                        onChange={(event) => setApproval(event.target.value)}
                        placeholder={t('pos.pay.optional')}
                        aria-invalid={approvalHoldsCard || undefined}
                        className={[
                          FIELD,
                          slip?.reading.unsure.includes('authCode') || approvalHoldsCard
                            ? 'border-pending-700'
                            : '',
                        ].join(' ')}
                      />
                      {approvalHoldsCard ? (
                        <span role="alert" className="text-xs font-medium text-pending-700">
                          {t('pos.pay.approvalIsCardNumber')}
                        </span>
                      ) : null}
                    </Field>
                  ) : null}
                  {method === 'transfer' ? (
                    <Field label={t('pos.pay.transferReference')}>
                      <input
                        value={reference2}
                        maxLength={200}
                        dir="ltr"
                        onChange={(event) => setReference2(event.target.value)}
                        placeholder={t('pos.pay.optional')}
                        className={FIELD}
                      />
                    </Field>
                  ) : null}
                </div>

                {method === 'card' ? (
                  <SlipNote slip={slip} state={slipState} error={slipError} amount={partAmount} />
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={partAmount <= 0 || approvalHoldsCard || tenderLocked}
                    onClick={() =>
                      take({
                        method,
                        amount: partAmount,
                        approvalCode: method === 'card' ? approval : undefined,
                        reference: method === 'transfer' ? reference2 : undefined,
                        slipFileId: method === 'card' ? (slip?.fileId ?? undefined) : undefined,
                        slipPhoto: method === 'card' ? (slip?.photo ?? undefined) : undefined,
                        slipFields:
                          method === 'card' && slip && !slip.reading.unread
                            ? slip.reading.fields
                            : undefined,
                      })
                    }
                    className="inline-flex h-10 items-center rounded-sm bg-success-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {method === 'account'
                      ? t('pos.pay.putOnAccount', { amount: omr(partAmount) })
                      : t('pos.pay.paid', { amount: omr(partAmount) })}
                  </button>
                  {method === 'card' ? (
                    <>
                      <button
                        type="button"
                        disabled={slipState === 'reading'}
                        onClick={() => slipInput.current?.click()}
                        className="inline-flex h-10 items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60"
                      >
                        {slipState === 'reading' ? t('pos.pay.slipReading') : t('pos.pay.scanSlip')}
                      </button>
                      {/* Camera on a tablet or phone, a file on a computer. */}
                      <input
                        ref={slipInput}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          if (file) void scanSlip(file)
                        }}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            <ul className="flex flex-wrap gap-4 border-t border-border-subtle px-6 py-4">
              {taken.map((payment) => (
                <li
                  key={payment.id}
                  className="flex min-w-[260px] flex-1 items-center gap-3 border-b border-border-subtle pb-3 max-md:min-w-0 max-md:basis-full max-md:last:border-b-0"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-25 text-primary-700">
                    <MethodIcon id={payment.method} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">
                      {t(`pos.pay.${payment.method}`)}
                    </span>
                    <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                      {/* Only what was entered: Fawtir has no link to the card machine. */}
                      {payment.method === 'cash'
                        ? t('pos.pay.cashGiven', {
                            given: omr(payment.handedOver ?? payment.amount),
                            change: omr((payment.handedOver ?? payment.amount) - payment.amount),
                          })
                        : payment.method === 'card' && payment.approvalCode?.trim()
                          ? t('pos.pay.approvalShown', { code: payment.approvalCode.trim() })
                          : payment.method === 'transfer' && payment.reference?.trim()
                            ? payment.reference.trim()
                            : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-text-primary">
                    {omr(payment.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTaken((c) => c.filter((p) => p.id !== payment.id))}
                    aria-label={t('pos.pay.remove')}
                    className="shrink-0 text-text-quaternary transition-colors hover:text-danger-700"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-6 py-4">
              {covered ? (
                // A compact green box on the right half, as the frame draws it; full width on a phone.
                <p className="flex w-full items-center gap-2 rounded-sm bg-success-100 px-3 py-2.5 text-sm sm:justify-end sm:text-end font-medium text-success-700 sm:ms-auto sm:w-1/2">
                  <CheckIcon className="size-4 shrink-0" />
                  <span>{t('pos.pay.allCovered', { amount: omr(owed) })}</span>
                </p>
              ) : (
                <p className="flex-1 text-sm font-medium text-text-tertiary">
                  {t('pos.pay.stillOwed', { amount: omr(left) })}
                </p>
              )}
            </div>
          </section>

          {!company ? (
            <section className="flex flex-col rounded-md bg-surface-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
                <div>
                  <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('pos.pay.tipTitle')}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-text-quaternary">
                    {t('pos.pay.tipNote')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 px-6 py-4">
                {TIP_CHOICES.map((choice) => {
                  const value = tipFor(choice, totals.sale)
                  const chosen = choice === tipChoice
                  return (
                    <button
                      key={choice}
                      type="button"
                      // A tip is paid in cash or on the card, never by transfer or on account.
                      disabled={taken.length > 0}
                      onClick={() => setTipChoice(choice)}
                      aria-pressed={chosen}
                      className={[
                        'flex min-h-[76px] min-w-[110px] flex-1 flex-col items-center justify-center gap-1 rounded-md border py-4 transition-colors disabled:cursor-not-allowed',
                        chosen
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300 disabled:opacity-60',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'text-base',
                          chosen
                            ? 'font-semibold text-primary-800'
                            : 'font-medium text-text-secondary',
                        ].join(' ')}
                      >
                        {t(`pos.pay.tipChoice.${choice}`)}
                      </span>
                      {choice !== 'none' ? (
                        <span className="text-xs font-medium text-text-quaternary">
                          {omr(value)}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <div className="mx-6 mb-6 flex items-start gap-2 rounded-sm bg-surface-background px-4 py-3 text-xs font-medium leading-[1.6] text-text-tertiary">
                <ShieldIcon className="mt-0.5 size-4 shrink-0 text-text-quaternary" />
                <p className="min-w-0 flex-1">
                  {t('pos.pay.tipExplained', {
                    base: omr(totals.beforeVat),
                    tip: omr(tip),
                    rate: VAT_RATE * 100,
                  })}
                </p>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
          <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {company ? company.name : t('pos.pay.walkInCustomer')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {company
                  ? t('pos.itemsFullInvoice', { count: lines.length })
                  : t('pos.pay.receiptWithQr', { count: lines.length })}
              </p>
            </div>
            {/* The sale panel's edit button: back to the sale to change it. */}
            <Link
              to="/pos"
              aria-label={t('pos.editSale')}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-border-subtle text-text-tertiary transition-colors hover:bg-primary-25"
            >
              <PencilIcon className="size-4" />
            </Link>
          </div>
          <ul className="flex flex-col px-5">
            {lines.map((line) => {
              const detail = saleLineDetail(line, t)
              return (
                <li
                  key={line.id}
                  className="flex items-start gap-3 border-b border-border-subtle py-3 last:border-b-0"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-surface-background text-xs font-semibold text-text-tertiary">
                    {line.qty}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-primary">{line.name}</span>
                    {detail || line.addOns.length ? (
                      <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                        {detail}
                        {line.addOns.length
                          ? `${detail ? ' · ' : ''}${line.addOns.map((a) => `+ ${a.label}`).join(', ')}`
                          : ''}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-text-primary">
                    {omr(unitPrice(line) * line.qty)}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-col gap-2.5 border-t border-border-subtle px-5 py-4">
            <Row label={t('pos.totals.items')} value={omr(totals.items)} />
            {totals.discount > 0 ? (
              <Row
                label={
                  lines.some((line) => line.rulePercent)
                    ? t('pos.totals.lull', { percent: LULL.percent })
                    : t('pos.totals.lineDiscounts')
                }
                value={omrSigned(-totals.discount)}
              />
            ) : null}
            {totals.saleDiscount > 0 ? (
              <Row label={t('pos.totals.saleDiscount')} value={omrSigned(-totals.saleDiscount)} />
            ) : null}
            <Row
              label={
                totals.vatRates.length === 1
                  ? t('pos.totals.vatAt', { rate: totals.vatRates[0] })
                  : t('pos.totals.vatMixed')
              }
              value={omr(totals.vat)}
            />
            <Row label={t('pos.pay.sale')} value={omr(totals.sale)} />
            {!company ? <Row label={t(`pos.pay.tipRow.${tipChoice}`)} value={omr(tip)} /> : null}
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
              <span className="text-lg font-medium text-text-primary">{t('pos.pay.total')}</span>
              <span className="inline-flex items-baseline gap-1.5 text-[26px] font-semibold leading-none text-text-primary">
                <Rial />
                {omr(owed)}
              </span>
            </div>
          </div>

          {refusal && !contactRefused ? (
            <div role="alert" className="mx-5 mb-4 rounded-sm bg-pending-100 px-4 py-3">
              <p className="text-sm font-medium leading-[1.5] text-pending-700">
                {notEligible ? (
                  <>
                    {notEligible.length
                      ? t('pos.refusal.CUSTOMER_NOT_INVOICE_ELIGIBLE', {
                          missing: missingFieldsSentence(notEligible, t, i18n.language),
                        })
                      : t('pos.refusal.customerIncomplete')}{' '}
                    <Link
                      to="/pos/company"
                      state={{ missing: notEligible }}
                      className="font-semibold underline"
                    >
                      {t('pos.refusal.completeCompany')}
                    </Link>
                  </>
                ) : (
                  <>
                    {/* STUCKQR-2: an older server, or a race, refuses after the card was charged
                        on the terminal: "nothing was charged" would be false. */}
                    {refusalCode(refusal) === 'POS_SALE_QR_UNAVAILABLE_FOR_BUYER'
                      ? qrRefusal
                      : refusalSentence(t, refusal)}
                    {refusal instanceof ApiError && refusal.problemType === 'quota-exceeded' ? (
                      <PosQuotaNextStep />
                    ) : null}
                  </>
                )}
              </p>
            </div>
          ) : null}

          {buyerFirst ? (
            // The full-invoice offer (SIMPLIFIED_INVOICE_LIMIT, BUYER_IDENTIFIER_REQUIRED): the
            // buyer is named with their ID (IBR-016-OM), or the sale is put on a company.
            <div className="mx-5 mb-4 grid grid-cols-1 gap-3 rounded-sm bg-surface-background p-4">
              <p className="text-sm font-semibold text-text-primary">{t('pos.buyer.title')}</p>
              <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
                {t('pos.buyer.note')}
              </p>
              <Field label={t('pos.buyer.name')}>
                <input
                  value={buyer.name}
                  maxLength={200}
                  onChange={(event) => setBuyer({ ...buyer, name: event.target.value })}
                  className={FIELD}
                />
              </Field>
              <Field label={t('pos.buyer.scheme')}>
                <Select
                  quiet
                  value={schemes.includes(buyer.scheme) ? buyer.scheme : schemes[0]}
                  onChange={(scheme) => setBuyer({ ...buyer, scheme })}
                  options={schemes.map((scheme) => ({
                    value: scheme,
                    label: t(`customerForm.identifier.schemes.${scheme}`),
                  }))}
                  ariaLabel={t('pos.buyer.scheme')}
                />
              </Field>
              <Field label={t('pos.buyer.value')}>
                <input
                  value={buyer.value}
                  maxLength={50}
                  dir="ltr"
                  onChange={(event) => setBuyer({ ...buyer, value: event.target.value })}
                  className={FIELD}
                />
                {onFile ? (
                  <span role="status" className="text-xs font-medium text-pending-700">
                    {onFile.identifierValue
                      ? t('pos.buyer.onFileWithId', {
                          name: onFile.name,
                          id: onFile.identifierScheme
                            ? `${t(`customerForm.identifier.schemes.${onFile.identifierScheme}`)} ${onFile.identifierValue}`
                            : onFile.identifierValue,
                        })
                      : t('pos.buyer.onFile', { name: onFile.name })}
                  </span>
                ) : null}
              </Field>
              {/* Beside the field, not in its label, so the ID input keeps its own name. */}
              {qrRefused ? (
                <p role="alert" className="text-xs font-medium text-danger-700">
                  {qrRefusal}
                </p>
              ) : buyerTyped && !buyerChecked ? (
                <p role="status" className="text-xs font-medium text-text-tertiary">
                  {t('pos.buyer.checking')}
                </p>
              ) : null}
              <Field label={t('pos.buyer.contact')}>
                <input
                  value={buyer.contact}
                  dir="ltr"
                  onChange={(event) => {
                    setBuyer({ ...buyer, contact: event.target.value })
                    setContactError(null)
                    if (contactRefused) setRefusal(null)
                  }}
                  placeholder={t('pos.pay.optional')}
                  aria-invalid={contactProblem ? true : undefined}
                  className={FIELD}
                />
                {contactProblem ? (
                  <span role="alert" className="text-xs font-medium text-danger-700">
                    {t(`pos.buyer.contactInvalid.${contactProblem}`)}
                  </span>
                ) : null}
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!buyerReady || !covered || busy || sellingBlocked || qrRefused}
                  onClick={finishNamed}
                  className="inline-flex h-10 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {t('pos.buyer.makeFull')}
                </button>
                <Link to="/pos/company" className="text-sm font-semibold text-primary-700">
                  {t('pos.buyer.onCompany')}
                </Link>
              </div>
            </div>
          ) : null}

          <div className="px-5 pb-5">
            <button
              type="button"
              disabled={!covered || busy || sellingBlocked}
              onClick={() => void finish(false)}
              className="inline-flex h-[52px] w-full items-center justify-center rounded-sm bg-success-700 text-base font-semibold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('pos.pay.finish')}
            </button>
          </div>
          <PosFootNote>{t('pos.pay.finishNote', { change: omr(change) })}</PosFootNote>
        </aside>
      </div>
    </div>
  )
}

type HeldCheckState = 'idle' | 'checking' | 'inProgress' | 'queued' | 'failed'
/** What the server decided for a held key, by the key lookup or the queue's own send. */
type Decided =
  | { kind: 'recorded'; sale: PosSaleDto }
  | { kind: 'notRecorded' }
  | { kind: 'queueRefused'; number: string }
  | { kind: 'keyReused'; number: string }

/**
 * The sale was sent and its outcome is not known (E-01). Nothing here changes it: no basket, no
 * payment, no buyer, only the same sale again or the server's answer for its key.
 */
function UncertainSalePanel({
  held,
  refusal,
  busy,
  onRetry,
  check,
  onCheck,
}: {
  held: UncertainSale
  refusal: unknown
  busy: boolean
  onRetry: () => void
  check: HeldCheckState
  onCheck: () => void
}) {
  const { t, i18n } = useTranslation()
  const cashier = held.send?.maker?.name ?? null
  // Only the lock came back (no sealed sale on this device): the sale cannot be sent again from
  // here, so the server is asked what became of its key (owner decision 5: a cashier's own word
  // that Today was checked does not release it).
  const lockOnly = held.send === null && !held.restoring
  // RA-1: a key the queue holds is the queue's to send; the server is not asked about it here.
  const queued = lockOnly && (check === 'queued' || keyMayBeQueued(held.key))
  const summary = held.summary
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 pb-10">
      <section className="flex flex-col gap-4 rounded-md bg-surface-card px-6 py-5">
        <h1 className="text-xl font-semibold text-text-primary">{t('pos.pay.uncertain.title')}</h1>
        <p role="alert" className="text-sm font-medium leading-[1.6] text-danger-700">
          {refusal ? refusalSentence(t, refusal) : t('pos.refusal.outcomeUnknown')}
        </p>
        <p className="text-sm leading-[1.6] text-text-secondary">{t('pos.pay.uncertain.locked')}</p>
        {cashier ? (
          <p className="text-sm font-medium text-text-secondary">
            {t('pos.pay.uncertain.rungBy', { name: cashier })}
          </p>
        ) : null}
        {summary ? (
          <p className="text-sm font-medium text-text-secondary">
            {withRial(
              t('pos.pay.uncertain.saleFigures', {
                amount: `${summary.currency} ${formatAmount(summary.total, summary.currency, i18n.language)}`,
                // RBW3-1b: Today opens on the current day; a sale held from an earlier day is
                // found only by its date, so the time alone would send the cashier to the wrong list.
                date: formatInstantDay(summary.soldAt, i18n.language),
                time: heldTime(summary.soldAt, i18n.language),
              }),
            )}
          </p>
        ) : null}
        {held.restoring ? (
          <p role="status" className="text-sm font-medium text-text-tertiary">
            {t('pos.pay.uncertain.restoring')}
          </p>
        ) : null}
        {held.kept === 'none' || held.kept === 'lock' ? (
          <p role="status" className="rounded-sm bg-warning-100 px-4 py-3 text-sm font-semibold text-text-primary">
            {t(held.kept === 'none' ? 'pos.pay.uncertain.unsaved' : 'pos.pay.uncertain.lockOnly')}
          </p>
        ) : null}
        {held.hadSlips ? (
          <p role="status" className="text-sm font-medium text-text-secondary">
            {t('pos.pay.uncertain.reattachSlip')}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          {lockOnly ? (
            <button
              type="button"
              disabled={busy || queued || check === 'checking' || check === 'inProgress'}
              onClick={onCheck}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-primary disabled:opacity-40"
            >
              {t('pos.pay.uncertain.checkServer')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || held.send === null}
              onClick={onRetry}
              className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
            >
              {t('pos.pay.uncertain.retry')}
            </button>
          )}
          <Link to="/pos/today" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
            {t('pos.pay.uncertain.checkToday')}
          </Link>
        </div>
        {lockOnly && queued ? (
          <p role="status" className="text-xs font-medium text-text-tertiary">
            {t('pos.pay.uncertain.queuedKey')}
          </p>
        ) : lockOnly && check !== 'idle' ? (
          <p
            role={check === 'failed' ? 'alert' : 'status'}
            className={`text-xs font-medium ${check === 'failed' ? 'text-danger-700' : 'text-text-tertiary'}`}
          >
            {t(
              check === 'checking'
                ? 'pos.pay.uncertain.checking'
                : check === 'inProgress'
                  ? 'pos.pay.uncertain.stillSaving'
                  : 'pos.pay.uncertain.checkFailed',
            )}
          </p>
        ) : null}
      </section>
    </div>
  )
}

/**
 * The server decided a held sale and it is released (RESEND-AUTH, RW6-1). Recorded: the sale as the
 * server has it, so it is not rung again. Not recorded: its key is closed, the customer may still
 * have paid, and the sale goes again only as a new one with a new key. Refused from the queue: the
 * queued entry keeps the sale, and it is dealt with there.
 */
function HeldDecidedPanel({ decided, onNewSale }: { decided: Decided; onNewSale: () => void }) {
  const { t, i18n } = useTranslation()
  const sale = decided.kind === 'recorded' ? decided.sale : null
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 pb-10">
      <section className="flex flex-col gap-4 rounded-md bg-surface-card px-6 py-5">
        <h1 className="text-xl font-semibold text-text-primary">
          {t(
            sale
              ? 'pos.pay.uncertain.recordedTitle'
              : decided.kind === 'queueRefused'
                ? 'pos.pay.uncertain.queueRefusedTitle'
                : decided.kind === 'keyReused'
                  ? 'pos.pay.uncertain.keyReusedTitle'
                  : 'pos.pay.uncertain.notRecordedTitle',
          )}
        </h1>
        {sale ? (
          <>
            <p role="status" className="text-sm font-medium leading-[1.6] text-text-secondary">
              {withRial(
                t('pos.pay.uncertain.recorded', {
                  invoice: sale.invoiceNumber,
                  amount: `OMR ${formatAmount(sale.totals.total, 'OMR', i18n.language)}`,
                }),
              )}
            </p>
            {/* RW6-3: no reprint here; ReceiptReprint prints nothing while REPRINT_LINES_SETTLED
                is off, so the cashier is pointed to Today's own reprint, which lifts with it. */}
            <p className="text-sm font-medium text-text-secondary">
              {t('pos.pay.uncertain.reprintFromToday')}
            </p>
          </>
        ) : decided.kind === 'queueRefused' || decided.kind === 'keyReused' ? (
          <p role="status" className="text-sm font-medium leading-[1.6] text-text-secondary">
            {t(`pos.pay.uncertain.${decided.kind}`, { number: decided.number })}
          </p>
        ) : (
          <p role="alert" className="text-sm font-medium leading-[1.6] text-danger-700">
            {t('pos.pay.uncertain.notRecorded')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onNewSale}
            className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t(decided.kind === 'notRecorded' ? 'pos.pay.uncertain.ringAgain' : 'pos.done.startNew')}
          </button>
          <Link to="/pos/today" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
            {t('pos.pay.uncertain.checkToday')}
          </Link>
        </div>
      </section>
    </div>
  )
}

/** When the held sale was rung, in the business's time zone (where Today lists it). */
function heldTime(soldAt: string, language: string): string {
  return new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(soldAt))
}

/** What Scan slip found, or why it found nothing; never a reason to stop. */
function SlipNote({
  slip,
  state,
  error,
  amount,
}: {
  slip: HeldSlip | null
  state: 'idle' | 'reading' | 'failed'
  error: unknown
  amount: number
}) {
  const { t } = useTranslation()
  if (state === 'failed') {
    return (
      <p className="rounded-sm bg-pending-100 px-3 py-2.5 text-xs font-medium leading-[1.5] text-pending-700">
        {refusalSentence(t, error)} {t('pos.pay.slipSkip')}
      </p>
    )
  }
  if (!slip) return null
  const { reading } = slip
  if (slip.photo) {
    return (
      <p className="rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.5] text-text-tertiary">
        {t('pos.pay.slipKeptOffline')}
      </p>
    )
  }
  if (reading.unread) {
    return (
      <p className="rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.5] text-text-tertiary">
        {t('pos.pay.slipUnread')}
      </p>
    )
  }
  const slipAmount = reading.fields.amount != null ? toBaisa(reading.fields.amount) : null
  return (
    <div className="flex flex-col gap-1.5 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.5] text-text-tertiary">
      <p>
        {t('pos.pay.slipRead', {
          card: [reading.fields.cardType, reading.fields.cardLast4].filter(Boolean).join(' ') || '',
          rrn: reading.fields.rrn ?? '',
        })}
      </p>
      {reading.unsure.length ? <p className="text-pending-700">{t('pos.pay.slipCheck')}</p> : null}
      {slipAmount != null && slipAmount !== amount ? (
        <p className="text-pending-700">
          {t('pos.pay.slipDiffers', { slip: omr(slipAmount), payment: omr(amount) })}
        </p>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      <span dir="ltr" className="text-sm font-semibold tabular-nums text-text-primary">
        {value}
      </span>
    </div>
  )
}
