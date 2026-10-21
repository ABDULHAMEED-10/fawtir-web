import { describe, expect, it } from 'vitest'
import { isAdministratorOnly, isReservedInMatrix, roleCodeFor } from '../api/settings/roles'
import { editorGroupOf, grantOfLimitValue, limitValueOf, offeredPermissions, toRoleGrants } from './roleEditor'

describe('the role code', () => {
  it('is made from a Latin name and always matches the server pattern', () => {
    const fixed = () => 0.5
    expect(roleCodeFor('Delivery driver', fixed)).toMatch(/^delivery_driver_[a-z0-9]{6}$/)
    expect(roleCodeFor('  2nd shift / Nizwa!  ', fixed)).toMatch(/^nd_shift_nizwa_[a-z0-9]{6}$/)
    for (const name of ['سائق التوصيل', '123', '', 'x'.repeat(200)]) {
      const code = roleCodeFor(name)
      expect(code).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(code.length).toBeLessThanOrEqual(50)
    }
  })
})

describe('Administrator-only codes (RL-5)', () => {
  it("mirrors the server's ReservedPermissions", () => {
    for (const code of ['admin.users.manage', 'admin.roles.manage', 'admin.settings.manage', 'branch.manage',
      'tenant.plan.manage', 'erp.connection.manage', 'erp.credential.replace', 'erp.anything.new',
      'smp.participant.manage', 'mapping.manage', 'mapping.certify', 'webhooks.manage']) {
      expect(isAdministratorOnly(code)).toBe(true)
    }
    for (const code of ['erp.connection.read', 'erp.audit.read', 'branch.read', 'branch.users.manage',
      'tenant.plan.read', 'invoice.approve', 'role.list', 'smp.participant.view', 'mapping.read']) {
      expect(isAdministratorOnly(code)).toBe(false)
    }
  })

  it("reads the matrix's reserved flag first and falls back to the list when the server omits it", () => {
    const permission = (code: string, reserved?: boolean) => ({
      code, module: null, description: null, qualifiers: [], ...(reserved === undefined ? {} : { reserved }),
    })
    expect(isReservedInMatrix(permission('invoice.issue', true))).toBe(true)
    expect(isReservedInMatrix(permission('webhooks.manage', false))).toBe(false)
    expect(isReservedInMatrix(permission('webhooks.manage'))).toBe(true)
    expect(isReservedInMatrix(permission('invoice.issue'))).toBe(false)
    expect(
      offeredPermissions([
        permission('invoice.issue', false),
        permission('mapping.certify', true),
        permission('smp.participant.manage'),
        permission('customer.read'),
      ]).map((p) => p.code),
    ).toEqual(['invoice.issue', 'customer.read'])
  })
})

describe('the column sent to the server', () => {
  it('splits full and limited grants, sorted', () => {
    expect(
      toRoleGrants({
        'invoice.read': { qualifier: null },
        'invoice.draft': { qualifier: 'MAX_PERCENT', value: 20 },
        'creditnote.create': { qualifier: 'OWN' },
        'customer.read': { qualifier: null },
      }),
    ).toEqual({
      permissionCodes: ['customer.read', 'invoice.read'],
      qualifiedPermissions: [
        { code: 'creditnote.create', qualifier: 'OWN' },
        { code: 'invoice.draft', qualifier: 'MAX_PERCENT', value: 20 },
      ],
    })
  })

  it('round-trips a limit through the picker', () => {
    for (const grant of [{ qualifier: null }, { qualifier: 'OWN' }, { qualifier: 'MAX_PERCENT', value: 12.5 }] as const) {
      expect(grantOfLimitValue(limitValueOf(grant))).toEqual(grant)
    }
  })

  it("files each permission under the design's headings", () => {
    expect(editorGroupOf('invoice.issue')).toBe('selling')
    expect(editorGroupOf('invoice.payment.manage')).toBe('money')
    expect(editorGroupOf('product.manage')).toBe('catalog')
    expect(editorGroupOf('bill.settle')).toBe('money')
    expect(editorGroupOf('branch.read')).toBe('account')
  })
})
