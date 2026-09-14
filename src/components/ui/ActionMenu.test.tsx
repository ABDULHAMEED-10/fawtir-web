import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import { ActionMenu, type ActionMenuItem } from './ActionMenu'

function renderMenu(floating: boolean, onSelect = vi.fn()) {
  const items: ActionMenuItem[] = [
    { id: 'first', labelKey: 'console.operators.manage', icon: '', onSelect },
    { id: 'second', labelKey: 'console.operators.emailChange.open', icon: '' },
  ]
  render(
    <MemoryRouter>
      <div data-testid="clipping" style={{ overflowX: 'auto' }}>
        <ActionMenu label="Row actions" items={items} floating={floating} />
      </div>
      <button type="button">After</button>
    </MemoryRouter>,
  )
  return onSelect
}
const trigger = () => screen.getByRole('button', { name: 'Row actions' })
const flushFrame = () => act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

describe('ActionMenu', () => {
  it('draws its panel beside the trigger by default', () => {
    renderMenu(false)
    fireEvent.click(trigger())

    expect(screen.getByTestId('clipping').contains(screen.getByRole('menu'))).toBe(true)
  })

  it('when floating, draws the panel in the body, out of the clipping container', () => {
    renderMenu(true)
    fireEvent.click(trigger())

    expect(screen.getByTestId('clipping').contains(screen.getByRole('menu'))).toBe(false)
    expect(document.body.contains(screen.getByRole('menu'))).toBe(true)
    expect(screen.getByRole('menu').style.position).toBe('fixed')
  })

  it('when floating, still lets an item be chosen: pressing on the panel is not a click outside', () => {
    const onSelect = renderMenu(true)
    fireEvent.click(trigger())
    const item = screen.getByRole('menuitem', { name: /Roles/ })
    fireEvent.mouseDown(item)
    fireEvent.click(item)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('when floating, takes focus into the panel and gives it back on Escape and on Tab', async () => {
    renderMenu(true)
    fireEvent.click(trigger())
    await flushFrame()
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Roles/ }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger())

    fireEvent.click(trigger())
    await flushFrame()
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /Roles/ }), { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on a press outside, floating or not', () => {
    renderMenu(true)
    fireEvent.click(trigger())
    fireEvent.mouseDown(screen.getByRole('button', { name: 'After' }))

    expect(screen.queryByRole('menu')).toBeNull()
  })
})
