import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import '../HomePage/HomePage.css'
import {
  CheckList,
  ClosingBand,
  Cta,
  Faq,
  Footer,
  Heading,
  INK,
  PageHero,
  SOFT,
  Washes,
  developersUrl,
  useSiteMeta,
} from '../HomePage/site'
import { mailto, useCompanyContact } from '../../lib/companyContact'
import { FeatureIcon } from './FeatureIcon'

/**
 * The partners page. No Figma frame: built to the house standard (handbook 3.3) from the Contact
 * page's parts. Who can partner, how it works, an application form and the questions.
 *
 * It promises no programme terms (commission, discounts, listings): the owner has not set them.
 */

export const PARTNER_TYPES = ['accountants', 'resellers', 'software'] as const
type PartnerType = (typeof PARTNER_TYPES)[number]

const TYPE_ICON: Record<PartnerType, string> = {
  accountants: 'users',
  resellers: 'store',
  software: 'layers',
}

export function PartnersPage() {
  const { t } = useTranslation()
  useSiteMeta('landing.meta.partners.title', 'landing.meta.partners.description')
  const faq = (['who', 'software', 'after', 'customer'] as const).map((key) => ({
    q: t(`site.partners.faq.${key}.q`),
    a: t(`site.partners.faq.${key}.a`),
  }))
  return (
    <div className={`landing min-h-screen overflow-x-clip bg-white ${INK}`}>
      <PageHero
        active="partners"
        lead={t('site.partners.hero.lead')}
        word={t('site.partners.hero.word')}
        body={t('site.partners.hero.body')}
      />
      <main>
        <div className="-mt-6 flex justify-center px-4">
          <Cta href="#apply" tone="brand">
            {t('site.partners.hero.apply')}
          </Cta>
        </div>
        <Types />
        <Steps />
        <Apply />
        <Faq items={faq} />
      </main>
      <ClosingBand />
      <Footer />
    </div>
  )
}

/* ------------------------------------------------------------------ types */

function Types() {
  const { t, i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  return (
    <section className="mx-auto mt-[140px] w-full max-w-[1520px] px-4 max-md:mt-20 md:px-8 min-[1600px]:px-0">
      <div className="flex flex-col items-center gap-6 text-center">
        <Heading lead={t('site.partners.types.lead')} em={t('site.partners.types.em')} />
        <p className={`landing-cap max-w-[720px] text-xl leading-[normal] ${SOFT}`}>
          {t('site.partners.types.body')}
        </p>
      </div>
      <ul className="mt-[60px] grid grid-cols-3 gap-[18px] max-lg:grid-cols-1 max-md:mt-10">
        {PARTNER_TYPES.map((type) => (
          <li
            key={type}
            className="flex flex-col gap-6 rounded-lg bg-[#f7f9ff] px-8 py-10 max-md:px-5 max-md:py-8"
          >
            <span className="flex size-12 items-center justify-center rounded-lg bg-white">
              <FeatureIcon name={TYPE_ICON[type]} />
            </span>
            <div className="flex flex-col gap-3">
              <h3 className="landing-cap text-2xl font-semibold leading-[normal]">
                {t(`site.partners.types.${type}.title`)}
              </h3>
              <p className={`text-base leading-6 ${SOFT}`}>
                {t(`site.partners.types.${type}.body`)}
              </p>
            </div>
            <CheckList
              items={[1, 2, 3].map((n) => t(`site.partners.types.${type}.point${n}`))}
              tone="soft"
            />
            <div className="mt-auto pt-2">
              {type === 'software' ? (
                <Cta href={developersUrl(arabic)} tone="dark">
                  {t('site.partners.types.software.cta')}
                </Cta>
              ) : (
                <Cta href="#apply" tone="light">
                  {t('site.partners.types.applyCta')}
                </Cta>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ steps */

function Steps() {
  const { t } = useTranslation()
  return (
    <section className="mx-auto mt-[140px] w-full max-w-[1220px] px-4 max-md:mt-20 xl:px-0">
      <div className="flex flex-col items-center text-center">
        <Heading lead={t('site.partners.steps.lead')} em={t('site.partners.steps.em')} />
      </div>
      <ol className="mt-[60px] grid grid-cols-3 gap-8 max-lg:grid-cols-1 max-md:mt-10">
        {(['apply', 'talk', 'start'] as const).map((step, index) => (
          <li key={step} className="flex gap-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#2c4eb7] text-lg font-semibold text-white">
              {index + 1}
            </span>
            <div className="flex flex-col gap-2">
              <h3 className="landing-cap text-xl font-semibold leading-[normal]">
                {t(`site.partners.steps.${step}.title`)}
              </h3>
              <p className={`text-base leading-6 ${SOFT}`}>
                {t(`site.partners.steps.${step}.body`)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------------ apply */

function Apply() {
  const { t } = useTranslation()
  return (
    <section
      id="apply"
      className="relative isolate mx-auto mt-[160px] w-full max-w-[1720px] scroll-mt-8 px-4 pt-[120px] pb-[60px] max-md:mt-20 max-md:pt-16 md:px-8 min-[1800px]:px-0"
    >
      <Washes />
      <div className="mx-auto flex max-w-[960px] flex-col items-center gap-[48px] max-md:gap-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <Heading
            lead={t('site.partners.apply.lead')}
            em={t('site.partners.apply.em')}
            className="[&>span]:inline [&>span+span]:ms-3"
          />
          <p className={`landing-cap text-xl leading-[normal] ${INK}`}>
            {t('site.partners.apply.body')}
          </p>
        </div>
        <ApplicationForm />
      </div>
    </section>
  )
}

type Fields = {
  name: string
  company: string
  email: string
  phone: string
  city: string
  clients: string
  message: string
}

export function ApplicationForm() {
  const { t, i18n } = useTranslation()
  const email = useCompanyContact(i18n.language).supportEmail
  const [type, setType] = useState<PartnerType>('accountants')
  const [fields, setFields] = useState<Fields>({
    name: '',
    company: '',
    email: '',
    phone: '',
    city: '',
    clients: '',
    message: '',
  })
  const [sent, setSent] = useState(false)
  const set = (key: keyof Fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }))

  // TODO(backend): SITE.md 1.7. No endpoint takes a partner application yet; the form opens the
  // visitor's email app with the application filled in, to the support email.
  const submit = (event: FormEvent) => {
    event.preventDefault()
    // Written in English for the team; a field left empty adds no line.
    const optional: [string, string][] = [
      ['Phone', fields.phone],
      ['City', fields.city],
      ['Clients or customers', fields.clients],
    ]
    const lines = [
      `Partner type: ${t(`site.partners.types.${type}.title`, { lng: 'en' })}`,
      `Name: ${fields.name}`,
      `Company: ${fields.company}`,
      `Email: ${fields.email}`,
      ...optional.filter(([, value]) => value.trim()).map(([label, value]) => `${label}: ${value}`),
    ]
    if (fields.message.trim()) lines.push('', fields.message)
    const body = lines.join('\n')
    window.location.href = mailto(email, `Fawtir partner application: ${fields.company}`, body)
    setSent(true)
  }

  const input =
    'w-full rounded-lg bg-[#fafafa] px-4 text-base leading-[normal] outline-none placeholder:text-[#8a8e96] focus:ring-2 focus:ring-[#2c4eb7]/30'
  const field = (
    key: keyof Fields,
    options: { required?: boolean; type?: string; auto?: string },
  ) => (
    <input
      required={options.required}
      type={options.type ?? 'text'}
      value={fields[key]}
      onChange={(event) => set(key)(event.target.value)}
      placeholder={t(`site.partners.form.${key}`)}
      aria-label={t(`site.partners.form.${key}`)}
      autoComplete={options.auto}
      className={`${input} h-14`}
    />
  )

  return (
    <form
      onSubmit={submit}
      className="landing-shadow-brand flex w-full flex-col gap-6 rounded-lg bg-white p-8 max-md:p-5"
    >
      <h3 className="landing-cap text-[clamp(1.5rem,1.2rem+0.9vw,2rem)] font-medium leading-[normal]">
        {t('site.partners.form.title')}
      </h3>
      <fieldset className="flex flex-col gap-3">
        <legend className={`mb-3 text-base font-medium leading-[normal] ${INK}`}>
          {t('site.partners.form.type')}
        </legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {PARTNER_TYPES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={type === option}
              onClick={() => setType(option)}
              className={`rounded-lg border px-4 py-3 text-base leading-[normal] ${
                type === option
                  ? 'border-[#2c4eb7] bg-[#f4f6fb] font-medium text-[#2c4eb7]'
                  : `border-[#e8e8ea] bg-white ${INK}`
              }`}
            >
              {t(`site.partners.types.${option}.title`)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        {field('name', { required: true, auto: 'name' })}
        {field('company', { required: true, auto: 'organization' })}
        {field('email', { required: true, type: 'email', auto: 'email' })}
        {field('phone', { type: 'tel', auto: 'tel' })}
        {field('city', { auto: 'address-level2' })}
        {field('clients', {})}
      </div>
      <textarea
        value={fields.message}
        onChange={(event) => set('message')(event.target.value)}
        placeholder={t('site.partners.form.message')}
        aria-label={t('site.partners.form.message')}
        className={`${input} h-[140px] resize-none py-4`}
      />
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          className="min-w-[170px] rounded-lg bg-[#2c4eb7] px-6 py-3.5 text-lg leading-[normal] text-white"
        >
          {t('site.partners.form.send')}
        </button>
        {sent ? (
          <p role="status" className="text-sm leading-5 text-[#494d56]">
            {t('site.partners.form.sent', { email })}
          </p>
        ) : null}
      </div>
    </form>
  )
}
