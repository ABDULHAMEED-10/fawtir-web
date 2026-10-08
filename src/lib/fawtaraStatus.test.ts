import { describe, expect, it } from 'vitest'
import { goingLiveSteps, needsPortalRequest, type GoingLivePhase } from './fawtaraStatus'

const states = (phase: GoingLivePhase) => goingLiveSteps(phase).map((step) => step.state)

describe('going live, by the OTA association manual', () => {
  it('runs in time order: review, the taxpayer request, Fawtir accepts, SMP registration', () => {
    expect(goingLiveSteps('review').map((step) => step.id)).toEqual([
      'sent',
      'review',
      'request',
      'accept',
      'register',
      'connected',
    ])
    expect(states('review')).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ])
    expect(states('request')).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ])
    expect(states('accepting')).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming'])
    expect(states('registering')).toEqual(['done', 'done', 'done', 'done', 'current', 'upcoming'])
    expect(states('connected').every((state) => state === 'done')).toBe(true)
  })

  it('marks a declined or expired request on the acceptance step and asks for it again', () => {
    for (const phase of ['declined', 'expired'] as const) {
      expect(states(phase)[3]).toBe('failed')
      expect(needsPortalRequest(phase)).toBe(true)
    }
    expect(needsPortalRequest('accepting')).toBe(false)
    expect(goingLiveSteps('registering')[4].statusKey).toBe('fawtaraStatus.steps.registering')
  })
})
