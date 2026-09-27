import { useState } from 'react'
import { COMPANY_LOGO_URL } from '../../api/company/branding'

/**
 * The signed-in company's own logo, or its name's first letter when there is none — which also
 * covers a role that cannot read branding (`admin.settings.manage`): the shell renders for every
 * signed-in user, not only admins, and a `403` here reads the same as "no logo" rather than as an
 * error, since nothing on this card depends on telling the two apart.
 */
export function CompanyAvatar({
  name,
  size,
  className = '',
}: {
  name: string
  size: number
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const style = { width: size, height: size }

  if (broken) {
    return (
      <span
        style={style}
        className={`flex shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-800 ${className}`}
      >
        {initial}
      </span>
    )
  }
  return (
    <img
      src={COMPANY_LOGO_URL}
      alt=""
      style={style}
      className={`shrink-0 rounded-full object-cover ${className}`}
      onError={() => setBroken(true)}
    />
  )
}
