import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { AuthLayout } from './AuthLayout'
import { LoginPage } from '../../pages/LoginPage/LoginPage'
import { SignupPage } from '../../pages/SignupPage/SignupPage'

/** Login and Sign up carry a house back to the public site; pages with Back keep Back (owner, 22 Oct). */
describe('the home icon on the sign-in pages', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('leads Login and Sign up back to the public site', () => {
    for (const page of [<LoginPage key="login" />, <SignupPage key="signup" />]) {
      const { unmount } = render(<MemoryRouter>{page}</MemoryRouter>)
      expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/')
      unmount()
    }
  })

  it('is not drawn where the page has Back, or was not asked for', () => {
    render(
      <MemoryRouter>
        <AuthLayout backTo="/login" showHome>
          <p>form</p>
        </AuthLayout>
        <AuthLayout>
          <p>form</p>
        </AuthLayout>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: 'Home' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Back' })).toBeTruthy()
  })
})
