import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextVersion, releaseNotes } from './release.mjs'

test('nextVersion', () => {
  assert.equal(nextVersion('v1.4.2', 'patch'), '1.4.3')
  assert.equal(nextVersion('1.4.2', 'minor'), '1.5.0')
  assert.equal(nextVersion('v1.4.2', 'major'), '2.0.0')
  assert.throws(() => nextVersion('1.0.0', 'huge'))
})

test('releaseNotes groups commits and skips release commits', () => {
  const notes = releaseNotes('1.5.0', [
    { subject: 'feat(ui): mode sombre', hash: 'a1' },
    { subject: 'Fix crash on empty inbox', hash: 'b2' },
    { subject: 'Add GitLab support', hash: 'c3' },
    { subject: 'chore(release): v1.4.2', hash: 'd4' },
    { subject: 'Refactor sync', hash: 'e5' },
    { subject: 'DevDeck: initial import', hash: 'f6' },
  ], '2026-10-18')
  assert.equal(notes, [
    '## v1.5.0 — 2026-10-18', '',
    '### ✨ Nouveautés', '', '- mode sombre (a1)', '- Add GitLab support (c3)', '',
    '### 🐛 Corrections', '', '- Fix crash on empty inbox (b2)', '',
    '### 🔧 Autres changements', '', '- Refactor sync (e5)', '- DevDeck: initial import (f6)',
  ].join('\n'))
})
