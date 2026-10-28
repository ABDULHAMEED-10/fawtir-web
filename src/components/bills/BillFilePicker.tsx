import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDropzone } from '../ui'
import { ApiError } from '../../api/errors'
import { INTAKE_MAX_BYTES, uploadIntake, type IntakeDto, type IntakeSourceDto } from '../../api/expenditure/billIntake'
import { describeApiFailure } from '../../lib/apiFailure'
import { UPLOAD_REFUSALS, fileKindOf } from '../../lib/billIntake'
import fileIcon from '../../assets/bill-capture/file.svg'

/** One stored file, and how long its upload took as the browser saw it (the reading time). */
export type UploadedIntake = { intake: IntakeDto; file: File; readSeconds?: number }

/** The server gives the reader about 45 seconds; the bar fills towards that and never quite ends. */
const READ_BUDGET_SECONDS = 45

/**
 * Seconds since `running` turned true, ticking once a second, and 0 while it is false. The
 * upload waits for the document reader, so the person sees time passing instead of a frozen box.
 */
export function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) {
      setSeconds(0)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [running])
  return seconds
}

/** The share of the reading budget used, held below 95% until the answer comes. */
export function readingPercent(seconds: number): number {
  return Math.min(95, Math.round((seconds / READ_BUDGET_SECONDS) * 100))
}

/**
 * The first step of every intake: the supplier's file goes to the server before anything is
 * typed, because a bill is only ever created from a stored file (D12a). A PDF or photo is read
 * while the upload waits (up to about 45 seconds), so the box shows that it is reading and for
 * how long, and each file's time is handed on for "read in N seconds" (EXPENDITURE.md 1.6).
 */
export function BillFilePicker({
  accept,
  source,
  multiple = false,
  title,
  hint,
  onUploaded,
}: {
  accept: string
  source: IntakeSourceDto
  multiple?: boolean
  title: string
  hint: string
  onUploaded: (uploaded: UploadedIntake[]) => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  /** The file being sent: 1-based position, how many, and whether it is one the reader reads. */
  const [sending, setSending] = useState<{ current: number; total: number; read: boolean } | null>(
    null,
  )
  const seconds = useElapsedSeconds(sending !== null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const inFlight = useRef(false)

  const take = async (files: File[]) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setRefusal(null)
    const uploaded: UploadedIntake[] = []
    try {
      for (const [index, file] of files.entries()) {
        setSending({ current: index + 1, total: files.length, read: fileKindOf(file) !== 'xml' })
        const started = performance.now()
        const intake = await uploadIntake(file, source)
        uploaded.push({ intake, file, readSeconds: (performance.now() - started) / 1000 })
      }
    } catch (error) {
      const coded = error instanceof ApiError && error.code ? UPLOAD_REFUSALS[error.code] : undefined
      const failure = describeApiFailure(error)
      setRefusal(coded ? t(coded) : t(failure.key, failure.values))
    } finally {
      inFlight.current = false
      setBusy(false)
      setSending(null)
      if (uploaded.length > 0) onUploaded(uploaded)
    }
  }

  return (
    <section className="rounded-md bg-surface-card p-5">
      <FileDropzone
        accept={accept}
        multiple={multiple}
        maxBytes={INTAKE_MAX_BYTES}
        onFiles={(files) => void take(files)}
        onReject={(reason) => setRefusal(t(reason === 'size' ? 'billIntake.upload.tooLarge' : 'billIntake.upload.wrongType'))}
        className="w-full"
      >
        {({ dragging }) => (
          <span
            className={[
              'flex w-full flex-col items-center gap-3 rounded-sm border border-dashed px-6 py-12 text-center transition-colors',
              dragging ? 'border-primary-700 bg-primary-25' : 'border-primary-300 bg-surface-tab-bar',
            ].join(' ')}
          >
            <span className="flex size-12 items-center justify-center rounded-sm bg-white">
              <img src={fileIcon} alt="" className="size-6" />
            </span>
            <span className="text-base font-semibold leading-[1.2] text-text-primary">
              {!busy
                ? title
                : sending?.read
                  ? sending.total > 1
                    ? t('billIntake.upload.readingOf', { ...sending, seconds })
                    : t('billIntake.upload.reading', { seconds })
                  : t('billIntake.upload.sending')}
            </span>
            <span className="max-w-[440px] text-sm font-medium leading-[1.4] text-text-tertiary">
              {busy && sending?.read ? t('billIntake.upload.readingHint') : hint}
            </span>
            {busy && sending?.read ? (
              <span
                role="progressbar"
                aria-label={t('billIntake.upload.reading', { seconds })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={readingPercent(seconds)}
                className="h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-white"
              >
                <span
                  style={{ width: `${readingPercent(seconds)}%` }}
                  className="block h-full rounded-full bg-primary-700 transition-[width]"
                />
              </span>
            ) : null}
          </span>
        )}
      </FileDropzone>
      {refusal ? (
        <p role="alert" className="mt-3 text-sm font-medium text-text-danger">
          {refusal}
        </p>
      ) : null}
    </section>
  )
}
