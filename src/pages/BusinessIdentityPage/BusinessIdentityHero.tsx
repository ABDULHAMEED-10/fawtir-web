import { useTranslation } from 'react-i18next'
import { BrandLogo } from '../../components/BrandLogo'
import glowLeft from '../../assets/auth/glow-left.png'
import type { InvoicePreviewData } from '../../lib/onboarding'

type BusinessIdentityHeroProps = {
  preview: InvoicePreviewData
  noteVariant?: 'peppol' | 'compliance'
}

function LocationPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5c-2.6 0-4.7 2-4.7 4.5 0 3.3 4.7 8.5 4.7 8.5s4.7-5.2 4.7-8.5C12.7 3.5 10.6 1.5 8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function BusinessIdentityHero({
  preview,
  noteVariant = 'peppol',
}: BusinessIdentityHeroProps) {
  const { t } = useTranslation()

  const hasAddress = Boolean(
    preview.addressLine || preview.city || preview.governorate || preview.postalCode,
  )

  const addressText = [
    preview.addressLine,
    [preview.city, preview.governorate, preview.postalCode].filter(Boolean).join(', '),
    preview.city || preview.governorate || preview.postalCode
      ? t('addressContact.countryOman')
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <aside className="relative hidden h-full w-[596px] shrink-0 overflow-hidden bg-surface-inverse lg:block">
      <img
        src={glowLeft}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[28%] -start-[42%] z-0 h-auto w-[180%] max-w-none rotate-180 select-none opacity-85"
      />

      <div className="relative z-10 flex h-full min-h-0 flex-col px-8 py-6 xl:py-8">
        <BrandLogo tone="onDark" size="lg" />

        <div className="mx-auto flex min-h-0 w-full max-w-[532px] flex-1 flex-col justify-center gap-4 py-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-medium leading-[1.2] text-white">
              {t('businessIdentity.heroTitle')}
            </h1>

            <div className="rounded-sm bg-white px-2 py-4">
              <div className="mx-auto flex w-full max-w-[505px] flex-col gap-[21px]">
                <div className="flex flex-col gap-[9px]">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="flex size-[88px] items-center justify-center overflow-hidden rounded-sm bg-surface-background"
                      style={
                        preview.logoUrl
                          ? undefined
                          : { backgroundColor: `${preview.accentColor}14` }
                      }
                    >
                      {preview.logoUrl ? (
                        <img src={preview.logoUrl} alt="" className="size-full object-contain" />
                      ) : (
                        <span
                          className="text-[40px] font-medium leading-none"
                          style={{ color: preview.accentColor }}
                        >
                          {preview.initials || 'AB'}
                        </span>
                      )}
                    </div>
                    <div className="flex w-[94px] flex-col items-end gap-[3px] text-end">
                      <p
                        className="text-base font-semibold leading-[1.2]"
                        style={{ color: preview.accentColor }}
                      >
                        {t('businessIdentity.taxInvoice')}
                      </p>
                      <p className="w-full text-sm font-semibold leading-[1.2] text-text-quaternary">
                        PINT-OM
                      </p>
                    </div>
                  </div>

                  <div className="flex max-w-[260px] flex-col gap-2">
                    <p className="text-xl font-semibold leading-[1.2] text-text-primary">
                      {preview.companyName || t('businessIdentity.companyPlaceholder')}
                    </p>
                    <div className="flex flex-col gap-1.5 text-sm font-semibold leading-[1.2]">
                      <div className="flex items-center">
                        <span className="w-[67px] text-text-placeholder">CR</span>
                        <span className="text-text-secondary">{preview.crNumber || '—'}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-[67px] text-text-placeholder">VAT</span>
                        <span className="text-text-secondary">{preview.vatin || '—'}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-[67px] text-text-placeholder">Peppol</span>
                        <span className="text-text-secondary">{preview.peppolId || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="h-px w-full border-t border-dashed border-border-default" />
                  {hasAddress ? (
                    <div className="flex items-start gap-1 text-text-tertiary">
                      <span className="mt-0.5 shrink-0">
                        <LocationPinIcon />
                      </span>
                      <p className="whitespace-pre-line text-xs font-medium leading-[1.2]">
                        {addressText}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs font-medium leading-[1.2] text-text-quaternary">
                      {t('businessIdentity.addressPlaceholder')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-white/30 bg-white/5 p-4 backdrop-blur-[47px]">
            {noteVariant === 'compliance' ? (
              <p className="text-sm font-medium uppercase leading-5 text-neutral-25">
                {t('addressContact.notePrefix')}{' '}
                <span className="text-base font-semibold normal-case text-white">
                  {t('addressContact.noteHighlight')}
                </span>{' '}
                {t('addressContact.noteSuffix')}
              </p>
            ) : (
              <p className="text-sm font-medium uppercase leading-5 text-neutral-25">
                {t('businessIdentity.peppolNotePrefix')}{' '}
                <span className="text-base font-semibold normal-case text-white">
                  {t('businessIdentity.peppolNoteHighlight')}
                </span>{' '}
                {t('businessIdentity.peppolNoteSuffix')}
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
