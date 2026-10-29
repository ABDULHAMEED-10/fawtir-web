import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleSectionFrame } from '../../../layouts/ConsoleShell/ConsoleSectionFrame'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_PAGE,
  CONSOLE_SMALL,
  CONSOLE_TABLE,
  CONSOLE_TAB_LINE,
  CONSOLE_THEAD,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { consoleTab } from '../../../layouts/ConsoleShell/consoleTones'
import { formatInstant } from '../../../lib/format'
import {
  BILLING_READ,
  enterpriseListPath,
  enterpriseTermsRoute,
  type EnterpriseCompanyDto,
  type EnterpriseState,
} from '../../../lib/console/enterpriseTerms'
import { ENTERPRISE_STATE_TONE } from './enterpriseState'

const K = 'console.enterprise.'

/** Waiting for terms first: it is the state Fawtir has to act on. */
const TABS: Array<EnterpriseState | null> = ['TERMS_NOT_SET', 'TERMS_SET', 'BILLING_STARTED', null]

/**
 * The companies that chose Enterprise or hold Enterprise terms, by state (P2-5 §3.9), newest
 * activity first, each opening its terms. Read under `platform.billing.read`.
 */
export function ConsoleEnterprisePage() {
  return (
    <ConsoleShell requires={BILLING_READ}>
      <EnterpriseList />
    </ConsoleShell>
  )
}

function EnterpriseList() {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState<EnterpriseState | null>('TERMS_NOT_SET')
  const { read, retry } = useConsoleRead<EnterpriseCompanyDto[]>(enterpriseListPath(state))

  let body: ReactNode
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t(`${K}loading`)} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (read.data.length === 0) {
    body = (
      <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t(`${K}empty.${state ?? 'ALL'}`)}
      </p>
    )
  } else {
    body = (
      <div className={`${CONSOLE_CARD} overflow-x-auto`}>
        <table className={`${CONSOLE_TABLE} min-w-[560px] text-sm`}>
          <thead>
            <tr className={CONSOLE_THEAD}>
              <th className="px-4 py-3 text-start">{t(`${K}col.company`)}</th>
              <th className="px-4 py-3 text-start">{t(`${K}col.state`)}</th>
              <th className="px-4 py-3 text-start">{t(`${K}col.since`)}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {read.data.map((row) => (
              <tr key={row.tenantId}>
                <td className="px-4 py-3 font-medium text-text-primary">
                  {row.legalName || t('console.enterpriseTerms.company')}
                </td>
                <td className="px-4 py-3">
                  <ConsoleStatusPill
                    tone={Object.hasOwn(ENTERPRISE_STATE_TONE, row.state) ? ENTERPRISE_STATE_TONE[row.state] : 'neutral'}
                    label={t(`console.enterpriseTerms.state.${row.state}`)}
                  />
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {formatInstant(row.since, i18n.language)}
                </td>
                <td className="px-4 py-3 text-end">
                  <Link to={enterpriseTermsRoute(row.tenantId)} className={CONSOLE_SMALL}>
                    {t(`${K}open`)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleSectionFrame section="tenants" tab="enterprise" />
      <ConsolePageHeader level="section" title={t(`${K}title`)} subtitle={t(`${K}subtitle`)} />
      <div className="flex flex-wrap gap-x-6 rounded-sm bg-surface-card px-5">
        {TABS.map((tab) => {
          const active = tab === state
          return (
            <button
              key={tab ?? 'ALL'}
              type="button"
              aria-pressed={active}
              className={consoleTab(active)}
              onClick={() => setState(tab)}
            >
              {t(`${K}tab.${tab ?? 'ALL'}`)}
              {active ? <span className={CONSOLE_TAB_LINE} /> : null}
            </button>
          )
        })}
      </div>
      {body}
    </div>
  )
}
