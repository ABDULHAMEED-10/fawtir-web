import { beforeEach, describe, expect, it } from 'vitest'
import { chooseWorkingBranch, forgetWorkingBranch, workingBranch } from './workingBranch'

const BRANCHES = [
  { id: 'b-1', type: 'STORE' },
  { id: 'b-2', type: 'HEAD_OFFICE' },
  { id: 'b-3', type: 'STORE' },
]

/** One branch toggle for the platform, in the sidebar (owner, 21 Oct 2026). */
describe('the working branch', () => {
  beforeEach(() => forgetWorkingBranch())

  it('is the head office until one is chosen, then the one chosen', () => {
    expect(workingBranch(BRANCHES, null)?.id).toBe('b-2')
    chooseWorkingBranch('b-3')
    expect(window.localStorage.getItem('fawtir.workingBranch')).toBe('b-3')
    expect(workingBranch(BRANCHES, 'b-3')?.id).toBe('b-3')
  })

  it('falls back when the chosen branch no longer exists', () => {
    expect(workingBranch(BRANCHES, 'gone')?.id).toBe('b-2')
    expect(workingBranch([{ id: 'only', headOffice: false }], 'gone')?.id).toBe('only')
  })
})
