import { describe, expect, it } from 'vitest'
import { fullName, password, toOmanE164, username } from './validation'
import { getPasswordStrength } from './passwordStrength'

describe('username', () => {
  it.each(['abc', 'hafidh.saif', 'Al_Bahja-01', '9lives', 'a'.repeat(64)])('accepts %s', (value) => {
    expect(username(value)).toBeUndefined()
  })

  it('accepts surrounding whitespace, which the request trims before sending', () => {
    expect(username('  hafidh  ')).toBeUndefined()
  })

  it.each([
    ['ab', 'too short'],
    ['a'.repeat(65), 'too long'],
    ['.hafidh', 'leading dot'],
    ['_hafidh', 'leading underscore'],
    ['hafidh saif', 'inner space'],
    ['hafidh@saif', 'symbol outside the allowed set'],
    ['حافظ', 'non-ASCII letters'],
  ])('rejects %s (%s)', (value) => {
    expect(username(value)).toBe('validation.usernameInvalid')
  })

  it('requires a value', () => {
    expect(username('   ')).toBe('validation.required')
  })
})

describe('password', () => {
  it('accepts a password meeting every backend rule', () => {
    expect(password('Correct-Horse9')).toBeUndefined()
  })

  it('accepts the 12 and 128 character boundaries', () => {
    expect(password('Aa1!aaaaaaaa')).toBeUndefined()
    expect(password(`Aa1!${'a'.repeat(124)}`)).toBeUndefined()
  })

  it('rejects 11 and 129 characters', () => {
    expect(password('Aa1!aaaaaaa')).toBe('validation.passwordLength')
    expect(password(`Aa1!${'a'.repeat(125)}`)).toBe('validation.passwordLength')
  })

  it.each([
    ['correct-horse9', 'no uppercase'],
    ['CORRECT-HORSE9', 'no lowercase'],
    ['Correct-Horse!', 'no digit'],
    ['CorrectHorse99', 'no symbol'],
  ])('rejects %s (%s)', (value) => {
    expect(password(value)).toBe('validation.passwordComposition')
  })

  it('drives the strength meter from the same criteria', () => {
    expect(getPasswordStrength('')).toBe(0)
    expect(getPasswordStrength('aaaa')).toBe(0)
    expect(getPasswordStrength('Correct-Horse9')).toBe(4)
    expect(getPasswordStrength('CorrectHorse99')).toBe(3)
  })
})

describe('fullName', () => {
  it.each(['Hafidh Saif', 'حافظ سيف', "Mary-Jane O'Neil", 'Al'])('accepts %s', (value) => {
    expect(fullName(value)).toBeUndefined()
  })

  it('rejects Latin and Arabic-Indic digits alike, as the server does', () => {
    expect(fullName('Agent 007')).toBe('validation.fullNameDigits')
    expect(fullName('حافظ ٧')).toBe('validation.fullNameDigits')
  })

  it('bounds the length at 2 to 200', () => {
    expect(fullName('A')).toBe('validation.fullNameLength')
    expect(fullName('a'.repeat(201))).toBe('validation.fullNameLength')
  })

  it('requires at least one letter', () => {
    expect(fullName('-- ..')).toBe('validation.fullNameInvalid')
  })
})

describe('toOmanE164', () => {
  it('prefixes the national number with +968, dropping separators', () => {
    expect(toOmanE164('9123 4567')).toBe('+96891234567')
    expect(toOmanE164('9123-4567')).toBe('+96891234567')
  })
})
