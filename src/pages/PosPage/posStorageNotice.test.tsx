import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import i18n from '../../i18n'
import { checkStorageAgain, useStorageFailure, type OfflineBlock } from '../../lib/posQueue'
import { PosStorageNotice } from './PosStorageNotice'

/*
 * POS-MEMQ S8 (owner R2-1): the notice is driven by posQueue's block alone, so the queue is mocked
 * here; posQueueStorage.test.ts proves what sets and clears the block.
 */
vi.mock('../../lib/posQueue', () => ({
  useStorageFailure: vi.fn(),
  checkStorageAgain: vi.fn(),
}))

const failure = vi.mocked(useStorageFailure)
const checkAgain = vi.mocked(checkStorageAgain)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  failure.mockReset()
  checkAgain.mockReset()
})

afterEach(() => vi.clearAllMocks())

describe('the storage notice on the till (POS-MEMQ S8)', () => {
  it('draws nothing while offline selling is not blocked', () => {
    failure.mockReturnValue(null)
    const { container } = render(<PosStorageNotice tillId="till-1" />)
    expect(container.innerHTML).toBe('')
    expect(failure).toHaveBeenCalledWith('till-1')
  })

  it.each<OfflineBlock>(['quota', 'denied', 'mismatch', 'unreadable', 'burnt'])(
    'says offline selling has stopped when the block is %s',
    (reason) => {
      failure.mockReturnValue(reason)
      render(<PosStorageNotice tillId="till-1" />)
      expect(screen.getByRole('alert').textContent).toContain(i18n.t('pos.storage.blocked'))
      expect(screen.getByRole('button', { name: i18n.t('pos.storage.checkAgain') })).toBeTruthy()
    },
  )

  it('Check again re-tests storage and the notice goes once it reports nothing blocking', () => {
    let current: OfflineBlock | null = 'quota'
    failure.mockImplementation(() => current)
    checkAgain.mockImplementation(() => {
      current = null
      return null
    })
    const { rerender } = render(<PosStorageNotice tillId="till-1" />)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.storage.checkAgain') }))
    expect(checkAgain).toHaveBeenCalledTimes(1)
    // The real hook re-renders through useSyncExternalStore; the mock needs the render driven.
    rerender(<PosStorageNotice tillId="till-1" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the notice while Check again still finds storage failing', () => {
    failure.mockReturnValue('quota')
    checkAgain.mockReturnValue('quota')
    render(<PosStorageNotice tillId="till-1" />)
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pos.storage.checkAgain') }))
    expect(checkAgain).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('a burnt number says the block clears after the next online sale on this till', () => {
    failure.mockReturnValue('burnt')
    render(<PosStorageNotice tillId="till-1" />)
    expect(screen.getByRole('alert').textContent).toContain(i18n.t('pos.storage.burnt'))
  })

  it('a storage fault does not show the burnt sentence', () => {
    failure.mockReturnValue('denied')
    render(<PosStorageNotice tillId="till-1" />)
    expect(screen.getByRole('alert').textContent).not.toContain(i18n.t('pos.storage.burnt'))
  })

  it.each<OfflineBlock>(['quota', 'burnt'])(
    'offers nothing that prints, sends or rings a sale (%s)',
    (reason) => {
      failure.mockReturnValue(reason)
      render(<PosStorageNotice tillId="till-1" />)
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(1)
      expect(buttons[0].textContent).toBe(i18n.t('pos.storage.checkAgain'))
      expect(screen.queryAllByRole('link')).toHaveLength(0)
      expect(screen.getByRole('alert').textContent).not.toMatch(/print|receipt|NZW-|INV-/i)
    },
  )

  it('has every sentence in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    for (const key of [
      'pos.storage.blocked',
      'pos.storage.burnt',
      'pos.storage.checkAgain',
      'pos.refusal.storageUnavailable',
    ]) {
      expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
      expect(i18n.exists(key, { lng: 'en', fallbackLng: false })).toBe(true)
    }
  })
})
