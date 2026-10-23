const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How many days the link in an invitation the server has just sent works for: from when it was
 * sent to `expiresAt` (`fawtir.identity.invitations.ttl`, 7 days by default). The server does not
 * say it before an invitation is sent, so until then "Link works for" stays "Not available yet".
 * Null when the answer cannot be read.
 */
export function invitationLinkDays(invitation: {
  expiresAt: string
  lastSentAt: string | null
  createdAt: string
}): number | null {
  const sentAt = Date.parse(invitation.lastSentAt ?? invitation.createdAt)
  const expiresAt = Date.parse(invitation.expiresAt)
  if (Number.isNaN(sentAt) || Number.isNaN(expiresAt) || expiresAt <= sentAt) return null
  return Math.max(1, Math.round((expiresAt - sentAt) / DAY_MS))
}
