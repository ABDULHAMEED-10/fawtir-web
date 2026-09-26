import { describe, expect, it } from 'vitest'
import { SEEDED_REFERENCE } from '../testing/referenceData'
import { blankComposerLine, blankSelfBillForm, toSelfBilledDraftRequest } from './selfBillCreate'

const form = (lines: ReturnType<typeof blankComposerLine>[]) => ({
  ...blankSelfBillForm('2026-09-27', 'b-1'),
  customerId: 'c-1',
  lines,
})

const first = (lines: ReturnType<typeof blankComposerLine>[]) =>
  toSelfBilledDraftRequest(form(lines), true, SEEDED_REFERENCE).lines[0]

describe('a self-billed draft request', () => {
  it('classifies every line: goods by their HS code, services as services', () => {
    const goods = { ...blankComposerLine('1'), description: 'Cement', hsCode: '090121000000' }
    expect(first([goods]).classification).toEqual({ goodsOrService: 'G', hsCode: '090121000000' })

    const service = { ...blankComposerLine('1'), description: 'Advice', kind: 'service' as const }
    expect(first([service]).classification).toEqual({ goodsOrService: 'S' })
    // Only an official eight-digit service type is passed on.
    expect(first([{ ...service, serviceType: '83000000' }]).classification).toEqual({
      goodsOrService: 'S',
      serviceTypeCode: '83000000',
    })
    expect(first([{ ...service, serviceType: '92900' }]).classification).toEqual({
      goodsOrService: 'S',
    })
  })

  it('sends no classification for a goods line with no HS code yet, and never an industrial one', () => {
    const goods = { ...blankComposerLine('1'), description: 'Cement' }
    expect(first([goods])).not.toHaveProperty('classification')
    const request = first([{ ...goods, hsCode: '090121000000' }])
    expect(JSON.stringify(request)).not.toContain('industrialClassificationCode')
  })
})
