import { describe, expect, it, vi } from 'vitest'
import { reloadWhenRestoredFromCache } from './backForwardCache'

function fakeWindow() {
  const listeners: Record<string, (event: Event) => void> = {}
  const reload = vi.fn()
  return {
    reload,
    show: (persisted: boolean) => listeners.pageshow(Object.assign(new Event('pageshow'), { persisted })),
    target: {
      addEventListener: (type: string, listener: (event: Event) => void) => {
        listeners[type] = listener
      },
      location: { reload } as unknown as Location,
    } as unknown as Pick<Window, 'addEventListener' | 'location'>,
  }
}

describe('a page the browser restores from its back-forward cache', () => {
  it('is reloaded, so nothing signed-in is shown again after sign-out', () => {
    const page = fakeWindow()
    reloadWhenRestoredFromCache(page.target)
    page.show(true)
    expect(page.reload).toHaveBeenCalledTimes(1)
  })

  it('is left alone on an ordinary load', () => {
    const page = fakeWindow()
    reloadWhenRestoredFromCache(page.target)
    page.show(false)
    expect(page.reload).not.toHaveBeenCalled()
  })
})
