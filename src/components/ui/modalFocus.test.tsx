import { StrictMode, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../../i18n'
import { DateField, Modal, Select } from '.'

afterEach(cleanup)

const active = () => document.activeElement
const tab = (shift = false) =>
  fireEvent.keyDown(active() ?? document.body, { key: 'Tab', shiftKey: shift })
const escape = () => fireEvent.keyDown(active() ?? document.body, { key: 'Escape' })
const button = (name: string) => screen.getByRole('button', { name })

/** A page with a button before and after the dialog, as the app's pages have. */
function Page({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Dialog">
        {children(() => setOpen(false))}
      </Modal>
      <button type="button">After the dialog</button>
    </>
  )
}

function open() {
  const opener = button('Open')
  opener.focus()
  fireEvent.click(opener)
  return opener
}

describe('Modal focus', () => {
  it('focuses the dialog, keeps Tab and Shift+Tab inside it, and gives focus back to its opener', () => {
    render(
      <StrictMode>
        <Page>
          {(close) => (
            <>
              <input aria-label="Name" />
              <button type="button" onClick={close}>
                Done
              </button>
            </>
          )}
        </Page>
      </StrictMode>,
    )
    const opener = open()

    expect(active()).toBe(screen.getByRole('dialog'))
    tab()
    expect(active()).toBe(button('Close'))
    tab()
    expect(active()).toBe(screen.getByRole('textbox', { name: 'Name' }))
    tab()
    expect(active()).toBe(button('Done'))
    tab()
    expect(active()).toBe(button('Close'))
    tab(true)
    expect(active()).toBe(button('Done'))
    expect(screen.getByRole('button', { name: 'After the dialog' })).not.toBe(active())

    fireEvent.click(button('Done'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(active()).toBe(opener)
  })

  it('leaves focus where the content put it on mount, and restores after Escape and after Close', () => {
    render(
      <StrictMode>
        <Page>
          {() => (
            <button type="button" autoFocus>
              Cancel
            </button>
          )}
        </Page>
      </StrictMode>,
    )
    const opener = open()
    expect(active()).toBe(button('Cancel'))

    escape()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(active()).toBe(opener)

    open()
    fireEvent.click(button('Close'))
    expect(active()).toBe(opener)
  })

  it('pulls focus back in when it is somewhere behind the dialog', () => {
    render(
      <Page>
        {() => (
          <button type="button" autoFocus>
            Inside
          </button>
        )}
      </Page>,
    )
    open()
    screen.getByRole('button', { name: 'After the dialog' }).focus()

    tab()
    expect(active()).toBe(button('Close'))
    screen.getByRole('button', { name: 'After the dialog' }).focus()
    tab(true)
    expect(active()).toBe(button('Inside'))
  })

  it('takes an open calendar into the Tab order, after the dialog, and wraps back from it', () => {
    function WithDate() {
      const [day, setDay] = useState('')
      return <DateField value={day} onChange={setDay} ariaLabel="Start" />
    }
    render(
      <StrictMode>
        <Page>{() => <WithDate />}</Page>
      </StrictMode>,
    )
    open()
    fireEvent.click(button('Start'))
    button('Start').focus()

    tab()
    expect(active()).toBe(button('Previous month'))
    for (let i = 0; i < 60 && active() !== button('Clear'); i += 1) tab()
    expect(active()).toBe(button('Clear'))
    tab()
    expect(active()).toBe(button('Close'))
    tab(true)
    expect(active()).toBe(button('Clear'))
  })

  it('closes a dropdown on the first Escape, keeps Tab inside, and closes on the second', () => {
    function WithSelect() {
      const [value, setValue] = useState('a')
      return (
        <Select
          value={value}
          onChange={setValue}
          ariaLabel="Letter"
          options={[
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
          ]}
        />
      )
    }
    render(
      <StrictMode>
        <Page>{() => <WithSelect />}</Page>
      </StrictMode>,
    )
    const opener = open()
    const letter = button('Letter')
    letter.focus()
    fireEvent.keyDown(letter, { key: 'Enter' })
    expect(screen.getByRole('listbox')).toBeTruthy()

    escape()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(active()).toBe(letter)

    tab()
    expect(active()).toBe(button('Close'))
    tab(true)
    expect(active()).toBe(letter)

    escape()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(active()).toBe(opener)
  })

  it('traps only in the newest of two dialogs, and gives focus back one level at a time', () => {
    function Stacked() {
      const [outer, setOuter] = useState(false)
      const [inner, setInner] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOuter(true)}>
            Open
          </button>
          <Modal open={outer} onClose={() => setOuter(false)} title="Outer">
            <button type="button" onClick={() => setInner(true)}>
              More
            </button>
            <Modal open={inner} onClose={() => setInner(false)} title="Inner">
              <button type="button">Inner action</button>
            </Modal>
          </Modal>
        </>
      )
    }
    render(
      <StrictMode>
        <Stacked />
      </StrictMode>,
    )
    const opener = open()
    const more = button('More')
    more.focus()
    fireEvent.click(more)
    const innerDialog = screen.getByRole('dialog', { name: 'Inner' })

    for (let i = 0; i < 5; i += 1) {
      tab()
      expect(innerDialog.contains(active())).toBe(true)
    }

    fireEvent.click(innerDialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!)
    expect(active()).toBe(more)

    fireEvent.click(
      screen
        .getByRole('dialog', { name: 'Outer' })
        .querySelector<HTMLButtonElement>('button[aria-label="Close"]')!,
    )
    expect(active()).toBe(opener)

    // The same two levels by keyboard: one Escape closes the inner dialog only.
    open()
    button('More').focus()
    fireEvent.click(button('More'))
    escape()
    expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeTruthy()
    expect(active()).toBe(button('More'))
    escape()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(active()).toBe(button('Open'))
  })

  it('does not restore to an opener that has gone, and leaves a Tab a control already used', () => {
    function Vanishing() {
      const [open, setOpen] = useState(false)
      return (
        <>
          {open ? null : (
            <button type="button" onClick={() => setOpen(true)}>
              Open
            </button>
          )}
          <Modal open={open} onClose={() => setOpen(false)} title="Dialog">
            <textarea
              aria-label="Code"
              onKeyDown={(event) => {
                if (event.key === 'Tab') event.preventDefault()
              }}
            />
          </Modal>
        </>
      )
    }
    render(<Vanishing />)
    open()
    const code = screen.getByRole('textbox', { name: 'Code' })
    code.focus()
    tab()
    expect(active()).toBe(code)

    escape()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(active()).toBe(document.body)
  })

  it('gives focus back to the date field when a day, Today or Clear is chosen inside the calendar', () => {
    function WithDate() {
      const [day, setDay] = useState('2026-11-01')
      return <DateField value={day} onChange={setDay} ariaLabel="Start" />
    }
    render(
      <StrictMode>
        <Page>{() => <WithDate />}</Page>
      </StrictMode>,
    )
    open()
    const start = button('Start')
    for (const pick of [
      () => screen.getAllByRole('button', { name: '5' })[0],
      () => button('Today'),
      () => button('Clear'),
    ]) {
      fireEvent.click(start)
      const choice = pick()
      choice.focus()
      fireEvent.click(choice)
      expect(screen.queryByRole('button', { name: 'Next month' })).toBeNull()
      expect(active()).toBe(start)
      expect(screen.getByRole('dialog')).toBeTruthy()
    }
  })
})
