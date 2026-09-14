import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from './Input'
import { PhoneInput } from './PhoneInput'

const descriptionOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)

describe('Input', () => {
  it('marks an errored field invalid and links it to the error text', () => {
    render(<Input label="Username" error="This username is taken" />)
    const field = screen.getByLabelText('Username')

    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(descriptionOf(field)).toEqual(['This username is taken'])
  })

  it('links the hint while there is no error, without marking the field invalid', () => {
    render(<Input label="Legal name" hint="As on the CR certificate" />)
    const field = screen.getByLabelText('Legal name')

    expect(field.getAttribute('aria-invalid')).toBeNull()
    expect(descriptionOf(field)).toEqual(['As on the CR certificate'])
  })

  it('describes a field with no message by nothing at all', () => {
    render(<Input label="Username" />)
    const field = screen.getByLabelText('Username')

    expect(field.getAttribute('aria-describedby')).toBeNull()
    expect(field.getAttribute('aria-invalid')).toBeNull()
  })

  it("keeps the caller's own description alongside its message", () => {
    render(
      <>
        <p id="external">Shown on invoices</p>
        <Input label="Username" aria-describedby="external" error="Required" />
      </>,
    )

    expect(descriptionOf(screen.getByLabelText('Username'))).toEqual(['Shown on invoices', 'Required'])
  })
})

describe('PhoneInput', () => {
  it('marks an errored field invalid and links it to the error text', () => {
    render(<PhoneInput label="Phone number" error="Enter the 8-digit number" />)
    const field = screen.getByLabelText('Phone number')

    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(descriptionOf(field)).toEqual(['Enter the 8-digit number'])
  })

  it('has no description or invalid state without an error', () => {
    render(<PhoneInput label="Phone number" />)
    const field = screen.getByLabelText('Phone number')

    expect(field.getAttribute('aria-describedby')).toBeNull()
    expect(field.getAttribute('aria-invalid')).toBeNull()
  })
})
