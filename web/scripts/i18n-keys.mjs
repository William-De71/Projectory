// Lists the French source texts that need a translation, and checks that
// every language dictionary covers them: `node scripts/i18n-keys.mjs --check`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? (f === 'i18n' ? [] : files(p)) : /\.jsx?$/.test(f) ? [p] : []
})

const STRING = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`
const PATTERNS = [
  new RegExp(String.raw`\bt\(\s*(?:${STRING})`, 'g'),
  // Labels kept in constants and translated at render time.
  new RegExp(String.raw`\b(?:label|placeholder):\s*(?:${STRING})`, 'g'),
  new RegExp(String.raw`\b\w+:\s*(?:${STRING})`, 'g'),
]
const unescape = (s) => s.replace(/\\(.)/g, '$1')
// Not translatable: identifiers, URLs, paths, colours, versions.
const isText = (s) => /[A-Za-zÀ-ÿ]/.test(s) && !/^(#|\/|https?:|repeat\(|[a-z]+(-[a-z]+)*$|[a-z]+[A-Za-z]*$|[\w.-]+\/[\w./-]+$|-?v?\d)/.test(s)

export function collectKeys() {
  const keys = new Set()
  for (const file of files(SRC)) {
    const src = readFileSync(file, 'utf8')
    const isConstFile = /labels\.js$|CiStatus\.jsx$|InboxList\.jsx$|AppLayout\.jsx$|ProjectDetail\.jsx$|MyGithub\.jsx$|Inbox\.jsx$/.test(file)
    PATTERNS.forEach((re, i) => {
      if (i === 2 && !isConstFile) return
      for (const m of src.matchAll(re)) {
        const s = unescape(m[1] ?? m[2])
        // Anything passed to t() is user-facing; constants are filtered.
        if (i === 0 ? /[A-Za-zÀ-ÿ]/.test(s) : isText(s)) keys.add(s)
      }
    })
  }
  return [...keys].sort()
}

if (process.argv.includes('--check')) {
  const { default: en } = await import('../src/i18n/en.js')
  const missing = collectKeys().filter((k) => !(k in en))
  const unused = Object.keys(en).filter((k) => !collectKeys().includes(k))
  if (unused.length) console.warn(`Unused translations (${unused.length}):\n  ${unused.join('\n  ')}`)
  if (missing.length) {
    console.error(`Missing English translations (${missing.length}):\n  ${missing.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`i18n OK: ${Object.keys(en).length} translations`)
} else {
  console.log(JSON.stringify(collectKeys(), null, 1))
}
