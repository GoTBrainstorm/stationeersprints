// OpenGraph tags for published blueprints.
//
// The static index.html is one file shared by every route, so a crawler asking
// for /b/:id would otherwise get the generic editor card. These tags are
// injected into that response as it streams past.
import type { BlueprintRow, Env } from './env'
import { absoluteStorageUrl, imageKey } from './env'

/**
 * Escape for use inside a double-quoted HTML attribute.
 *
 * Load-bearing: the strings below are user-supplied, and HTMLRewriter's
 * `append(html, { html: true })` inserts markup verbatim. Without this a title
 * of `"><script>` would close the meta tag and open a script one.
 */
export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface MetaTag {
  /** `property` for og:*, `name` for twitter:* and description. */
  attr: 'property' | 'name'
  key: string
  content: string
}

const MAX_OG_DESCRIPTION = 200

export function buildMetaTags(row: BlueprintRow, env: Env): MetaTag[] {
  const url = `${env.SITE_ORIGIN}/b/${row.id}`
  const byline = row.author_name ? ` by ${row.author_name}` : ''
  const counts = `${row.node_count} device${row.node_count === 1 ? '' : 's'}, ${row.edge_count} connection${row.edge_count === 1 ? '' : 's'}`
  const description = (row.description || counts).slice(0, MAX_OG_DESCRIPTION)

  const tags: MetaTag[] = [
    { attr: 'name', key: 'description', content: description },
    { attr: 'property', key: 'og:type', content: 'article' },
    { attr: 'property', key: 'og:site_name', content: 'Stationeersprints' },
    { attr: 'property', key: 'og:title', content: `${row.title}${byline}` },
    { attr: 'property', key: 'og:description', content: description },
    { attr: 'property', key: 'og:url', content: url },
  ]
  if (row.image_key) {
    tags.push(
      { attr: 'property', key: 'og:image', content: absoluteStorageUrl(env, imageKey(row.id)) },
      { attr: 'name', key: 'twitter:card', content: 'summary_large_image' },
    )
    if (row.image_width) tags.push({ attr: 'property', key: 'og:image:width', content: String(row.image_width) })
    if (row.image_height) tags.push({ attr: 'property', key: 'og:image:height', content: String(row.image_height) })
  } else {
    tags.push({ attr: 'name', key: 'twitter:card', content: 'summary' })
  }
  return tags
}

export function renderMetaTags(tags: MetaTag[]): string {
  return tags
    .map((t) => `<meta ${t.attr}="${escapeAttribute(t.key)}" content="${escapeAttribute(t.content)}">`)
    .join('')
}

export function pageTitle(row: BlueprintRow): string {
  return `${row.title} — Stationeersprints`
}

/**
 * Rewrite the asset response on the way through. `<title>` is replaced rather
 * than appended, and the existing generic og:* tags are dropped first so a
 * crawler that takes the first match doesn't take the wrong one.
 */
export function withMetaTags(response: Response, row: BlueprintRow, env: Env): Response {
  const html = renderMetaTags(buildMetaTags(row, env))
  // Rebuilt rather than mutated: a Response that came back from a fetch (which
  // is what ASSETS hands us) has immutable headers, and setting one on it
  // throws.
  const headers = new Headers(response.headers)
  // Only gallery entries are meant to be findable. Everything else is
  // "unlisted" in the sense people expect — the link works, a search for the
  // title does not. robots.txt can't express that, since crawling has to stay
  // allowed for the tags above to be read at all.
  if (row.visibility !== 'LISTED') headers.set('X-Robots-Tag', 'noindex, nofollow')
  // The document differs per blueprint and per visibility; caching it at the
  // edge under the shared asset key would serve one blueprint's tags for
  // another's URL.
  headers.set('Cache-Control', 'no-store')

  return new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(pageTitle(row))
      },
    })
    .on('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]', {
      element(el) {
        el.remove()
      },
    })
    .on('head', {
      element(el) {
        el.append(html, { html: true })
      },
    })
    .transform(new Response(response.body, { status: response.status, headers }))
}
