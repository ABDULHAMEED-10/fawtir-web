import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '../../i18n'
import { SortMenu, type SortOption } from './SortMenu'

const OPTIONS: SortOption<'natural' | 'amountDesc'>[] = [
  { value: 'natural', labelKey: 'supplierNotes.sort.natural' },
  { value: 'amountDesc', labelKey: 'supplierNotes.sort.amountDesc' },
]

const realWidth = window.innerWidth
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
}

/** Renders the menu with its 96px pill at `left`, opens it, and returns the panel. */
function openMenu({ left, width, dir = 'ltr' }: { left: number; width?: number; dir?: 'ltr' | 'rtl' }) {
  render(
    <div dir={dir}>
      <SortMenu value="natural" options={OPTIONS} onChange={() => {}} label="Sort" width={width} />
    </div>,
  )
  const trigger = screen.getByRole('button', { name: 'Sort' })
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: left, y: 100, width: 96, height: 46 }),
  )
  fireEvent.click(trigger)
  return screen.getByRole('listbox').parentElement as HTMLElement
}

describe('SortMenu', () => {
  afterEach(() => {
    setViewportWidth(realWidth)
    vi.restoreAllMocks()
  })

  it('draws the panel at the menu width, not the narrower pill width, so no label is cut off', () => {
    setViewportWidth(1280)
    const panel = openMenu({ left: 600, width: 230 })

    expect(panel.style.width).toBe('230px')
    expect(panel.style.left).toBe('600px')
    // The list fills the panel rather than carrying its own width past the panel's border.
    expect(screen.getByRole('listbox').style.width).toBe('')
  })

  it('uses the default width of 200 when the caller passes none', () => {
    setViewportWidth(1280)
    const panel = openMenu({ left: 600 })

    expect(panel.style.width).toBe('200px')
  })

  it('at 390px, keeps the wider panel inside the screen when the pill sits at the right edge', () => {
    setViewportWidth(390)
    const panel = openMenu({ left: 390 - 16 - 96, width: 240 })

    expect(panel.style.width).toBe('240px')
    // 390 - 240 - 4px gap: pulled back from the edge instead of running off it.
    expect(panel.style.left).toBe('146px')
  })

  it('in Arabic, where the pill sits at the left edge, opens inward and stays inside the screen', () => {
    setViewportWidth(390)
    const panel = openMenu({ left: 16, width: 240, dir: 'rtl' })

    expect(panel.style.width).toBe('240px')
    expect(panel.style.left).toBe('16px')
  })
})
