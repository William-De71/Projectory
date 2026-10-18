import { XMLParser } from 'fast-xml-parser'
import { fetchJson, fetchText, looksLikeVersion } from './http.js'
import { latestGithubVersion } from './github.js'

// ---- Versions -------------------------------------------------------------

export async function latestVersion(source, projectRepo) {
  const ref = (source.ref || '').trim()
  switch (source.type) {
    case 'github':
      return latestGithubVersion(ref || projectRepo)
    case 'npm': {
      const data = await fetchJson(`https://registry.npmjs.org/${ref.replace('/', '%2F')}/latest`)
      return { version: data.version, url: `https://www.npmjs.com/package/${ref}` }
    }
    case 'docker': {
      const repo = ref.includes('/') ? ref : `library/${ref}`
      const data = await fetchJson(`https://hub.docker.com/v2/repositories/${repo}/tags?page_size=50&ordering=last_updated`)
      const tag = (data.results || []).find((t) => looksLikeVersion(t.name))
      if (!tag) return null
      return { version: tag.name, url: `https://hub.docker.com/r/${repo.replace(/^library\//, '_/')}/tags`, published_at: tag.last_updated }
    }
    default:
      throw new Error(`Type de source de version inconnu : ${source.type}`)
  }
}

// ---- Forums -----------------------------------------------------------------

export function forumSourceKey(source) {
  return [source.type, source.url, source.path || '', source.query || ''].join('|')
}

// Returns topics as { id, title, url, excerpt, created_at }.
export async function fetchForum(source) {
  if (source.type === 'discourse') return fetchDiscourse(source)
  if (source.type === 'rss') return fetchRss(source)
  throw new Error(`Type de forum inconnu : ${source.type}`)
}

async function fetchDiscourse({ url, path, query }) {
  const base = url.replace(/\/+$/, '')
  const endpoint = query
    ? `${base}/search.json?q=${encodeURIComponent(query)}`
    : `${base}/${(path || 'latest').replace(/^\/+|\/+$/g, '').replace(/\.json$/, '')}.json`
  const data = await fetchJson(endpoint)
  const topics = data.topic_list?.topics || data.topics || []
  // Search results carry the excerpt on posts, keyed by topic.
  const blurbs = Object.fromEntries((data.posts || []).map((p) => [p.topic_id, p.blurb]))
  return topics.map((t) => ({
    id: String(t.id),
    title: decodeEntities(t.fancy_title || t.title),
    url: `${base}/t/${t.slug}/${t.id}`,
    excerpt: stripHtml(t.excerpt || blurbs[t.id] || ''),
    created_at: t.created_at,
  }))
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' })

async function fetchRss({ url, query }) {
  const doc = xml.parse(await fetchText(url))
  const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : [])
  const text = (v) => (typeof v === 'object' && v !== null ? v['#text'] ?? '' : v ?? '')
  let entries
  if (doc.rss) {
    entries = asArray(doc.rss.channel?.item).map((it) => ({
      id: String(text(it.guid) || it.link),
      title: decodeEntities(String(text(it.title))),
      url: String(text(it.link)),
      excerpt: stripHtml(String(text(it.description))),
      created_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
    }))
  } else if (doc.feed) {
    entries = asArray(doc.feed.entry).map((it) => {
      const links = asArray(it.link)
      const link = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') || links[0]
      return {
        id: String(text(it.id) || link?.['@href']),
        title: decodeEntities(String(text(it.title))),
        url: link?.['@href'] || '',
        excerpt: stripHtml(String(text(it.summary) || text(it.content))),
        created_at: it.published || it.updated || null,
      }
    })
  } else {
    throw new Error("Le flux n'est ni RSS ni Atom")
  }
  const words = (query || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)
  if (!words.length) return entries
  return entries.filter((e) => words.some((w) => `${e.title} ${e.excerpt}`.toLowerCase().includes(w)))
}

function stripHtml(html) {
  return decodeEntities(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
}

const NAMED_ENTITIES = {
  quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', amp: '&',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—',
}

// Feeds often double-encode ("&amp;#39;"), hence the two passes.
export function decodeEntities(s) {
  return decodeOnce(decodeOnce(s))
}

function decodeOnce(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : match
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match
  })
}
