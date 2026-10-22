import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NumberField } from './shared'

describe('NumberField', () => {
  it('selects the whole value on focus, so the first keystroke replaces it', () => {
    render(<NumberField name="rate" label="Rate" value="0.000" decimal onChange={() => {}} />)
    const input = screen.getByLabelText('Rate') as HTMLInputElement
    input.focus()
    fireEvent.focus(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('0.000'.length)
  })
})
