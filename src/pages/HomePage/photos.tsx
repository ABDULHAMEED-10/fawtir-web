import { useTranslation } from 'react-i18next'
import ownerPos from '../../assets/home/owner-pos.webp'
import ownerPosAr from '../../assets/home/owner-pos-ar.webp'
import photoErpTeam from '../../assets/home/photo-erp-team.webp'
import photoErpTeamAr from '../../assets/home/photo-erp-team-ar.webp'
import photoFreelancer from '../../assets/home/photo-freelancer.webp'
import photoFreelancerAr from '../../assets/home/photo-freelancer-ar.webp'
import photoSmeOffice from '../../assets/home/photo-sme-office.webp'
import photoSmeOfficeAr from '../../assets/home/photo-sme-office-ar.webp'

/**
 * The site's four photos (owner, 1 Nov 2026), each placed beside the part of the page it shows
 * rather than gathered in one gallery: the small office in the SME card, the freelancer in the
 * sole-trader card, the cafe owner in the till section, the finance team in the overview.
 *
 * The people and places are AI-generated, so no photo is captioned as a customer. Every screen in
 * them carries the app's real screen from the mock API, in the page's language.
 */
export const PHOTOS = {
  sme: { en: photoSmeOffice, ar: photoSmeOfficeAr, alt: 'landing.audience.photos.sme' },
  pos: { en: ownerPos, ar: ownerPosAr, alt: 'landing.audience.photoAlt' },
  erp: { en: photoErpTeam, ar: photoErpTeamAr, alt: 'landing.audience.photos.erp' },
  solo: { en: photoFreelancer, ar: photoFreelancerAr, alt: 'landing.audience.photos.solo' },
} as const

/** One photo in the site's frame (the lavender border the screenshots wear), in the page's language. */
export function SitePhoto({
  id,
  className = '',
  imgClassName = 'aspect-[3/2]',
}: {
  id: keyof typeof PHOTOS
  className?: string
  imgClassName?: string
}) {
  const { t, i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  return (
    <div
      className={`overflow-hidden rounded-lg border-[8px] border-[rgba(44,78,183,0.1)] ${className}`}
    >
      <img
        src={ar ? PHOTOS[id].ar : PHOTOS[id].en}
        alt={t(PHOTOS[id].alt)}
        loading="lazy"
        className={`block w-full object-cover ${imgClassName}`}
      />
    </div>
  )
}
