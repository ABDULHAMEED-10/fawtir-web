/** Opens the ERP-scoped audit history (R22); the server confines what it returns. */
export const ERP_AUDIT_PERMISSION = 'erp.audit.read'

/**
 * What each ERP capability needs, as the server checks it (`@RequiresPermission` on the ERP,
 * mapping, invoice and API-key routes; backend Phase 3, DEC-B). `anyOf`: holding any one is enough.
 */
export const ERP_CAPABILITIES = [
  { id: 'readConnections', anyOf: ['erp.connection.read'] },
  { id: 'manageConnections', anyOf: ['erp.connection.manage'] },
  { id: 'replaceCredentials', anyOf: ['erp.credential.replace'] },
  { id: 'testConnections', anyOf: ['erp.connection.test'] },
  { id: 'fetchSample', anyOf: ['erp.connection.sample'] },
  { id: 'readMapping', anyOf: ['mapping.read', 'admin.settings.manage'] },
  { id: 'manageMapping', anyOf: ['mapping.manage', 'admin.settings.manage'] },
  { id: 'certifyMapping', anyOf: ['mapping.certify', 'admin.settings.manage'] },
  { id: 'submitDocuments', anyOf: ['invoice.submit'] },
  { id: 'readActivity', anyOf: ['invoice.read'] },
  { id: 'recoverDocuments', anyOf: ['erp.document.recover'] },
  // API keys and the activity log have no narrower permission on the server.
  { id: 'manageApiKeys', anyOf: ['admin.settings.manage'] },
  { id: 'readHistory', anyOf: [ERP_AUDIT_PERMISSION] },
] as const

/**
 * The personas of the ERP plan (Phase 3 persona matrix), as the permissions a role would need for
 * each. Presentation only: the server has no template for any of them, and Tenant Administrator
 * is the built-in ADMIN role, which holds every tenant permission.
 */
export const ERP_PERSONAS = [
  { id: 'tenantAdministrator', permissions: ['ADMIN (built-in role)'] },
  {
    id: 'integrationAdministrator',
    permissions: [
      'erp.connection.read',
      'erp.connection.manage',
      'erp.credential.replace',
      'erp.connection.test',
      'erp.connection.sample',
      'mapping.read',
      'mapping.manage',
      'mapping.certify',
      'invoice.read',
      ERP_AUDIT_PERMISSION,
    ],
  },
  {
    id: 'integrationOperator',
    permissions: ['erp.connection.read', 'erp.connection.test', 'invoice.read'],
  },
  { id: 'invoiceSubmitter', permissions: ['invoice.submit', 'invoice.read'] },
  { id: 'reportingViewer', permissions: ['invoice.read', 'erp.connection.read'] },
] as const
