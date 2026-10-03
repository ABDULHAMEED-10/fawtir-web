import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import i18n from '../../i18n'
import { DateField, Select } from '.'
import { Field, TextArea } from '../../pages/ConsolePage/subscriptions/modalFields'
import { ActivateModal } from '../../pages/ConsolePage/subscriptions/ActivateModal'
import { useSubscriptions } from '../../lib/consoleSubscriptions'
import { TENANTS } from '../../lib/superAdmin'

afterEach(async () => {
  cleanup()
  await act(() => i18n.changeLanguage('en'))
})

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

/** The text an element's `aria-describedby` points at. */
const description = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? `<missing ${id}>`)
    .join(' | ')

function noDuplicateIds() {
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
  expect(new Set(ids).size).toBe(ids.length)
}

function Fields({ error }: { error?: string }) {
  const [letter, setLetter] = useState('a')
  const [day, setDay] = useState('')
  return (
    <>
      <Field name="letter" label="Letter" error={error} hint="Pick one">
        <Select value={letter} onChange={setLetter} options={OPTIONS} ariaLabel="Letter" />
      </Field>
      <Field name="day" label="Day" error={error} hint="Any day">
        <DateField value={day} onChange={setDay} ariaLabel="Day" />
      </Field>
      <Field name="other" label="Other letter">
        <Select value={letter} onChange={setLetter} options={OPTIONS} ariaLabel="Other letter" />
      </Field>
    </>
  )
}

describe('Field error associations', () => {
  it('points a dropdown and a calendar at their help text, then at the error, and back', () => {
    const { rerender } = render(<Fields />)
    const letter = screen.getByRole('button', { name: 'Letter' })
    const day = screen.getByRole('button', { name: 'Day' })

    expect(description(letter)).toBe('Pick one')
    expect(description(day)).toBe('Any day')
    expect(letter.getAttribute('aria-invalid')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Other letter' }).getAttribute('aria-describedby'),
    ).toBeNull()

    rerender(<Fields error="This field is required" />)
    // The label stays the accessible name; the error is the description.
    expect(screen.getByRole('button', { name: 'Letter' })).toBe(letter)
    expect(letter.getAttribute('aria-invalid')).toBe('true')
    expect(day.getAttribute('aria-invalid')).toBe('true')
    expect(description(letter)).toBe('This field is required')
    expect(description(day)).toBe('This field is required')
    noDuplicateIds()

    rerender(<Fields />)
    expect(letter.getAttribute('aria-invalid')).toBeNull()
    expect(description(letter)).toBe('Pick one')
  })

  it('adds a description passed to the control itself to the field’s, rather than replacing it', () => {
    render(
      <>
        <p id="own-note">Shown on the invoice</p>
        <Field name="letter" label="Letter" error="Required">
          <Select
            value="a"
            onChange={() => {}}
            options={OPTIONS}
            ariaLabel="Letter"
            ariaDescribedBy="own-note"
          />
        </Field>
      </>,
    )
    expect(description(screen.getByRole('button', { name: 'Letter' }))).toBe(
      'Shown on the invoice | Required',
    )
  })

  it('points a multi-line field at its hint or its error, keeping a caller’s own description', () => {
    function Notes({ error }: { error?: string }) {
      return (
        <>
          <p id="policy-note">Seen by the auditor</p>
          <TextArea
            name="notes"
            label="Notes"
            hint="Optional"
            error={error}
            aria-describedby="policy-note"
          />
          <TextArea name="more" label="More notes" error={error} />
        </>
      )
    }
    const { rerender } = render(<Notes />)
    const notes = screen.getByRole('textbox', { name: 'Notes' })
    expect(description(notes)).toBe('Seen by the auditor | Optional')
    expect(
      screen.getByRole('textbox', { name: 'More notes' }).getAttribute('aria-describedby'),
    ).toBeNull()

    rerender(<Notes error="Too long" />)
    expect(notes.getAttribute('aria-invalid')).toBe('true')
    expect(description(notes)).toBe('Seen by the auditor | Too long')
    expect(description(screen.getByRole('textbox', { name: 'More notes' }))).toBe('Too long')
    noDuplicateIds()
  })

  it('in the subscription Activate dialog, links the missing reason to its field', () => {
    function Activate() {
      const ledger = useSubscriptions()
      return (
        <ActivateModal
          tenantId={TENANTS[0].id}
          ledger={ledger}
          onClose={() => {}}
          onDone={() => {}}
        />
      )
    }
    render(<Activate />)
    const dialog = screen.getByRole('dialog')
    const reason = dialog.querySelector('textarea')!

    fireEvent.submit(dialog.querySelector('form')!)

    expect(reason.getAttribute('aria-invalid')).toBe('true')
    const message = within(dialog).getAllByRole('alert')
    expect(message.map((node) => node.textContent)).toContain(description(reason))
    noDuplicateIds()
  })
})

describe('Date picker language', () => {
  const openCalendar = () => fireEvent.click(screen.getByRole('button', { name: 'Day' }))

  function Day() {
    const [day, setDay] = useState('2026-10-25')
    return <DateField value={day} onChange={setDay} ariaLabel="Day" />
  }

  it('keeps the English labels, month heading and two-letter weekdays', () => {
    render(<Day />)
    openCalendar()

    for (const name of ['Previous month', 'Next month', 'Today', 'Clear']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect(screen.getByText('October 2026')).toBeTruthy()
    for (const day of ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']) {
      expect(screen.getByText(day)).toBeTruthy()
    }
  })

  it('reads its labels from the locale files in Arabic, and names months and days through Intl', async () => {
    await act(() => i18n.changeLanguage('ar'))
    render(<Day />)
    openCalendar()

    for (const key of ['common.datePicker.previousMonth', 'common.datePicker.nextMonth']) {
      expect(screen.getByRole('button', { name: i18n.t(key) })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: i18n.t('common.datePicker.today') })).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('common.clear') })).toBeTruthy()
    expect(screen.queryByText('Today')).toBeNull()
    const heading = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' }).format(
      new Date(2026, 9, 25),
    )
    expect(screen.getByText(heading)).toBeTruthy()
    expect(screen.queryByText('Su')).toBeNull()
  })
})
