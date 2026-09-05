/**
 * Runs inside the audit page, driving the built app in an iframe.
 *
 * Two passes. The first walks the seed routes and follows the first link out of each one, so the
 * detail screens are discovered rather than hard-coded. The second measures, at every width, how
 * far each screen's content overflows the space it has been given.
 *
 * Reads `window.__ROUTES` and `window.__WIDTHS`; writes its result as JSON into `#out`, which the
 * runner reads back with `chrome --dump-dom`.
 */
;(function () {
  var ROUTES = window.__ROUTES
  var WIDTHS = window.__WIDTHS
  var out = document.getElementById('out')
  var f = document.getElementById('f')

  var sleep = function (ms) {
    return new Promise(function (r) {
      setTimeout(r, ms)
    })
  }

  /** Navigate the SPA in place — a full reload per route would take minutes. */
  function go(path) {
    var w = f.contentWindow
    w.history.pushState({}, '', path)
    w.dispatchEvent(new w.PopStateEvent('popstate'))
  }

  /** Anything that scrolls on purpose, and so is allowed to hold something wider than itself. */
  function scrolls(el) {
    var ox = getComputedStyle(el).overflowX
    return ox === 'auto' || ox === 'scroll' || ox === 'hidden'
  }

  /**
   * How far the page bleeds sideways, and which elements are actually doing it.
   *
   * Measured against the visible edge of `main` rather than against each element's own parent: a
   * parent is only ever as wide as the widest thing it contains, so parent-relative measuring
   * fingers the container instead of the culprit. Elements inside a deliberate scroller are
   * skipped — a wide table in an `overflow-x-auto` wrapper is the intended pattern here.
   *
   * Reported culprits are the deepest offenders: an element is dropped when a descendant of it
   * reaches just as far, because then the descendant is what needs fixing.
   */
  function measure() {
    var d = f.contentDocument
    var main = d.querySelector('main')
    if (!main) return { over: 0, culprits: [], landed: f.contentWindow.location.pathname }

    var over = Math.round(main.scrollWidth - main.clientWidth)
    var mainStyle = getComputedStyle(main)
    var rtl = mainStyle.direction === 'rtl'
    var box = main.getBoundingClientRect()
    // The content box, not the border box: content that spills into main`s own padding is
    // already spilling, and measuring to the border box hides it.
    var edge = {
      left: box.left + parseFloat(mainStyle.paddingLeft || 0),
      right: box.right - parseFloat(mainStyle.paddingRight || 0),
    }
    var offenders = []

    var all = main.querySelectorAll('*')
    for (var i = 0; i < all.length; i++) {
      var el = all[i]
      // Skip anything sitting inside something that is meant to scroll.
      var inScroller = false
      for (var p = el.parentElement; p && p !== main; p = p.parentElement) {
        if (scrolls(p)) {
          inScroller = true
          break
        }
      }
      if (inScroller) continue

      var r = el.getBoundingClientRect()
      if (!r.width) continue
      var past = Math.round(rtl ? edge.left - r.left : r.right - edge.right)
      if (past > 2) offenders.push({ el: el, past: past })
    }

    var culprits = offenders
      .filter(function (o) {
        return !offenders.some(function (other) {
          return other.el !== o.el && o.el.contains(other.el) && other.past >= o.past - 1
        })
      })
      .sort(function (a, b) {
        return b.past - a.past
      })
      .slice(0, 3)
      .map(function (o) {
        return {
          past: o.past,
          tag: o.el.tagName.toLowerCase(),
          cls: String(o.el.className || '').slice(0, 80),
          text: (o.el.textContent || '').trim().slice(0, 34),
        }
      })

    return { over: over, culprits: culprits, landed: f.contentWindow.location.pathname }
  }

  /** Same-origin app links only — no anchors, no mailto, no external hosts. */
  function linksOnPage() {
    var d = f.contentDocument
    var found = []
    var anchors = d.querySelectorAll('main a[href]')
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute('href')
      if (!href || href.charAt(0) !== '/' || href.indexOf('//') === 0) continue
      found.push(href.split('#')[0].split('?')[0])
    }
    return found
  }

  /**
   * One discovered route per parent path.
   *
   * `/invoices/INV-2043` and `/invoices/INV-2044` prove the same layout, so the audit keeps the
   * first and drops the rest. Grouping by the parent gives exactly one detail screen per list.
   */
  function parentOf(path) {
    return path.split('/').slice(0, -1).join('/')
  }

  ;(async function () {
    await sleep(1600)

    // Pass one: discovery.
    var seen = {}
    ROUTES.forEach(function (r) {
      seen[r] = true
    })
    var byParent = {}
    var discovered = []

    for (var i = 0; i < ROUTES.length; i++) {
      go(ROUTES[i])
      await sleep(230)
      var links = linksOnPage()
      for (var j = 0; j < links.length; j++) {
        var href = links[j]
        if (seen[href]) continue
        var key = parentOf(href)
        if (!key || byParent[key]) continue
        byParent[key] = href
        seen[href] = true
        discovered.push(href)
      }
    }

    var all = ROUTES.concat(discovered)

    // Pass two: measurement.
    var rows = []
    for (var w = 0; w < WIDTHS.length; w++) {
      f.style.width = WIDTHS[w] + 'px'
      await sleep(400)
      for (var r = 0; r < all.length; r++) {
        go(all[r])
        await sleep(240)
        var m = measure()
        rows.push({
          width: WIDTHS[w],
          route: all[r],
          over: m.over,
          landed: m.landed,
          culprits: m.culprits,
        })
      }
    }

    out.textContent =
      '<<<JSON ' + JSON.stringify({ seed: ROUTES, discovered: discovered, rows: rows }) + ' JSON>>>'
  })().catch(function (e) {
    out.textContent = '<<<ERR ' + e.message + ' | ' + e.stack + ' ERR>>>'
  })
})()
