/**
 * An email address, left to right in either language. A long one may wrap, and it prefers to
 * wrap just after the "@" rather than in the middle of a word.
 */
export function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf('@')
  return (
    <bdi dir="ltr" className="break-words">
      {at > 0 ? (
        <>
          {email.slice(0, at + 1)}
          <wbr />
          {email.slice(at + 1)}
        </>
      ) : (
        email
      )}
    </bdi>
  )
}
