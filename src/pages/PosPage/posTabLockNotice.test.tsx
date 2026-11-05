import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { releaseTillLocks } from '../../lib/posTillLock'
import { fakeLocks, installLocks, type FakeLocks } from '../../test/fakeLocks'
import { PosTabLockNotice } from './PosTabLockNotice'

/*
 * POS-TABLOCK: the notice is what holds the till's lock on the till screens, and says so only when
 * this tab may not number offline sales. posTillLock.test.ts proves the lock and the refusal.
 */

const LOCK = 'fawtir.pos.till.till-1'
let locks: FakeLocks

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

function otherTabHolds(): () => void {
  let letGo = () => {}
  void locks.request(LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) =>
    lock
      ? new Promise<void>((done) => {
          letGo = done
        })
      : undefined,
  )
  return () => letGo()
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  releaseTillLocks()
  locks = fakeLocks()
  installLocks(locks)
})

describe('the one-tab notice on the till (POS-TABLOCK)', () => {
  it('draws nothing in the tab that holds the till, and holds it while mounted', async () => {
    const { container, unmount } = render(<PosTabLockNotice tillId="till-1" />)
    await act(settled)
    expect(container.innerHTML).toBe('')
    expect(locks.held.has(LOCK)).toBe(true)

    unmount()
    await settled()
    expect(locks.held.has(LOCK)).toBe(false)
  })

  it('in a second tab says offline sales are stopped here, and Check again takes over once the other tab lets go', async () => {
    const letGo = otherTabHolds()
    render(<PosTabLockNotice tillId="till-1" />)
    await act(settled)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(i18n.t('pos.tabLock.otherTab'))
    // This device's tabs only: nothing in it claims to protect other devices.
    expect(alert.textContent).not.toMatch(/other devices?|every device|all devices/i)

    letGo()
    await act(settled)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.tabLock.checkAgain') }))
    await act(settled)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(locks.held.has(LOCK)).toBe(true)
  })

  it('without navigator.locks says this browser cannot keep offline selling to one tab', async () => {
    installLocks(undefined)
    render(<PosTabLockNotice tillId="till-1" />)
    await act(settled)
    expect(screen.getByRole('alert').textContent).toContain(i18n.t('pos.tabLock.unsupported'))
    expect(screen.queryByRole('button')).toBeNull()
  })
})
