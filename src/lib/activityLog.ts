/**
 * The resource kinds the server records against, as `resource_type` names them, for the activity
 * log's filter. Only kinds the backend actually writes; a filter for one it never writes would
 * always answer empty.
 */
export const ERP_RESOURCE_TYPES = [
  'ERP_CONNECTION',
  'API_KEY',
  'MAPPING_PROFILE',
  'MAPPING_CERTIFICATION',
  'ERP_SOURCE_DOCUMENT',
  'ERP_EXTRACTION_RUN',
  'ERP_ENTITLEMENT',
] as const

/**
 * The kinds the ERP-scoped log answers (`ErpAuditScope` on the server). `API_KEY` is not one:
 * key events cover general keys too, so they stay in the organisation's full log.
 */
export const ERP_HISTORY_RESOURCE_TYPES = ERP_RESOURCE_TYPES.filter(
  (kind) => kind !== 'API_KEY',
)

export const ACTIVITY_RESOURCE_TYPES = ['USER', 'SESSION', 'DEVICE', ...ERP_RESOURCE_TYPES] as const
