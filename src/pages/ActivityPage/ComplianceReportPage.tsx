import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { numberingOf, periodRange } from '../../lib/complianceReport'
import {
  activityListPath,
  ledgerExportPath,
  loadActivityList,
  type ActivityListDto,
} from '../../api/compliance/activity'
import {
  COMPANY_PROFILE_PATH,
  loadCompanyProfile,
  type CompanyProfileDto,
} from '../../api/company/companyProfile'
import {
  PARTICIPANT_STANDING_PATH,
  readParticipantStanding,
  type ParticipantIdStanding,
} from '../../api/peppol/participantStanding'
import { useApiRead } from '../../hooks'
import { downloadReport } from '../../api/reports/reports'
import { saveDownload } from '../../lib/supplierRecord'
import chevronIcon from '../../assets/invoices/chevron.svg'
import excelIcon from '../../assets/reports/list-catalog.svg'

/**
 * Compliance › Activity › Report.
 *
 * There is no endpoint that builds, stores or signs a compliance report (ACTIVITY.md asks row
 * 2.10). The screen used to draw the design's finished Q2 pack for a sample company — its VAT
 * number, Participant ID, branches, register rows, an unreported invoice, a fingerprint and an
 * owner's name — which read as the reader's own report. What is real stays: the company's identity
 * from its profile, the Participant ID only once Fawtir has verified it (the Peppol screen's rule),
 * the numbering check worked out from the quarter's issued invoices, and the Excel ledger export.
 * The signed document itself is labelled as not available.
 */
export function ComplianceReportPage() {
  const { t } = useTranslation()
  const quarter = periodRange('quarter')
  const [excelBusy, setExcelBusy] = useState(false)
  const [excelFailed, setExcelFailed] = useState(false)

  const profile = useApiRead<CompanyProfileDto>(COMPANY_PROFILE_PATH, loadCompanyProfile)
  const standing = useApiRead<ParticipantIdStanding>(PARTICIPANT_STANDING_PATH, readParticipantStanding).read
  const numberingPath = activityListPath(
    { direction: 'ISSUED', documentKind: 'INVOICE', from: quarter.from, to: quarter.to },
    0,
    100,
  )
  const issued = useApiRead<ActivityListDto>(numberingPath, () => loadActivityList(numberingPath))
  // When the ledger cannot give the whole series in one read, or holds none, the check says "not
  // confirmed" rather than claiming an unbroken run.
  const numbering =
    issued.read.status === 'ready' && !issued.read.data.has_more
      ? numberingOf(issued.read.data.items.map((item) => item.invoice_number))
      : null

  const downloadExcel = async () => {
    setExcelBusy(true)
    setExcelFailed(false)
    try {
      const file = await downloadReport(ledgerExportPath({ from: quarter.from, to: quarter.to }, 'xlsx'))
      saveDownload(file, `fawtir-compliance-ledger-${quarter.from}-${quarter.to}.xlsx`)
    } catch {
      setExcelFailed(true)
    } finally {
      setExcelBusy(false)
    }
  }

  const participant =
    standing.status === 'ready' && standing.data.state === 'VERIFIED' && standing.data.verification
      ? `${standing.data.verification.participantScheme}:${standing.data.verification.participantValue}`
      : null

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/compliance/activity"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
              >
                {t('activity.title')}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            </div>
            <h1 className="mt-2 text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('complianceReport.title')}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('reportReal.subtitle', { from: quarter.from, to: quarter.to })}
            </p>
          </div>
          <button
            type="button"
            disabled={excelBusy}
            onClick={() => void downloadExcel()}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:text-text-tertiary"
          >
            <img src={excelIcon} alt="" className="size-5" />
            {excelBusy ? t('ledgerExport.working') : t('builtReport.downloadExcel')}
          </button>
        </div>

        {excelFailed ? <p className="text-sm font-medium text-danger-700">{t('ledgerExport.failed')}</p> : null}

        <Notice badge={t('moduleUnavailable.badge')} body={t('reportReal.documentUnavailable')} />

        <section aria-labelledby="report-company" className="flex flex-col gap-4 rounded-md bg-surface-card p-5">
          <h2 id="report-company" className="text-lg font-semibold text-text-primary">
            {t('builtReport.preparedFor')}
          </h2>
          {profile.read.status === 'loading' ? (
            <LoadingNotice />
          ) : profile.read.status === 'failed' ? (
            <ApiReadFailure error={profile.read.error} retry={profile.retry} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('reportReal.legalName')}>{profile.read.data.legalName}</Field>
              <Field label={t('reportReal.vatNumber')}>
                <span dir="ltr">{profile.read.data.taxNumber}</span>
              </Field>
              <Field label={t('reportReal.crNumber')}>
                <span dir="ltr">{profile.read.data.commercialRegistrationNumber}</span>
              </Field>
              <Field label={t('builtReport.peppolParticipant')}>
                {participant !== null ? (
                  <span dir="ltr">{participant}</span>
                ) : standing.status === 'loading' ? (
                  t('settings.card.pillChecking')
                ) : (
                  t('reportReal.participantNotVerified')
                )}
              </Field>
            </div>
          )}
        </section>

        <section aria-labelledby="report-numbering" className="flex flex-col gap-2 rounded-md bg-surface-card p-5">
          <h2 id="report-numbering" className="text-lg font-semibold text-text-primary">
            {t('reportReal.numberingTitle')}
          </h2>
          {issued.read.status === 'loading' ? (
            <LoadingNotice />
          ) : issued.read.status === 'failed' ? (
            <ApiReadFailure error={issued.read.error} retry={issued.retry} />
          ) : (
            <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
              <Trans
                i18nKey="builtReport.outsideNotConfirmed"
                components={{ b: <span className="font-semibold text-text-primary" /> }}
              />{' '}
              {numbering === null
                ? t('builtReport.numberingNotConfirmed')
                : numbering.gaps.length === 0
                  ? t('builtReport.numberingUnbroken', { from: numbering.from, to: numbering.to })
                  : t('builtReport.numberingGaps', {
                      from: numbering.from,
                      to: numbering.to,
                      count: numbering.gaps.length,
                      gaps: numbering.gaps.slice(0, 5).join(', ') + (numbering.gaps.length > 5 ? ', …' : ''),
                    })}
            </p>
          )}
        </section>
      </div>
    </AppShell>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{children}</p>
    </div>
  )
}
