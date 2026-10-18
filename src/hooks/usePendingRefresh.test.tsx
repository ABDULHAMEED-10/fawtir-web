import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  PENDING_REFRESH_DELAYS_MS,
  PENDING_REFRESH_LIMIT,
  usePendingRefresh,
} from './usePendingRefresh'

let visibility: DocumentVisibilityState = 'visible'

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('usePendingRefresh', () => {
  it('asks nothing while nothing is pending', async () => {
    const refresh = vi.fn(() => Promise.resolve())
    renderHook(() => usePendingRefresh('doc-1', false, refresh))
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('backs off, and stops at the cap however long the tab stays open', async () => {
    const refresh = vi.fn(() => Promise.resolve())
    renderHook(() => usePendingRefresh('doc-1', true, refresh))

    await vi.advanceTimersByTimeAsync(PENDING_REFRESH_DELAYS_MS[0] - 1)
    expect(refresh).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PENDING_REFRESH_DELAYS_MS[1])
    expect(refresh).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(PENDING_REFRESH_DELAYS_MS[2])
    expect(refresh).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(refresh).toHaveBeenCalledTimes(PENDING_REFRESH_LIMIT)
  })

  it('never has two reads in flight', async () => {
    let settle: () => void = () => undefined
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve
        }),
    )
    renderHook(() => usePendingRefresh('doc-1', true, refresh))
    await vi.advanceTimersByTimeAsync(PENDING_REFRESH_DELAYS_MS[0])
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    setVisibility('hidden')
    setVisibility('visible')
    expect(refresh).toHaveBeenCalledTimes(1)

    settle()
    await vi.advanceTimersByTimeAsync(PENDING_REFRESH_DELAYS_MS[1])
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('keeps going after a failed read, within the same cap', async () => {
    const refresh = vi.fn(() => Promise.reject(new Error('offline')))
    renderHook(() => usePendingRefresh('doc-1', true, refresh))
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(refresh).toHaveBeenCalledTimes(PENDING_REFRESH_LIMIT)
  })

  it('stops once the outcome arrives', async () => {
    const refresh = vi.fn(() => Promise.resolve())
    const { rerender } = renderHook(({ pending }) => usePendingRefresh('doc-1', pending, refresh), {
      initialProps: { pending: true },
    })
    await vi.advanceTimersByTimeAsync(PENDING_REFRESH_DELAYS_MS[0])
    expect(refresh).toHaveBeenCalledTimes(1)
    rerender({ pending: false })
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reads nothing while the tab is hidden, and reads at once when it is shown', async () => {
    const refresh = vi.fn(() => Promise.resolve())
    renderHook(() => usePendingRefresh('doc-1', true, refresh))
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not start on a tab that opens hidden until it is shown', async () => {
    visibility = 'hidden'
    const refresh = vi.fn(() => Promise.resolve())
    renderHook(() => usePendingRefresh('doc-1', true, refresh))
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(refresh).not.toHaveBeenCalled()
    setVisibility('visible')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('tells a late answer it is no longer wanted once the reader moved on', async () => {
    let wanted: (() => boolean) | null = null
    let settle: () => void = () => undefined
    const refresh = vi.fn((live: () => boolean) => {
      wanted = live
      return new Promise<void>((resolve) => {
        settle = resolve
      })
    })
    const { rerender } = renderHook(({ key }) => usePendingRefresh(key, true, refresh), {
      initialProps: { key: 'doc-1' },
    })
    await vi.advanceTimersByTimeAsync(PENDING_REFRESH_DELAYS_MS[0])
    expect(wanted!()).toBe(true)
    rerender({ key: 'doc-2' })
    expect(wanted!()).toBe(false)
    settle()
  })

  it('removes its listener when it stops', async () => {
    const refresh = vi.fn(() => Promise.resolve())
    const { unmount } = renderHook(() => usePendingRefresh('doc-1', true, refresh))
    unmount()
    setVisibility('hidden')
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(refresh).not.toHaveBeenCalled()
  })
})
