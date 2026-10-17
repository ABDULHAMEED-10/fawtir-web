import { describe, expect, it } from 'vitest'
import { goingLiveSteps, needsPortalRequest, type GoingLivePhase } from './fawtaraStatus'

const states = (phase: GoingLivePhase) => goingLiveSteps(phase).map((step) => step.state)

describe('going live, by the OTA association manual and the approval order', () => {
  it('runs in time order: the taxpayer request, Fawtir accepts, approval, SMP registration', () => {
    expect(goingLiveSteps('review').map((step) => step.id)).toEqual([
      'sent',
      'request',
      'accept',
      'review',
      'register',
      'connected',
    ])
    // Under review, the connection request is the taxpayer's to send: approval waits for it.
    expect(states('review')).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ])
    expect(needsPortalRequest('review')).toBe(true)
    expect(states('request')).toEqual([
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ])
    expect(states('accepting')).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ])
    expect(states('registering')).toEqual(['done', 'done', 'done', 'done', 'current', 'upcoming'])
    expect(states('connected').every((state) => state === 'done')).toBe(true)
  })

  it('never shows approval before the request is accepted', () => {
    for (const phase of ['review', 'request', 'accepting', 'declined', 'expired'] as const) {
      const review = goingLiveSteps(phase).find((step) => step.id === 'review')
      expect(review?.state).toBe('upcoming')
      expect(review?.statusKey).toBeUndefined()
    }
    expect(goingLiveSteps('registering')[3].statusKey).toBe('fawtaraStatus.steps.approved')
  })

  it('marks a declined or expired request on the acceptance step and asks for it again', () => {
    for (const phase of ['declined', 'expired'] as const) {
      expect(states(phase)[2]).toBe('failed')
      expect(needsPortalRequest(phase)).toBe(true)
    }
    expect(needsPortalRequest('accepting')).toBe(false)
    expect(goingLiveSteps('registering')[4].statusKey).toBe('fawtaraStatus.steps.registering')
  })

  it('marks a rejected registration on the approval step, claiming nothing before or after it', () => {
    expect(states('rejected')).toEqual([
      'done',
      'upcoming',
      'upcoming',
      'failed',
      'upcoming',
      'upcoming',
    ])
    expect(goingLiveSteps('rejected')[3].statusKey).toBe('fawtaraStatus.steps.rejected')
    expect(needsPortalRequest('rejected')).toBe(false)
  })
})
