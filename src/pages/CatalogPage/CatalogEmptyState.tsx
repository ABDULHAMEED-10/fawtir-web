import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { useApiRead } from '../../hooks/useApiRead'
import {
  catalogTemplatePath,
  readCatalogTemplate,
  type CatalogTemplateDto,
} from '../../api/catalog/templates'
import { templateName } from '../../lib/catalogTemplates'
import { findSubBusinessType, localName, useSignupBusinessTypes } from '../../lib/businessTypes'
import bagIcon from '../../assets/catalog/kind-bag.svg'
import sparkleIcon from '../../assets/catalog/sparkle-brand.svg'
import uploadIcon from '../../assets/catalog/upload-brand.svg'
import uploadInkIcon from '../../assets/catalog/upload-ink.svg'
import pencilIcon from '../../assets/catalog/pencil-brand.svg'
import pencilInkIcon from '../../assets/catalog/pencil-ink.svg'
import tickIcon from '../../assets/catalog/check-ink.svg'
import clockIcon from '../../assets/catalog/clock.svg'

/**
 * Catalog with nothing in it yet (Figma 135:42928).
 *
 * Two ways in, each honest about what it costs in time, plus the shortcut for a business whose
 * shape Fawtir already recognises. The Catalog page shows it when the company has no products
 * and nothing is being searched; `notice` carries that page's "not connected yet" banner.
 *
 * The shortcut names the company's own sub business type and its template's first groups (the
 * frame's coffee roastery was a sample; e2e 30 Oct, L-7). With no published template it is not
 * offered: there is nothing for Fawtir to suggest.
 */
export function CatalogEmptyState({ notice }: { notice?: ReactNode } = {}) {
  const { t, i18n } = useTranslation()
  const { read } = useApiRead<CatalogTemplateDto>(catalogTemplatePath(), () =>
    readCatalogTemplate(),
  )
  const template = read.status === 'ready' ? read.data : null
  const types = useSignupBusinessTypes().read
  const subType = template
    ? findSubBusinessType(
        types.status === 'ready' ? types.data : undefined,
        template.subBusinessTypeCode,
      )
    : undefined
  const groupNames = (template?.groups ?? []).map((group) => templateName(group, i18n.language))
  const groups = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
    groupNames.slice(0, 4),
  )

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[760px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('catalog.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.5] text-[#8f8f8f]">
              {t('catalogEmpty.subtitle')}
            </p>
          </div>
          {/* The frame's "Import from Excel" opened the template page; the catalogue has no
              spreadsheet import, so the button says where it goes, and only when there is a
              template to go to. */}
          {template ? (
            <Link
              to="/catalog/build"
              className="inline-flex h-[46px] shrink-0 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t('catalog.buildFromTemplate')}
            </Link>
          ) : null}
        </div>

        {notice}

        {/* What Fawtir already knows about this trade */}
        {template ? (
          <section className="flex flex-wrap items-center gap-4 rounded-md border border-primary-100 bg-primary-25 p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-white">
              <img src={bagIcon} alt="" className="size-5" />
            </span>
            <div className="min-w-[280px] flex-1">
              <p className="text-base font-semibold text-text-primary">
                {subType ? localName(subType, i18n.language) : t('buildCatalog.yourTemplate')}
              </p>
              <p className="mt-1 text-sm font-medium leading-[1.5] text-text-tertiary">
                <Trans
                  i18nKey="catalogEmpty.knownFor"
                  values={{ groups }}
                  components={{ b: <b className="font-semibold text-text-secondary" /> }}
                />
              </p>
            </div>
            <Link
              to="/catalog/build"
              className="inline-flex h-[42px] shrink-0 items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
            >
              <img src={sparkleIcon} alt="" className="size-4" />
              {t('catalogEmpty.letFawtirSuggest')}
            </Link>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Route
            badge={t('catalogEmpty.ifYouHaveAMenu')}
            icon={uploadIcon}
            tint="bg-pending-100"
            title={t('catalogEmpty.uploadTitle')}
            body={t('catalogEmpty.uploadBody')}
            points={[
              t('catalogEmpty.uploadPoint.formats'),
              t('catalogEmpty.uploadPoint.languages'),
              t('catalogEmpty.uploadPoint.flagged'),
            ]}
            time={t('catalogEmpty.uploadTime')}
            cta={t('catalogEmpty.uploadCta')}
            ctaIcon={uploadInkIcon}
            to="/catalog/upload"
          />
          <Route
            badge={t('catalogEmpty.fullControl')}
            icon={pencilIcon}
            tint="bg-surface-background"
            title={t('catalogEmpty.byHandTitle')}
            body={t('catalogEmpty.byHandBody')}
            points={[
              t('catalogEmpty.byHandPoint.kinds'),
              t('catalogEmpty.byHandPoint.sizes'),
              t('catalogEmpty.byHandPoint.barcodes'),
            ]}
            time={t('catalogEmpty.byHandTime')}
            cta={t('catalogEmpty.byHandCta')}
            ctaIcon={pencilInkIcon}
            to="/catalog/new"
          />
        </div>
      </div>
    </AppShell>
  )
}

function Route({
  badge,
  icon,
  tint,
  title,
  body,
  points,
  time,
  cta,
  ctaIcon,
  to,
}: {
  badge: string
  icon: string
  tint: string
  title: string
  body: string
  points: string[]
  time: string
  cta: string
  ctaIcon: string
  to: string
}) {
  return (
    <section className="flex flex-col rounded-md bg-surface-card p-6">
      <span className="inline-flex h-[24px] w-fit items-center rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-tertiary">
        {badge}
      </span>
      <span
        className={['mt-4 flex size-11 items-center justify-center rounded-md', tint].join(' ')}
      >
        <img src={icon} alt="" className="size-5" />
      </span>
      <h2 className="mt-4 text-xl font-medium leading-[1.2] text-text-primary">{title}</h2>
      <p className="mt-2 text-sm font-medium leading-[1.6] text-text-tertiary">{body}</p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-70" />
            <span className="text-sm font-medium leading-[1.4] text-text-tertiary">{point}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 flex items-center gap-2 text-xs font-medium text-text-quaternary">
        <img src={clockIcon} alt="" className="size-4" />
        {time}
      </p>

      <Link
        to={to}
        className="mt-auto inline-flex h-[50px] items-center justify-center gap-2 rounded-sm border border-border-subtle bg-white pt-0 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        style={{ marginTop: '24px' }}
      >
        <img src={ctaIcon} alt="" className="size-[18px]" />
        {cta}
      </Link>
    </section>
  )
}
