/**
 * Signing out leaves the app with a full-page navigation, so the browser can keep the signed-in
 * page in its back-forward cache and Back shows it again (company VAT, address, contacts) without
 * a single request reaching the server. A page restored from that cache is reloaded instead, so it
 * starts over and asks the server who is signed in before drawing anything.
 */
export function reloadWhenRestoredFromCache(target: Pick<Window, 'addEventListener' | 'location'>) {
  target.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) target.location.reload()
  })
}
