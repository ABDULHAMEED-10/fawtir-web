import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RialText, withRial } from '../../components/ui'
import {
  BUILT_REPORT,
  builtFigures,
  formatOmr,
  numberingOf,
  periodRange,
  type RegisterRow,
} from '../../lib/complianceReport'
import {
  activityListPath,
  ledgerExportPath,
  loadActivityList,
  type ActivityListDto,
} from '../../api/compliance/activity'
import { useApiRead } from '../../hooks'
import { useSession } from '../../lib/session/session'
import { COMPANY_PROFILE_PATH, loadCompanyProfile, type CompanyProfileDto } from '../../api/company/companyProfile'
import {
  PARTICIPANT_STANDING_PATH,
  readParticipantStanding,
  type ParticipantIdStanding,
} from '../../api/peppol/participantStanding'
import { downloadReport } from '../../api/reports/reports'
import { saveDownload } from '../../lib/supplierRecord'
import { ComplianceReportModal, type ReportRequest } from './ComplianceReportModal'
import chevronIcon from '../../assets/invoices/chevron.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import excelIcon from '../../assets/reports/list-catalog.svg'
import shareIcon from '../../assets/activity/ch-peppol.svg'
import warnIcon from '../../assets/activity/warn-danger.svg'
import brandIcon from '../../assets/brand/logo-mark.svg'

const OUTCOME_CHIP: Record<RegisterRow['outcome'], string> = {
  accepted: 'bg-success-100 text-[#3d5648]',
  corrected: 'bg-pending-100 text-pending-700',
  notReported: 'bg-[#f5d5cf] text-danger-700',
}

/**
 * The built compliance report: Compliance › Activity › Report (Figma 154:109471, "Build report").
 *
 * TODO(backend): there is no endpoint that builds, stores or returns a report (asks row 2.10), so
 * the document is the design's Q2 pack. "Download Excel" is real: it is the ledger export for the
 * report's quarter, the same file the dialog's Excel format produces.
 *
 * The left pane is the document itself, rendered rather than embedded, so it stays legible and
 * searchable in the browser; the right column is what you do with it. Every figure on the cover
 * page comes from the same period book the build dialog used.
 */
export function ComplianceReportPrototype() {
  const { t } = useTranslation()
  const report = BUILT_REPORT
  // Who the report is for, and who asked for it, are integrated facts: the company's profile, its
  // Participant ID once Fawtir has verified it, and the signed-in user. Only the parts with no
  // server yet (figures, register, attestation, sharing) stay the prototype's sample data, under
  // the sample-data ribbon (docs/MOCK_DATA_POLICY.md).
  const profileRead = useApiRead<CompanyProfileDto>(COMPANY_PROFILE_PATH, loadCompanyProfile).read
  const profile = profileRead.status === 'ready' ? profileRead.data : null
  const standingRead = useApiRead<ParticipantIdStanding>(PARTICIPANT_STANDING_PATH, readParticipantStanding).read
  const participant =
    standingRead.status === 'ready' && standingRead.data.state === 'VERIFIED' && standingRead.data.verification
      ? `${standingRead.data.verification.participantScheme}:${standingRead.data.verification.participantValue}`
      : null
  const requester = useSession()?.username ?? ''
  const companyName = profile?.legalName ?? ''
  const figures = builtFigures()
  const navigate = useNavigate()
  const [rebuilding, setRebuilding] = useState(false)
  const [excelBusy, setExcelBusy] = useState(false)
  const [excelFailed, setExcelFailed] = useState(false)

  // "Numbering runs unbroken" is worked out from the invoices we issued in the report's quarter,
  // never printed. When the ledger cannot give the whole series in one read, or holds none, the
  // report says "not confirmed". TODO(backend): ACTIVITY.md 2.36, the numbering check on the report.
  const quarter = periodRange('quarter')
  const numberingPath = activityListPath(
    { direction: 'ISSUED', documentKind: 'STANDARD_INVOICE', from: quarter.from, to: quarter.to },
    0,
    100,
  )
  const issued = useApiRead<ActivityListDto>(numberingPath, () => loadActivityList(numberingPath))
  const numbering =
    issued.read.status === 'ready' && !issued.read.data.has_more
      ? numberingOf(issued.read.data.items.map((item) => item.invoice_number))
      : null

  const downloadExcel = async (range: { from: string; to: string }) => {
    setExcelBusy(true)
    setExcelFailed(false)
    try {
      const file = await downloadReport(
        ledgerExportPath({ from: range.from, to: range.to }, 'xlsx'),
      )
      saveDownload(file, `fawtir-compliance-ledger-${range.from}-${range.to}.xlsx`)
    } catch {
      setExcelFailed(true)
    } finally {
      setExcelBusy(false)
    }
  }

  const rebuild = (request: ReportRequest) => {
    setRebuilding(false)
    if (request.formats.includes('excel')) void downloadExcel(request)
    if (request.formats.includes('pdf'))
      navigate(`/compliance/activity/report?period=${request.period}`)
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Breadcrumb + actions */}
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
              <span className="text-2xl font-medium leading-[1.2] text-text-primary">
                {t('complianceReport.title')} · {t(report.periodLabelKey)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {t('complianceReport.title')}
              </h1>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
                <span className="size-1.5 rounded-full bg-[#3d5648]" />
                {t('builtReport.ready')}
              </span>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-[#e6e7eb] px-2.5 text-xs font-medium text-text-tertiary">
                <span className="size-1.5 rounded-full bg-text-tertiary" />
                {t('builtReport.fixedToVersion')}
              </span>
            </div>

            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('builtReport.subtitle', {
                range: report.range,
                built: report.builtAt,
                pages: report.pages,
              })}
            </p>
          </div>

          {/* The frame lines the actions up with the title, not the breadcrumb. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 md:mt-[37px] max-md:shrink">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={printIcon} alt="" className="size-5" />
              {t('builtReport.print')}
            </button>
            <button
              type="button"
              disabled={excelBusy}
              onClick={() => void downloadExcel(periodRange('quarter'))}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:text-text-tertiary"
            >
              <img src={excelIcon} alt="" className="size-5" />
              {excelBusy ? t('ledgerExport.working') : t('builtReport.downloadExcel')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={shareIcon} alt="" className="size-5 brightness-0 invert" />
              {t('builtReport.shareSecurely')}
            </button>
          </div>
        </div>

        {excelFailed ? (
          <p className="text-sm font-medium text-danger-700">{t('ledgerExport.failed')}</p>
        ) : null}

        <div className="flex flex-col gap-4 xl:flex-row">
          {/* The document */}
          <article className="min-w-0 flex-1 rounded-md bg-[#e6e7eb] p-5 max-md:p-2">
            <div className="mx-auto max-w-[760px] rounded-sm bg-white p-8 shadow-card">
              <p className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                <span>{t('builtReport.pageOf', { page: 1, total: report.pages })}</span>
                <span>{t('builtReport.summaryAndAttestation')}</span>
              </p>

              <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="flex items-center gap-2">
                    <img src={brandIcon} alt="" className="h-6 w-auto" />
                    <span className="text-lg font-semibold text-primary-800">Fawtir</span>
                  </span>
                  <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                    {t('builtReport.asp')}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-lg font-semibold text-text-primary">
                    {t('complianceReport.title')}
                  </p>
                  <p className="mt-1 text-xs font-medium text-text-tertiary">{report.range}</p>
                </div>
              </header>

              <div className="mt-6 grid gap-5 border-t border-[#eceef2] pt-5 sm:grid-cols-2">
                <Field label={t('builtReport.preparedFor')}>
                  <p className="text-sm font-semibold text-text-primary">
                    {companyName || t('settings.card.pillChecking')}
                  </p>
                  {profile ? (
                    <p className="mt-1 text-xs font-medium leading-[1.5] text-text-tertiary">
                      VAT <bdi dir="ltr">{profile.taxNumber}</bdi> · CR{' '}
                      <bdi dir="ltr">{profile.commercialRegistrationNumber}</bdi>
                      <br />
                      {[profile.registeredAddress, profile.registeredCity].filter(Boolean).join(', ')}
                    </p>
                  ) : null}
                </Field>
                <Field label={t('builtReport.peppolParticipant')}>
                  <p className="font-mono text-sm font-semibold text-text-primary">
                    {participant ?? t('reportReal.participantNotVerified')}
                  </p>
                </Field>
                <Field label={t('builtReport.prepared')}>
                  <p className="text-sm font-semibold text-text-primary">{report.builtAt}</p>
                  <p className="mt-1 text-xs font-medium text-text-tertiary">
                    {t('builtReport.by', { who: requester })}
                  </p>
                </Field>
                <Field label={t('builtReport.reportReference')}>
                  <p className="font-mono text-sm font-semibold text-text-primary">
                    {report.reference}
                  </p>
                  <p className="mt-1 text-xs font-medium text-text-tertiary">
                    {t('builtReport.coversBranches')}
                  </p>
                </Field>
              </div>

              {/* What was reported */}
              <p className="mt-7 border-b border-border-subtle pb-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-text-primary">
                {t('builtReport.whatWasReported')}
              </p>
              <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-3">
                <Stat
                  label={t('builtReport.stat.invoicesIssued')}
                  value={String(figures.invoices)}
                  note={
                    figures.debitNotes === null
                      ? t('builtReport.stat.includingCreditNotes', { count: figures.creditNotes })
                      : t('builtReport.stat.includingCreditAndDebitNotes', {
                          credit: figures.creditNotes,
                          debit: figures.debitNotes,
                        })
                  }
                />
                <Stat
                  label={t('builtReport.stat.acceptedByOta')}
                  value={String(figures.acceptedOverall)}
                  note={t('builtReport.stat.percentOfQuarter', {
                    percent: figures.acceptedOverallRate,
                  })}
                  tone="text-[#3d5648]"
                  rule="border-s-[#4c6c5a]"
                />
                <Stat
                  label={t('builtReport.stat.neverReported')}
                  value={String(figures.notReported)}
                  note={t('builtReport.stat.setOutBelow')}
                  tone="text-danger-700"
                  rule="border-s-danger-700"
                />
                <Stat
                  label={t('builtReport.stat.totalInvoiced')}
                  value={`OMR ${formatOmr(figures.netInvoiced)}`}
                  note={t('builtReport.stat.includingVat')}
                />
                {/* VAT inside the reported invoices only (5/105 of the inclusive total, less the
                    unreported invoice's own VAT), not 5% of the inclusive total. */}
                <Stat
                  label={t('builtReport.stat.vatReported')}
                  value={
                    figures.vat === null
                      ? t('complianceReport.notAvailableYet')
                      : `OMR ${formatOmr(figures.vat)}`
                  }
                  note={t('builtReport.stat.allStandard')}
                  rule="border-s-[#4c6c5a]"
                />
                <Stat
                  label={t('builtReport.stat.notInVatFigure')}
                  value={`OMR ${formatOmr(figures.vatOutside)}`}
                  note={t('builtReport.stat.fromUnreported')}
                  tone="text-pending-500"
                  rule="border-s-pending-500"
                />
              </div>
              {/* A line under the grid rather than a seventh cell, so the 3 x 2 grid stays as drawn. */}
              <p className="mt-4 text-xs font-medium leading-[1.7] text-text-secondary">
                {figures.receivedReported !== null && figures.receivedTotal !== null ? (
                  <Trans
                    i18nKey="builtReport.receivedReported"
                    values={{ n: figures.receivedReported, m: figures.receivedTotal }}
                    components={{ b: <span className="font-semibold text-text-primary" /> }}
                  />
                ) : (
                  t('builtReport.receivedNotAvailable')
                )}
              </p>

              {/* Auditor note */}
              <p className="mt-7 border-b border-border-subtle pb-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-text-primary">
                {t('builtReport.thingsAuditorShouldKnow')}
              </p>
              <div className="mt-3 rounded-sm border border-[#f0d4ce] bg-[#fdf4f2] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-danger-700">
                  <img src={warnIcon} alt="" className="size-4" />
                  {t('builtReport.neverAcceptedHeadline')}
                </p>
                <p className="mt-2 text-xs font-medium leading-[1.7] text-text-secondary">
                  <Trans
                    i18nKey="builtReport.neverAcceptedBody"
                    values={{
                      invoice: report.unreported.invoice,
                      issued: report.unreported.issued,
                      customer: report.unreported.customer,
                      total: `OMR ${formatOmr(report.unreported.total)}`,
                      code: report.unreported.code,
                      vat: `OMR ${formatOmr(report.unreported.vat)}`,
                    }}
                    components={{
                      b: <RialText as="span" className="font-semibold text-text-primary" />,
                    }}
                  />
                </p>
              </div>

              <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                {t('builtReport.alsoWorthNoting')}
              </p>
              <p className="mt-2 text-xs font-medium leading-[1.7] text-text-secondary">
                <Trans
                  i18nKey="builtReport.correctedNote"
                  values={{ count: figures.corrected }}
                  components={{ b: <span className="font-semibold text-text-primary" /> }}
                />
              </p>
              <p className="mt-2.5 text-xs font-medium leading-[1.7] text-text-secondary">
                {/* TODO(backend): ACTIVITY.md 2.36. Nothing on our side can show that no invoice
                    was issued outside Fawtir, so the claim reads "not confirmed". */}
                <Trans
                  i18nKey="builtReport.outsideNotConfirmed"
                  components={{ b: <span className="font-semibold text-text-primary" /> }}
                />{' '}
                {numbering === null
                  ? t('builtReport.numberingNotConfirmed')
                  : numbering.gaps.length === 0
                    ? t('builtReport.numberingUnbroken', {
                        from: numbering.from,
                        to: numbering.to,
                      })
                    : t('builtReport.numberingGaps', {
                        from: numbering.from,
                        to: numbering.to,
                        count: numbering.gaps.length,
                        gaps:
                          numbering.gaps.slice(0, 5).join(', ') +
                          (numbering.gaps.length > 5 ? ', …' : ''),
                      })}
              </p>

              {/* Register */}
              <p className="mt-7 border-b border-border-subtle pb-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-text-primary">
                {t('builtReport.registerFirstRows', { total: figures.invoices })}
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="bg-[#151c2d] text-[9px] font-semibold uppercase tracking-[0.5px] text-white">
                      {(
                        [
                          'invoice',
                          'date',
                          'customer',
                          'total',
                          'vat',
                          'reference',
                          'outcome',
                        ] as const
                      ).map((key, index) => (
                        <th
                          key={key}
                          className={[
                            'h-[30px] px-2.5 font-semibold',
                            index === 3 || index === 4 ? 'text-end' : 'text-start',
                          ].join(' ')}
                        >
                          {t(`builtReport.col.${key}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.register.map((row) => (
                      <tr
                        key={row.invoice}
                        className={[
                          'border-b border-[#f3f3f3]',
                          row.outcome === 'notReported' ? 'bg-[#fdf4f2]' : '',
                        ].join(' ')}
                      >
                        <td className="px-2.5 py-2.5 text-[11px] font-semibold text-text-primary">
                          {row.invoice}
                        </td>
                        <td className="px-2.5 py-2.5 text-[11px] font-medium text-text-tertiary">
                          {row.date}
                        </td>
                        <td className="px-2.5 py-2.5 text-[11px] font-medium text-text-tertiary">
                          {row.customer}
                        </td>
                        <td className="px-2.5 py-2.5 text-end text-[11px] font-medium text-text-secondary tabular-nums">
                          {formatOmr(row.total)}
                        </td>
                        <td className="px-2.5 py-2.5 text-end text-[11px] font-medium text-text-secondary tabular-nums">
                          {formatOmr(row.vat)}
                        </td>
                        <td className="px-2.5 py-2.5 font-mono text-[10px] text-text-quaternary">
                          {row.reference ?? '—'}
                        </td>
                        <td className="px-2.5 py-2.5">
                          <span
                            className={[
                              'inline-flex h-[20px] items-center rounded-[3px] px-1.5 text-[9px] font-semibold uppercase tracking-[0.4px]',
                              OUTCOME_CHIP[row.outcome],
                            ].join(' ')}
                          >
                            {t(`builtReport.outcome.${row.outcome}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2.5 text-[11px] font-medium italic text-text-quaternary">
                {t('builtReport.remainingRows', {
                  count: figures.invoices - report.register.length,
                  from: 4,
                  to: 17,
                })}
              </p>

              {/* Attestation */}
              <p className="mt-7 border-t border-[#151c2d] pt-5 text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                {t('builtReport.attestation')}
              </p>
              <p className="mt-2.5 text-xs font-medium leading-[1.7] text-text-secondary">
                <Trans
                  i18nKey="builtReport.attestationBody"
                  components={{ b: <span className="font-semibold text-text-primary" /> }}
                />
              </p>
              <p className="mt-3 text-xs font-medium leading-[1.7] text-text-secondary">
                <Trans
                  i18nKey="builtReport.attestationLimits"
                  components={{ b: <span className="font-semibold text-text-primary" /> }}
                />
              </p>
              <p className="mt-3 break-all text-left font-mono text-[10px] leading-[1.6] text-text-quaternary">
                {t('builtReport.fingerprintLabel')} {report.fingerprint}
              </p>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label={t('builtReport.preparedBy')}>
                  <p className="text-sm font-semibold text-text-primary">
                    {t('builtReport.preparedByName')}
                  </p>
                  <p className="mt-1 text-xs font-medium text-text-tertiary">
                    {t('builtReport.signedAutomatically', { at: report.builtAt })}
                  </p>
                </Field>
                <Field label={t('builtReport.requestedBy')}>
                  <p className="text-sm font-semibold text-text-primary">{requester}</p>
                  <p className="mt-1 text-xs font-medium text-text-tertiary">{companyName}</p>
                </Field>
              </div>

              <div className="mt-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                  {t('builtReport.verifyThisCopy')}
                </p>
                <p className="mt-1 text-sm font-semibold text-primary-700">{report.verifyUrl}</p>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('builtReport.confirmsFingerprint')}
                </p>
              </div>
            </div>
          </article>

          {/* Side */}
          <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('builtReport.thisReport')}
              </h3>
              <dl className="mt-3 flex flex-col">
                <Row label={t('builtReport.reportReference')} value={report.reference} mono />
                <Row label={t('builtReport.periodLabel')} value={t(report.periodLabelKey)} />
                <Row label={t('builtReport.invoicesLabel')} value={String(figures.invoices)} />
                <Row
                  label={t('builtReport.acceptedLabel')}
                  value={String(figures.acceptedOverall)}
                />
                <Row
                  label={t('builtReport.unreportedLabel')}
                  value={String(figures.notReported)}
                  danger
                />
                <Row label={t('builtReport.pagesLabel')} value={String(report.pages)} />
                <Row label={t('builtReport.builtLabel')} value={report.builtAt} last />
              </dl>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('builtReport.jumpTo')}
              </h3>
              <ol className="mt-3 flex flex-col">
                {report.contents.map((entry, index) => (
                  <li
                    key={entry.id}
                    className={[
                      'flex items-center gap-3 py-2.5',
                      index < report.contents.length - 1
                        ? 'border-b border-surface-background'
                        : '',
                    ].join(' ')}
                  >
                    <span className="w-4 shrink-0 text-xs font-medium text-text-quaternary tabular-nums">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium leading-[1.3] text-text-secondary">
                      {t(`builtReport.contents.${entry.id}`)}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-text-quaternary">
                      p{entry.page}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('builtReport.beforeYouSend')}
              </h3>
              <p className="mt-2.5 text-sm font-medium leading-[1.6] text-text-tertiary">
                {t('builtReport.beforeYouSendBody', { invoice: report.unreported.invoice })}
              </p>
              <div className="mt-4 flex flex-col gap-2.5">
                <Link
                  to={`/compliance/activity?tab=rejected&q=${report.unreported.invoice}`}
                  className="inline-flex h-[42px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('builtReport.putItRight', { invoice: report.unreported.invoice })}
                </Link>
                <button
                  type="button"
                  onClick={() => setRebuilding(true)}
                  className="inline-flex h-[42px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('builtReport.rebuildOnceFixed')}
                </button>
              </div>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('builtReport.sendingItOut')}
              </h3>
              <dl className="mt-3 flex flex-col">
                <Row
                  label={t('builtReport.sharedSoFar')}
                  value={
                    report.sharing.sharedWith === 0
                      ? t('builtReport.nobody')
                      : String(report.sharing.sharedWith)
                  }
                />
                <Row
                  label={t('builtReport.downloads')}
                  value={
                    report.sharing.downloads === 0
                      ? t('builtReport.noneYet')
                      : String(report.sharing.downloads)
                  }
                  last
                />
              </dl>
            </section>
          </aside>
        </div>
      </div>

      <ComplianceReportModal
        open={rebuilding}
        onClose={() => setRebuilding(false)}
        onBuild={rebuild}
      />
    </AppShell>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
        {label}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function Stat({
  label,
  value,
  note,
  tone = 'text-text-primary',
  rule = 'border-s-border-subtle',
}: {
  label: string
  value: string
  note: string
  tone?: string
  rule?: string
}) {
  return (
    <div className={['border-s-2 ps-3', rule].join(' ')}>
      <p className="text-[10px] font-medium leading-[1.3] text-text-quaternary">{label}</p>
      <p className={['mt-1 text-lg font-semibold leading-[1.2] tabular-nums', tone].join(' ')}>
        {withRial(value)}
      </p>
      <p className="mt-1 text-[10px] font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </div>
  )
}

function Row({
  label,
  value,
  mono,
  danger,
  last,
}: {
  label: string
  value: string
  mono?: boolean
  danger?: boolean
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">{label}</dt>
      <dd
        className={[
          'shrink-0 text-sm',
          mono ? 'font-mono text-xs font-semibold' : 'font-semibold',
          danger ? 'text-danger-700' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
