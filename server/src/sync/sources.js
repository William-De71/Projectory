import { XMLParser } from 'fast-xml-parser'
import { fetchJson, fetchText, looksLikeVersion } from './http.js'
import { tr } from '../i18n.js'

// ---- Versions -------------------------------------------------------------

// `forges.project` is the project's own forge adapter, `forges.github` a
// GitHub adapter for "github" sources pointing at another repository.
export async function latestVersion(source, { repo, forges }) {
  const ref = (source.ref || '').trim()
  switch (source.type) {
    case 'repo':
      if (!repo) throw new Error(tr('Aucun dépôt configuré pour ce projet'))
      return forges.project.latestRelease(repo)
    case 'github':
      if (!ref && !repo) throw new Error(tr('Indique owner/repo'))
      return (ref ? forges.github : forges.project).latestRelease(ref || repo)
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
      throw new Error(tr('Type de source de version inconnu : {type}', { type: source.type }))
  }
}

// ---- Forums -----------------------------------------------------------------

export function forumSourceKey(source) {
  const key = [source.type, source.url, source.path || '', source.query || '']
  if (source.user) key.push(source.user)
  return key.join('|')
}

// Returns topics as { id, title, url, excerpt, created_at }.
export async function fetchForum(source) {
  if (source.type === 'discourse') return fetchDiscourse(source)
  if (source.type === 'discourse_mentions') return fetchDiscourseMentions(source)
  if (source.type === 'rss') return fetchRss(source)
  throw new Error(tr('Type de forum inconnu : {type}', { type: source.type }))
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

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Posts that tag @user. Discourse only exposes mentions to the user themself,
// so this relies on the public search: posts containing the name, written by
// someone else, whose excerpt holds "@user".
async function fetchDiscourseMentions({ url, user }) {
  const username = String(user || '').trim().replace(/^@/, '')
  if (!username) throw new Error(tr("Nom d'utilisateur Discourse manquant"))
  const base = url.replace(/\/+$/, '')
  const data = await fetchJson(`${base}/search.json?q=${encodeURIComponent(`${username} order:latest`)}`)
  const topics = Object.fromEntries((data.topics || []).map((t) => [t.id, t]))
  const tag = new RegExp(`@${escapeRegExp(username)}\\b`, 'i')
  return (data.posts || [])
    .filter((p) => p.username?.toLowerCase() !== username.toLowerCase() && tag.test(p.blurb || ''))
    .map((p) => {
      const topic = topics[p.topic_id] || {}
      return {
        id: String(p.id),
        title: decodeEntities(topic.fancy_title || topic.title || ''),
        url: `${base}/t/${topic.slug || 'topic'}/${p.topic_id}/${p.post_number}`,
        excerpt: `@${p.username} : ${stripHtml(p.blurb || '')}`,
        created_at: p.created_at,
      }
    })
}

// "https://forum/t/slug/123/4" -> { base_url: "https://forum", topic_id: 123 }.
export function parseTopicUrl(url) {
  let u
  try { u = new URL(String(url).trim()) } catch { return null }
  const at = u.pathname.indexOf('/t/')
  if (at < 0) return null
  const id = u.pathname.slice(at + 3).split('/').find((seg) => /^\d+$/.test(seg))
  if (!id) return null
  return { base_url: `${u.origin}${u.pathname.slice(0, at)}`, topic_id: Number(id) }
}

// Username of the post a topic URL points to (…/t/slug/123/45), or of the
// topic's first post when the URL has no post number.
export async function fetchPostAuthor(url) {
  const topic = parseTopicUrl(url)
  if (!topic) return null
  const segments = new URL(String(url).trim()).pathname.split('/')
  const after = segments.slice(segments.indexOf(String(topic.topic_id)) + 1)
  const number = Number(after.find((seg) => /^\d+$/.test(seg))) || 1
  const page = await fetchJson(`${topic.base_url}/t/${topic.topic_id}/${number}.json`)
  const posts = page.post_stream?.posts || []
  return (posts.find((p) => p.post_number === number) || posts[0])?.username || null
}

// Title, last post number and the posts after `after` of a Discourse topic.
export async function fetchTopic({ base_url, topic_id }, after = null) {
  const topic = await fetchJson(`${base_url}/t/${topic_id}.json`)
  const highest = topic.highest_post_number ?? topic.posts_count ?? 0
  const result = { title: decodeEntities(topic.fancy_title || topic.title || ''), slug: topic.slug, highest, posts: [] }
  if (after == null || highest <= after) return result
  // The topic payload only holds the first posts: ask for the ones after the last seen.
  const page = await fetchJson(`${base_url}/t/${topic_id}/${after + 1}.json`)
  result.posts = (page.post_stream?.posts || [])
    .filter((p) => p.post_number > after)
    .map((p) => ({
      number: p.post_number,
      username: p.username,
      excerpt: stripHtml(p.cooked || '').slice(0, 300),
      created_at: p.created_at,
      url: `${base_url}/t/${topic.slug}/${topic_id}/${p.post_number}`,
    }))
  return result
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
    throw new Error(tr("Le flux n'est ni RSS ni Atom"))
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
