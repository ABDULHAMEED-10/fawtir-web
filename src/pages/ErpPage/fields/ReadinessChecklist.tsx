import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CoverageBanner } from '../ErpShell'
import { TARGET_BY_ID } from '../../../lib/erpCatalogue'
import type { GuidedMappingValidationDto } from '../../../api/erp/mapping'
import type { SaveOutcome } from '../../../lib/erp/draft'
import { useMappingError, useTermName } from './model'
import tickIcon from '../../../assets/settings/check-white.svg'

/**
 * The sticky right-hand column (docs/erp-and-console-plan.md §2.2 "Checklist"): required n/m
 * with the missing ones named and linked, the invalid rows, the validator's warnings, the
 * coverage limits, and the Save button with what the last save came back with.
 *
 * Every figure is the server's. `requiredTenantMappedTargets` counts only the mandatory terms a
 * tenant can actually supply — the platform-supplied and derived ones are excluded by the server,
 * because a readiness figure that could never reach 100% teaches the reader to ignore it.
 */
export function ReadinessChecklist({
  readiness,
  checking,
  dirty,
  result,
  version,
  saving,
  onSave,
  onJump,
}: {
  readiness: GuidedMappingValidationDto
  checking: boolean
  dirty: boolean
  result: SaveOutcome | null
  /** Null before the mapping has ever been saved. */
  version: number | null
  saving: boolean
  onSave: () => void
  onJump: (businessTermId: string) => void
}) {
  const { t } = useTranslation()
  const termName = useTermName()
  const mappingError = useMappingError()
  const total = readiness.requiredTenantMappedTargets.length
  const mapped = readiness.mappedRequiredTargets.length
  const complete = mapped === total
  const invalid = readiness.invalidMappings

  const jump = (id: string, label: string) => (
    <button
      type="button"
      onClick={() => onJump(id)}
      className="inline-flex max-w-full items-baseline gap-1.5 text-start text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
    >
      <span dir="ltr" className="shrink-0 font-mono text-[11px] font-semibold text-text-tertiary">
        {id}
      </span>
      <span className="min-w-0">{label}</span>
    </button>
  )

  return (
    <section className="rounded-md bg-surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
            {t('erp.fields.checklist')}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">
            {version === null
              ? t('erp.fields.versionNew')
              : t('erp.fields.version', { version })}
          </p>
        </div>
        {checking ? (
          <span className="inline-flex h-[24px] shrink-0 items-center gap-1.5 rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
            <span className="size-1.5 animate-pulse rounded-full bg-current" />
            {t('erp.fields.checking')}
          </span>
        ) : null}
      </div>

      {/* Required fields */}
      <div className="mt-4">
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-text-tertiary">
            {t('erp.fields.requiredFields')}
          </span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">
            {mapped}/{total}
          </span>
        </p>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-background">
          <span
            className={[
              'block h-full rounded-full transition-[width]',
              complete ? 'bg-[#4c6c5a]' : 'bg-pending-500',
            ].join(' ')}
            style={{ width: `${total ? (mapped / total) * 100 : 0}%` }}
          />
        </span>
        {readiness.missingRequiredTargets.length > 0 ? (
          <>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('erp.fields.missingLead')}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {readiness.missingRequiredTargets.map((id) => {
                const target = TARGET_BY_ID[id]
                return <li key={id}>{jump(id, target ? termName(target) : id)}</li>
              })}
            </ul>
          </>
        ) : null}
      </div>

      {/* Invalid */}
      <div className="mt-4 border-t border-surface-background pt-4">
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-text-tertiary">{t('erp.fields.invalid')}</span>
          <span
            className={[
              'text-sm font-semibold tabular-nums',
              invalid.length ? 'text-danger-700' : 'text-text-primary',
            ].join(' ')}
          >
            {invalid.length}
          </span>
        </p>
        {invalid.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {invalid.map((mapping, index) => {
              // The server sends a null term when the refused entry did not name one at all
              // (MISSING_SOURCE on a blank row). There is no row to jump to in that case, so the
              // message stands on its own rather than linking nowhere.
              const termId = mapping.businessTermId
              const target = termId ? TARGET_BY_ID[termId] : undefined
              return (
                <li key={`${termId ?? 'unnamed'}-${mapping.errorCode}-${index}`}>
                  {termId ? jump(termId, target ? termName(target) : termId) : null}
                  <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-danger">
                    {mappingError(mapping)}
                  </p>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            {t('erp.fields.invalidNone')}
          </p>
        )}
      </div>

      {/* Warnings */}
      {readiness.warnings.length > 0 ? (
        <div className="mt-4 border-t border-surface-background pt-4">
          <p className="text-sm font-medium text-text-tertiary">{t('erp.fields.warnings')}</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {/* The server sends finished sentences here, not keys — rendered as they arrive. */}
            {readiness.warnings.map((warning, index) => (
              <li
                key={`warning-${index}`}
                className="text-xs font-medium leading-[1.5] text-pending-700"
              >
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <CoverageBanner compact />
      </div>

      {/* Save */}
      {/*
        Enabled for an incomplete draft on purpose. `valid` and `readyForActivation` are different
        questions: saving an unfinished mapping is how a tenant works through seventy fields over
        more than one sitting, and only a structurally invalid entry is refused. Disabling Save
        until everything was mapped would strand exactly the reader this screen is for.
      */}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-4 inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <img src={tickIcon} alt="" className="size-4" />
        {saving ? t('erp.shared.working') : t('erp.fields.save')}
        {dirty && !saving ? (
          <span
            aria-label={t('erp.fields.unsaved')}
            title={t('erp.fields.unsaved')}
            className="size-2 rounded-full bg-pending-500"
          />
        ) : null}
      </button>

      {result ? (
        <p
          role="status"
          className={[
            'mt-3 text-sm font-medium leading-[1.5]',
            result.status === 'refused'
              ? 'text-danger-700'
              : result.status === 'draft'
                ? 'text-pending-700'
                : 'text-[#3d5648]',
          ].join(' ')}
        >
          {/*
            A refusal shows the server's own sentence. The save route throws on the first
            structurally invalid entry, so it answers with one message rather than the whole
            validation document — the full list is above, from the validate route, which answers
            200 even when the mapping is invalid.
          */}
          {result.status === 'refused'
            ? result.message
            : result.status === 'draft'
              ? t('erp.fields.saveDraft', {
                  count: result.readiness.missingRequiredTargets.length,
                })
              : t('erp.fields.saveActivated')}
          {result.status === 'activated' ? (
            <>
              {' '}
              <Link
                to="/settings/erp-mapping/certification"
                className="font-semibold text-primary-700 underline-offset-2 hover:underline"
              >
                {t('erp.fields.certifyNext')}
              </Link>
            </>
          ) : null}
        </p>
      ) : dirty ? (
        <p className="mt-3 text-xs font-medium text-text-quaternary">{t('erp.fields.unsaved')}</p>
      ) : null}
    </section>
  )
}
