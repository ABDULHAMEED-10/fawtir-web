import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import callIcon from '../../assets/site/icon-call.svg'
import mailIcon from '../../assets/site/icon-mail.svg'
import pinIcon from '../../assets/site/icon-pin.svg'
import '../HomePage/HomePage.css'
import { ClosingBand, Faq, Footer, Heading, INK, PageHero, Washes } from '../HomePage/site'
import { useFaqItems } from './faq'

/**
 * The public contact page (Figma "Contact Us", 191:14077): the message form in a white card, the
 * three ways to reach us beneath it, then the questions.
 */

const EMAIL = 'hello@fawtir.om'
// The number is the frame's; the owner is to confirm it before launch.
const PHONE = '+2444 0100'

export function ContactPage() {
  const { t } = useTranslation()
  return (
    <div className={`landing min-h-screen overflow-x-clip bg-white ${INK}`}>
      <PageHero
        active="contact"
        lead={t('site.contact.hero.lead')}
        word={t('site.contact.hero.word')}
        body={
          <>
            {t('site.contact.hero.body1')}
            <br className="max-md:hidden" /> {t('site.contact.hero.body2')}
          </>
        }
      />
      <main>
        <Touch />
        <Faq items={useFaqItems()} />
      </main>
      <ClosingBand />
      <Footer />
    </div>
  )
}

function Touch() {
  const { t } = useTranslation()
  const info = [
    {
      icon: callIcon,
      title: t('site.contact.info.questionTitle'),
      value: t('site.contact.info.phone', { number: PHONE }),
      href: `tel:${PHONE.replace(/\s/g, '')}`,
    },
    {
      icon: mailIcon,
      title: t('site.contact.info.emailTitle'),
      value: EMAIL,
      href: `mailto:${EMAIL}`,
    },
    {
      icon: pinIcon,
      title: t('site.contact.info.addressTitle'),
      value: t('site.contact.info.address'),
    },
  ]
  return (
    <section className="relative isolate mx-auto mt-[200px] w-full max-w-[1720px] px-4 max-md:mt-24 pb-[100px] pt-[140px] max-md:pt-16 md:px-8 min-[1800px]:px-0">
      <Washes />
      <div className="mx-auto flex max-w-[1424px] flex-col items-center gap-[60px] max-md:gap-10">
        <div className="flex flex-col items-center gap-6 text-center">
          <Heading
            lead={t('site.contact.section.lead')}
            em={t('site.contact.section.em')}
            className="[&>span]:inline [&>span+span]:ms-3"
          />
          <p className={`landing-cap text-xl leading-[normal] ${INK}`}>
            {t('site.contact.section.body1')}
            <br className="max-md:hidden" /> {t('site.contact.section.body2')}
          </p>
        </div>
        <MessageForm />
        <ul className="flex w-full flex-wrap items-center justify-between gap-8 max-md:flex-col max-md:items-start">
          {info.map((item) => (
            <li key={item.title} className="flex items-center gap-4">
              <img src={item.icon} alt="" className="size-10 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="text-2xl font-medium leading-[normal]">{item.title}</p>
                {item.href ? (
                  <a href={item.href} dir="ltr" className="text-xl leading-[normal] opacity-50">
                    {item.value}
                  </a>
                ) : (
                  <p className="text-xl leading-[normal] opacity-50">{item.value}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function MessageForm() {
  const { t } = useTranslation()
  const [fields, setFields] = useState({ name: '', email: '', phone: '', message: '' })
  const [sent, setSent] = useState(false)
  const set = (key: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }))

  // TODO(backend): SITE.md 1.1. No public enquiry endpoint yet; the form opens the visitor's email
  // app with the message filled in.
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = [fields.message, '', fields.name, fields.email, fields.phone]
      .filter((line, index) => index < 2 || line)
      .join('\n')
    const subject = `Fawtir enquiry from ${fields.name}`
    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setSent(true)
  }

  const input =
    'w-full rounded-lg bg-[#fafafa] px-4 text-base leading-[normal] outline-none placeholder:text-[#8a8e96] focus:ring-2 focus:ring-[#2c4eb7]/30'

  return (
    <form
      onSubmit={submit}
      className="landing-shadow-brand flex w-full flex-col gap-6 rounded-lg bg-white p-8 max-md:p-5"
    >
      <h3 className="landing-cap text-[clamp(1.5rem,1.2rem+0.9vw,2rem)] font-medium leading-[normal]">
        {t('site.contact.form.title')}
      </h3>
      <div className="flex flex-col gap-4">
        <input
          required
          value={fields.name}
          onChange={(event) => set('name')(event.target.value)}
          placeholder={t('site.contact.form.name')}
          aria-label={t('site.contact.form.name')}
          autoComplete="name"
          className={`${input} h-14`}
        />
        <input
          required
          type="email"
          value={fields.email}
          onChange={(event) => set('email')(event.target.value)}
          placeholder={t('site.contact.form.email')}
          aria-label={t('site.contact.form.email')}
          autoComplete="email"
          className={`${input} h-14`}
        />
        <input
          type="tel"
          value={fields.phone}
          onChange={(event) => set('phone')(event.target.value)}
          placeholder={t('site.contact.form.phone')}
          aria-label={t('site.contact.form.phone')}
          autoComplete="tel"
          className={`${input} h-14`}
        />
        <textarea
          required
          value={fields.message}
          onChange={(event) => set('message')(event.target.value)}
          placeholder={t('site.contact.form.message')}
          aria-label={t('site.contact.form.message')}
          className={`${input} h-[140px] resize-none py-4`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          className="min-w-[170px] rounded-lg bg-[#2c4eb7] px-6 py-3.5 text-lg leading-[normal] text-white"
        >
          {t('site.contact.form.send')}
        </button>
        {sent ? (
          <p role="status" className="text-sm leading-5 text-[#494d56]">
            {t('site.contact.form.sent', { email: EMAIL })}
          </p>
        ) : null}
      </div>
    </form>
  )
}
