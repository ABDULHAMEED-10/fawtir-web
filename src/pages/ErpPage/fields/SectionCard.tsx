import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Section } from '../../../lib/erpCatalogue'
import { sectionId } from './model'

/**
 * One of the seven cards (docs/erp-and-console-plan.md A.2 "Section cards ×7"), headed by the
 * section's name and how many of its required terms are mapped. The rows are its children so
 * the page decides the order and the grouping.
 */
export function SectionCard({
  section,
  mapped,
  total,
  children,
}: {
  section: Section
  mapped: number
  total: number
  children: ReactNode
}) {
  const { t } = useTranslation()
  const complete = total > 0 && mapped === total
  return (
    <section id={sectionId(section)} className="scroll-mt-[72px] rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
            {t(`erp.section.${section}`)}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">
            {total > 0
              ? t('erp.fields.requiredMapped', { mapped, total })
              : t('erp.fields.noRequired')}
          </p>
        </div>
        {total > 0 ? (
          <span
            className={[
              'inline-flex h-[24px] items-center gap-1.5 rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
              complete ? 'bg-success-100 text-[#3d5648]' : 'bg-pending-100 text-pending-700',
            ].join(' ')}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {mapped}/{total}
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  )
}
