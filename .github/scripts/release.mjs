#!/usr/bin/env node
// Prepares a release: computes the next version from the latest vX.Y.Z tag,
// bumps server/ and web/ package versions, prepends CHANGELOG.md and writes
// the release notes. Usage: node .github/scripts/release.mjs <major|minor|patch>
// Prints "version=X.Y.Z" (for $GITHUB_OUTPUT). Does not commit or tag.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const PACKAGES = ['server', 'web']
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

export function nextVersion(current, bump) {
  const [major, minor, patch] = current.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`Type de version inconnu : ${bump} (major, minor ou patch)`)
}

// Conventional-commit prefix ("feat(ui): ", "fix!: "), dropped from the notes.
const CONVENTIONAL = /^(feat|fix|chore|docs|refactor|perf|test|build|ci|style)(\([^)]*\))?!?:\s*/i

const SECTIONS = [
  { title: '✨ Nouveautés', match: /^(feat|add|ajout|new|nouveau)/i },
  { title: '🐛 Corrections', match: /^(fix|corrige|correction|bug)/i },
  { title: '🔧 Autres changements', match: /.*/ },
]

export function releaseNotes(version, commits, date = new Date().toISOString().slice(0, 10)) {
  const lines = [`## v${version} — ${date}`]
  const remaining = commits.filter((c) => !/^chore\(release\)/.test(c.subject) && !/^Merge /.test(c.subject))
  for (const section of SECTIONS) {
    const picked = remaining.filter((c) => !c.used && section.match.test(c.subject))
    if (!picked.length) continue
    picked.forEach((c) => { c.used = true })
    lines.push('', `### ${section.title}`, '', ...picked.map((c) => `- ${c.subject.replace(CONVENTIONAL, '')} (${c.hash})`))
  }
  if (lines.length === 1) lines.push('', '_Aucun changement._')
  return lines.join('\n')
}

function main() {
  const bump = process.argv[2]
  let lastTag = ''
  try { lastTag = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*') } catch { /* first release */ }
  const base = lastTag || JSON.parse(readFileSync('server/package.json', 'utf8')).version
  const version = nextVersion(base, bump)
  if (git('tag', '--list', `v${version}`)) throw new Error(`Le tag v${version} existe déjà`)

  for (const dir of PACKAGES) {
    for (const file of [`${dir}/package.json`, `${dir}/package-lock.json`]) {
      if (!existsSync(file)) continue
      const pkg = JSON.parse(readFileSync(file, 'utf8'))
      pkg.version = version
      if (pkg.packages?.['']) pkg.packages[''].version = version
      writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
    }
  }

  const log = git('log', ...(lastTag ? [`${lastTag}..HEAD`] : []), '--no-merges', '--pretty=format:%s%x09%h')
  const commits = log ? log.split('\n').map((l) => { const [subject, hash] = l.split('\t'); return { subject, hash } }) : []
  const notes = releaseNotes(version, commits)
  writeFileSync('release-notes.md', `${notes}\n`)
  const previous = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8').replace(/^# Changelog\s*/, '') : ''
  writeFileSync('CHANGELOG.md', `# Changelog\n\n${notes}\n${previous ? `\n${previous}` : ''}`)
  console.log(`version=${version}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
