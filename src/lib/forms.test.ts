import { describe, expect, it } from 'vitest'
import { firstInvalidField, focusFirstInvalid } from './forms'

const ORDER = ['fullName', 'username', 'email', 'consent'] as const

describe('firstInvalidField', () => {
  it('picks the topmost field in form order, whatever order the errors arrive in', () => {
    expect(firstInvalidField(ORDER, { consent: 'x', email: 'x', username: 'x' })).toBe('username')
  })

  it('ignores cleared entries and returns nothing when the form is clean', () => {
    expect(firstInvalidField(ORDER, { fullName: undefined, consent: 'x' })).toBe('consent')
    expect(firstInvalidField(ORDER, {})).toBeUndefined()
  })
})

describe('focusFirstInvalid', () => {
  it('focuses the named control of the first invalid field', () => {
    document.body.innerHTML = `
      <form>
        <input name="fullName" /><input name="username" /><input name="email" />
        <input type="checkbox" name="consent" />
      </form>`
    const form = document.querySelector('form') as HTMLFormElement

    focusFirstInvalid(form, ORDER, { email: 'x', consent: 'x' })

    expect(document.activeElement?.getAttribute('name')).toBe('email')
  })
})
