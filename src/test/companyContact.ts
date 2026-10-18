import { PUBLIC_COMPANY_CONTACT_PATH } from '../lib/companyContact'

const CONTACT_URL = `/api${PUBLIC_COMPANY_CONTACT_PATH}`

/**
 * A `fetch` that answers Fawtir's contact details read as an older server does (404) and hands
 * every other request to `fetchMock`. For a test about something else on a screen that also shows
 * a "contact support" link: its request counts and queued answers stay its own.
 */
export function withoutContactRead(
  fetchMock: (input: string, init?: RequestInit) => unknown,
): (input: string, init?: RequestInit) => unknown {
  return (input, init) =>
    input === CONTACT_URL
      ? Promise.resolve(new Response(null, { status: 404 }))
      : fetchMock(input, init)
}
