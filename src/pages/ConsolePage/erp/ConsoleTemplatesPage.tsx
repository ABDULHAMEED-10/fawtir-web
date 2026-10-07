import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { formatDay } from '../../../lib/console/format'
import {
  connectionsOnTemplate,
  connectionsOnVersion,
  draftVersion,
  publishedVersion,
  useConsoleErp,
  type MappingTemplate,
} from '../../../lib/consoleErp'
import type { Product } from '../../../lib/erpConnector'
import {
  CONSOLE_PAGE,
  CONSOLE_SMALL,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'

/** The products the connect wizard lists that have no starter mapping yet. */
const COMING: Product[] = ['DYNAMICS_365', 'SAP_S4', 'ORACLE_FUSION', 'ZOHO_BOOKS']

const OPEN_BUTTON = CONSOLE_SMALL

/**
 * ERP › Mapping templates (docs/erp-and-console-plan.md §9.3): one card per template — the
 * published version, the draft if one is in progress, and how many connections started from it.
 */
export function ConsoleTemplatesPage() {
  const { t, i18n } = useTranslation()
  const state = useConsoleErp()
  const day = (date: Date) => formatDay(date.toISOString(), i18n.language)

  const card = (template: MappingTemplate) => {
    const published = publishedVersion(template)
    const draft = draftVersion(template)
    const onTemplate = connectionsOnTemplate(state, template.id)
    const onPublished = published ? connectionsOnVersion(state, published.id).length : 0
    const older = onTemplate.length - onPublished
    return (
      <article
        key={template.id}
        className="flex flex-wrap items-start justify-between gap-4 rounded-sm bg-surface-card p-5"
      >
        <div className="flex min-w-0 flex-1 basis-[420px] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to={`/console/erp/templates/${template.id}`}
              className="text-xl font-medium leading-[1.2] text-text-primary transition-colors hover:text-primary-700"
            >
              {template.name}
            </Link>
            <ConsoleStatusPill
              tone="neutral"
              label={t(`erp.connector.product.${template.product}`)}
            />
            <span className="text-xs font-medium text-text-quaternary">
              {t('console.erp.templates.version', { version: template.erpVersion })} ·{' '}
              {t('console.erp.templates.versions', { count: template.versions.length })}
            </span>
          </div>

          <dl className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <dt className="shrink-0">
                <ConsoleStatusPill tone="success" label={t('console.erp.templates.published')} />
              </dt>
              <dd className="text-sm font-medium text-text-secondary">
                {published ? (
                  <>
                    {t('console.erp.templates.publishedLine', {
                      version: published.version,
                      schema: published.schemaVersion,
                      date: day(published.publishedAt ?? published.savedAt),
                      by: published.publishedBy ?? published.savedBy,
                    })}{' '}
                    · {t('console.erp.templates.fields', { count: published.entries.length })}
                  </>
                ) : (
                  t('console.erp.templates.noTemplate')
                )}
              </dd>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <dt className="shrink-0">
                <ConsoleStatusPill
                  tone={draft ? 'pending' : 'neutral'}
                  label={t('console.erp.templates.draft')}
                />
              </dt>
              <dd
                className={`text-sm font-medium ${draft ? 'text-text-secondary' : 'text-text-quaternary'}`}
              >
                {draft
                  ? t('console.erp.templates.draftLine', {
                      version: draft.version,
                      date: day(draft.savedAt),
                      by: draft.savedBy,
                    })
                  : t('console.erp.templates.noDraft')}
              </dd>
            </div>
          </dl>

          <p className="text-sm font-medium text-text-tertiary">
            {onTemplate.length === 0
              ? t('console.erp.templates.noConnections')
              : t('console.erp.templates.connections', { count: onTemplate.length })}
            {older > 0 ? (
              <span className="text-pending-700">
                {' '}
                · {t('console.erp.templates.older', { count: older })}
              </span>
            ) : null}
          </p>
        </div>

        <Link to={`/console/erp/templates/${template.id}`} className={OPEN_BUTTON}>
          {t('console.erp.templates.open')}
        </Link>
      </article>
    )
  }

  return (
    <ConsoleShell>
      <div className={CONSOLE_PAGE}>
        <ConsoleBreadcrumbs
          items={[
            { labelKey: 'console.nav.group.erp' },
            { labelKey: 'console.nav.erpTemplates' },
          ]}
        />
        <ConsolePageHeader
          title={t('console.erp.templates.title')}
          subtitle={t('console.erp.templates.subtitle')}
          subtitleClassName="max-w-[760px]"
        />

        <div className="flex flex-col gap-3">{state.templates.map(card)}</div>

        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-5">
          <div>
            <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('console.erp.templates.coming')}
            </h2>
            <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
              {t('console.erp.templates.comingNote')}
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {COMING.map((product) => (
              <li
                key={product}
                aria-disabled="true"
                className="flex flex-wrap items-center justify-between gap-3 py-3 opacity-60"
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-sm font-medium text-text-secondary">
                    {t(`erp.connector.product.${product}`)}
                  </span>
                  <ConsoleStatusPill tone="neutral" label={t('console.erp.templates.noTemplate')} />
                </span>
                <span
                  className={`${OPEN_BUTTON} cursor-not-allowed hover:bg-white`}
                  aria-hidden="true"
                >
                  {t('console.erp.templates.open')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ConsoleShell>
  )
}
