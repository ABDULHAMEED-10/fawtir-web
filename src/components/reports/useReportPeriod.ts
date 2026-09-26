import { useSearchParams } from 'react-router-dom'
import { REPORT_PERIODS, type ReportPeriod } from '../../lib/reportPeriod'

/**
 * The period the Reports header pill has chosen, from the URL (`?period=`), and a way to change
 * it. Yearly is the default and is left out of the URL.
 */
export function useReportPeriod(): [ReportPeriod, (next: ReportPeriod) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('period') as ReportPeriod | null
  const period = raw && REPORT_PERIODS.includes(raw) ? raw : 'yearly'
  const set = (next: ReportPeriod) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next === 'yearly') updated.delete('period')
        else updated.set('period', next)
        return updated
      },
      { replace: true },
    )
  return [period, set]
}
