import en from './en.js'

// French is the source language: texts are written in French in the code and
// used as keys; other languages map them to their translation.
const DICTS = { en }
export const LANGS = { fr: 'Français', en: 'English' }

function initialLang() {
  try {
    const saved = localStorage.getItem('projectory:lang')
    if (saved && (saved === 'fr' || DICTS[saved])) return saved
  } catch { /* storage unavailable */ }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

let lang = initialLang()

export const getLang = () => lang

export function setLang(next) {
  lang = next
  try { localStorage.setItem('projectory:lang', next) } catch { /* ignore */ }
}

export const hasSavedLang = () => {
  try { return !!localStorage.getItem('projectory:lang') } catch { return false }
}

// t('Version {v} publiée', { v: '1.2.0' })
export function t(text, vars) {
  let out = (lang !== 'fr' && DICTS[lang]?.[text]) || text
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
  return out
}
