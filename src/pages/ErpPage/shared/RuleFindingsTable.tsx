import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RowsView } from '../../../components/ui'
import { TARGETS, type Target } from '../../../lib/erpCatalogue'
import type { MappingFindingDto } from '../../../api/erp/mapping'
import { THEAD_ROW } from '../overview/idiom'
import { findingLayerName } from './documentKind'

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
 * A certification report's findings — rule id, what went wrong, the field, and the way into the
 * wizard (docs/erp-and-console-plan.md §2.4, §2.8).
 *
 * `rule_id` is the PINT / EN 16931 rule identifier verbatim: public compliance vocabulary, not a
 * Fawtir-invented code, and the identity a reader can look up or quote to their accountant. It is
 * rendered as it arrived and never translated.
 *
 * `message` is the validator's own sentence, likewise rendered as it arrived. It is not a
 * translation key — there is no closed set of them to translate, because the rules come from the
 * Peppol rule artefacts. The fields the server sends are already free of document content.
 */
export function RuleFindingsTable({ findings }: { findings: MappingFindingDto[] }) {
  const { t, i18n } = useTranslation()

  if (findings.length === 0) {
    return <p className="text-sm font-medium text-text-quaternary">{t('erp.shared.noFindings')}</p>
  }

  return (
    <RowsView>
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className={THEAD_ROW}>
            <th className="h-[40px] px-4 text-start font-semibold">{t('erp.shared.rule')}</th>
            <th className="h-[40px] px-4 text-start font-semibold">{t('erp.shared.message')}</th>
            <th className="h-[40px] px-4 text-start font-semibold">{t('erp.shared.field')}</th>
            <th className="h-[40px] px-4 text-start font-semibold" />
          </tr>
        </thead>
        <tbody>
          {findings.map((finding, index) => {
            // The server names the business term directly in `field_id` when the rule names one.
            // The XPath is the fallback: it says where in the emitted document it went wrong, which
            // resolves to a term often enough to be worth linking.
            const term = finding.field_id
              ? TARGETS.find((target) => target.id === finding.field_id)
              : termForCanonicalPath(finding.xpath ?? undefined)
            const where = finding.field_id ?? finding.xpath
            return (
              <tr
                key={`${finding.rule_id ?? 'rule'}-${where ?? ''}-${index}`}
                className="border-b border-surface-background last:border-0"
              >
                <td className="px-4 py-3 align-top">
                  {/* One empty mark in every column: the same "—" in the same text face. */}
                  {finding.rule_id ? (
                    <span
                      dir="ltr"
                      className="inline-flex h-[24px] items-center whitespace-nowrap rounded-[3px] bg-surface-background px-2 font-mono text-[11px] font-semibold text-text-tertiary"
                    >
                      {finding.rule_id}
                    </span>
                  ) : (
                    <span className="text-xs text-text-quaternary">—</span>
                  )}
                  {finding.layer ? (
                    <span className="mt-1 block text-[10px] font-semibold tracking-[0.4px] text-text-quaternary">
                      {findingLayerName(t, finding.layer)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 align-top text-sm font-medium leading-[1.5] text-text-secondary">
                  {finding.message ? (
                    <span dir="auto" className="block">
                      {finding.message}
                    </span>
                  ) : (
                    <span className="text-xs text-text-quaternary">—</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {where ? (
                    <span dir="ltr" className="block font-mono text-[11px] text-text-secondary [overflow-wrap:anywhere]">
                      {where}
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
