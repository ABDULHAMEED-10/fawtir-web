import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '../HomePage/HomePage.css'
import { Footer, INK, PageHero, SOFT, useSiteMeta } from '../HomePage/site'
import { useCompanyContact } from '../../lib/companyContact'

/**
 * The legal pages (owner, 4 Nov 2026): Terms of service, Privacy policy and Refund policy. No
 * Figma frame; drawn in the site's own pieces (the page hero, a white bordered card, the footer)
 * with a contents list beside the text on wide screens. The wording follows the owner's
 * subscription, refund and retention decisions in the handbook (CA-1, LV-6, RF-2, retention).
 * The support email is the console's company contact setting (CS-1), like every site page.
 */

export type LegalDoc = 'terms' | 'privacy' | 'refund'
const LEGAL_PATHS: Record<LegalDoc, string> = {
  terms: '/terms',
  privacy: '/privacy',
  refund: '/refund-policy',
}
const DOCS: LegalDoc[] = ['terms', 'privacy', 'refund']

type Section = { title: string; body?: Record<string, string>; items?: Record<string, string> }

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t, i18n } = useTranslation()
  useSiteMeta(`landing.meta.${doc}.title`, `landing.meta.${doc}.description`)
  const contact = useCompanyContact(i18n.language)
  const vars = { provider: t('site.legal.provider'), email: contact.supportEmail }
  const base = `site.legal.${doc}`
  // The structure (which sections, paragraphs and points) comes from the copy; each string is
  // then read on its own so the provider and email are filled in.
  const sections = t(`${base}.sections`, { returnObjects: true }) as Record<string, Section>
  const ids = typeof sections === 'object' && sections ? Object.keys(sections) : []

  return (
    <div className={`landing min-h-screen overflow-x-clip bg-white ${INK}`}>
      <PageHero
        active="legal"
        lead={t(`${base}.lead`)}
        word={t(`${base}.word`)}
        body={t('site.legal.updated', { date: t('site.legal.date') })}
      />
      <main className="mx-auto grid w-full max-w-[1220px] items-start gap-12 px-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:px-0">
        <nav
          aria-label={t('site.legal.contents')}
          className="sticky top-8 max-lg:static max-lg:rounded-lg max-lg:border max-lg:border-[#eaedf8] max-lg:p-5"
        >
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-[#737781]">
            {t('site.legal.contents')}
          </p>
          <ol className="flex flex-col gap-2.5 text-sm leading-5">
            {ids.map((id, index) => (
              <li key={id}>
                <a href={`#${doc}-${id}`} className={`flex gap-2 hover:text-[#2c4eb7] ${SOFT}`}>
                  <span dir="ltr" className="w-5 shrink-0 tabular-nums">
                    {index + 1}.
                  </span>
                  <span>{t(`${base}.sections.${id}.title`)}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="min-w-0 rounded-lg border border-[#eaedf8] bg-white p-10 max-md:p-5">
          <p className="text-lg leading-8">{t(`${base}.intro`, vars)}</p>
          {ids.map((id, index) => {
            const section = sections[id]
            return (
              <section
                key={id}
                id={`${doc}-${id}`}
                aria-labelledby={`${doc}-${id}-title`}
                className="scroll-mt-8 border-t border-[#eaedf8] pt-8 mt-8"
              >
                <h2 id={`${doc}-${id}-title`} className="text-xl font-semibold leading-7">
                  <span dir="ltr">{index + 1}.</span> {t(`${base}.sections.${id}.title`)}
                </h2>
                {Object.keys(section.body ?? {}).map((p) => (
                  <p key={p} className={`mt-4 text-base leading-7 ${SOFT}`}>
                    {t(`${base}.sections.${id}.body.${p}`, vars)}
                  </p>
                ))}
                {section.items ? (
                  <ul
                    className={`mt-4 flex list-disc flex-col gap-2 ps-6 text-base leading-7 ${SOFT}`}
                  >
                    {Object.keys(section.items).map((item) => (
                      <li key={item}>{t(`${base}.sections.${id}.items.${item}`, vars)}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            )
          })}
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#eaedf8] pt-6 text-sm">
            <span className="font-semibold">{t('site.legal.related')}</span>
            {DOCS.filter((other) => other !== doc).map((other) => (
              <Link
                key={other}
                to={LEGAL_PATHS[other]}
                className="font-medium text-[#2c4eb7] hover:underline"
              >
                {t(`site.legal.links.${other}`)}
              </Link>
            ))}
          </div>
        </article>
      </main>
      <Footer />
    </div>
  )
}
