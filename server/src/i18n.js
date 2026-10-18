import { getConfig, setConfig } from './db.js'
import en from './i18n-en.js'

// French is the source language: texts are written in French and used as keys.
// The language follows the UI choice (Settings / FR-EN switch), so changelogs,
// notifications, inbox titles and API errors match what the user reads.
const DICTS = { en }
export const LANGS = ['fr', 'en']
let current = 'fr'

export const getLocale = () => current

export function loadLocale(db) {
  current = normalize(getConfig(db, 'locale', {}).lang || process.env.APP_LANG)
}

export function saveLocale(db, lang) {
  current = normalize(lang)
  setConfig(db, 'locale', { lang: current })
  return current
}

function normalize(lang) {
  return LANGS.includes(lang) ? lang : 'fr'
}

export function tr(text, vars) {
  let out = (current !== 'fr' && DICTS[current]?.[text]) || text
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
  return out
}
