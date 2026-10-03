import { useEffect, useState } from 'react'
import { useApiRead, type ApiRead } from '../../../hooks/useApiRead'
import {
  getExtractionSettings,
  getExtractionStatus,
  type ExtractionSettingsDto,
  type ExtractionStatusDto,
} from '../../../api/erp/extraction'

/**
 * Reads for the extraction screen, in the same idiom as {@link useConnectionDetail}.
 *
 * Both keep the freshest answer that arrived rather than the state of the current request, because
 * `useApiRead` reports `loading` again on every retry: a panel that switched back to a spinner after
 * a save would unmount and take the operator's place in the flow with it. That is the defect the
 * mapping screens had, and it is worth not repeating in a screen whose whole job is a sequence.
 *
 * Neither read polls. Status is refreshed when the operator does something that could change it — a
 * save, an enable, a disable — and otherwise left alone: a connection screen that re-requested every
 * few seconds would multiply by the number of open tabs, and nothing here is real-time.
 */

export type ExtractionSettingsRead = {
  read: ApiRead<ExtractionSettingsDto>
  settings: ExtractionSettingsDto | null
  refreshing: boolean
  reload: () => void
}

export function useExtractionSettings(connectionId: string | undefined): ExtractionSettingsRead {
  const key = connectionId === undefined ? null : `erp-extraction/${connectionId}`
  const { read, retry } = useApiRead<ExtractionSettingsDto>(key, () =>
    getExtractionSettings(connectionId as string),
  )
  const [lastGood, setLastGood] = useState<ExtractionSettingsDto | null>(null)

  useEffect(() => {
    if (read.status === 'ready') setLastGood(read.data)
  }, [read])

  // A different connection must not show the previous one's settings for an instant.
  useEffect(() => {
    setLastGood(null)
  }, [key])

  const settings = read.status === 'ready' ? read.data : lastGood
  return {
    read,
    settings,
    refreshing: read.status === 'loading' && lastGood !== null,
    reload: retry,
  }
}

export type ExtractionStatusRead = {
  read: ApiRead<ExtractionStatusDto>
  status: ExtractionStatusDto | null
  refreshing: boolean
  reload: () => void
}

export function useExtractionStatus(connectionId: string | undefined): ExtractionStatusRead {
  const key = connectionId === undefined ? null : `erp-extraction-status/${connectionId}`
  const { read, retry } = useApiRead<ExtractionStatusDto>(key, () =>
    getExtractionStatus(connectionId as string),
  )
  const [lastGood, setLastGood] = useState<ExtractionStatusDto | null>(null)

  useEffect(() => {
    if (read.status === 'ready') setLastGood(read.data)
  }, [read])

  useEffect(() => {
    setLastGood(null)
  }, [key])

  const status = read.status === 'ready' ? read.data : lastGood
  return {
    read,
    status,
    refreshing: read.status === 'loading' && lastGood !== null,
    reload: retry,
  }
}
