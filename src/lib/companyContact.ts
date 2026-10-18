import { useEffect, useState } from 'react'
import { apiRequest } from '../api'

/**
 * Fawtir's own contact details (support email, phone, website, address): a console setting, read
 * by every screen that shows how to reach Fawtir (the Contact page and its form, the site's
 * mail links, the "contact support" links in the app). Nothing else in `src/` may hard-code one.
 *
 * Read once per page load from the public endpoint, anonymously. Until it answers, if it fails,
 * if the server is older and has no such endpoint, or for a field the setting leaves empty, each
 * place keeps the value it showed before the setting existed ({@link LEGACY_CONTACT}), so the
 * live site reads exactly as it did until the server returns a setting.
 */

/*
 * API ASSUMPTION (CS-1): matches the openapi.yaml of the backend's branch
 * feat/company-contact-settings (V398) as committed locally, before it was pushed. Re-check it
 * there once published; this block and `lib/console/companyContact.ts` are
 * the only places that name the contract.
 */
export const PUBLIC_COMPANY_CONTACT_PATH = '/v1/public/company-contact'

/**
 * `GET /v1/public/company-contact`: anonymous, cached five minutes by the server. Email and phone
 * are always set once V398 has run (it seeds version 1); the rest are null when not shown. 204
 * only before the migration.
 */
export type PublicCompanyContact = {
  supportEmail: string | null
  supportPhone: string | null
  /** `https` only (V398 check). */
  websiteUrl: string | null
  addressEn: string | null
  addressAr: string | null
  linkedinUrl: string | null
  instagramUrl: string | null
}

/**
 * What each place showed before the setting existed. The Contact page named its own address (the
 * Figma frame's); every mail link elsewhere went to support. Kept apart so a fallback never moves
 * a value from one place to another. The frame's toll-free number is deliberately not kept: with
 * no phone in the setting the page shows no phone at all.
 */
export const LEGACY_CONTACT = {
  supportEmail: 'support@fawtir.om',
  contactPageEmail: 'hello@fawtir.om',
} as const

/** The details a screen draws, every field already resolved to the server's or the old value. */
export type CompanyContact = {
  /** Every "write to support" link, the site's demo, partner and newsletter links included. */
  supportEmail: string
  /** The Contact page's email and the address its form writes to. */
  contactPageEmail: string
  /** Null: the setting names no phone, so the page shows no phone line. */
  contactPagePhone: string | null
  /** Null: no address from the server, so the page keeps its own translated one. */
  address: string | null
  website: string | null
  /** The footer's social icons link only when the setting names the page. */
  linkedinUrl: string | null
  instagramUrl: string | null
}

type State = { status: 'idle' | 'loading' | 'done'; contact: PublicCompanyContact | null }

let state: State = { status: 'idle', contact: null }
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((listener) => listener())
}

/** A non-blank string, trimmed; anything else (missing, null, a number) counts as unset. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Only an `https` address is ever made a link (the server's own rule, kept here too). */
function secureUrl(value: unknown): string | null {
  const url = text(value)
  return url && /^https:\/\/\S+$/i.test(url) ? url : null
}

/** Only an object is a setting: an empty body (204), a list or a page is no answer at all. */
export function parsePublicCompanyContact(body: unknown): PublicCompanyContact | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>
  const contact: PublicCompanyContact = {
    supportEmail: text(raw.supportEmail),
    supportPhone: text(raw.supportPhone),
    websiteUrl: secureUrl(raw.websiteUrl),
    addressEn: text(raw.addressEn),
    addressAr: text(raw.addressAr),
    linkedinUrl: secureUrl(raw.linkedinUrl),
    instagramUrl: secureUrl(raw.instagramUrl),
  }
  return Object.values(contact).some(Boolean) ? contact : null
}

function load() {
  if (state.status !== 'idle') return
  set({ status: 'loading', contact: null })
  apiRequest<unknown>(PUBLIC_COMPANY_CONTACT_PATH, { method: 'GET', credentials: 'omit' }).then(
    (body) => set({ status: 'done', contact: parsePublicCompanyContact(body) }),
    // An older server (404), a refusal or no answer: the old values stand for this page load.
    () => set({ status: 'done', contact: null }),
  )
}

/** Fields from the server win one by one; each missing one keeps the place's old value. */
export function resolveCompanyContact(
  contact: PublicCompanyContact | null,
  language: string,
): CompanyContact {
  const arabic = language.startsWith('ar')
  const address = arabic
    ? (contact?.addressAr ?? contact?.addressEn ?? null)
    : (contact?.addressEn ?? contact?.addressAr ?? null)
  return {
    supportEmail: contact?.supportEmail ?? LEGACY_CONTACT.supportEmail,
    contactPageEmail: contact?.supportEmail ?? LEGACY_CONTACT.contactPageEmail,
    contactPagePhone: contact?.supportPhone ?? null,
    address,
    website: contact?.websiteUrl ?? null,
    linkedinUrl: contact?.linkedinUrl ?? null,
    instagramUrl: contact?.instagramUrl ?? null,
  }
}

/** The contact details for the reader's language. Starts the read on first use. */
export function useCompanyContact(language: string): CompanyContact {
  const [current, setCurrent] = useState(state.contact)
  useEffect(() => {
    const listener = () => setCurrent(state.contact)
    listeners.add(listener)
    load()
    listener()
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return resolveCompanyContact(current, language)
}

/** After the console saves a new version: the next use reads it again. */
export function forgetCompanyContact() {
  state = { status: 'idle', contact: null }
  if (listeners.size > 0) load()
}

/** For tests only: a fresh page load. */
export function resetCompanyContact() {
  state = { status: 'idle', contact: null }
  listeners.clear()
}

/** `mailto:` with an optional subject and body, each encoded. */
export function mailto(email: string, subject?: string, body?: string): string {
  const query = [
    subject !== undefined ? `subject=${encodeURIComponent(subject)}` : null,
    body !== undefined ? `body=${encodeURIComponent(body)}` : null,
  ]
    .filter(Boolean)
    .join('&')
  return `mailto:${email}${query ? `?${query}` : ''}`
}
