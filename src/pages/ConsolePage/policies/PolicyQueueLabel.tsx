import { useTranslation } from 'react-i18next'
import { formatUtcMoment } from '../../../lib/console/format'
import { queueLabelKey, type BlockerVersionSummary } from '../../../lib/console/validationPolicies'

/**
 * Where a version stands, as text. The date is printed only, never compared: whether the version
 * is in force yet is the server's `forceState`, which `queueLabelKey` reads.
 */
export function PolicyQueueLabel({
  version,
}: {
  version: Pick<BlockerVersionSummary, 'status' | 'allowedActions' | 'forceState' | 'effectiveFrom'>
}) {
  const { t, i18n } = useTranslation()
  const date = version.effectiveFrom
    ? formatUtcMoment(version.effectiveFrom, i18n.language)
    : t('console.policies.none')
  return <>{t(queueLabelKey(version), { date })}</>
}
