import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const DATA_PATH = process.env.DATA_PATH || join(process.cwd(), '..', 'data')

// Each entry runs once, in order; append new migrations, never edit old ones.
const MIGRATIONS = [
  `
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#1677ff',
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active',
    tags TEXT NOT NULL DEFAULT '[]',
    client TEXT NOT NULL DEFAULT '',
    repo TEXT NOT NULL DEFAULT '',
    homepage TEXT NOT NULL DEFAULT '',
    links TEXT NOT NULL DEFAULT '[]',
    deployed_version TEXT NOT NULL DEFAULT '',
    version_sources TEXT NOT NULL DEFAULT '[]',
    forum_sources TEXT NOT NULL DEFAULT '[]',
    pinned INTEGER NOT NULL DEFAULT 0,
    github TEXT,
    versions TEXT NOT NULL DEFAULT '[]',
    last_synced_at TEXT,
    sync_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Bugs, features and tasks tracked by hand (or converted from the inbox).
  CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'bug',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'normal',
    source TEXT NOT NULL DEFAULT 'manual',
    external_url TEXT NOT NULL DEFAULT '',
    target_version TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX items_project ON items(project_id, status);

  -- Specs and notes, markdown. project_id NULL = global note (journal).
  CREATE TABLE docs (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'note',
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX docs_project ON docs(project_id, type);

  -- Mirror of open GitHub issues / PRs, refreshed on every sync.
  CREATE TABLE github_items (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    labels TEXT NOT NULL DEFAULT '[]',
    draft INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(project_id, type, number)
  );

  -- Everything new detected by a sync: issues, PRs, releases, forum topics.
  CREATE TABLE inbox (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    excerpt TEXT NOT NULL DEFAULT '',
    external_key TEXT NOT NULL UNIQUE,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    read_at TEXT
  );
  CREATE INDEX inbox_unread ON inbox(read_at, created_at);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT INTO categories (name, color, position) VALUES
    ('Freelance', '#fa8c16', 1),
    ('Perso', '#52c41a', 2),
    ('Organisation', '#1677ff', 3),
    ('Autre', '#8c8c8c', 4);
  `,
  `
  -- Time spent, mainly for freelance billing.
  CREATE TABLE time_entries (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX time_project ON time_entries(project_id, date);
  `,
  `
  -- Per-project switch for push notifications.
  ALTER TABLE projects ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;
  `,
]

export function openDb(file = join(DATA_PATH, 'projectory.db')) {
  if (file !== ':memory:') mkdirSync(DATA_PATH, { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  const { user_version: version } = db.prepare('PRAGMA user_version').get()
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[i])
      db.exec(`PRAGMA user_version = ${i + 1}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
  return db
}

// JSON columns are stored as text; decode them on the way out.
const JSON_COLUMNS = ['tags', 'links', 'version_sources', 'forum_sources', 'github', 'versions', 'labels']

export function decode(row) {
  if (!row) return row
  const out = { ...row }
  for (const col of JSON_COLUMNS) {
    if (typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]) } catch { /* keep raw */ }
    }
  }
  for (const col of ['pinned', 'draft', 'notify']) if (col in out) out[col] = !!out[col]
  return out
}

// Builds "col = ?" pairs for an UPDATE from the allowed fields present in body.
export function pickUpdate(body, allowed) {
  const sets = []
  const values = []
  for (const key of allowed) {
    if (!(key in body)) continue
    let value = body[key]
    if (JSON_COLUMNS.includes(key)) value = JSON.stringify(value ?? [])
    else if (typeof value === 'boolean') value = value ? 1 : 0
    else if (value === undefined) value = null
    sets.push(`${key} = ?`)
    values.push(value)
  }
  return { sets, values }
}

export function insertRow(db, table, body, allowed) {
  const { sets, values } = pickUpdate(body, allowed)
  const cols = sets.map((s) => s.split(' = ')[0])
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  return Number(db.prepare(sql).run(...values).lastInsertRowid)
}

export function updateRow(db, table, id, body, allowed, { touch = true } = {}) {
  const { sets, values } = pickUpdate(body, allowed)
  if (touch) sets.push("updated_at = datetime('now')")
  if (!sets.length) return 0
  return Number(db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...values, id).changes)
}

// App configuration stored as JSON under "config:<name>" in the settings table.
export function getConfig(db, name, fallback = {}) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`config:${name}`)
  if (!row) return fallback
  try { return JSON.parse(row.value) } catch { return fallback }
}

export function setConfig(db, name, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(`config:${name}`, JSON.stringify(value))
}
