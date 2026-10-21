import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '../../i18n'
import { Pager } from './Pager'

const LABELS = { nav: 'Pages', previous: 'Previous page', next: 'Next page' }

const pageButtons = () =>
  screen
    .getAllByRole('button')
    .filter((button) => !button.getAttribute('aria-label'))
    .map((button) => button.textContent)

describe('Pager', () => {
  it('shows every page of a short list', () => {
    render(<Pager page={1} pageCount={3} onChange={() => {}} labels={LABELS} />)
    expect(pageButtons()).toEqual(['1', '2', '3'])
    expect(screen.queryByText('…')).toBeNull()
    expect(screen.getByRole('button', { name: '1' }).getAttribute('aria-current')).toBe('page')
  })

  it('elides the gap before the last page of a long list', () => {
    render(<Pager page={1} pageCount={16} onChange={() => {}} labels={LABELS} />)
    expect(pageButtons()).toEqual(['1', '2', '3', '16'])
    expect(screen.getAllByText('…')).toHaveLength(1)
  })

  it('keeps the current page in view, with a gap on each side', () => {
    render(<Pager page={8} pageCount={16} onChange={() => {}} labels={LABELS} />)
    expect(pageButtons()).toEqual(['1', '2', '3', '8', '16'])
    expect(screen.getAllByText('…')).toHaveLength(2)
  })

  it('reports the page chosen, and the neighbours from the arrows', () => {
    const onChange = vi.fn()
    render(<Pager page={2} pageCount={5} onChange={onChange} labels={LABELS} />)
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onChange.mock.calls).toEqual([[3], [1], [3]])
  })

  it('turns the arrows off at the ends', () => {
    render(<Pager page={1} pageCount={1} onChange={() => {}} labels={LABELS} />)
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
  })

  it('draws the pages but offers none of them when disabled', () => {
    const onChange = vi.fn()
    render(<Pager page={1} pageCount={11} onChange={onChange} labels={LABELS} disabled />)
    expect(pageButtons()).toEqual(['1', '2', '3', '11'])
    for (const name of ['2', '3', '11', 'Next page', 'Previous page']) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveProperty('disabled', true)
      fireEvent.click(button)
    }
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '1' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeTruthy()
  })
})
