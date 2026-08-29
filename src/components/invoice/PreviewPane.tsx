import { useTranslation } from 'react-i18next'
import { useDocumentPreview } from './useDocumentPreview'
import pdfIcon from '../../assets/invoice-details/pdf.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'

/**
 * The document preview beside a credit or debit note.
 *
 * The credit-note and debit-note detail screens each had this same header with the same six
 * buttons, none of which did anything. Sharing it means the zoom, print and fullscreen behave
 * the same on both, and a third screen gets them for free.
 */

export function PreviewPane({
  src,
  alt,
  title,
  /** i18n prefix, so each screen keeps its own button labels. */
  labels,
}: {
  src: string
  alt: string
  title: string
  labels: {
    zoomOut: string
    zoomIn: string
    download: string
    print: string
    fullscreen: string
  }
}) {
  const { t } = useTranslation()
  const preview = useDocumentPreview()
  const { zoom, fullscreen } = preview

  return (
    <>
      <div className="flex items-center justify-between bg-surface-card px-3.5 py-4">
        <div className="flex items-center gap-1.5">
          <img src={pdfIcon} alt="" className="size-6" />
          <p className="text-sm font-medium text-text-secondary">{title}</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={labels.zoomOut}
              disabled={!preview.canZoomOut}
              onClick={preview.zoomOut}
              className="disabled:opacity-40"
            >
              <img src={zoomOutIcon} alt="" className="size-6" />
            </button>
            <span className="min-w-[38px] text-center text-xs font-medium text-text-tertiary tabular-nums">
              {zoom}%
            </span>
            <button
              type="button"
              aria-label={labels.zoomIn}
              disabled={!preview.canZoomIn}
              onClick={preview.zoomIn}
              className="disabled:opacity-40"
            >
              <img src={zoomInIcon} alt="" className="size-6" />
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Nothing is generated yet, so download hands over the image we are showing. */}
            <a href={src} download aria-label={labels.download}>
              <img src={downloadIcon} alt="" className="size-6" />
            </a>
            <button type="button" aria-label={labels.print} onClick={preview.print}>
              <img src={printIcon} alt="" className="size-6" />
            </button>
            <button
              type="button"
              aria-label={labels.fullscreen}
              aria-pressed={fullscreen}
              onClick={preview.openFullscreen}
            >
              <img src={fullscreenIcon} alt="" className="size-6" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto p-6 pt-4">
        <img
          src={src}
          alt={alt}
          style={{ width: `${zoom}%` }}
          className="max-w-[413px] rounded-sm shadow-card transition-[width]"
        />
      </div>

      {fullscreen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/70 p-6"
          onClick={preview.closeFullscreen}
        >
          <img src={src} alt={alt} className="max-h-full rounded-sm shadow-card" />
          <button
            type="button"
            onClick={preview.closeFullscreen}
            className="absolute end-6 top-6 rounded-sm bg-white/90 px-3 py-1.5 text-sm font-semibold text-text-secondary"
          >
            {t('common.close')}
          </button>
        </div>
      ) : null}
    </>
  )
}
