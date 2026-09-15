import {
  useState,
  type ComponentType,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import {
  SECTIONS,
  settingsStore,
  usePlatformSettings,
  type Section,
} from '../../lib/platformSettings'
import { focusFirstInvalid } from '../../lib/forms'
import { isClean } from '../../lib/validation'
import type { Forms, SectionProps, Update } from './settings/draft'
import { SPECS } from './settings/specs'
import { SectionFooter, SettingsSectionCard } from './settings/shared'
import { AddonsSection } from './settings/AddonsSection'
import { BillingSection } from './settings/BillingSection'
import { CountingSection } from './settings/CountingSection'
import { FixedSection } from './settings/FixedSection'
import { LifecycleSection } from './settings/LifecycleSection'
import { NoticesSection } from './settings/NoticesSection'
import { OperationsSection } from './settings/OperationsSection'
import { OverageSection } from './settings/OverageSection'
import { PaymentsSection } from './settings/PaymentsSection'
import { PromotionalSection } from './settings/PromotionalSection'

/** The sub-nav: every editable section, then the read-only panel of what is fixed by design. */
type NavId = Section | 'fixed'
const NAV: readonly NavId[] = [...SECTIONS, 'fixed']

const BODIES: { [S in Section]: ComponentType<SectionProps<S>> } = {
  billing: BillingSection,
  counting: CountingSection,
  overage: OverageSection,
  lifecycle: LifecycleSection,
  notices: NoticesSection,
  addons: AddonsSection,
  payments: PaymentsSection,
  promotional: PromotionalSection,
  operations: OperationsSection,
}

/** Each section's draft, kept while the operator moves between sections; absent means untouched. */
type Drafts = Partial<Forms>
/** Which sections have had a Save attempted — from then on their errors follow the typing. */
type Attempted = Partial<Record<Section, boolean>>

function isNavId(value: string | null): value is NavId {
  return NAV.includes(value as NavId)
}

/**
 * Super Admin › Console settings — every value the platform runs on that is not a price
 * (`docs/erp-and-console-plan.md` §4.2, §7.5, Appendix C.2).
 *
 * Each section is one card with its own Save: a draft is edited in place and written to the
 * store as a whole, so a half-changed section is never live. Drafts survive a move to another
 * section, and the sub-nav marks the ones not yet saved.
 */
export function ConsoleSettingsPage() {
  return (
    <ConsoleShell>
      <ConsoleSettings />
    </ConsoleShell>
  )
}

function ConsoleSettings() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const { settings } = usePlatformSettings()
  const [drafts, setDrafts] = useState<Drafts>({})
  const [attempted, setAttempted] = useState<Attempted>({})

  const requested = params.get('section')
  const active: NavId = isNavId(requested) ? requested : 'billing'

  const isDirty = <S extends Section>(section: S) => {
    const draft = drafts[section]
    if (draft === undefined) return false
    return JSON.stringify(draft) !== JSON.stringify(SPECS[section].toForm(settings[section]))
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[720px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('console.settings.title')}
          </h1>
          <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
            {t('console.settings.subtitle')}
          </p>
        </div>
        <Link
          to="/console/plans"
          className="inline-flex h-[46px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('console.settings.plansLink')}
        </Link>
      </div>

      <div className="flex items-start gap-4 max-lg:flex-col max-lg:items-stretch">
        <nav
          aria-label={t('console.settings.sectionsLabel')}
          className="flex w-[232px] shrink-0 flex-col gap-0.5 rounded-md bg-surface-card p-2 max-lg:w-auto max-lg:flex-row max-lg:gap-1 max-lg:overflow-x-auto"
        >
          {NAV.map((id) => {
            const current = id === active
            const dirty = id !== 'fixed' && isDirty(id)
            return (
              <Link
                key={id}
                to={`/console/settings?section=${id}`}
                aria-current={current ? 'page' : undefined}
                className={[
                  'flex items-center justify-between gap-2 rounded-sm px-3 py-2.5 text-sm transition-colors max-lg:shrink-0 max-lg:whitespace-nowrap',
                  current
                    ? 'bg-primary-25 font-semibold text-primary-800'
                    : 'font-medium text-text-tertiary hover:bg-surface-background hover:text-text-secondary',
                ].join(' ')}
              >
                {t(`console.settings.nav.${id}`)}
                {dirty ? (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-pending-500"
                    title={t('console.settings.unsaved')}
                  >
                    <span className="sr-only">{t('console.settings.unsaved')}</span>
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {active === 'fixed' ? (
            <FixedSection />
          ) : (
            <SectionHost
              key={active}
              section={active}
              drafts={drafts}
              setDrafts={setDrafts}
              attempted={attempted}
              setAttempted={setAttempted}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** One section's card: its draft, validation, Save, Reset and the audit line. */
function SectionHost<S extends Section>({
  section,
  drafts,
  setDrafts,
  attempted,
  setAttempted,
}: {
  section: S
  drafts: Drafts
  setDrafts: Dispatch<SetStateAction<Drafts>>
  attempted: Attempted
  setAttempted: Dispatch<SetStateAction<Attempted>>
}) {
  const { t, i18n } = useTranslation()
  const { settings, savedMark, isDefault } = usePlatformSettings()
  const spec = SPECS[section]
  // JSX cannot simplify the mapped lookup to ComponentType<SectionProps<S>> on its own.
  const Body = BODIES[section] as ComponentType<SectionProps<S>>

  const stored = spec.toForm(settings[section])
  const form: Forms[S] = drafts[section] ?? stored
  const dirty = JSON.stringify(form) !== JSON.stringify(stored)
  const errors = attempted[section] ? spec.validate(form) : {}

  const set: Update<S> = (updater) =>
    setDrafts((current) => ({ ...current, [section]: updater(current[section] ?? stored) }))

  const forget = () => {
    setDrafts((current) => {
      const next = { ...current }
      delete next[section]
      return next
    })
    setAttempted((current) => ({ ...current, [section]: false }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = spec.validate(form)
    if (!isClean(next)) {
      setAttempted((current) => ({ ...current, [section]: true }))
      focusFirstInvalid(event.currentTarget, Object.keys(next), next)
      return
    }
    settingsStore.save(section, spec.fromForm(form))
    forget()
  }

  const reset = () => {
    settingsStore.reset(section)
    forget()
  }

  const mark = savedMark(section)
  const savedBy = mark
    ? t('console.settings.savedBy', {
        by: mark.by,
        when: new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(mark.at),
      })
    : undefined

  return (
    <SettingsSectionCard
      title={t(`console.settings.section.${section}.title`)}
      note={t(`console.settings.section.${section}.note`)}
      onSubmit={submit}
      footer={
        <SectionFooter
          dirty={dirty}
          isDefault={isDefault(section) && !dirty}
          savedBy={savedBy}
          onReset={reset}
        />
      }
    >
      <Body form={form} set={set} errors={errors} />
    </SettingsSectionCard>
  )
}
