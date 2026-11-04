import { useTranslation } from 'react-i18next'
import checkIcon from '../../assets/home/check.svg'
import qrReceipt from '../../assets/home/qr-receipt.webp'
import qrReceiptAr from '../../assets/home/qr-receipt-ar.webp'
import { Heading, SOFT, Texture } from './site'

/**
 * The consumer QR code (owner, 1 Nov 2026). No Figma frame; drawn in the site's own pieces like the
 * audience cards. What it says is held to the published rules: the Tax Authority's e-invoicing FAQ
 * (the QR is required on every B2C invoice, full or simplified, and made by the taxpayer, C1; B2C
 * invoices are reported within 24 hours) and Appendix D of the Peppol Oman Architecture v1.0.2 for
 * what the code holds. The picture is the till's real receipt from the mock API, whose QR the API
 * serves (`GET /v1/pos/sales/{id}/qr`).
 */

const POINTS = ['p1', 'p2', 'p3', 'p4'] as const

export function QrSection() {
  const { t, i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  return (
    <section
      id="qr-code"
      aria-labelledby="qr-code-title"
      className="mx-auto mt-[200px] w-full max-w-[1520px] px-4 max-md:mt-24 md:px-8 min-[1600px]:px-0"
    >
      <div className="relative grid overflow-hidden rounded-lg border border-[#eaedf8] bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        <Texture flip="rotate" />
        <div className="relative px-10 py-12 max-md:px-6 max-md:py-8">
          <p className="inline-flex rounded-full bg-[#eef2ff] px-3 py-1 text-sm font-medium leading-5 text-[#2c4eb7]">
            {t('landing.qr.tag')}
          </p>
          <div id="qr-code-title" className="mt-5">
            <Heading lead={t('landing.qr.titleLead')} em={t('landing.qr.titleEm')} />
          </div>
          <p className={`mt-5 max-w-[640px] text-lg leading-7 ${SOFT}`}>{t('landing.qr.sub')}</p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            {POINTS.map((id) => (
              <li key={id} className="flex items-start gap-3">
                <img src={checkIcon} alt="" className="mt-[3px] size-[18px] shrink-0" />
                <div>
                  <h3 className="text-base font-semibold leading-6">
                    {t(`landing.qr.${id}.title`)}
                  </h3>
                  <p className={`mt-1 text-base leading-6 ${SOFT}`}>{t(`landing.qr.${id}.body`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <figure className="relative flex flex-col items-center justify-center bg-[#f7f9ff] px-10 py-12 max-md:px-6 max-md:py-8">
          <img
            src={ar ? qrReceiptAr : qrReceipt}
            alt={t('landing.qr.alt')}
            width={703}
            height={ar ? 1497 : 1490}
            loading="lazy"
            className="w-full max-w-[320px] rounded-lg border border-[#e3e8f6] shadow-[0_16px_40px_rgba(21,28,45,0.12)]"
          />
        </figure>
      </div>
    </section>
  )
}
