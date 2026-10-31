import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fileKindOf } from '../../lib/billIntake'
import fileIcon from '../../assets/bill-capture/file.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5]

/**
 * The supplier's own file beside the form (Figma 163:22397): a "Page 1 of 1" bar with zoom, and
 * the document itself. Rendered from the file the person picked, which is the same bytes the
 * server stored; an XML e-invoice has no picture, so it says what it filled in instead.
 */
export function IntakeFilePreview({
  file,
  filledFromXml,
  pageCount,
}: {
  file: File
  filledFromXml: boolean
  /** The page count the reader gave (`reading.pageCount`); a file it did not read shows 1. */
  pageCount?: number
}) {
  const { t } = useTranslation()
  const kind = fileKindOf(file)
  const [url, setUrl] = useState<string | null>(null)
  const [zoomIndex, setZoomIndex] = useState(1)
  const zoom = ZOOM_STEPS[zoomIndex]

  useEffect(() => {
    if (kind === 'xml') return
    const created = URL.createObjectURL(file)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [file, kind])

  const zoomButton =
    'inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40'

  return (
    <section className="flex w-full flex-col self-start overflow-hidden rounded-md bg-surface-card xl:w-[440px] xl:shrink-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-secondary">
          <img src={fileIcon} alt="" className="size-5 shrink-0" />
          <span className="truncate">
            {kind === 'xml'
              ? file.name
              : t('uploadBill.pageOf', { current: 1, total: pageCount ?? 1 })}
          </span>
        </p>
        {kind === 'xml' ? null : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t('invoiceDetails.zoomOut')}
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
              className={zoomButton}
            >
              <img src={zoomOutIcon} alt="" className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t('invoiceDetails.zoomIn')}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
              className={zoomButton}
            >
              <img src={zoomInIcon} alt="" className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t('invoiceDetails.fullscreen')}
              onClick={() => url && window.open(url, '_blank', 'noopener')}
              className={zoomButton}
            >
              <img src={fullscreenIcon} alt="" className="size-5" />
            </button>
          </div>
        )}
      </div>
      <div className="min-h-[420px] flex-1 overflow-auto bg-surface-background p-5">
        {kind === 'xml' ? (
          <p className="mx-auto max-w-[360px] py-24 text-center text-sm font-medium leading-[1.5] text-text-tertiary">
            {filledFromXml ? t('billIntake.xmlFilled') : t('billIntake.xmlNotRead')}
          </p>
        ) : url === null ? null : (
          <div
            style={{ width: `${zoom * 100}%` }}
            className="mx-auto rounded-sm bg-white shadow-card"
          >
            {kind === 'pdf' ? (
              <iframe src={url} title={file.name} className="h-[640px] w-full border-0" />
            ) : (
              <img src={url} alt={file.name} className="block h-auto w-full" />
            )}
          </div>
        )}
      </div>
    </section>
  )
}
