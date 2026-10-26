import { useTranslation } from 'react-i18next'
import infoIcon from '../../assets/settings/info.svg'

const FSI = '⁨'
const LRI = '⁦'
const PDI = '⁩'

/**
 * The (i) hint under a business activity field: the activity the company's sub business type
 * suggests, for the person to pick if it is right. It is never filled in for them (Catalogue
 * guide 1A). Used by sign-up and Settings › Company.
 */
export function IsicSuggestion({
  subType,
  code,
  label,
}: {
  /** The sub business type's name, in the reader's language. */
  subType: string
  code: string
  /** The activity's name, in the reader's language. */
  label: string
}) {
  const { t } = useTranslation()
  return (
    <p className="flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-tertiary">
      <img src={infoIcon} alt="" aria-hidden="true" className="mt-px size-3.5 shrink-0" />
      <span>
        {t('isicSuggestion.text', {
          subType: `${FSI}${subType}${PDI}`,
          code: `${LRI}${code}${PDI}`,
          label: `${FSI}${label}${PDI}`,
        })}
      </span>
    </p>
  )
}
