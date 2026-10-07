import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { TextField } from '../../components/form/FormFields'
import { Checkbox, FileDropzone, Input, Select } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { Mono, PRIMARY_BUTTON, SECONDARY_BUTTON, SectionCard, SecondaryLink } from './overview/idiom'
import { Pill } from './ErpShell'
import { useApiRead } from '../../hooks/useApiRead'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  DEFAULT_TRANSACTION_TYPE,
  TRANSACTION_BITS,
  composeTransactionType,
  decomposeTransactionType,
} from '../../lib/erp/mappingState'
import {
  BRIDGE_ACCEPT,
  BRIDGE_ID_MAX,
  BRIDGE_MAX_BODY_BYTES,
  BRIDGE_VERSION_MAX,
  bridgeBodyBytes,
  classifyBridgeFailure,
  isIssueTime,
  readBridgeDocument,
  type BridgeDocumentProblem,
  type BridgeRefusal,
} from '../../lib/erp/bridgeUpload'
import {
  buildBridgeRequest,
  newBridgeUploadKey,
  uploadThroughBridge,
  type BridgeFormat,
  type BridgeUploadResponseDto,
} from '../../api/erp/bridge'
import { certificationStatusPath, loadCertificationStatus } from '../../api/erp/mapping'

const FORMATS: BridgeFormat[] = ['JSON', 'XML']
const UPLOAD_PERMISSION = 'invoice.submit'
/** The mapping endpoints, the certification status among them, are administration. */
const MAPPING_PERMISSION = 'admin.settings.manage'

const clockOf = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

type Chosen = {
  name: string
  size: number
  document: Record<string, unknown> | string
}

/** Why the form will not send yet, decided before any request. */
type LocalProblem = BridgeDocumentProblem | 'size' | 'type' | 'tooLarge'

/**
 * Settings › Integration › Upload from your ERP (the Extraction Bridge).
 *
 * A signed-in user sends one document their ERP produced, in the ERP's own JSON or XML, and the
 * tenant's mapping turns it into an invoice. There is no Figma frame for this screen, as for every
 * ERP screen (docs/erp-and-console-plan.md): it is built from the Integration templates only.
 *
 * **No connection is involved.** The route takes the document and the ERP's own identity for it;
 * a managed connection is the other way documents arrive, not a prerequisite for this one.
 *
 * **One upload, one request.** The submit is guarded by a ref as well as the disabled button, and
 * the Idempotency-Key is kept for as long as the request is the same, so a retry after a timeout
 * is recognised by the server as the upload it already has rather than as a second one.
 */
export function ErpBridgePage() {
  const { t } = useTranslation()
  const { entitlements, ready } = useEntitlements()

  if (!ready) {
    return (
      <SettingsShell group="integration">
        <LoadingNotice />
      </SettingsShell>
    )
  }
  const canUpload = entitlements !== null && hasPermission(entitlements, UPLOAD_PERMISSION)
  const canReadMapping = entitlements !== null && hasPermission(entitlements, MAPPING_PERMISSION)

  return (
    <SettingsShell group="integration">
      <SettingsHeader title={t('erp.bridge.title')} subtitle={t('erp.bridge.subtitle')} />
      <div className="flex flex-col gap-5">
        <ChannelsCard />
        {canUpload ? <UploadForm canReadMapping={canReadMapping} /> : <PermissionDeniedNotice />}
      </div>
    </SettingsShell>
  )
}

/**
 * The three ways a document reaches Fawtir from an ERP, so the reader knows which one this page
 * is. All three feed the same mapping and the same invoice pipeline; they differ only in who
 * moves the document.
 */
function ChannelsCard() {
  const { t } = useTranslation()
  return (
    <SectionCard title={t('erp.bridge.channels.title')}>
      <ul className="flex flex-col gap-3 p-5 pt-0 text-sm font-medium leading-[1.6] text-text-tertiary">
        <li>
          <span className="font-semibold text-text-primary">
            {t('erp.bridge.channels.managedPull')}
          </span>{' '}
          {t('erp.bridge.channels.managedPullBody')}{' '}
          <Link
            to="/settings/erp/connections"
            className="font-semibold text-primary-700 hover:text-primary-800"
          >
            {t('erp.bridge.channels.managedPullLink')}
          </Link>
        </li>
        <li>
          <span className="font-semibold text-text-primary">{t('erp.bridge.channels.bridge')}</span>{' '}
          {t('erp.bridge.channels.bridgeBody')}
        </li>
        <li>
          <span className="font-semibold text-text-primary">
            {t('erp.bridge.channels.apiPush')}
          </span>{' '}
          {t('erp.bridge.channels.apiPushBody')}{' '}
          <Link
            to="/settings/erp/api-push"
            className="font-semibold text-primary-700 hover:text-primary-800"
          >
            {t('erp.bridge.channels.apiPushLink')}
          </Link>
        </li>
      </ul>
    </SectionCard>
  )
}

/**
 * Whether the mapping will accept a standard invoice from this format, as the server says. Read
 * once per format and transaction type, which is what the FR-005 gate is keyed on.
 */
export function ReadinessCard({
  format,
  transactionType,
}: {
  format: BridgeFormat
  transactionType: string
}) {
  const { t } = useTranslation()
  const query = {
    route: 'INVOICE' as const,
    documentKind: 'STANDARD_INVOICE' as const,
    transactionType,
  }
  const { read, retry } = useApiRead(certificationStatusPath(format, query), () =>
    loadCertificationStatus(format, query),
  )

  return (
    <SectionCard title={t('erp.bridge.readiness.title')}>
      <div className="flex flex-col items-start gap-3 p-5 pt-0">
        {read.status === 'loading' ? (
          <p role="status" className="text-sm font-medium text-text-quaternary">
            {t('erp.bridge.readiness.checking')}
          </p>
        ) : read.status === 'failed' ? (
          <ApiReadFailure error={read.error} retry={retry} />
        ) : read.data.certified ? (
          <>
            <Pill tone="success" label={t('erp.bridge.readiness.ready')} />
            <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('erp.bridge.readiness.readyBody', { format })}
            </p>
          </>
        ) : (
          <>
            <Pill tone="pending" label={t('erp.bridge.readiness.notReady')} />
            {/* The server's reason is English prose for developers; the reader gets ours. */}
            <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('erp.bridge.readiness.notReadyBody', { format })}
            </p>
            <SecondaryLink to="/settings/erp-mapping/certification">
              {t('erp.bridge.readiness.openCertification')}
            </SecondaryLink>
          </>
        )}
        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('erp.bridge.readiness.note')}
        </p>
      </div>
    </SectionCard>
  )
}

type Outcome =
  | { kind: 'done'; receipt: BridgeUploadResponseDto }
  | { kind: 'refused'; refusal: BridgeRefusal; error: unknown }

function UploadForm({ canReadMapping }: { canReadMapping: boolean }) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<BridgeFormat>('JSON')
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [reading, setReading] = useState(false)
  const [problem, setProblem] = useState<LocalProblem | null>(null)
  const [externalId, setExternalId] = useState('')
  const [externalVersion, setExternalVersion] = useState('')
  const [issueTime, setIssueTime] = useState(() => clockOf(new Date()))
  const [bits, setBits] = useState<boolean[]>(() =>
    decomposeTransactionType(DEFAULT_TRANSACTION_TYPE.INVOICE),
  )
  const [advanced, setAdvanced] = useState(false)
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const inFlight = useRef(false)
  /** The key of the upload being made; dropped as soon as anything that is sent changes. */
  const uploadKey = useRef<string | null>(null)
  /** Discards a file read that finished after the reader had already picked another file. */
  const readSequence = useRef(0)

  const transactionType = composeTransactionType(bits)

  // Anything that goes into the request makes it a different upload, so it gets its own key and
  // the previous answer no longer describes it.
  const changed = () => {
    uploadKey.current = null
    setOutcome(null)
  }

  const take = async (file: File) => {
    const sequence = ++readSequence.current
    changed()
    setProblem(null)
    setChosen(null)
    setReading(true)
    const result = await readBridgeDocument(file, format)
    if (sequence !== readSequence.current) return
    setReading(false)
    if (result.ok) setChosen({ name: file.name, size: file.size, document: result.document })
    else setProblem(result.problem)
  }

  const reset = () => {
    readSequence.current += 1
    uploadKey.current = null
    setChosen(null)
    setProblem(null)
    setReading(false)
    setExternalId('')
    setExternalVersion('')
    setOutcome(null)
  }

  const ready =
    chosen !== null && externalId.trim() !== '' && isIssueTime(issueTime) && !reading && !sending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || chosen === null || inFlight.current) return
    const request = buildBridgeRequest({
      format,
      document: chosen.document,
      issueTime,
      transactionType,
      externalDocumentId: externalId,
      externalVersion,
    })
    if (bridgeBodyBytes(request) > BRIDGE_MAX_BODY_BYTES) {
      setProblem('tooLarge')
      return
    }
    inFlight.current = true
    setSending(true)
    setOutcome(null)
    uploadKey.current ??= newBridgeUploadKey()
    try {
      const receipt = await uploadThroughBridge(request, uploadKey.current)
      setOutcome({ kind: 'done', receipt })
    } catch (error: unknown) {
      const refusal = classifyBridgeFailure(error)
      // A request that may not have arrived, or one the server is still working, keeps its key:
      // sending it again is a retry of the same upload. Any answer that is final ends it.
      if (refusal.kind !== 'unreachable' && refusal.kind !== 'inProgress') uploadKey.current = null
      setOutcome({ kind: 'refused', refusal, error })
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <>
      {canReadMapping ? (
        <ReadinessCard format={format} transactionType={transactionType} />
      ) : (
        <SectionCard title={t('erp.bridge.readiness.title')}>
          <p className="p-5 pt-0 text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('erp.bridge.readiness.administratorOnly')}
          </p>
        </SectionCard>
      )}

      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <SectionCard title={t('erp.bridge.document.title')}>
          <div className="flex flex-col gap-5 p-5 pt-0">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">
                {t('erp.bridge.document.format')}
              </span>
              <Select
                value={format}
                ariaLabel={t('erp.bridge.document.format')}
                options={FORMATS.map((value) => ({
                  value,
                  label: t(`erp.bridge.format.${value}`),
                }))}
                disabled={sending}
                onChange={(next) => {
                  if (next !== 'JSON' && next !== 'XML') return
                  setFormat(next)
                  // A file read as one format is not the document the other format would send.
                  readSequence.current += 1
                  setChosen(null)
                  setProblem(null)
                  setReading(false)
                  changed()
                }}
              />
              <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
                {t('erp.bridge.document.formatHint')}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">
                {t('erp.bridge.document.file')}
              </span>
              <FileDropzone
                accept={BRIDGE_ACCEPT[format]}
                maxBytes={BRIDGE_MAX_BODY_BYTES}
                onFiles={(files) => {
                  if (files[0]) void take(files[0])
                }}
                onReject={(reason) => {
                  readSequence.current += 1
                  setChosen(null)
                  setReading(false)
                  setProblem(reason)
                  changed()
                }}
              >
                {({ dragging }) => (
                  <span
                    className={[
                      'flex flex-col items-center gap-1 rounded-sm border border-dashed px-4 py-6 text-center transition-colors',
                      dragging
                        ? 'border-primary-700 bg-primary-25'
                        : 'border-border-default bg-surface-background hover:bg-primary-25',
                    ].join(' ')}
                  >
                    <span className="text-sm font-semibold text-text-primary [overflow-wrap:anywhere]">
                      {chosen ? chosen.name : t('erp.bridge.document.drop', { format })}
                    </span>
                    <span className="text-xs font-medium text-text-quaternary">
                      {reading
                        ? t('erp.bridge.document.reading')
                        : chosen
                          ? t('erp.bridge.document.size', {
                              kb: Math.max(1, Math.round(chosen.size / 1024)),
                            })
                          : t('erp.bridge.document.limit')}
                    </span>
                  </span>
                )}
              </FileDropzone>
              {problem !== null ? (
                <p role="alert" className="text-xs font-medium leading-[1.5] text-danger-700">
                  {t(`erp.bridge.problem.${problem}`, { format })}
                </p>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t('erp.bridge.identity.title')}>
          <div className="grid gap-5 p-5 pt-0 md:grid-cols-2">
            <TextField
              id="erp-bridge-document-id"
              name="externalDocumentId"
              dir="ltr"
              label={t('erp.bridge.identity.documentId')}
              hint={t('erp.bridge.identity.documentIdHint')}
              required
              maxLength={BRIDGE_ID_MAX}
              value={externalId}
              onChange={(next) => {
                setExternalId(next)
                changed()
              }}
            />
            <TextField
              id="erp-bridge-document-version"
              name="externalVersion"
              dir="ltr"
              label={t('erp.bridge.identity.version')}
              hint={t('erp.bridge.identity.versionHint')}
              maxLength={BRIDGE_VERSION_MAX}
              value={externalVersion}
              onChange={(next) => {
                setExternalVersion(next)
                changed()
              }}
            />
          </div>
        </SectionCard>

        <SectionCard title={t('erp.bridge.invoice.title')}>
          <div className="flex flex-col gap-5 p-5 pt-0">
            <Input
              bordered
              type="time"
              label={t('erp.certification.issueTime')}
              hint={t('erp.certification.issueTimeNote')}
              value={issueTime}
              onChange={(event) => {
                setIssueTime(event.target.value)
                changed()
              }}
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">
                {t('erp.certification.transactionType')}
              </span>
              <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-text-quaternary">
                <span>
                  {t('erp.bridge.invoice.composed')}{' '}
                  <Mono className="inline-block text-text-secondary [overflow-wrap:anywhere]">
                    {transactionType}
                  </Mono>
                </span>
                <button
                  type="button"
                  onClick={() => setAdvanced((current) => !current)}
                  aria-expanded={advanced}
                  className="font-semibold text-primary-700 transition-colors hover:text-primary-800"
                >
                  {advanced ? t('erp.certification.hideAdvanced') : t('erp.certification.advanced')}
                </button>
              </p>
              {advanced ? (
                <div className="mt-2 rounded-sm bg-surface-background/60 p-4">
                  <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
                    {TRANSACTION_BITS.map((bit, index) => (
                      <Checkbox
                        key={bit}
                        label={`${index + 1} · ${t(`erp.certification.bits.${bit}`)}`}
                        checked={bits[index]}
                        disabled={sending}
                        onChange={(event) => {
                          setBits((current) =>
                            current.map((on, i) => (i === index ? event.target.checked : on)),
                          )
                          changed()
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] font-medium leading-[1.4] text-text-tertiary">
                    {t('erp.certification.bitsNote')}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </SectionCard>

        {outcome?.kind === 'done' ? <Receipt receipt={outcome.receipt} /> : null}
        {outcome?.kind === 'refused' ? (
          <Refusal refusal={outcome.refusal} error={outcome.error} />
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5">
          <button type="submit" className={PRIMARY_BUTTON} disabled={!ready}>
            {sending ? t('erp.bridge.submitting') : t('erp.bridge.submit')}
          </button>
          <button type="button" className={SECONDARY_BUTTON} onClick={reset} disabled={sending}>
            {t('erp.bridge.reset')}
          </button>
        </div>
      </form>
    </>
  )
}

/**
 * The server's answer to an upload that it took.
 *
 * Accepted means the invoice now exists and has entered the pipeline, not that it has been
 * delivered or reported: those happen afterwards and are followed in the compliance activity.
 */
function Receipt({ receipt }: { receipt: BridgeUploadResponseDto }) {
  const { t } = useTranslation()
  const duplicate = receipt.source?.disposition === 'DUPLICATE'
  return (
    <section
      role="status"
      className="flex flex-col items-start gap-2 rounded-md bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary"
    >
      <Pill
        tone={duplicate ? 'neutral' : 'success'}
        label={duplicate ? t('erp.bridge.result.duplicate') : t('erp.bridge.result.accepted')}
      />
      <p>
        {duplicate ? t('erp.bridge.result.duplicateBody') : t('erp.bridge.result.acceptedBody')}
      </p>
      <p>
        {t('erp.bridge.result.reference')}{' '}
        <span dir="ltr" className="font-mono text-xs font-semibold text-text-secondary">
          {receipt.id}
        </span>
      </p>
      {receipt.invoice_uuid ? (
        <SecondaryLink to={`/compliance/activity/${encodeURIComponent(receipt.invoice_uuid)}`}>
          {t('erp.bridge.result.follow')}
        </SecondaryLink>
      ) : null}
    </section>
  )
}

/** Every refusal in words of ours. Nothing the server wrote is shown except the support reference. */
function Refusal({ refusal, error }: { refusal: BridgeRefusal; error: unknown }) {
  const { t } = useTranslation()
  if (refusal.kind === 'other') {
    const generic = describeApiFailure(error)
    const body = t(generic.key, generic.values)
    return (
      <Notice
        body={
          generic.reference !== null
            ? `${body} ${t('apiErrors.reference', { id: generic.reference })}`
            : body
        }
      />
    )
  }
  if (refusal.kind !== 'validation') {
    return <Notice body={t(`erp.bridge.refusal.${refusal.kind}`)} />
  }
  return (
    <section role="alert" className="flex flex-col gap-3 rounded-md bg-surface-card p-5">
      <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
        {t('erp.bridge.refusal.validation')}
      </p>
      {refusal.findings.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm font-medium text-text-secondary">
          {refusal.findings.map((finding, index) => (
            <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-text-quaternary">
                {finding.layer
                  ? t(`erp.bridge.layer.${finding.layer}`)
                  : t('erp.bridge.layer.unknown')}
              </span>
              <span dir="ltr" className="font-mono text-xs font-semibold">
                {finding.rule ?? t('erp.bridge.finding.noRule')}
              </span>
              {finding.field ? (
                <span dir="ltr" className="font-mono text-xs text-text-tertiary">
                  {finding.field}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {refusal.more > 0 ? (
        <p className="text-xs font-medium text-text-quaternary">
          {t('erp.bridge.finding.more', { count: refusal.more })}
        </p>
      ) : null}
    </section>
  )
}
