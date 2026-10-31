import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import { ItemTabs } from './ItemTabs'

describe('the tabs of a real item', () => {
  it('carry no count until the server has given one', () => {
    render(
      <MemoryRouter>
        <ItemTabs id="i-1" active="details" />
      </MemoryRouter>,
    )
    const text = screen.getByRole('navigation').textContent ?? ''
    expect(text).not.toContain('45')
    expect(text).not.toContain('14')
  })
})
