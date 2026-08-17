import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDropzone } from '../ui/FileDropzone'
import scanIcon from '../../assets/create-invoice/scan.svg'
import removeIcon from '../../assets/create-invoice/remove-x.svg'
import tickIcon from '../../assets/trade-create/tick.svg'
import warningIcon from '../../assets/trade-create/warning.svg'

/**
 * "Scan to fill" — upload a supplier invoice or a photo of one, read it, and pre-fill the
 * composer.
 *
 * The extraction itself is a server job (OCR + a model), so this component owns only the UX:
 * pick a file, watch it work, review what came back, then accept or discard. `onExtract` is the
 * single seam — point it at the real endpoint and nothing else here changes.
 *
 * Everything lands as a *suggestion*: fields arrive with a confidence, low-confidence ones are
 * flagged, and nothing is written to the invoice until the user presses Fill. A parsed document
 * is evidence, not an authority — the totals are still recomputed by the engine afterwards.
 */

export type ScannedField = {
  key: string
  labelKey: string
  value: string
  /** 0–1. Below 0.75 the row is flagged for the user to check rather than silently trusted. */
  confidence: number
}

export type ScannedLine = {
  description: string
  quantity: string
  unitPrice: string
  confidence: number
}

export type ScanResult = {
  fields: ScannedField[]
  lines: ScannedLine[]
}

type Phase = 'idle' | 'working' | 'review' | 'error'

const ACCEPTED = '.pdf,.jpg,.jpeg,.png'
const MAX_BYTES = 10 * 1024 * 1024

export function ScanToFillModal({
  open,
  onClose,
  onApply,
  onExtract,
}: {
  open: boolean
  onClose: () => void
  onApply: (result: ScanResult) => void
  /** Replace with the real call; must reject on a failed read so the error state shows. */
  onExtract: (file: File) => Promise<ScanResult>
}) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPhase('idle')
    setFileName('')
    setResult(null)
    setError('')
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setPhase('error')
      setError(t('scanToFill.tooLarge'))
      return
    }
    setFileName(file.name)
    setPhase('working')
    setError('')
    try {
      const extracted = await onExtract(file)
      setResult(extracted)
      setPhase('review')
    } catch {
      setPhase('error')
      setError(t('scanToFill.failed'))
    }
  }

  const lowConfidence = (result?.fields ?? []).filter((field) => field.confidence < 0.75).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('scanToFill.title')}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-md bg-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 className="text-2xl font-medium leading-[1.2] text-[#151c2d]">
              {t('scanToFill.title')}
            </h2>
            <p className="mt-1.5 text-sm font-medium leading-[1.3] text-[#5b606c]">
              {t('scanToFill.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('linkModal.close')}
            className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-black/[0.04]"
          >
            <img src={removeIcon} alt="" className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {phase === 'idle' || phase === 'error' ? (
            <>
              <FileDropzone
                accept={ACCEPTED}
                maxBytes={MAX_BYTES}
                onFiles={(files) => void handleFile(files[0])}
                onReject={(reason) => {
                  setPhase('error')
                  setError(reason === 'size' ? t('scanToFill.tooLarge') : t('scanToFill.wrongType'))
                }}
              >
                {({ dragging }) => (
                  <span
                    className={[
                      'flex w-full flex-col items-center gap-2 rounded-sm border border-dashed px-4 py-10 text-center transition-colors',
                      dragging ? 'border-primary-700 bg-primary-25' : 'border-[#d0d2d5] bg-[#fafafa]',
                    ].join(' ')}
                  >
                    <img src={scanIcon} alt="" className="size-7" />
                    <span className="text-base font-medium leading-[1.2] text-[#2c3342]">
                      {t('scanToFill.drop')}
                    </span>
                    <span className="text-sm font-medium leading-[1.2] text-[#737781]">
                      {t('scanToFill.dropHint')}
                    </span>
                  </span>
                )}
              </FileDropzone>
              {phase === 'error' ? (
                <p className="mt-3 flex items-center gap-2 text-sm font-medium text-[#98140b]">
                  <img src={warningIcon} alt="" className="size-4" />
                  {error}
                </p>
              ) : null}
              <p className="mt-4 text-xs font-medium leading-[1.4] text-[#737781]">
                {t('scanToFill.privacy')}
              </p>
            </>
          ) : null}

          {phase === 'working' ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span
                aria-hidden="true"
                className="size-8 animate-spin rounded-full border-2 border-primary-25 border-t-primary-700"
              />
              <p className="text-base font-medium text-[#2c3342]">{t('scanToFill.reading')}</p>
              <p className="text-sm font-medium text-[#737781]">{fileName}</p>
            </div>
          ) : null}

          {phase === 'review' && result ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-[#e6efea] px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#3d5648]">
                  <img src={tickIcon} alt="" className="size-4" />
                  {t('scanToFill.readCount', {
                    fields: result.fields.length,
                    lines: result.lines.length,
                  })}
                </span>
                <span className="truncate text-xs font-medium text-[#4c6c5a]">{fileName}</span>
              </div>

              {lowConfidence > 0 ? (
                <p className="mt-3 flex items-start gap-2 rounded-sm bg-[#f7f1e6] px-3 py-2.5 text-sm font-medium leading-[1.3] text-[#6d5a39]">
                  <img src={warningIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                  {t('scanToFill.checkFields', { count: lowConfidence })}
                </p>
              ) : null}

              <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.06em] text-[#737781]">
                {t('scanToFill.fieldsFound')}
              </h3>
              <dl className="mt-2 flex flex-col">
                {result.fields.map((field) => (
                  <div
                    key={field.key}
                    className="flex items-center justify-between gap-3 border-b border-[#f3f3f3] py-2.5 last:border-b-0"
                  >
                    <dt className="text-sm font-medium text-[#5b606c]">{t(field.labelKey)}</dt>
                    <dd className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#2c3342]">{field.value}</span>
                      {field.confidence < 0.75 ? (
                        <span className="rounded-full bg-[#f7f1e6] px-2 py-0.5 text-[10px] font-semibold text-[#6d5a39]">
                          {t('scanToFill.check')}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>

              <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.06em] text-[#737781]">
                {t('scanToFill.linesFound')}
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {result.lines.map((line, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-3 rounded-sm border border-[#f3f3f3] px-3 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-[#151c2d]">
                      {line.description}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-[#5b606c]">
                      {line.quantity} × {line.unitPrice}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#f3f3f3] bg-[#fafafa] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[46px] items-center rounded-sm border border-[#e8e8ea] bg-white px-6 text-base font-medium text-[#3a3a3a]"
          >
            {t('linkModal.cancel')}
          </button>
          <button
            type="button"
            disabled={phase !== 'review' || !result}
            onClick={() => {
              if (result) onApply(result)
              onClose()
            }}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-6 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('scanToFill.fill')}
          </button>
        </div>
      </div>
    </div>
  )
}
