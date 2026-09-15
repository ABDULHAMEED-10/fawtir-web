import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RowsView } from '../../../components/ui'
import { TARGETS, type Target } from '../../../lib/erpCatalogue'
import type { Finding } from '../../../lib/erpMapping'

/**
 * The business term a canonical path belongs to. `lines[0].tax.rate` is IBT-152; a path that
 * names a whole branch (`document.preceding`) resolves to the first term under it, so the link
 * still lands somewhere useful in the wizard.
 */
export function termForCanonicalPath(field?: string): Target | undefined {
  if (!field) return undefined
  const path = field.replace(/\[\d+\]/g, '[]')
  return (
    TARGETS.find((target) => target.canonicalPath === path) ??
    TARGETS.find((target) => target.canonicalPath.startsWith(`${path}.`))
  )
}

export function termLabel(target: Target, language: string) {
  return `${target.id} · ${language.startsWith('ar') ? target.nameAr : target.name}`
}

/**
 * A certification report's findings, or a rejected record's — rule id, what went wrong, the
 * canonical field, and the way into the wizard (docs/erp-and-console-plan.md §2.4, §2.8).
 * The message keys are already full (`erp.finding.*`, or `erp.dryRun.*` / `erp.error.*` when the
 * canonical model itself objected), so the copy is one lookup with the finding's values.
 */
export function RuleFindingsTable({ findings }: { findings: Finding[] }) {
  const { t, i18n } = useTranslation()

  if (findings.length === 0) {
    return <p className="text-sm font-medium text-text-quaternary">{t('erp.shared.noFindings')}</p>
  }

  return (
    <RowsView>
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
            <th className="h-[46px] px-4 text-start font-semibold">{t('erp.shared.rule')}</th>
            <th className="h-[46px] px-4 text-start font-semibold">{t('erp.shared.message')}</th>
            <th className="h-[46px] px-4 text-start font-semibold">{t('erp.shared.field')}</th>
            <th className="h-[46px] px-4 text-start font-semibold" />
          </tr>
        </thead>
        <tbody>
          {findings.map((finding, index) => {
            const term = termForCanonicalPath(finding.field)
            return (
              <tr
                key={`${finding.ruleId}-${finding.field ?? ''}-${index}`}
                className="border-b border-surface-background last:border-0"
              >
                <td className="px-4 py-3 align-top">
                  <span
                    dir="ltr"
                    className="inline-flex h-[24px] items-center whitespace-nowrap rounded-[3px] bg-surface-background px-2 font-mono text-[11px] font-semibold text-text-tertiary"
                  >
                    {finding.ruleId}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-sm font-medium leading-[1.5] text-text-secondary">
                  {t(finding.messageKey, finding.values)}
                </td>
                <td className="px-4 py-3 align-top">
                  {finding.field ? (
                    <span dir="ltr" className="block font-mono text-[11px] text-text-secondary">
                      {finding.field}
                    </span>
                  ) : (
                    <span className="text-xs text-text-quaternary">—</span>
                  )}
                  {term ? (
                    <span className="mt-1 block text-xs font-medium text-text-quaternary">
                      {termLabel(term, i18n.language)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 align-top text-end">
                  {term ? (
                    <Link
                      to={`/settings/erp-mapping/fields#${term.id}`}
                      className="whitespace-nowrap text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                    >
                      {t('erp.shared.goToField')}
                    </Link>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </RowsView>
  )
}
