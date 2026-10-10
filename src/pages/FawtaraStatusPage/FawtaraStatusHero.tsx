import { useTranslation } from 'react-i18next'
import { BrandLogo } from '../../components/BrandLogo'
import invoiceAmico from '../../assets/fawtara-status/invoice-amico.svg'
import glowLeft from '../../assets/auth/glow-left.png'

export function FawtaraStatusHero() {
  const { t } = useTranslation()

  return (
    <aside className="relative hidden h-full w-[596px] shrink-0 overflow-hidden bg-surface-inverse lg:block">
      <img
        src={glowLeft}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[28%] left-[-42%] z-0 h-auto w-[180%] max-w-none rotate-180 select-none opacity-85"
      />

      <div className="relative z-10 flex h-full min-h-0 flex-col px-8 py-6 xl:py-8">
        <BrandLogo tone="onDark" size="lg" />

        <div className="mx-auto mt-8 flex min-h-0 w-full max-w-[530px] flex-1 flex-col items-center gap-6 xl:mt-12 xl:gap-10">
          <div className="flex w-full shrink-0 flex-col gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-neutral-25 xl:text-[40px]">
              {t('fawtaraStatus.heroTitle')}
            </h1>
            <p className="text-base font-medium leading-[1.2] text-primary-75 opacity-80 xl:text-xl">
              {t('fawtaraStatus.heroSubtitle')}
            </p>
          </div>

          <div className="flex min-h-0 w-full flex-1 items-start justify-center pt-4 xl:pt-8">
            <img
              src={invoiceAmico}
              alt=""
              className="h-full max-h-[453px] w-full max-w-[453px] select-none object-contain object-top"
            />
          </div>
        </div>
      </div>
    </aside>
  )
}
