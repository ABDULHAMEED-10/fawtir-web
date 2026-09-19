import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDropzone } from '../ui'
import { ApiError } from '../../api/errors'
import { INTAKE_MAX_BYTES, uploadIntake, type IntakeDto, type IntakeSourceDto } from '../../api/expenditure/billIntake'
import { describeApiFailure } from '../../lib/apiFailure'
import { UPLOAD_REFUSALS } from '../../lib/billIntake'
import fileIcon from '../../assets/bill-capture/file.svg'

/**
 * The first step of every intake: the supplier's file goes to the server before anything is
 * typed, because a bill is only ever created from a stored file (D12a).
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
  onUploaded: (uploaded: { intake: IntakeDto; file: File }[]) => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const inFlight = useRef(false)

  const take = async (files: File[]) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setRefusal(null)
    const uploaded: { intake: IntakeDto; file: File }[] = []
    try {
      for (const file of files) {
        uploaded.push({ intake: await uploadIntake(file, source), file })
      }
    } catch (error) {
      const coded = error instanceof ApiError && error.code ? UPLOAD_REFUSALS[error.code] : undefined
      const failure = describeApiFailure(error)
      setRefusal(coded ? t(coded) : t(failure.key, failure.values))
    } finally {
      inFlight.current = false
      setBusy(false)
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
            <span className="text-base font-semibold leading-[1.2] text-text-primary">{busy ? t('billIntake.upload.sending') : title}</span>
            <span className="max-w-[440px] text-sm font-medium leading-[1.4] text-text-tertiary">{hint}</span>
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
