import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fileKindOf } from '../../lib/billIntake'
import fileIcon from '../../assets/bill-capture/file.svg'

/**
 * The supplier's own file, shown beside the form so the person types from it. Rendered from the
 * file they picked, which is the same bytes the server stored; an XML e-invoice has no picture,
 * so it says what it filled in instead.
 */
export function IntakeFilePreview({ file, filledFromXml }: { file: File; filledFromXml: boolean }) {
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
    <section className="flex w-full flex-col self-start overflow-hidden rounded-md bg-surface-card xl:w-[520px] xl:shrink-0">
      <p className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-text-secondary">
        <img src={fileIcon} alt="" className="size-5" />
        <span className="min-w-0 truncate">{file.name}</span>
      </p>
      <div className="flex min-h-[420px] flex-1 justify-center bg-surface-background">
        {kind === 'xml' ? (
          <p className="max-w-[360px] self-center p-6 text-center text-sm font-medium leading-[1.5] text-text-tertiary">
            {filledFromXml ? t('billIntake.xmlFilled') : t('billIntake.xmlNotRead')}
          </p>
        ) : url === null ? null : kind === 'pdf' ? (
          <iframe src={url} title={file.name} className="h-[640px] w-full border-0" />
        ) : (
          <img src={url} alt={file.name} className="max-h-[640px] w-auto object-contain p-4" />
        )}
      </div>
    </section>
  )
}
